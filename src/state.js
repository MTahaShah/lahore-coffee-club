/* =====================================================================
   Lahore Coffee Club — state.js
   One in-memory store shared by every surface, with pub-sub.

   Usage:
     const { store } = LCC;
     const off = store.on("cafe:status", ({ cafeId }) => …);  // one event
     const off = store.subscribe((type, payload) => …);        // every event
     store.actions.setCafeStatus("kiln", "packed");
     store.select.cafe("kiln").status;

   Events: cafe:status, cafe:viewing, redeem, pass, member, plan, builder,
           gift, waitlist, partner, snapshot, tick (every 30s, for relative times)

   No storage. Café status, redemptions and the demo member’s plan/cups
   are handed to "transports" (store.addTransport); sync.js registers two:
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
    plan: { type: "fixed", tierId: "regular", allocation: null },
    builder: clone(seed.builderDraft),
    redemptions: clone(seed.redemptions),
    badges: clone(seed.badges),
    gifts: [],
    waitlist: [],
    partnerRequests: [],
  };

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

  /** Local events worth sharing, reduced to plain data. */
  function outgoing(type, payload) {
    if (type === "cafe:status") send(type, { cafeId: payload.cafeId, status: payload.status, at: payload.at });
    else if (type === "redeem") send(type, { entry: payload.entry });
    else if (type === "member" && payload.member?.id === state.memberId) {
      payload.member.syncAt = Date.now();
      send("member", { snapshot: memberSnapshot() });
    }
  }

  /** The demo member’s plan and cups. syncAt decides which copy is newer. */
  function memberSnapshot() {
    const m = state.members[state.memberId];
    return {
      at: m.syncAt || 0,
      plan: clone(state.plan),
      member: clone({
        planId: m.planId, cupsTotal: m.cupsTotal, cupsLeft: m.cupsLeft, renewsAt: m.renewsAt,
        cycleStartedAt: m.cycleStartedAt, payment: m.payment, visits: m.visits, cafesTried: m.cafesTried,
      }),
    };
  }

  /** Newest wins; equal stamps (both still on the seed) leave things alone. */
  function applyMemberSnapshot(snap) {
    const m = state.members[state.memberId];
    if (!snap || !snap.member || (snap.at || 0) <= (m.syncAt || 0)) return false;
    Object.assign(m, clone(snap.member));
    m.syncAt = snap.at;
    if (snap.plan) state.plan = clone(snap.plan);
    emit("plan", { plan: state.plan }, { remote: true });
    emit("member", { member: m }, { remote: true });
    return true;
  }

  /** What a café device sends to a device that just joined the room. */
  function roomSnapshot() {
    // BACKEND: this becomes reads of cafe_status, redemptions (today) and subscriptions
    const since = startOfToday();
    return {
      statuses: Object.fromEntries(state.cafeOrder.map((id) => [id, { status: state.cafes[id].status, at: state.cafes[id].statusUpdatedAt }])),
      // Seeded rows have the same ids on every device; only live ones need sending
      redemptions: state.redemptions.filter((r) => r.at >= since && r.live),
      member: memberSnapshot(),
    };
  }

  function applyRoomSnapshot(snap) {
    if (!snap) return;
    Object.entries(snap.statuses || {}).forEach(([cafeId, { status, at }]) => {
      const c = state.cafes[cafeId];
      if (c && (c.status !== status || c.statusUpdatedAt !== at)) applyStatus({ cafeId, status, at }, { remote: true });
    });
    // Cups and visits come with the member snapshot, so these rows only join the log
    (snap.redemptions || []).forEach((entry) => {
      if (!state.redemptions.some((r) => r.id === entry.id)) state.redemptions.push(entry);
    });
    applyMemberSnapshot(snap.member);
    emit("snapshot", {}, { remote: true });
  }

  /** Entry point for messages from another window or device. */
  function applyRemote(type, data) {
    if (!data) return;
    if (type === "cafe:status") applyStatus(data, { remote: true });
    else if (type === "redeem" && data.entry) commitRedemption(data.entry, { remote: true });
    else if (type === "member") applyMemberSnapshot(data.snapshot);
    else if (type === "snapshot") applyRoomSnapshot(data);
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

    /** Mumtaz’s activity, newest first. */
    activity(memberId = state.memberId) {
      return state.redemptions.filter((r) => r.memberId === memberId).sort((a, b) => b.at - a.at);
    },

    usedToday(memberId, cafeId) {
      const since = startOfToday();
      return state.redemptions
        .filter((r) => r.memberId === memberId && r.cafeId === cafeId && r.at >= since)
        .reduce((n, r) => n + r.credits, 0);
    },

    /** What the café dashboard shows for today and this month. */
    cafeSummary(cafeId = state.partnerCafeId) {
      const cafe = state.cafes[cafeId];
      const since = startOfToday();
      const today = state.redemptions.filter((r) => r.cafeId === cafeId && r.at >= since).sort((a, b) => b.at - a.at);
      // Paid per cup, so a two-cup drink counts twice.
      const cupsToday = today.reduce((n, r) => n + r.credits, 0);
      // Month to date: a typical day for each earlier day this month, plus today.
      const daysBefore = new Date().getDate() - 1;
      const monthCups = daysBefore * cafe.avgDailyCups + cupsToday;
      return {
        today,
        redemptionsToday: today.length,
        cupsToday,
        newCustomersToday: today.filter((r) => r.firstVisit).length,
        payoutPerCup: cafe.payoutPerCup,
        payoutToday: cupsToday * cafe.payoutPerCup,
        monthCups,
        payoutMonth: monthCups * cafe.payoutPerCup,
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

    /** Plan name for any member. Demo members carry no planId, so match by cups. */
    memberPlan(member) {
      if (member.planId === "custom") return { name: "Build your own", cups: member.cupsTotal };
      const tier = (member.planId && select.tier(member.planId)) || state.tiers.find((t) => t.cups === member.cupsTotal);
      return tier ? { name: tier.name, cups: tier.cups } : { name: "Build your own", cups: member.cupsTotal };
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
        plan: { type: "fixed", tierId } | { type: "custom", allocation } */
    quote(plan) {
      // BACKEND: POST /plans/quote { plan } -> { name, cups, price, savings }
      if (plan.type === "fixed") {
        const t = select.tier(plan.tierId);
        return { name: t.name, cups: t.cups, price: t.price, savings: select.tierSavings(t.id), meetsMinimum: true, cupsShort: 0 };
      }
      return { name: "Build your own", ...select.customPrice(plan.allocation || state.builder) };
    },

    /** Is this the plan the member is on now? */
    isCurrentPlan(plan) {
      const cur = state.plan;
      if (plan.type !== cur.type) return false;
      if (plan.type === "fixed") return plan.tierId === cur.tierId;
      const a = plan.allocation || state.builder, b = cur.allocation || {};
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      return [...keys].every((k) => (a[k] || 0) === (b[k] || 0));
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
  const MESSAGES = {
    "not-found": () => "That code didn’t match a member. Check the six digits and try again.",
    "expired": (m) => `That code has expired. Ask ${m.firstName} for the new one on the pass screen.`,
    "no-cups": (m) => `${m.firstName} has no cups left this month. They can top up in the app.`,
    "not-enough": (m, need) => `That drink uses ${need} cups and ${m.firstName} has ${m.cupsLeft} left. Try a one-cup drink.`,
    "daily-limit": (m, _n, limit) => `${m.firstName} has had ${limit} cups here today, the daily limit. It resets tomorrow.`,
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
    const member = found.member;
    const limit = state.rules.dailyLimitPerCafe;
    const usedToday = select.usedToday(member.id, cafeId);
    const base = { member, cupsLeft: member.cupsLeft, usedToday, dailyLimit: limit };
    if (member.cupsLeft <= 0) return { ...base, ok: false, reason: "no-cups", message: MESSAGES["no-cups"](member) };
    if (usedToday >= limit) return { ...base, ok: false, reason: "daily-limit", message: MESSAGES["daily-limit"](member, 0, limit) };
    if (member.cupsLeft < credits) return { ...base, ok: false, reason: "not-enough", message: MESSAGES["not-enough"](member, credits) };
    return { ...base, ok: true };
  }

  function commitRedemption(entry, { remote = false } = {}) {
    if (state.redemptions.some((r) => r.id === entry.id)) return; // idempotent across windows and transports
    const member = state.members[entry.memberId];
    if (!member) return;
    member.cupsLeft = Math.max(0, member.cupsLeft - entry.credits);
    member.syncAt = Math.max(member.syncAt || 0, entry.at); // a cup used counts as a change to the member
    member.visits = member.visits || {};
    member.visits[entry.cafeId] = (member.visits[entry.cafeId] || 0) + 1;
    if (member.cafesTried && !member.cafesTried.includes(entry.cafeId)) member.cafesTried.push(entry.cafeId);
    state.redemptions.push(entry);
    emit("redeem", { entry, member }, { remote });
  }

  /* -------------------------------------------------------------------
     Actions (the only things that write to state)
     ------------------------------------------------------------------- */
  function applyStatus({ cafeId, status, at }, opts) {
    const cafe = state.cafes[cafeId];
    if (!cafe || !STATUSES.includes(status)) return;
    cafe.status = status;
    cafe.statusUpdatedAt = at;
    emit("cafe:status", { cafeId, status, at }, opts);
  }

  const actions = {
    setCafeStatus(cafeId, status) {
      // BACKEND: PATCH /cafes/:cafeId/status { status }
      applyStatus({ cafeId, status, at: Date.now() });
    },

    /** Redeem by code (café view). Returns the lookup result plus the entry. */
    redeem({ code, cafeId = state.partnerCafeId, drinkId }) {
      const cafe = state.cafes[cafeId];
      const drink = select.drink(cafeId, drinkId) || cafe.drinks[0];
      const check = lookupCode(code, cafeId, drink.credits);
      if (!check.ok) return check;
      const member = check.member;
      // BACKEND: POST /redeem { code, cafeId, drinkId } -> { entry, member }
      const entry = {
        id: uid("r"),
        at: Date.now(),
        cafeId,
        memberId: member.id,
        drinkId: drink.id,
        credits: drink.credits,
        firstVisit: !(member.visits && member.visits[cafeId] > 0),
        live: true, // made in this session, not seeded
      };
      commitRedemption(entry);
      return { ...check, ok: true, entry, cupsLeft: member.cupsLeft };
    },

    /** Which café the partner view is showing (demo picker). */
    setPartnerCafe(cafeId) {
      if (!state.cafes[cafeId] || state.partnerCafeId === cafeId) return;
      state.partnerCafeId = cafeId;
      emit("cafe:viewing", { cafeId });
    },

    /** Switch plan now: cups start fresh and the month restarts today. */
    choosePlan(plan, { payment } = {}) {
      // plan: { type: "fixed", tierId } | { type: "custom", allocation }
      // BACKEND: POST /subscriptions { plan, paymentId }
      const member = select.member();
      const now = Date.now();
      member.cycleStartedAt = now;
      member.renewsAt = addMonths(now, 1);
      if (payment) member.payment = payment;
      if (plan.type === "fixed") {
        const tier = select.tier(plan.tierId);
        state.plan = { type: "fixed", tierId: tier.id, allocation: null };
        member.planId = tier.id;
        member.cupsTotal = tier.cups;
        member.cupsLeft = tier.cups;
      } else {
        const allocation = clone(plan.allocation || state.builder);
        const { cups } = select.customPrice(allocation);
        state.plan = { type: "custom", tierId: null, allocation };
        member.planId = "custom";
        member.cupsTotal = cups;
        member.cupsLeft = cups;
      }
      emit("plan", { plan: state.plan });
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

    sendGift({ toName, toPhone, cups, cafeId = null, message = "" }) {
      const member = select.member();
      const n = Math.max(1, Math.min(state.rules.giftMaxCups, cups | 0));
      if (member.cupsLeft < n) return { ok: false, message: `You have ${member.cupsLeft} cups left, so you can gift up to ${member.cupsLeft}.` };
      // BACKEND: POST /gifts
      const sentAt = Date.now();
      const gift = {
        id: uid("g"),
        fromId: member.id,
        toName, toPhone, cups: n, cafeId, message,
        sentAt,
        expiresAt: sentAt + state.rules.giftExpiryDays * 24 * 60 * MIN,
        link: `lahorecoffee.club/g/${Math.random().toString(36).slice(2, 8)}`,
      };
      member.cupsLeft -= n;
      state.gifts.push(gift);
      emit("gift", { gift });
      emit("member", { member });
      return { ok: true, gift };
    },

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
  };

  LCC.fmt = fmt;
  LCC.store = {
    on, subscribe, emit, select, actions, lookupCode, addMonths, statuses: STATUSES, getState: () => state,
    addTransport, applyRemote, roomSnapshot, memberSnapshot,
  };
})();
