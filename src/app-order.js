/* =====================================================================
   Lahore Coffee Club — app-order.js
   Member app: pickup orders. Order ahead, collect at the counter.

     #/app/order        choose café (branch), drink, hot or iced, pickup
                        time, and how to pay: a cup, or the full price
     #/app/order/pay    simulated payment (full price, or a cup's top-up)

   Also the order status card (Home and the profile drawer):
   Placed → Being made → Ready → Collected, with a 6-digit pickup code.
   The store does the work (store.actions.placePickup / checkoutPickup /
   cancelPickup); the café moves orders on from #/cafe → Orders, and
   every change arrives here over sync like a redemption does.
   ===================================================================== */
(function () {
  "use strict";
  const LCC = window.LCC;
  const { store, fmt, ui } = LCC;
  const { html, raw, $, $$, icon } = ui;
  const S = store.select;
  const A = store.actions;
  const REG = (LCC.appScreens = LCC.appScreens || {});
  const kit = () => LCC.payKit; // from app-plan.js

  /* -------------------------------------------------------------------
     Draft: what the member is about to order
     ------------------------------------------------------------------- */
  const draft = { started: false, cafeId: null, drinkId: null, temp: "hot", when: "asap", pay: "cup" };
  const pay = { method: "jazzcash", phone: "", card: { number: "", exp: "", cvc: "" }, phase: "form", forMember: null, error: "" };
  const dismissed = new Set(); // rejected orders the member has closed (this device only)

  const venueOf = (c) => c.brandId || c.id;
  /** The member's last drink at this café (or brand), from orders and redemptions. */
  function lastDrink(m, cafe) {
    const same = (cafeId) => S.cafe(cafeId) && venueOf(S.cafe(cafeId)) === venueOf(cafe);
    const o = S.memberPickups(m.id).find((x) => same(x.cafeId));
    if (o) return { drinkId: o.drinkId, temp: o.temp };
    const e = S.activity(m.id, ["redeem"]).find((x) => same(x.cafeId));
    if (e) return { drinkId: e.drinkId, temp: e.temp || null };
    const pass = S.order(m.id);
    if (pass && pass.brandId === cafe.brandId) return { drinkId: pass.drinkId, temp: pass.temp };
    return null;
  }
  const hasDrink = (cafe, id) => cafe.drinks.some((d) => d.id === id);
  const firstDrink = (cafe) => (cafe.brandId ? (hasDrink(cafe, "ds-latte") ? "ds-latte" : cafe.drinks[0].id) : (cafe.drinks.find((d) => d.credits === 1) || cafe.drinks[0]).id);

  /** Where to start: where the member's cups work, nearest first, taking orders now. */
  function defaultCafe(m, brandId = null) {
    let pool;
    if (brandId) pool = S.branches(brandId).map((c) => c.id);
    else if (m.plan?.type === "brand") pool = S.branches(m.plan.brandId).map((c) => c.id);
    else if (m.plan?.type === "mycafes") pool = Object.entries(S.balance(m.id).perCafe).filter(([, b]) => b.left > 0).map(([id]) => id);
    else pool = S.clubCafes().map((c) => c.id);
    if (!pool.length) pool = S.clubCafes().map((c) => c.id);
    const ranked = pool.slice().sort((a, b) => S.cafe(a).distanceKm - S.cafe(b).distanceKm);
    return ranked.find((id) => S.pickupAvailable(id).ok) || ranked[0];
  }

  /** Begin an order. Any of cafeId, brandId (pick a branch), drinkId, temp. */
  function start({ cafeId = null, brandId = null, drinkId = null, temp = null } = {}) {
    const m = S.member();
    draft.started = true;
    draft.cafeId = cafeId && S.cafe(cafeId) ? cafeId : defaultCafe(m, brandId);
    const cafe = S.cafe(draft.cafeId);
    const last = lastDrink(m, cafe);
    draft.drinkId = drinkId && hasDrink(cafe, drinkId) ? drinkId : last && hasDrink(cafe, last.drinkId) ? last.drinkId : firstDrink(cafe);
    draft.temp = temp || (drinkId ? null : last?.temp) || "hot";
    draft.when = "asap";
    draft.pay = "cup";
    pay.phase = "form"; pay.error = "";
    if (pay.forMember !== m.id) {
      pay.forMember = m.id;
      pay.phone = kit() ? kit().formatPhone(String(m.phone || "").replace(/^\+92\s?/, "0")) : "";
    }
  }

  const quote = () => S.pickupQuote(S.member().id, draft.cafeId, draft.drinkId, draft.temp);
  /** "cup" unless the member chose to pay, or a cup can't cover this one. */
  const payWith = (q) => (draft.pay === "paid" || !q.cup.ok ? "paid" : "cup");
  const amountDue = (q) => (payWith(q) === "cup" ? q.topUp : q.price);
  function pickupChoice() {
    const avail = S.pickupAvailable(draft.cafeId);
    const t = avail.times || { asap: false, slots: [] };
    if (draft.when === "asap" && t.asap) return { asap: true, pickupAt: t.asapAt, label: "ASAP, about 10 min" };
    const slot = t.slots.find((x) => String(x.at) === String(draft.when)) || t.slots[0];
    return slot ? { asap: false, pickupAt: slot.at, label: `Pickup at ${slot.label}` } : { asap: true, pickupAt: t.asapAt, label: "ASAP, about 10 min" };
  }
  const orderFromDraft = () => {
    const q = quote();
    const w = pickupChoice();
    return { cafeId: draft.cafeId, drinkId: q.drinkId, temp: q.temp, asap: w.asap, pickupAt: w.pickupAt, pay: payWith(q) };
  };
  const placeLabel = (cafeId) => S.pickupPlace(cafeId);

  /* -------------------------------------------------------------------
     Order status card: Home and the drawer
     ------------------------------------------------------------------- */
  const STEPS = [["placed", "Placed"], ["making", "Being made"], ["ready", "Ready"], ["collected", "Collected"]];
  const NOTES = {
    placed: "Sent to the café. They’ll start on it shortly.",
    making: "Being made now.",
    ready: "Ready at the counter. Show your pickup code.",
  };
  const when = (o) => (o.asap ? `ASAP, about ${fmt.time(o.pickupAt)}` : `Pickup at ${fmt.time(o.pickupAt)}`);
  const payLine = (o) => (o.pay === "cup"
    ? (o.topUp ? `A cup + ${fmt.rs(o.topUp)} paid online` : "Paid with a cup")
    : `Paid ${fmt.rs(o.amount)} with ${o.payment?.method || "card"}`);
  const spaced = (code) => `${code.slice(0, 3)} ${code.slice(3)}`;
  const reasonText = (o) => (store.pickupReasons[o.reason] || "they can’t make it now").toLowerCase();
  const backLine = (o) => (o.pay === "cup"
    ? `Your cup is back${o.topUp ? `, and ${fmt.rs(o.topUp)} is on its way back to your ${o.payment?.method || "card"}` : ""}.`
    : `${fmt.rs(o.amount)} is on its way back to your ${o.payment?.method || "card"}.`);

  /** compact: Home's version (no status sentence; payment beside the code). */
  function cardHtml(o, { compact = false } = {}) {
    const place = placeLabel(o.cafeId);
    const name = S.pickupDrinkName(o);
    if (o.status === "rejected") {
      return html`<article class="pickup card" data-pickup="${o.id}" data-status="rejected" aria-labelledby="pk-${o.id}">
        <p class="eyebrow">Pickup · ${place}</p>
        <p class="pickup__drink" id="pk-${o.id}">${name}</p>
        <p class="t-body">${place} couldn’t make it: ${reasonText(o)}. ${backLine(o)}</p>
        <button type="button" class="btn btn--secondary btn--compact pickup__ok" data-dismiss-pickup="${o.id}">OK</button>
      </article>`;
    }
    const idx = STEPS.findIndex(([id]) => id === o.status);
    const code = S.pickupCode(o);
    const secs = S.canCancelPickup(o);
    return html`<article class="pickup card" data-pickup="${o.id}" data-status="${o.status}" aria-labelledby="pk-${o.id}">
      <p class="eyebrow">Pickup · ${place}</p>
      <div class="pickup__head">
        <p class="t-small t-muted num">${when(o)}</p>
        ${secs ? html`<button type="button" class="btn btn--link" data-cancel-pickup="${o.id}">Cancel <span class="num" data-cancel-left="${o.id}">${fmt.countdown(secs)}</span></button>` : ""}
      </div>
      <p class="pickup__drink" id="pk-${o.id}">${name}</p>
      <ol class="pickup__steps" role="list" aria-label="Status: ${STEPS[idx][1]}">
        ${STEPS.map(([id, label], i) => html`<li class="pickup__step" data-on="${i <= idx}" ${i === idx ? raw('aria-current="step"') : ""}>
          <span class="pickup__bar" aria-hidden="true"></span><span class="pickup__label">${label}</span>
        </li>`)}
      </ol>
      ${compact ? "" : html`<p class="t-small">${NOTES[o.status] || ""}</p>`}
      <div class="pickup__code">
        <span class="pickup__codelabel"><span class="t-micro t-faint">Pickup code</span>${compact ? html`<span class="t-micro t-faint num">${payLine(o)}</span>` : ""}</span>
        <span class="num" aria-label="Pickup code ${code.split("").join(" ")}">${spaced(code)}</span>
      </div>
      ${compact ? "" : html`<p class="t-small t-muted num">${payLine(o)}</p>`}
    </article>`;
  }

  /** Orders worth a card: in the queue, or rejected and not yet closed (last 6 hours). */
  function visible(memberId = S.member().id) {
    const now = Date.now();
    return S.memberPickups(memberId).filter((o) => S.isPickupOpen(o) || (o.status === "rejected" && !dismissed.has(o.id) && now - o.updatedAt < 6 * 60 * 60 * 1000));
  }
  const cardsHtml = (memberId) => html`${visible(memberId).map((o) => cardHtml(o, { compact: true }))}`;

  const DONE = { collected: "Collected", cancelled: "Cancelled", rejected: "Couldn’t be made" };
  function drawerHtml(memberId = S.member().id) {
    const cards = visible(memberId);
    const past = S.memberPickups(memberId).filter((o) => !S.isPickupOpen(o) && !cards.includes(o)).slice(0, 3);
    return html`
      ${cards.length ? html`<div class="pickup-list">${cards.map((o) => cardHtml(o))}</div>` : ""}
      ${past.length ? html`<ul role="list">${past.map((o) => html`<li class="row">
          <div class="row__main">
            <div class="row__title">${S.pickupDrinkName(o)}</div>
            <div class="row__meta">${placeLabel(o.cafeId)} · ${DONE[o.status]} · <span data-rel-time="${o.updatedAt}">${fmt.ago(o.updatedAt)}</span></div>
          </div>
          <span class="badge">${o.pay === "cup" ? "Cup" : fmt.rs(o.amount)}</span>
        </li>`)}</ul>` : ""}
      ${!cards.length && !past.length ? html`<p class="t-small t-muted">No pickup orders yet. Order ahead and skip the queue.</p>` : ""}
      <button type="button" class="btn btn--link" data-start-order>Order for pickup</button>`;
  }

  /** Every second while a card can still be cancelled. Returns true when one ran out (repaint). */
  function tickCancel(root) {
    let expired = false;
    $$("[data-cancel-left]", root).forEach((n) => {
      const o = S.pickup(n.dataset.cancelLeft);
      const secs = o ? S.canCancelPickup(o) : 0;
      if (!secs) expired = true; else n.textContent = fmt.countdown(secs);
    });
    return expired;
  }

  LCC.appOrder = { start, draft, cardHtml, cardsHtml, drawerHtml, visible, tickCancel, dismiss: (id) => dismissed.add(id), backLine };

  /* -------------------------------------------------------------------
     #/app/order
     ------------------------------------------------------------------- */
  REG.order = (ctx, cafeArg) => {
    const { view } = ctx;
    if (cafeArg && S.cafe(cafeArg) && (!draft.started || draft.cafeId !== cafeArg)) start({ cafeId: cafeArg });
    if (!draft.started) start();
    const m = ctx.member();
    const matcha = () => LCC.theme?.flavour() === "matcha";

    function placeHtml() {
      const brands = [...new Set(S.cafes().filter((c) => c.brandId).map((c) => c.brandId))].map(S.brand);
      const opt = (c, text) => {
        const a = S.pickupAvailable(c.id);
        const note = a.ok ? "" : a.reason === "paused" ? " · not taking orders" : " · closed";
        return html`<option value="${c.id}" ${c.id === draft.cafeId ? raw("selected") : ""}>${text}${note}</option>`;
      };
      return html`<div class="field">
        <label class="field__label" for="o-place">${S.cafe(draft.cafeId).brandId ? "Branch" : "Pick up at"}</label>
        <span class="select"><select class="input" id="o-place" data-o-place>
          ${brands.map((b) => html`<optgroup label="${b.name}">${S.branches(b.id).map((c) => opt(c, c.branch))}</optgroup>`)}
          <optgroup label="Partner cafés">${S.clubCafes().map((c) => opt(c, c.name))}</optgroup>
        </select></span>
      </div>`;
    }

    function drinkHtml() {
      const cafe = S.cafe(draft.cafeId);
      let body;
      if (cafe.brandId) {
        const b = S.brand(cafe.brandId);
        let secs = [...new Set(b.menu.map((d) => d.section))];
        if (matcha()) secs = [...secs.filter((x) => /matcha/i.test(x)), ...secs.filter((x) => !/matcha/i.test(x))];
        body = html`${secs.map((sec) => html`<optgroup label="${sec}">${b.menu.filter((d) => d.section === sec).map((d) => html`<option value="${d.id}" ${d.id === draft.drinkId ? raw("selected") : ""}>${d.name}</option>`)}</optgroup>`)}`;
      } else {
        const isM = (d) => /matcha/i.test(d.name);
        const list = matcha() ? [...cafe.drinks.filter(isM), ...cafe.drinks.filter((d) => !isM(d))] : cafe.drinks;
        body = html`${list.map((d) => html`<option value="${d.id}" ${d.id === draft.drinkId ? raw("selected") : ""}>${d.name} · ${fmt.rs(d.price)}${d.credits > 1 ? ` · uses ${fmt.cups(d.credits)}` : ""}</option>`)}`;
      }
      return html`<div class="field">
        <label class="field__label" for="o-drink">Drink</label>
        <span class="select"><select class="input" id="o-drink" data-o-drink>${body}</select></span>
      </div>`;
    }

    function tempHtml() {
      const cafe = S.cafe(draft.cafeId);
      if (!cafe.brandId) return "";
      const item = S.menuItem(cafe.brandId, draft.drinkId);
      if (item.hot != null && item.iced != null) {
        return ui.segmented({ name: "otemp", label: "Hot or iced", value: S.servedTemp(item, draft.temp), options: [{ value: "hot", label: "Hot" }, { value: "iced", label: "Iced" }] });
      }
      return html`<p class="t-small t-muted">${item.hot != null ? "Served hot." : "Served iced."}</p>`;
    }

    function timesHtml() {
      const a = S.pickupAvailable(draft.cafeId);
      if (!a.ok) return "";
      const t = a.times;
      if (draft.when === "asap" && !t.asap) draft.when = t.slots[0] ? String(t.slots[0].at) : "asap";
      return html`<div class="field">
        <label class="field__label" for="o-when">Pickup time</label>
        <span class="select"><select class="input num" id="o-when" data-o-when>
          ${t.asap ? html`<option value="asap" ${draft.when === "asap" ? raw("selected") : ""}>ASAP, about 10 min</option>` : ""}
          ${t.slots.map((s) => html`<option value="${s.at}" ${String(s.at) === String(draft.when) ? raw("selected") : ""}>${s.label}</option>`)}
        </select></span>
      </div>`;
    }

    function payHtml() {
      const a = S.pickupAvailable(draft.cafeId);
      if (!a.ok) return html`<div class="proto-note">${icon("info", { size: 18 })}<p>${a.message}</p></div>`;
      const q = quote();
      const p = payWith(q);
      const cupLine = !q.cup.ok ? q.cup.message
        : q.topUp ? `Cup + ${fmt.rs(q.topUp)}, paid online. A cup covers up to ${fmt.rs(S.brand(q.brandId).economics.coverUpTo)}.`
        : q.cup.bonus ? "A free cup from the club." : q.credits > 1 ? `Uses ${fmt.cups(q.credits)} from your plan.` : "Covered by your plan.";
      return html`<fieldset class="method-list">
        <legend class="field__label">Pay with</legend>
        <label class="method${q.cup.ok ? "" : " is-off"}">
          <input class="sr-only" type="radio" name="opay" value="cup" ${p === "cup" ? raw("checked") : ""} ${q.cup.ok ? "" : raw("disabled")}>
          <span class="method__icon">${icon("qr", { size: 22 })}</span>
          <span class="method__text"><span class="row__title">Use a cup</span><span class="row__meta num">${cupLine}</span></span>
          <span class="method__tick" aria-hidden="true">${icon("check", { size: 18 })}</span>
        </label>
        <label class="method">
          <input class="sr-only" type="radio" name="opay" value="paid" ${p === "paid" ? raw("checked") : ""}>
          <span class="method__icon">${icon("card", { size: 22 })}</span>
          <span class="method__text"><span class="row__title num">Pay ${fmt.rs(q.price)}</span><span class="row__meta">Card, JazzCash or Easypaisa</span></span>
          <span class="method__tick" aria-hidden="true">${icon("check", { size: 18 })}</span>
        </label>
      </fieldset>`;
    }

    function actionHtml() {
      const a = S.pickupAvailable(draft.cafeId);
      if (!a.ok) return html`<button type="button" class="btn btn--primary btn--block" disabled>Place order</button>`;
      const q = quote();
      const due = amountDue(q);
      const w = pickupChoice();
      return html`<p class="t-small t-muted num order-sum"><strong>${q.name}</strong> · ${placeLabel(draft.cafeId)} · ${w.label}</p>
        <p class="cv-error" data-o-error role="alert"></p>
        <button type="button" class="btn btn--primary btn--block num" data-o-submit>${due ? `Continue to pay ${fmt.rs(due)}` : "Place order"}</button>
        ${payWith(q) === "cup" ? html`<p class="t-micro t-faint">A cup is held now and comes back if the order is cancelled.</p>` : ""}`;
    }

    const set = (sel, markup) => { const n = $(sel, view); if (n) n.innerHTML = markup.s ?? markup; };
    function paint({ drink = true, times = true } = {}) {
      if (drink) set("[data-o-drinkbox]", drinkHtml());
      set("[data-o-temp]", tempHtml());
      if (times) set("[data-o-times]", timesHtml());
      set("[data-o-pay]", payHtml());
      set("[data-o-action]", actionHtml());
    }

    function submit() {
      const q = quote();
      if (amountDue(q) > 0) { pay.phase = "form"; pay.error = ""; ctx.go("#/app/order/pay"); return; }
      const res = A.placePickup(orderFromDraft());
      if (!res.ok) { const e = $("[data-o-error]", view); if (e) e.textContent = res.message; return; }
      draft.started = false;
      ctx.go("#/app", { replace: true });
      ctx.toast(`Order placed. Pickup code ${spaced(S.pickupCode(res.order))}.`, { duration: 4200 });
    }

    function onChange(e) {
      const t = e.target;
      if (t.matches("[data-o-place]")) {
        const cafe = S.cafe(t.value);
        const prev = S.cafe(draft.cafeId);
        draft.cafeId = t.value;
        // Same brand: keep the drink. Otherwise their usual here, or the first one-cup drink
        if (venueOf(cafe) !== venueOf(prev) || !hasDrink(cafe, draft.drinkId)) {
          const last = lastDrink(m, cafe);
          draft.drinkId = last && hasDrink(cafe, last.drinkId) ? last.drinkId : firstDrink(cafe);
          if (last?.temp) draft.temp = last.temp;
        }
        draft.when = "asap";
        $("label[for=o-place]", view).textContent = cafe.brandId ? "Branch" : "Pick up at";
        return paint();
      }
      if (t.matches("[data-o-drink]")) { draft.drinkId = t.value; return paint({ drink: false, times: false }); }
      if (t.matches("[data-o-when]")) { draft.when = t.value; return set("[data-o-action]", actionHtml()); }
      if (t.name === "opay") { draft.pay = t.value; return set("[data-o-action]", actionHtml()); }
    }
    function onClick(e) {
      const seg = e.target.closest('[data-segmented="otemp"] .segmented__option');
      if (seg) {
        ui.selectSegment(seg.parentElement, seg.dataset.value);
        draft.temp = seg.dataset.value;
        set("[data-o-pay]", payHtml()); set("[data-o-action]", actionHtml());
        return;
      }
      if (e.target.closest("[data-o-submit]")) submit();
    }

    return {
      html: html`
        <div class="flow order-flow">
          <div class="screen-bar">
            <button type="button" class="icon-btn" data-back="#/app" aria-label="Back">${icon("arrowLeft")}</button>
          </div>
          <div class="app-screen flow__body">
            <div class="stack" style="--stack-gap:var(--space-1)">
              <h1 class="t-h2">Order for pickup</h1>
              <p class="t-small t-muted">Order ahead and collect at the counter.</p>
            </div>
            ${placeHtml()}
            <div class="stack" style="--stack-gap:var(--space-3)">
              <div data-o-drinkbox>${drinkHtml()}</div>
              <div data-o-temp>${tempHtml()}</div>
            </div>
            <div data-o-times>${timesHtml()}</div>
            <div data-o-pay>${payHtml()}</div>
          </div>
          <div class="sticky-action" data-o-action>${actionHtml()}</div>
        </div>`.s,
      mount() {
        view.addEventListener("change", onChange);
        view.addEventListener("click", onClick);
        const onFlavour = () => set("[data-o-drinkbox]", drinkHtml());
        document.addEventListener("lcc:flavour", onFlavour);
        return () => {
          view.removeEventListener("change", onChange);
          view.removeEventListener("click", onClick);
          document.removeEventListener("lcc:flavour", onFlavour);
        };
      },
      on: {
        // Cups used elsewhere, a pause at the café, the clock: what's possible can change
        ledger: () => { set("[data-o-pay]", payHtml()); set("[data-o-action]", actionHtml()); },
        tick: () => paint({ drink: false }),
      },
    };
  };

  /* -------------------------------------------------------------------
     #/app/order/pay (simulated, like the plan payment)
     ------------------------------------------------------------------- */
  REG.orderPay = (ctx) => {
    const { view } = ctx;
    if (!draft.started || !kit()) return { redirect: "#/app/order" };
    const K = kit();
    const order = orderFromDraft();
    const q = quote();
    const due = amountDue(q);
    if (!due) return { redirect: "#/app/order" };
    let alive = true;

    function field({ id, label, value, placeholder, inputmode = "numeric", autocomplete, hint }) {
      return html`<div class="field" data-field="${id}">
        <label class="field__label" for="opay-${id}">${label}</label>
        <input class="input num" id="opay-${id}" name="${id}" value="${value}" placeholder="${placeholder}" inputmode="${inputmode}" autocomplete="${autocomplete}" aria-describedby="opay-${id}-err${hint ? ` opay-${id}-hint` : ""}">
        ${hint ? html`<p class="field__hint" id="opay-${id}-hint">${hint}</p>` : ""}
        <p class="field__error" id="opay-${id}-err"></p>
      </div>`;
    }
    function fieldsHtml() {
      if (pay.method === "card") {
        return html`${field({ id: "number", label: "Card number", value: pay.card.number, placeholder: "1234 5678 9012 3456", autocomplete: "cc-number" })}
          <div class="field-pair">
            ${field({ id: "exp", label: "Expiry", value: pay.card.exp, placeholder: "MM/YY", autocomplete: "cc-exp" })}
            ${field({ id: "cvc", label: "CVC", value: pay.card.cvc, placeholder: "123", autocomplete: "cc-csc" })}
          </div>`;
      }
      return field({ id: "phone", label: `${K.methodLabel(pay.method)} mobile number`, value: pay.phone, placeholder: "03XX XXXXXXX", inputmode: "tel", autocomplete: "tel-national", hint: `You’ll approve the payment in the ${K.methodLabel(pay.method)} app.` });
    }
    function bodyHtml() {
      if (pay.phase === "processing") {
        return html`<div class="pay-state" role="status"><span class="spinner" aria-hidden="true"></span>
          <p class="t-h3">${pay.method === "card" ? "Checking your card" : `Waiting for ${K.methodLabel(pay.method)}`}</p>
          <p class="t-small t-muted num">${pay.method === "card" ? "This takes a few seconds." : `Approve the request sent to ${pay.phone}.`}</p></div>`;
      }
      if (pay.phase === "failed") {
        return html`<div class="pay-state" role="alert">
          <span class="pay-state__mark" aria-hidden="true">${icon("info", { size: 28 })}</span>
          <h2 class="t-h2">Order not placed.</h2>
          <p class="t-body t-muted">${/Nothing was taken/.test(pay.error) ? pay.error : `${pay.error || "The payment didn’t go through."} Nothing was taken.`}</p>
          <div class="pay-state__actions"><button type="button" class="btn btn--primary btn--block" data-try-again>Try again</button></div>
        </div>`;
      }
      return html`<form class="pay-form" data-opay-form novalidate>
        <fieldset class="method-list">
          <legend class="field__label">Pay with</legend>
          ${K.METHODS.map((x) => html`<label class="method">
            <input class="sr-only" type="radio" name="method" value="${x.id}" ${pay.method === x.id ? raw("checked") : ""}>
            <span class="method__icon">${icon(x.icon, { size: 22 })}</span>
            <span class="method__text"><span class="row__title">${x.label}</span><span class="row__meta">${x.line}</span></span>
            <span class="method__tick" aria-hidden="true">${icon("check", { size: 18 })}</span>
          </label>`)}
        </fieldset>
        <div class="stack" style="--stack-gap:var(--space-4)" data-opay-fields>${fieldsHtml()}</div>
        <div class="proto-note">${icon("info", { size: 18 })}<p><strong>Prototype: no payment is taken.</strong></p></div>
        <button type="submit" class="btn btn--primary btn--block num">Pay ${fmt.rs(due)} and place order</button>
      </form>`;
    }
    function paint() {
      $("[data-opay-body]", view).innerHTML = bodyHtml().s;
      const back = $("[data-opay-back]", view);
      if (back) back.disabled = pay.phase === "processing";
      if (pay.phase !== "form") $("[data-opay-body]", view).querySelector("button, [role]")?.focus?.({ preventScroll: true });
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
      if (!inp.matches("[data-opay-fields] input")) return;
      const id = inp.name;
      const deleting = (e.inputType || "").startsWith("delete");
      let v = inp.value;
      if (id === "phone") v = K.formatPhone(v);
      else if (id === "number") v = K.formatCard(v);
      else if (id === "exp") v = K.formatExp(v, deleting);
      else if (id === "cvc") v = K.digits(v).slice(0, 4);
      if (v !== inp.value) inp.value = v;
      if (id === "phone") pay.phone = v; else pay.card[id] = v;
      if (inp.closest(".field").dataset.invalid === "true") showError(id, K.CHECKS[id](v));
    }
    function onFocusOut(e) {
      const inp = e.target;
      if (!inp.matches?.("[data-opay-fields] input") || !inp.value) return;
      showError(inp.name, K.CHECKS[inp.name](inp.value));
    }
    function onChange(e) {
      if (e.target.name !== "method") return;
      pay.method = e.target.value;
      $("[data-opay-fields]", view).innerHTML = fieldsHtml().s;
    }
    function onSubmit(e) {
      if (!e.target.matches("[data-opay-form]")) return;
      e.preventDefault();
      const bad = fieldIds().map((id) => [id, K.CHECKS[id](valueOf(id))]).filter(([, msg]) => msg);
      fieldIds().forEach((id) => showError(id, K.CHECKS[id](valueOf(id))));
      if (bad.length) { $(`#opay-${bad[0][0]}`, view).focus(); return; }
      pay.phase = "processing";
      paint();
      A.checkoutPickup(order, { method: pay.method, account: pay.method === "card" ? pay.card.number : pay.phone }).then((res) => {
        if (!res.ok) { pay.phase = "failed"; pay.error = res.message; if (alive) paint(); return; }
        pay.phase = "form";
        draft.started = false;
        const msg = `Order placed. Pickup code ${spaced(S.pickupCode(res.order))}.`;
        if (alive) ctx.go("#/app", { replace: true });
        ctx.toast(msg, { duration: 4200 });
      });
    }
    function onClick(e) {
      if (e.target.closest("[data-try-again]")) { pay.phase = "form"; paint(); $("[data-opay-fields] input", view)?.focus(); }
    }

    return {
      html: html`
        <div class="flow">
          <div class="screen-bar">
            <button type="button" class="icon-btn" data-back="#/app/order" data-opay-back aria-label="Back">${icon("arrowLeft")}</button>
          </div>
          <div class="app-screen flow__body">
            <h1 class="t-h2">Payment</h1>
            <div class="card pay-summary">
              <div class="pay-summary__row">
                <span class="t-h3">${q.name}</span>
                <span class="t-h3 num">${fmt.rs(due)}</span>
              </div>
              <p class="t-small t-muted num">${placeLabel(order.cafeId)} · ${pickupChoice().label}</p>
              <p class="t-micro t-faint num">${order.pay === "cup" ? `A cup from your plan, plus ${fmt.rs(q.topUp)} for the difference.` : "Full price. Your cups stay as they are."}</p>
            </div>
            <div data-opay-body></div>
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
