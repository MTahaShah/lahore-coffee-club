/* =====================================================================
   Lahore Coffee Club — app-circles.js
   Circles: small private groups (up to 12) inside the Club tab.

     Club tab           your Circles (a small brick ring each), Start a Circle
     #/app/circle/:id   the Circle: the large ring, members, rounds,
                        this month (cafés explored, the streak), activity
     #/app/circle/:id/join   the invitation link ("Add them to your circle")

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
  const joinUrl = (c) => `${LIVE()}${LCC.sync ? LCC.sync.withRoom(`#/app/circle/${c.id}/join`) : `#/app/circle/${c.id}/join`}`;
  const shareText = (c) => `Join ${c.name}, my Circle on Lahore Coffee Club. We see where each other has had coffee, and call rounds together: ${joinUrl(c)}`;
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
     Club tab section
     ------------------------------------------------------------------- */
  const form = { open: false, name: "", error: "" };
  function sectionHtml() {
    const list = S.circlesOf();
    return html`
      ${list.length ? html`<ul role="list" class="circle-list">${list.map((c) => {
        const mo = S.circleMonth(c);
        return html`<li><a class="row circle-row" href="#/app/circle/${c.id}">
          ${ringHtml(c)}
          <span class="row__main"><span class="row__title">${c.name}</span><span class="row__meta num">${count(c)} of ${max()} · ${mo.cafes} ${mo.cafes === 1 ? "café" : "cafés"} this month</span></span>
          <span class="row__trail" aria-hidden="true">${icon("chevronRight", { size: 20 })}</span>
        </a></li>`;
      })}</ul>` : html`<p class="t-small t-muted">A Circle is a few people you have coffee with. You see each other’s cafés, after the fact, and call rounds together.</p>`}
      ${form.open
        ? html`<form class="stack circle-start" style="--stack-gap:var(--space-3)" data-circle-form novalidate>
            <div class="field" data-invalid="${!!form.error}">
              <label class="field__label" for="circle-name">Name your Circle</label>
              <input class="input" id="circle-name" name="circlename" value="${form.name}" maxlength="40" placeholder="The Gulberg Circle" autocomplete="off" aria-describedby="circle-name-err">
              <p class="field__error" id="circle-name-err">${form.error}</p>
            </div>
            <button type="submit" class="btn btn--primary btn--block">Start the Circle</button>
            <button type="button" class="btn btn--link" data-circle-cancel>Not now</button>
          </form>`
        : html`<button type="button" class="btn btn--secondary btn--block" data-circle-start>Start a Circle</button>`}`;
  }

  /** Wires the Club tab section; returns a cleanup. */
  function bindSection(root, ctx) {
    const box = () => $("[data-club-circles]", root);
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
      ctx.go(`#/app/circle/${res.circle.id}`);
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
     #/app/circle/:id
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
          <h1 class="t-h2" data-detail-title>${cc.name}</h1>
          <p class="t-small t-muted num">${count(cc)} of ${max()} members · hosted by ${host ? name(host).replace(/^You$/, "you") : "a member"}</p>
        </div>
        <ul role="list" class="circle-people">${S.circleMembers(cc).map((m) => html`<li><span class="circle-people__mark" aria-hidden="true">${(m.initials || m.firstName[0]).slice(0, 2)}</span><span>${name(m)}</span></li>`)}</ul>
        ${count(cc) < max()
          ? html`<a class="btn btn--secondary btn--block" href="${waHref(cc)}" target="_blank" rel="noopener">${icon("share")}Add them to your circle</a>
             <button type="button" class="btn btn--link" data-circle-copy>Copy the invitation link</button>`
          : html`<p class="t-small t-muted">This Circle is full, ${max()} of ${max()}.</p>`}
      </div>`;
    }

    /* Rounds -------------------------------------------------------- */
    function roundHtml(r) {
      const caller = S.member(r.callerId);
      const place = S.pickupPlace(r.cafeId);
      const ans = Object.entries(r.answers || {}).map(([id, a]) => ({ m: S.member(id), going: a.going })).filter((x) => x.m);
      const coming = ans.filter((x) => x.going).map((x) => name(x.m));
      const notThis = ans.filter((x) => !x.going).map((x) => name(x.m));
      const mine = r.answers?.[me()];
      const today = new Date(r.at).toDateString() === new Date().toDateString();
      const when = `${today ? "" : `${fmt.date(r.at)}, `}${fmt.time(r.at)}`;
      const table = r.groupId ? S.group(r.groupId) : null;
      const beans = S.beans().rules.roundAttend;
      return html`<article class="round card" aria-label="Round at ${place}">
        <p class="t-body">${caller ? (caller.id === me() ? "You" : caller.firstName) : "A member"} called a round: <strong>${place}</strong> at <span class="num">${when}</span>.</p>
        <p class="t-small t-muted">${coming.length ? `Coming: ${coming.join(", ")}` : "No one yet"}${notThis.length ? ` · Not this time: ${notThis.join(", ")}` : ""}</p>
        <div class="round__answers" role="group" aria-label="Will you be there?">
          <button type="button" class="btn btn--compact ${mine?.going ? "btn--primary" : "btn--secondary"}" data-round-answer="${r.id}" data-going="1" aria-pressed="${!!mine?.going}">I’ll be there</button>
          <button type="button" class="btn btn--compact ${mine && !mine.going ? "btn--primary" : "btn--secondary"}" data-round-answer="${r.id}" data-going="0" aria-pressed="${!!mine && !mine.going}">Not this time</button>
        </div>
        ${mine?.going
          ? table && table.status !== "cancelled"
            ? html`<a class="btn btn--link" href="#/app/group/${table.id}">${table.status === "open" ? "Add your drink to the table" : "See the table"}</a>`
            : html`<button type="button" class="btn btn--secondary btn--block" data-round-table="${r.id}">Order together</button>
                <p class="t-micro t-faint">Starts a table at ${place} for ${fmt.time(r.at)}. Everyone coming adds their own drink.</p>`
          : ""}
        <p class="t-micro t-faint num">+${beans} Beans for everyone who comes.</p>
      </article>`;
    }

    function callHtml() {
      if (!call.open) return html`<button type="button" class="btn btn--primary btn--block" data-round-call>Call a round</button>`;
      if (!call.cafeId) call.cafeId = ctx.member().plan?.type === "brand" ? S.branches(ctx.member().plan.brandId)[0].id : S.clubCafes()[0].id;
      const t = S.pickupTimes(call.cafeId);
      if (!t.slots.some((x) => String(x.at) === String(call.at))) call.at = t.slots[0] ? String(t.slots[0].at) : "";
      const brands = [...new Set(S.cafes().filter((x) => x.brandId).map((x) => x.brandId))].map(S.brand);
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
        <button type="button" class="btn btn--link" data-round-cancel>Not now</button>
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
    function activityHtml() {
      const rows = S.circleActivity(c());
      const mine = S.privacy(me());
      return html`${!mine.share ? html`<p class="t-small t-muted">You’re not sharing your coffee with your Circles. Change it in your profile.</p>` : ""}
        ${rows.length ? html`<ul role="list" class="circle-act">${rows.map((r) => html`<li class="circle-act__row">
          <p class="circle-act__text"><strong>${name(r.member)}</strong> · ${r.text} · <span class="t-muted" data-rel-time="${r.at}">${fmt.ago(r.at)}</span></p>
          <button type="button" class="ack" data-ack="${r.key}" aria-pressed="${r.acked}" ${r.own ? raw("disabled") : ""}
            aria-label="${r.own ? "Acknowledgements" : r.acked ? "Acknowledged. Tap to take it back" : "Acknowledge"}${r.acks ? `, ${r.acks}` : ""}">
            ${ui.cupIcon(r.acked ? "moderate" : "quiet", { size: 16, cls: "ack__icon" })}<span class="num">${r.acks || ""}</span>
          </button>
        </li>`)}</ul>` : html`<p class="t-small t-muted">Nothing this week yet.</p>`}`;
    }

    /* Members (manage) ---------------------------------------------- */
    function membersHtml() {
      const cc = c();
      return html`${manage && isHost() ? html`<ul role="list">${S.circleMembers(cc).filter((m) => m.id !== cc.hostId).map((m) => html`<li class="row">
          <span class="row__main"><span class="row__title">${m.firstName} ${m.lastName || ""}</span><span class="row__meta">Joined ${fmt.shortDate(cc.members[m.id].joinedAt)}</span></span>
          <button type="button" class="btn btn--link" data-circle-remove="${m.id}">Remove</button>
        </li>`)}</ul>` : ""}
        <div class="circle-leave">
          ${isHost() && count(cc) > 1 ? html`<button type="button" class="btn btn--link" data-circle-manage>${manage ? "Done" : "Manage members"}</button>` : ""}
          <button type="button" class="btn btn--link" data-circle-leave>Leave this Circle</button>
        </div>
        <p class="t-micro t-faint">Your Circle sees the café and the time, after you’ve had your coffee. Never where you are.</p>`;
    }

    function bodyHtml() {
      const cc = c();
      if (!cc || cc.closed || !cc.members[me()]) {
        return html`<div class="stack" style="--stack-gap:var(--space-3)">
          <h1 class="t-h2">${cc && !cc.closed ? `You’re not in ${cc.name}.` : "This Circle isn’t here."}</h1>
          <p class="t-small t-muted">${cc && !cc.closed ? "Ask a member for the invitation link." : "It may have closed, or it hasn’t reached this phone yet."}</p>
          <a class="btn btn--secondary" href="#/app/club">Back to the club</a>
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
      const ans = t.closest("[data-round-answer]");
      if (ans) {
        const going = ans.dataset.going === "1";
        A.answerRound(ans.dataset.roundAnswer, going);
        ctx.toast(going ? "You’re coming. The others can see it." : "Noted. Maybe next time.", { iconName: going ? "calendar" : "check" });
        return paintRounds(`[data-round-answer="${ans.dataset.roundAnswer}"][data-going="${ans.dataset.going}"]`);
      }
      const rt = t.closest("[data-round-table]");
      if (rt) {
        const r = store.getState().rounds[rt.dataset.roundTable];
        const res = LCC.appOrder.startTable({ cafeId: r.cafeId, pickupAt: r.at });
        if (!res.ok) return ctx.toast(res.message, { iconName: "info" });
        A.setRoundTable(r.id, res.group.id);
        return ctx.go(`#/app/group/${res.group.id}`);
      }
      if (t.closest("[data-round-call]")) { call.open = true; call.error = ""; paintRounds("#round-cafe"); return; }
      if (t.closest("[data-round-cancel]")) { call.open = false; paintRounds("[data-round-call]"); return; }
      const ack = t.closest("[data-ack]");
      if (ack) { A.acknowledge(ack.dataset.ack); set("[data-c-act]", activityHtml()); return $(`[data-ack="${ack.dataset.ack}"]`, view)?.focus(); }
      if (t.closest("[data-circle-manage]")) { manage = !manage; const n = $("[data-c-members]", view); n.innerHTML = membersHtml().s; return $("[data-circle-manage]", view)?.focus(); }
      const rm = t.closest("[data-circle-remove]");
      if (rm) {
        const who = S.member(rm.dataset.circleRemove);
        if (A.removeFromCircle(circleId, rm.dataset.circleRemove).ok) { ctx.toast(`${who.firstName} is no longer in ${c().name}.`); paint({ all: true }); }
        return;
      }
      if (t.closest("[data-circle-leave]")) {
        const nm = c().name;
        if (A.leaveCircle(circleId).ok) { ctx.toast(`You’ve left ${nm}.`); ctx.go("#/app/club", { replace: true }); }
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
            <button type="button" class="icon-btn" data-back="#/app/club" aria-label="Back">${icon("arrowLeft")}</button>
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
     #/app/circle/:id/join  (the invitation link)
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
        ${inIt ? html`<a class="btn btn--primary btn--block" href="#/app/circle/${cc.id}">Open the Circle</a>`
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
      ctx.go(`#/app/circle/${circleId}`, { replace: true });
    }
    return {
      html: html`<div class="flow">
          <div class="screen-bar"><button type="button" class="icon-btn" data-back="#/app/club" aria-label="Back">${icon("arrowLeft")}</button></div>
          <div class="app-screen flow__body" data-cj-body>${bodyHtml()}</div>
        </div>`.s,
      mount() { view.addEventListener("click", onClick); return () => view.removeEventListener("click", onClick); },
      on: { circle: paint, snapshot: paint },
    };
  };
})();
