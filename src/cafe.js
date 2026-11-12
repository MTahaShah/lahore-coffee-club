/* =====================================================================
   Lahore Coffee Club — cafe.js
   The counter (#/cafe), built for speed on a cheap Android phone held in
   one hand. Works for any brand: one branch or many.

     Setup    once per device: "Set up this counter" with the branch's
              setup code (DS-GUL, KB-01). Then the device is locked to that
              branch until a manager changes it with their PIN.
     Shift    tap your name to start your shift. No PIN per cup.
     Counter  a keypad and a "Member number" field; results from the first
              digit (also name, or the last 4 digits of a phone). "Scan
              pass" (camera, BarcodeDetector) where supported, and a small
              "Enter 6-digit code" link. Member card: photo, name, plan,
              cups usable here, any limit in words, their usual drink
              preselected. "Redeem 1 cup", then Done with the reference and
              what to ring up; back to the keypad after 5 s. Undo for 2 min.
     Orders   pickup queue for this branch, oldest first (as before)
     Members  manager or owner (PIN): Your members

   #/cafe/<branchId> sets the device up for that branch (presenter menu).
   Today, Payouts and Settings moved to the owner dashboard (#/partner).
   ===================================================================== */
(function () {
  "use strict";
  const LCC = window.LCC;
  const { store, fmt, ui } = LCC;
  const { html, raw, $, $$, icon } = ui;
  const S = store.select;
  const A = store.actions;

  const C = () => store.getState().counter;
  const RULES = () => store.getState().rules;
  const TABS = [
    { id: "counter", label: "Counter" },
    { id: "orders", label: "Orders" },
    { id: "members", label: "Members" },
  ];
  const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "del"];
  const METHOD_WORD = { number: "member number", scan: "scanned pass", code: "6-digit code" };

  let api = null; // the mounted counter, for update()

  LCC.router.register("cafe", {
    title: "Counter",
    mount(el, path) {
      let tab = "counter";
      let mode = "number";     // the field: number (also name / phone) | name (system keyboard) | code (6 digits)
      let query = "";
      let view = "find";       // find | member | done
      let picked = null;       // { memberId, method }
      let drink = null;        // { drinkId, temp, source: usual | app | pick }
      let pickerOpen = false, pickerQuery = "";
      let done = null;         // { entry, member }
      let message = null;      // { title, line } for the find view (code not found, expired)
      let resetTimer = null, undoTimer = null;
      let rejecting = null;    // Orders: the order whose reject reasons are showing
      let pin = "", pinFor = null; // manager PIN sheet: "members" | "manager"
      let scanStream = null, scanLoop = null;
      let canScan = false;

      // Presenter menu: #/cafe/<branchId> sets this device up for that branch
      if (path[0] && S.branch(path[0]) && C().branchId !== path[0]) A.setCounterBranch(path[0]);
      const branch = () => S.branch(C().branchId);
      const brand = () => (branch() ? S.brandFor(branch().id) : null);
      LCC.partnerScope = () => brand()?.id || null;
      const staffOn = () => (branch()?.staff || []).find((s) => s.id === C().staffId) || null;
      const managerOn = () => C().managerUntil > Date.now();
      const member = () => (picked ? S.member(picked.memberId) : null);
      const heading = () => (branch() ? (S.branches(brand().id).length > 1 || branch().branch ? `${brand().name} · ${branch().short || branch().branch}` : branch().name) : "");

      // Scan pass: only where the browser can read QR codes from the camera
      (async () => {
        try {
          if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) return;
          const formats = await window.BarcodeDetector.getSupportedFormats();
          canScan = formats.includes("qr_code");
          $$("[data-scan]", el).forEach((b) => { b.hidden = !canScan; });
        } catch (_) { canScan = false; }
      })();

      /* ---------------------------------------------------------------
         Shell
         --------------------------------------------------------------- */
      function renderAll() {
        clearTimers();
        if (!branch()) return renderSetup();
        if (!staffOn()) return renderShift();
        el.innerHTML = html`
          <div class="surface ct">
            ${headHtml()}
            <nav class="ct-tabs" role="tablist" aria-label="Counter sections">
              ${TABS.map((t) => html`<button type="button" role="tab" class="ct-tab" id="ct-tab-${t.id}" data-tab="${t.id}" aria-controls="ct-panel"
                aria-selected="${t.id === tab}" tabindex="${t.id === tab ? 0 : -1}">${t.label}${t.id === "orders" ? html`<span class="cv-tab__count num" data-orders-count hidden></span>` : ""}${t.id === "members" && !managerOn() ? html`<span class="sr-only"> (manager PIN)</span>` : ""}</button>`)}
            </nav>
            <main class="ct-body" id="ct-panel" role="tabpanel" aria-labelledby="ct-tab-${tab}" tabindex="-1" data-tabpanel></main>
            ${footHtml()}
          </div>
          ${sheetsHtml()}`;
        paintTab();
        paintOrdersCount();
      }

      function statusLine() {
        const c = branch();
        const paused = S.isPaused(c.id);
        const open = S.openState(c);
        const word = paused ? `Paused until ${fmt.time(c.pausedUntil)}` : open.open ? "Open" : "Closed";
        const sub = paused ? "Member cups are off" : open.label.replace(/^Open /, "").replace(/^Closed, /, "");
        return html`<span class="ct-status" data-state="${paused ? "paused" : open.open ? "open" : "closed"}"><span class="ct-status__dot" aria-hidden="true"></span><strong>${word}</strong><span class="t-faint">· ${sub}</span></span>`;
      }
      function headHtml() {
        const b = brand();
        return html`<header class="ct-head">
          <div class="ct-head__id">
            <span class="monogram" aria-hidden="true">${b.monogram}</span>
            <div>
              <h1 class="ct-name">${heading()}</h1>
              <p class="ct-head__status" data-status aria-live="polite">${statusLine()}</p>
            </div>
          </div>
          ${staffOn() ? html`<div class="ct-shift" role="group" aria-label="On shift. Tap your name to take over">
            ${branch().staff.map((s) => html`<button type="button" class="chip ct-shift__name" data-shift="${s.id}" aria-pressed="${s.id === C().staffId}">${s.name}</button>`)}
          </div>` : ""}
        </header>`;
      }
      function paintHead() {
        const st = $("[data-status]", el);
        if (st) st.innerHTML = statusLine().s;
        $$("[data-shift]", el).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.shift === C().staffId)));
      }
      function footHtml() {
        return html`<footer class="ct-foot">
          ${LCC.sync ? html`<div class="ct-foot__sync">${LCC.sync.pill()}<span class="t-micro t-faint num">Room ${LCC.sync.room}</span></div>` : ""}
          <div class="ct-foot__acts">
            ${LCC.sync ? html`<button type="button" class="btn btn--secondary btn--compact" data-pair>Pair a phone</button>` : ""}
            <button type="button" class="btn btn--secondary btn--compact" data-manager>Manager</button>
            <button type="button" class="btn btn--link" data-end-shift>End ${staffOn()?.name || ""}’s shift</button>
          </div>
        </footer>`;
      }

      function showTab(id, { focus = false } = {}) {
        if (id === "members" && !managerOn()) return openPin("members");
        tab = id;
        $$("[data-tab]", el).forEach((b) => { const on = b.dataset.tab === id; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; });
        $("[data-tabpanel]", el).setAttribute("aria-labelledby", `ct-tab-${id}`);
        paintTab();
        if (focus) $("[data-tabpanel]", el).focus({ preventScroll: true });
      }
      function paintTab() {
        const panel = $("[data-tabpanel]", el);
        if (!panel) return;
        if (tab === "counter") { panel.innerHTML = counterHtml().s; paintPanel(); paintRecent(); paintField(); return; }
        if (tab === "orders") { panel.innerHTML = `<div class="enter">${ordersHtml().s}</div>`; return; }
        panel.innerHTML = `<div class="enter">${LCC.partnerMembers ? LCC.partnerMembers.html(brand().id, membersFilter).s : ""}</div>`;
      }
      let membersFilter = { branchId: null, planType: "all", thisMonth: false, limit: 30 };

      /* ---------------------------------------------------------------
         Setup and shift
         --------------------------------------------------------------- */
      function renderSetup(err = "") {
        el.innerHTML = html`
          <div class="surface ct ct--setup">
            <form class="ct-setup" data-setup novalidate>
              ${ui.logo("ring", { label: null, cls: "ct-setup__ring" })}
              <h1 class="ct-name">Set up this counter</h1>
              <p class="t-body t-muted">Enter your branch’s setup code. You do this once; after that this device stays on your branch.</p>
              <div class="field" data-invalid="${!!err}">
                <label class="field__label" for="ct-setup-code">Branch setup code</label>
                <input class="input ct-setup__input" id="ct-setup-code" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false"
                  placeholder="DS-GUL" aria-describedby="ct-setup-hint ct-setup-err" aria-invalid="${!!err}">
                <p class="field__hint" id="ct-setup-hint">Your manager has it. Demo: DS-GUL for Double Shot Gulberg, KB-01 for Kiln &amp; Bean.</p>
                <p class="field__error" id="ct-setup-err" role="alert">${err}</p>
              </div>
              <button type="submit" class="btn btn--primary btn--block btn--tall">Set up</button>
            </form>
          </div>`;
        $("#ct-setup-code", el).focus();
      }
      function renderShift() {
        el.innerHTML = html`
          <div class="surface ct">
            ${headHtml()}
            <section class="ct-start" aria-labelledby="ct-start-h">
              <h2 class="ct-title" id="ct-start-h">Who’s on the counter?</h2>
              <p class="t-body t-muted">Tap your name to start your shift.</p>
              <div class="ct-start__names">
                ${branch().staff.map((s) => html`<button type="button" class="btn btn--secondary btn--tall ct-start__name" data-shift="${s.id}">${ui.avatar({ firstName: s.name, initials: s.name.slice(0, 2) }, { size: 40 })}<span>${s.name}</span>${s.role === "manager" ? html`<span class="t-faint t-small">manager</span>` : ""}</button>`)}
              </div>
            </section>
            ${footHtml()}
          </div>
          ${sheetsHtml()}`;
        $("[data-shift]", el)?.focus();
      }

      /* ---------------------------------------------------------------
         Counter: field, keypad, results, member card, done
         --------------------------------------------------------------- */
      function counterHtml() {
        return html`<div class="ct-counter" data-view="${view}">
          <form class="ct-field" data-find novalidate>
            <div class="ct-field__top">
              <label class="ct-field__label" for="ct-q" data-q-label>${fieldLabel()}</label>
              <span class="ct-field__links">
                ${mode === "code"
                  ? html`<button type="button" class="btn btn--link" data-mode="number">Back to member number</button>`
                  : html`<button type="button" class="btn btn--link" data-mode="${mode === "name" ? "number" : "name"}">${mode === "name" ? "Use the keypad" : "Search by name"}</button>
                         <button type="button" class="btn btn--link" data-mode="code">Enter 6-digit code</button>`}
              </span>
            </div>
            <div class="ct-field__row">
              <input class="ct-q num" id="ct-q" data-q value="${query}" autocomplete="off" autocorrect="off" spellcheck="false"
                inputmode="${mode === "name" ? "text" : "none"}" ${mode === "code" ? raw('maxlength="6"') : ""}
                placeholder="${mode === "code" ? "000 000" : mode === "name" ? "Name or phone" : "42"}" aria-describedby="ct-q-hint">
              <button type="button" class="btn btn--secondary ct-scan" data-scan ${canScan ? "" : raw("hidden")}>${icon("qr")}<span>Scan pass</span></button>
            </div>
            <p class="t-small t-faint" id="ct-q-hint" data-q-hint>${fieldHint()}</p>
          </form>
          <section class="ct-panel" aria-live="polite" aria-label="Member" data-panel></section>
          <div class="ct-pad" role="group" aria-label="Keypad">
            ${KEYS.map((k) => html`<button type="button" class="ct-key${k.length > 1 ? " ct-key--fn" : ""}" data-key="${k}" aria-label="${k === "del" ? "Delete" : k === "clear" ? "Clear" : k}">${k === "del" ? icon("arrowLeft", { size: 24 }) : k === "clear" ? "Clear" : k}</button>`)}
          </div>
          <section class="ct-recent" aria-labelledby="ct-recent-h" data-recent></section>
        </div>`;
      }
      const fieldLabel = () => (mode === "code" ? "6-digit code" : mode === "name" ? "Name or last 4 digits of phone" : "Member number");
      const fieldHint = () => (mode === "code" ? "The code under the QR on the member’s pass." : mode === "name" ? "Type a first or last name." : "Ask for their number: “LCC 42”. Also finds a name or the last 4 digits of a phone.");
      function paintField() {
        const q = $("[data-q]", el);
        if (q && q.value !== query) q.value = query;
      }
      function setView(next) {
        view = next;
        const box = $(".ct-counter", el);
        if (box) box.dataset.view = next;
        paintPanel();
      }

      function paintPanel({ focus = false } = {}) {
        const panel = $("[data-panel]", el);
        if (!panel) return;
        if (view === "member" && member()) panel.innerHTML = memberHtml().s;
        else if (view === "done" && done) panel.innerHTML = doneHtml().s;
        else panel.innerHTML = resultsHtml().s;
        if (focus) {
          const target = view === "member" ? $("[data-redeem]:not([disabled])", panel) || $("[data-back]", panel) : view === "done" ? $("[data-next]", panel) : null;
          target?.focus({ preventScroll: false });
        }
      }

      function resultsHtml() {
        if (message) return html`<div class="ct-msg" role="alert"><p class="ct-msg__title">${message.title}</p>${message.line ? html`<p class="t-small t-muted">${message.line}</p>` : ""}</div>`;
        if (mode === "code") return html`<p class="ct-empty t-small t-muted">Type the six digits. The member is found as soon as the sixth one is in.</p>`;
        if (!query) return html`<p class="ct-empty t-small t-muted">Results show from the first digit.</p>`;
        const res = S.counterSearch(query, branch().id);
        if (!res.results.length) {
          return html`<div class="ct-msg" role="alert"><p class="ct-msg__title">${res.digits ? "Number not found" : "No one by that name here"}</p>
            <p class="t-small t-muted">${res.digits ? "Check the number with them, or try their name or the last 4 digits of their phone." : "Names only find members who use this café. Try their number."}</p></div>`;
        }
        return html`<p class="sr-only">${res.total} ${res.total === 1 ? "member matches" : "members match"}</p>
          <ul class="ct-results" role="list">
            ${res.results.map(({ member: m, match }) => {
              const chk = S.counterCheck(m.id, branch().id);
              return html`<li><button type="button" class="ct-result" data-pick="${m.id}">
                ${ui.avatar(m, { size: 44 })}
                <span class="ct-result__main">
                  <span class="ct-result__name">${S.fullName(m)}</span>
                  <span class="ct-result__meta num">${fmt.lcc(m.memberNo)}${match === "phone" ? ` · phone ending ${query}` : ""} · ${chk.ok ? chk.plan.name : chk.plans[0]?.name || "No plan"}</span>
                </span>
                <span class="ct-result__trail">${chk.ok ? html`<span class="num">${chk.cupsHere}</span> here` : chk.title}</span>
              </button></li>`;
            })}
          </ul>
          ${res.total > res.results.length ? html`<p class="t-small t-faint">${res.total - res.results.length} more. Keep typing to narrow it down.</p>` : ""}`;
      }

      /** Default drink: what they chose in the app, else their usual here, else the first on the menu. */
      function defaultDrink(m) {
        const b = brand();
        const o = S.order(m.id);
        if (o && o.brandId === b.id && S.isAvailable(branch().id, o.drinkId)) return { drinkId: o.drinkId, temp: o.temp, source: "app" };
        const u = S.usualDrink(m.id, b.id);
        if (u && S.isAvailable(branch().id, u.drinkId)) return { drinkId: u.drinkId, temp: u.temp, source: "usual" };
        const first = S.counterMenu(branch().id)[0];
        return first ? { drinkId: first.id, temp: first.temp, source: "pick" } : null;
      }
      function pickMember(memberId, method) {
        const m = S.member(memberId);
        if (!m) return;
        message = null;
        picked = { memberId, method };
        drink = defaultDrink(m);
        pickerOpen = !drink || drink.source === "pick";
        pickerQuery = "";
        setView("member");
        paintPanel({ focus: true });
      }

      function memberHtml() {
        const m = member();
        const b = brand();
        const chk = S.counterCheck(m.id, branch().id);
        const club = S.club(m.id);
        const clubLine = [club.number, club.founding && "Founding Member", club.level.id !== "member" && club.level.name].filter(Boolean).join(" · ");
        const perks = S.perksAt ? S.perksAt(m.id, branch().id) : [];
        const others = chk.plans.filter((p) => !chk.ok || p.key !== chk.plan.key);
        const item = drink ? S.menuItem(b.id, drink.drinkId) : null;
        const price = item ? S.drinkPrice(b.id, item, drink.temp) : null;
        const label = item ? S.drinkLabel(item, drink.temp) : "";
        return html`<article class="ct-card enter" aria-labelledby="ct-who">
          <div class="ct-card__who">
            ${ui.avatar(m, { size: 72 })}
            <div>
              <h2 class="ct-card__name" id="ct-who">${S.fullName(m)}</h2>
              <p class="ct-card__meta num">${fmt.lcc(m.memberNo)} · ${chk.ok ? chk.plan.name : chk.plans.map((p) => p.name).join(" · ") || "No plan yet"}</p>
              <p class="t-micro t-faint num">${clubLine}</p>
            </div>
          </div>
          ${chk.ok
            ? html`<p class="ct-card__cups"><span class="num">${chk.cupsHere}</span> ${chk.cupsHere === 1 ? "cup" : "cups"} usable here
                <span class="t-small t-faint">${chk.plan.plan.type === "explorer" ? `· Explorer: up to ${chk.plan.cap} a month here, ${chk.plan.left} left in total` : chk.plan.plan.type === "brand" ? "· any branch" : chk.plan.bonus ? "· complimentary" : "· reserved here"} · ${chk.usedToday} of ${chk.limit} today</span></p>`
            : html`<div class="ct-refuse" role="alert">${icon("info", { size: 22 })}<div><p class="ct-refuse__title">${chk.title}</p><p class="t-small t-muted">${chk.line}</p></div></div>`}
          ${others.length && chk.ok ? html`<p class="t-small t-faint num">Also: ${others.map((p) => `${p.name}, ${p.left} left`).join(" · ")}</p>` : ""}
          ${perks.length ? html`<p class="t-small ct-card__perk">Perk to offer: ${perks.map((p) => p.text).join("; ")}</p>` : ""}
          ${chk.ok && item ? html`
            <div class="ct-drink">
              <p class="ct-drink__label t-micro t-faint">${drink.source === "usual" ? "Usual" : drink.source === "app" ? "Chosen in the app" : "Drink"}</p>
              <p class="ct-drink__name"><span data-drink-name>${label}</span> <span class="ct-drink__price num">${price.included ? "Included" : `Cup + ${fmt.rs(price.topUp)} top-up`}</span></p>
              <button type="button" class="btn btn--link" data-picker aria-expanded="${pickerOpen}" aria-controls="ct-picker">${pickerOpen ? "Hide the menu" : "Change drink"}</button>
            </div>
            <button type="button" class="btn btn--primary btn--block ct-redeem" data-redeem aria-describedby="ct-who">Redeem 1 cup</button>
            <div class="ct-picker" id="ct-picker" ${pickerOpen ? "" : raw("hidden")}>${pickerHtml()}</div>` : ""}
          <button type="button" class="btn btn--link" data-back>Not ${m.firstName}? Back to the keypad</button>
        </article>`;
      }

      function pickerHtml() {
        const b = brand();
        const temp = drink?.temp || "hot";
        const usual = S.usualDrink(member().id, b.id);
        const norm = (s) => s.toLowerCase();
        const list = S.counterMenu(branch().id, temp)
          .filter((d) => (temp === "iced" ? d.item.iced != null : d.item.hot != null))
          .filter((d) => !pickerQuery || norm(d.item.name).includes(norm(pickerQuery)));
        const usualRow = usual && list.find((d) => d.id === usual.drinkId);
        const rows = usualRow ? [usualRow, ...list.filter((d) => d !== usualRow)] : list;
        return html`
          <div class="ct-picker__tools">
            <label class="sr-only" for="ct-drink-q">Search the menu</label>
            <input class="input" id="ct-drink-q" data-drink-q type="search" placeholder="Search the menu" value="${pickerQuery}" autocomplete="off">
            ${ui.segmented({ name: "cttemp", label: "Hot or iced", value: temp, options: [{ value: "hot", label: "Hot" }, { value: "iced", label: "Iced" }] })}
          </div>
          <div class="ct-menu" role="radiogroup" aria-label="Drinks available today">
            ${rows.length ? rows.map((d) => html`<button type="button" role="radio" class="ct-menu__row" data-drink="${d.id}" aria-checked="${drink && d.id === drink.drinkId}">
                <span class="ct-menu__name">${d.name}${usualRow && d === usualRow ? html` <span class="badge">Usual</span>` : ""}</span>
                <span class="ct-menu__price num">${d.included ? "Included" : `Cup + ${fmt.rs(d.topUp)}`}</span>
              </button>`) : html`<p class="t-small t-muted">Nothing ${temp} matches${pickerQuery ? ` “${pickerQuery}”` : ""} today.</p>`}
          </div>`;
      }
      function paintPicker() {
        const box = $("#ct-picker", el);
        if (box) box.innerHTML = pickerHtml().s;
      }
      function paintDrinkLine() {
        const b = brand();
        const item = S.menuItem(b.id, drink.drinkId);
        const p = S.drinkPrice(b.id, item, drink.temp);
        const card = $(".ct-drink", el);
        if (!card) return;
        $(".ct-drink__label", card).textContent = drink.source === "usual" ? "Usual" : drink.source === "app" ? "Chosen in the app" : "Drink";
        $("[data-drink-name]", card).textContent = S.drinkLabel(item, drink.temp);
        $(".ct-drink__price", card).textContent = p.included ? "Included" : `Cup + ${fmt.rs(p.topUp)} top-up`;
      }

      function redeemNow() {
        if (!picked || !drink) return;
        const res = A.counterRedeem({ memberId: picked.memberId, branchId: branch().id, drinkId: drink.drinkId, temp: drink.temp, method: picked.method });
        if (!res.ok) { paintPanel({ focus: true }); return ui.toast(res.title || "That didn’t go through.", { iconName: "info" }); }
        done = { entry: res.entry, member: res.member, left: res.left, plan: res.plan };
        picked = null; drink = null; query = ""; mode = "number";
        A.refreshAutoBusy(branch().id);
        paintField();
        setView("done");
        paintPanel({ focus: true });
        paintRecent();
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => backToKeypad({ focus: false }), RULES().counterResetSeconds * 1000);
      }
      function doneHtml() {
        const { entry, member: m, left, plan } = done;
        const secs = RULES().counterResetSeconds;
        return html`<div class="ct-done" role="status">
          <svg class="check-draw" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" pathLength="1"/><path d="M15 24.5l6 6 12-13" pathLength="1"/></svg>
          <p class="ct-done__title">Done · ${m.firstName} · ${S.entryDrinkName(entry)}</p>
          <p class="ct-done__ref num">Ref ${entry.ref || S.redemptionRef(entry)}</p>
          ${entry.topUp ? html`<p class="ct-collect num">Collect ${fmt.rs(entry.topUp)}</p>` : ""}
          <p class="cv-till">Ring it up on your till as: <strong>LCC member</strong></p>
          <p class="t-small t-faint num">${fmt.time(entry.at)} · ${plan.name}, ${fmt.cups(left)} left</p>
          <div class="ct-done__acts">
            <button type="button" class="btn btn--secondary" data-undo="${entry.id}">Undo</button>
            <button type="button" class="btn btn--primary" data-next>Next member</button>
          </div>
          <span class="ct-done__timer" style="--secs:${secs}s" aria-hidden="true"></span>
        </div>`;
      }
      function backToKeypad({ focus = true } = {}) {
        clearTimeout(resetTimer);
        done = null; picked = null; drink = null; message = null;
        if (view !== "find") setView("find");
        if (focus) $("[data-q]", el)?.focus();
      }

      /** Recent cups at this branch that can still be undone (2 minutes). */
      function paintRecent() {
        const box = $("[data-recent]", el);
        if (!box) return;
        const list = S.undoable(branch().id);
        clearInterval(undoTimer);
        if (!list.length) { box.innerHTML = ""; return; }
        box.innerHTML = html`<h2 class="t-micro t-faint" id="ct-recent-h">Just redeemed · undo within ${RULES().undoMinutes} minutes</h2>
          <ul role="list">${list.slice(0, 3).map((e) => html`<li class="ct-recent__row">
            <span>${S.member(e.memberId)?.firstName || "Member"} · ${S.entryDrinkName(e)} <span class="t-faint num">· ${fmt.time(e.at)}</span></span>
            <button type="button" class="btn btn--secondary btn--compact" data-undo="${e.id}">Undo <span class="num" data-undo-left="${e.id}">${fmt.countdown(S.undoSecondsLeft(e))}</span></button>
          </li>`)}</ul>`.s;
        undoTimer = setInterval(() => {
          let expired = false;
          $$("[data-undo-left]", el).forEach((n) => {
            const e = S.entry(n.dataset.undoLeft);
            const left = e ? S.undoSecondsLeft(e) : 0;
            if (!left) expired = true; else n.textContent = fmt.countdown(left);
          });
          if (expired) paintRecent();
        }, 1000);
      }
      function undo(id) {
        const res = A.undoRedemption(id);
        if (!res.ok) return ui.toast(res.message, { iconName: "info" });
        const m = S.member(res.entry.memberId);
        ui.toast(`Undone. ${m.firstName}’s cup is back, and ${m.firstName} has been told.`, { duration: 4200 });
        if (view === "done" && done?.entry.id === id) backToKeypad();
        paintRecent();
      }

      function typeKey(k) {
        message = null;
        if (k === "clear") query = "";
        else if (k === "del") query = query.slice(0, -1);
        else if (mode === "code") { if (query.length < 6) query += k; }
        else if (query.length < 8) query += k;
        if (view !== "find") { done = null; picked = null; setView("find"); }
        paintField();
        afterQuery();
      }
      function afterQuery() {
        if (mode === "code") {
          if (query.length === 6) return checkCode();
          return paintPanel();
        }
        paintPanel();
      }
      function checkCode() {
        const found = store.findMemberByCode(query);
        if (!found) { message = { title: "Code not found", line: "Check the six digits with the member. Their pass shows a new code every 30 seconds." }; query = ""; paintField(); return paintPanel(); }
        if (found.expired) { message = { title: "That code has expired", line: `Ask ${found.member.firstName} to read you the code on their pass now.` }; query = ""; paintField(); return paintPanel(); }
        query = ""; mode = "number";
        paintTab();
        pickMember(found.member.id, "code");
      }
      function setMode(next) {
        mode = next; query = ""; message = null;
        if (view !== "find") { picked = null; done = null; view = "find"; }
        paintTab();
        const q = $("[data-q]", el);
        if (q) q.focus();
      }

      /* ---------------------------------------------------------------
         Scan pass (camera)
         --------------------------------------------------------------- */
      async function openScan() {
        const sheet = $("#ct-scan-sheet", el);
        $("[data-scan-body]", sheet).innerHTML = html`
          <h2 class="ct-title" id="ct-scan-title">Scan pass</h2>
          <p class="t-small t-muted">Point the camera at the QR on the member’s phone.</p>
          <div class="ct-scan__frame"><video class="ct-scan__video" data-scan-video playsinline muted aria-label="Camera"></video></div>
          <p class="t-small" data-scan-msg role="status"></p>
          <button type="button" class="btn btn--secondary btn--block" data-sheet-close>Cancel</button>`.s;
        ui.openSheet(sheet, { onClose: stopScan });
        try {
          scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
          const video = $("[data-scan-video]", sheet);
          video.srcObject = scanStream;
          await video.play();
          const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
          const tick = async () => {
            if (!scanStream) return;
            try {
              const codes = await detector.detect(video);
              const hit = codes.map((c) => c.rawValue).find((v) => /^LCC1:/.test(v));
              if (hit) return onScan(hit);
            } catch (_) { /* a frame that couldn't be read */ }
            scanLoop = setTimeout(tick, 250);
          };
          tick();
        } catch (_) {
          const msg = $("[data-scan-msg]", sheet);
          if (msg) msg.textContent = "The camera didn’t open. Ask for the member number instead.";
        }
      }
      function stopScan() {
        clearTimeout(scanLoop);
        if (scanStream) scanStream.getTracks().forEach((t) => t.stop());
        scanStream = null;
      }
      function onScan(payload) {
        const [, memberId, code] = payload.split(":");
        const found = store.findMemberByCode(code);
        const msg = $("[data-scan-msg]", el);
        if (!found || found.member.id !== memberId) { if (msg) msg.textContent = "That isn’t an LCC pass. Try again, or ask for their number."; scanLoop = setTimeout(() => openScanLoopResume(), 1200); return; }
        if (found.expired) { if (msg) msg.textContent = `That code has expired. Ask ${found.member.firstName} to open their pass again.`; scanLoop = setTimeout(() => openScanLoopResume(), 1500); return; }
        ui.closeSheet($("#ct-scan-sheet", el));
        stopScan();
        if (tab !== "counter") showTab("counter");
        pickMember(found.member.id, "scan");
      }
      function openScanLoopResume() { if (scanStream) { stopScan(); openScan(); } }

      /* ---------------------------------------------------------------
         Orders: the pickup queue for this branch (unchanged behaviour)
         --------------------------------------------------------------- */
      const STATE_LABEL = { placed: "New", making: "Being made", ready: "Ready" };
      const NEXT_LABEL = { placed: "Start", making: "Ready", ready: "Collected" };
      const DONE_LABEL = { collected: "collected", cancelled: "cancelled by the member", rejected: "rejected" };
      const spaced = (code) => `${code.slice(0, 3)} ${code.slice(3)}`;

      function paintOrdersCount() {
        const n = S.pickupQueue(branch().id).filter((o) => o.status === "placed").length;
        const badge = $("[data-orders-count]", el);
        if (badge) { badge.textContent = n; badge.hidden = !n; }
        const t = $('[data-tab="orders"]', el);
        if (t) t.setAttribute("aria-label", n ? `Orders, ${n} new` : "Orders");
      }
      function tableHtml(o) {
        const paid = o.items.filter((i) => ["cup", "online", "host"].includes(i.pay)).length;
        const parts = [["cup", "cup"], ["online", "paid online"], ["host", `covered by ${o.memberName}`]]
          .map(([k, w]) => [o.items.filter((i) => i.pay === k).length, w]).filter(([n]) => n).map(([n, w]) => `${n} ${w === "cup" ? (n === 1 ? "cup" : "cups") : w}`);
        return html`<ul class="cv-items" role="list">${o.items.map((i) => html`<li>
            <span class="cv-items__who">${i.name}</span>
            <span class="cv-items__drink">${S.itemDrinkName(o.cafeId, i)}</span>
            <span class="t-faint num">${i.pay === "cup" ? (i.topUp ? `Cup + ${fmt.rs(i.topUp)}` : "Cup") : i.pay === "online" ? "Paid" : "Covered"}</span>
          </li>`)}</ul>
          <p class="cv-items__total num"><span>Total ${fmt.rs(o.price)}</span><span>${paid} of ${o.items.length} paid</span></p>
          <p class="t-small t-muted num">${parts.join(", ")}. Nothing to collect.</p>`;
      }
      function ticketPayLine(o) {
        if (o.pay === "cup") return o.topUp ? `Member cup. ${fmt.rs(o.topUp)} top-up paid online, nothing to collect.` : "Member cup. Nothing to collect.";
        return `Paid online, ${fmt.rs(o.amount)}. Nothing to collect.`;
      }
      function ticketHtml(o, fresh) {
        const code = S.pickupCode(o);
        const acts = rejecting === o.id
          ? html`<div class="cv-reject" role="group" aria-label="Why can’t you make it?">
              <p class="t-small">Why can’t you make it? ${o.items ? "Everyone at the table is told, cups go back and payments are refunded" : `${o.memberName} is told, and ${o.pay === "cup" ? "gets the cup back" : "refunded"}`}.</p>
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
            <span class="badge">${o.items ? `Table · ${o.items.length}` : o.pay === "cup" ? "Cup" : "Paid"}</span>
          </div>
          <p class="cv-ticket__name" id="tk-${o.id}">${o.items ? `${o.memberName}’s table` : o.memberName}</p>
          ${o.items ? tableHtml(o) : html`<p class="cv-ticket__drink">${S.pickupDrinkName(o)}</p>`}
          <dl class="cv-ticket__facts">
            <div><dt>Pickup</dt><dd class="num">${o.asap ? `ASAP · ${fmt.time(o.pickupAt)}` : fmt.time(o.pickupAt)}</dd></div>
            <div><dt>Code</dt><dd class="num cv-ticket__code" aria-label="${code.split("").join(" ")}">${spaced(code)}</dd></div>
            <div><dt>Placed</dt><dd><span data-rel-time="${o.placedAt}">${fmt.ago(o.placedAt)}</span></dd></div>
          </dl>
          ${o.items ? "" : html`<p class="t-small t-muted num">${ticketPayLine(o)}</p>`}
          <p class="cv-till">Ring it up on your till as: <strong>LCC member</strong> <span class="t-muted num">· Ref ${S.pickupRef(o)}</span></p>
          ${acts}
        </li>`;
      }
      function ordersHtml(freshId) {
        const id = branch().id;
        const queue = S.pickupQueue(id);
        const doneList = S.pickupsDoneToday(id).slice(0, 8);
        const off = S.pickupAvailable(id);
        return html`
          <div class="cv-section">
            <div class="cv-section__head">
              <h2 class="ct-title">Orders</h2>
              <p class="t-small t-muted">Pickup orders for ${heading()}, oldest first.</p>
            </div>
            ${off.ok ? "" : html`<p class="t-small cv-note">${off.reason === "paused" ? `Member cups are paused, so new orders are off until ${fmt.time(branch().pausedUntil)}.` : "Closed for today, so no new orders."} Orders already here still need making.</p>`}
            <ol class="cv-tickets" role="list" data-queue>
              ${queue.length ? queue.map((o) => ticketHtml(o, o.id === freshId)) : html`<li class="cv-tickets__empty t-small t-muted">No orders waiting. New ones appear here as members place them.</li>`}
            </ol>
            <section aria-labelledby="done-h">
              <h3 class="eyebrow" id="done-h">Done today</h3>
              <ol class="cv-list" role="list">
                ${doneList.length ? doneList.map((o) => html`<li class="cv-row">
                  <span class="cv-row__time num">${fmt.time(o.updatedAt)}</span>
                  <span class="cv-row__main">${o.memberName} <span class="t-faint">· ${S.pickupDrinkName(o)} · ${o.items ? "table" : o.pay === "cup" ? "cup" : fmt.rs(o.amount)} · ${DONE_LABEL[o.status]}${o.status === "rejected" && o.reason ? `, ${(store.pickupReasons[o.reason] || "").toLowerCase()}` : ""}</span></span>
                  <span class="cv-row__ref num">${o.status === "collected" ? S.pickupRef(o) : ""}</span>
                </li>`) : html`<li class="cv-row"><span class="cv-row__main t-muted">Nothing collected yet today.</span></li>`}
              </ol>
            </section>
          </div>`;
      }
      function paintOrders({ freshId = null, focusId = null } = {}) {
        if (tab !== "orders") return;
        const panel = $("[data-tabpanel]", el);
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
         Sheets: manager PIN and tools, pairing, scanning
         --------------------------------------------------------------- */
      function sheetsHtml() {
        const sheet = (id, body, labelled) => html`<div class="sheet sheet--viewport" id="${id}" role="dialog" aria-modal="true" aria-labelledby="${labelled}" aria-hidden="true">
          <div class="sheet__scrim" data-sheet-close></div>
          <div class="sheet__panel"><div class="sheet__handle" aria-hidden="true"></div><div class="sheet__body ${body}" data-${id}-body></div></div>
        </div>`;
        return raw(html`${sheet("ct-pin-sheet", "cv-pin", "ct-pin-title")}${sheet("ct-mgr-sheet", "ct-mgr", "ct-mgr-title")}${sheet("ct-scan-sheet", "ct-scansheet", "ct-scan-title")}${LCC.sync ? sheet("ct-pair-sheet", "pair", "pair-title") : ""}`
          .s.replace(/data-ct-scan-sheet-body/, "data-scan-body"));
      }
      function openPin(forWhat) {
        pin = ""; pinFor = forWhat;
        $("[data-ct-pin-sheet-body]", el).innerHTML = html`
          <h2 class="ct-title" id="ct-pin-title">Manager PIN</h2>
          <p class="t-small t-muted">${forWhat === "members" ? "Your members are for managers and the owner." : "For pausing member cups and moving this counter."}</p>
          <div class="cv-pin__dots" data-pin-dots aria-hidden="true">${[0, 1, 2, 3].map(() => html`<span></span>`)}</div>
          <label class="sr-only" for="ct-pin-input">PIN</label>
          <input class="sr-only" id="ct-pin-input" inputmode="numeric" maxlength="4" autocomplete="off" data-pin-input>
          <p class="cv-error" data-pin-err role="alert"></p>
          <div class="cv-pad" role="group" aria-label="PIN keypad">
            ${["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((k) => k === ""
              ? html`<span></span>`
              : html`<button type="button" class="cv-pad__key" data-pin-key="${k}" aria-label="${k === "del" ? "Delete" : k}">${k === "del" ? icon("arrowLeft", { size: 22 }) : k}</button>`)}
          </div>
          <p class="t-micro t-faint">Demo: Gulberg manager 1678, Kiln &amp; Bean manager 2468, owner 0000 / 1111.</p>`.s;
        ui.openSheet($("#ct-pin-sheet", el));
      }
      function paintPin(err = "") {
        $$("[data-pin-dots] span", el).forEach((d, i) => d.classList.toggle("is-on", i < pin.length));
        const e = $("[data-pin-err]", el); if (e) e.textContent = err;
        const inp = $("[data-pin-input]", el); if (inp && inp.value !== pin) inp.value = pin;
      }
      function tryPin() {
        const res = A.unlockManager(pin);
        if (!res.ok) { pin = ""; return paintPin(res.message); }
        ui.closeSheet($("#ct-pin-sheet", el));
        const what = pinFor; pinFor = null;
        if (what === "members") { renderAll(); showTab("members", { focus: true }); }
        else openManager();
      }
      function pinKey(k) {
        if (k === "del") pin = pin.slice(0, -1); else if (pin.length < 4) pin += k;
        paintPin();
        if (pin.length === 4) tryPin();
      }
      function openManager() {
        if (!managerOn()) return openPin("manager");
        const c = branch();
        const paused = S.isPaused(c.id);
        $("[data-ct-mgr-sheet-body]", el).innerHTML = html`
          <h2 class="ct-title" id="ct-mgr-title">Manager</h2>
          <section class="ct-mgr__block" aria-labelledby="ct-mgr-pause">
            <h3 class="eyebrow" id="ct-mgr-pause">Member cups</h3>
            <p class="t-small t-muted">${paused ? `Paused until ${fmt.time(c.pausedUntil)}. Members see that on the map.` : "Taking member cups. Pause for a rush; members are told on the map."}</p>
            ${paused ? html`<button type="button" class="btn btn--primary btn--block" data-resume>Take member cups again</button>`
              : html`<button type="button" class="btn btn--secondary btn--block" data-pause>Pause member cups for 30 minutes</button>`}
          </section>
          ${S.branches(brand().id).length > 1 ? html`<section class="ct-mgr__block" aria-labelledby="ct-mgr-move">
            <h3 class="eyebrow" id="ct-mgr-move">This counter</h3>
            <label class="field"><span class="field__label">Move this counter to</span>
              <span class="select"><select class="input" data-move>${S.branches(brand().id).map((x) => html`<option value="${x.id}" ${x.id === c.id ? raw("selected") : ""}>${x.branch || x.name}</option>`)}</select></span>
            </label>
          </section>` : ""}
          <section class="ct-mgr__block">
            <button type="button" class="btn btn--secondary btn--block" data-forget>Set up this counter again</button>
            <button type="button" class="btn btn--link" data-lock>Lock manager tools</button>
          </section>`.s;
        ui.openSheet($("#ct-mgr-sheet", el));
      }
      function openPair() {
        const url = LCC.sync.pairUrl();
        const local = !location.href.startsWith(LCC.sync.liveUrl);
        $("[data-ct-pair-sheet-body]", el).innerHTML = html`
          <h2 class="ct-title" id="pair-title">Pair a phone</h2>
          <p class="t-small t-muted">Scan with the phone’s camera. It opens Mumtaz’s pass in this room, and cups redeemed here come off it live.</p>
          <div class="qr pair__qr" role="img" aria-label="QR code for the pairing link">${raw(ui.qrSvg(url, { fallback: "QR unavailable offline. Type the link below on the phone." }))}</div>
          <p class="pair__room"><span class="t-micro t-faint">Room</span><span class="num">${LCC.sync.room}</span></p>
          <p class="t-micro t-faint pair__url">${url}</p>
          ${local ? html`<p class="t-small t-faint pair__note">The phone opens the live site. It stays in sync with this window while both are online.</p>` : ""}
          <button type="button" class="btn btn--primary btn--block" data-sheet-close>Done</button>`.s;
        ui.openSheet($("#ct-pair-sheet", el));
      }

      /* ---------------------------------------------------------------
         Events
         --------------------------------------------------------------- */
      const onClick = (e) => {
        const t = e.target;
        const tb = t.closest("[data-tab]");
        if (tb) return showTab(tb.dataset.tab);
        const sh = t.closest("[data-shift]");
        if (sh) {
          const was = C().staffId;
          A.startShift(sh.dataset.shift);
          if (!was) { renderAll(); $("[data-q]", el)?.focus(); }
          else paintHead();
          return ui.toast(`${staffOn().name} is on the counter.`);
        }
        const key = t.closest("[data-key]");
        if (key) return typeKey(key.dataset.key);
        const md = t.closest("[data-mode]");
        if (md) return setMode(md.dataset.mode);
        const pk = t.closest("[data-pick]");
        if (pk) return pickMember(pk.dataset.pick, mode === "name" ? "number" : "number");
        if (t.closest("[data-redeem]")) return redeemNow();
        if (t.closest("[data-back]") || t.closest("[data-next]")) return backToKeypad();
        const ud = t.closest("[data-undo]");
        if (ud) return undo(ud.dataset.undo);
        if (t.closest("[data-picker]")) {
          pickerOpen = !pickerOpen;
          const box = $("#ct-picker", el); if (box) box.hidden = !pickerOpen;
          const btn = t.closest("[data-picker]"); btn.setAttribute("aria-expanded", pickerOpen); btn.textContent = pickerOpen ? "Hide the menu" : "Change drink";
          if (pickerOpen) $("#ct-drink-q", el)?.focus();
          return;
        }
        const dr = t.closest("[data-drink]");
        if (dr) {
          const item = S.menuItem(brand().id, dr.dataset.drink);
          drink = { drinkId: item.id, temp: S.servedTemp(item, drink?.temp || "hot"), source: S.usualDrink(member().id, brand().id)?.drinkId === item.id ? "usual" : "pick" };
          $$("[data-drink]", el).forEach((b) => b.setAttribute("aria-checked", String(b === dr)));
          paintDrinkLine();
          return $("[data-redeem]", el)?.focus();
        }
        const tseg = t.closest('[data-segmented="cttemp"] .segmented__option');
        if (tseg) {
          ui.selectSegment(tseg.parentElement, tseg.dataset.value);
          const temp = tseg.dataset.value;
          const item = drink ? S.menuItem(brand().id, drink.drinkId) : null;
          if (item && item[temp] != null) { drink = { ...drink, temp }; paintDrinkLine(); }
          else drink = { ...(drink || {}), temp };
          paintPicker();
          return $(`[data-segmented="cttemp"] [data-value="${temp}"]`, el)?.focus();
        }
        if (t.closest("[data-scan]")) return openScan();
        if (t.closest("[data-pair]")) return openPair();
        if (t.closest("[data-manager]")) return openManager();
        if (t.closest("[data-end-shift]")) { const n = staffOn()?.name; A.endShift(); renderAll(); return ui.toast(`${n}’s shift has ended.`); }
        const pkey = t.closest("[data-pin-key]");
        if (pkey) return pinKey(pkey.dataset.pinKey);
        if (t.closest("[data-pause]")) { A.pauseMemberCups(branch().id, 30); ui.closeSheet($("#ct-mgr-sheet", el)); return ui.toast(`Member cups paused until ${fmt.time(branch().pausedUntil)}.`); }
        if (t.closest("[data-resume]")) { A.pauseMemberCups(branch().id, 0); ui.closeSheet($("#ct-mgr-sheet", el)); return ui.toast("Taking member cups again."); }
        if (t.closest("[data-lock]")) { A.lockManager(); ui.closeSheet($("#ct-mgr-sheet", el)); if (tab === "members") { tab = "counter"; renderAll(); } return ui.toast("Manager tools locked."); }
        if (t.closest("[data-forget]")) { ui.closeSheet($("#ct-mgr-sheet", el)); store.getState().counter = { branchId: null, staffId: null, managerUntil: 0 }; history.replaceState(null, "", LCC.sync ? LCC.sync.withRoom("#/cafe") : "#/cafe"); return renderAll(); }
        if (LCC.partnerMembers && tab === "members" && LCC.partnerMembers.click(t, membersFilter, () => paintTab())) return;
      };

      const onInput = (e) => {
        const t = e.target;
        if (t.matches("[data-q]")) {
          let v = t.value;
          if (mode !== "name") v = v.replace(/[^\d]/g, "").slice(0, mode === "code" ? 6 : 8);
          if (mode === "number" && /[a-z]/i.test(t.value)) { mode = "name"; query = t.value; paintTab(); const n = $("[data-q]", el); n.focus(); n.setSelectionRange(query.length, query.length); return; }
          query = v;
          if (t.value !== v) t.value = v;
          message = null;
          if (view !== "find") { picked = null; done = null; setView("find"); }
          return afterQuery();
        }
        if (t.matches("[data-drink-q]")) { pickerQuery = t.value; const pos = t.selectionStart; paintPicker(); const n = $("#ct-drink-q", el); n.focus(); n.setSelectionRange(pos, pos); return; }
        if (t.matches("[data-pin-input]")) { pin = t.value.replace(/\D/g, "").slice(0, 4); paintPin(); if (pin.length === 4) tryPin(); return; }
        if (t.id === "ct-setup-code") t.value = t.value.toUpperCase();
      };
      const onChange = (e) => {
        const t = e.target;
        if (t.matches("[data-move]")) { A.setCounterBranch(t.value); ui.closeSheet($("#ct-mgr-sheet", el)); history.replaceState(null, "", LCC.sync ? LCC.sync.withRoom(`#/cafe/${t.value}`) : `#/cafe/${t.value}`); renderAll(); return ui.toast(`This counter is now at ${heading()}.`); }
        if (LCC.partnerMembers && tab === "members" && LCC.partnerMembers.change(t, membersFilter, () => paintTab())) return;
      };
      const onSubmit = (e) => {
        if (e.target.matches("[data-setup]")) {
          e.preventDefault();
          const res = A.setupCounter(e.target.elements.code.value);
          if (!res.ok) return renderSetup(res.message);
          history.replaceState(null, "", LCC.sync ? LCC.sync.withRoom(`#/cafe/${res.branch.id}`) : `#/cafe/${res.branch.id}`);
          renderAll();
          return ui.toast(`This counter is set up for ${heading()}.`);
        }
        if (e.target.matches("[data-find]")) {
          e.preventDefault();
          if (mode === "code") return query.length === 6 ? checkCode() : (message = { title: `That’s ${query.length} digit${query.length === 1 ? "" : "s"}`, line: "Codes have six." }, paintPanel());
          const res = S.counterSearch(query, branch().id);
          if (res.results.length === 1 || (res.results[0] && String(res.results[0].member.memberNo) === query)) pickMember(res.results[0].member.id, "number");
        }
      };
      const onKeydown = (e) => {
        const tb = e.target.closest?.("[data-tab]");
        if (!tb) return;
        const ids = TABS.map((x) => x.id);
        let i = ids.indexOf(tb.dataset.tab);
        const keys = { ArrowRight: 1, ArrowLeft: -1 };
        if (e.key in keys) i = (i + keys[e.key] + ids.length) % ids.length; else return;
        e.preventDefault();
        $(`[data-tab="${ids[i]}"]`, el).focus();
      };
      el.addEventListener("click", onClick);
      el.addEventListener("input", onInput);
      el.addEventListener("change", onChange);
      el.addEventListener("submit", onSubmit);
      el.addEventListener("keydown", onKeydown);

      const here = (id) => branch() && id === branch().id;
      const refreshMember = (memberId) => { if (view === "member" && picked?.memberId === memberId) paintPanel(); };
      const offs = [
        store.on("cafe:status", ({ cafeId }) => { if (here(cafeId)) paintHead(); }),
        store.on("cafe:pause", ({ cafeId }) => { if (!here(cafeId)) return; paintHead(); if (tab === "orders") paintOrders(); if (view === "member") paintPanel(); }),
        store.on("redeem", ({ entry }) => {
          if (!branch()) return;
          if (here(entry.cafeId)) { A.refreshAutoBusy(branch().id); paintRecent(); }
          refreshMember(entry.memberId);
          if (view === "find" && query && tab === "counter") paintPanel();
        }),
        store.on("undo", ({ entry }) => { if (!branch()) return; if (here(entry.cafeId)) paintRecent(); refreshMember(entry.memberId); }),
        store.on("pickup", ({ order, prev, quiet }) => {
          if (!branch() || !here(order.cafeId)) return;
          paintOrdersCount();
          if (tab === "orders") paintOrders({ freshId: !prev ? order.id : null, focusId: el.contains(document.activeElement) && document.activeElement.dataset?.advance === order.id ? order.id : null });
          if (quiet) return;
          const name = S.pickupDrinkName(order);
          if (!prev && order.status === "placed") ui.toast(`New pickup order: ${order.memberName}, ${name}.`, { iconName: "clock", duration: 4200 });
          else if (order.status === "cancelled") ui.toast(`${order.memberName} cancelled their ${name}.`, { iconName: "info" });
        }),
        store.on("plan", ({ member: m }) => refreshMember(m.id)),
        store.on("profile", ({ memberId }) => { refreshMember(memberId); if (view === "find" && query) paintPanel(); }),
        store.on("order", ({ memberId }) => {
          if (view !== "member" || picked?.memberId !== memberId || drink?.source === "pick") return;
          drink = defaultDrink(member()); paintPanel();
        }),
        store.on("menu", ({ branchId }) => { if (here(branchId) && view === "member") paintPanel(); }),
        store.on("brand", ({ brandId }) => { if (brand()?.id !== brandId) return; if (!staffOn() || !branch()) return renderAll(); paintHead(); if (view === "member") paintPanel(); }),
        store.on("tick", () => {
          if (!branch()) return;
          A.refreshAutoBusy(branch().id);
          paintHead();
          if (tab === "orders") ui.refreshRelativeTimes?.(el);
        }),
        store.on("snapshot", () => { if (view === "find") renderAll(); }),
      ];

      /* Keep the counter awake during service when installed as the café app.
         Released when hidden; asked for again on return. Silent where unsupported. */
      const installed = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
      let wakeLock = null;
      async function keepAwake() {
        if (!installed() || !("wakeLock" in navigator) || document.visibilityState !== "visible" || wakeLock) return;
        try { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); } catch (_) { wakeLock = null; }
      }
      const onVisible = () => { if (document.visibilityState === "visible") keepAwake(); };
      document.addEventListener("visibilitychange", onVisible);
      keepAwake();

      function clearTimers() { clearTimeout(resetTimer); clearInterval(undoTimer); }
      if (branch()) A.refreshAutoBusy(branch().id);
      api = { renderAll: () => { tab = "counter"; view = "find"; query = ""; picked = null; done = null; renderAll(); } };
      renderAll();

      return () => {
        api = null;
        LCC.partnerScope = null;
        document.removeEventListener("visibilitychange", onVisible);
        if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
        clearTimers(); stopScan();
        offs.forEach((off) => off());
        el.removeEventListener("click", onClick);
        el.removeEventListener("input", onInput);
        el.removeEventListener("change", onChange);
        el.removeEventListener("submit", onSubmit);
        el.removeEventListener("keydown", onKeydown);
      };
    },
    update(path) {
      // #/cafe/<branchId> from the presenter menu while the counter is open
      const id = path[0];
      if (id && store.select.branch(id) && store.getState().counter.branchId !== id) {
        store.actions.setCounterBranch(id);
        api?.renderAll();
      }
    },
  });
})();
