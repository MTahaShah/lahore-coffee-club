/* =====================================================================
   Lahore Coffee Club — app-plan.js
   Member app: plan picker (#/app/plan) and simulated payment
   (#/app/plan/pay). Prices always come from store.select.quote(), which
   uses select.customPrice() for My cafés: one source of truth for
   this screen, the landing teaser and #/kit.
   ===================================================================== */
(function () {
  "use strict";
  const LCC = window.LCC;
  const { store, fmt, ui } = LCC;
  const { html, raw, $, $$, icon } = ui;
  const S = store.select;
  const A = store.actions;
  const REG = (LCC.appScreens = LCC.appScreens || {});
  const rules = () => store.getState().rules;

  /* -------------------------------------------------------------------
     Draft: what the member is about to buy. The custom allocation is the
     store's builder, so the kit's builder shows the same numbers.
     ------------------------------------------------------------------- */
  // mode: "explorer" (Explorer tiers, one pool) or "mycafes" (cups reserved per café,
  // each café with its band). Legacy Double Shot plans are not for sale.
  const draft = { started: false, mode: "explorer", tierId: "regular", highlight: null };
  const DEFAULT_ADD = 2; // cups added for a café chosen from the sheet or its page

  const pay = {
    method: "jazzcash",
    phone: "",
    card: { number: "", exp: "", cvc: "" },
    phase: "form", // form | processing | success | failed
    result: null,
    forMember: null, // whose number pre-fills the wallet field
  };
  const onboarding = () => !!LCC.onboarding?.active();

  /** mode: open on "explorer" or "mycafes". addCafe: a café (or chain branch) to
      add to My cafés. keepBuilder: keep the builder as it is (the landing teaser
      hands over its cups) instead of loading the current plan. */
  function start({ addCafe = null, mode = null, keepBuilder = false } = {}) {
    const st = store.getState();
    const cur = S.member().plan;
    const venue = addCafe ? S.venueOf(addCafe) : null;
    // A second "Add to my plan" in this session adds to the draft instead of starting over
    const keep = keepBuilder || (venue && draft.started && draft.mode === "mycafes");
    draft.started = true;
    draft.mode = mode || (venue ? "mycafes" : cur?.type === "mycafes" ? "mycafes" : "explorer");
    draft.tierId = cur?.type === "explorer" ? cur.tierId : "regular";
    draft.highlight = venue;
    if (!keep) A.setBuilder(cur?.type === "mycafes" ? cur.allocation : {}, cur?.type === "mycafes" ? cur.bands : {});
    if (venue && !st.builder[venue]) A.setBuilderCups(venue, DEFAULT_ADD);
    pay.phase = "form";
    if (pay.forMember !== S.member().id) {
      pay.forMember = S.member().id;
      pay.phone = formatPhone(String(S.member().phone || "").replace(/^\+92\s?/, "0"));
    }
  }
  LCC.appPlan = { start, draft };

  const draftPlan = () =>
    draft.mode === "explorer"
      ? { type: "explorer", tierId: draft.tierId }
      : { type: "mycafes", allocation: { ...store.getState().builder }, bands: { ...store.getState().builderBands } };

  const isCurrent = () => S.isCurrentPlan(draftPlan());
  const whyMinimum = () =>
    `Plans start at ${rules().minCupsTotal} cups a month, so every café can count on you as a regular.`;

  /* -------------------------------------------------------------------
     Plan picker
     ------------------------------------------------------------------- */
  REG.plan = (ctx) => {
    const { view, el } = ctx;
    const m = ctx.member();
    let sheet = null;     // the "Add a café" sheet
    let sheetQuery = "";

    /* Explorer: one list, two quiet groups ------------------------------ */
    function tiersHtml() {
      const cur = S.member().plan;
      const classic = store.getState().bands[0].id;
      const groups = [
        { label: "Classic", tiers: store.getState().tiers.filter((t) => t.maxBand === classic) },
        { label: "More of the menu", tiers: store.getState().tiers.filter((t) => t.maxBand !== classic) },
      ];
      return html`
        <p class="t-small t-muted plan-intro">One pool of cups for any partner café, up to ${rules().explorerCapPerCafe} a month at each. Good for trying new places.</p>
        <fieldset class="plan-groups">
          <legend class="sr-only">Explorer plans</legend>
          ${groups.map((g) => html`<div class="plan-group">
            <p class="eyebrow plan-group__label">${g.label}</p>
            <div class="plan-rows">
              ${g.tiers.map((t) => html`<label class="plan-row">
                <input class="sr-only" type="radio" name="tier" value="${t.id}" ${draft.tierId === t.id ? raw("checked") : ""}>
                <span class="plan-row__text"><span class="plan-row__name">${t.name}</span>${cur?.type === "explorer" && cur.tierId === t.id ? html`<span class="sr-only">, your plan</span>` : ""}
                  <span class="t-small t-muted num">${fmt.cups(t.cups)} · ${fmt.rs(t.price / t.cups)} a cup · ${S.coversLabel(t.maxBand)}</span></span>
                <span class="plan-row__price num">${fmt.rs(t.price)}</span>
              </label>`)}
            </div>
          </div>`)}
        </fieldset>
        <p class="t-micro t-faint num">${bandsLine()}</p>`;
    }

    /** One quiet line on how bands work, from the store's bands. */
    function bandsLine() {
      const b = store.getState().bands;
      return `Every drink has a band by its menu price: ${b.map((x) => `${x.label} up to ${fmt.rs(x.maxPrice)}`).join(", ")}. Above your plan’s band, you pay the difference at the café.`;
    }

    /* My cafés: cafés added one by one ---------------------------------- */
    const bandFor = (id) => S.band(store.getState().builderBands[id]).id;
    function rowMeta(id) {
      const b = S.band(bandFor(id));
      return `${fmt.rs(b.myCafesPrice)} a cup · ${b.label} drinks up to ${fmt.rs(b.maxPrice)}`;
    }
    function builderRowHtml(id) {
      const n = store.getState().builder[id] || 0;
      const v = S.venue(id);
      const bands = S.venueBands(id);
      return html`<li class="builder-row${draft.highlight === id ? " is-new" : ""}" data-builder-row="${id}">
        <div class="builder-row__head">
          <span class="row__title">${v.name}</span>
          <button type="button" class="btn btn--link builder-row__remove" data-remove-cafe="${id}" aria-label="Remove ${v.name}">Remove</button>
        </div>
        <div class="builder-row__controls">
          <p class="t-small t-muted num" data-row-meta>${rowMeta(id)}</p>
          ${ui.stepper({ id, value: n, min: 1, max: rules().maxCupsPerCafe, label: `Cups a month at ${v.name}` })}
        </div>
        ${ui.segmented({ name: `band-${id}`, label: `Band at ${v.name}`, value: bandFor(id), options: bands.map((b) => ({ value: b.id, label: b.label })) })}
      </li>`;
    }
    function builderHtml() {
      const ids = Object.keys(store.getState().builder);
      if (!ids.length) {
        return html`<div class="builder-empty">
          <p class="t-body">Pick the cafés you love. Choose cups for each.</p>
          <button type="button" class="btn btn--secondary" data-add-cafe>Add a café</button>
        </div>`;
      }
      return html`
        <p class="t-small t-muted plan-intro">Cups reserved at each café, up to ${rules().maxCupsTotal} a month in all, and only for that café. Choose the drinks each café’s cups cover.</p>
        <ul role="list" class="builder-list">${ids.map(builderRowHtml)}</ul>
        <button type="button" class="btn btn--link builder-add" data-add-cafe>Add a café</button>
        <p class="t-small t-muted" data-builder-full hidden>That’s ${rules().maxCupsTotal} cups, the most for one month. Take a cup off a café to add another.</p>`;
    }

    /* The "Add a café" sheet: search and the list ----------------------- */
    function sheetListHtml() {
      const added = store.getState().builder;
      const q = sheetQuery.trim().toLowerCase();
      const list = S.venues().filter((v) => !added[v.id] && (!q || `${v.name} ${S.area(v.area)?.name || ""}`.toLowerCase().includes(q)));
      return list.length
        ? html`${list.map((v) => html`<li><button type="button" class="row add-cafe-row" data-pick-cafe="${v.id}">
            <span class="row__main"><span class="row__title">${v.name}</span><span class="row__meta">${S.brand(v.brandId)?.plans?.length ? `${S.branches(v.brandId).length} branches, any of them` : S.area(v.area)?.name || ""}</span></span>
          </button></li>`)}`
        : html`<li class="t-small t-muted">${q ? `No café matches “${sheetQuery}”.` : "Every café is in your plan."}</li>`;
    }
    function sheetHtml() {
      return html`
        <div class="sheet__scrim" data-sheet-close></div>
        <div class="sheet__panel">
          <div class="sheet__handle" aria-hidden="true"></div>
          <div class="sheet__body add-cafe-sheet">
            <div class="badges-sheet__bar">
              <h2 class="t-h3" id="add-cafe-title">Add a café</h2>
              <button type="button" class="icon-btn" data-sheet-close aria-label="Close">${icon("close")}</button>
            </div>
            <label class="sr-only" for="add-cafe-q">Search cafés</label>
            <input class="input" id="add-cafe-q" type="search" placeholder="Search cafés" value="${sheetQuery}" autocomplete="off" data-add-cafe-q>
            <ul role="list" class="add-cafe-list" data-add-cafe-list>${sheetListHtml()}</ul>
          </div>
        </div>`;
    }
    function openAddSheet(btn) {
      btn.focus(); // closing returns here (Safari doesn't focus on tap)
      sheetQuery = "";
      sheet.innerHTML = sheetHtml().s;
      ui.openSheet(sheet);
    }
    function onSheetClick(e) {
      const pick = e.target.closest("[data-pick-cafe]");
      if (!pick) return;
      const id = pick.dataset.pickCafe;
      A.setBuilderCups(id, DEFAULT_ADD);
      draft.highlight = id;
      ui.closeSheet(sheet);
      paintBody();
      paintSummary();
      $(`[data-builder-row="${id}"] [data-step="1"]`, view)?.focus({ preventScroll: true });
      $(`[data-builder-row="${id}"]`, view)?.scrollIntoView({ block: "center", behavior: ui.reducedMotion() ? "auto" : "smooth" });
    }
    function onSheetInput(e) {
      if (!e.target.matches("[data-add-cafe-q]")) return;
      sheetQuery = e.target.value;
      $("[data-add-cafe-list]", sheet).innerHTML = sheetListHtml().s;
    }

    function paintBody() {
      $("[data-plan-body]", view).innerHTML = (draft.mode === "explorer" ? tiersHtml() : builderHtml()).s;
      if (draft.mode === "mycafes") paintLimit();
    }
    /** 30 cups a month is the most: grey out every plus and swap "Add a café" for a note. */
    function paintLimit() {
      const full = S.customPrice().atMaximum;
      const b = store.getState().builder;
      $$("[data-builder-row]", view).forEach((row) => {
        const id = row.dataset.builderRow;
        if (b[id]) ui.setStepper($("[data-stepper]", row), b[id], full);
      });
      const add = $(".builder-add", view), note = $("[data-builder-full]", view);
      if (add) add.hidden = full;
      if (note) note.hidden = !full;
    }

    function paintSummary(animate = true) {
      const q = S.quote(draftPlan());
      const planEl = $("[data-sum-plan]", view);
      const priceEl = $("[data-sum-price]", view);
      planEl.textContent = draft.mode === "explorer" ? `Explorer · ${q.name} · ${fmt.cups(q.cups)}` : `My cafés · ${fmt.cups(q.cups)}`;
      if (animate) ui.animateNumber(priceEl, q.price, { format: fmt.rs });
      else { priceEl.textContent = fmt.rs(q.price); priceEl.dataset.value = q.price; }

      const note = $("[data-sum-note]", view);
      const btn = $("[data-continue]", view);
      let text, warn = false, ok = true;
      if (!q.meetsMinimum) {
        text = q.cups ? `Add ${fmt.cups(q.cupsShort)} to continue. ${whyMinimum()}` : "Add a café to start.";
        warn = !!q.cups; ok = false;
      } else if (isCurrent()) {
        text = `You’re on this plan. It renews on ${fmt.shortDate(m.renewsAt)}.`;
        ok = false;
      } else {
        text = `You save ${draft.mode === "explorer" ? "about " : ""}${fmt.rs(q.savings)} vs the counter`;
      }
      note.textContent = text;
      note.classList.toggle("is-warn", warn);
      note.classList.toggle("is-save", ok);
      btn.disabled = !ok;
    }

    function onClick(e) {
      const seg = e.target.closest(".segmented__option");
      const group = seg?.closest("[data-segmented]");
      if (group?.dataset.segmented === "plantype") {
        if (draft.mode === seg.dataset.value) return;
        ui.selectSegment(group, seg.dataset.value);
        draft.mode = seg.dataset.value;
        paintBody();
        paintSummary();
        return;
      }
      if (group?.dataset.segmented.startsWith("band-")) {
        ui.selectSegment(group, seg.dataset.value);
        A.setBuilderBand(group.dataset.segmented.slice(5), seg.dataset.value);
        return;
      }
      const step = e.target.closest("[data-step]");
      if (step) {
        const id = step.closest("[data-stepper]").dataset.stepper;
        A.setBuilderCups(id, Math.max(1, (store.getState().builder[id] || 0) + Number(step.dataset.step)));
        return;
      }
      const rm = e.target.closest("[data-remove-cafe]");
      if (rm) {
        A.setBuilderCups(rm.dataset.removeCafe, 0);
        paintBody();
        paintSummary();
        $("[data-add-cafe]", view)?.focus({ preventScroll: true });
        return;
      }
      const add = e.target.closest("[data-add-cafe]");
      if (add) { openAddSheet(add); return; }
      if (e.target.closest("[data-continue]")) {
        pay.phase = "form";
        ctx.go("#/app/plan/pay");
      }
    }

    function onChange(e) {
      if (e.target.name !== "tier") return;
      draft.tierId = e.target.value;
      paintSummary();
    }

    return {
      html: html`
        <div class="flow">
          <div class="screen-bar">
            <button type="button" class="icon-btn" data-back="${onboarding() ? "#/app/welcome" : "#/app"}" aria-label="Back">${icon("arrowLeft")}</button>
            ${onboarding() ? html`<span class="t-small t-faint">Step 5 of 6</span>` : ""}
          </div>
          <div class="app-screen flow__body">
            <div class="stack" style="--stack-gap:var(--space-2)">
              <h1 class="t-h2">Choose your plan</h1>
              ${m.plan
                ? html`<p class="t-small t-muted num">A new plan starts fresh today; unused cups don’t carry over.</p>`
                : html`<p class="t-small t-muted">Two ways to drink well. Your month starts the day you pay, and you can change plans whenever you like.</p>`}
            </div>
            ${ui.segmented({ name: "plantype", label: "Plan type", value: draft.mode, options: [{ value: "explorer", label: "Explorer" }, { value: "mycafes", label: "My cafés" }] })}
            <div class="plan-body" data-plan-body></div>
          </div>
          <div class="summary-bar" role="region" aria-label="Plan summary">
            <div class="summary-bar__nums">
              <p class="t-small" data-sum-plan></p>
              <p class="t-h2 num" data-sum-price aria-live="polite">Rs 0</p>
            </div>
            <p class="t-small t-muted summary-bar__note" data-sum-note aria-live="polite"></p>
            <button type="button" class="btn btn--primary btn--block" data-continue>Continue to payment</button>
          </div>
        </div>`.s,
      mount() {
        paintBody();
        paintSummary(false);
        if (draft.highlight && draft.mode === "mycafes") {
          const row = $(`[data-builder-row="${draft.highlight}"]`, view);
          requestAnimationFrame(() => row?.scrollIntoView({ block: "center", behavior: ui.reducedMotion() ? "auto" : "smooth" }));
        }
        sheet = document.createElement("div");
        sheet.className = "sheet";
        sheet.id = "add-cafe-sheet";
        sheet.setAttribute("role", "dialog");
        sheet.setAttribute("aria-modal", "true");
        sheet.setAttribute("aria-labelledby", "add-cafe-title");
        sheet.setAttribute("aria-hidden", "true");
        $(".phone__screen", el).appendChild(sheet);
        sheet.addEventListener("click", onSheetClick);
        sheet.addEventListener("input", onSheetInput);
        view.addEventListener("click", onClick);
        view.addEventListener("change", onChange);
        return () => {
          view.removeEventListener("click", onClick);
          view.removeEventListener("change", onChange);
          ui.closeSheet(sheet);
          sheet.remove();
        };
      },
      on: {
        builder: () => {
          if (draft.mode !== "mycafes") return;
          const b = store.getState().builder;
          $$("[data-builder-row]", view).forEach((row) => {
            const id = row.dataset.builderRow;
            if (!b[id]) return;
            $("[data-row-meta]", row).textContent = rowMeta(id);
          });
          paintLimit();
          paintSummary();
        },
      },
    };
  };

  /* -------------------------------------------------------------------
     Payment (simulated)
     ------------------------------------------------------------------- */
  const METHODS = [
    { id: "jazzcash",  label: "JazzCash",  line: "Mobile wallet",  icon: "wallet" },
    { id: "easypaisa", label: "Easypaisa", line: "Mobile wallet",  icon: "wallet" },
    { id: "card",      label: "Card",      line: "Debit or credit", icon: "card" },
  ];
  const methodLabel = (id) => METHODS.find((x) => x.id === id).label;

  /* Formatting and checks: format only, no real validation ------------ */
  const digits = (s) => String(s).replace(/\D/g, "");
  function formatPhone(s) { const d = digits(s).slice(0, 11); return d.length > 4 ? `${d.slice(0, 4)} ${d.slice(4)}` : d; }
  function formatCard(s) { return digits(s).slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 "); }
  /** “0828” -> “08/28”. Typing “4” gives “04/”. While deleting, the slash isn’t re-added. */
  function formatExp(s, deleting = false) {
    let d = digits(s).slice(0, 4);
    if (!deleting && d.length === 1 && Number(d) > 1) d = `0${d}`;
    if (d.length > 2 || (d.length === 2 && !deleting)) return `${d.slice(0, 2)}/${d.slice(2)}`;
    return d;
  }
  const CHECKS = {
    phone: (v) => (/^03\d{9}$/.test(digits(v)) ? "" : "Enter an 11-digit number starting with 03, like 0300 1234567."),
    number: (v) => (digits(v).length === 16 ? "" : "Enter the 16 digits on the front of your card."),
    exp(v) {
      const mt = /^(\d{2})\/(\d{2})$/.exec(v.trim());
      if (!mt || +mt[1] < 1 || +mt[1] > 12) return "Use MM/YY, like 08/28.";
      const now = new Date();
      const y = 2000 + +mt[2], mo = +mt[1];
      if (y < now.getFullYear() || (y === now.getFullYear() && mo < now.getMonth() + 1)) return "That card has expired. Try another one.";
      return "";
    },
    cvc: (v) => (/^\d{3,4}$/.test(v.trim()) ? "" : "The 3 digits on the back of your card."),
  };
  // Shared with pickup orders (app-order.js), which pay the same simulated way
  LCC.payKit = { METHODS, methodLabel, digits, formatPhone, formatCard, formatExp, CHECKS };

  REG.pay = (ctx) => {
    const { view } = ctx;
    if (!draft.started) return { redirect: "#/app/plan" };
    const plan = draftPlan();
    const q = S.quote(plan);
    if (!q.meetsMinimum) return { redirect: "#/app/plan" };
    let alive = true;
    const renewal = store.addMonths(Date.now(), 1);
    const longDate = (ts) => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

    function field({ id, label, value, placeholder, inputmode = "numeric", autocomplete, hint }) {
      return html`<div class="field" data-field="${id}">
        <label class="field__label" for="pay-${id}">${label}</label>
        <input class="input num" id="pay-${id}" name="${id}" value="${value}" placeholder="${placeholder}" inputmode="${inputmode}" autocomplete="${autocomplete}" aria-describedby="pay-${id}-err${hint ? ` pay-${id}-hint` : ""}">
        ${hint ? html`<p class="field__hint" id="pay-${id}-hint">${hint}</p>` : ""}
        <p class="field__error" id="pay-${id}-err"></p>
      </div>`;
    }

    function fieldsHtml() {
      if (pay.method === "card") {
        return html`
          ${field({ id: "number", label: "Card number", value: pay.card.number, placeholder: "1234 5678 9012 3456", autocomplete: "cc-number" })}
          <div class="field-pair">
            ${field({ id: "exp", label: "Expiry", value: pay.card.exp, placeholder: "MM/YY", autocomplete: "cc-exp" })}
            ${field({ id: "cvc", label: "CVC", value: pay.card.cvc, placeholder: "123", autocomplete: "cc-csc" })}
          </div>`;
      }
      return field({
        id: "phone", label: `${methodLabel(pay.method)} mobile number`, value: pay.phone, placeholder: "03XX XXXXXXX", inputmode: "tel", autocomplete: "tel-national",
        hint: `You’ll approve the payment in the ${methodLabel(pay.method)} app.`,
      });
    }

    function formHtml() {
      return html`
        <form class="pay-form" data-pay-form novalidate>
          <fieldset class="method-list">
            <legend class="field__label">Pay with</legend>
            ${METHODS.map((x) => html`
              <label class="method">
                <input class="sr-only" type="radio" name="method" value="${x.id}" ${pay.method === x.id ? raw("checked") : ""}>
                <span class="method__icon">${icon(x.icon, { size: 22 })}</span>
                <span class="method__text"><span class="row__title">${x.label}</span><span class="row__meta">${x.line}</span></span>
                <span class="method__tick" aria-hidden="true">${icon("check", { size: 18 })}</span>
              </label>`)}
          </fieldset>
          <div class="stack" style="--stack-gap:var(--space-4)" data-pay-fields>${fieldsHtml()}</div>
          <div class="proto-note">
            ${icon("info", { size: 18 })}
            <p><strong>Prototype: no payment is taken.</strong></p>
          </div>
          <button type="submit" class="btn btn--primary btn--block num">Pay ${fmt.rs(q.price)}</button>
        </form>`;
    }

    function stateHtml() {
      if (pay.phase === "processing") {
        const who = pay.method === "card" ? "Checking your card" : `Waiting for ${methodLabel(pay.method)}`;
        const line = pay.method === "card" ? "This takes a few seconds." : `Approve the request sent to ${pay.phone}.`;
        return html`<div class="pay-state" role="status">
          <span class="spinner" aria-hidden="true"></span>
          <p class="t-h3">${who}</p>
          <p class="t-small t-muted num">${line}</p>
        </div>`;
      }
      if (pay.phase === "success") {
        const mem = ctx.member();
        const title = plan.type === "brand" ? `You’re on ${q.typeName}, ${q.name}.` : plan.type === "explorer" ? `You’re on Explorer ${q.name}.` : "Your cafés are set.";
        return html`<div class="pay-state" role="status">
          <svg class="check-draw" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" pathLength="1"/><path d="M15 24.5l6 6 12-13" pathLength="1"/></svg>
          <h2 class="t-h2">${title}</h2>
          <p class="t-body t-muted num">${fmt.cups(S.balance(mem.id).total)}, fresh from today. Renews on ${longDate(mem.renewsAt)}.</p>
          <div class="pay-state__actions">
            <button type="button" class="btn btn--primary btn--block" data-done="#/app/pass">Show my pass</button>
            <button type="button" class="btn btn--secondary btn--block" data-done="#/app">Back to home</button>
          </div>
        </div>`;
      }
      if (pay.phase === "failed") {
        return html`<div class="pay-state" role="alert">
          <span class="pay-state__mark" aria-hidden="true">${icon("info", { size: 28 })}</span>
          <h2 class="t-h2">Payment didn’t go through.</h2>
          <p class="t-body t-muted">${methodLabel(pay.method)} couldn’t confirm it, and nothing was taken. Check the number, or try another way to pay.</p>
          <div class="pay-state__actions">
            <button type="button" class="btn btn--primary btn--block" data-try-again>Try again</button>
          </div>
        </div>`;
      }
      return formHtml();
    }

    function paint() {
      $("[data-pay-body]", view).innerHTML = stateHtml().s;
      const back = $("[data-pay-back]", view);
      back.disabled = pay.phase === "processing";
      back.hidden = pay.phase === "success";
      if (pay.phase !== "form") $("[data-pay-body]", view).querySelector("button, [role]")?.focus?.({ preventScroll: true });
    }

    function showError(id, msg) {
      const f = $(`[data-field="${id}"]`, view);
      if (!f) return;
      f.dataset.invalid = String(!!msg);
      $(".field__error", f).textContent = msg;
      $("input", f).setAttribute("aria-invalid", String(!!msg));
    }

    const fieldIds = () => (pay.method === "card" ? ["number", "exp", "cvc"] : ["phone"]);
    const valueOf = (id) => (id === "phone" ? pay.phone : pay.card[id]);

    function onInput(e) {
      const inp = e.target;
      if (!inp.matches("[data-pay-fields] input")) return;
      const id = inp.name;
      const deleting = (e.inputType || "").startsWith("delete");
      let v = inp.value;
      if (id === "phone") v = formatPhone(v);
      else if (id === "number") v = formatCard(v);
      else if (id === "exp") v = formatExp(v, deleting);
      else if (id === "cvc") v = digits(v).slice(0, 4);
      if (v !== inp.value) inp.value = v;
      if (id === "phone") pay.phone = v; else pay.card[id] = v;
      // Clear an error as soon as the value is fixed
      if (inp.closest(".field").dataset.invalid === "true") showError(id, CHECKS[id](v));
    }

    function onFocusOut(e) {
      const inp = e.target;
      if (!inp.matches?.("[data-pay-fields] input") || !inp.value) return;
      showError(inp.name, CHECKS[inp.name](inp.value));
    }

    function onChange(e) {
      if (e.target.name !== "method") return;
      pay.method = e.target.value;
      $("[data-pay-fields]", view).innerHTML = fieldsHtml().s;
    }

    function onSubmit(e) {
      if (!e.target.matches("[data-pay-form]")) return;
      e.preventDefault();
      const bad = fieldIds().map((id) => [id, CHECKS[id](valueOf(id))]).filter(([, msg]) => msg);
      fieldIds().forEach((id) => showError(id, CHECKS[id](valueOf(id))));
      if (bad.length) { $(`#pay-${bad[0][0]}`, view).focus(); return; }
      pay.phase = "processing";
      paint();
      const account = pay.method === "card" ? pay.card.number : pay.phone;
      A.checkout({ plan, method: pay.method, account }).then((res) => {
        pay.phase = res.ok ? "success" : "failed";
        pay.result = res;
        if (res.ok) { draft.started = false; draft.highlight = null; }
        // A new member's first plan: their card is issued next
        if (res.ok && alive && onboarding()) { pay.phase = "form"; ctx.go("#/app/welcome/card", { replace: true }); return; }
        if (alive) paint();
        else if (res.ok) ctx.toast(`You’re on ${q.name}. ${fmt.cups(q.cups)} to enjoy.`);
      });
    }

    function onClick(e) {
      if (e.target.closest("[data-try-again]")) {
        pay.phase = "form";
        paint();
        $("[data-pay-fields] input", view)?.focus();
        return;
      }
      const done = e.target.closest("[data-done]");
      if (done) { pay.phase = "form"; ctx.go(done.dataset.done, { replace: true }); }
    }

    return {
      html: html`
        <div class="flow">
          <div class="screen-bar">
            <button type="button" class="icon-btn" data-back="#/app/plan" data-pay-back aria-label="Back">${icon("arrowLeft")}</button>
            ${onboarding() ? html`<span class="t-small t-faint">Step 6 of 6</span>` : ""}
          </div>
          <div class="app-screen flow__body">
            <h1 class="t-h2">Payment</h1>
            <div class="card pay-summary">
              <div class="pay-summary__row">
                <span class="t-h3">${plan.type === "brand" ? `${q.typeName} · ${q.name}` : plan.type === "explorer" ? `Explorer ${q.name}` : "My cafés"}</span>
                <span class="t-h3 num">${fmt.rs(q.price)}</span>
              </div>
              <p class="t-small t-muted num">${fmt.cups(q.cups)} a month, starting today. Renews on ${longDate(renewal)}.</p>
              ${plan.type === "explorer" ? html`<p class="t-micro t-faint num">Any partner café · Covers: ${S.coversLabel(S.planBand(plan))}, drinks up to ${fmt.rs(S.band(S.planBand(plan)).maxPrice)}</p>` : ""}
              ${plan.type === "mycafes" ? html`<p class="t-micro t-faint">${Object.entries(plan.allocation).map(([id, n]) => `${S.venueName(id)} ${n} ${S.band(plan.bands?.[id]).label}`).join(" · ")}</p>` : ""}
            </div>
            <div data-pay-body></div>
          </div>
        </div>`.s,
      mount() {
        paint();
        view.addEventListener("input", onInput);
        view.addEventListener("focusout", onFocusOut);
        view.addEventListener("change", onChange);
        view.addEventListener("submit", onSubmit);
        view.addEventListener("click", onClick);
        return () => {
          alive = false;
          view.removeEventListener("input", onInput);
          view.removeEventListener("focusout", onFocusOut);
          view.removeEventListener("change", onChange);
          view.removeEventListener("submit", onSubmit);
          view.removeEventListener("click", onClick);
        };
      },
    };
  };
})();
