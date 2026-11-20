/* =====================================================================
   Lahore Coffee Club — app-brand.js
   Member app: a brand partner's page (#/app/cafes/doubleshot, also
   reached from any branch's row or pin). Your cups, the drinks menu with
   a Hot / Iced toggle (list price and member price), ordering ("Use a cup"), branches.

   Cups belong to the brand, not a branch: they work at every branch.
   "Use a cup at the counter" only tells the counter what you'd like; the
   cup is spent when the counter redeems your code (store.actions.placeOrder
   / redeem). "Order for pickup" opens the pickup flow (app-order.js).
   ===================================================================== */
(function () {
  "use strict";
  const LCC = window.LCC;
  const { store, fmt, ui } = LCC;
  const { html, $, $$, icon } = ui;
  const S = store.select;
  const A = store.actions;
  const REG = (LCC.appScreens = LCC.appScreens || {});

  let menuTemp = "hot"; // the menu's Hot / Iced toggle, kept between visits

  REG.brand = (ctx, brandId) => {
    const { view, el } = ctx;
    const b = S.brand(brandId);
    const band = () => S.bandAt(undefined, b.id);
    const cover = S.band(band()).maxPrice;
    const sections = [...new Set(b.menu.map((d) => d.section))];
    let sheet = null;
    let picked = null; // { item, temp } while the order sheet is open
    let onScroll = null;

    /** The member's cups at this brand (any branch): the plan the counter would use, and how many. */
    const cups = () => {
      const chk = S.counterCheck(ctx.member().id, S.branches(b.id)[0].id);
      const opt = chk.options.find((o) => o.here > 0 && !o.plan.paused) || chk.options[0] || null;
      return { opt, here: opt && !opt.plan.paused ? opt.here : 0 };
    };
    const canUse = () => cups().here > 0;
    const priceTag = (item, temp) => {
      const p = S.drinkPrice(b.id, item, temp, band());
      if (S.isPass()) return html`<span class="badge">${p.band ? p.band.label : "Above Reserve"}</span>`; // the Pass takes any drink
      return p.included ? html`<span class="badge">${p.band.label}</span>` : html`<span class="badge badge--top num">Cup + ${fmt.rs(p.topUp)}</span>`;
    };

    /** What this drink costs the member: the Pass's member price, or what a cup covers. */
    const coverLine = (p) => (S.isPass()
      ? `${fmt.rs(S.memberPrice(p.price))} with your ${S.planConfig().pass.name}${S.passToday().used ? " tomorrow; today it’s full price" : ", at the counter"}.`
      : p.included ? "Included in your cup." : `Cup + ${fmt.rs(p.topUp)}. Your cups cover up to ${fmt.rs(cover)}; you pay the difference at the till.`);

    /* ---------------- Your cups ---------------- */
    function cupsHtml() {
      const m = ctx.member();
      const { opt, here } = cups();
      if (S.isPass()) {
        const t = S.passToday();
        const pct = Math.round(S.planConfig().pass.discount * 100);
        return html`<p class="brand-cups__line">${t.used ? "Today’s member coffee is used" : "Today’s member coffee: available"}</p>
          <p class="t-small t-muted">${S.planLabel(m)} · ${t.used ? "Back tomorrow; another one today is full price." : `${pct}% off any drink, at any of the ${S.branches(b.id).length} branches.`}</p>`;
      }
      if (!opt) {
        return html`<p class="brand-cups__line">${m.plan ? `No cups for ${b.name} on your plan.` : "No plan yet."}</p>
          <p class="t-small t-muted">${m.plan ? `Your ${S.planLabel(m)} doesn’t cover ${b.name}.` : "Choose a plan to have your coffee here."}</p>`;
      }
      const type = opt.plan.type;
      const line = type === "brand" ? S.brandBalanceLine()
        : type === "explorer" ? (opt.why === "pack-daily" ? "Today’s pack cup is used" : `${fmt.cups(here)} left on your pack · any branch`)
        : `${here} of ${opt.reserved || here} reserved here · any branch`;
      const sub = here > 0 ? "Pick a drink below, or just show your pass at the counter."
        : opt.why === "pack-daily" ? "One cup a day from a pack. The next one is tomorrow."
        : `No cups left here. ${S.planDateLine(m)}.`;
      return html`<p class="brand-cups__line num">${line}</p>
        <p class="t-small t-muted num">${S.planLabel(m)} · ${sub}</p>`;
    }

    /* ---------------- Menu ---------------- */
    // Matcha mode puts the Matcha section first; coffee keeps the brand's order
    const menuSections = () => (LCC.theme?.flavour() === "matcha"
      ? [...sections.filter((x) => /matcha/i.test(x)), ...sections.filter((x) => !/matcha/i.test(x))]
      : sections);
    function menuHtml() {
      return html`${menuSections().map((sec) => {
        const items = b.menu.filter((d) => d.section === sec && d[menuTemp] != null);
        if (!items.length) return "";
        return html`<section class="menu-sec" aria-label="${sec}">
          <h3 class="eyebrow menu-sec__title">${sec}</h3>
          <ul role="list">
            ${items.map((d) => html`<li>
              <button type="button" class="menu-row" data-drink="${d.id}" aria-haspopup="dialog" aria-controls="order-sheet">
                <span class="menu-row__main">
                  <span class="row__title">${S.drinkLabel(d, menuTemp)}</span>
                  <span class="row__meta num">${fmt.rs(d[menuTemp])} · <span class="drink-row__member">${fmt.rs(S.memberPrice(d[menuTemp]))} member price</span>${d.hot != null && d.iced != null ? "" : ` · ${d.hot != null ? "hot only" : "iced only"}`}</span>
                </span>
                ${priceTag(d, menuTemp)}
              </button>
            </li>`)}
          </ul>
        </section>`;
      })}`;
    }

    /* ---------------- Branches ---------------- */
    function branchesHtml() {
      return html`<ul role="list">
        ${S.branches(b.id).map((c) => {
          const open = S.openState(c);
          return html`<li>
            <button type="button" class="row branch-row" data-open-cafe="${c.id}" aria-label="${c.branch}. ${open.label}. ${fmt.statusLabel(c.status)}. Details">
              <span class="row__main">
                <span class="row__title">${c.branch}</span>
                <span class="row__meta num">${open.label} · ${c.distanceKm} km</span>
              </span>
              ${ui.statusPill(c.id, { bare: true, time: false })}
            </button>
          </li>`;
        })}
      </ul>`;
    }

    /* ---------------- Order sheet ---------------- */
    function sheetHtml() {
      const { item, temp } = picked;
      const p = S.drinkPrice(b.id, item, temp, band());
      const both = item.hot != null && item.iced != null;
      const use = canUse();
      return html`
        <div class="sheet__scrim" data-sheet-close></div>
        <div class="sheet__panel">
          <div class="sheet__handle" aria-hidden="true"></div>
          <div class="sheet__body order-sheet">
            <div class="stack" style="--stack-gap:var(--space-1)">
              <p class="eyebrow">${item.section}</p>
              <h2 class="t-h2" id="order-title" data-order-name>${S.drinkLabel(item, temp)}</h2>
              <p class="t-small t-muted num" data-order-price>${fmt.rs(p.price)} at the counter · ${p.band ? p.band.label : "Above Reserve"}</p>
            </div>
            ${both
              ? ui.segmented({ name: "ordertemp", label: "Hot or iced", value: p.temp, options: [{ value: "hot", label: "Hot" }, { value: "iced", label: "Iced" }] })
              : html`<p class="t-small t-muted">${item.hot != null ? "Served hot." : "Served iced."}</p>`}
            <p class="order-sheet__cover num" data-order-cover>${coverLine(p)}</p>
            <button type="button" class="btn btn--primary btn--block" data-pickup-order>Order for pickup</button>
            ${use
              ? html`<button type="button" class="btn btn--secondary btn--block" data-use-cup>Use a cup at the counter</button>
                  <p class="t-micro t-faint">Order ahead and collect, or show your pass at the counter: they see this drink when they scan it. Nothing is spent until then.</p>`
              : S.isPass()
              ? html`<button type="button" class="btn btn--secondary btn--block" data-use-cup>Have it at the counter</button>
                  <p class="t-micro t-faint">Show your pass: the counter sees this drink and takes the member price.</p>`
              : html`<p class="t-small t-muted">No cups to use here right now. You can still order and pay for it.</p>`}
            <button type="button" class="btn btn--link" data-skip-order>Skip, I’ll order at the counter</button>
          </div>
        </div>`;
    }

    function openOrder(btn, drinkId) {
      const item = S.menuItem(b.id, drinkId);
      picked = { item, temp: S.servedTemp(item, menuTemp) };
      btn.focus(); // closing returns here (Safari doesn't focus on tap)
      sheet.innerHTML = sheetHtml().s;
      ui.openSheet(sheet);
    }
    function paintOrder() {
      const { item, temp } = picked;
      const p = S.drinkPrice(b.id, item, temp, band());
      $("[data-order-name]", sheet).textContent = S.drinkLabel(item, temp);
      $("[data-order-price]", sheet).textContent = `${fmt.rs(p.price)} at the counter · ${p.band ? p.band.label : "Above Reserve"}`;
      $("[data-order-cover]", sheet).textContent = coverLine(p);
    }

    function onSheetClick(e) {
      const seg = e.target.closest('[data-segmented="ordertemp"] .segmented__option');
      if (seg) { ui.selectSegment(seg.parentElement, seg.dataset.value); picked.temp = seg.dataset.value; paintOrder(); return; }
      if (e.target.closest("[data-use-cup]")) {
        A.placeOrder({ brandId: b.id, drinkId: picked.item.id, temp: picked.temp });
        ctx.go("#/app/pass");
        return;
      }
      if (e.target.closest("[data-pickup-order]")) {
        LCC.appOrder?.start({ brandId: b.id, drinkId: picked.item.id, temp: picked.temp });
        ctx.go("#/app/order");
        return;
      }
      if (e.target.closest("[data-skip-order]")) { A.placeOrder({}); ctx.go("#/app/pass"); return; }
    }

    function onClick(e) {
      const seg = e.target.closest('[data-segmented="menutemp"] .segmented__option');
      if (seg) {
        if (seg.dataset.value === menuTemp) return;
        menuTemp = seg.dataset.value;
        ui.selectSegment(seg.parentElement, menuTemp);
        $("[data-menu]", view).innerHTML = menuHtml().s;
        return;
      }
      const d = e.target.closest("[data-drink]");
      if (d) { openOrder(d, d.dataset.drink); return; }
    }

    const repaintMine = () => {
      const set = (sel, markup) => { const n = $(sel, view); if (n) n.innerHTML = markup.s; };
      set("[data-brand-cups]", cupsHtml());
    };

    return {
      html: html`
        <div class="cafe-detail brand-page">
          <div class="screen-bar" data-screen-bar>
            <button type="button" class="icon-btn" data-back="#/app/cafes" aria-label="Back">${icon("arrowLeft")}</button>
            <span class="screen-bar__title" aria-hidden="true">${b.name}</span>
          </div>
          <div class="app-screen brand">
            <div class="brand__head">
              <span class="monogram" aria-hidden="true">${b.monogram}</span>
              <div class="stack" style="--stack-gap:var(--space-1)">
                <p class="eyebrow">Partner · ${S.branches(b.id).length} branches</p>
                <h1 class="t-h1" data-detail-title>${b.name}</h1>
              </div>
            </div>
            <p class="t-body t-muted">${b.line}</p>
            <div class="card brand-cups" data-brand-cups>${cupsHtml()}</div>

            <section class="app-section" aria-labelledby="menu-h">
              <div class="brand__bar">
                <h2 class="eyebrow" id="menu-h">Drinks</h2>
                ${ui.segmented({ name: "menutemp", label: "Hot or iced drinks", value: menuTemp, options: [{ value: "hot", label: "Hot" }, { value: "iced", label: "Iced" }] })}
              </div>
              <p class="t-small t-muted num">Your cups cover drinks up to ${fmt.rs(cover)}. Above that, you pay the difference at the till. ${LCC.bandsGuide.link("Bands explained")}</p>
              <div data-menu>${menuHtml()}</div>
              <p class="t-micro t-faint">${b.menuNote}</p>
            </section>

            <section class="app-section" aria-labelledby="branches-h">
              <h2 class="eyebrow app-section__title" id="branches-h">Branches</h2>
              <div data-branches>${branchesHtml()}</div>
            </section>

          </div>
        </div>`.s,
      mount() {
        sheet = document.createElement("div");
        sheet.className = "sheet";
        sheet.id = "order-sheet";
        sheet.setAttribute("role", "dialog");
        sheet.setAttribute("aria-modal", "true");
        sheet.setAttribute("aria-labelledby", "order-title");
        sheet.setAttribute("aria-hidden", "true");
        $(".phone__screen", el).appendChild(sheet);
        sheet.addEventListener("click", onSheetClick);
        view.addEventListener("click", onClick);
        // The bar shows the name once the big title scrolls away
        const bar = $("[data-screen-bar]", view);
        const title = $("[data-detail-title]", view);
        onScroll = () => bar.classList.toggle("is-titled", title.getBoundingClientRect().bottom < bar.getBoundingClientRect().bottom);
        view.addEventListener("scroll", onScroll, { passive: true });
        const onFlavour = () => { const n = $("[data-menu]", view); if (n) n.innerHTML = menuHtml().s; };
        document.addEventListener("lcc:flavour", onFlavour);
        return () => {
          ui.closeSheet(sheet);
          sheet.remove();
          view.removeEventListener("click", onClick);
          view.removeEventListener("scroll", onScroll);
          document.removeEventListener("lcc:flavour", onFlavour);
        };
      },
      on: {
        ledger: repaintMine,
        member: repaintMine,
        plan: repaintMine,
        tick: () => { const n = $("[data-branches]", view); if (n) n.innerHTML = branchesHtml().s; },
      },
    };
  };
})();
