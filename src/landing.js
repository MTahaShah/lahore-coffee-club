/* =====================================================================
   Lahore Coffee Club — landing.js
   Landing page (#/). Replaces the Pass 1 shell in router.js.

   Live pieces read the shared store: the Build-your-own teaser prices
   with select.customPrice() (the same function the app uses), and the
   busy map shows current café statuses, updating as cafés change them.
   Both forms open WhatsApp with the details filled in.
   ===================================================================== */
(function () {
  "use strict";
  const LCC = window.LCC;
  const { store, fmt, ui } = LCC;
  const { html, raw, $, $$, icon } = ui;
  const S = store.select;

  const WHATSAPP_NUMBER = "923100008242";
  const TEASER_CAFES = ["kiln", "slowpour", "noon"];
  const ESTIMATOR = {
    members: { min: 10, max: 200, step: 5, value: 40 },
    visits: { min: 1, max: 8, step: 1, value: 3 },
    rate: { min: 300, max: 700, step: 10, value: 450 },
  };

  const waLink = (text) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
  const digits = (s) => String(s).replace(/\D/g, "");
  const formatPhone = (s) => { const d = digits(s).slice(0, 11); return d.length > 4 ? `${d.slice(0, 4)} ${d.slice(4)}` : d; };

  /** Monthly payout for the café estimator: what they enter, nothing else. */
  const estimate = ({ members, visits, rate }) => ({ cups: members * visits, payout: members * visits * rate });

  /* -------------------------------------------------------------------
     Forms: fields, checks and the WhatsApp message
     ------------------------------------------------------------------- */
  const CHECKS = {
    required: (label) => (v) => (String(v).trim() ? "" : `Please add ${label}.`),
    phone: (v) => (/^03\d{9}$/.test(digits(v)) ? "" : "Enter an 11-digit mobile number starting with 03, like 0300 1234567."),
    area: (v) => (v ? "" : "Choose an area."),
  };

  const FORMS = {
    partner: {
      fields: [
        { id: "cafe", label: "Café name", autocomplete: "organization", check: CHECKS.required("your café’s name") },
        { id: "owner", label: "Owner’s name", autocomplete: "name", check: CHECKS.required("the owner’s name") },
        { id: "area", label: "Area", type: "area", check: CHECKS.area },
        { id: "phone", label: "WhatsApp number", type: "phone", check: CHECKS.phone },
      ],
      message: (v) => `New café partner: ${v.cafe.trim()}, owner ${v.owner.trim()}, ${v.area}, ${formatPhone(v.phone)}`,
      save: (v) => {
        // BACKEND: POST /partners { cafe, owner, area, phone }
        store.actions.requestPartnerCall(v);
      },
      thanks: (v) => `Thanks, ${v.owner.trim().split(/\s+/)[0]}.`,
      line: "WhatsApp should have opened with your details. Press send there, and we’ll message you to set up a call.",
    },
    waitlist: {
      fields: [
        { id: "name", label: "Your name", autocomplete: "name", check: CHECKS.required("your name") },
        { id: "phone", label: "WhatsApp number", type: "phone", check: CHECKS.phone },
        { id: "area", label: "Area", type: "area", check: CHECKS.area },
        { id: "fav", label: "Favourite café", hint: "Optional. Any café in Lahore, member or not.", autocomplete: "off" },
      ],
      message: (v) => `Waitlist: ${v.name.trim()}, ${v.area}, ${formatPhone(v.phone)}${v.fav.trim() ? `, favourite café: ${v.fav.trim()}` : ""}`,
      save: (v) => {
        // BACKEND: POST /waitlist { name, phone, area, favourite }
        store.actions.joinWaitlist(v);
      },
      thanks: (v) => `You’re on the list, ${v.name.trim().split(/\s+/)[0]}.`,
      line: "WhatsApp should have opened with your details. Press send there, and we’ll message you when the club opens.",
    },
  };

  function fieldHtml(form, f) {
    const id = `${form}-${f.id}`;
    const describedBy = [f.hint && `${id}-hint`, `${id}-err`].filter(Boolean).join(" ");
    let control;
    if (f.type === "area") {
      control = html`<span class="select"><select class="input" id="${id}" name="${f.id}" aria-describedby="${describedBy}">
        <option value="">Choose an area</option>
        ${store.getState().areas.map((a) => html`<option>${a.name}</option>`)}
        <option>Somewhere else</option>
      </select></span>`;
    } else if (f.type === "phone") {
      control = html`<input class="input num" id="${id}" name="${f.id}" inputmode="tel" autocomplete="tel-national" placeholder="03XX XXXXXXX" aria-describedby="${describedBy}">`;
    } else {
      control = html`<input class="input" id="${id}" name="${f.id}" autocomplete="${f.autocomplete || "on"}" aria-describedby="${describedBy}">`;
    }
    return html`<div class="field" data-field="${f.id}">
      <label class="field__label" for="${id}">${f.label}</label>
      ${control}
      ${f.hint ? html`<p class="field__hint" id="${id}-hint">${f.hint}</p>` : ""}
      <p class="field__error" id="${id}-err"></p>
    </div>`;
  }

  function formHtml(form) {
    const def = FORMS[form];
    return html`<form class="lp-form" data-form="${form}" novalidate>
      ${def.fields.map((f) => fieldHtml(form, f))}
      <div class="lp-form__send">
        <button type="submit" class="btn btn--primary btn--block">Send on WhatsApp</button>
        <p class="t-small t-faint">This opens WhatsApp with your details filled in. Nothing is sent until you press send there.</p>
      </div>
    </form>`;
  }

  /* -------------------------------------------------------------------
     Sections
     ------------------------------------------------------------------- */
  function sectionHead(n, id, title, intro) {
    return html`<div class="lp-head">
      <p class="eyebrow num">${String(n).padStart(2, "0")}</p>
      <h2 class="t-h1" id="${id}-h">${title}</h2>
      ${intro ? html`<p class="t-body t-muted measure">${intro}</p>` : ""}
    </div>`;
  }

  function plansTable() {
    return html`<table class="lp-table">
      <caption class="sr-only">Explorer plans</caption>
      <thead><tr><th scope="col">Explorer</th><th scope="col" class="num">A month</th><th scope="col" class="num lp-table__per">A cup</th></tr></thead>
      <tbody>
        ${store.getState().tiers.map((t) => html`<tr>
          <th scope="row"><span class="t-h3">${t.name}</span><span class="t-small t-muted">${fmt.cups(t.cups)} · ${t.line}</span></th>
          <td class="num t-h3">${fmt.rs(t.price)}</td>
          <td class="num t-small t-muted lp-table__per">about ${fmt.rs(t.price / t.cups)}</td>
        </tr>`)}
      </tbody>
    </table>`;
  }

  function teaserHtml() {
    const b = store.getState().builder;
    const max = store.getState().rules.maxCupsPerCafe;
    return html`<div class="card lp-teaser">
      <div class="lp-teaser__head">
        <h3 class="t-h3">My cafés</h3>
        <p class="t-small t-muted">Reserve cups at the cafés you love. You pay ${Math.round(store.getState().rules.customDiscount * 100)}% of the counter price.</p>
      </div>
      <ul role="list">
        ${TEASER_CAFES.map((id) => {
          const c = S.cafe(id);
          return html`<li class="row">
            <div class="row__main"><div class="row__title">${c.name}</div><div class="row__meta num">${S.area(c.area).name} · ${fmt.rs(c.price)} at the counter</div></div>
            ${ui.stepper({ id, value: b[id] || 0, min: 0, max, label: `Cups a month at ${c.name}` })}
          </li>`;
        })}
      </ul>
      <div class="lp-teaser__sum">
        <p class="t-small"><span class="num" data-teaser-cups>0</span> a month</p>
        <p class="t-h2 num" data-teaser-price aria-live="polite">Rs 0</p>
      </div>
      <p class="t-small t-muted" data-teaser-note aria-live="polite"></p>
      <a class="btn btn--secondary btn--block" href="#/app/plan" data-teaser-go>Build your plan in the app</a>
    </div>`;
  }

  function busyMapHtml() {
    const M = LCC.memberMap;
    return html`<div class="lp-map">
      ${M ? html`<div class="map lp-map__map" aria-hidden="true">
        ${M.svg()}
        ${S.cafes().map((c) => {
          const p = M.project(c.x, c.y);
          const side = M.labelSide[c.id];
          return html`<span class="pin${side ? ` pin--${side}` : ""}" data-lp-pin="${c.id}" data-status="${c.status}"
            style="left:${(p.x / M.width * 100).toFixed(2)}%;top:${(p.y / M.height * 100).toFixed(2)}%">
            <span class="pin__dot">${ui.cupIcon(c.status, { size: 18, cls: "pin__icon" })}</span>
            <span class="pin__name">${c.pinName || c.name}</span>
          </span>`;
        })}
      </div>` : ""}
      <ul role="list" class="lp-map__list" aria-label="How busy each café is now">
        ${S.cafes().map((c) => html`<li class="row"><div class="row__main"><div class="row__title">${c.name}</div><div class="row__meta">${c.branch || S.area(c.area).name}</div></div>${ui.statusPill(c.id, { time: false })}</li>`)}
      </ul>
    </div>`;
  }

  function sliderHtml(id, label, fmtValue) {
    const o = ESTIMATOR[id];
    return html`<div class="lp-slider">
      <div class="lp-slider__top">
        <label class="field__label" for="est-${id}">${label}</label>
        <output class="num" for="est-${id}" data-est-out="${id}">${fmtValue(o.value)}</output>
      </div>
      <input type="range" id="est-${id}" data-est="${id}" min="${o.min}" max="${o.max}" step="${o.step}" value="${o.value}" aria-valuetext="${fmtValue(o.value)}">
      <div class="lp-slider__ends t-micro t-faint num" aria-hidden="true"><span>${fmtValue(o.min)}</span><span>${fmtValue(o.max)}</span></div>
    </div>`;
  }
  const EST_FMT = {
    members: (n) => `${n} members`,
    visits: (n) => `${n} ${n === 1 ? "visit" : "visits"} each`,
    rate: (n) => `${fmt.rs(n)} a cup`,
  };

  const FAQ = [
    ["How does redeeming a cup work?", "Open the Pass tab and show the QR code at the counter, or read out the six-digit code. The barista enters it on their screen and the cup comes off your month. The code changes every 30 seconds, so a screenshot won’t work."],
    ["What happens to cups I don’t use?", "They don’t roll over. Each month starts fresh on your renewal date, so pick a plan that matches how much coffee you actually drink. You can change plans whenever you like."],
    ["Can I cancel?", "Yes, from the app, at any time. You won’t be charged again, and you keep your cups until the end of the month you’ve paid for."],
    ["Which cafés are part of it?", "This prototype shows eight independent cafés across Gulberg, Liberty, Fortress, DHA, Model Town and Johar Town. They’re examples while we sign up our first partners."],
    ["How are cafés paid?", "Once a month, for every cup redeemed at their counter, at the rate per cup they set when they join. Members pay us, and we pay the café."],
    ["How do I pay?", "JazzCash, Easypaisa, or a debit or credit card. You pay once a month, on the day you joined."],
    ["Is it live yet?", "Not yet. This is a working prototype: the prices and cafés are for demonstration, and no payment is taken. Join the waitlist and we’ll message you on WhatsApp when the club opens."],
  ];

  /* -------------------------------------------------------------------
     Surface
     ------------------------------------------------------------------- */
  LCC.router.register("", {
    title: null,
    mount(el) {
      const est = { members: ESTIMATOR.members.value, visits: ESTIMATOR.visits.value, rate: ESTIMATOR.rate.value };
      const scrollLink = (id, label, cls) => html`<a class="${cls}" href="#/" data-scroll="${id}">${label}</a>`;

      el.innerHTML = html`
        <div class="surface landing lp">
          <header class="container landing-nav">
            <a class="wordmark" href="#/" aria-label="Lahore Coffee Club, home">${ui.logo("wordmark", { label: null })}</a>
            <nav class="landing-nav__links" aria-label="Main">
              ${scrollLink("how", "How it works", "landing-nav__link")}
              ${scrollLink("plans", "Plans", "landing-nav__link")}
              ${scrollLink("partner", "For cafés", "landing-nav__link")}
              ${scrollLink("join", "Join the waitlist", "btn btn--primary btn--compact")}
            </nav>
          </header>

          <div class="container">
            <section class="lp-hero" aria-labelledby="hero-h">
              <div class="lp-hero__mark">${ui.logo("wordmark")}</div>
              <h1 class="t-display lp-hero__title" id="hero-h">Every café you love. One monthly pass.</h1>
              <p class="t-body t-muted lp-hero__sub">Pick your places, pick your cups. Pay once, drink well all month.</p>
              <div class="lp-hero__actions">
                ${scrollLink("join", "Join the waitlist", "btn btn--primary")}
                ${scrollLink("partner", "I run a café", "btn btn--secondary")}
              </div>
            </section>

            <section class="landing-section lp-section" id="how" aria-labelledby="how-h">
              ${sectionHead(1, "how", "How it works")}
              <ol class="lp-steps" role="list">
                <li><span class="lp-steps__n num" aria-hidden="true">01</span><div><h3 class="t-h3">Choose a plan</h3><p class="t-body t-muted">Explore with one pool of cups for any café, or reserve cups at the cafés you already like. Plans start at six cups a month.</p></div></li>
                <li><span class="lp-steps__n num" aria-hidden="true">02</span><div><h3 class="t-h3">Show your pass</h3><p class="t-body t-muted">At the counter, open the app and show your QR code, or read out the six-digit code. It changes every 30 seconds.</p></div></li>
                <li><span class="lp-steps__n num" aria-hidden="true">03</span><div><h3 class="t-h3">Enjoy your coffee</h3><p class="t-body t-muted">The barista taps once and the cup comes off your month. Nothing to pay at the till.</p></div></li>
              </ol>
            </section>

            <section class="landing-section lp-section" id="plans" aria-labelledby="plans-h">
              ${sectionHead(2, "plans", "Plans", "Two ways to drink well. Both renew monthly; unused cups don’t roll over.")}
              <dl class="lp-types">
                <div><dt class="t-h3">Explorer</dt><dd class="t-body t-muted">One pool of cups for any partner café, up to ${store.getState().rules.explorerCapPerCafe} a month at each, so you keep finding new places.</dd></div>
                <div><dt class="t-h3">My cafés</dt><dd class="t-body t-muted">Reserve cups at the cafés you love, up to ${store.getState().rules.maxCupsPerCafe} at each, and pay less per cup. They’re only for those cafés.</dd></div>
              </dl>
              <div class="lp-plans">
                ${plansTable()}
                ${teaserHtml()}
              </div>
            </section>

            <section class="landing-section lp-section" id="map" aria-labelledby="map-h">
              ${sectionHead(3, "map", "Know before you go", "See how busy a café is before you leave home.")}
              ${busyMapHtml()}
              <p class="t-small t-faint lp-caption">Cafés update this themselves from the counter. <a href="#/app/map">Open the map in the app</a>.</p>
            </section>

            <section class="landing-section lp-section" id="gifting" aria-labelledby="gifting-h">
              ${sectionHead(4, "gifting", "Gifting and loyalty")}
              <div class="lp-two">
                <div><h3 class="t-h3">Send a cup</h3><p class="t-body t-muted">Give a friend up to three cups from your month, for one café or any of them. They get a link on WhatsApp, and the gift keeps for 60 days.</p></div>
                <div><h3 class="t-h3">Come back for a complimentary cup</h3><p class="t-body t-muted">Every fifth visit to the same café, the next cup is on the house, paid for by the café, not your plan. Try five different cafés and you earn the Explorer badge.</p></div>
              </div>
            </section>

            <section class="landing-section lp-section" id="club" aria-labelledby="club-h">
              ${sectionHead(5, "club", "The club", "A membership should feel like one. Here’s what members will have when we open.")}
              <dl class="lp-points">
                <div><dt class="t-h3">A member number</dt><dd class="t-body t-muted">Every member gets a number, in the order they join. It’s on your card in the app, and the barista sees it when you show your pass.</dd></div>
                <div><dt class="t-h3">Founding Members</dt><dd class="t-body t-muted">The first ${store.getState().club.foundingLimit} members are Founding Members. It stays on their card for good, and they book first for gatherings.</dd></div>
                <div><dt class="t-h3">A gathering every month</dt><dd class="t-body t-muted">Members meet at one of the partner cafés: a cupping, a brew class, a slow Saturday morning. Seats are limited, and you RSVP in the app.</dd></div>
                <div><dt class="t-h3">Earned by coming back</dt><dd class="t-body t-muted">Status, badges and a passport of the cafés you’ve tried, all from the cups you actually drink. Cafés add their own perks.</dd></div>
              </dl>
              <p class="t-small t-faint lp-caption">The first gathering happens once the club opens. <a href="#/app/circles">See the Circles tab in the app</a>.</p>
            </section>

            <section class="landing-section lp-section" id="partner" aria-labelledby="partner-h">
              ${sectionHead(6, "partner", "For cafés", "We send you regulars. You serve them coffee. You get paid monthly, per cup, at a rate you set.")}
              <dl class="lp-points">
                <div><dt class="t-h3">Guaranteed cups</dt><dd class="t-body t-muted">Members who build their own plan commit cups to your café for the month, so you know what to expect.</dd></div>
                <div><dt class="t-h3">New customers</dt><dd class="t-body t-muted">Members go looking for somewhere new. Your screen tells you when it’s someone’s first visit.</dd></div>
                <div><dt class="t-h3">Monthly payouts</dt><dd class="t-body t-muted">We pay you once a month for every cup redeemed, at the rate per cup you choose.</dd></div>
                <div><dt class="t-h3">No special hardware</dt><dd class="t-body t-muted">The café screen runs in a browser on any phone or tablet you already have.</dd></div>
              </dl>

              <div class="lp-partner">
                <div class="card lp-est" aria-labelledby="est-h">
                  <h3 class="t-h3" id="est-h">What could a month look like?</h3>
                  <p class="t-small t-muted">Move the sliders to your own numbers. This only shows what you enter.</p>
                  ${sliderHtml("members", "Members visiting a month", EST_FMT.members)}
                  ${sliderHtml("visits", "Visits per member", EST_FMT.visits)}
                  ${sliderHtml("rate", "Your rate per cup", EST_FMT.rate)}
                  <div class="lp-est__out">
                    <p class="t-small t-muted">Monthly payout</p>
                    <p class="t-display num lp-est__total" data-est-total data-value="0" aria-live="polite">${fmt.rs(0)}</p>
                    <p class="t-small t-faint num" data-est-meta></p>
                  </div>
                  <a class="btn btn--secondary btn--block" href="#/cafe">See the café screen</a>
                </div>

                <div class="lp-form-wrap" aria-labelledby="partner-form-h">
                  <h3 class="t-h3" id="partner-form-h">Talk to us about joining</h3>
                  <div data-form-slot="partner">${formHtml("partner")}</div>
                </div>
              </div>
            </section>

            <section class="landing-section lp-section" id="join" aria-labelledby="join-h">
              ${sectionHead(7, "join", "Join the waitlist", "We’re opening with a small group of members first. Leave your number and we’ll message you on WhatsApp when there’s a place.")}
              <div class="lp-form-wrap lp-form-wrap--narrow" data-form-slot="waitlist">${formHtml("waitlist")}</div>
            </section>

            <section class="landing-section lp-section" id="faq" aria-labelledby="faq-h">
              ${sectionHead(8, "faq", "Questions")}
              <div class="lp-faq" data-accordion>
                ${FAQ.map(([q, a], i) => html`<div class="lp-faq__item">
                  <h3 class="lp-faq__q">
                    <button type="button" id="faq-b${i}" aria-expanded="false" aria-controls="faq-p${i}" data-faq>
                      <span>${q}</span>${icon("chevronDown", { size: 20 })}
                    </button>
                  </h3>
                  <div class="lp-faq__a" id="faq-p${i}" role="region" aria-labelledby="faq-b${i}" hidden><p class="t-body t-muted measure">${a}</p></div>
                </div>`)}
              </div>
            </section>
          </div>

          <footer class="lp-footer">
            <div class="container lp-footer__inner">
              <span class="wordmark">${ui.logo("wordmark")}</span>
              <p class="t-small t-muted">Prototype: prices and cafés are for demonstration.</p>
              <nav class="lp-footer__links t-small" aria-label="Prototype">
                <a href="#/app">Member app</a><a href="#/cafe">Café view</a>
              </nav>
            </div>
          </footer>
        </div>`;

      /* ---------------- Build-your-own teaser ---------------- */
      function paintTeaser(animate) {
        const alloc = Object.fromEntries(TEASER_CAFES.map((id) => [id, store.getState().builder[id] || 0]));
        // The same function the app's builder uses
        const p = S.customPrice(alloc);
        const cupsEl = $("[data-teaser-cups]", el), priceEl = $("[data-teaser-price]", el);
        cupsEl.textContent = fmt.cups(p.cups);
        if (animate) ui.animateNumber(priceEl, p.price, { format: fmt.rs });
        else { priceEl.textContent = fmt.rs(p.price); priceEl.dataset.value = p.price; }
        $("[data-teaser-note]", el).classList.toggle("is-save", p.meetsMinimum);
        $("[data-teaser-note]", el).textContent = p.meetsMinimum
          ? `You save ${fmt.rs(p.savings)} vs paying at the counter.`
          : `Add ${fmt.cups(p.cupsShort)}: plans start at ${store.getState().rules.minCupsTotal} cups a month.`;
        TEASER_CAFES.forEach((id) => { const s = $(`[data-stepper="${id}"]`, el); if (s) ui.setStepper(s, alloc[id]); });
      }

      /* ---------------- Estimator ---------------- */
      function paintEstimate(animate) {
        const e = estimate(est);
        const total = $("[data-est-total]", el);
        if (animate) ui.animateNumber(total, e.payout, { format: fmt.rs, duration: 500 });
        else { total.textContent = fmt.rs(e.payout); total.dataset.value = e.payout; }
        $("[data-est-meta]", el).textContent = `${fmt.num(est.members)} members × ${est.visits} ${est.visits === 1 ? "visit" : "visits"} = ${fmt.num(e.cups)} cups, at ${fmt.rs(est.rate)} each`;
      }

      /* ---------------- Forms ---------------- */
      function showError(form, id, msg) {
        const f = $(`[data-form="${form}"] [data-field="${id}"]`, el);
        if (!f) return;
        f.dataset.invalid = String(!!msg);
        $(".field__error", f).textContent = msg;
        $("input, select", f).setAttribute("aria-invalid", String(!!msg));
      }
      const fieldDef = (form, id) => FORMS[form].fields.find((f) => f.id === id);

      function submit(formEl) {
        const form = formEl.dataset.form;
        const def = FORMS[form];
        const values = Object.fromEntries(def.fields.map((f) => [f.id, formEl.elements[f.id].value]));
        const bad = def.fields.filter((f) => f.check && f.check(values[f.id]));
        def.fields.forEach((f) => f.check && showError(form, f.id, f.check(values[f.id])));
        if (bad.length) { formEl.elements[bad[0].id].focus(); return; }
        values.phone = formatPhone(values.phone);
        def.save(values);
        const url = waLink(def.message(values));
        window.open(url, "_blank", "noopener");
        const slot = $(`[data-form-slot="${form}"]`, el);
        slot.innerHTML = html`<div class="lp-thanks" role="status" tabindex="-1">
          <svg class="check-draw" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" pathLength="1"/><path d="M15 24.5l6 6 12-13" pathLength="1"/></svg>
          <p class="t-h2">${def.thanks(values)}</p>
          <p class="t-body t-muted">${def.line}</p>
          <a class="btn btn--link" href="${url}" target="_blank" rel="noopener" data-wa-again>Open WhatsApp again</a>
        </div>`.s;
        $(".lp-thanks", slot).focus({ preventScroll: true });
      }

      /* ---------------- Accordion ---------------- */
      function toggleFaq(btn, open = btn.getAttribute("aria-expanded") !== "true") {
        btn.setAttribute("aria-expanded", String(open));
        document.getElementById(btn.getAttribute("aria-controls")).hidden = !open;
      }

      /* ---------------- Events ---------------- */
      const onClick = (e) => {
        const t = e.target;
        const step = t.closest("[data-step]");
        if (step) {
          const id = step.closest("[data-stepper]").dataset.stepper;
          store.actions.setBuilderCups(id, (store.getState().builder[id] || 0) + Number(step.dataset.step));
          return;
        }
        if (t.closest("[data-teaser-go]")) {
          // Open the app's builder with these cups already in it
          LCC.appPlan?.start({ mode: "mycafes", keepBuilder: true });
          return; // the link itself navigates to #/app/plan
        }
        const faq = t.closest("[data-faq]");
        if (faq) toggleFaq(faq);
      };

      // Accordion headers: Up/Down move between questions, Home/End jump (WAI-ARIA pattern)
      const onKeydown = (e) => {
        const btn = e.target.closest?.("[data-faq]");
        if (!btn) return;
        const all = $$("[data-faq]", el);
        let i = all.indexOf(btn);
        if (e.key === "ArrowDown") i = (i + 1) % all.length;
        else if (e.key === "ArrowUp") i = (i - 1 + all.length) % all.length;
        else if (e.key === "Home") i = 0;
        else if (e.key === "End") i = all.length - 1;
        else return;
        e.preventDefault();
        all[i].focus();
      };

      const onInput = (e) => {
        const t = e.target;
        if (t.matches("[data-est]")) {
          const id = t.dataset.est;
          est[id] = Number(t.value);
          const label = EST_FMT[id](est[id]);
          $(`[data-est-out="${id}"]`, el).textContent = label;
          t.setAttribute("aria-valuetext", label);
          paintEstimate(true);
          return;
        }
        const formEl = t.closest("[data-form]");
        if (!formEl) return;
        const def = fieldDef(formEl.dataset.form, t.name);
        if (def?.type === "phone") { const v = formatPhone(t.value); if (v !== t.value) t.value = v; }
        // Clear an error as soon as it's fixed
        if (def?.check && t.closest(".field").dataset.invalid === "true") showError(formEl.dataset.form, t.name, def.check(t.value));
      };

      const onFocusOut = (e) => {
        const t = e.target;
        const formEl = t.closest?.("[data-form]");
        if (!formEl || !t.name || !t.value) return;
        const def = fieldDef(formEl.dataset.form, t.name);
        if (def?.check) showError(formEl.dataset.form, t.name, def.check(t.value));
      };

      const onSubmit = (e) => {
        if (!e.target.matches("[data-form]")) return;
        e.preventDefault();
        submit(e.target);
      };

      el.addEventListener("click", onClick);
      el.addEventListener("keydown", onKeydown);
      el.addEventListener("input", onInput);
      el.addEventListener("change", onInput); // selects
      el.addEventListener("focusout", onFocusOut);
      el.addEventListener("submit", onSubmit);

      const offs = [
        store.on("builder", () => paintTeaser(true)),
        // Pills update themselves; the map pins are ours
        store.on("cafe:status", ({ cafeId, status }) => {
          const pin = $(`[data-lp-pin="${cafeId}"]`, el);
          if (!pin) return;
          pin.dataset.status = status;
          $(".pin__icon", pin).outerHTML = ui.cupIcon(status, { size: 18, cls: "pin__icon" }).s;
          pin.classList.remove("is-changed"); void pin.offsetWidth; pin.classList.add("is-changed");
        }),
      ];

      paintTeaser(false);
      paintEstimate(false);

      return () => {
        offs.forEach((off) => off());
        el.removeEventListener("click", onClick);
        el.removeEventListener("keydown", onKeydown);
        el.removeEventListener("input", onInput);
        el.removeEventListener("change", onInput);
        el.removeEventListener("focusout", onFocusOut);
        el.removeEventListener("submit", onSubmit);
      };
    },
  });

  LCC.landing = { estimate, waLink }; // for tests and the kit
})();
