/* =====================================================================
   Lahore Coffee Club — app-welcome.js
   First-run flow (#/app/welcome), then the plan picker and payment
   from app-plan.js, ending on the member card being issued
   (#/app/welcome/card).

     intro -> phone -> code (any 4 digits) -> name -> area
           -> #/app/plan -> #/app/plan/pay -> #/app/welcome/card

   The new member is created when the area step is done (they get the
   next member number then). Mumtaz stays exactly as she was; the
   presenter switcher's "Back to Mumtaz’s demo" returns to her.
   ===================================================================== */
(function () {
  "use strict";
  const LCC = window.LCC;
  const { store, fmt, ui } = LCC;
  const { html, raw, $, icon } = ui;
  const S = store.select;
  const A = store.actions;
  const REG = (LCC.appScreens = LCC.appScreens || {});

  const STEPS = ["intro", "phone", "code", "name", "area"];
  const fresh = () => ({ step: "intro", phone: "", code: "", name: "", area: "", invite: "", memberId: null, issued: false, inviteClaimed: false });
  let ob = fresh();

  const digits = (s) => String(s).replace(/\D/g, "");
  const formatPhone = (s) => { const d = digits(s).slice(0, 11); return d.length > 4 ? `${d.slice(0, 4)} ${d.slice(4)}` : d; };
  const inviteFromUrl = () => { const q = location.hash.split("?")[1]; return q ? (new URLSearchParams(q).get("invite") || "").toUpperCase() : ""; };

  /** True while a new member is between "Get started" and their card. */
  const active = () => !!ob.memberId && !ob.issued && S.member().id === ob.memberId;
  LCC.onboarding = {
    active,
    /** Presenter: start over as a brand-new member. */
    restart() { ob = fresh(); ob.invite = inviteFromUrl(); },
    /** Presenter: forget the flow (Back to Mumtaz’s demo). */
    reset() { ob = fresh(); },
  };

  const CHECKS = {
    phone: (v) => (/^03\d{9}$/.test(digits(v)) ? "" : "Enter an 11-digit mobile number starting with 03, like 0300 1234567."),
    code: (v) => (/^\d{4}$/.test(digits(v)) ? "" : "Enter the four digits from the text message."),
    name: (v) => (String(v).trim().length >= 2 ? "" : "Add the name you’d like on your card."),
    area: (v) => (v ? "" : "Choose the area you’re in most."),
    invite: (v) => (!String(v).trim() || S.inviter(v) ? "" : "That code doesn’t match a member. Check it, or leave it empty."),
  };

  /* -------------------------------------------------------------------
     Steps
     ------------------------------------------------------------------- */
  REG.welcome = (ctx) => {
    const { view } = ctx;
    // Arriving fresh (an invite link, or the switcher) after a finished flow: start over
    if (ob.issued) ob = fresh();
    if (!ob.invite) ob.invite = inviteFromUrl();
    // Came back from the plan picker: stay on the last step
    if (ob.memberId && ob.step === "intro") ob.step = "area";

    const stepNo = () => STEPS.indexOf(ob.step); // 1..4 after intro; plan is 5, payment 6

    function field({ id, label, value, type = "text", inputmode, autocomplete, placeholder, hint, cls = "" }) {
      return html`<div class="field" data-field="${id}">
        <label class="field__label" for="ob-${id}">${label}</label>
        <input class="input ${cls}" id="ob-${id}" name="${id}" type="${type}" value="${value}" ${inputmode ? raw(`inputmode="${inputmode}"`) : ""} autocomplete="${autocomplete || "off"}" ${placeholder ? raw(`placeholder="${ui.esc(placeholder)}"`) : ""} aria-describedby="ob-${id}-err${hint ? ` ob-${id}-hint` : ""}">
        ${hint ? html`<p class="field__hint" id="ob-${id}-hint">${hint}</p>` : ""}
        <p class="field__error" id="ob-${id}-err"></p>
      </div>`;
    }

    function stepHtml() {
      const inviter = ob.invite && S.inviter(ob.invite);
      if (ob.step === "intro") {
        return html`<div class="welcome-intro enter">
          <p class="eyebrow">Lahore Coffee Club</p>
          <h1 class="t-display welcome-intro__title">A membership for the city’s best cafés.</h1>
          <p class="t-body t-muted">One monthly pass, eight independent cafés, and a club that meets once a month.</p>
          ${inviter ? html`<p class="welcome-invite">${icon("gift", { size: 18 })}<span>${inviter.firstName} invited you. You’ll both get a free cup when you join.</span></p>` : ""}
          <button type="button" class="btn btn--primary btn--block" data-ob-next>Get started</button>
        </div>`;
      }
      if (ob.step === "phone") {
        return html`<form class="ob-form enter" data-ob-form novalidate>
          <h1 class="t-h2">Your mobile number</h1>
          <p class="t-small t-muted">We’ll text you a code to check it’s you. Your pass lives on this number.</p>
          ${field({ id: "phone", label: "Mobile number", value: ob.phone, type: "tel", inputmode: "tel", autocomplete: "tel-national", placeholder: "03XX XXXXXXX", cls: "num" })}
          <button type="submit" class="btn btn--primary btn--block">Send code</button>
        </form>`;
      }
      if (ob.step === "code") {
        return html`<form class="ob-form enter" data-ob-form novalidate>
          <h1 class="t-h2">Enter the code</h1>
          <p class="t-small t-muted num">Sent by text to ${ob.phone}. <button type="button" class="btn btn--link" data-ob-goto="phone">Change number</button></p>
          ${field({ id: "code", label: "Four-digit code", value: ob.code, inputmode: "numeric", autocomplete: "one-time-code", placeholder: "0000", cls: "code-input ob-code" })}
          <div class="proto-note">${icon("info", { size: 18 })}<p><strong>Prototype: any code works.</strong> No text is sent.</p></div>
          <button type="submit" class="btn btn--primary btn--block">Continue</button>
        </form>`;
      }
      if (ob.step === "name") {
        return html`<form class="ob-form enter" data-ob-form novalidate>
          <h1 class="t-h2">What should we call you?</h1>
          <p class="t-small t-muted">This goes on your member card, and baristas see your first name.</p>
          ${field({ id: "name", label: "Your name", value: ob.name, autocomplete: "name", placeholder: "Ayesha Khan" })}
          ${field({ id: "invite", label: "Invite code (optional)", value: ob.invite, autocomplete: "off", hint: "From a member who invited you. You both get a free cup.", cls: "num" })}
          <button type="submit" class="btn btn--primary btn--block">Continue</button>
        </form>`;
      }
      // area
      const areas = [...store.getState().areas.map((a) => ({ id: a.id, name: a.name })), { id: "elsewhere", name: "Somewhere else" }];
      return html`<form class="ob-form enter" data-ob-form novalidate>
        <h1 class="t-h2">Where do you drink coffee most?</h1>
        <p class="t-small t-muted">We’ll show the cafés near you first.</p>
        <fieldset class="area-pick" data-field="area">
          <legend class="sr-only">Favourite area</legend>
          ${areas.map((a) => html`<label class="chip area-chip">
            <input class="sr-only" type="radio" name="area" value="${a.id}" ${ob.area === a.id ? raw("checked") : ""}>
            <span>${a.name}</span>
          </label>`)}
          <p class="field__error" id="ob-area-err" role="alert"></p>
        </fieldset>
        <button type="submit" class="btn btn--primary btn--block">Choose a plan</button>
      </form>`;
    }

    function paint({ focus = true } = {}) {
      const n = stepNo();
      $("[data-ob-body]", view).innerHTML = stepHtml().s;
      $("[data-ob-progress]", view).innerHTML = n > 0 ? html`<span class="t-small t-faint">Step ${n} of 6</span>`.s : "";
      view.scrollTop = 0;
      if (focus) requestAnimationFrame(() => ($("[data-ob-body] input:not([type=radio])", view) || $("[data-ob-body] h1", view))?.focus?.({ preventScroll: true }));
    }

    function showError(id, msg) {
      const f = $(`[data-field="${id}"]`, view);
      if (!f) return;
      f.dataset.invalid = String(!!msg);
      const err = $(".field__error", f);
      if (err) err.textContent = msg;
      $("input", f)?.setAttribute("aria-invalid", String(!!msg));
    }

    const go = (step) => { ob.step = step; paint(); };

    function next() {
      if (ob.step === "intro") return go("phone");
      if (ob.step === "phone") {
        const msg = CHECKS.phone(ob.phone);
        showError("phone", msg);
        if (msg) return $("#ob-phone", view).focus();
        // BACKEND: POST /auth/otp { phone } (sends the text)
        return go("code");
      }
      if (ob.step === "code") {
        const msg = CHECKS.code(ob.code);
        showError("code", msg);
        if (msg) return $("#ob-code", view).focus();
        // BACKEND: POST /auth/verify { phone, code } -> session. Prototype: any 4 digits pass
        return go("name");
      }
      if (ob.step === "name") {
        const bad = ["name", "invite"].find((id) => CHECKS[id](ob[id]));
        ["name", "invite"].forEach((id) => showError(id, CHECKS[id](ob[id])));
        if (bad) return $(`#ob-${bad}`, view).focus();
        return go("area");
      }
      if (ob.step === "area") {
        const msg = CHECKS.area(ob.area);
        showError("area", msg);
        if (msg) return;
        const [firstName, ...rest] = ob.name.trim().split(/\s+/);
        const profile = { firstName, lastName: rest.join(" "), phone: `+92 ${digits(ob.phone).slice(1, 4)} ${digits(ob.phone).slice(4)}`, area: ob.area };
        // Went back a step after creating the member: update them, don't make another
        if (ob.memberId && S.member().id === ob.memberId) A.updateNewMember(ob.memberId, profile);
        else ob.memberId = A.beginNewMember(profile).id;
        LCC.appPlan.start({ mode: "explorer" });
        ctx.go("#/app/plan");
      }
    }

    function onInput(e) {
      const t = e.target;
      if (t.name === "phone") { const v = formatPhone(t.value); if (v !== t.value) t.value = v; ob.phone = v; }
      else if (t.name === "code") {
        const v = digits(t.value).slice(0, 4);
        if (v !== t.value) t.value = v;
        ob.code = v;
        if (v.length === 4) { showError("code", ""); next(); return; }
      } else if (t.name === "name") ob.name = t.value;
      else if (t.name === "invite") ob.invite = t.value.toUpperCase().replace(/\s+/g, "");
      else if (t.name === "area") { ob.area = t.value; showError("area", ""); return; }
      else return;
      if (CHECKS[t.name] && t.closest(".field")?.dataset.invalid === "true") showError(t.name, CHECKS[t.name](ob[t.name]));
    }
    function onFocusOut(e) {
      const t = e.target;
      if (t.name && t.name !== "area" && t.value && CHECKS[t.name]) showError(t.name, CHECKS[t.name](ob[t.name]));
    }
    function onSubmit(e) {
      if (!e.target.matches("[data-ob-form]")) return;
      e.preventDefault();
      next();
    }
    function onClick(e) {
      if (e.target.closest("[data-ob-next]")) return next();
      const to = e.target.closest("[data-ob-goto]");
      if (to) return go(to.dataset.obGoto);
      if (e.target.closest("[data-ob-back]")) {
        const i = STEPS.indexOf(ob.step);
        if (i > 0) go(STEPS[i - 1]);
        else ctx.back("#/app");
      }
    }

    return {
      html: html`
        <div class="flow welcome">
          <div class="screen-bar">
            <button type="button" class="icon-btn" data-ob-back aria-label="Back">${icon("arrowLeft")}</button>
            <span data-ob-progress></span>
          </div>
          <div class="app-screen flow__body" data-ob-body></div>
        </div>`.s,
      mount() {
        paint({ focus: false });
        view.addEventListener("input", onInput);
        view.addEventListener("change", onInput);
        view.addEventListener("focusout", onFocusOut);
        view.addEventListener("submit", onSubmit);
        view.addEventListener("click", onClick);
        return () => {
          view.removeEventListener("input", onInput);
          view.removeEventListener("change", onInput);
          view.removeEventListener("focusout", onFocusOut);
          view.removeEventListener("submit", onSubmit);
          view.removeEventListener("click", onClick);
        };
      },
    };
  };

  /* -------------------------------------------------------------------
     The card is issued (#/app/welcome/card)
     ------------------------------------------------------------------- */
  REG.issued = (ctx) => {
    const m = ctx.member();
    if (!m.live || !m.plan) return { redirect: "#/app" };
    // Done: the tab bar comes back from here on
    const first = !ob.issued;
    ob.issued = true;
    if (first && ob.invite && !ob.inviteClaimed) { A.claimInvite(ob.invite); ob.inviteClaimed = true; }
    const c = S.club(m.id);
    const p = S.memberPlan(m);
    const inviter = ob.invite && S.inviter(ob.invite);
    return {
      html: html`
        <div class="app-screen issued">
          <p class="eyebrow issued__eyebrow">Welcome to the club</p>
          <div class="issued__card">${LCC.memberCard(m.id, { issuing: true })}</div>
          <div class="issued__text">
            <h1 class="t-h2">You’re member <span class="num">${c.number}</span>.</h1>
            <p class="t-body t-muted">${c.founding
              ? `That makes you one of our Founding Members, the first ${store.getState().club.foundingLimit}. It stays on your card for good.`
              : "Your number is yours for as long as you’re a member."}</p>
            <p class="t-small t-muted num">${p.type === "explorer" ? `Explorer ${p.name}` : "My cafés"} · ${fmt.cups(S.balance(m.id).total)} this month${inviter ? `, including a free one from ${inviter.firstName}’s invite` : ""}.</p>
          </div>
          <div class="issued__actions">
            <button type="button" class="btn btn--primary btn--block" data-issued-go="#/app/pass">Show my pass</button>
            <button type="button" class="btn btn--secondary btn--block" data-issued-go="#/app/club">See the club</button>
          </div>
        </div>`.s,
      mount() {
        const onClick = (e) => { const b = e.target.closest("[data-issued-go]"); if (b) ctx.go(b.dataset.issuedGo, { replace: true }); };
        ctx.view.addEventListener("click", onClick);
        return () => ctx.view.removeEventListener("click", onClick);
      },
    };
  };
})();
