/* =====================================================================
   Lahore Coffee Club — app-plan.js
   Member app: plan picker (#/app/plan) and simulated payment
   (#/app/plan/pay): the LCC Pass (default) and cup packs ("At selected
   cafés"). Prices come from store.select.quote(), which reads data.js
   PLAN_CONFIG and PLANS: one source of truth for this screen and #/kit.
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
     Draft: what the member is about to buy.
     mode: "pass" (LCC Pass, the default) or "packs" (cup packs, at
     selected cafés). Packs are plan.type "explorer" with tierId = the
     pack id. My cafés and the old Explorer tiers are no longer sold;
     legacy Double Shot plans aren't either.
     ------------------------------------------------------------------- */
  const draft = { started: false, mode: "pass", passTier: "pass", tierId: "classic8", highlight: null };

  const pay = {
    method: "jazzcash",
    phone: "",
    card: { number: "", exp: "", cvc: "" },
    phase: "form", // form | processing | success | failed
    result: null,
    forMember: null, // whose number pre-fills the wallet field
  };
  const onboarding = () => !!LCC.onboarding?.active();
  const cfg = () => S.planConfig();
  const packs = () => store.getState().tiers;
  const canBuy = (t) => !(t.oncePerPerson && S.trialUsed());

  /** mode: open on "pass" or "packs" (anything else: the member's own kind,
      else the Pass). addCafe is accepted from older links and ignored. */
  function start({ mode = null } = {}) {
    const cur = S.member().plan;
    draft.started = true;
    draft.mode = mode === "pass" || mode === "packs" ? mode : cur?.type === "explorer" ? "packs" : "pass";
    draft.passTier = cur?.type === "pass" && cur.tier === "plus" ? "plus" : "pass";
    const own = cur?.type === "explorer" && packs().find((t) => t.id === cur.tierId);
    draft.tierId = own && canBuy(own) ? own.id : "classic8";
    pay.phase = "form";
    if (pay.forMember !== S.member().id) {
      pay.forMember = S.member().id;
      pay.phone = formatPhone(String(S.member().phone || "").replace(/^\+92\s?/, "0"));
    }
  }
  LCC.appPlan = { start, draft };

  // The Pass purchase entry records tier "pass" or "plus" (state.js setPlan)
  const draftPlan = () => (draft.mode === "pass" ? { type: "pass", tier: draft.passTier } : { type: "explorer", tierId: draft.tierId });
  /** "1 member coffee a day" / "2 member coffees a day, at the same visit" */
  const perDay = (T) => (T.dailyLimit === 1 ? "1 member coffee a day" : `${T.dailyLimit} member coffees a day, at the same visit`);
  LCC.passCopy = { perDay };

  /** Why Continue is off, or null: already on the Pass; a pack with cups still left. */
  function blocked() {
    const m = S.member();
    const plan = draftPlan();
    if (!S.isCurrentPlan(plan)) return null;
    if (plan.type === "pass") return `You’re on the ${S.passTier(plan).name}. ${S.planDateLine(m)}.`;
    const left = Math.max(0, S.balance().left);
    return left > 0 ? `You have ${fmt.cups(left)} left on this pack. ${S.planDateLine(m)}.` : null;
  }

  /* -------------------------------------------------------------------
     Plan picker
     ------------------------------------------------------------------- */
  REG.plan = (ctx) => {
    const { view } = ctx;
    const m = ctx.member();

    /* LCC Pass and LCC Pass Plus: two cards, side by side when there's room */
    function passHtml() {
      const { pass: P, plus: X } = cfg();
      const pct = Math.round(P.discount * 100);
      const cur = S.member().plan;
      const card = (T, line) => html`<label class="card pass-offer pass-tier">
          <input class="sr-only" type="radio" name="passtier" value="${T.tier}" ${draft.passTier === T.tier ? raw("checked") : ""}>
          <span class="eyebrow">${T.name}${cur?.type === "pass" && (cur.tier || "pass") === T.tier ? html`<span class="sr-only">, your plan</span>` : ""}</span>
          <span class="pass-offer__price"><span class="t-h1 num">${fmt.rs(T.price)}</span> <span class="t-small t-muted">a month, tax included</span></span>
          <span class="t-body">${perDay(T)}</span>
          <span class="t-small t-muted">${line}</span>
          <span class="t-small pass-tier__back">${T.paysBack}</span>
        </label>`;
      return html`
        <fieldset class="pass-tiers">
          <legend class="sr-only">${P.name} or ${X.name}</legend>
          ${card(P, `${pct}% off any drink, at any partner café.`)}
          ${card(X, `A second coffee every day for ${fmt.rs(X.price - P.price)} more. Bring a friend.`)}
        </fieldset>
        <p class="t-small t-muted plan-intro">Show your pass, and the barista takes ${pct}% off. You pay the café the member price. Renew from the app each month. Cancel any time.</p>`;
    }

    /* Cup packs: one list, two quiet groups --------------------------------- */
    function packsHtml() {
      const cur = S.member().plan;
      const groups = [...new Set(packs().map((t) => t.maxBand))].map((band) => ({ band: S.band(band), list: packs().filter((t) => t.maxBand === band) }));
      return html`
        <p class="t-small t-muted plan-intro">Prepaid cups at selected cafés. They last ${cfg().packDays} days and don’t renew. Use them at any partner café, all at one if you like. One cup a day.</p>
        <fieldset class="plan-groups">
          <legend class="sr-only">Cup packs</legend>
          ${groups.map((g) => html`<div class="plan-group">
            <p class="eyebrow plan-group__label">${g.band.label} <span class="t-faint num">· drinks up to ${fmt.rs(g.band.maxPrice)}</span></p>
            <div class="plan-rows">
              ${g.list.map((t) => {
                const off = !canBuy(t);
                return html`<label class="plan-row${off ? " is-off" : ""}">
                  <input class="sr-only" type="radio" name="tier" value="${t.id}" ${draft.tierId === t.id ? raw("checked") : ""} ${off ? raw("disabled") : ""}>
                  <span class="plan-row__text"><span class="plan-row__name">${t.name}</span>${cur?.type === "explorer" && cur.tierId === t.id ? html`<span class="sr-only">, your pack</span>` : ""}
                    <span class="t-small t-muted num">${off ? "Once per person, already used" : `${fmt.cups(t.cups)} · ${fmt.rs(Math.round(t.price / t.cups))} a cup${t.oncePerPerson ? " · once per person" : ""}`}</span></span>
                  <span class="plan-row__price num">${fmt.rs(t.price)}</span>
                </label>`;
              })}
            </div>
          </div>`)}
        </fieldset>
        <p class="plan-bands">${LCC.bandsGuide.link("What’s in Classic and Signature")}</p>`;
    }

    function paintBody() {
      $("[data-plan-body]", view).innerHTML = (draft.mode === "pass" ? passHtml() : packsHtml()).s;
    }

    function paintSummary(animate = true) {
      const q = S.quote(draftPlan());
      const planEl = $("[data-sum-plan]", view);
      const priceEl = $("[data-sum-price]", view);
      planEl.textContent = draft.mode === "pass" ? `${q.name} · a month` : `Cup pack · ${q.name} · ${fmt.cups(q.cups)}`;
      if (animate) ui.animateNumber(priceEl, q.price, { format: fmt.rs });
      else { priceEl.textContent = fmt.rs(q.price); priceEl.dataset.value = q.price; }
      const note = $("[data-sum-note]", view);
      const btn = $("[data-continue]", view);
      const why = blocked();
      const text = why
        || (draft.mode === "pass" ? S.passTier(draftPlan()).paysBack : q.savings > 0 ? `You save about ${fmt.rs(q.savings)} vs the counter` : `${fmt.cups(q.cups)} for ${cfg().packDays} days`);
      note.textContent = text;
      note.classList.remove("is-warn");
      note.classList.toggle("is-save", !why);
      btn.disabled = !!why;
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
      if (e.target.closest("[data-continue]")) {
        pay.phase = "form";
        ctx.go("#/app/plan/pay");
      }
    }

    function onChange(e) {
      if (e.target.name === "passtier") { draft.passTier = e.target.value === "plus" ? "plus" : "pass"; return paintSummary(); }
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
                ? html`<p class="t-small t-muted num">A new plan starts today; cups left on a pack don’t carry over.</p>`
                : html`<p class="t-small t-muted">A monthly pass for money off, or prepaid cups. You can change whenever you like.</p>`}
            </div>
            ${ui.segmented({ name: "plantype", label: "Plan type", value: draft.mode, options: [{ value: "pass", label: "LCC Pass" }, { value: "packs", label: "Cup packs" }] })}
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
        if (!draft.started) start();
        paintBody();
        paintSummary(false);
        view.addEventListener("click", onClick);
        view.addEventListener("change", onChange);
        return () => {
          view.removeEventListener("click", onClick);
          view.removeEventListener("change", onChange);
        };
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
    if (!q.meetsMinimum || blocked()) return { redirect: "#/app/plan" };
    let alive = true;
    const isPass = plan.type === "pass";
    // The Pass renews monthly; a pack ends after packDays
    const renewal = isPass ? store.addMonths(Date.now(), 1) : Date.now() + cfg().packDays * 24 * 60 * 60 * 1000;
    const planTitle = isPass ? q.name : `Cup pack · ${q.name}`;
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
        const title = isPass ? `You’re on the ${q.name}.` : `Your ${q.name} is ready.`;
        const line = isPass
          ? `${perDay(S.passTier(plan))}, ${Math.round(cfg().pass.discount * 100)}% off, from today. Renews on ${longDate(mem.renewsAt)}.`
          : `${fmt.cups(S.balance(mem.id).total)}, fresh from today. Use by ${longDate(mem.renewsAt)}.`;
        return html`<div class="pay-state" role="status">
          <svg class="check-draw" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" pathLength="1"/><path d="M15 24.5l6 6 12-13" pathLength="1"/></svg>
          <h2 class="t-h2">${title}</h2>
          <p class="t-body t-muted num">${line}</p>
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
        else if (res.ok) ctx.toast(isPass ? `You’re on the ${q.name}.` : `Your ${q.name} is ready. ${fmt.cups(q.cups)} to enjoy.`);
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
                <span class="t-h3">${planTitle}</span>
                <span class="t-h3 num">${fmt.rs(q.price)}</span>
              </div>
              ${isPass
                ? html`<p class="t-small t-muted num">A month, starting today. Renews on ${longDate(renewal)}.</p>
                    <p class="t-micro t-faint num">${Math.round(cfg().pass.discount * 100)}% off · ${perDay(S.passTier(plan))} · any drink, any partner café · tax included</p>`
                : html`<p class="t-small t-muted num">${fmt.cups(q.cups)}, starting today. Use by ${longDate(renewal)}; doesn’t renew.</p>
                    <p class="t-micro t-faint num">Selected partner cafés · Covers: ${S.coversLabel(S.planBand(plan))}, drinks up to ${fmt.rs(S.band(S.planBand(plan)).maxPrice)}</p>`}
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
