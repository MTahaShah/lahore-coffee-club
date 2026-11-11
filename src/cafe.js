/* =====================================================================
   Lahore Coffee Club — cafe.js
   Café partner view (#/cafe). For the counter, the till and the books:
   calm, plain, big targets.

     Header   ring logo, café, area · staff on shift (PIN) · taking cups
     Counter  scan or enter a code, redeem, last 5 cups, busy level, pause
     Orders   pickup queue for this branch, oldest first: Start, Ready,
              Collected, or Reject with a reason. Badge counts new orders
     Today    four numbers, cups by hour, every redemption, CSV export
     Payouts  this month (cups and paid orders), next payout, history
     Settings what a cup covers, limits, hours, staff PINs

   Tablet: a slim left rail. Phone: a segmented control at the top.
   Reads and writes the shared store, so a redemption here takes a cup
   off the member's phone, and the busy level shows on the member map.
   ===================================================================== */
(function () {
  "use strict";
  const LCC = window.LCC;
  const { store, fmt, ui } = LCC;
  const { html, raw, $, $$, icon } = ui;
  const S = store.select;
  const A = store.actions;

  const RESET_AFTER_MS = 6000;
  const RECENT_LIMIT = 5;
  const PAUSE_MINUTES = 30;
  const SECTIONS = [
    { id: "counter",  label: "Counter" },
    { id: "orders",   label: "Orders" },
    { id: "today",    label: "Today" },
    { id: "payouts",  label: "Payouts" },
    { id: "settings", label: "Settings" },
  ];
  const BUSY = [
    { id: "auto", label: "Auto" },
    { id: "quiet", label: "Quiet" },
    { id: "moderate", label: "Moderate" },
    { id: "packed", label: "Packed" },
  ];
  const ROLES = { counter: "counter", owner: "owner", manager: "manager" };

  // Thin-line icons for the rail, drawn like ui.icon (24 grid, 1.5 stroke)
  const RAIL_ICONS = {
    counter: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5z"/>',
    orders: '<path d="M6 8.5h12l-1 11.5H7L6 8.5z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
    today: '<path d="M4 20h16M7 20v-6M12 20V8M17 20v-9"/>',
    payouts: '<rect x="3.5" y="6" width="17" height="12" rx="1.5"/><circle cx="12" cy="12" r="2.5"/><path d="M7 9.5v5M17 9.5v5"/>',
    settings: '<path d="M5 7h9M18 7h1M5 17h3M12 17h7"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  };
  const railIcon = (id) => raw(`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${RAIL_ICONS[id]}</svg>`);

  const firstName = (m) => (m ? m.firstName : "Member");
  const cafeSlug = (c) => c.name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const isoDay = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

  LCC.router.register("cafe", {
    title: "Café view",
    mount(el) {
      let cafeId = store.getState().partnerCafeId;
      let section = "counter";
      let r = freshRedeem();       // counter: idle | error | found | success
      let resetTimer = null, scanTimer = null;
      let pin = "";                // staff sign-in entry
      let wasPaused = false;       // so the tick only redraws the pause control when it ends
      let scope = "branch";        // brands: Today and Payouts for "this branch" or "all branches"
      let rejecting = null;        // Orders: the order whose reject reasons are showing

      function freshRedeem() { return { state: "idle", code: "", message: "", lookup: null, result: null }; }
      const cafe = () => S.cafe(cafeId);
      const P = () => S.partner(cafeId);
      const staffOnShift = () => P().staff.find((x) => x.id === P().staffOnShift) || P().staff[0];
      const defaultDrink = () => cafe().drinks.find((d) => d.credits === 1) || cafe().drinks[0];
      const brand = () => S.brandOf(cafeId);
      /** The drink to ring up: the member's choice in the app, or a latte until staff pick. */
      function drinkFor(member) {
        const b = brand();
        const o = S.order(member.id);
        if (o && o.brandId === b.id) return { drinkId: o.drinkId, temp: o.temp, fromApp: true };
        return { drinkId: "ds-latte", temp: "hot", fromApp: false };
      }

      /* ---------------------------------------------------------------
         Shell
         --------------------------------------------------------------- */
      function renderAll() {
        const c = cafe();
        el.innerHTML = html`
          <div class="surface cv">
            <header class="cv-head">
              <div class="cv-brand">
                ${brand() ? html`<span class="monogram cv-brand__ring" aria-hidden="true">${brand().monogram}</span>` : ui.logo("ring", { label: null, cls: "cv-brand__ring" })}
                <div>
                  <h1 class="cv-name">${brand() ? `${brand().name} · ${c.short}` : c.name}</h1>
                  ${brand()
                    ? html`<label class="cv-branch"><span class="sr-only">Branch</span><span class="select"><select class="input" data-branch>
                        ${S.branches(brand().id).map((x) => html`<option value="${x.id}" ${x.id === cafeId ? raw("selected") : ""}>${x.branch}</option>`)}
                      </select></span></label>`
                    : html`<p class="t-small t-muted">${S.area(c.area).name}</p>`}
                </div>
              </div>
              <div class="cv-head__aside">
                <button type="button" class="cv-staff" data-staff aria-haspopup="dialog" aria-label="On the counter: ${staffLabel()}. Change with a PIN">
                  <span data-staff-label>${staffLabel()}</span>${icon("chevronDown", { size: 16 })}
                </button>
                <p class="cv-state" data-cv-state>${stateLine()}</p>
              </div>
            </header>

            <div class="cv-body">
              <nav class="cv-nav" aria-label="Café view">
                <div class="cv-tabs" role="tablist" aria-label="Sections">
                  ${SECTIONS.map((x) => html`<button type="button" role="tab" class="cv-tab" id="cv-tab-${x.id}" data-section="${x.id}"
                      aria-controls="cv-panel" aria-selected="${x.id === section}" tabindex="${x.id === section ? 0 : -1}">
                      ${railIcon(x.id)}<span>${x.label}</span>${x.id === "orders" ? html`<span class="cv-tab__count num" data-orders-count hidden></span>` : ""}
                    </button>`)}
                </div>
              </nav>

              <main class="cv-main" id="cv-panel" role="tabpanel" aria-labelledby="cv-tab-${section}" tabindex="-1" data-panel></main>

              <div class="cv-demo">
                ${LCC.sync ? html`<div class="cv-demo__sync">${LCC.sync.pill()}<span class="t-micro t-faint num">Room ${LCC.sync.room}</span></div>
                  <button type="button" class="btn btn--secondary btn--compact" data-pair>Pair a phone</button>` : ""}
                <label class="cv-demo__cafe">
                  <span class="t-micro t-faint">Demo café</span>
                  <span class="select"><select class="input" data-viewing>
                    ${(() => {
                      // A brand is one choice here; its branches are picked in the header
                      const firstBranch = (b) => (brand()?.id === b.id ? cafeId : S.branches(b.id)[0].id);
                      const brands = [...new Set(S.cafes().filter((x) => x.brandId).map((x) => x.brandId))].map((id) => S.brand(id));
                      return html`${brands.map((b) => html`<option value="${firstBranch(b)}" ${brand()?.id === b.id ? raw("selected") : ""}>${b.name} (${S.branches(b.id).length} branches)</option>`)}
                        ${S.clubCafes().map((x) => html`<option value="${x.id}" ${x.id === cafeId ? raw("selected") : ""}>${x.name}</option>`)}`;
                    })()}
                  </select></span>
                </label>
              </div>
            </div>
          </div>
          ${sheets()}`;
        paintSection();
        paintOrdersCount();
      }

      const staffLabel = () => { const s = staffOnShift(); return `${s.name} · ${ROLES[s.role] || s.role}`; };
      function stateLine() {
        const paused = S.isPaused(cafeId);
        return html`<span class="cv-state__dot" data-paused="${paused}" aria-hidden="true"></span>${paused ? `Paused until ${fmt.time(cafe().pausedUntil)}` : "Taking member cups"}`;
      }
      function paintHead() {
        const st = $("[data-cv-state]", el);
        if (st) st.innerHTML = stateLine().s;
        const lab = $("[data-staff-label]", el);
        if (lab) { lab.textContent = staffLabel(); $("[data-staff]", el).setAttribute("aria-label", `On the counter: ${staffLabel()}. Change with a PIN`); }
      }

      function showSection(id, { focus = false } = {}) {
        section = id;
        $$("[data-section]", el).forEach((b) => { const on = b.dataset.section === id; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; });
        $("[data-panel]", el).setAttribute("aria-labelledby", `cv-tab-${id}`);
        paintSection();
        if (focus) $("[data-panel]", el).focus({ preventScroll: true });
      }

      function paintSection() {
        const panel = $("[data-panel]", el);
        if (!panel) return;
        const make = { counter: counterHtml, orders: ordersHtml, today: todayHtml, payouts: payoutsHtml, settings: settingsHtml }[section];
        panel.innerHTML = `<div class="enter">${make().s}</div>`;
        if (section === "counter") { paintRedeem(); paintRecent(); paintBusy(); paintPause(); }
      }

      /* ---------------------------------------------------------------
         Counter
         --------------------------------------------------------------- */
      function counterHtml() {
        return html`<div class="cv-counter">
          <section class="cv-redeem" aria-labelledby="redeem-h">
            <h2 class="eyebrow" id="redeem-h">Redeem a cup</h2>
            <div data-redeem-body></div>
          </section>
          <div class="cv-side">
            <section aria-labelledby="recent-h">
              <h2 class="eyebrow" id="recent-h">Last ${RECENT_LIMIT} cups</h2>
              <ol class="cv-list" role="list" data-recent aria-live="polite"></ol>
            </section>
            <section aria-labelledby="busy-h">
              <h2 class="eyebrow" id="busy-h">Busy level</h2>
              <div class="cv-busy" role="radiogroup" aria-labelledby="busy-h" data-busy>
                ${BUSY.map((b) => html`<button type="button" role="radio" class="cv-busy__opt" data-busy-option="${b.id}" aria-checked="false" tabindex="-1">
                  ${b.id === "auto" ? "" : ui.cupIcon(b.id, { size: 16, cls: "cv-busy__icon" })}<span>${b.label}</span></button>`)}
              </div>
              <p class="t-small t-muted" data-busy-line></p>
              <p class="t-small t-muted">Members see this on the map, so they come when you have room.</p>
            </section>
            <section aria-label="Pause member cups" data-pause></section>
          </div>
        </div>`;
      }

      function paintRedeem({ focus = false } = {}) {
        const body = $("[data-redeem-body]", el);
        if (!body) return;

        if (r.state === "idle" || r.state === "error") {
          const invalid = r.state === "error";
          body.innerHTML = html`
            <div class="cv-entry">
              <button type="button" class="btn btn--primary btn--block btn--tall" data-sim-scan>${icon("qr")}<span>Scan pass</span></button>
              <p class="cv-or t-small t-faint"><span>or enter the code</span></p>
              <form class="cv-code" data-code-form novalidate>
                <div class="field" data-invalid="${invalid}">
                  <label class="field__label" for="member-code">Six-digit code</label>
                  <input class="input code-input" id="member-code" name="code" value="${r.code}"
                    inputmode="numeric" autocomplete="off" maxlength="6" placeholder="000000"
                    aria-describedby="member-code-hint member-code-err" aria-invalid="${invalid}">
                  <p class="field__hint" id="member-code-hint">Under the QR on the member’s pass.</p>
                  <p class="field__error cv-error" id="member-code-err" role="alert">${r.message}</p>
                </div>
                <button type="submit" class="btn btn--secondary btn--block">Check code</button>
              </form>
            </div>`.s;
          if (focus) { const input = $("#member-code", body); input.focus(); if (invalid) input.select(); }
          return;
        }

        if (r.state === "found" && brand()) {
          const { member, left, usedToday, dailyLimit } = r.lookup;
          const b = brand();
          const club = member.memberNo != null ? S.club(member.id) : null;
          const clubLine = club ? [club.number, club.founding && "Founding Member", club.level.id !== "member" && club.level.name].filter(Boolean).join(" · ") : "";
          body.innerHTML = html`
            <div class="cv-member enter">
              ${clubLine ? html`<p class="cv-member__club num">${clubLine}</p>` : ""}
              <p class="cv-member__name" id="member-name">${member.firstName}</p>
              <dl class="cv-facts">
                <div><dt>Plan</dt><dd>${S.planLabel(member)}</dd></div>
                <div><dt>Cups left</dt><dd class="num">${left} <span class="t-faint">· any ${b.name} branch</span></dd></div>
                <div><dt>Today here</dt><dd class="num">${usedToday} of ${dailyLimit}</dd></div>
              </dl>
              <div class="cv-order">
                <div class="cv-order__head">
                  <label class="eyebrow" for="cv-drink">Drink</label>
                  <span class="badge" data-cv-from ${r.drink.fromApp ? "" : raw("hidden")}>Chosen in the app</span>
                </div>
                <span class="select"><select class="input" id="cv-drink" data-cv-drink>
                  ${[...new Set(b.menu.map((d) => d.section))].map((sec) => html`<optgroup label="${sec}">
                    ${b.menu.filter((d) => d.section === sec).map((d) => html`<option value="${d.id}" ${d.id === r.drink.drinkId ? raw("selected") : ""}>${d.name}</option>`)}
                  </optgroup>`)}
                </select></span>
                <div data-cv-temp>${tempHtml()}</div>
                <p class="cv-order__cover num" data-cv-cover aria-live="polite">${coverHtml()}</p>
              </div>
              <button type="button" class="btn btn--primary btn--block btn--tall" data-redeem aria-describedby="member-name">Redeem 1 cup</button>
              <button type="button" class="btn btn--link" data-reset>Not ${member.firstName}? Enter another code</button>
            </div>`.s;
          if (focus) $("[data-redeem]", body).focus();
          return;
        }

        if (r.state === "found") {
          const { member, left, here, usedToday, dailyLimit } = r.lookup;
          const club = member.memberNo != null ? S.club(member.id) : null;
          const clubLine = club ? [club.number, club.founding && "Founding Member", club.level.id !== "member" && club.level.name].filter(Boolean).join(" · ") : "";
          const perks = club ? S.perksAt(member.id, cafeId) : [];
          const hereLine = here.bonus ? "Free cup from the club"
            : here.type === "mycafes" ? `${here.left} of ${here.reserved} reserved here`
            : `${Math.max(0, here.cap - here.used)} of ${here.cap} left here this month`;
          body.innerHTML = html`
            <div class="cv-member enter">
              ${clubLine ? html`<p class="cv-member__club num">${clubLine}</p>` : ""}
              <p class="cv-member__name" id="member-name">${member.firstName}</p>
              <dl class="cv-facts">
                <div><dt>Plan</dt><dd>${S.planLabel(member)}</dd></div>
                <div><dt>Cups left</dt><dd class="num">${left} <span class="t-faint">· ${hereLine}</span></dd></div>
                <div><dt>Today here</dt><dd class="num">${usedToday} of ${dailyLimit}</dd></div>
                <div><dt>A cup covers</dt><dd>${S.coversLine(cafeId)}</dd></div>
                ${perks.length ? html`<div><dt>Perk to offer</dt><dd>${perks.map((p) => p.text).join("; ")}</dd></div>` : ""}
              </dl>
              <button type="button" class="btn btn--primary btn--block btn--tall" data-redeem aria-describedby="member-name">Redeem 1 cup</button>
              <button type="button" class="btn btn--link" data-reset>Not ${member.firstName}? Enter another code</button>
            </div>`.s;
          if (focus) $("[data-redeem]", body).focus();
          return;
        }

        if (r.state === "success" && entry0()?.brandId) {
          const { member, entry } = r.result;
          body.innerHTML = html`
            <div class="cv-success" role="status">
              <svg class="check-draw" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" pathLength="1"/><path d="M15 24.5l6 6 12-13" pathLength="1"/></svg>
              <p class="cv-success__title">Cup redeemed for ${member.firstName}</p>
              <p class="cv-success__drink">${S.entryDrinkName(entry)}</p>
              ${entry.topUp
                ? html`<p class="cv-topup num">Collect ${fmt.rs(entry.topUp)} top-up</p>`
                : html`<p class="t-small t-muted">Fully covered by the cup.</p>`}
              <p class="cv-success__ref num">Reference ${S.redemptionRef(entry)}</p>
              <p class="cv-till">Ring it up on your till as: <strong>LCC member</strong></p>
              <p class="t-small t-faint num">${fmt.time(entry.at)} · ${member.firstName} has ${fmt.cups(S.balance(member.id).left)} left, any branch</p>
              <button type="button" class="btn btn--secondary" data-reset>Next</button>
              <span class="cv-success__timer" aria-hidden="true"></span>
            </div>`.s;
          if (focus) $("[data-reset]", body).focus({ preventScroll: true });
          return;
        }

        if (r.state === "success") {
          const { member, entry } = r.result;
          body.innerHTML = html`
            <div class="cv-success" role="status">
              <svg class="check-draw" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" pathLength="1"/><path d="M15 24.5l6 6 12-13" pathLength="1"/></svg>
              <p class="cv-success__title">Cup redeemed for ${member.firstName}</p>
              <p class="cv-success__ref num">Reference ${S.redemptionRef(entry)}</p>
              <p class="cv-till">Ring it up on your till as: <strong>LCC member</strong></p>
              <p class="t-small t-faint num">${fmt.time(entry.at)} · ${member.firstName} has ${fmt.cups(S.balance(member.id).left)} left this month</p>
              <button type="button" class="btn btn--secondary" data-reset>Next</button>
              <span class="cv-success__timer" aria-hidden="true"></span>
            </div>`.s;
          if (focus) $("[data-reset]", body).focus({ preventScroll: true });
        }
      }

      const entry0 = () => r.result?.entry;
      function tempHtml() {
        const item = S.menuItem(brand().id, r.drink.drinkId);
        if (item.hot != null && item.iced != null) {
          return ui.segmented({ name: "cvtemp", label: "Hot or iced", value: S.servedTemp(item, r.drink.temp), options: [{ value: "hot", label: "Hot" }, { value: "iced", label: "Iced" }] });
        }
        return html`<p class="t-small t-muted">${item.hot != null ? "Hot only" : "Iced only"}</p>`;
      }
      function coverHtml() {
        const item = S.menuItem(brand().id, r.drink.drinkId);
        const p = S.drinkPrice(brand().id, item, r.drink.temp);
        return p.included
          ? html`${S.drinkLabel(item, p.temp)}, ${fmt.rs(p.price)}: <strong>covered by the cup</strong>`
          : html`${S.drinkLabel(item, p.temp)}, ${fmt.rs(p.price)}: <strong class="cv-topup">Collect ${fmt.rs(p.topUp)} top-up</strong>`;
      }
      function paintDrink({ temp = true } = {}) {
        const t = $("[data-cv-temp]", el); if (t && temp) t.innerHTML = tempHtml().s;
        const c = $("[data-cv-cover]", el); if (c) c.innerHTML = coverHtml().s;
        const f = $("[data-cv-from]", el); if (f) f.hidden = !r.drink.fromApp;
      }

      function check(code, { focus = true } = {}) {
        r.code = code;
        const keep = r.state === "found" ? r.drink : null; // a re-check keeps what staff picked
        const res = store.lookupCode(code, cafeId, 1);
        r = res.ok ? { ...freshRedeem(), state: "found", code, lookup: res } : { ...freshRedeem(), state: "error", code, message: res.message };
        if (res.ok && brand()) r.drink = keep && keep.memberId === res.member.id ? keep : { ...drinkFor(res.member), memberId: res.member.id };
        paintRedeem({ focus });
      }

      function redeemNow() {
        // store.actions.redeem carries the // BACKEND: POST /redeem seam
        const res = brand()
          ? A.redeem({ code: r.code, cafeId, drinkId: r.drink.drinkId, temp: r.drink.temp })
          : A.redeem({ code: r.code, cafeId, drinkId: defaultDrink().id });
        if (!res.ok) {
          // e.g. the code expired, or the café paused, while the barista looked
          r = { ...freshRedeem(), state: "error", code: r.code, message: res.message };
          paintRedeem({ focus: true });
          return;
        }
        r = { ...freshRedeem(), state: "success", result: { member: res.member, entry: res.entry } };
        paintRedeem({ focus: true });
        clearTimeout(resetTimer);
        // A top-up to collect gets a little longer on screen
        resetTimer = setTimeout(() => reset({ focus: el.contains(document.activeElement) }), RESET_AFTER_MS * (res.entry.topUp ? 1.75 : 1));
      }

      function reset({ focus = true } = {}) {
        clearTimeout(resetTimer); clearTimeout(scanTimer);
        r = freshRedeem();
        paintRedeem({ focus });
      }

      function simulateScan(btn) {
        // BACKEND: a real scan decodes the QR payload (LCC1:<member>:<code>) with the camera
        btn.disabled = true;
        btn.querySelector("span").textContent = "Scanning…";
        clearTimeout(scanTimer);
        scanTimer = setTimeout(() => check(S.pass(store.getState().memberId).code), 600);
      }

      function paintRecent(newId) {
        const list = $("[data-recent]", el);
        if (!list) return;
        const rows = S.cafeDay(cafeId).entries.slice(0, RECENT_LIMIT);
        list.innerHTML = rows.length
          ? html`${rows.map((e) => html`<li class="cv-row${e.id === newId ? " enter" : ""}">
              <span class="cv-row__time num">${fmt.time(e.at)}</span>
              <span class="cv-row__main">${firstName(S.member(e.memberId))}${e.brandId ? html` <span class="t-faint">· ${S.entryDrinkName(e)}${e.topUp && !e.topUpOnline ? ` · +${fmt.rs(e.topUp)}` : ""}</span>` : ""}${e.orderId ? html` <span class="t-faint">· pickup</span>` : ""}${e.firstVisit ? html` <span class="t-faint">· first visit</span>` : ""}</span>
              <span class="cv-row__ref num">${S.redemptionRef(e)}</span>
            </li>`)}`.s
          : html`<li class="cv-row"><span class="cv-row__main t-muted">No member cups yet today.</span></li>`.s;
      }

      function paintBusy() {
        const group = $("[data-busy]", el);
        if (!group) return;
        const c = cafe();
        const current = c.busyMode === "auto" ? "auto" : c.status;
        $$("[data-busy-option]", group).forEach((b) => {
          const on = b.dataset.busyOption === current;
          b.setAttribute("aria-checked", on);
          b.tabIndex = on ? 0 : -1;
        });
        const line = $("[data-busy-line]", el);
        if (c.busyMode === "auto") {
          const est = S.busyEstimate(cafeId);
          line.innerHTML = html`<strong>${fmt.statusLabel(c.status)}</strong> now, from ${fmt.cups(est.cups)} in the last 30 min · <span data-rel-time="${c.statusUpdatedAt}" data-rel-prefix="updated">${fmt.updated(c.statusUpdatedAt)}</span>`.s;
        } else {
          line.innerHTML = html`Set to <strong>${fmt.statusLabel(c.status).toLowerCase()}</strong> · <span data-rel-time="${c.statusUpdatedAt}" data-rel-prefix="updated">${fmt.updated(c.statusUpdatedAt)}</span>`.s;
        }
      }

      function paintPause() {
        const box = $("[data-pause]", el);
        if (!box) return;
        box.innerHTML = S.isPaused(cafeId)
          ? html`<p class="t-small"><strong>Member cups are paused until ${fmt.time(cafe().pausedUntil)}.</strong> Codes won’t redeem until then.</p>
              <button type="button" class="btn btn--secondary btn--block" data-resume>Take member cups again</button>`.s
          : html`<button type="button" class="btn btn--secondary btn--block" data-pause-now>Pause member cups for ${PAUSE_MINUTES} min</button>
              <p class="t-small t-faint">For a rush. Codes won’t redeem until it ends; you can end it early.</p>`.s;
      }

      /* ---------------------------------------------------------------
         Orders: the pickup queue for this branch
         --------------------------------------------------------------- */
      const STATE_LABEL = { placed: "New", making: "Being made", ready: "Ready" };
      const NEXT_LABEL = { placed: "Start", making: "Ready", ready: "Collected" };
      const DONE_LABEL = { collected: "collected", cancelled: "cancelled by the member", rejected: "rejected" };
      const spaced = (code) => `${code.slice(0, 3)} ${code.slice(3)}`;

      function paintOrdersCount() {
        const n = S.pickupQueue(cafeId).filter((o) => o.status === "placed").length;
        const badge = $("[data-orders-count]", el);
        if (badge) { badge.textContent = n; badge.hidden = !n; }
        const tab = $('[data-section="orders"]', el);
        if (tab) tab.setAttribute("aria-label", n ? `Orders, ${n} new` : "Orders");
      }

      function ticketPayLine(o) {
        if (o.pay === "cup") return o.topUp ? `Member cup. ${fmt.rs(o.topUp)} top-up paid online, nothing to collect.` : "Member cup. Nothing to collect.";
        return `Paid online, ${fmt.rs(o.amount)}. Nothing to collect.`;
      }

      function ticketHtml(o, fresh) {
        const code = S.pickupCode(o);
        const acts = rejecting === o.id
          ? html`<div class="cv-reject" role="group" aria-label="Why can’t you make it?">
              <p class="t-small">Why can’t you make it? ${o.memberName} is told, and ${o.pay === "cup" ? "gets the cup back" : "refunded"}.</p>
              <div class="cv-reject__opts">
                ${Object.entries(store.pickupReasons).map(([id, label]) => html`<button type="button" class="btn btn--secondary" data-reject="${o.id}" data-reason="${id}">${label}</button>`)}
              </div>
              <button type="button" class="btn btn--link" data-reject-keep="${o.id}">Keep the order</button>
            </div>`
          : html`<div class="cv-ticket__acts">
              <button type="button" class="btn btn--primary btn--tall" data-advance="${o.id}">${NEXT_LABEL[o.status]}</button>
              ${o.status !== "ready" ? html`<button type="button" class="btn btn--secondary btn--tall" data-reject-open="${o.id}">Reject</button>` : ""}
            </div>`;
        return html`<li class="cv-ticket${fresh ? " enter" : ""}" data-ticket="${o.id}" data-status="${o.status}" aria-labelledby="tk-${o.id}">
          <div class="cv-ticket__top">
            <span class="cv-ticket__state">${STATE_LABEL[o.status]}</span>
            <span class="badge">${o.pay === "cup" ? "Cup" : "Paid"}</span>
          </div>
          <p class="cv-ticket__name" id="tk-${o.id}">${o.memberName}</p>
          <p class="cv-ticket__drink">${S.pickupDrinkName(o)}</p>
          <dl class="cv-ticket__facts">
            <div><dt>Pickup</dt><dd class="num">${o.asap ? `ASAP · ${fmt.time(o.pickupAt)}` : fmt.time(o.pickupAt)}</dd></div>
            <div><dt>Code</dt><dd class="num cv-ticket__code" aria-label="${code.split("").join(" ")}">${spaced(code)}</dd></div>
            <div><dt>Placed</dt><dd><span data-rel-time="${o.placedAt}">${fmt.ago(o.placedAt)}</span></dd></div>
          </dl>
          <p class="t-small t-muted num">${ticketPayLine(o)}</p>
          <p class="cv-till">Ring it up on your till as: <strong>LCC member</strong> <span class="t-muted num">· Reference ${S.pickupRef(o)}</span></p>
          ${acts}
        </li>`;
      }

      function ordersHtml(freshId) {
        const b = brand();
        const queue = S.pickupQueue(cafeId);
        const done = S.pickupsDoneToday(cafeId).slice(0, 8);
        const off = S.pickupAvailable(cafeId);
        return html`
          <div class="cv-section">
            <div class="cv-section__head">
              <h2 class="cv-title">Orders</h2>
              <p class="t-small t-muted">Pickup orders${b ? ` for ${cafe().branch}` : ""}, oldest first.</p>
            </div>
            ${off.ok ? "" : html`<p class="t-small cv-note">${off.reason === "paused" ? `Member cups are paused, so new orders are off until ${fmt.time(cafe().pausedUntil)}.` : "Closed for today, so no new orders."} Orders already here still need making.</p>`}
            <ol class="cv-tickets" role="list" data-queue>
              ${queue.length ? queue.map((o) => ticketHtml(o, o.id === freshId)) : html`<li class="cv-tickets__empty t-small t-muted">No orders waiting. New ones appear here as members place them.</li>`}
            </ol>
            <section aria-labelledby="done-h">
              <h3 class="eyebrow" id="done-h">Done today</h3>
              <ol class="cv-list" role="list">
                ${done.length ? done.map((o) => html`<li class="cv-row">
                  <span class="cv-row__time num">${fmt.time(o.updatedAt)}</span>
                  <span class="cv-row__main">${o.memberName} <span class="t-faint">· ${S.pickupDrinkName(o)} · ${o.pay === "cup" ? "cup" : fmt.rs(o.amount)} · ${DONE_LABEL[o.status]}${o.status === "rejected" && o.reason ? `, ${(store.pickupReasons[o.reason] || "").toLowerCase()}` : ""}</span></span>
                  <span class="cv-row__ref num">${o.status === "collected" ? S.pickupRef(o) : ""}</span>
                </li>`) : html`<li class="cv-row"><span class="cv-row__main t-muted">Nothing collected yet today.</span></li>`}
              </ol>
            </section>
          </div>`;
      }

      function paintOrders({ freshId = null, focusId = null } = {}) {
        if (section !== "orders") return;
        const panel = $("[data-panel]", el);
        const keep = panel.contains(document.activeElement);
        panel.innerHTML = `<div>${ordersHtml(freshId).s}</div>`;
        const target = focusId && ($(`[data-advance="${focusId}"]`, panel) || $(`[data-reject="${focusId}"]`, panel));
        if (target) target.focus({ preventScroll: true });
        else if (keep) panel.focus({ preventScroll: true });
      }

      function advance(id) {
        const res = A.advancePickup(id);
        if (!res.ok) return paintOrders();
        const o = res.order;
        if (o.status === "collected") ui.toast(`${o.memberName}’s ${S.pickupDrinkName(o)} collected · ${S.pickupRef(o)}. Ring it up as LCC member.`, { duration: 4200 });
        else if (o.status === "ready") ui.toast(`${o.memberName} has been told it’s ready.`);
        paintOrders({ focusId: o.status === "collected" ? null : id });
      }

      /* ---------------------------------------------------------------
         Today
         --------------------------------------------------------------- */
      const scopeToggle = () => (brand()
        ? ui.segmented({ name: "cvscope", label: "Show", value: scope, options: [{ value: "branch", label: "This branch" }, { value: "brand", label: "All branches" }] })
        : "");
      const payRule = () => { const e = brand().economics; return `${Math.round(e.payoutShare * 100)}% of each drink’s price, up to ${fmt.rs(Math.round(e.coverUpTo * e.payoutShare))}`; };

      function todayHtml() {
        const b = brand();
        const all = b && scope === "brand";
        const d = S.cafeDay(cafeId, { scope: all ? "brand" : "branch" });
        const max = Math.max(1, ...d.byHour.map((h) => h.cups));
        const nowHour = new Date().getHours();
        const hourLabel = (h) => fmt.clock(h * 60);
        return html`
          <div class="cv-section">
            <div class="cv-section__head">
              <h2 class="cv-title">Today</h2>
              <p class="t-small t-muted">${fmt.date(Date.now())}${b ? ` · ${all ? `all ${S.branches(b.id).length} branches` : cafe().branch}` : ""}</p>
            </div>
            ${scopeToggle()}
            <dl class="cv-stats">
              <div><dt>Cups redeemed</dt><dd class="num">${d.cups}</dd></div>
              <div><dt>New members</dt><dd class="num">${d.newMembers}</dd></div>
              <div><dt>Returning members</dt><dd class="num">${d.returningMembers}</dd></div>
              <div><dt>Estimated earnings</dt><dd class="num">${fmt.rs(d.earnings)}</dd>${b ? html`<dd class="t-small t-muted num">${fmt.rs(d.topUps)} in top-ups at the till</dd>` : ""}</div>
            </dl>

            <section aria-labelledby="hours-h">
              <h3 class="eyebrow" id="hours-h">Cups by hour</h3>
              <div class="cv-chart" role="img" aria-label="Cups by hour today: ${d.byHour.filter((h) => h.cups).map((h) => `${hourLabel(h.hour)} ${h.cups}`).join(", ") || "none yet"}">
                ${d.byHour.map((h) => html`<div class="cv-chart__col${h.hour === nowHour ? " is-now" : ""}">
                  <span class="cv-chart__bar" style="--h:${(h.cups / max).toFixed(3)}">${h.cups ? html`<span class="cv-chart__n num">${h.cups}</span>` : ""}</span>
                  <span class="cv-chart__label num">${h.hour % 3 === 2 ? hourLabel(h.hour) : ""}</span>
                </div>`)}
              </div>
            </section>

            <section aria-labelledby="list-h">
              <div class="cv-section__bar">
                <h3 class="eyebrow" id="list-h">Every cup today</h3>
                <button type="button" class="btn btn--secondary btn--compact" data-export>Export today (CSV)</button>
              </div>
              ${d.entries.length ? html`<table class="cv-table">
                <thead><tr><th scope="col">Time</th><th scope="col">Member</th>${b ? html`<th scope="col">Drink</th>` : ""}${all ? html`<th scope="col">Branch</th>` : ""}<th scope="col">Reference</th><th scope="col" class="r">Owed to you</th></tr></thead>
                <tbody>${d.entries.map((e) => html`<tr>
                  <td class="num">${fmt.time(e.at)}</td>
                  <td>${firstName(S.member(e.memberId))}${e.firstVisit ? html` <span class="t-faint">· new</span>` : ""}${e.orderId ? html` <span class="t-faint">· pickup</span>` : ""}</td>
                  ${b ? html`<td>${S.entryDrinkName(e)}${e.topUp ? html` <span class="t-faint num">· +${fmt.rs(e.topUp)} top-up${e.topUpOnline ? " paid online" : ""}</span>` : ""}</td>` : ""}
                  ${all ? html`<td>${S.cafe(e.cafeId).short}</td>` : ""}
                  <td class="num">${S.redemptionRef(e)}</td>
                  <td class="num r">${fmt.rs(S.entryPayout(e))}</td>
                </tr>`)}</tbody>
                <tfoot><tr><th scope="row" colspan="${2 + (b ? 1 : 0) + (all ? 1 : 0)}">${b ? `${fmt.cups(d.cups)} · ${payRule()}` : `${fmt.cups(d.cups)} at ${fmt.rs(d.rate)} a cup`}</th><td class="num r">${fmt.rs(d.earnings)}</td></tr></tfoot>
              </table>` : html`<p class="t-small t-muted">No member cups yet today.</p>`}
            </section>
          </div>`;
      }

      /* ---------------------------------------------------------------
         Payouts
         --------------------------------------------------------------- */
      function brandPayoutsHtml() {
        const b = brand();
        const all = scope === "brand";
        const p = S.cafePayouts(cafeId, Date.now(), { scope: all ? "brand" : "branch" });
        const month = (ts) => new Date(ts).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
        return html`
          <div class="cv-section">
            <div class="cv-section__head">
              <h2 class="cv-title">Payouts</h2>
              <p class="t-small t-muted">${month(p.monthStart)} so far · ${all ? `all ${S.branches(b.id).length} branches` : cafe().branch}</p>
            </div>
            ${scopeToggle()}
            ${moneyStats(p, html`${fmt.rs(p.perCup)} a cup on average. ${payRule()}.`)}

            <section aria-labelledby="branches-h">
              <h3 class="eyebrow" id="branches-h">${all ? "By branch" : "This branch"}, ${month(p.monthStart)}</h3>
              <div class="cv-table-wrap"><table class="cv-table">
                <thead><tr><th scope="col">Branch</th><th scope="col" class="r">Cups</th><th scope="col" class="r">From cups</th><th scope="col" class="r">Paid orders</th><th scope="col" class="r">From paid orders</th><th scope="col" class="r">Payout</th></tr></thead>
                <tbody>${p.rows.map((x) => html`<tr${x.cafe.id === cafeId && all ? raw(' class="is-here"') : ""}>
                  <td>${x.cafe.branch}</td><td class="num r">${x.cups}</td><td class="num r">${fmt.rs(x.cupEarned)}</td><td class="num r">${x.paid.count}</td><td class="num r">${fmt.rs(x.paid.net)}</td><td class="num r">${fmt.rs(x.earned)}</td>
                </tr>`)}</tbody>
                ${all ? html`<tfoot><tr><th scope="row">Total</th><td class="num r">${p.cups}</td><td class="num r">${fmt.rs(p.cupEarned)}</td><td class="num r">${p.paid.count}</td><td class="num r">${fmt.rs(p.paid.net)}</td><td class="num r">${fmt.rs(p.earned)}</td></tr></tfoot>` : ""}
              </table></div>
              <p class="t-small t-muted num">Top-ups paid at your till this month: ${fmt.rs(p.topUps)}. They stay with you and aren’t in the payout.</p>
            </section>

            <section aria-labelledby="history-h">
              <div class="cv-section__bar">
                <h3 class="eyebrow" id="history-h">Payout history${all ? ", all branches" : ""}</h3>
                <button type="button" class="btn btn--secondary btn--compact" data-statement>Download statement (PDF)</button>
              </div>
              <table class="cv-table">
                <thead><tr><th scope="col">Month</th><th scope="col" class="r">Cups</th><th scope="col" class="r">Amount</th><th scope="col" class="r">Status</th></tr></thead>
                <tbody>${p.history.map((h) => html`<tr>
                  <td>${month(h.month)}</td><td class="num r">${fmt.num(h.cups)}</td><td class="num r">${fmt.rs(h.amount)}</td>
                  <td class="r"><span class="cv-paid">Paid</span> <span class="t-faint num">${fmt.shortDate(h.paidAt)}</span></td>
                </tr>`)}</tbody>
              </table>
            </section>
            <p class="t-small t-muted">Paid monthly on the ${S.partner(cafeId).payoutDay}th to one ${b.name} account. Cups: ${payRule()}, pickup cups included. Paid orders: what the member paid online, less the ${p.paid.feePct}% LCC fee. Top-ups paid at your till stay with you.</p>
          </div>`;
      }

      /** Cups and paid orders, side by side, then the total and the next payout. */
      function moneyStats(p, cupLine) {
        return html`<dl class="cv-stats">
          <div><dt>Cups</dt><dd class="num">${fmt.rs(p.cupEarned)}</dd><dd class="t-small t-muted num">${fmt.cups(p.cups)} redeemed. ${cupLine}</dd></div>
          <div><dt>Paid orders</dt><dd class="num">${fmt.rs(p.paid.net)}</dd><dd class="t-small t-muted num">${p.paid.count} ${p.paid.count === 1 ? "order" : "orders"}${p.paid.topUps ? ` and ${fmt.rs(p.paid.topUps)} in online top-ups` : ""}: ${fmt.rs(p.paid.gross)}, less the ${p.paid.feePct}% LCC fee (${fmt.rs(p.paid.fee)}).</dd></div>
          <div><dt>Earned so far</dt><dd class="num cv-highlight">${fmt.rs(p.earned)}</dd></div>
          <div><dt>Next payout</dt><dd class="cv-stats__small num">${fmt.shortDate(p.nextAt)}</dd><dd class="t-small t-muted num">${p.account.label} ending ${p.account.last4}</dd></div>
        </dl>`;
      }

      function payoutsHtml() {
        if (brand()) return brandPayoutsHtml();
        const p = S.cafePayouts(cafeId);
        const month = (ts) => new Date(ts).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
        return html`
          <div class="cv-section">
            <div class="cv-section__head">
              <h2 class="cv-title">Payouts</h2>
              <p class="t-small t-muted">${month(p.monthStart)} so far</p>
            </div>
            ${moneyStats(p, html`${fmt.rs(p.rate)} a cup: ${p.share}% of your ${fmt.rs(p.price)} counter price.`)}

            <section aria-labelledby="history-h">
              <div class="cv-section__bar">
                <h3 class="eyebrow" id="history-h">Payout history</h3>
                <button type="button" class="btn btn--secondary btn--compact" data-statement>Download statement (PDF)</button>
              </div>
              ${p.history.length ? html`<table class="cv-table">
                <thead><tr><th scope="col">Month</th><th scope="col" class="r">Cups</th><th scope="col" class="r">Amount</th><th scope="col" class="r">Status</th></tr></thead>
                <tbody>${p.history.map((h) => html`<tr>
                  <td>${month(h.month)}</td>
                  <td class="num r">${h.cups}</td>
                  <td class="num r">${fmt.rs(h.amount)}</td>
                  <td class="r"><span class="cv-paid">Paid</span> <span class="t-faint num">${fmt.shortDate(h.paidAt)}</span></td>
                </tr>`)}</tbody>
              </table>` : html`<p class="t-small t-muted">Your first payout comes on the ${S.partner(cafeId).payoutDay}th of next month.</p>`}
            </section>
            <p class="t-small t-muted">Paid monthly. Cups at the rate you agreed, pickup cups included. Paid orders: what the member paid online, less the ${p.paid.feePct}% LCC fee.</p>
          </div>`;
      }

      /* ---------------------------------------------------------------
         Settings
         --------------------------------------------------------------- */
      function settingsHtml() {
        const p = P();
        const c = cafe();
        return html`
          <div class="cv-section cv-settings">
            <div class="cv-section__head"><h2 class="cv-title">Settings</h2></div>

            ${brand() ? html`<fieldset class="cv-set">
              <legend class="eyebrow">What a member cup covers</legend>
              <p class="t-body num">${S.coversLine(cafeId)}</p>
              <p class="t-small t-muted num">Set by ${brand().name} for every branch. Your counter shows “Collect Rs X top-up” when a drink costs more. Payout: ${payRule()}.</p>
            </fieldset>` : html`<fieldset class="cv-set">
              <legend class="eyebrow">What a member cup covers</legend>
              <div class="cv-checks">
                ${S.drinkCategories().map((k) => html`<label class="cv-check">
                  <input type="checkbox" name="cat" value="${k.id}" ${p.covers.categories.includes(k.id) ? raw("checked") : ""}>
                  <span>${k.name}</span>
                </label>`)}
              </div>
              <div class="cv-inline">
                <label class="field__label" for="cv-size">Size</label>
                <span class="select"><select class="input" id="cv-size" name="size">
                  ${["regular", "any"].map((sz) => html`<option value="${sz}" ${p.covers.size === sz ? raw("selected") : ""}>${sz === "regular" ? "Regular" : "Any size"}</option>`)}
                </select></span>
              </div>
              <label class="cv-check">
                <input type="checkbox" name="extras" ${p.covers.extrasPaid ? raw("checked") : ""}>
                <span>Extras paid at the counter (extra shot, syrup, oat milk)</span>
              </label>
              <p class="t-small t-muted">Your counter shows: “${S.coversLine(cafeId)}”</p>
            </fieldset>`}

            <fieldset class="cv-set">
              <legend class="eyebrow">Limits</legend>
              <div class="cv-limit">
                <div><p class="cv-limit__title">Member cups a day, for the café</p><p class="t-small t-muted">After this, codes stop working here until tomorrow.</p></div>
                ${ui.stepper({ id: "cafePerDay", value: p.limits.cafePerDay, min: 5, max: 200, label: "Member cups a day for the café" })}
              </div>
              <div class="cv-limit">
                <div><p class="cv-limit__title">Cups per member a day</p><p class="t-small t-muted">How many one member can have here in a day.</p></div>
                ${ui.stepper({ id: "perMemberPerDay", value: p.limits.perMemberPerDay, min: 1, max: 4, label: "Cups per member a day" })}
              </div>
            </fieldset>

            <fieldset class="cv-set">
              <legend class="eyebrow">Opening hours</legend>
              <div class="cv-hours">
                <span class="t-body">Every day</span>
                <label class="sr-only" for="cv-open">Opens</label>
                <input class="input num" type="time" id="cv-open" name="open" value="${c.hours.open.padStart(5, "0")}">
                <span class="t-faint">to</span>
                <label class="sr-only" for="cv-close">Closes</label>
                <input class="input num" type="time" id="cv-close" name="close" value="${(c.hours.close === "24:00" ? "00:00" : c.hours.close).padStart(5, "0")}">
              </div>
              <p class="t-small t-muted">Members see “${c.hours.label}” on your page in the app.</p>
            </fieldset>

            <fieldset class="cv-set">
              <legend class="eyebrow">Staff PINs</legend>
              <ul class="cv-list" role="list">
                ${p.staff.map((x) => html`<li class="cv-row">
                  <span class="cv-row__main">${x.name} <span class="t-faint">· ${ROLES[x.role] || x.role}${x.id === p.staffOnShift ? " · on the counter now" : ""}</span></span>
                  <span class="cv-row__ref num" aria-label="PIN hidden">••••</span>
                  <button type="button" class="btn btn--link" data-remove-staff="${x.id}" ${x.id === p.staffOnShift || p.staff.length <= 1 ? raw("disabled") : ""} aria-label="Remove ${x.name}">Remove</button>
                </li>`)}
              </ul>
              <form class="cv-add" data-add-staff novalidate>
                <div class="field"><label class="field__label" for="st-name">Name</label><input class="input" id="st-name" name="name" autocomplete="off"></div>
                <div class="field"><label class="field__label" for="st-role">Role</label><span class="select"><select class="input" id="st-role" name="role"><option value="counter">Counter</option><option value="manager">Manager</option><option value="owner">Owner</option></select></span></div>
                <div class="field"><label class="field__label" for="st-pin">4-digit PIN</label><input class="input num" id="st-pin" name="pin" inputmode="numeric" maxlength="4" autocomplete="off"></div>
                <button type="submit" class="btn btn--secondary">Add</button>
                <p class="cv-error" data-add-err role="alert"></p>
              </form>
            </fieldset>

            <p class="t-small t-faint cv-foot">Works on any phone or tablet. No special hardware. No till integration needed.</p>
          </div>`;
      }

      const saved = (what = "Saved.") => ui.toast(what);

      /* ---------------------------------------------------------------
         Sheets: staff PIN, pairing
         --------------------------------------------------------------- */
      function sheets() {
        return html`
          <div class="sheet sheet--viewport" id="pin-sheet" role="dialog" aria-modal="true" aria-labelledby="pin-title" aria-hidden="true">
            <div class="sheet__scrim" data-sheet-close></div>
            <div class="sheet__panel"><div class="sheet__handle" aria-hidden="true"></div><div class="sheet__body cv-pin" data-pin-body></div></div>
          </div>
          ${LCC.sync ? html`<div class="sheet sheet--viewport" id="pair-sheet" role="dialog" aria-modal="true" aria-labelledby="pair-title" aria-hidden="true">
            <div class="sheet__scrim" data-sheet-close></div>
            <div class="sheet__panel"><div class="sheet__handle" aria-hidden="true"></div><div class="sheet__body pair" data-pair-body></div></div>
          </div>` : ""}`;
      }

      function openPin() {
        pin = "";
        $("[data-pin-body]", el).innerHTML = html`
          <h2 class="cv-title" id="pin-title">Who’s on the counter?</h2>
          <p class="t-small t-muted">Enter your 4-digit PIN.</p>
          <div class="cv-pin__dots" data-pin-dots aria-hidden="true">${[0, 1, 2, 3].map(() => html`<span></span>`)}</div>
          <label class="sr-only" for="pin-input">PIN</label>
          <input class="sr-only" id="pin-input" inputmode="numeric" maxlength="4" autocomplete="off" data-pin-input>
          <p class="cv-error" data-pin-err role="alert"></p>
          <div class="cv-pad" role="group" aria-label="Keypad">
            ${["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((k) => k === ""
              ? html`<span></span>`
              : html`<button type="button" class="cv-pad__key" data-key="${k}" aria-label="${k === "del" ? "Delete" : k}">${k === "del" ? icon("arrowLeft", { size: 22 }) : k}</button>`)}
          </div>`.s;
        ui.openSheet($("#pin-sheet", el));
      }
      function paintPin(err = "") {
        $$("[data-pin-dots] span", el).forEach((d, i) => d.classList.toggle("is-on", i < pin.length));
        $("[data-pin-err]", el).textContent = err;
        const inp = $("[data-pin-input]", el);
        if (inp && inp.value !== pin) inp.value = pin;
      }
      function tryPin() {
        const res = A.signInStaff(cafeId, pin);
        if (res.ok) { ui.closeSheet($("#pin-sheet", el)); ui.toast(`${res.staff.name} is on the counter.`); }
        else { pin = ""; paintPin("That PIN doesn’t match. Try again."); }
      }
      function pressKey(k) {
        if (k === "del") pin = pin.slice(0, -1);
        else if (pin.length < 4) pin += k;
        paintPin();
        if (pin.length === 4) tryPin();
      }

      function openPair() {
        const url = LCC.sync.pairUrl();
        const local = !location.href.startsWith(LCC.sync.liveUrl);
        $("[data-pair-body]", el).innerHTML = html`
          <h2 class="cv-title" id="pair-title">Pair a phone</h2>
          <p class="t-small t-muted">Scan with the phone’s camera. It opens Mumtaz’s pass in this room, and cups redeemed here come off it live.</p>
          <div class="qr pair__qr" role="img" aria-label="QR code for the pairing link">${raw(ui.qrSvg(url, { fallback: "QR unavailable offline. Type the link below on the phone." }))}</div>
          <p class="pair__room"><span class="t-micro t-faint">Room</span><span class="num">${LCC.sync.room}</span></p>
          <p class="t-micro t-faint pair__url">${url}</p>
          ${local ? html`<p class="t-small t-faint pair__note">The phone opens the live site. It stays in sync with this window while both are online.</p>` : ""}
          <button type="button" class="btn btn--primary btn--block" data-sheet-close>Done</button>`.s;
        ui.openSheet($("#pair-sheet", el));
      }

      /* ---------------------------------------------------------------
         Events
         --------------------------------------------------------------- */
      const onClick = (e) => {
        const t = e.target;
        const tab = t.closest("[data-section]");
        if (tab) return showSection(tab.dataset.section);
        const busy = t.closest("[data-busy-option]");
        if (busy) return A.setBusyMode(cafeId, busy.dataset.busyOption);
        const tseg = t.closest('[data-segmented="cvtemp"] .segmented__option');
        if (tseg) { ui.selectSegment(tseg.parentElement, tseg.dataset.value); r.drink = { ...r.drink, temp: tseg.dataset.value, fromApp: false }; return paintDrink({ temp: false }); }
        const sseg = t.closest('[data-segmented="cvscope"] .segmented__option');
        if (sseg) { if (scope === sseg.dataset.value) return; scope = sseg.dataset.value; paintSection(); return $(`[data-segmented="cvscope"] [data-value="${scope}"]`, el)?.focus(); }
        const adv = t.closest("[data-advance]");
        if (adv) return advance(adv.dataset.advance);
        const ro = t.closest("[data-reject-open]");
        if (ro) { rejecting = ro.dataset.rejectOpen; paintOrders(); return $(`[data-reject="${rejecting}"]`, el)?.focus(); }
        const rk = t.closest("[data-reject-keep]");
        if (rk) { rejecting = null; return paintOrders({ focusId: rk.dataset.rejectKeep }); }
        const rj = t.closest("[data-reject]");
        if (rj) {
          rejecting = null;
          const res = A.rejectPickup(rj.dataset.reject, rj.dataset.reason);
          if (res.ok) ui.toast(`Order rejected. ${res.order.memberName} has been told${res.order.pay === "cup" ? " and has the cup back" : " and will be refunded"}.`, { duration: 4200 });
          return paintOrders();
        }
        if (t.closest("[data-sim-scan]")) return simulateScan(t.closest("[data-sim-scan]"));
        if (t.closest("[data-redeem]")) return redeemNow();
        if (t.closest("[data-reset]")) return reset();
        if (t.closest("[data-pause-now]")) { A.pauseMemberCups(cafeId, PAUSE_MINUTES); return ui.toast(`Member cups paused until ${fmt.time(cafe().pausedUntil)}.`); }
        if (t.closest("[data-resume]")) { A.pauseMemberCups(cafeId, 0); return ui.toast("Taking member cups again."); }
        if (t.closest("[data-staff]")) return openPin();
        const key = t.closest("[data-key]");
        if (key) return pressKey(key.dataset.key);
        if (t.closest("[data-pair]")) return openPair();
        if (t.closest("[data-export]")) {
          // BACKEND: GET /cafes/:id/day.csv
          const d = S.cafeDay(cafeId);
          return ui.toast(`${cafeSlug(cafe())}-${isoDay(Date.now())}.csv: ${fmt.cups(d.cups)}, ${fmt.rs(d.earnings)}. Prototype: no file saved.`, { duration: 4200 });
        }
        if (t.closest("[data-statement]")) {
          // BACKEND: GET /cafes/:id/statements/:month.pdf
          return ui.toast("Statement for the last 3 months is ready. Prototype: no file saved.", { duration: 4200 });
        }
        const step = t.closest("[data-stepper] [data-step]");
        if (step) {
          const st = step.closest("[data-stepper]");
          const id = st.dataset.stepper;
          const min = Number(st.dataset.min), max = Number(st.dataset.max);
          const by = id === "cafePerDay" ? 5 : 1;
          const next = Math.max(min, Math.min(max, P().limits[id] + Number(step.dataset.step) * by));
          A.updatePartner(cafeId, { limits: { [id]: next } });
          ui.setStepper(st, next);
          return;
        }
        const rm = t.closest("[data-remove-staff]");
        if (rm) {
          const name = P().staff.find((x) => x.id === rm.dataset.removeStaff)?.name;
          if (A.removeStaff(cafeId, rm.dataset.removeStaff).ok) { paintSection(); saved(`${name} removed.`); }
        }
      };

      const onInput = (e) => {
        const t = e.target;
        if (t.id === "member-code") {
          const digits = t.value.replace(/\D/g, "").slice(0, 6);
          if (t.value !== digits) t.value = digits;
          r.code = digits;
          const field = t.closest(".field");
          if (field.dataset.invalid === "true") { field.dataset.invalid = "false"; t.setAttribute("aria-invalid", "false"); r.state = "idle"; }
          if (digits.length === 6) check(digits);
          return;
        }
        if (t.matches("[data-pin-input]")) {
          pin = t.value.replace(/\D/g, "").slice(0, 4);
          paintPin();
          if (pin.length === 4) tryPin();
          return;
        }
        if (t.id === "st-pin") t.value = t.value.replace(/\D/g, "").slice(0, 4);
      };

      const onChange = (e) => {
        const t = e.target;
        if (t.matches("[data-viewing]") || t.matches("[data-branch]")) return A.setPartnerCafe(t.value);
        if (t.matches("[data-cv-drink]")) {
          const item = S.menuItem(brand().id, t.value);
          r.drink = { ...r.drink, drinkId: t.value, temp: S.servedTemp(item, r.drink.temp), fromApp: false };
          return paintDrink();
        }
        if (t.name === "cat") {
          const cats = $$('input[name="cat"]:checked', el).map((x) => x.value);
          if (!cats.length) { t.checked = true; return ui.toast("A member cup needs to cover at least one kind of drink.", { iconName: "info" }); }
          A.updatePartner(cafeId, { covers: { categories: cats } }); paintSection(); return saved();
        }
        if (t.name === "size") { A.updatePartner(cafeId, { covers: { size: t.value } }); paintSection(); return saved(); }
        if (t.name === "extras") { A.updatePartner(cafeId, { covers: { extrasPaid: t.checked } }); paintSection(); return saved(); }
        if (t.name === "open" || t.name === "close") {
          const open = $("#cv-open", el).value, close = $("#cv-close", el).value;
          if (!open || !close) return;
          A.setCafeHours(cafeId, open.replace(/^0(\d)/, "$1"), close === "00:00" ? "24:00" : close.replace(/^0(\d)/, "$1"));
          paintSection(); return saved("Hours saved.");
        }
      };

      const onSubmit = (e) => {
        if (e.target.matches("[data-code-form]")) {
          e.preventDefault();
          const code = $("#member-code", el).value.replace(/\D/g, "");
          if (code.length !== 6) {
            r = { ...freshRedeem(), state: "error", code, message: code.length ? `That’s ${code.length} digit${code.length === 1 ? "" : "s"}. Member codes have six.` : "Enter the six-digit code from the member’s pass." };
            return paintRedeem({ focus: true });
          }
          return check(code);
        }
        if (e.target.matches("[data-add-staff]")) {
          e.preventDefault();
          const f = e.target;
          const name = f.elements.name.value.trim(), role = f.elements.role.value, p = f.elements.pin.value;
          const err = !name ? "Add a name." : !/^\d{4}$/.test(p) ? "PINs are four digits." : "";
          if (err) { $("[data-add-err]", el).textContent = err; return; }
          const res = A.addStaff(cafeId, { name, role, pin: p });
          if (!res.ok) { $("[data-add-err]", el).textContent = res.message; return; }
          paintSection();
          saved(`${name} added. Their PIN works on the counter now.`);
        }
      };

      // Arrow keys: section tabs and the busy radio group
      const onKeydown = (e) => {
        const tab = e.target.closest?.("[data-section]");
        const opt = e.target.closest?.("[data-busy-option]");
        if (!tab && !opt) return;
        const ids = tab ? SECTIONS.map((x) => x.id) : BUSY.map((x) => x.id);
        let i = ids.indexOf(tab ? tab.dataset.section : opt.dataset.busyOption);
        const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
        if (e.key in keys) i = (i + keys[e.key] + ids.length) % ids.length;
        else if (e.key === "Home") i = 0;
        else if (e.key === "End") i = ids.length - 1;
        else return;
        e.preventDefault();
        if (tab) { showSection(ids[i]); $(`[data-section="${ids[i]}"]`, el).focus(); }
        else { A.setBusyMode(cafeId, ids[i]); $(`[data-busy-option="${ids[i]}"]`, el).focus(); }
      };

      el.addEventListener("click", onClick);
      el.addEventListener("input", onInput);
      el.addEventListener("change", onChange);
      el.addEventListener("submit", onSubmit);
      el.addEventListener("keydown", onKeydown);

      const offs = [
        store.on("cafe:status", ({ cafeId: id }) => { if (id === cafeId) paintBusy(); }),
        store.on("cafe:pause", ({ cafeId: id }) => {
          if (id !== cafeId) return;
          wasPaused = S.isPaused(cafeId);
          paintHead(); paintPause();
          if (section === "orders") paintOrders();
          if (r.state === "found") check(r.code, { focus: false });
        }),
        store.on("redeem", ({ entry }) => {
          if (entry.cafeId !== cafeId) {
            // Another branch of this brand: the all-branches views and brand-wide cups change
            if (!brand() || entry.brandId !== brand().id) return;
            if (scope === "brand" && (section === "today" || section === "payouts")) paintSection();
            if (r.state === "found" && r.lookup.member.id === entry.memberId) check(r.code, { focus: false });
            return;
          }
          A.refreshAutoBusy(cafeId);
          paintBusy();   // the cup count in the busy line, even if the level holds
          paintRecent(entry.id);
          if (section === "today" || section === "payouts") paintSection();
          // Another window redeemed for the member on screen: refresh their numbers
          if (r.state === "found" && r.lookup.member.id === entry.memberId) check(r.code, { focus: false });
        }),
        // Pickup orders from phones (or another café window)
        store.on("pickup", ({ order, prev, quiet }) => {
          if (order.cafeId !== cafeId) return;
          paintOrdersCount();
          if (section === "orders") paintOrders({ freshId: !prev ? order.id : null, focusId: el.contains(document.activeElement) && document.activeElement.dataset?.advance === order.id ? order.id : null });
          else if (section === "payouts" && order.status === "collected") paintSection();
          if (quiet) return;
          const name = S.pickupDrinkName(order);
          if (!prev && order.status === "placed") ui.toast(`New pickup order: ${order.memberName}, ${name}.`, { iconName: "clock", duration: 4200 });
          else if (order.status === "cancelled") ui.toast(`${order.memberName} cancelled their ${name}.`, { iconName: "info" });
        }),
        store.on("partner:settings", ({ cafeId: id }) => { if (id === cafeId) { paintHead(); if (r.state === "found") check(r.code, { focus: false }); } }),
        store.on("cafe:viewing", ({ cafeId: id }) => {
          cafeId = id;
          clearTimeout(resetTimer); clearTimeout(scanTimer);
          r = freshRedeem();
          rejecting = null;
          A.refreshAutoBusy(cafeId);
          renderAll();
          $("[data-viewing]", el)?.focus();
        }),
        store.on("tick", () => {
          A.refreshAutoBusy(cafeId);  // cups age out of the 30-minute window
          paintHead(); paintBusy();
          const paused = S.isPaused(cafeId);
          if (paused !== wasPaused) { wasPaused = paused; paintPause(); if (section === "orders") paintOrders(); }
        }),
        // A plan bought or switched (here or on a phone) changes reserved cups
        store.on("plan", () => { if (r.state === "found") check(r.code, { focus: false }); }),
        // The member picked (or changed) a drink on their phone while the counter has them up
        store.on("order", ({ memberId }) => {
          if (r.state !== "found" || !brand() || r.lookup.member.id !== memberId) return;
          r.drink = { ...drinkFor(r.lookup.member), memberId };
          const sel = $("[data-cv-drink]", el); if (sel) sel.value = r.drink.drinkId;
          paintDrink();
        }),
        // A device that joined the room was filled in by another café window
        store.on("snapshot", () => { renderAll(); }),
      ];

      /* Keep the counter tablet awake during service, but only when the café
         view runs as an installed app. Released when hidden; asked for again
         when the app comes back. Fails silently where unsupported. */
      const installed = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
      let wakeLock = null;
      async function keepAwake() {
        if (!installed() || !("wakeLock" in navigator) || document.visibilityState !== "visible" || wakeLock) return;
        try {
          wakeLock = await navigator.wakeLock.request("screen");
          wakeLock.addEventListener("release", () => { wakeLock = null; });
        } catch (_) { wakeLock = null; /* low battery, not allowed, or not supported */ }
      }
      const onVisible = () => { if (document.visibilityState === "visible") keepAwake(); };
      document.addEventListener("visibilitychange", onVisible);
      keepAwake();

      A.refreshAutoBusy(cafeId);
      renderAll();

      return () => {
        document.removeEventListener("visibilitychange", onVisible);
        if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
        clearTimeout(resetTimer); clearTimeout(scanTimer);
        offs.forEach((off) => off());
        el.removeEventListener("click", onClick);
        el.removeEventListener("input", onInput);
        el.removeEventListener("change", onChange);
        el.removeEventListener("submit", onSubmit);
        el.removeEventListener("keydown", onKeydown);
      };
    },
  });
})();
