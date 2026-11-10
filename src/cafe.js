/* =====================================================================
   Lahore Coffee Club — cafe.js
   Café partner view (#/cafe). Used by a busy barista with one hand:
   big targets, little reading. Replaces the Pass 1 shell in router.js.

   Reads and writes the shared store, so a redemption here updates the
   member’s cups everywhere, and a status change here updates the map.
   ===================================================================== */
(function () {
  "use strict";
  const LCC = window.LCC;
  const { store, fmt, ui } = LCC;
  const { html, raw, $, $$, icon } = ui;

  const STATUS_HINTS = { quiet: "Walk right in", moderate: "Short wait", packed: "Expect a queue" };
  const RESET_AFTER_MS = 5000;
  const RECENT_LIMIT = 6;

  LCC.router.register("cafe", {
    title: "Café view",
    mount(el) {
      let cafeId = store.getState().partnerCafeId;
      // Redeem panel state: idle | error | found | success
      let r = freshRedeem();
      let resetTimer = null;
      let scanTimer = null;

      function freshRedeem() {
        return { state: "idle", code: "", message: "", lookup: null, drinkId: null, result: null };
      }
      const cafe = () => store.select.cafe(cafeId);
      const oneCupDrinks = () => cafe().drinks.filter((d) => d.credits === 1);

      /* ---------------------------------------------------------------
         Shell
         --------------------------------------------------------------- */
      function renderAll() {
        const c = cafe();
        const area = store.select.area(c.area);
        const open = store.select.openState(c);
        el.innerHTML = html`
          <div class="surface cafe">
            <header class="cafe-header">
              <div class="stack" style="--stack-gap:var(--space-2)">
                <p class="eyebrow">Partner view</p>
                <h1 class="t-h1">${c.name}</h1>
                <p class="t-small t-muted">${area.name} · ${fmt.date(Date.now())}</p>
              </div>
              <div class="cafe-header__aside">
                <label class="viewing-as">
                  <span class="t-micro t-faint">Viewing as</span>
                  <span class="select">
                    <select class="input" data-viewing>
                      ${store.select.cafes().map((x) => html`<option value="${x.id}" ${x.id === cafeId ? raw("selected") : ""}>${x.name}</option>`)}
                    </select>
                  </span>
                </label>
                <span class="open-indicator" data-open-indicator data-open="${open.open}">${open.label}</span>
              </div>
            </header>
            ${LCC.sync ? pairBar() : ""}

            <div class="cafe-grid">
              <section class="card" aria-labelledby="redeem-h">
                <div class="panel-title"><h2 class="eyebrow" id="redeem-h">Redeem a cup</h2></div>
                <div data-redeem-body></div>
              </section>

              <div class="cafe-grid__side">
                <section class="card" aria-labelledby="busy-h">
                  <div class="panel-title"><h2 class="eyebrow" id="busy-h">How busy are you?</h2></div>
                  ${busyControl()}
                  <p class="t-small t-faint busy-updated" data-busy-updated data-rel-time="${c.statusUpdatedAt}" data-rel-prefix="Updated">Updated ${fmt.ago(c.statusUpdatedAt)}</p>
                </section>

                <section class="card" aria-labelledby="today-h">
                  <div class="panel-title"><h2 class="eyebrow" id="today-h">Today</h2></div>
                  <dl class="today-stats">
                    <div><dt>Redemptions</dt><dd class="t-h1 num" data-stat="redemptions" data-value="0">0</dd></div>
                    <div><dt>New customers</dt><dd class="t-h1 num" data-stat="new" data-value="0">0</dd></div>
                    <div class="today-stats__wide">
                      <dt>Payout today</dt>
                      <dd class="t-h1 num" data-stat="payout" data-value="0">${fmt.rs(0)}</dd>
                      <dd class="t-small t-faint num" data-payout-meta></dd>
                    </div>
                  </dl>
                  <hr class="divider" style="margin-block:var(--space-5) var(--space-3)">
                  <h3 class="eyebrow">This month</h3>
                  <dl class="month-stats" data-month>
                    <div><dt>Cups reserved here</dt><dd class="t-h3 num" data-month-stat="reserved">0</dd><dd class="t-small t-faint num" data-month-stat="reservers"></dd></div>
                    <div><dt>Cups redeemed so far</dt><dd class="t-h3 num" data-month-stat="redeemed">0</dd></div>
                    <div class="month-stats__wide"><dt>Payout so far</dt><dd class="t-h3 num" data-stat="month" data-value="0">${fmt.rs(0)}</dd><dd class="t-small t-faint num" data-month-meta></dd></div>
                  </dl>
                  <hr class="divider" style="margin-block:var(--space-5) var(--space-3)">
                  <h3 class="eyebrow">Recent redemptions</h3>
                  <ol class="recent" role="list" data-recent aria-live="polite"></ol>
                  <p class="t-small t-faint" data-recent-more></p>
                </section>
              </div>
            </div>

            <p class="t-small t-faint" style="margin-top:var(--space-6)">Works on any phone or tablet. No special hardware.</p>
          </div>
          ${LCC.sync ? pairSheet() : ""}`;
        paintRedeem();
        paintToday();
      }

      /* ---------------------------------------------------------------
         Pairing: show a QR of the member pass in this sync room
         --------------------------------------------------------------- */
      function pairBar() {
        return html`<div class="pair-bar">
          ${LCC.sync.pill()}
          <span class="t-small t-faint num">Room ${LCC.sync.room}</span>
          <button type="button" class="btn btn--secondary btn--compact" data-pair>Pair a phone</button>
        </div>`;
      }

      function pairSheet() {
        return html`<div class="sheet sheet--viewport" id="pair-sheet" role="dialog" aria-modal="true" aria-labelledby="pair-title" aria-hidden="true">
          <div class="sheet__scrim" data-sheet-close></div>
          <div class="sheet__panel">
            <div class="sheet__handle" aria-hidden="true"></div>
            <div class="sheet__body pair" data-pair-body></div>
          </div>
        </div>`;
      }

      function openPair() {
        const url = LCC.sync.pairUrl();
        const local = !location.href.startsWith(LCC.sync.liveUrl);
        $("[data-pair-body]", el).innerHTML = html`
          <h2 class="t-h2" id="pair-title">Pair a phone</h2>
          <p class="t-small t-muted">Scan with the phone’s camera. It opens Mumtaz’s pass in this room, and redemptions here show up there live.</p>
          <div class="qr pair__qr" role="img" aria-label="QR code for the pairing link">${raw(ui.qrSvg(url, { fallback: "QR unavailable offline. Type the link below on the phone." }))}</div>
          <p class="pair__room"><span class="t-micro t-faint">Room</span><span class="num">${LCC.sync.room}</span></p>
          <p class="t-micro t-faint pair__url">${url}</p>
          ${local ? html`<p class="t-small t-faint pair__note">The phone opens the live site. It stays in sync with this window while both are online.</p>` : ""}
          <button type="button" class="btn btn--primary btn--block" data-sheet-close>Done</button>`.s;
        ui.openSheet($("#pair-sheet", el));
      }

      /* ---------------------------------------------------------------
         Redeem panel
         --------------------------------------------------------------- */
      function paintRedeem({ focus = false } = {}) {
        const body = $("[data-redeem-body]", el);
        if (!body) return;

        if (r.state === "idle" || r.state === "error") {
          const invalid = r.state === "error";
          body.innerHTML = html`
            <form class="stack" style="--stack-gap:var(--space-4)" data-code-form novalidate>
              <div class="field" data-invalid="${invalid}">
                <label class="field__label" for="member-code">Member code</label>
                <input class="input code-input" id="member-code" name="code" value="${r.code}"
                  inputmode="numeric" autocomplete="off" maxlength="6" placeholder="000000"
                  aria-describedby="member-code-hint member-code-err" aria-invalid="${invalid}">
                <p class="field__hint" id="member-code-hint">Six digits, under the QR on the member’s pass.</p>
                <p class="field__error" id="member-code-err" role="alert">${r.message}</p>
              </div>
              <div class="redeem-actions">
                <button type="submit" class="btn btn--primary">Check code</button>
                <button type="button" class="btn btn--secondary" data-sim-scan>Simulate scan</button>
              </div>
            </form>`;
          if (focus) { const input = $("#member-code", body); input.focus(); if (invalid) input.select(); }
          return;
        }

        if (r.state === "found") {
          const { member, usedToday, dailyLimit, here, left } = r.lookup;
          const plan = store.select.memberPlan(member);
          // What they can have HERE, and why: Explorer cap or My cafés reservation
          const hereWhy = here.bonus ? "free, from the club"
            : here.type === "mycafes"
            ? `${here.left} of ${here.reserved} reserved here`
            : `${Math.max(0, here.cap - here.used)} of ${here.cap} left here this month`;
          const name = [member.firstName, member.lastName].filter(Boolean).join(" ");
          // Who they are in the club, so the barista can greet them properly
          const club = member.memberNo != null ? store.select.club(member.id) : null;
          const clubLine = club ? [club.number, club.founding && "Founding Member", club.level.id !== "member" && club.level.name].filter(Boolean).join(" · ") : "";
          const perks = club ? store.select.perksAt(member.id, cafeId) : [];
          body.innerHTML = html`
            <div class="stack enter" style="--stack-gap:var(--space-5)">
              <div class="member-head">
                <div class="stack" style="--stack-gap:var(--space-1)">
                  ${clubLine ? html`<p class="member-club num">${clubLine}</p>` : ""}
                  <p class="t-h2" id="member-name">${name}</p>
                  <p class="t-small t-muted">${plan.type === "explorer" ? `Explorer · ${plan.name}` : "My cafés"} · ${fmt.cups(plan.cups)} a month</p>
                </div>
                <span class="badge badge--accent">Valid pass</span>
              </div>
              ${perks.length ? html`<div class="member-perks" role="note" aria-label="Perks to offer">
                <p class="eyebrow">Perk to offer</p>
                <ul role="list">${perks.map((p) => html`<li>${p.text}<span class="t-faint"> · for ${p.audience}</span></li>`)}</ul>
              </div>` : ""}
              <dl class="member-stats">
                <div class="member-stats__wide"><dt>Can have here</dt><dd class="t-h1 num" data-here>${here.left} <span class="t-small t-muted">${hereWhy}</span></dd></div>
                <div><dt>Cups left in plan</dt><dd class="t-h3 num">${left}</dd></div>
                <div><dt>Here today</dt><dd class="t-h3 num">${usedToday} <span class="t-small t-faint">of ${dailyLimit}</span></dd></div>
              </dl>
              <fieldset style="border:0;padding:0">
                <legend class="field__label" style="margin-bottom:var(--space-3)">Drink</legend>
                <div class="cluster" style="--cluster-gap:var(--space-2)">
                  ${oneCupDrinks().map((d) => html`<button type="button" class="chip" data-drink="${d.id}" aria-pressed="${d.id === r.drinkId}">${d.name}</button>`)}
                </div>
              </fieldset>
              <button type="button" class="btn btn--primary btn--block btn--tall" data-redeem aria-describedby="member-name">Redeem 1 cup</button>
              <button type="button" class="btn btn--link" data-reset style="justify-self:start">Not ${member.firstName}? Enter another code</button>
            </div>`;
          if (focus) $("[data-redeem]", body).focus();
          return;
        }

        if (r.state === "success") {
          const { member, entry, before, here } = r.result;
          const left = store.select.balance(member.id).left;
          const hereLine = entry.bonus ? "That was a free cup from the club." : here.type === "mycafes" ? `${here.left} of ${here.reserved} reserved here are left.` : `${Math.max(0, here.cap - here.used)} of ${here.cap} left here this month.`;
          const drink = store.select.drink(cafeId, entry.drinkId);
          body.innerHTML = html`
            <div class="redeem-success" role="status">
              <svg class="check-draw" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" pathLength="1"/><path d="M15 24.5l6 6 12-13" pathLength="1"/></svg>
              <p class="t-h2">Cup redeemed.</p>
              <p class="t-body t-muted">${member.firstName} has <span class="num" style="color:var(--ink);font-weight:500" data-cups-left data-value="${before}">${before}</span> ${raw(`<span data-cups-word>${before === 1 ? "cup" : "cups"}</span>`)} left this month.</p>
              <p class="t-small t-muted num" data-success-here>${hereLine}</p>
              <p class="t-small t-faint">${drink ? drink.name : "1 cup"} · ${fmt.time(entry.at)}</p>
              <button type="button" class="btn btn--secondary" data-reset style="margin-top:var(--space-3)">Next customer</button>
            </div>`;
          const cups = $("[data-cups-left]", body);
          const word = $("[data-cups-word]", body);
          setTimeout(() => {
            ui.animateNumber(cups, left, { duration: 600 });
            word.textContent = left === 1 ? "cup" : "cups";
          }, ui.reducedMotion() ? 0 : 450);
          if (focus) $("[data-reset]", body).focus({ preventScroll: true });
        }
      }

      function check(code, { focus = true } = {}) {
        r.code = code;
        const res = store.lookupCode(code, cafeId, 1);
        if (res.ok) {
          r = { ...freshRedeem(), state: "found", code, lookup: res, drinkId: oneCupDrinks()[0]?.id };
        } else {
          r = { ...freshRedeem(), state: "error", code, message: res.message };
        }
        paintRedeem({ focus });
      }

      function redeemNow() {
        const before = r.lookup.left;
        const res = store.actions.redeem({ code: r.code, cafeId, drinkId: r.drinkId });
        if (!res.ok) {
          // e.g. the code expired while the barista was choosing a drink
          r = { ...freshRedeem(), state: "error", code: r.code, message: res.message };
          paintRedeem({ focus: true });
          return;
        }
        r = { ...freshRedeem(), state: "success", result: { member: res.member, entry: res.entry, before, here: res.here } };
        paintRedeem({ focus: true });
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => reset({ focus: el.contains(document.activeElement) }), RESET_AFTER_MS);
      }

      function reset({ focus = true } = {}) {
        clearTimeout(resetTimer);
        clearTimeout(scanTimer);
        r = freshRedeem();
        paintRedeem({ focus });
      }

      function simulateScan(btn) {
        // BACKEND: a real scan decodes the QR payload (LCC1:<member>:<code>) on device
        btn.disabled = true;
        btn.textContent = "Scanning…";
        clearTimeout(scanTimer);
        scanTimer = setTimeout(() => check(store.select.pass(store.getState().memberId).code), 600);
      }

      /* ---------------------------------------------------------------
         Busy status
         --------------------------------------------------------------- */
      function busyControl() {
        const current = cafe().status;
        const index = store.statuses.indexOf(current);
        return html`
          <div class="busy" role="radiogroup" aria-labelledby="busy-h" style="--index:${index}" data-busy>
            <span class="busy__thumb" aria-hidden="true"></span>
            ${store.statuses.map((s) => html`
              <button type="button" role="radio" class="busy__option" data-busy-option="${s}"
                aria-checked="${s === current}" tabindex="${s === current ? 0 : -1}">
                ${ui.cupIcon(s, { size: 32, cls: "busy__icon" })}
                <span class="busy__label">${fmt.statusLabel(s)}</span>
                <span class="busy__hint">${STATUS_HINTS[s]}</span>
              </button>`)}
          </div>`;
      }

      function paintBusy() {
        const group = $("[data-busy]", el);
        if (!group) return;
        const c = cafe();
        group.style.setProperty("--index", store.statuses.indexOf(c.status));
        $$("[data-busy-option]", group).forEach((b) => {
          const on = b.dataset.busyOption === c.status;
          b.setAttribute("aria-checked", on);
          b.tabIndex = on ? 0 : -1;
        });
        const upd = $("[data-busy-updated]", el);
        upd.dataset.relTime = c.statusUpdatedAt;
        upd.textContent = `Updated ${fmt.ago(c.statusUpdatedAt)}`;
      }

      function setBusy(status) {
        // store.actions.setCafeStatus carries the // BACKEND: PATCH /cafes/:id/status seam
        store.actions.setCafeStatus(cafeId, status);
      }

      /* ---------------------------------------------------------------
         Today
         --------------------------------------------------------------- */
      function paintToday(newEntryId) {
        // BACKEND: GET /cafes/:id/summary?date=today
        const s = store.select.cafeSummary(cafeId);
        ui.animateNumber($('[data-stat="redemptions"]', el), s.redemptionsToday);
        ui.animateNumber($('[data-stat="new"]', el), s.newCustomersToday);
        ui.animateNumber($('[data-stat="payout"]', el), s.payoutToday, { format: fmt.rs, duration: 700 });
        ui.animateNumber($('[data-stat="month"]', el), s.payoutMonth, { format: fmt.rs, duration: 700 });
        $("[data-payout-meta]", el).textContent = `${fmt.cups(s.cupsToday)} × ${fmt.rs(s.payoutPerCup)}, your rate per cup`;
        // BACKEND: the monthly statement (reserved cups from subscriptions, redeemed cups from the ledger)
        $('[data-month-stat="reserved"]', el).textContent = fmt.num(s.reservedCups);
        $('[data-month-stat="reservers"]', el).textContent = s.reservedMembers ? `by ${s.reservedMembers} My cafés ${s.reservedMembers === 1 ? "member" : "members"}` : "No My cafés members yet";
        $('[data-month-stat="redeemed"]', el).textContent = fmt.num(s.monthCups);
        $("[data-month-meta]", el).textContent = `${fmt.cups(s.monthCups)} × ${fmt.rs(s.payoutPerCup)}, paid on the 1st`;

        const list = $("[data-recent]", el);
        const shown = s.today.slice(0, RECENT_LIMIT);
        list.innerHTML = shown.length
          ? html`${shown.map((e) => {
              const m = store.select.member(e.memberId);
              const d = store.select.drink(cafeId, e.drinkId);
              return html`<li class="row${e.id === newEntryId ? " enter" : ""}">
                <span class="row__trail num">${fmt.time(e.at)}</span>
                <div class="row__main">
                  <div class="row__title">${d ? d.name : "Coffee"}</div>
                  <div class="row__meta">${m ? m.firstName : "Member"}${e.firstVisit ? " · first visit" : ""}</div>
                </div>
                <span class="badge">${fmt.cups(e.credits)}</span>
              </li>`;
            })}`.s
          : html`<li class="row"><div class="row__main row__meta">No cups redeemed yet today.</div></li>`.s;
        const more = s.today.length - shown.length;
        $("[data-recent-more]", el).textContent = more > 0 ? `And ${more} earlier today.` : "";
      }

      function paintOpen() {
        const ind = $("[data-open-indicator]", el);
        if (!ind) return;
        const open = store.select.openState(cafe());
        ind.dataset.open = open.open;
        ind.textContent = open.label;
      }

      /* ---------------------------------------------------------------
         Events
         --------------------------------------------------------------- */
      const onClick = (e) => {
        const t = e.target;
        const opt = t.closest("[data-busy-option]");
        if (opt) return setBusy(opt.dataset.busyOption);
        if (t.closest("[data-sim-scan]")) return simulateScan(t.closest("[data-sim-scan]"));
        if (t.closest("[data-redeem]")) return redeemNow();
        if (t.closest("[data-reset]")) return reset();
        if (t.closest("[data-pair]")) return openPair();
        const drink = t.closest("[data-drink]");
        if (drink) {
          r.drinkId = drink.dataset.drink;
          $$("[data-drink]", el).forEach((b) => b.setAttribute("aria-pressed", b === drink));
        }
      };

      const onInput = (e) => {
        if (e.target.id !== "member-code") return;
        const input = e.target;
        const digits = input.value.replace(/\D/g, "").slice(0, 6);
        if (input.value !== digits) input.value = digits;
        r.code = digits;
        // Clear the error as soon as they start correcting
        const field = input.closest(".field");
        if (field.dataset.invalid === "true") { field.dataset.invalid = "false"; input.setAttribute("aria-invalid", "false"); r.state = "idle"; }
        if (digits.length === 6) check(digits);
      };

      const onSubmit = (e) => {
        if (!e.target.matches("[data-code-form]")) return;
        e.preventDefault();
        const code = $("#member-code", el).value.replace(/\D/g, "");
        if (code.length !== 6) {
          r = { ...freshRedeem(), state: "error", code, message: code.length ? `That’s ${code.length} digit${code.length === 1 ? "" : "s"}. Member codes have six.` : "Enter the six-digit code from the member’s pass." };
          paintRedeem({ focus: true });
          return;
        }
        check(code);
      };

      const onChange = (e) => {
        if (e.target.matches("[data-viewing]")) store.actions.setPartnerCafe(e.target.value);
      };

      // Radio group keys: arrows move and select, Home/End jump
      const onKeydown = (e) => {
        const opt = e.target.closest?.("[data-busy-option]");
        if (!opt) return;
        const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
        const list = store.statuses;
        let i = list.indexOf(opt.dataset.busyOption);
        if (e.key in keys) i = (i + keys[e.key] + list.length) % list.length;
        else if (e.key === "Home") i = 0;
        else if (e.key === "End") i = list.length - 1;
        else return;
        e.preventDefault();
        setBusy(list[i]);
        $(`[data-busy-option="${list[i]}"]`, el).focus();
      };

      el.addEventListener("click", onClick);
      el.addEventListener("input", onInput);
      el.addEventListener("submit", onSubmit);
      el.addEventListener("change", onChange);
      el.addEventListener("keydown", onKeydown);

      const offs = [
        store.on("cafe:status", ({ cafeId: id }) => { if (id === cafeId) paintBusy(); }),
        store.on("redeem", ({ entry }) => {
          if (entry.cafeId !== cafeId) return;
          paintToday(entry.id);
          // A redemption from another window for the member on screen: refresh their numbers
          if (r.state === "found" && r.lookup.member.id === entry.memberId) check(r.code, { focus: false });
        }),
        store.on("cafe:viewing", ({ cafeId: id }) => {
          cafeId = id;
          clearTimeout(resetTimer); clearTimeout(scanTimer);
          r = freshRedeem();
          renderAll();
          $("[data-viewing]", el)?.focus();
        }),
        store.on("tick", paintOpen),
        // A plan bought or switched (here or on a phone) changes reserved cups
        store.on("plan", () => { paintToday(); if (r.state === "found") check(r.code, { focus: false }); }),
        // A device that joined the room was filled in by another café window
        store.on("snapshot", () => { renderAll(); }),
      ];

      renderAll();

      return () => {
        clearTimeout(resetTimer);
        clearTimeout(scanTimer);
        offs.forEach((off) => off());
        el.removeEventListener("click", onClick);
        el.removeEventListener("input", onInput);
        el.removeEventListener("submit", onSubmit);
        el.removeEventListener("change", onChange);
        el.removeEventListener("keydown", onKeydown);
      };
    },
  });
})();
