/* =====================================================================
   Lahore Coffee Club — state.js
   One in-memory store shared by every surface, with pub-sub.

   Usage:
     const { store } = LCC;
     const off = store.on("cafe:status", ({ cafeId }) => …);  // one event
     const off = store.subscribe((type, payload) => …);        // every event
     store.actions.setCafeStatus("kiln", "packed");
     store.select.cafe("kiln").status;

   Events: cafe:status, cafe:viewing, ledger, redeem, pass, member, plan,
           builder, gift, rsvp, session, waitlist, partner, snapshot,
           tick (every 30s)

   Cups live in one append-only ledger (state.ledger). Balances are always
   derived from it by the selectors below, never stored. Plan types:
     explorer  one pool, any café, at most rules.explorerCapPerCafe a cycle
     mycafes   cups reserved per café, usable only there

   No storage. Café status, ledger entries and plan changes are handed to
   "transports" (store.addTransport); sync.js registers two:
   BroadcastChannel (same computer) and Supabase Realtime (other devices).
   Incoming messages come back through store.applyRemote(), which uses the
   same internals as local actions but never re-sends (no echo loops).
   ===================================================================== */
(function () {
  "use strict";
  const LCC = (window.LCC = window.LCC || {});
  const seed = LCC.data;
  if (!seed) throw new Error("state.js: data.js must load first");

  const clone = (v) => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
  const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  const MIN = 60 * 1000;
  const STATUSES = ["quiet", "moderate", "packed"];

  /* -------------------------------------------------------------------
     State
     ------------------------------------------------------------------- */
  const state = {
    rules: clone(seed.rules),
    tiers: clone(seed.tiers),
    areas: clone(seed.areas),
    cafeOrder: seed.cafes.map((c) => c.id),
    cafes: byId(clone(seed.cafes)),
    members: byId(clone(seed.members)),
    memberId: seed.memberId,
    partnerCafeId: seed.partnerCafeId,
    builder: clone(seed.builderDraft),
    ledger: clone(seed.ledger), // append-only; see appendEntries()
    club: clone(seed.club),
    rsvps: {},                   // gatheringId -> memberId -> { going, at }
    session: { saved: null },    // presenter: Mumtaz's place while a new member onboards
    drinkCategories: clone(seed.drinkCategories || []),
    gifts: [],
    waitlist: [],
    partnerRequests: [],
  };

  /* Partner settings per café (café view). Kiln & Bean's come from data.js;
     the others get sensible defaults. Every café starts on the Auto busy
     level and taking member cups.                                       */
  function defaultPartner(c) {
    return {
      staff: [{ id: `st_${c.id}_owner`, name: "Owner", role: "owner", pin: "0000" }],
      staffOnShift: `st_${c.id}_owner`,
      covers: { categories: ["espresso", "milk", "filter", "tea"], size: "regular", extrasPaid: true },
      limits: { cafePerDay: c.avgDailyCups * 5, perMemberPerDay: state.rules.dailyLimitPerCafe },
      account: { label: "bank account", last4: "0000" },
      payoutDay: 5,
      payouts: [],
    };
  }
  state.partner = Object.fromEntries(state.cafeOrder.map((id) => [id, { ...defaultPartner(state.cafes[id]), ...clone((seed.partner || {})[id] || {}) }]));
  state.cafeOrder.forEach((id) => { state.cafes[id].busyMode = "auto"; state.cafes[id].pausedUntil = 0; });

  /* -------------------------------------------------------------------
     Pub-sub
     ------------------------------------------------------------------- */
  const listeners = new Map(); // type -> Set<fn>

  function on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    return () => listeners.get(type).delete(fn);
  }
  const subscribe = (fn) => on("*", fn);

  function emit(type, payload = {}, { remote = false } = {}) {
    const call = (fn, ...args) => {
      try { fn(...args); } catch (err) { console.error(`[LCC] listener for “${type}” failed`, err); }
    };
    (listeners.get(type) || []).forEach((fn) => call(fn, payload, type));
    (listeners.get("*") || []).forEach((fn) => call(fn, type, payload));
    if (!remote) outgoing(type, payload);
  }

  /* -------------------------------------------------------------------
     Sync seam: what leaves this device, and how remote messages apply
     ------------------------------------------------------------------- */
  const transports = new Set(); // fn(type, data)
  function addTransport(fn) { transports.add(fn); return () => transports.delete(fn); }

  function send(type, data) {
    transports.forEach((fn) => { try { fn(type, data); } catch (err) { console.warn("[LCC] sync send failed", err); } });
  }

  /** Local events worth sharing, reduced to plain data. Cups travel only as ledger entries. */
  function outgoing(type, payload) {
    if (type === "cafe:status") send(type, { cafeId: payload.cafeId, status: payload.status, at: payload.at, mode: payload.mode });
    else if (type === "cafe:pause") send(type, { cafeId: payload.cafeId, until: payload.until, at: payload.at });
    else if (type === "ledger") send("ledger", { entries: payload.entries, plans: payload.plans || [] });
    else if (type === "rsvp") send("rsvp", { gatheringId: payload.gatheringId, memberId: payload.memberId, going: payload.going, at: payload.at });
  }

  /** A member's plan header: which plan, which cycle. Travels with purchase entries. */
  function planMeta(m) {
    const meta = { memberId: m.id, plan: clone(m.plan), cycle: m.cycle, cycleStartedAt: m.cycleStartedAt, renewsAt: m.renewsAt, payment: clone(m.payment || null), changedAt: m.planChangedAt || 0 };
    // A member who joined in this session: other devices need to know who they are
    if (m.live) meta.profile = { firstName: m.firstName, lastName: m.lastName, initials: m.initials, pronoun: m.pronoun, area: m.area, memberNo: m.memberNo, memberSince: m.memberSince };
    return meta;
  }
  /** Newest plan change wins; a seed plan (changedAt 0) never overwrites a live one. */
  function applyPlanMeta(meta) {
    if (meta?.profile && !state.members[meta.memberId]) addMember({ id: meta.memberId, ...meta.profile });
    const m = state.members[meta?.memberId];
    if (!m || (meta.changedAt || 0) <= (m.planChangedAt || 0)) return false;
    Object.assign(m, { plan: clone(meta.plan), cycle: meta.cycle, cycleStartedAt: meta.cycleStartedAt, renewsAt: meta.renewsAt, planChangedAt: meta.changedAt });
    if (meta.payment) m.payment = clone(meta.payment);
    return true;
  }

  /** What a device sends to one that just joined the room. Seeded entries
      have the same ids everywhere, so only this session's ones travel. */
  function roomSnapshot({ statuses = true } = {}) {
    // BACKEND: this becomes reads of cafe_status, the ledger (this cycle) and subscriptions
    return {
      statuses: statuses ? Object.fromEntries(state.cafeOrder.map((id) => [id, { status: state.cafes[id].status, at: state.cafes[id].statusUpdatedAt, mode: state.cafes[id].busyMode, pausedUntil: state.cafes[id].pausedUntil }])) : null,
      entries: state.ledger.filter((e) => e.live),
      plans: Object.values(state.members).filter((m) => m.planChangedAt).map(planMeta),
      rsvps: Object.entries(state.rsvps).flatMap(([gatheringId, by]) => Object.entries(by).map(([memberId, r]) => ({ gatheringId, memberId, ...r }))),
    };
  }
  const hasLiveData = () => state.ledger.some((e) => e.live) || Object.keys(state.rsvps).length > 0;

  function applyRoomSnapshot(snap) {
    if (!snap) return;
    Object.entries(snap.statuses || {}).forEach(([cafeId, { status, at, mode, pausedUntil }]) => {
      const c = state.cafes[cafeId];
      if (c && (c.status !== status || c.statusUpdatedAt !== at)) applyStatus({ cafeId, status, at, mode }, { remote: true });
      if (c && pausedUntil != null && pausedUntil !== c.pausedUntil) applyPause({ cafeId, until: pausedUntil, at: Date.now() }, { remote: true });
    });
    applyLedgerMessage(snap, { catchUp: true });
    (snap.rsvps || []).forEach((r) => applyRsvp(r, { remote: true }));
    emit("snapshot", {}, { remote: true });
  }

  function applyLedgerMessage({ entries = [], plans = [] }, { catchUp = false } = {}) {
    const changed = plans.filter(applyPlanMeta);
    appendEntries(entries, { remote: true, catchUp });
    changed.forEach((meta) => {
      const m = state.members[meta.memberId];
      emit("plan", { member: m, plan: m.plan }, { remote: true });
      emit("member", { member: m }, { remote: true });
    });
  }

  /** Entry point for messages from another window or device. */
  function applyRemote(type, data) {
    if (!data) return;
    if (type === "cafe:status") applyStatus(data, { remote: true });
    else if (type === "cafe:pause") applyPause(data, { remote: true });
    else if (type === "ledger") applyLedgerMessage(data);
    else if (type === "snapshot") applyRoomSnapshot(data);
    else if (type === "rsvp") applyRsvp(data, { remote: true });
  }

  /* -------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------- */
  const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const roundTo = (n, step) => Math.round(n / step) * step;
  /** Same day next month; clamps 31 Jan to 28/29 Feb. */
  function addMonths(ts, n) {
    const d = new Date(ts);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    return d.getTime();
  }

  // Small, stable hash so every open window derives the same pass code.
  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }

  /* -------------------------------------------------------------------
     Ledger: the only record of cups. Append-only; entries are never edited.
     ------------------------------------------------------------------- */
  const ledgerIds = new Set(state.ledger.map((e) => e.id));
  const byMember = new Map(); // memberId -> entries (an index, rebuilt from the ledger)
  state.ledger.forEach((e) => { if (!byMember.has(e.memberId)) byMember.set(e.memberId, []); byMember.get(e.memberId).push(e); });

  /** Add entries (idempotent by id, so a message that arrives twice counts once).
      catchUp: entries from a join snapshot. They update balances quietly,
      without "redeem" events (no success screens or toasts for old cups). */
  function appendEntries(entries, { remote = false, catchUp = false } = {}) {
    // BACKEND: INSERT INTO ledger … (one transaction per action)
    const added = [];
    entries.forEach((e) => {
      if (!e || ledgerIds.has(e.id) || !state.members[e.memberId]) return;
      ledgerIds.add(e.id);
      state.ledger.push(e);
      if (!byMember.has(e.memberId)) byMember.set(e.memberId, []);
      byMember.get(e.memberId).push(e);
      added.push(e);
      if (e.type === "redeem") {
        const m = state.members[e.memberId];
        m.visits = m.visits || {};
        m.visits[e.cafeId] = (m.visits[e.cafeId] || 0) + 1; // lifetime, for loyalty
        if (m.cafesTried && !m.cafesTried.includes(e.cafeId)) m.cafesTried.push(e.cafeId);
      }
    });
    if (!added.length) return added;
    emit("ledger", { entries: added, catchUp, plans: remote ? [] : added.filter((e) => e.type === "purchase").map((e) => e.memberId).filter((id, i, a) => a.indexOf(id) === i).map((id) => planMeta(state.members[id])) }, { remote });
    if (!catchUp) added.filter((e) => e.type === "redeem").forEach((entry) => emit("redeem", { entry, member: state.members[entry.memberId] }, { remote }));
    return added;
  }

  /** This cycle's entries for a member. */
  function cycleEntries(memberId) {
    const m = state.members[memberId];
    return m ? (byMember.get(memberId) || []).filter((e) => e.cycle === m.cycle) : [];
  }
  const sumCups = (list) => list.reduce((n, e) => n + e.cups, 0);
  const listNames = (ids) => {
    const names = ids.map((id) => state.cafes[id].name);
    return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  };

  /* -------------------------------------------------------------------
     Selectors (read-only views of state)
     ------------------------------------------------------------------- */
  const select = {
    state: () => state,
    member: (id = state.memberId) => state.members[id],
    cafe: (id) => state.cafes[id],
    cafes: () => state.cafeOrder.map((id) => state.cafes[id]),
    tier: (id) => state.tiers.find((t) => t.id === id),
    area: (id) => state.areas.find((a) => a.id === id),
    drink: (cafeId, drinkId) => (state.cafes[cafeId]?.drinks || []).find((d) => d.id === drinkId),
    partnerCafe: () => state.cafes[state.partnerCafeId],

    ledger: () => state.ledger,
    /** Every redemption, read from the ledger. */
    redemptions: () => state.ledger.filter((e) => e.type === "redeem"),

    /** A member's cups in and out, newest first: redemptions, gifts sent, free cups. */
    activity(memberId = state.memberId, types = ["redeem", "gift", "reward"]) {
      return (byMember.get(memberId) || []).filter((e) => types.includes(e.type)).sort((a, b) => b.at - a.at);
    },

    usedToday(memberId, cafeId) {
      const since = startOfToday();
      return (byMember.get(memberId) || [])
        .filter((e) => e.type === "redeem" && e.cafeId === cafeId && e.at >= since)
        .reduce((n, e) => n + e.credits, 0);
    },

    /** Cups a member has redeemed at a café this plan cycle. */
    usedHereThisCycle(memberId, cafeId) {
      return cycleEntries(memberId).filter((e) => e.type === "redeem" && e.cafeId === cafeId).reduce((n, e) => n + e.credits, 0);
    },

    /** Balances for this cycle, all derived from the ledger.
        total: cups bought; left: ledger sum; perCafe (My cafés): reserved/left/used;
        usedAt: cups redeemed at each café (both types).                     */
    balance(memberId = state.memberId) {
      // BACKEND: SELECT … FROM ledger WHERE member_id = :id AND cycle = :cycle
      const m = state.members[memberId];
      const type = m.plan ? m.plan.type : null;
      const es = cycleEntries(memberId);
      // Free cups (rewards) count towards the month, like bought ones
      const total = sumCups(es.filter((e) => e.type === "purchase" || e.type === "reward"));
      const left = sumCups(es);
      const usedAt = {};
      es.filter((e) => e.type === "redeem").forEach((e) => { usedAt[e.cafeId] = (usedAt[e.cafeId] || 0) + e.credits; });
      const perCafe = {};
      // My cafés: free cups aren't tied to a café; they sit in `bonus`, usable anywhere
      let bonus = 0;
      if (type === "mycafes") {
        es.forEach((e) => {
          if (!e.cafeId || e.bonus) { bonus += e.cups; return; }
          const b = (perCafe[e.cafeId] = perCafe[e.cafeId] || { reserved: 0, left: 0, used: 0 });
          if (e.type === "purchase") b.reserved += e.cups;
          b.left += e.cups;
          if (e.type === "redeem") b.used += e.credits;
        });
      }
      return { type, total, left, used: total - left, usedAt, perCafe, bonus: Math.max(0, bonus) };
    },

    /** Explorer: cups left in the shared pool. My cafés members have no pool (null). */
    poolBalance(memberId = state.memberId) {
      const m = state.members[memberId];
      return m.plan?.type === "explorer" ? sumCups(cycleEntries(memberId)) : null;
    },

    /** What a member can still use at one café this cycle, and how to say it. */
    cafeBalance(memberId, cafeId) {
      const m = state.members[memberId];
      const cap = state.rules.explorerCapPerCafe;
      if (!m.plan) return { type: null, reserved: 0, left: 0, of: 0, used: 0, cap, label: "No plan yet" };
      if (m.plan.type === "mycafes") {
        const bal = select.balance(memberId);
        const b = bal.perCafe[cafeId];
        const reserved = b?.reserved || 0;
        // Nothing reserved left here, but a free cup to spend: use that
        if ((!reserved || b.left <= 0) && bal.bonus > 0) return { type: "mycafes", reserved, left: bal.bonus, of: reserved, bonus: true, label: `${fmt.cups(bal.bonus)} free, any café` };
        if (!reserved) return { type: "mycafes", reserved: 0, left: 0, of: 0, label: "Not in their plan" };
        return { type: "mycafes", reserved: b.reserved, left: b.left, of: b.reserved, label: `${b.left} of ${b.reserved} reserved here` };
      }
      const used = select.usedHereThisCycle(memberId, cafeId);
      const pool = select.poolBalance(memberId);
      const left = Math.max(0, Math.min(cap - used, pool));
      return { type: "explorer", used, cap, left, of: cap, pool, label: `${Math.max(0, cap - used)} of ${cap} left here this month` };
    },

    /** Can this member redeem `credits` cups at this café now? Never mutates.
        Checks, in order: cups at all, plan rules here, daily limit, drink size. */
    canRedeemHere(memberId, cafeId, credits = 1) {
      const m = state.members[memberId];
      const bal = select.balance(memberId);
      const here = select.cafeBalance(memberId, cafeId);
      const usedToday = select.usedToday(memberId, cafeId);
      const P = state.partner[cafeId];
      const limit = P ? P.limits.perMemberPerDay : state.rules.dailyLimitPerCafe;
      const base = { member: m, left: bal.left, total: bal.total, here, usedToday, dailyLimit: limit };
      const no = (reason) => ({ ...base, ok: false, reason, message: MESSAGES[reason](m, { here, credits, limit, bal, cafeId }) });
      // The café paused member cups (busy rush): nothing redeems until it ends
      if (select.isPaused(cafeId)) return no("paused");
      if (bal.left <= 0 || !m.plan) return no("no-cups");
      if (here.type === "mycafes" && !here.reserved && !here.bonus) return no("not-reserved");
      if (here.type === "mycafes" && here.left <= 0) return no("reserved-used");
      if (here.type === "explorer" && here.used >= here.cap) return no("explorer-cap");
      if (usedToday >= limit) return no("daily-limit");
      // The café's own cap on member cups a day
      if (P && select.cafeCupsToday(cafeId) + credits > P.limits.cafePerDay) return no("cafe-cap");
      if (here.left < credits || usedToday + credits > limit) return no("not-enough");
      return { ...base, ok: true };
    },

    /** The café's month: today, this calendar month, and reserved cups. */
    cafeSummary(cafeId = state.partnerCafeId) {
      // BACKEND: the café's monthly statement: GET /cafes/:id/statement?month=… (ledger + subscriptions)
      const cafe = state.cafes[cafeId];
      const since = startOfToday();
      const monthStart = new Date(since); monthStart.setDate(1);
      const here = state.ledger.filter((e) => e.type === "redeem" && e.cafeId === cafeId);
      const today = here.filter((e) => e.at >= since).sort((a, b) => b.at - a.at);
      // Paid per cup, so a two-cup drink counts twice.
      const cupsToday = today.reduce((n, e) => n + e.credits, 0);
      const monthCups = here.filter((e) => e.at >= monthStart.getTime()).reduce((n, e) => n + e.credits, 0);
      // Reserved here: My cafés members' purchases for this café in their current cycle
      const reservers = Object.values(state.members).filter((m) => m.plan.type === "mycafes" && cycleEntries(m.id).some((e) => e.type === "purchase" && e.cafeId === cafeId));
      const reservedCups = reservers.reduce((n, m) => n + sumCups(cycleEntries(m.id).filter((e) => e.type === "purchase" && e.cafeId === cafeId)), 0);
      const reservedLeft = reservers.reduce((n, m) => n + Math.max(0, sumCups(cycleEntries(m.id).filter((e) => e.cafeId === cafeId))), 0);
      // Pending business decision: pay cafés a share of reserved cups that go unused (0 for now, not shown)
      const reservedPayout = Math.round(reservedLeft * cafe.payoutPerCup * state.rules.reservedPayoutShare);
      return {
        today,
        redemptionsToday: today.length,
        cupsToday,
        newCustomersToday: today.filter((e) => e.firstVisit).length,
        payoutPerCup: cafe.payoutPerCup,
        payoutToday: cupsToday * cafe.payoutPerCup,
        monthCups,
        payoutMonth: monthCups * cafe.payoutPerCup,
        reservedCups,
        reservedMembers: reservers.length,
        reservedLeft,
        reservedPayout,
      };
    },

    /** Build-your-own pricing. Spec §6. */
    customPrice(allocation = state.builder) {
      const { customDiscount, roundTo: step, minCupsTotal } = state.rules;
      let cups = 0;
      let counter = 0;
      Object.entries(allocation).forEach(([cafeId, n]) => {
        const cafe = state.cafes[cafeId];
        if (!cafe || !n) return;
        cups += n;
        counter += n * cafe.price;
      });
      const price = roundTo(counter * customDiscount, step);
      return {
        cups,
        price,
        counter,
        savings: Math.max(0, counter - price),
        meetsMinimum: cups >= minCupsTotal,
        cupsShort: Math.max(0, minCupsTotal - cups),
      };
    },

    /** Savings for a fixed tier vs. the average list price across cafés. */
    tierSavings(tierId) {
      const tier = select.tier(tierId);
      const avg = select.cafes().reduce((n, c) => n + c.price, 0) / state.cafeOrder.length;
      return Math.max(0, roundTo(tier.cups * avg - tier.price, state.rules.roundTo));
    },

    /** Current rotating pass for a member. */
    pass(memberId = state.memberId, at = Date.now()) {
      const period = state.rules.passRotateSeconds * 1000;
      const win = Math.floor(at / period);
      const code = String(fnv1a(`${memberId}:${win}`) % 1000000).padStart(6, "0");
      const expiresAt = (win + 1) * period;
      return {
        code,
        payload: `LCC1:${memberId}:${code}`, // what the QR encodes
        expiresAt,
        secondsLeft: Math.max(0, Math.ceil((expiresAt - at) / 1000)),
        period: state.rules.passRotateSeconds,
      };
    },

    /** Plan name and size for any member. */
    memberPlan(member) {
      const cups = select.balance(member.id).total;
      if (!member.plan) return { type: null, typeName: "No plan", name: "No plan yet", cups: 0 };
      if (member.plan.type === "mycafes") return { type: "mycafes", typeName: "My cafés", name: "My cafés", cups };
      return { type: "explorer", typeName: "Explorer", name: select.tier(member.plan.tierId).name, cups };
    },

    /** Open or closed right now, from the café’s hours. Handles closing after midnight. */
    openState(cafe, at = Date.now()) {
      const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };
      const open = toMin(cafe.hours.open);
      let close = toMin(cafe.hours.close);
      if (close <= open) close += 1440;
      const d = new Date(at);
      let nowMin = d.getHours() * 60 + d.getMinutes();
      if (nowMin < open && nowMin + 1440 < close) nowMin += 1440; // early hours, still open from yesterday
      const isOpen = nowMin >= open && nowMin < close;
      return {
        open: isOpen,
        label: isOpen ? `Open until ${fmt.clock(close)}` : `Closed, opens at ${fmt.clock(open)}`,
      };
    },

    /** Typical status at an hour, from busyByHour (8:00–23:00). Used by the map’s “Usually at 6 pm”. */
    usualStatus(cafe, hour = 18) {
      const v = cafe.busyByHour[hour - 8] ?? 0;
      return { level: v, status: v >= 0.7 ? "packed" : v >= 0.4 ? "moderate" : "quiet" };
    },

    /** Cafés tab: text search (name, area, drink) combined with filters.
        Every filter narrows the list (AND); area is a single choice.    */
    searchCafes({ query = "", areaId = null, openNow = false, quietNow = false } = {}, at = Date.now()) {
      // BACKEND: GET /cafes?q=:query&area=:areaId&open=1&status=quiet
      const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      const words = norm(query).split(/\s+/).filter(Boolean);
      return select.cafes().filter((c) => {
        if (areaId && c.area !== areaId) return false;
        if (openNow && !select.openState(c, at).open) return false;
        if (quietNow && c.status !== "quiet") return false;
        if (!words.length) return true;
        const hay = norm([c.name, select.area(c.area).name, ...c.drinks.map((d) => d.name)].join(" "));
        return words.every((w) => hay.includes(w));
      });
    },

    /** Price and cups for a plan the member might buy.
        plan: { type: "explorer", tierId } | { type: "mycafes", allocation } */
    quote(plan) {
      // BACKEND: POST /plans/quote { plan } -> { name, cups, price, savings }
      if (plan.type === "explorer") {
        const t = select.tier(plan.tierId);
        return { name: t.name, typeName: "Explorer", cups: t.cups, price: t.price, savings: select.tierSavings(t.id), meetsMinimum: true, cupsShort: 0 };
      }
      return { name: "My cafés", typeName: "My cafés", ...select.customPrice(plan.allocation || state.builder) };
    },

    /** Is this the plan the member is on now? */
    isCurrentPlan(plan, memberId = state.memberId) {
      const cur = state.members[memberId].plan;
      if (!cur || plan.type !== cur.type) return false;
      if (plan.type === "explorer") return plan.tierId === cur.tierId;
      const a = plan.allocation || state.builder, b = cur.allocation || {};
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      return [...keys].every((k) => (a[k] || 0) === (b[k] || 0));
    },

    /* ---------------- The club: all earned by use, read from the ledger ---------------- */

    /** Member card, status, passport, badges and perks for one member. Lifetime, not per cycle. */
    club(memberId = state.memberId) {
      // BACKEND: a view over the ledger (lifetime redeems per member), plus members.member_no
      const m = state.members[memberId];
      const C = state.club;
      const redeems = (byMember.get(memberId) || []).filter((e) => e.type === "redeem");
      const firstAt = {};
      let cups = 0, morning = 0;
      const byArea = {};
      redeems.forEach((e) => {
        cups += e.credits;
        if (new Date(e.at).getHours() < 9) morning += e.credits;
        const area = state.cafes[e.cafeId]?.area;
        if (area) byArea[area] = (byArea[area] || 0) + e.credits;
        if (!firstAt[e.cafeId] || e.at < firstAt[e.cafeId]) firstAt[e.cafeId] = e.at;
      });
      const allCafes = state.cafeOrder.length;
      const cafes = state.cafeOrder.filter((id) => firstAt[id]).length;
      const founding = m.memberNo != null && m.memberNo <= C.foundingLimit;
      const goalOf = (g) => (g === "all" ? allCafes : g);

      // Status levels. A café count above the number of partner cafés means
      // "every partner café" until there are enough (Connoisseur: 10 or all).
      const levels = C.levels.map((l) => {
        const need = Math.min(l.cafes, allCafes);
        const line = l.line || (need < l.cafes ? `${l.cups} cups, at every partner café.` : `${l.cups} cups, at ${need} different cafés.`);
        return { ...l, cafes: need, line };
      });
      // The highest level whose every threshold is met
      let li = 0;
      levels.forEach((l, i) => { if (cups >= l.cups && cafes >= l.cafes) li = i; });
      const level = levels[li];
      const nextDef = levels[li + 1] || null;
      const next = nextDef && {
        ...nextDef,
        needs: [
          { key: "cups", have: cups, goal: nextDef.cups, label: `${Math.min(cups, nextDef.cups)} of ${nextDef.cups} cups` },
          ...(nextDef.cafes ? [{ key: "cafes", have: cafes, goal: nextDef.cafes, label: `${Math.min(cafes, nextDef.cafes)} of ${nextDef.cafes} cafés` }] : []),
        ],
      };

      // Passport: a stamp per partner café, with the date of the first cup there
      const marks = C.passportRewards.map(goalOf);
      const nextReward = marks.find((n) => n > cafes) || null;
      const passport = {
        count: cafes,
        total: allCafes,
        stamps: state.cafeOrder.map((id) => ({ cafe: state.cafes[id], visited: !!firstAt[id], firstAt: firstAt[id] || null })),
        rewards: marks,
        nextReward,
      };

      const metric = (key) => {
        if (key === "cups") return cups;
        if (key === "cafes") return cafes;
        if (key === "morning") return morning;
        if (key === "founding") return founding ? 1 : 0;
        if (key.startsWith("area:")) return byArea[key.slice(5)] || 0;
        return 0;
      };
      const badges = C.badges.map((b) => {
        const goal = goalOf(b.goal);
        const have = metric(b.metric);
        return { ...b, goal, have: Math.min(have, goal), earned: have >= goal };
      });

      const rank = (id) => C.levels.findIndex((l) => l.id === id);
      const hasPerk = (p) => (p.for === "founding" ? founding : rank(level.id) >= rank(p.for));
      const perks = C.perks.map((p) => ({ ...p, cafe: state.cafes[p.cafeId], unlocked: hasPerk(p), audience: p.for === "founding" ? "Founding Members" : levels[rank(p.for)].plural }));

      return {
        member: m,
        levels,
        memberNo: m.memberNo,
        number: m.memberNo != null ? fmt.memberNo(m.memberNo) : null,
        founding,
        since: m.memberSince || m.cycleStartedAt,
        level,
        next,
        cups,
        morning,
        cafes,
        passport,
        badges,
        perks,
        // BACKEND: invite codes are issued per member and checked at sign-up
        inviteCode: `${(m.firstName || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8)}${m.memberNo ?? ""}`,
      };
    },

    /** Perks a member can claim at one café (café view greeting). */
    perksAt(memberId, cafeId) {
      return select.club(memberId).perks.filter((p) => p.cafeId === cafeId && p.unlocked);
    },

    /** Who an invite code belongs to, if anyone. */
    inviter(code) {
      const c = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!c) return null;
      return Object.values(state.members).find((m) => m.memberNo != null && !m.background && select.club(m.id).inviteCode === c) || null;
    },

    /** One gathering, as this member sees it: seats, RSVP state, priority window. */
    gathering(id, memberId = state.memberId, at = Date.now()) {
      // BACKEND: GET /gatherings/:id (seat count from the rsvps table)
      const g = state.club.gatherings.find((x) => x.id === id);
      if (!g) return null;
      const cafe = state.cafes[g.cafeId];
      const by = state.rsvps[id] || {};
      const live = Object.values(by).filter((r) => r.going).length;
      const taken = Math.min(g.seats, (g.taken || 0) + live);
      const past = g.at < at;
      const club = select.club(memberId);
      const priority = club.founding || club.level.id === "connoisseur";
      const opensAt = g.at - (g.priorityDays || 0) * 24 * 60 * MIN;
      const openToAll = at >= opensAt;
      const going = !!by[memberId]?.going;
      const left = g.seats - taken;
      return {
        ...g, cafe, area: state.areas.find((a) => a.id === cafe.area), past, taken, left, going, priority, opensAt, openToAll,
        canRsvp: !past && !going && left > 0 && (openToAll || priority),
      };
    },
    gatherings(at = Date.now()) {
      const all = state.club.gatherings.slice().sort((a, b) => a.at - b.at);
      return { next: all.find((g) => g.at >= at) || null, past: all.filter((g) => g.at < at).reverse() };
    },

    /* ---------------- Café partner view ---------------- */

    partner: (cafeId = state.partnerCafeId) => state.partner[cafeId],
    drinkCategories: () => state.drinkCategories,

    /** Member cups are paused at this café right now? */
    isPaused: (cafeId, at = Date.now()) => (state.cafes[cafeId]?.pausedUntil || 0) > at,

    /** Cups redeemed at a café today (two-cup drinks count twice). */
    cafeCupsToday(cafeId) {
      const since = startOfToday();
      return state.ledger.reduce((n, e) => (e.type === "redeem" && e.cafeId === cafeId && e.at >= since ? n + e.credits : n), 0);
    },

    /** Auto busy level: estimated from cups redeemed here in the last 30 min. */
    busyEstimate(cafeId, at = Date.now()) {
      const since = at - 30 * MIN;
      const cups = state.ledger.reduce((n, e) => (e.type === "redeem" && e.cafeId === cafeId && e.at >= since && e.at <= at ? n + e.credits : n), 0);
      return { cups, status: cups >= 5 ? "packed" : cups >= 2 ? "moderate" : "quiet" };
    },

    /** A short reference for one redemption, the same on every device. */
    redemptionRef: (entry) => `LCC-${1000 + (fnv1a(entry.id) % 9000)}`,

    /** What a member cup covers here, in one plain sentence. */
    coversLine(cafeId = state.partnerCafeId) {
      const c = state.partner[cafeId].covers;
      return `Any drink on your LCC list, ${c.size} size.${c.extrasPaid ? " Extras paid at the counter." : " Extras included."}`;
    },

    /** The café's day: counts, earnings, cups per hour, every redemption. */
    cafeDay(cafeId = state.partnerCafeId) {
      // BACKEND: GET /cafes/:id/day?date=today (ledger rows for this café)
      const cafe = state.cafes[cafeId];
      const since = startOfToday();
      const entries = state.ledger.filter((e) => e.type === "redeem" && e.cafeId === cafeId && e.at >= since).sort((a, b) => b.at - a.at);
      const cups = entries.reduce((n, e) => n + e.credits, 0);
      const fresh = new Set(entries.filter((e) => e.firstVisit).map((e) => e.memberId));
      const back = new Set(entries.filter((e) => !fresh.has(e.memberId)).map((e) => e.memberId));
      const byHour = Array.from({ length: 16 }, (_, i) => ({ hour: 8 + i, cups: 0 }));
      entries.forEach((e) => { const h = new Date(e.at).getHours(); if (h >= 8 && h <= 23) byHour[h - 8].cups += e.credits; });
      return { entries, cups, newMembers: fresh.size, returningMembers: back.size, earnings: cups * cafe.payoutPerCup, rate: cafe.payoutPerCup, byHour };
    },

    /** This month's payout so far, the next payout, and past payouts. */
    cafePayouts(cafeId = state.partnerCafeId, at = Date.now()) {
      // BACKEND: GET /cafes/:id/payouts (statement per calendar month)
      const cafe = state.cafes[cafeId];
      const P = state.partner[cafeId];
      const d = new Date(at); d.setHours(0, 0, 0, 0); d.setDate(1);
      const monthStart = d.getTime();
      const cups = state.ledger.reduce((n, e) => (e.type === "redeem" && e.cafeId === cafeId && e.at >= monthStart ? n + e.credits : n), 0);
      const next = new Date(monthStart); next.setMonth(next.getMonth() + 1); next.setDate(P.payoutDay);
      return {
        monthStart,
        cups,
        rate: cafe.payoutPerCup,
        price: cafe.price,
        share: Math.round((cafe.payoutPerCup / cafe.price) * 100),
        earned: cups * cafe.payoutPerCup,
        nextAt: next.getTime(),
        account: P.account,
        history: P.payouts.map((p) => ({ ...p, amount: p.cups * cafe.payoutPerCup })),
      };
    },

    loyalty(cafeId, memberId = state.memberId) {
      const goal = 5;
      const visits = state.members[memberId]?.visits?.[cafeId] || 0;
      return { visits: visits % goal, goal, freeCupsEarned: Math.floor(visits / goal) };
    },
  };

  /* -------------------------------------------------------------------
     Code lookup and redemption (café view)
     ------------------------------------------------------------------- */
  const reservedCafes = (m) => Object.entries(select.balance(m.id).perCafe).filter(([, b]) => b.reserved).map(([id]) => id);
  const MESSAGES = {
    "not-found": () => "That code didn’t match a member. Check the six digits and try again.",
    "expired": (m) => `That code has expired. Ask ${m.firstName} to refresh their pass and read you the new code.`,
    "paused": (m, { cafeId }) => `Member cups are paused here until ${fmt.time(state.cafes[cafeId].pausedUntil)}. ${m.firstName} can pay at the counter, or come back after.`,
    "cafe-cap": (m, { cafeId }) => `Today’s member cups here are used up (${state.partner[cafeId].limits.cafePerDay} a day). They start again tomorrow.`,
    "no-cups": (m) => `${m.firstName} has no cups left this month. They can top up in the app.`,
    "not-reserved": (m) => `${m.firstName}’s cups are reserved for ${listNames(reservedCafes(m))}.`,
    "reserved-used": (m, { here }) => {
      const others = reservedCafes(m).filter((id) => select.balance(m.id).perCafe[id].left > 0);
      return `${m.firstName} has used the ${fmt.cups(here.reserved)} reserved here this month.${others.length ? ` There are still cups for ${m.pronoun || "them"} at ${listNames(others)}.` : ""}`;
    },
    "explorer-cap": (m, { here }) => `${m.firstName} has had ${here.cap} cups here this month. Any other partner café will welcome ${m.pronoun || "them"}.`,
    "daily-limit": (m, { limit }) => `${m.firstName} has had ${fmt.cups(limit)} here today, the most a member can have in a day. It resets tomorrow.`,
    "not-enough": (m, { credits, here }) => `That drink uses ${credits} cups and ${m.firstName} can have ${fmt.cups(here.left)} here. Try a one-cup drink.`,
  };

  /** Returns { member, expired } or null. */
  function findMemberByCode(raw) {
    const code = String(raw || "").replace(/\D/g, "");
    if (code.length !== 6) return null;
    const now = Date.now();
    const period = state.rules.passRotateSeconds * 1000;
    const EXPIRED_LOOKBACK = 20; // windows (10 min) checked to tell “expired” from “wrong”
    for (const m of Object.values(state.members)) {
      if (m.staticCode === code) return { member: m, expired: false };
      if (m.staticCode || m.background) continue;
      // Accept the current and previous window, so a code read out at
      // 0:01 still works a moment later.
      if (select.pass(m.id, now).code === code || select.pass(m.id, now - period).code === code) return { member: m, expired: false };
      for (let i = 2; i <= EXPIRED_LOOKBACK; i++) {
        if (select.pass(m.id, now - i * period).code === code) return { member: m, expired: true };
      }
    }
    return null;
  }

  /** Check a code before redeeming. Never mutates. */
  function lookupCode(code, cafeId = state.partnerCafeId, credits = 1) {
    // BACKEND: GET /passes/:code?cafe=:cafeId
    const found = findMemberByCode(code);
    if (!found) return { ok: false, reason: "not-found", message: MESSAGES["not-found"]() };
    if (found.expired) return { ok: false, reason: "expired", member: found.member, message: MESSAGES.expired(found.member) };
    // BACKEND: balance reads come from the ledger table for this member and cycle
    return select.canRedeemHere(found.member.id, cafeId, credits);
  }

  /* -------------------------------------------------------------------
     Actions (the only things that write to state)
     ------------------------------------------------------------------- */
  function applyStatus({ cafeId, status, at, mode }, opts) {
    const cafe = state.cafes[cafeId];
    if (!cafe || !STATUSES.includes(status)) return;
    cafe.status = status;
    cafe.statusUpdatedAt = at;
    if (mode === "auto" || mode === "manual") cafe.busyMode = mode;
    emit("cafe:status", { cafeId, status, at, mode: cafe.busyMode }, opts);
  }

  function applyPause({ cafeId, until }, opts) {
    const cafe = state.cafes[cafeId];
    if (!cafe) return;
    cafe.pausedUntil = until || 0;
    emit("cafe:pause", { cafeId, until: cafe.pausedUntil, at: Date.now() }, opts);
  }

  /** A free cup when a new café stamp brings the passport to 5, and to every café.
      The id is fixed per member and milestone, so it can only ever be given once. */
  function grantPassportReward(member) {
    const { passport } = select.club(member.id);
    if (!passport.rewards.includes(passport.count)) return;
    const reason = passport.count === passport.total ? "passport-all" : `passport-${passport.count}`;
    // BACKEND: the reward is a ledger insert by the redeem endpoint, in the same transaction
    appendEntries([{ id: `rw_${member.id}_${reason}`, type: "reward", reason, memberId: member.id, cafeId: null, cups: 1, at: Date.now(), cycle: member.cycle, live: true }]);
  }

  function applyRsvp({ gatheringId, memberId, going, at }, opts) {
    if (!state.club.gatherings.some((g) => g.id === gatheringId) || !memberId) return;
    const by = (state.rsvps[gatheringId] = state.rsvps[gatheringId] || {});
    if (by[memberId] && by[memberId].at >= at) return; // newest answer wins
    by[memberId] = { going: !!going, at };
    emit("rsvp", { gatheringId, memberId, going: !!going, at }, opts);
  }

  function addMember(m) {
    const member = { pronoun: "them", visits: {}, cafesTried: [], plan: null, live: true, ...m };
    state.members[member.id] = member;
    if (member.memberNo > state.club.membersIssued) state.club.membersIssued = member.memberNo;
    return member;
  }

  const giftCode = () => Array.from({ length: 6 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");

  const actions = {
    setCafeStatus(cafeId, status) {
      // BACKEND: PATCH /cafes/:cafeId/status { status }
      applyStatus({ cafeId, status, at: Date.now(), mode: "manual" });
    },

    /** Busy level: "auto" (estimated from redemptions) or a fixed status. */
    setBusyMode(cafeId, mode) {
      const cafe = state.cafes[cafeId];
      if (!cafe) return;
      if (STATUSES.includes(mode)) return actions.setCafeStatus(cafeId, mode);
      cafe.busyMode = "auto";
      const est = select.busyEstimate(cafeId);
      // BACKEND: PATCH /cafes/:cafeId/status { mode: "auto" } (estimated server-side)
      applyStatus({ cafeId, status: est.status, at: cafe.status === est.status ? cafe.statusUpdatedAt : Date.now(), mode: "auto" });
    },

    /** Auto mode: re-estimate and publish only when the level changes. */
    refreshAutoBusy(cafeId) {
      const cafe = state.cafes[cafeId];
      if (!cafe || cafe.busyMode !== "auto") return;
      const est = select.busyEstimate(cafeId);
      if (est.status !== cafe.status) applyStatus({ cafeId, status: est.status, at: Date.now(), mode: "auto" });
    },

    /** Pause member cups for a while (a rush), or resume now (minutes 0). */
    pauseMemberCups(cafeId, minutes = 30) {
      // BACKEND: PATCH /cafes/:cafeId { paused_until }
      applyPause({ cafeId, until: minutes ? Date.now() + minutes * MIN : 0 });
    },

    /** Café settings: covers, limits, hours, staff on shift. */
    updatePartner(cafeId, patch) {
      // BACKEND: PATCH /cafes/:cafeId/settings
      const P = state.partner[cafeId];
      if (!P) return;
      if (patch.covers) Object.assign(P.covers, patch.covers);
      if (patch.limits) Object.assign(P.limits, patch.limits);
      if (patch.staffOnShift) P.staffOnShift = patch.staffOnShift;
      emit("partner:settings", { cafeId });
    },

    setCafeHours(cafeId, open, close) {
      // BACKEND: PATCH /cafes/:cafeId { hours }
      const cafe = state.cafes[cafeId];
      const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };
      cafe.hours = { open, close, label: `${fmt.clock(toMin(open))} – ${fmt.clock(toMin(close))}` };
      emit("partner:settings", { cafeId });
    },

    addStaff(cafeId, { name, role, pin }) {
      // BACKEND: POST /cafes/:cafeId/staff (PIN stored hashed)
      const P = state.partner[cafeId];
      if (P.staff.some((x) => x.pin === pin)) return { ok: false, message: "Another staff member already uses that PIN." };
      const member = { id: uid("st"), name: String(name).trim(), role, pin };
      P.staff.push(member);
      emit("partner:settings", { cafeId });
      return { ok: true, staff: member };
    },

    removeStaff(cafeId, staffId) {
      const P = state.partner[cafeId];
      if (P.staffOnShift === staffId || P.staff.length <= 1) return { ok: false };
      P.staff = P.staff.filter((x) => x.id !== staffId);
      emit("partner:settings", { cafeId });
      return { ok: true };
    },

    /** Staff sign in at the counter with their 4-digit PIN. */
    signInStaff(cafeId, pin) {
      const who = state.partner[cafeId].staff.find((x) => x.pin === String(pin));
      if (!who) return { ok: false };
      actions.updatePartner(cafeId, { staffOnShift: who.id });
      return { ok: true, staff: who };
    },

    /** Redeem by code (café view). Returns the lookup result plus the entry. */
    redeem({ code, cafeId = state.partnerCafeId, drinkId }) {
      const cafe = state.cafes[cafeId];
      const drink = select.drink(cafeId, drinkId) || cafe.drinks[0];
      const check = lookupCode(code, cafeId, drink.credits);
      if (!check.ok) return check;
      const member = check.member;
      // BACKEND: POST /redeem { code, cafeId, drinkId } -> inserts one ledger row, returns it
      const entry = {
        id: uid("l"),
        type: "redeem",
        memberId: member.id,
        cafeId,
        cups: -drink.credits,
        credits: drink.credits,
        drinkId: drink.id,
        firstVisit: !(member.visits && member.visits[cafeId] > 0),
        at: Date.now(),
        cycle: member.cycle,
        live: true, // made in this session, not seeded
      };
      if (check.here.bonus) entry.bonus = true; // a My cafés member spending a free cup
      const newStamp = !select.activity(member.id, ["redeem"]).some((e) => e.cafeId === cafeId);
      appendEntries([entry]);
      if (newStamp) grantPassportReward(member);
      return { ...check, ok: true, entry, left: select.balance(member.id).left, here: select.cafeBalance(member.id, cafeId) };
    },

    /** Which café the partner view is showing (demo picker). */
    setPartnerCafe(cafeId) {
      if (!state.cafes[cafeId] || state.partnerCafeId === cafeId) return;
      state.partnerCafeId = cafeId;
      emit("cafe:viewing", { cafeId });
    },

    /** Switch plan now: whatever is left expires, the new cups start fresh,
        and the month restarts today. Works in both directions.            */
    choosePlan(plan, { payment, memberId = state.memberId } = {}) {
      // plan: { type: "explorer", tierId } | { type: "mycafes", allocation }
      // BACKEND: POST /subscriptions { plan, paymentId } -> expire + purchase ledger rows
      const member = state.members[memberId];
      const now = Date.now();
      const entries = [];
      // Close the old cycle: one expire entry per bucket that still has cups
      const old = select.balance(member.id);
      if (old.type === "mycafes") {
        Object.entries(old.perCafe).forEach(([cafeId, b]) => { if (b.left > 0) entries.push({ id: uid("l"), type: "expire", memberId: member.id, cafeId, cups: -b.left, at: now, cycle: member.cycle, live: true }); });
        if (old.bonus > 0) entries.push({ id: uid("l"), type: "expire", memberId: member.id, cafeId: null, cups: -old.bonus, at: now, cycle: member.cycle, live: true });
      } else if (old.left > 0) {
        entries.push({ id: uid("l"), type: "expire", memberId: member.id, cafeId: null, cups: -old.left, at: now, cycle: member.cycle, live: true });
      }
      // New cycle
      const cycle = uid("c");
      member.plan = plan.type === "explorer"
        ? { type: "explorer", tierId: select.tier(plan.tierId).id }
        : { type: "mycafes", allocation: Object.fromEntries(Object.entries(clone(plan.allocation || state.builder)).filter(([, n]) => n > 0)) };
      member.cycle = cycle;
      member.cycleStartedAt = now;
      member.renewsAt = addMonths(now, 1);
      member.planChangedAt = now;
      if (payment) member.payment = payment;
      if (member.plan.type === "explorer") {
        entries.push({ id: uid("l"), type: "purchase", memberId: member.id, cafeId: null, cups: select.tier(member.plan.tierId).cups, at: now, cycle, live: true });
      } else {
        Object.entries(member.plan.allocation).forEach(([cafeId, n]) => entries.push({ id: uid("l"), type: "purchase", memberId: member.id, cafeId, cups: n, at: now, cycle, live: true }));
      }
      appendEntries(entries);
      emit("plan", { member, plan: member.plan });
      emit("member", { member });
    },

    /** Simulated payment, then the plan applies. Resolves { ok, message? }.
        A wallet number ending in 0000 fails, so the error path can be shown. */
    checkout({ plan, method, account = "" }) {
      const q = select.quote(plan);
      if (!q.meetsMinimum) return Promise.resolve({ ok: false, reason: "minimum", message: `Plans start at ${state.rules.minCupsTotal} cups.` });
      const digits = String(account).replace(/\D/g, "");
      // BACKEND: POST /payments { method, account, amount: q.price } -> wallet or card provider
      return new Promise((resolve) => {
        setTimeout(() => {
          if (method !== "card" && digits.endsWith("0000")) {
            resolve({ ok: false, reason: "declined", message: "The payment didn’t go through. Nothing was taken." });
            return;
          }
          const labels = { jazzcash: "JazzCash", easypaisa: "Easypaisa", card: "Card" };
          actions.choosePlan(plan, { payment: { method: labels[method] || method, last4: digits.slice(-4) } });
          resolve({ ok: true, quote: q, member: select.member() });
        }, 1600);
      });
    },

    setBuilderCups(cafeId, cups) {
      if (!state.cafes[cafeId]) return;
      const n = Math.max(0, Math.min(state.rules.maxCupsPerCafe, Math.round(cups)));
      if (n === 0) delete state.builder[cafeId];
      else state.builder[cafeId] = n;
      emit("builder", { cafeId, cups: n, price: select.customPrice() });
    },

    /** Replace the whole builder draft (e.g. start from the current plan). */
    setBuilder(allocation) {
      const max = state.rules.maxCupsPerCafe;
      state.builder = {};
      Object.entries(allocation || {}).forEach(([id, n]) => {
        const v = Math.max(0, Math.min(max, Math.round(n)));
        if (state.cafes[id] && v) state.builder[id] = v;
      });
      emit("builder", { price: select.customPrice() });
    },

    updateMember(patch) {
      // BACKEND: PATCH /me
      Object.assign(select.member(), patch);
      emit("member", { member: select.member() });
    },

    /** Gift cups to a friend. Explorer gifts come out of the pool and work at
        any café; My cafés gifts come out of one café's reserved cups and stay
        at that café. Writes one gift entry, so balances update everywhere. */
    sendGift({ toName, toPhone, cups, cafeId = null, message = "" }) {
      const member = select.member();
      const n = Math.max(1, Math.min(state.rules.giftMaxCups, cups | 0));
      const from = member.plan?.type === "mycafes" ? cafeId : null;
      if (member.plan?.type === "mycafes" && !state.cafes[from]) return { ok: false, message: "Choose which café’s cups to give." };
      const have = from ? (select.balance(member.id).perCafe[from]?.left || 0) : select.poolBalance(member.id) || 0;
      if (have < n) return { ok: false, message: `You have ${fmt.cups(have)} to give${from ? ` at ${state.cafes[from].name}` : ""}, so you can gift up to ${have}.` };
      const sentAt = Date.now();
      const code = giftCode();
      // BACKEND: POST /gifts { to_phone, cups, cafe_id, message } -> gift row with a unique code, expires_at
      const gift = {
        id: uid("g"),
        fromId: member.id,
        toName: String(toName).trim(), toPhone, cups: n, cafeId: from, message: String(message).trim().slice(0, state.rules.giftMessageMax),
        code,
        sentAt,
        expiresAt: sentAt + state.rules.giftExpiryDays * 24 * 60 * MIN,
      };
      // BACKEND: ledger insert (type gift) in the same transaction as the gift
      appendEntries([{ id: uid("l"), type: "gift", memberId: member.id, cafeId: from, cups: -n, at: sentAt, cycle: member.cycle, live: true, giftCode: code, toName: gift.toName }]);
      state.gifts.push(gift);
      emit("gift", { gift });
      emit("member", { member });
      return { ok: true, gift };
    },

    rsvp(gatheringId, going = true) {
      // BACKEND: POST /gatherings/:id/rsvps { going } (seats and priority checked server-side)
      const g = select.gathering(gatheringId);
      if (!g) return { ok: false };
      if (going && !g.canRsvp) return { ok: false, message: g.left <= 0 ? "Every seat is taken." : "RSVPs aren’t open to you yet." };
      applyRsvp({ gatheringId, memberId: state.memberId, going, at: Date.now() });
      return { ok: true, gathering: select.gathering(gatheringId) };
    },

    /** Presenter: start a brand-new member, keeping Mumtaz exactly as she is. */
    beginNewMember({ firstName, lastName = "", phone, area }) {
      // BACKEND: POST /members -> the next member number from a sequence (never reused)
      if (!state.session.saved) state.session.saved = { memberId: state.memberId, builder: clone(state.builder) };
      const now = Date.now();
      const member = addMember({
        id: uid("m"),
        firstName, lastName, phone, area,
        initials: `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase(),
        memberNo: state.club.membersIssued + 1,
        memberSince: now,
        cycle: uid("c"), cycleStartedAt: now, renewsAt: addMonths(now, 1),
      });
      state.memberId = member.id;
      emit("session", { memberId: member.id });
      emit("member", { member });
      return member;
    },

    /** Edit the new member's details before they pay (they went back a step). */
    updateNewMember(memberId, { firstName, lastName = "", phone, area }) {
      const m = state.members[memberId];
      if (!m || !m.live) return;
      Object.assign(m, { firstName, lastName, phone, area, initials: `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase() });
      emit("member", { member: m });
    },

    /** Invite reward: a free cup each for the new member and whoever invited them. */
    claimInvite(code) {
      const member = select.member();
      const inviter = select.inviter(code);
      if (!inviter || inviter.id === member.id || !member.plan) return { ok: false };
      // BACKEND: POST /invites/claim { code } -> two reward rows, once per new member
      const at = Date.now();
      const n = state.club.inviteReward;
      appendEntries([
        { id: `rw_${member.id}_invited`, type: "reward", reason: "invited", memberId: member.id, cafeId: null, cups: n, at, cycle: member.cycle, live: true, inviterId: inviter.id },
        { id: `rw_${inviter.id}_invite_${member.id}`, type: "reward", reason: "invite", memberId: inviter.id, cafeId: null, cups: n, at, cycle: inviter.cycle, live: true, friendName: member.firstName },
      ]);
      return { ok: true, inviter };
    },

    /** Presenter: back to Mumtaz, exactly as she was. */
    restoreDemo() {
      const saved = state.session.saved;
      state.session.saved = null;
      if (saved) { state.memberId = saved.memberId; state.builder = saved.builder; }
      else state.memberId = seed.memberId;
      emit("session", { memberId: state.memberId });
      emit("builder", { price: select.customPrice() });
      emit("member", { member: select.member() });
    },
    isPresenterSession: () => !!state.session.saved,

    joinWaitlist(entry) {
      // BACKEND: POST /waitlist
      const record = { id: uid("w"), at: Date.now(), ...entry };
      state.waitlist.push(record);
      console.log("[LCC] waitlist", record, `(${state.waitlist.length} total)`);
      emit("waitlist", { entry: record });
      return record;
    },

    requestPartnerCall(entry) {
      // BACKEND: POST /partners/requests
      const record = { id: uid("p"), at: Date.now(), ...entry };
      state.partnerRequests.push(record);
      console.log("[LCC] partner request", record);
      emit("partner", { entry: record });
      return record;
    },
  };

  /* -------------------------------------------------------------------
     Clocks: relative-time tick and pass rotation
     ------------------------------------------------------------------- */
  setInterval(() => emit("tick", { at: Date.now() }), 30 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") emit("tick", { at: Date.now() });
  });

  (function schedulePassRotation() {
    const { expiresAt } = select.pass();
    setTimeout(() => {
      emit("pass", select.pass());
      schedulePassRotation();
    }, Math.max(50, expiresAt - Date.now() + 20));
  })();

  /* -------------------------------------------------------------------
     Formatting (shared copy rules: sentence case, typographic marks)
     ------------------------------------------------------------------- */
  const NBSP = " ";
  const intNum = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const fmt = {
    rs: (n) => `Rs${NBSP}${intNum.format(Math.round(n))}`,
    num: (n) => intNum.format(n),
    cups: (n) => `${n} ${n === 1 ? "cup" : "cups"}`,
    statusLabel: (s) => ({ quiet: "Quiet", moderate: "Moderate", packed: "Packed" }[s] || s),
    ago(ts, now = Date.now()) {
      const m = Math.floor((now - ts) / MIN);
      if (m < 1) return "just now";
      if (m < 60) return `${m}${NBSP}min ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}${NBSP}hr ago`;
      const d = Math.floor(h / 24);
      return d === 1 ? "yesterday" : `${d} days ago`;
    },
    updated: (ts) => `updated ${fmt.ago(ts)}`,
    time: (ts) =>
      new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s?([AP])M/, (_, x) => `${NBSP}${x.toLowerCase()}m`),
    date: (ts) => new Date(ts).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }),
    shortDate: (ts) => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    /** Minutes after midnight -> “11 pm”, “7:30 am”, “midnight”. Wraps past 24h. */
    clock(mins) {
      const m = ((mins % 1440) + 1440) % 1440;
      if (m === 0) return "midnight";
      if (m === 720) return "noon";
      const h = Math.floor(m / 60), mm = m % 60;
      const h12 = h % 12 || 12;
      return `${h12}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${NBSP}${h < 12 ? "am" : "pm"}`;
    },
    countdown: (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`,
    memberNo: (n) => `No.${NBSP}${String(n).padStart(4, "0")}`,
    monthYear: (ts) => new Date(ts).toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    longDate: (ts) => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "long" }),
  };

  LCC.fmt = fmt;
  LCC.store = {
    on, subscribe, emit, select, actions, lookupCode, addMonths, statuses: STATUSES, getState: () => state,
    addTransport, applyRemote, roomSnapshot, hasLiveData,
  };
})();
