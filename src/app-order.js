/* =====================================================================
   Lahore Coffee Club — app-order.js
   Member app: pickup orders. Order ahead, collect at the counter.

     #/app/order        choose café (branch), drink, hot or iced, pickup
                        time, and how to pay: a cup, or the full price
     #/app/order/pay    simulated payment (full price, or a cup's top-up)
     #/app/group/:id    a group order ("For your Circle"): the host opens a
                        table and shares the link; friends add a drink each
                        within 10 minutes (cup, online, or the host covers
                        the table); the host sends it as one order

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
  const draft = { started: false, mode: "solo", cover: false, cafeId: null, drinkId: null, temp: "hot", when: "asap", pay: "cup" };
  const pay = { method: "jazzcash", phone: "", card: { number: "", exp: "", cvc: "" }, phase: "form", forMember: null, error: "" };
  const dismissed = new Set(); // rejected orders the member has closed (this device only)
  const hosted = new Set();    // tables opened on this device (the host's controls show here)
  const addedHere = {};        // groupId -> the drink added from this device

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
  function start({ cafeId = null, brandId = null, drinkId = null, temp = null, mode = "solo" } = {}) {
    const m = S.member();
    draft.started = true;
    draft.mode = mode;
    draft.cover = false;
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
  const payLine = (o, view) => {
    if (o.items) {
      const mine = view ? (view.item && o.items.find((i) => i.id === view.item.id)) : o.items.find((i) => i.memberId === S.member().id);
      return mine ? `${S.itemDrinkName(o.cafeId, mine)}, ${itemPay(mine, o)}` : `${o.items.length} drinks, all settled`;
    }
    return payLineOne(o);
  };
  const payLineOne = (o) => (o.pay === "cup"
    ? (o.topUp ? `A cup + ${fmt.rs(o.topUp)} paid online` : "Paid with a cup")
    : `Paid ${fmt.rs(o.amount)} with ${o.payment?.method || "card"}`);
  const spaced = (code) => `${code.slice(0, 3)} ${code.slice(3)}`;
  const reasonText = (o) => (store.pickupReasons[o.reason] || "they can’t make it now").toLowerCase();
  const itemPay = (i, o) => (i.pay === "cup" ? (i.topUp ? `a cup + ${fmt.rs(i.topUp)} online` : "a cup")
    : i.pay === "online" ? `${fmt.rs(i.price)} online` : `covered by ${o.memberName || o.hostName}`);
  // view: { host, item } from the table screen, where a guest's phone may carry the host's demo profile
  const tableName = (o, view) => ((view ? view.host : o.memberId === S.member().id) ? "Your table" : `${o.memberName}’s table`);
  const backLine = (o) => (o.items ? "Cups are back, and anything paid online is on its way back."
    : o.pay === "cup"
    ? `Your cup is back${o.topUp ? `, and ${fmt.rs(o.topUp)} is on its way back to your ${o.payment?.method || "card"}` : ""}.`
    : `${fmt.rs(o.amount)} is on its way back to your ${o.payment?.method || "card"}.`);

  /** compact: Home's version (no status sentence; payment beside the code). */
  function cardHtml(o, { compact = false, view = null } = {}) {
    const place = placeLabel(o.cafeId);
    const name = o.items ? `${tableName(o, view)} · ${S.pickupDrinkName(o)}` : S.pickupDrinkName(o);
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
    const secs = view && !view.host ? 0 : S.canCancelPickup(o);
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
        <span class="pickup__codelabel"><span class="t-micro t-faint">Pickup code</span>${compact ? html`<span class="t-micro t-faint num">${payLine(o, view)}</span>` : ""}</span>
        <span class="num" aria-label="Pickup code ${code.split("").join(" ")}">${spaced(code)}</span>
      </div>
      ${compact ? "" : html`<p class="t-small t-muted num">${payLine(o, view)}</p>`}
      ${o.groupId && !compact && !view ? html`<a class="btn btn--link" href="#/app/group/${o.groupId}">See the table</a>` : ""}
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
          <span class="badge">${o.items ? "Table" : o.pay === "cup" ? "Cup" : fmt.rs(o.amount)}</span>
        </li>`)}</ul>` : ""}
      ${!cards.length && !past.length ? html`<p class="t-small t-muted">No pickup orders yet. Order ahead and skip the queue.</p>` : ""}
      <button type="button" class="btn btn--link" data-start-order>Order for pickup</button>
      ${openTables(memberId).map((g) => html`<a class="btn btn--link" href="#/app/group/${g.id}">Back to ${g.hostId === memberId ? "your" : `${g.hostName}’s`} table</a>`)}`;
  }

  /** Tables still gathering drinks that this member hosts or has a drink at. */
  const openTables = (memberId = S.member().id) => Object.values(store.getState().groups)
    .filter((g) => g.status === "open" && (g.hostId === memberId && hosted.has(g.id) || addedHere[g.id] || Object.values(g.items).some((i) => i.memberId === memberId)));

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

  LCC.appOrder = { start, draft, cardHtml, cardsHtml, drawerHtml, visible, tickCancel, dismiss: (id) => dismissed.add(id), backLine, openTables };

  /* -------------------------------------------------------------------
     Simulated payment fields, shared by the order, table and cover forms.
     prefix keeps ids unique; method, number and card live in `pay`.
     ------------------------------------------------------------------- */
  function payBlock(prefix) {
    const K = kit();
    const field = ({ id, label, value, placeholder, inputmode = "numeric", autocomplete, hint }) => html`<div class="field" data-field="${prefix}-${id}">
        <label class="field__label" for="${prefix}-${id}">${label}</label>
        <input class="input num" id="${prefix}-${id}" name="${id}" data-pf="${prefix}" value="${value}" placeholder="${placeholder}" inputmode="${inputmode}" autocomplete="${autocomplete}" aria-describedby="${prefix}-${id}-err${hint ? ` ${prefix}-${id}-hint` : ""}">
        ${hint ? html`<p class="field__hint" id="${prefix}-${id}-hint">${hint}</p>` : ""}
        <p class="field__error" id="${prefix}-${id}-err"></p>
      </div>`;
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
    const showError = (root, id, msg) => {
      const f = $(`[data-field="${prefix}-${id}"]`, root);
      if (!f) return;
      f.dataset.invalid = String(!!msg);
      $(".field__error", f).textContent = msg;
      $("input", f).setAttribute("aria-invalid", String(!!msg));
    };
    const ids = () => (pay.method === "card" ? ["number", "exp", "cvc"] : ["phone"]);
    const valueOf = (id) => (id === "phone" ? pay.phone : pay.card[id]);
    return {
      html: () => html`<div class="stack" style="--stack-gap:var(--space-4)">
        <fieldset class="method-list">
          <legend class="field__label">Pay with</legend>
          ${K.METHODS.map((x) => html`<label class="method">
            <input class="sr-only" type="radio" name="${prefix}-method" value="${x.id}" ${pay.method === x.id ? raw("checked") : ""}>
            <span class="method__icon">${icon(x.icon, { size: 22 })}</span>
            <span class="method__text"><span class="row__title">${x.label}</span><span class="row__meta">${x.line}</span></span>
            <span class="method__tick" aria-hidden="true">${icon("check", { size: 18 })}</span>
          </label>`)}
        </fieldset>
        <div class="stack" style="--stack-gap:var(--space-4)" data-pf-fields="${prefix}">${fieldsHtml()}</div>
        <div class="proto-note">${icon("info", { size: 18 })}<p><strong>Prototype: no payment is taken.</strong></p></div>
      </div>`,
      /** Returns true when the event was ours. */
      onInput(e, root) {
        const inp = e.target;
        if (inp.dataset?.pf !== prefix) return false;
        const id = inp.name;
        const deleting = (e.inputType || "").startsWith("delete");
        let v = inp.value;
        if (id === "phone") v = K.formatPhone(v);
        else if (id === "number") v = K.formatCard(v);
        else if (id === "exp") v = K.formatExp(v, deleting);
        else if (id === "cvc") v = K.digits(v).slice(0, 4);
        if (v !== inp.value) inp.value = v;
        if (id === "phone") pay.phone = v; else pay.card[id] = v;
        if (inp.closest(".field").dataset.invalid === "true") showError(root, id, K.CHECKS[id](v));
        return true;
      },
      onFocusOut(e, root) {
        const inp = e.target;
        if (inp.dataset?.pf !== prefix || !inp.value) return;
        showError(root, inp.name, K.CHECKS[inp.name](inp.value));
      },
      onChange(e, root) {
        if (e.target.name !== `${prefix}-method`) return false;
        pay.method = e.target.value;
        const box = $(`[data-pf-fields="${prefix}"]`, root);
        if (box) box.innerHTML = fieldsHtml().s;
        return true;
      },
      /** Shows errors; returns true when everything checks out (focuses the first problem otherwise). */
      validate(root) {
        const bad = ids().map((id) => [id, K.CHECKS[id](valueOf(id))]).filter(([, msg]) => msg);
        ids().forEach((id) => showError(root, id, K.CHECKS[id](valueOf(id))));
        if (bad.length) $(`#${prefix}-${bad[0][0]}`, root)?.focus();
        return !bad.length;
      },
      account: () => (pay.method === "card" ? pay.card.number : pay.phone),
    };
  }
  const methodLabel = () => kit().methodLabel(pay.method);
  const processingHtml = () => html`<div class="pay-state" role="status"><span class="spinner" aria-hidden="true"></span>
    <p class="t-h3">${pay.method === "card" ? "Checking your card" : `Waiting for ${methodLabel()}`}</p>
    <p class="t-small t-muted num">${pay.method === "card" ? "This takes a few seconds." : `Approve the request sent to ${pay.phone}.`}</p></div>`;

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
        : q.cup.bonus ? "A complimentary cup from the club." : q.credits > 1 ? `Uses ${fmt.cups(q.credits)} from your plan.` : "Covered by your plan.";
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

    function coverHtml() {
      return html`<label class="method">
        <input class="sr-only" type="checkbox" name="ocover" ${draft.cover ? raw("checked") : ""}>
        <span class="method__icon">${icon("users", { size: 22 })}</span>
        <span class="method__text"><span class="row__title">I’ll cover the table</span><span class="row__meta">Friends only choose a drink. You pay for everything when you send it.</span></span>
        <span class="method__tick" aria-hidden="true">${icon("check", { size: 18 })}</span>
      </label>`;
    }

    function actionHtml() {
      const a = S.pickupAvailable(draft.cafeId);
      if (!a.ok) return html`<button type="button" class="btn btn--primary btn--block" disabled>${draft.mode === "circle" ? "Start a table" : "Place order"}</button>`;
      if (draft.mode === "circle") {
        return html`<p class="t-small t-muted num order-sum"><strong>${placeLabel(draft.cafeId)}</strong> · ${pickupChoice().label}</p>
          <p class="cv-error" data-o-error role="alert"></p>
          <button type="button" class="btn btn--primary btn--block" data-o-submit>Start a table</button>
          <p class="t-micro t-faint">You’ll get a link to share. Friends add their drink within ${S.beans().rules.groupJoinMinutes} minutes.</p>`;
      }
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
      if (draft.mode === "circle") {
        const w = pickupChoice();
        const res = A.startGroup({ cafeId: draft.cafeId, asap: w.asap, pickupAt: w.pickupAt, covered: draft.cover });
        if (!res.ok) { const e = $("[data-o-error]", view); if (e) e.textContent = res.message; return; }
        hosted.add(res.group.id);
        draft.started = false;
        ctx.go(`#/app/group/${res.group.id}`, { replace: true });
        return;
      }
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
      if (t.name === "ocover") { draft.cover = t.checked; return; }
    }
    function setMode(mode) {
      draft.mode = mode;
      $("[data-o-solo]", view).hidden = mode !== "solo";
      $("[data-o-circle]", view).hidden = mode !== "circle";
      set("[data-o-action]", actionHtml());
    }
    function onClick(e) {
      const ms = e.target.closest('[data-segmented="omode"] .segmented__option');
      if (ms) { ui.selectSegment(ms.parentElement, ms.dataset.value); return setMode(ms.dataset.value); }
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
            ${ui.segmented({ name: "omode", label: "Who it’s for", value: draft.mode, options: [{ value: "solo", label: "Just me" }, { value: "circle", label: "For your Circle" }] })}
            ${placeHtml()}
            <div data-o-times>${timesHtml()}</div>
            <div class="stack" style="--stack-gap:var(--space-5)" data-o-solo ${draft.mode === "solo" ? "" : raw("hidden")}>
              <div class="stack" style="--stack-gap:var(--space-3)">
                <div data-o-drinkbox>${drinkHtml()}</div>
                <div data-o-temp>${tempHtml()}</div>
              </div>
              <div data-o-pay>${payHtml()}</div>
            </div>
            <div class="stack" style="--stack-gap:var(--space-3)" data-o-circle ${draft.mode === "circle" ? "" : raw("hidden")}>
              <p class="t-small t-muted">Order together, or for anyone with the link. You choose where and when; everyone adds their own drink and pays their way.</p>
              ${coverHtml()}
            </div>
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
    const order = orderFromDraft();
    const q = quote();
    const due = amountDue(q);
    if (!due) return { redirect: "#/app/order" };
    const pb = payBlock("opay");
    let alive = true;

    function bodyHtml() {
      if (pay.phase === "processing") return processingHtml();
      if (pay.phase === "failed") {
        return html`<div class="pay-state" role="alert">
          <span class="pay-state__mark" aria-hidden="true">${icon("info", { size: 28 })}</span>
          <h2 class="t-h2">Order not placed.</h2>
          <p class="t-body t-muted">${/Nothing was taken/.test(pay.error) ? pay.error : `${pay.error || "The payment didn’t go through."} Nothing was taken.`}</p>
          <div class="pay-state__actions"><button type="button" class="btn btn--primary btn--block" data-try-again>Try again</button></div>
        </div>`;
      }
      return html`<form class="pay-form" data-opay-form novalidate>
        ${pb.html()}
        <button type="submit" class="btn btn--primary btn--block num">Pay ${fmt.rs(due)} and place order</button>
      </form>`;
    }
    function paint() {
      $("[data-opay-body]", view).innerHTML = bodyHtml().s;
      const back = $("[data-opay-back]", view);
      if (back) back.disabled = pay.phase === "processing";
      if (pay.phase !== "form") $("[data-opay-body]", view).querySelector("button, [role]")?.focus?.({ preventScroll: true });
    }
    const onInput = (e) => pb.onInput(e, view);
    const onFocusOut = (e) => pb.onFocusOut(e, view);
    const onChange = (e) => pb.onChange(e, view);
    function onSubmit(e) {
      if (!e.target.matches("[data-opay-form]")) return;
      e.preventDefault();
      if (!pb.validate(view)) return;
      pay.phase = "processing";
      paint();
      A.checkoutPickup(order, { method: pay.method, account: pb.account() }).then((res) => {
        if (!res.ok) { pay.phase = "failed"; pay.error = res.message; if (alive) paint(); return; }
        pay.phase = "form";
        draft.started = false;
        if (alive) ctx.go("#/app", { replace: true });
        ctx.toast(`Order placed. Pickup code ${spaced(S.pickupCode(res.order))}.`, { duration: 4200 });
      });
    }
    function onClick(e) {
      if (e.target.closest("[data-try-again]")) { pay.phase = "form"; paint(); $("[data-pf-fields] input", view)?.focus(); }
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

  /* -------------------------------------------------------------------
     #/app/group/:id  a table. Everyone who opens the link sees the same
     screen; the host (on the device that opened it) also gets Share,
     I'll cover the table, Send and Cancel. Updates live over sync.
     ------------------------------------------------------------------- */
  REG.group = (ctx, groupId) => {
    const { view } = ctx;
    const pb = payBlock("gpay");
    const cb = payBlock("gcov");
    const join = { drinkId: null, temp: "hot", pay: "cup", name: "", phase: "form", error: "" };
    const send = { phase: "idle", error: "" }; // idle | pay | processing | failed
    let timer = null;
    let alive = true;
    let joinKey = "";

    const g = () => S.group(groupId);
    const isHost = () => !!g() && hosted.has(groupId) && g().hostId === ctx.member().id;
    /** Who adds a drink from this device: the member, or a guest when this
        device's member is the host but the table was opened elsewhere. */
    const asMember = () => { const m = ctx.member(); return g() && (m.id !== g().hostId || isHost()) ? m : null; };
    const mine = () => {
      if (!g()) return null;
      if (addedHere[groupId] && g().items[addedHere[groupId]]) return g().items[addedHere[groupId]];
      const m = asMember();
      return m ? S.groupItems(g()).find((i) => i.memberId === m.id) || null : null;
    };
    const secsLeft = () => (g() ? Math.max(0, Math.ceil((g().closesAt - Date.now()) / 1000)) : 0);
    const isOpen = () => !!g() && g().status === "open" && secsLeft() > 0;
    const order = () => (g()?.orderId ? S.pickup(g().orderId) : null);
    const shareUrl = () => (LCC.sync ? `${LCC.sync.liveUrl}${LCC.sync.withRoom(`#/app/group/${groupId}`)}` : `${location.href.split("#")[0]}#/app/group/${groupId}`);

    function ensureDrink() {
      const cafe = S.cafe(g().cafeId);
      if (join.drinkId && hasDrink(cafe, join.drinkId)) return;
      const m = asMember();
      const last = m ? lastDrink(m, cafe) : null;
      join.drinkId = last && hasDrink(cafe, last.drinkId) ? last.drinkId : firstDrink(cafe);
      if (last?.temp) join.temp = last.temp;
    }
    const jquote = () => S.pickupQuote(asMember()?.id || null, g().cafeId, join.drinkId, join.temp);
    const joinMode = (q) => (g().covered ? "host" : join.pay === "cup" && q.cup.ok ? "cup" : "online");
    const joinDue = (q) => { const mode = joinMode(q); return mode === "cup" ? q.topUp : mode === "online" ? q.price : 0; };
    const whenLine = () => (g().asap ? "ASAP once it’s sent, about 10 min" : `Pickup at ${fmt.time(g().pickupAt)}`);

    function clockText() {
      const t = g();
      if (!t) return "";
      if (t.status === "sent") return "Sent to the café.";
      if (t.status === "cancelled") return "This table was cancelled.";
      return secsLeft() ? `Add a drink in ${fmt.countdown(secsLeft())}` : "Joining has closed.";
    }

    function headHtml() {
      const t = g();
      return html`<div class="stack" style="--stack-gap:var(--space-1)">
          <p class="eyebrow">Table order</p>
          <h1 class="t-h2">${isHost() ? "Your table" : `${t.hostName}’s table`}</h1>
          <p class="t-small t-muted num">${placeLabel(t.cafeId)} · ${whenLine()}</p>
        </div>
        <p class="table__clock num" data-g-clock aria-live="off">${clockText()}</p>`;
    }

    function itemsHtml() {
      const t = g();
      const list = S.groupItems(t);
      const me = mine();
      const total = list.reduce((n, i) => n + i.price, 0);
      const chip = (i) => (i.pay === "cup" ? "Cup" : i.pay === "online" ? "Paid" : "Covered");
      return html`<section aria-labelledby="g-items-h">
        <h2 class="eyebrow" id="g-items-h">On the table</h2>
        ${list.length ? html`<ul role="list">${list.map((i) => html`<li class="row${me && me.id === i.id ? " is-mine" : ""}">
            <span class="row__main"><span class="row__title">${i.name}${me && me.id === i.id ? " (you)" : ""}</span><span class="row__meta">${S.itemDrinkName(t.cafeId, i)}</span></span>
            <span class="badge">${chip(i)}</span>
          </li>`)}</ul>
          <p class="t-small t-muted num">${list.length} ${list.length === 1 ? "drink" : "drinks"} · ${fmt.rs(total)} at the counter${t.covered ? ` · covered by ${isHost() ? "you" : t.hostName}` : ""}</p>`
          : html`<p class="t-small t-muted">No drinks yet.${isHost() ? " Add yours, then share the link." : ""}</p>`}
      </section>`;
    }

    function shareHtml() {
      const t = g();
      if (!isHost() || t.status !== "open") return "";
      const msg = `Join my table at ${placeLabel(t.cafeId)}. Add your drink in the next ${S.beans().rules.groupJoinMinutes} minutes: ${shareUrl()}`;
      return html`<div class="card table__share">
        <p class="t-small">Share the link. Anyone who opens it can add a drink until the time is up.</p>
        <a class="btn btn--secondary btn--block" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${icon("share")}Share on WhatsApp</a>
        <button type="button" class="btn btn--link" data-copy-link>Copy the link</button>
        <label class="method">
          <input class="sr-only" type="checkbox" name="gcover" ${t.covered ? raw("checked") : ""}>
          <span class="method__icon">${icon("users", { size: 22 })}</span>
          <span class="method__text"><span class="row__title">I’ll cover the table</span><span class="row__meta">Friends only choose. You pay for their drinks when you send it.</span></span>
          <span class="method__tick" aria-hidden="true">${icon("check", { size: 18 })}</span>
        </label>
      </div>`;
    }

    function joinHtml() {
      const t = g();
      if (t.status !== "open") return "";
      const me = mine();
      if (me) return html`<p class="t-small table__mine">${icon("check", { size: 18 })}<span>Your ${S.itemDrinkName(t.cafeId, me)} is on the table.</span></p>`;
      if (!isOpen()) return "";
      if (join.phase === "processing") return processingHtml();
      ensureDrink();
      const m = asMember();
      const q = jquote();
      const mode = joinMode(q);
      const due = joinDue(q);
      const cafe = S.cafe(t.cafeId);
      const item = cafe.brandId ? S.menuItem(cafe.brandId, join.drinkId) : null;
      return html`<form class="stack table__join" style="--stack-gap:var(--space-4)" data-g-join novalidate>
        <h2 class="eyebrow">Add your drink</h2>
        ${m ? html`<p class="t-small t-muted">Adding as ${m.firstName}.</p>`
          : html`<div class="field"><label class="field__label" for="g-name">Your name</label><input class="input" id="g-name" name="gname" value="${join.name}" autocomplete="given-name" placeholder="So the café knows whose it is"></div>`}
        <div class="field">
          <label class="field__label" for="g-drink">Drink</label>
          <span class="select"><select class="input" id="g-drink" data-g-drink>
            ${cafe.brandId
              ? html`${[...new Set(S.brand(cafe.brandId).menu.map((d) => d.section))].map((sec) => html`<optgroup label="${sec}">${S.brand(cafe.brandId).menu.filter((d) => d.section === sec).map((d) => html`<option value="${d.id}" ${d.id === join.drinkId ? raw("selected") : ""}>${d.name}</option>`)}</optgroup>`)}`
              : html`${cafe.drinks.map((d) => html`<option value="${d.id}" ${d.id === join.drinkId ? raw("selected") : ""}>${d.name} · ${fmt.rs(d.price)}</option>`)}`}
          </select></span>
        </div>
        ${item && item.hot != null && item.iced != null ? ui.segmented({ name: "gtemp", label: "Hot or iced", value: S.servedTemp(item, join.temp), options: [{ value: "hot", label: "Hot" }, { value: "iced", label: "Iced" }] }) : ""}
        ${t.covered
          ? html`<p class="t-small num">${isHost() ? "You’re covering the table." : `${t.hostName} is covering the table.`} ${fmt.rs(q.price)}, nothing to pay now.</p>`
          : html`<fieldset class="method-list">
              <legend class="field__label">Pay with</legend>
              <label class="method${q.cup.ok ? "" : " is-off"}">
                <input class="sr-only" type="radio" name="gpaywith" value="cup" ${mode === "cup" ? raw("checked") : ""} ${q.cup.ok ? "" : raw("disabled")}>
                <span class="method__icon">${icon("qr", { size: 22 })}</span>
                <span class="method__text"><span class="row__title">Use a cup</span><span class="row__meta num">${q.cup.ok ? (q.topUp ? `Cup + ${fmt.rs(q.topUp)}, paid online.` : "Covered by your plan.") : q.cup.message}</span></span>
                <span class="method__tick" aria-hidden="true">${icon("check", { size: 18 })}</span>
              </label>
              <label class="method">
                <input class="sr-only" type="radio" name="gpaywith" value="online" ${mode === "online" ? raw("checked") : ""}>
                <span class="method__icon">${icon("card", { size: 22 })}</span>
                <span class="method__text"><span class="row__title num">Pay ${fmt.rs(q.price)}</span><span class="row__meta">Card, JazzCash or Easypaisa</span></span>
                <span class="method__tick" aria-hidden="true">${icon("check", { size: 18 })}</span>
              </label>
            </fieldset>`}
        ${due ? pb.html() : ""}
        <p class="cv-error" role="alert">${join.error}</p>
        <button type="submit" class="btn btn--primary btn--block num">${due ? `Pay ${fmt.rs(due)} and add my drink` : "Add my drink"}</button>
        ${m ? html`<p class="t-micro t-faint num">+${S.beans().perDrink} Beans when it’s collected.</p>` : ""}
      </form>`;
    }

    function hostHtml() {
      const t = g();
      if (!isHost() || t.status !== "open") return "";
      const n = S.groupItems(t).length;
      const due = A.groupCoverDue(groupId);
      if (send.phase === "processing") return processingHtml();
      if (send.phase === "pay" || send.phase === "failed") {
        return html`<form class="stack" style="--stack-gap:var(--space-4)" data-g-cover novalidate>
          <h2 class="eyebrow">Cover the table</h2>
          <p class="t-small num">${n} ${n === 1 ? "drink" : "drinks"}, ${fmt.rs(due)}.</p>
          ${cb.html()}
          <p class="cv-error" role="alert">${send.error}</p>
          <button type="submit" class="btn btn--primary btn--block num">Pay ${fmt.rs(due)} and send</button>
          <button type="button" class="btn btn--link" data-g-cover-back>Not yet</button>
        </form>`;
      }
      const friends = S.groupFriends(t);
      return html`<div class="stack" style="--stack-gap:var(--space-3)">
        <button type="button" class="btn btn--primary btn--block num" data-g-send ${n ? "" : raw("disabled")}>${due ? `Cover ${fmt.rs(due)} and send` : "Send to the café"}</button>
        ${friends ? html`<p class="t-micro t-faint num">+${friends * S.beans().rules.hostPerFriend} Beans for hosting, when it’s collected.</p>` : ""}
        <button type="button" class="btn btn--link" data-g-cancel>Cancel this table</button>
      </div>`;
    }

    function statusHtml() {
      const o = order();
      return o ? cardHtml(o, { view: { host: isHost(), item: mine() } }) : "";
    }

    function bodyHtml() {
      if (!g()) {
        return html`<div class="stack table__wait" style="--stack-gap:var(--space-3)">
          <span class="spinner" aria-hidden="true"></span>
          <h1 class="t-h2">Finding the table…</h1>
          <p class="t-small t-muted">It appears as soon as the host’s phone is online. Keep this open.</p>
        </div>`;
      }
      return html`<div data-g-head class="stack" style="--stack-gap:var(--space-3)">${headHtml()}</div>
        <div data-g-status>${statusHtml()}</div>
        <div data-g-share>${shareHtml()}</div>
        <div data-g-items>${itemsHtml()}</div>
        <div data-g-joinbox>${joinHtml()}</div>
        <div data-g-host>${hostHtml()}</div>`;
    }

    const keyNow = () => (g() ? [g().status, g().covered, !!mine(), isOpen(), join.phase].join(":") : "none");
    const set = (sel, markup) => { const n = $(sel, view); if (n) n.innerHTML = markup.s ?? markup; };
    function paint({ all = false } = {}) {
      const body = $("[data-g-body]", view);
      if (!body) return;
      if (all || !body.dataset.ready || !g()) {
        body.innerHTML = bodyHtml().s;
        body.dataset.ready = g() ? "1" : "";
        joinKey = keyNow();
        return;
      }
      set("[data-g-head]", headHtml());
      set("[data-g-status]", statusHtml());
      set("[data-g-share]", shareHtml());
      set("[data-g-items]", itemsHtml());
      // The form keeps what's being typed unless the table itself changed
      if (keyNow() !== joinKey) { joinKey = keyNow(); set("[data-g-joinbox]", joinHtml()); }
      if (!$("[data-g-host]", view)?.contains(document.activeElement) || send.phase !== "pay") set("[data-g-host]", hostHtml());
    }

    function submitJoin(form) {
      const q = jquote();
      const mode = joinMode(q);
      const m = asMember();
      if (!m && !join.name.trim()) { join.error = "Add your name, so the café knows whose drink it is."; set("[data-g-joinbox]", joinHtml()); return $("#g-name", view)?.focus(); }
      const due = joinDue(q);
      const args = { name: join.name, drinkId: q.drinkId, temp: q.temp, pay: mode };
      const done = (res) => {
        if (!alive) return;
        join.phase = "form";
        if (!res.ok) { join.error = res.message; joinKey = ""; return paint(); }
        join.error = "";
        addedHere[groupId] = res.item.id;
        ctx.toast(`Your ${S.itemDrinkName(g().cafeId, res.item)} is on the table.`);
        paint();
      };
      if (!due) return done(A.joinGroup(groupId, args, m ? m.id : null));
      if (!pb.validate(form)) return;
      join.phase = "processing"; paint();
      A.checkoutGroupItem(groupId, args, { method: pay.method, account: pb.account() }, m ? m.id : null).then(done);
    }

    function sendNow() {
      const t = g();
      const res = A.sendGroup(groupId);
      if (res.needsPayment) { send.phase = "pay"; send.error = ""; set("[data-g-host]", hostHtml()); return $("[data-g-cover] input", view)?.focus(); }
      if (!res.ok) return ctx.toast(res.message, { iconName: "info" });
      ctx.toast(`Sent to ${placeLabel(t.cafeId)}. Pickup code ${spaced(S.pickupCode(res.order))}.`, { duration: 4200 });
      paint({ all: true });
    }

    function onInput(e) {
      if (e.target.name === "gname") { join.name = e.target.value; return; }
      if (!pb.onInput(e, view)) cb.onInput(e, view);
    }
    function onFocusOut(e) { pb.onFocusOut(e, view); cb.onFocusOut(e, view); }
    function onChange(e) {
      const t = e.target;
      if (pb.onChange(e, view) || cb.onChange(e, view)) return;
      if (t.matches("[data-g-drink]")) { join.drinkId = t.value; return set("[data-g-joinbox]", joinHtml()), $("[data-g-drink]", view)?.focus(); }
      if (t.name === "gpaywith") { join.pay = t.value; set("[data-g-joinbox]", joinHtml()); return $(`[name=gpaywith][value=${t.value}]`, view)?.focus(); }
      if (t.name === "gcover") {
        const res = A.setGroupCovered(groupId, t.checked);
        if (!res.ok) { t.checked = !t.checked; if (res.message) ctx.toast(res.message, { iconName: "info" }); }
      }
    }
    function onSubmit(e) {
      e.preventDefault();
      if (e.target.matches("[data-g-join]")) return submitJoin(e.target);
      if (e.target.matches("[data-g-cover]")) {
        if (!cb.validate(e.target)) return;
        send.phase = "processing"; set("[data-g-host]", hostHtml());
        A.checkoutGroupSend(groupId, { method: pay.method, account: cb.account() }).then((res) => {
          if (!alive) return;
          if (!res.ok) { send.phase = "failed"; send.error = res.message; return set("[data-g-host]", hostHtml()); }
          send.phase = "idle";
          ctx.toast(`Sent to ${placeLabel(g().cafeId)}. Pickup code ${spaced(S.pickupCode(res.order))}.`, { duration: 4200 });
          paint({ all: true });
        });
      }
    }
    function onClick(e) {
      const seg = e.target.closest('[data-segmented="gtemp"] .segmented__option');
      if (seg) { ui.selectSegment(seg.parentElement, seg.dataset.value); join.temp = seg.dataset.value; set("[data-g-joinbox]", joinHtml()); return $(`[data-segmented="gtemp"] [data-value="${join.temp}"]`, view)?.focus(); }
      if (e.target.closest("[data-g-send]")) return sendNow();
      if (e.target.closest("[data-g-cover-back]")) { send.phase = "idle"; return set("[data-g-host]", hostHtml()); }
      if (e.target.closest("[data-g-cancel]")) {
        if (A.cancelGroup(groupId).ok) { ctx.toast("Table cancelled. Cups are back, and anything paid online is on its way back."); paint({ all: true }); }
        return;
      }
      if (e.target.closest("[data-copy-link]")) {
        const url = shareUrl();
        try { navigator.clipboard.writeText(url).then(() => ctx.toast("Link copied.", { iconName: "copy" }), () => ctx.toast(url, { iconName: "copy", duration: 6000 })); }
        catch (_) { ctx.toast(url, { iconName: "copy", duration: 6000 }); }
      }
    }

    return {
      html: html`
        <div class="flow table">
          <div class="screen-bar">
            <button type="button" class="icon-btn" data-back="#/app" aria-label="Back">${icon("arrowLeft")}</button>
          </div>
          <div class="app-screen flow__body" data-g-body>${bodyHtml()}</div>
        </div>`.s,
      mount() {
        const body = $("[data-g-body]", view);
        body.dataset.ready = g() ? "1" : "";
        joinKey = keyNow();
        // The countdown, every second while the table is open
        timer = setInterval(() => {
          const c = $("[data-g-clock]", view);
          if (c) c.textContent = clockText();
          if (g() && g().status === "open" && keyNow() !== joinKey) paint();
          if (tickCancel(view)) set("[data-g-status]", statusHtml());
        }, 1000);
        view.addEventListener("input", onInput);
        view.addEventListener("focusout", onFocusOut);
        view.addEventListener("change", onChange);
        view.addEventListener("submit", onSubmit);
        view.addEventListener("click", onClick);
        return () => {
          alive = false;
          clearInterval(timer);
          view.removeEventListener("input", onInput);
          view.removeEventListener("focusout", onFocusOut);
          view.removeEventListener("change", onChange);
          view.removeEventListener("submit", onSubmit);
          view.removeEventListener("click", onClick);
        };
      },
      on: {
        group: ({ group }) => { if (group.id === groupId) paint(); },
        pickup: ({ order: o }) => { if (o.groupId === groupId) paint(); },
        snapshot: () => paint(),
        ledger: () => { if (g()?.status === "open" && !mine()) { joinKey = ""; paint(); } },
      },
    };
  };
})();
