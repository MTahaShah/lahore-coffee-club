/* =====================================================================
   The Round — app-circles.js
   Circles: small private groups (up to 12), in their own tab.

     #/app/circles      the Circles tab: Your circles (one card each: area,
                        members, today's round or when they last met, an
                        inline "I'll be there"), From the club (the next
                        club event; See all in a sheet), Recent activity
                        (collapsed; the 5 latest, See all in a sheet)
     #/app/circles/:id  the Circle: the large ring, members, rounds,
                        this month (cafés explored, the streak), activity
     #/app/circles/:id/join  the invitation link ("Add them to your circle")
   Old #/app/circle/... links redirect here (app.js).

   The mark is the brick ring (ui.brickRing): one brick per member slot,
   joined members filled, empty slots outlined. The logo isn't redrawn.

   Privacy: members see each other's café and time, after the fact, never
   a location. Each member chooses in the drawer whether to share at all
   and whether to hide the branch (store.select.privacy).
   ===================================================================== */
(function () {
  "use strict";
  const LCC = window.LCC;
  const { store, fmt, ui } = LCC;
  const { html, raw, $, icon } = ui;
  const S = store.select;
  const A = store.actions;
  const REG = (LCC.appScreens = LCC.appScreens || {});
  const max = () => S.circleRules().maxMembers;
  const LIVE = () => (LCC.sync ? LCC.sync.liveUrl : `${location.href.split("#")[0]}`);
  const joinUrl = (c) => `${LIVE()}${LCC.sync ? LCC.sync.withRoom(`#/app/circles/${c.id}/join`) : `#/app/circles/${c.id}/join`}`;
  const shareText = (c) => `Join ${c.name}, my Circle on The Round. We see where each other has had coffee, and call rounds together: ${joinUrl(c)}`;
  const waHref = (c) => `https://wa.me/?text=${encodeURIComponent(shareText(c))}`;
  const count = (c) => Object.keys(c.members).length;

  /** The mark: one brick per member slot. */
  function ringHtml(c, { large = false } = {}) {
    const n = count(c);
    const svg = large
      ? ui.brickRing({ total: max(), filled: n, size: 200, radius: 82, length: 24, twist: 14 })
      : ui.brickRing({ total: max(), filled: n, size: 48, radius: 18, length: 9, twist: 14 });
    return html`<span class="circle-ring${large ? " circle-ring--lg" : ""}" role="img" aria-label="${n} of ${max()} members">
      ${svg}
      ${large ? html`<span class="circle-ring__center" aria-hidden="true"><span class="circle-ring__n num">${n}</span><span class="t-micro t-faint num">of ${max()}</span></span>` : ""}
    </span>`;
  }

  /* -------------------------------------------------------------------
     Shared by the tab and a Circle: a round, an activity row
     ------------------------------------------------------------------- */
  const meId = () => S.member().id;
  const nameOf = (m) => (m.id === meId() ? "You" : m.firstName);

  function roundHtml(r, { circleName = "" } = {}) {
    const caller = S.member(r.callerId);
    const place = S.pickupPlace(r.cafeId);
    const ans = Object.entries(r.answers || {}).map(([id, a]) => ({ m: S.member(id), going: a.going })).filter((x) => x.m);
    const coming = ans.filter((x) => x.going).map((x) => nameOf(x.m));
    const notThis = ans.filter((x) => !x.going).map((x) => nameOf(x.m));
    const mine = r.answers?.[meId()];
    const today = new Date(r.at).toDateString() === new Date().toDateString();
    const when = `${today ? "" : `${fmt.date(r.at)}, `}${fmt.time(r.at)}`;
    const table = r.groupId ? S.group(r.groupId) : null;
    const beans = S.beans().rules.roundAttend;
    return html`<article class="round card" aria-label="Round at ${place}">
      ${circleName ? html`<p class="eyebrow">${circleName}</p>` : ""}
      <p class="t-body">${caller ? (caller.id === meId() ? "You" : caller.firstName) : "A member"} called a round: <strong>${place}</strong> at <span class="num">${when}</span>.</p>
      <p class="t-small t-muted">${coming.length ? `Coming: ${coming.join(", ")}` : "No one yet"}${notThis.length ? ` · Not this time: ${notThis.join(", ")}` : ""}</p>
      <div class="round__answers" role="group" aria-label="Will you be there?">
        <button type="button" class="btn btn--compact ${mine?.going ? "btn--primary" : "btn--secondary"}" data-round-answer="${r.id}" data-going="1" aria-pressed="${!!mine?.going}">I’ll be there</button>
        <button type="button" class="btn btn--compact ${mine && !mine.going ? "btn--primary" : "btn--secondary"}" data-round-answer="${r.id}" data-going="0" aria-pressed="${!!mine && !mine.going}">Not this time</button>
      </div>
      ${mine?.going
        ? table && table.status !== "cancelled"
          ? html`<a class="btn btn--quiet" href="#/app/group/${table.id}">${table.status === "open" ? "Add your drink to the table" : "See the table"}</a>`
          : html`<button type="button" class="btn btn--secondary btn--block" data-round-table="${r.id}">Order together</button>
              <p class="t-micro t-faint">Starts a table at ${place} for ${fmt.time(r.at)}. Everyone coming adds their own drink.</p>`
        : ""}
      <p class="t-micro t-faint num">+${beans} Beans for everyone who comes.</p>
    </article>`;
  }

  /* Activity: grouped by day (Today, Yesterday, This week, Earlier); one
     sentence per row ("Hira had an Iced Matcha"), place and time below,
     cheers on the right (44px target, filled in --accent once cheered). */
  const article = (w) => (/^[aeiou]/i.test(w) ? "an" : "a");
  function activityParts(r) {
    const who = nameOf(r.member);
    if (r.kind === "stamp") return { sentence: `${who} got ${article(r.cafeName)} ${r.cafeName} stamp`, thing: `${r.cafeName} stamp`, where: "Passport" };
    if (r.kind === "badge") return { sentence: `${who} earned the ${r.badgeName} badge`, thing: `${r.badgeName} badge`, where: "Club badge" };
    return { sentence: `${who} had ${article(r.drink)} ${r.drink}`, thing: r.drink, where: r.place || "" };
  }
  function cheerHtml(r) {
    const p = activityParts(r);
    const whose = r.own ? "your" : `${r.member.firstName}’s`;
    const n = r.acks ? `, ${r.acks} ${r.acks === 1 ? "cheer" : "cheers"}` : "";
    const label = r.own ? `Cheers on your ${p.thing}${n || ", none yet"}` : `Cheer ${whose} ${p.thing}${n}`;
    return html`<button type="button" class="ack" data-ack="${r.key}" aria-pressed="${r.acked}" ${r.own ? raw("disabled") : ""} aria-label="${label}">
      ${ui.cupIcon(r.acked ? "packed" : "quiet", { size: 20, cls: "ack__icon" })}<span class="ack__n num" aria-hidden="true">${r.acks || (r.own ? "0" : "Cheer")}</span>
    </button>`;
  }
  function activityListHtml(rows) {
    const mine = S.privacy(meId());
    return html`${!mine.share ? html`<p class="t-small t-muted">You’re not sharing your coffee with your Circles. Change it in Profile, Privacy.</p>` : ""}
      ${rows.length ? html`<div class="circle-act">${ui.dayGroups(rows, (r) => {
        const p = activityParts(r);
        return ui.activityRow({
          who: r.member, sentence: p.sentence,
          line: html`${p.where}${p.where ? " · " : ""}<span data-rel-time="${r.at}">${fmt.ago(r.at)}</span>`,
          trail: cheerHtml(r),
        });
      })}</div>` : html`<p class="t-small t-muted">Nothing this week yet.</p>`}`;
  }

  /** Round answers, "Order together" and acknowledgements: the same on the tab and a Circle. Returns true when handled. */
  function sharedClick(e, ctx, { repaintRounds, repaintActivity, view }) {
    const t = e.target;
    const ans = t.closest("[data-round-answer]");
    if (ans) {
      const going = ans.dataset.going === "1";
      A.answerRound(ans.dataset.roundAnswer, going);
      ctx.toast(going ? "You’re coming. The others can see it." : "Noted. Maybe next time.", { iconName: going ? "calendar" : "check" });
      repaintRounds();
      $(`[data-round-answer="${ans.dataset.roundAnswer}"][data-going="${ans.dataset.going}"]`, view)?.focus();
      return true;
    }
    const rt = t.closest("[data-round-table]");
    if (rt) {
      const r = store.getState().rounds[rt.dataset.roundTable];
      const res = LCC.appOrder.startTable({ cafeId: r.cafeId, pickupAt: r.at });
      if (!res.ok) { ctx.toast(res.message, { iconName: "info" }); return true; }
      A.setRoundTable(r.id, res.group.id);
      ctx.go(`#/app/group/${res.group.id}`);
      return true;
    }
    const ack = t.closest("[data-ack]");
    if (ack) {
      A.acknowledge(ack.dataset.ack);
      repaintActivity();
      $(`[data-ack="${ack.dataset.ack}"]`, view)?.focus();
      return true;
    }
    return false;
  }

  /* -------------------------------------------------------------------
     Your Circles (the tab's list and Start a Circle)
     ------------------------------------------------------------------- */
  const form = { open: false, name: "", error: "" };
  function sectionHtml() {
    const list = S.circlesOf();
    return html`
      ${list.length ? html`<ul role="list" class="circle-list">${list.map(circleCardHtml)}</ul>` : html`<p class="t-body circles-empty">Coffee is better in company. Start a Circle, or ask a friend to add you to theirs.</p>`}
      ${form.open
        ? html`<form class="stack circle-start" style="--stack-gap:var(--space-3)" data-circle-form novalidate>
            <div class="field" data-invalid="${!!form.error}">
              <label class="field__label" for="circle-name">Name your Circle</label>
              <input class="input" id="circle-name" name="circlename" value="${form.name}" maxlength="40" placeholder="The Gulberg Circle" autocomplete="off" aria-describedby="circle-name-err">
              <p class="field__error" id="circle-name-err">${form.error}</p>
            </div>
            <button type="submit" class="btn btn--primary btn--block">Start the Circle</button>
            <button type="button" class="btn btn--quiet" data-circle-cancel>Not now</button>
          </form>`
        : html`<button type="button" class="btn btn--secondary btn--block" data-circle-start>Start a Circle</button>`}`;
  }

  /** A Circle's one line: today's round, else when they last met. */
  function circleLine(c) {
    const r = S.roundsOf(c.id);
    const today = r.upcoming.find((x) => sameDay(x.at));
    if (today) return { round: today, text: `Today ${fmt.time(today.at)}, ${S.pickupPlace(today.cafeId)}` };
    const last = r.past[0];
    if (!last) return { text: "No rounds yet" };
    const day = Date.now() - last.at < 6 * 24 * 60 * 60 * 1000
      ? new Date(last.at).toLocaleDateString("en-GB", { weekday: "short" })
      : fmt.shortDate(last.at);
    return { text: `Last met ${day}, ${S.pickupPlace(last.cafeId)}` };
  }
  function circleCardHtml(c) {
    const area = S.circleArea(c);
    const n = count(c);
    const line = circleLine(c);
    const mine = line.round?.answers?.[meId()];
    const act = !line.round ? ""
      : !mine ? html`<button type="button" class="btn btn--quiet circle-card__go" data-round-answer="${line.round.id}" data-going="1">I’ll be there</button>`
      : mine.going ? html`<p class="t-small circle-card__going">You’re going</p>` : "";
    return html`<li class="card circle-card">
      ${ringHtml(c)}
      <div class="circle-card__main">
        <a class="circle-card__name" href="#/app/circles/${c.id}">${c.name}</a>
        <p class="t-small t-muted num">${area ? `${area.name} · ` : ""}${n} ${n === 1 ? "member" : "members"}</p>
        <p class="t-small num circle-card__next">${line.text}</p>
        ${act}
      </div>
      <span class="circle-card__chev" aria-hidden="true">${icon("chevronRight", { size: 20 })}</span>
    </li>`;
  }

  /** Wires the list and its form; returns a cleanup. */
  function bindSection(root, ctx) {
    const box = () => $("[data-circles-list]", root);
    const paint = () => { const b = box(); if (b) b.innerHTML = sectionHtml().s; };
    const onClick = (e) => {
      if (e.target.closest("[data-circle-start]")) { form.open = true; form.error = ""; paint(); return $("#circle-name", root)?.focus(); }
      if (e.target.closest("[data-circle-cancel]")) { form.open = false; paint(); return $("[data-circle-start]", root)?.focus(); }
    };
    const onInput = (e) => { if (e.target.name === "circlename") form.name = e.target.value; };
    const onSubmit = (e) => {
      if (!e.target.matches("[data-circle-form]")) return;
      e.preventDefault();
      const res = A.createCircle(form.name);
      if (!res.ok) { form.error = res.message; paint(); return $("#circle-name", root)?.focus(); }
      form.open = false; form.name = ""; form.error = "";
      ctx.go(`#/app/circles/${res.circle.id}`);
    };
    root.addEventListener("click", onClick);
    root.addEventListener("input", onInput);
    root.addEventListener("submit", onSubmit);
    const offs = ["circle", "privacy", "ledger", "pickup"].map((t) => store.on(t, () => { if (!box()?.contains(document.activeElement)) paint(); }));
    return () => {
      root.removeEventListener("click", onClick);
      root.removeEventListener("input", onInput);
      root.removeEventListener("submit", onSubmit);
      offs.forEach((off) => off());
    };
  }
  LCC.appCircles = { sectionHtml, bindSection, ringHtml };

  /* -------------------------------------------------------------------
     #/app/circles  (the tab)
     ------------------------------------------------------------------- */
  const sameDay = (a, b = Date.now()) => new Date(a).toDateString() === new Date(b).toDateString();

  /** Events the club runs itself, soonest first: gatherings and the Beans members' evening. */
  function clubEvents() {
    const now = Date.now();
    return store.getState().club.gatherings.filter((g) => g.at >= now).sort((a, b) => a.at - b.at).map((g) => S.gathering(g.id)).filter(Boolean);
  }
  const eveningBeans = () => S.beans().rules.rewards.find((r) => r.id === "evening")?.beans || 600;

  /** One compact row per event, for the See all sheet. */
  function eventRowHtml(g) {
    const status = g.going ? "You’re going" : g.inviteOnly ? `${eveningBeans()} Beans for a seat` : g.left <= 0 ? "Full" : `${g.left} of ${g.seats} seats left`;
    return html`<li class="event-row">
      <p class="t-body">${g.kind}: ${g.title.charAt(0).toLowerCase() + g.title.slice(1)}</p>
      <p class="t-small t-muted num">${fmt.date(g.at)} · ${fmt.time(g.at)} · ${g.cafe.name}</p>
      <p class="t-small num">${status}</p>
    </li>`;
  }

  function gatheringItemHtml(g) {
    const answer = store.getState().rsvps[g.id]?.[meId()];
    const notThis = !!answer && !answer.going;
    const title = `${g.kind}: ${g.title.charAt(0).toLowerCase() + g.title.slice(1)}`;
    let note = "";
    if (g.inviteOnly) note = g.going ? "Your seat is kept with Beans." : `Keep a seat with ${eveningBeans()} Beans, in Club.`;
    else if (g.going) note = `You’re going. See you at ${g.cafe.name}.`;
    else if (g.left <= 0) note = "Every seat is taken. The next one is announced here first.";
    else if (!g.canRsvp) note = `RSVP opens ${fmt.longDate(g.opensAt)}. Founding Members and Connoisseurs book first.`;
    else if (g.priority && !g.openToAll) note = `Founding Members and Connoisseurs book first. Opens to every member on ${fmt.longDate(g.opensAt)}.`;
    return html`<article class="round card gather-item" aria-label="${title}, hosted by The Round">
      <p class="t-micro t-faint">Hosted by The Round</p>
      <p class="t-body"><strong>${title}</strong></p>
      <p class="t-small t-muted num">${fmt.date(g.at)} · ${fmt.time(g.at)} · ${title.includes(g.cafe.name) ? g.area.name : `${g.cafe.name}, ${g.area.name}`}${g.inviteOnly ? "" : ` · ${g.left} of ${g.seats} seats left`}</p>
      ${g.inviteOnly ? "" : html`<div class="round__answers" role="group" aria-label="Will you be there?">
        <button type="button" class="btn btn--compact ${g.going ? "btn--primary" : "btn--secondary"}" data-gather-answer="${g.id}" data-going="1" aria-pressed="${g.going}" ${!g.going && !g.canRsvp ? raw("disabled") : ""}>I’ll be there</button>
        <button type="button" class="btn btn--compact ${notThis ? "btn--primary" : "btn--secondary"}" data-gather-answer="${g.id}" data-going="0" aria-pressed="${notThis}">Not this time</button>
      </div>`}
      ${note ? html`<p class="t-micro t-faint">${note}</p>` : ""}
    </article>`;
  }

  let recentOpen = false; // Recent activity: collapsed by default, remembered while the app is open

  REG.circles = (ctx) => {
    const { view, el } = ctx;
    const circles = () => S.circlesOf();
    let eventsSheet = null, activitySheet = null;

    function recentRows() {
      const seen = new Set();
      return circles().flatMap((c) => S.circleActivity(c)).filter((r) => (seen.has(r.key) ? false : seen.add(r.key))).sort((a, b) => b.at - a.at);
    }
    function clubHtml() {
      const all = clubEvents();
      if (!all.length) return html`<p class="t-small t-muted">The next club event is announced here first.</p>`;
      return html`${gatheringItemHtml(all[0])}
        ${all.length > 1 ? html`<button type="button" class="btn btn--quiet" data-events-all>See all ${all.length} club events</button>` : ""}`;
    }
    function recentHtml() {
      const rows = recentRows();
      return html`
        <button type="button" class="disclosure" data-recent-toggle aria-expanded="${recentOpen}" aria-controls="cr-panel">
          <span class="eyebrow" id="cr-h">Recent activity</span>
          <span class="disclosure__count t-small t-muted num">${rows.length}</span>
          <span class="disclosure__chev" aria-hidden="true">${icon("chevronRight", { size: 20 })}</span>
        </button>
        <div class="disclosure__panel" id="cr-panel" role="region" aria-labelledby="cr-h" data-open="${recentOpen}" ${recentOpen ? "" : raw("inert")}>
          <div class="disclosure__inner">
            ${activityListHtml(rows.slice(0, 5))}
            ${rows.length > 5 ? html`<button type="button" class="btn btn--quiet" data-activity-all>See all ${rows.length}</button>` : ""}
          </div>
        </div>`;
    }
    function bodyHtml() {
      const has = circles().length > 0;
      return html`
        <section class="app-section" aria-labelledby="cl-h">
          <h2 class="eyebrow app-section__title" id="cl-h">Your circles</h2>
          <div class="stack" style="--stack-gap:var(--space-4)" data-circles-list>${sectionHtml()}</div>
        </section>
        <section class="app-section" aria-labelledby="cc-h">
          <h2 class="eyebrow app-section__title" id="cc-h">From the club</h2>
          <div class="stack" style="--stack-gap:var(--space-3)" data-club-events>${clubHtml()}</div>
        </section>
        ${has ? html`<section class="app-section circles-recent" data-cr>${recentHtml()}</section>` : ""}`;
    }

    /* The two sheets: every club event, and all recent activity */
    const eventsSheetHtml = () => ui.sheetPanel({ id: "events-title", title: "From the club", subtitle: "Events The Round runs itself, open to members.", cls: "circles-sheet",
      body: html`<ul role="list" class="event-list">${clubEvents().map(eventRowHtml)}</ul>` });
    const activitySheetHtml = () => ui.sheetPanel({ id: "activity-title", title: "Recent activity", subtitle: `From all your Circles, the last ${S.circleRules().activityDays} days.`, cls: "circles-sheet",
      body: activityListHtml(recentRows()) });
    function makeSheet(id, labelId) {
      const sh = document.createElement("div");
      sh.className = "sheet";
      sh.id = id;
      sh.setAttribute("role", "dialog");
      sh.setAttribute("aria-modal", "true");
      sh.setAttribute("aria-labelledby", labelId);
      sh.setAttribute("aria-hidden", "true");
      $(".phone__screen", el).appendChild(sh);
      return sh;
    }

    const set = (sel, markup) => { const n = $(sel, view); if (n && !n.contains(document.activeElement)) n.innerHTML = markup.s; };
    const force = (sel, markup) => { const n = $(sel, view); if (n) n.innerHTML = markup.s; };
    const repaintRounds = () => force("[data-circles-list]", sectionHtml());
    const repaintActivity = () => {
      force("[data-cr]", recentHtml());
      if (activitySheet?.dataset.open === "true") {
        const k = document.activeElement?.closest?.("[data-ack]")?.dataset.ack;
        activitySheet.innerHTML = activitySheetHtml().s;
        if (k) $(`[data-ack="${k}"]`, activitySheet)?.focus();
      }
    };
    let hadCircles = circles().length > 0;
    function paint() {
      // Joining a first Circle (or leaving the last) changes the sections themselves
      if ((circles().length > 0) !== hadCircles) { hadCircles = !hadCircles; const b = $("[data-cbody]", view); if (b) b.innerHTML = bodyHtml().s; return; }
      set("[data-circles-list]", sectionHtml());
      set("[data-club-events]", clubHtml());
      set("[data-cr]", recentHtml());
    }

    function toggleRecent(btn) {
      recentOpen = !recentOpen;
      btn.setAttribute("aria-expanded", String(recentOpen));
      const panel = $("#cr-panel", view);
      panel.dataset.open = String(recentOpen);
      panel.toggleAttribute("inert", !recentOpen);
    }

    function onClick(e) {
      if (sharedClick(e, ctx, { repaintRounds, repaintActivity, view })) return;
      const tg = e.target.closest("[data-recent-toggle]");
      if (tg) { toggleRecent(tg); return; }
      const ea = e.target.closest("[data-events-all]");
      if (ea) { ea.focus(); eventsSheet.innerHTML = eventsSheetHtml().s; ui.openSheet(eventsSheet); return; }
      const aa = e.target.closest("[data-activity-all]");
      if (aa) { aa.focus(); activitySheet.innerHTML = activitySheetHtml().s; ui.openSheet(activitySheet); return; }
      const ga = e.target.closest("[data-gather-answer]");
      if (ga) {
        const id = ga.dataset.gatherAnswer;
        const going = ga.dataset.going === "1";
        const was = S.gathering(id);
        const res = A.rsvp(id, going);
        if (!res.ok) { ctx.toast(res.message || "That didn’t work. Try again.", { iconName: "info" }); return; }
        const g = res.gathering;
        ctx.toast(going ? `You’re going. ${fmt.longDate(g.at)}, ${fmt.time(g.at)}.` : was.going ? "Seat given up. Thanks for letting us know." : "Noted. Maybe next time.", { iconName: going ? "calendar" : "check" });
        force("[data-club-events]", clubHtml());
        $(`[data-gather-answer="${id}"][data-going="${ga.dataset.going}"]`, view)?.focus();
      }
    }
    // Acknowledgements inside the activity sheet
    const onActivitySheetClick = (e) => sharedClick(e, ctx, { repaintRounds, repaintActivity, view: activitySheet });

    let unbind = null;
    return {
      html: html`<div class="app-screen circles-tab">
          <h1 class="t-title">Circles</h1>
          <div data-cbody>${bodyHtml()}</div>
        </div>`.s,
      mount() {
        eventsSheet = makeSheet("events-sheet", "events-title");
        activitySheet = makeSheet("activity-sheet", "activity-title");
        activitySheet.addEventListener("click", onActivitySheetClick);
        view.addEventListener("click", onClick);
        unbind = bindSection(view, ctx);
        return () => {
          view.removeEventListener("click", onClick);
          unbind();
          [eventsSheet, activitySheet].forEach((sh) => { ui.closeSheet(sh); sh.remove(); });
        };
      },
      on: {
        circle: paint,
        round: paint,
        ack: () => set("[data-cr]", recentHtml()),
        privacy: paint,
        ledger: paint,
        pickup: paint,
        group: paint,
        rsvp: paint,
        snapshot: paint,
        tick: () => set("[data-club-events]", clubHtml()), // RSVP windows open with the clock
      },
    };
  };

  /* -------------------------------------------------------------------
     #/app/circles/:id
     ------------------------------------------------------------------- */
  REG.circle = (ctx, circleId) => {
    const { view } = ctx;
    const call = { open: false, cafeId: null, at: "", error: "" };
    let manage = false;
    const c = () => S.circle(circleId);
    const me = () => ctx.member().id;
    const isHost = () => c()?.hostId === me();
    const name = (m) => (m.id === me() ? "You" : m.firstName);

    function headHtml() {
      const cc = c();
      const host = S.member(cc.hostId);
      return html`<div class="circle-hero">
        ${ringHtml(cc, { large: true })}
        <div class="stack" style="--stack-gap:var(--space-1)">
          <p class="eyebrow">Circle</p>
          <h1 class="t-title" data-detail-title>${cc.name}</h1>
          <p class="t-small t-muted num">${count(cc)} of ${max()} members · hosted by ${host ? name(host).replace(/^You$/, "you") : "a member"}</p>
        </div>
        <ul role="list" class="circle-people">${S.circleMembers(cc).map((m) => html`<li><span class="circle-people__mark" aria-hidden="true">${(m.initials || m.firstName[0]).slice(0, 2)}</span><span>${name(m)}</span></li>`)}</ul>
        ${count(cc) < max()
          ? html`<a class="btn btn--secondary btn--block" href="${waHref(cc)}" target="_blank" rel="noopener">${icon("share")}Add them to your circle</a>
             <button type="button" class="btn btn--quiet" data-circle-copy>Copy the invitation link</button>`
          : html`<p class="t-small t-muted">This Circle is full, ${max()} of ${max()}.</p>`}
      </div>`;
    }

    /* Rounds -------------------------------------------------------- */
    function callHtml() {
      if (!call.open) return html`<button type="button" class="btn btn--primary btn--block" data-round-call>Call a round</button>`;
      if (!call.cafeId) call.cafeId = ctx.member().plan?.type === "brand" ? S.branches(ctx.member().plan.brandId)[0].id : S.clubCafes()[0].id;
      const t = S.pickupTimes(call.cafeId);
      if (!t.slots.some((x) => String(x.at) === String(call.at))) call.at = t.slots[0] ? String(t.slots[0].at) : "";
      const brands = [...new Set(S.cafes().filter((x) => x.chainId).map((x) => x.chainId))].map(S.brand);
      return html`<form class="stack round-call" style="--stack-gap:var(--space-4)" data-round-form novalidate>
        <div class="field">
          <label class="field__label" for="round-cafe">Café</label>
          <span class="select"><select class="input" id="round-cafe" data-round-cafe>
            ${brands.map((b) => html`<optgroup label="${b.name}">${S.branches(b.id).map((x) => html`<option value="${x.id}" ${x.id === call.cafeId ? raw("selected") : ""}>${b.name} · ${x.branch}</option>`)}</optgroup>`)}
            <optgroup label="Partner cafés">${S.clubCafes().map((x) => html`<option value="${x.id}" ${x.id === call.cafeId ? raw("selected") : ""}>${x.name}</option>`)}</optgroup>
          </select></span>
        </div>
        ${t.slots.length
          ? html`<div class="field">
              <label class="field__label" for="round-at">Time, today</label>
              <span class="select"><select class="input num" id="round-at" data-round-at>${t.slots.map((x) => html`<option value="${x.at}" ${String(x.at) === String(call.at) ? raw("selected") : ""}>${x.label}</option>`)}</select></span>
            </div>
            <p class="t-small t-muted num">“${ctx.member().firstName} called a round: ${S.pickupPlace(call.cafeId)} at ${fmt.time(Number(call.at))}.”</p>`
          : html`<p class="t-small t-muted">${S.pickupPlace(call.cafeId)} has closed for today. Choose another café.</p>`}
        <p class="cv-error" role="alert">${call.error}</p>
        <button type="submit" class="btn btn--primary btn--block" ${t.slots.length ? "" : raw("disabled")}>Call the round</button>
        <button type="button" class="btn btn--quiet" data-round-cancel>Not now</button>
      </form>`;
    }

    function roundsHtml() {
      const { upcoming } = S.roundsOf(circleId);
      return html`${upcoming.map(roundHtml)}<div data-round-call-box>${callHtml()}</div>`;
    }

    /* This month ---------------------------------------------------- */
    function monthHtml() {
      const mo = S.circleMonth(c());
      return html`<div class="circle-month">
        <p class="circle-month__n"><span class="num">${mo.cafes}</span> ${mo.cafes === 1 ? "café" : "cafés"} explored together</p>
        ${mo.names.length ? html`<p class="t-small t-muted">${mo.names.join(", ")}.</p>` : ""}
        <p class="t-small">${mo.streak.line}</p>
        ${mo.ranking.length ? html`<div>
          <p class="t-micro t-faint">Most explored</p>
          <ol role="list" class="circle-rank">${mo.ranking.map((r, i) => html`<li><span class="num t-faint">${i + 1}</span><span>${name(r.member)}</span><span class="t-small t-muted num">${r.cafes} ${r.cafes === 1 ? "café" : "cafés"}</span></li>`)}</ol>
        </div>` : ""}
      </div>`;
    }

    /* Activity ------------------------------------------------------ */
    const activityHtml = () => activityListHtml(S.circleActivity(c()));

    /* Members (manage) ---------------------------------------------- */
    function membersHtml() {
      const cc = c();
      return html`${manage && isHost() ? html`<ul role="list">${S.circleMembers(cc).filter((m) => m.id !== cc.hostId).map((m) => html`<li class="row">
          <span class="row__main"><span class="row__title">${m.firstName} ${m.lastName || ""}</span><span class="row__meta">Joined ${fmt.shortDate(cc.members[m.id].joinedAt)}</span></span>
          <button type="button" class="btn btn--quiet" data-circle-remove="${m.id}">Remove</button>
        </li>`)}</ul>` : ""}
        <div class="circle-leave">
          ${isHost() && count(cc) > 1 ? html`<button type="button" class="btn btn--quiet" data-circle-manage>${manage ? "Done" : "Manage members"}</button>` : ""}
          <button type="button" class="btn btn--quiet" data-circle-leave>Leave this Circle</button>
        </div>
        <p class="t-micro t-faint">Your Circle sees the café and the time, after you’ve had your coffee. Never where you are.</p>`;
    }

    function bodyHtml() {
      const cc = c();
      if (!cc || cc.closed || !cc.members[me()]) {
        return html`<div class="stack" style="--stack-gap:var(--space-3)">
          <h1 class="t-h2">${cc && !cc.closed ? `You’re not in ${cc.name}.` : "This Circle isn’t here."}</h1>
          <p class="t-small t-muted">${cc && !cc.closed ? "Ask a member for the invitation link." : "It may have closed, or it hasn’t reached this phone yet."}</p>
          <a class="btn btn--secondary" href="#/app/circles">Back to Circles</a>
        </div>`;
      }
      return html`<div data-c-head>${headHtml()}</div>
        <section class="app-section" aria-labelledby="c-rounds-h">
          <h2 class="eyebrow app-section__title" id="c-rounds-h">Rounds</h2>
          <div class="stack" style="--stack-gap:var(--space-3)" data-c-rounds>${roundsHtml()}</div>
        </section>
        <section class="app-section" aria-labelledby="c-month-h">
          <h2 class="eyebrow app-section__title" id="c-month-h">This month</h2>
          <div data-c-month>${monthHtml()}</div>
        </section>
        <section class="app-section" aria-labelledby="c-act-h">
          <h2 class="eyebrow app-section__title" id="c-act-h">This week</h2>
          <div data-c-act>${activityHtml()}</div>
        </section>
        <section class="app-section" aria-label="Membership">
          <div data-c-members>${membersHtml()}</div>
        </section>`;
    }

    const set = (sel, markup) => { const n = $(sel, view); if (n && !n.contains(document.activeElement)) n.innerHTML = markup.s; };
    function paint({ all = false } = {}) {
      const body = $("[data-c-body]", view);
      if (!body) return;
      if (all || !$("[data-c-head]", body)) { body.innerHTML = bodyHtml().s; return; }
      if (!c() || c().closed || !c().members[me()]) { body.innerHTML = bodyHtml().s; return; }
      set("[data-c-head]", headHtml());
      if (!call.open) set("[data-c-rounds]", roundsHtml());
      set("[data-c-month]", monthHtml());
      set("[data-c-act]", activityHtml());
      set("[data-c-members]", membersHtml());
    }
    const paintRounds = (focusSel) => { const n = $("[data-c-rounds]", view); if (n) n.innerHTML = roundsHtml().s; if (focusSel) $(focusSel, view)?.focus(); };

    function onClick(e) {
      const t = e.target;
      if (sharedClick(e, ctx, { repaintRounds: () => paintRounds(), repaintActivity: () => { const n = $("[data-c-act]", view); if (n) n.innerHTML = activityHtml().s; }, view })) return;
      if (t.closest("[data-round-call]")) { call.open = true; call.error = ""; paintRounds("#round-cafe"); return; }
      if (t.closest("[data-round-cancel]")) { call.open = false; paintRounds("[data-round-call]"); return; }
      if (t.closest("[data-circle-manage]")) { manage = !manage; const n = $("[data-c-members]", view); n.innerHTML = membersHtml().s; return $("[data-circle-manage]", view)?.focus(); }
      const rm = t.closest("[data-circle-remove]");
      if (rm) {
        const who = S.member(rm.dataset.circleRemove);
        if (A.removeFromCircle(circleId, rm.dataset.circleRemove).ok) { ctx.toast(`${who.firstName} is no longer in ${c().name}.`); paint({ all: true }); }
        return;
      }
      if (t.closest("[data-circle-leave]")) {
        const nm = c().name;
        if (A.leaveCircle(circleId).ok) { ctx.toast(`You’ve left ${nm}.`); ctx.go("#/app/circles", { replace: true }); }
        return;
      }
      if (t.closest("[data-circle-copy]")) {
        const url = joinUrl(c());
        try { navigator.clipboard.writeText(url).then(() => ctx.toast("Invitation link copied.", { iconName: "copy" }), () => ctx.toast(url, { iconName: "copy", duration: 6000 })); }
        catch (_) { ctx.toast(url, { iconName: "copy", duration: 6000 }); }
      }
    }
    function onChange(e) {
      const t = e.target;
      if (t.matches("[data-round-cafe]")) { call.cafeId = t.value; call.at = ""; return paintRounds("#round-cafe"); }
      if (t.matches("[data-round-at]")) { call.at = t.value; return paintRounds("#round-at"); }
    }
    function onSubmit(e) {
      if (!e.target.matches("[data-round-form]")) return;
      e.preventDefault();
      const res = A.callRound(circleId, { cafeId: call.cafeId, at: Number(call.at) });
      if (!res.ok) { call.error = res.message; return paintRounds(); }
      call.open = false;
      ctx.toast(`Round called: ${S.pickupPlace(res.round.cafeId)} at ${fmt.time(res.round.at)}.`, { iconName: "calendar" });
      paintRounds();
    }

    let onScroll = null;
    return {
      html: html`
        <div class="cafe-detail circle-page">
          <div class="screen-bar" data-screen-bar>
            <button type="button" class="icon-btn" data-back="#/app/circles" aria-label="Back">${icon("arrowLeft")}</button>
            <span class="screen-bar__title" aria-hidden="true">${c()?.name || "Circle"}</span>
          </div>
          <div class="app-screen" data-c-body>${bodyHtml()}</div>
        </div>`.s,
      mount() {
        view.addEventListener("click", onClick);
        view.addEventListener("change", onChange);
        view.addEventListener("submit", onSubmit);
        const bar = $("[data-screen-bar]", view);
        onScroll = () => { const title = $("[data-detail-title]", view); if (title) bar.classList.toggle("is-titled", title.getBoundingClientRect().bottom < bar.getBoundingClientRect().bottom); };
        view.addEventListener("scroll", onScroll, { passive: true });
        return () => {
          view.removeEventListener("click", onClick);
          view.removeEventListener("change", onChange);
          view.removeEventListener("submit", onSubmit);
          view.removeEventListener("scroll", onScroll);
        };
      },
      on: {
        circle: ({ circle }) => { if (circle.id === circleId) paint(); },
        round: ({ round }) => { if (round.circleId === circleId) paint(); },
        ack: () => set("[data-c-act]", activityHtml()),
        privacy: () => paint(),
        ledger: () => paint(),
        pickup: () => paint(),
        group: () => { if (!call.open) set("[data-c-rounds]", roundsHtml()); },
        snapshot: () => paint({ all: true }),
      },
    };
  };

  /* -------------------------------------------------------------------
     #/app/circles/:id/join  (the invitation link)
     ------------------------------------------------------------------- */
  REG.circleJoin = (ctx, circleId) => {
    const { view } = ctx;
    const c = () => S.circle(circleId);
    function bodyHtml() {
      const cc = c();
      const m = ctx.member();
      if (!cc || cc.closed) {
        return html`<div class="stack table__wait" style="--stack-gap:var(--space-3)">
          <span class="spinner" aria-hidden="true"></span>
          <h1 class="t-h2">Finding the Circle…</h1>
          <p class="t-small t-muted">It appears as soon as a member’s phone is online. Keep this open.</p>
        </div>`;
      }
      const host = S.member(cc.hostId);
      const inIt = !!cc.members[m.id];
      const full = count(cc) >= max();
      return html`<div class="circle-hero circle-join">
        ${ringHtml(cc, { large: true })}
        <div class="stack" style="--stack-gap:var(--space-2)">
          <p class="eyebrow">An invitation</p>
          <h1 class="t-h2">${inIt ? `You’re in ${cc.name}.` : `${host ? host.firstName : "A member"} would like you in ${cc.name}.`}</h1>
          <p class="t-small t-muted">Members see where each other has had coffee: the café and the time, after the fact. Never where you are. You can leave at any time.</p>
        </div>
        ${inIt ? html`<a class="btn btn--primary btn--block" href="#/app/circles/${cc.id}">Open the Circle</a>`
          : full ? html`<p class="t-small">This Circle is full, ${max()} of ${max()}.</p>`
          : html`<button type="button" class="btn btn--primary btn--block" data-circle-join>Join as ${m.firstName}</button>`}
      </div>`;
    }
    const paint = () => { $("[data-cj-body]", view).innerHTML = bodyHtml().s; };
    function onClick(e) {
      if (!e.target.closest("[data-circle-join]")) return;
      const res = A.joinCircle(circleId);
      if (!res.ok) return ctx.toast(res.message, { iconName: "info" });
      ctx.toast(`Welcome to ${res.circle.name}.`);
      ctx.go(`#/app/circles/${circleId}`, { replace: true });
    }
    return {
      html: html`<div class="flow">
          <div class="screen-bar"><button type="button" class="icon-btn" data-back="#/app/circles" aria-label="Back">${icon("arrowLeft")}</button></div>
          <div class="app-screen flow__body" data-cj-body>${bodyHtml()}</div>
        </div>`.s,
      mount() { view.addEventListener("click", onClick); return () => view.removeEventListener("click", onClick); },
      on: { circle: paint, snapshot: paint },
    };
  };
})();
