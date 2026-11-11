/* =====================================================================
   Lahore Coffee Club — app-brand.js
   Member app: a brand partner's page (#/app/cafes/doubleshot, also
   reached from any branch's row or pin). Your cups, the drinks menu with
   a Hot / Iced toggle, ordering ("Use a cup"), branches and plans.

   Cups belong to the brand, not a branch: they work at every branch.
   Ordering only tells the counter what you'd like; the cup is spent when
   the counter redeems your code (store.actions.placeOrder / redeem).
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
    const cover = b.economics.coverUpTo;
    const sections = [...new Set(b.menu.map((d) => d.section))];
    let sheet = null;
    let picked = null; // { item, temp } while the order sheet is open
    let onScroll = null;

    const hasPlan = () => ctx.member().plan?.type === "brand" && ctx.member().plan.brandId === b.id;
    const left = () => (hasPlan() ? Math.max(0, S.balance().left) : 0);
    const priceTag = (item, temp) => {
      const p = S.drinkPrice(b.id, item, temp);
      return p.included ? html`<span class="badge">Included</span>` : html`<span class="badge badge--top num">Cup + ${fmt.rs(p.topUp)}</span>`;
    };

    /* ---------------- Your cups ---------------- */
    function cupsHtml() {
      const m = ctx.member();
      if (hasPlan()) {
        return html`<p class="brand-cups__line num">${S.brandBalanceLine()}</p>
          <p class="t-small t-muted num">${S.planLabel(m)} plan · renews on ${fmt.shortDate(m.renewsAt)}. Pick a drink below, or just show your pass at the counter.</p>`;
      }
      return html`<p class="brand-cups__line">One plan, all ${S.branches(b.id).length} branches.</p>
        <p class="t-small t-muted">${b.name} cups come with a ${b.name} plan and work at any branch.${m.plan ? ` Your ${S.planLabel(m)} plan covers the other partner cafés.` : ""}</p>
        <a class="btn btn--secondary btn--compact" href="#brand-plans" data-to-plans>See ${b.name} plans</a>`;
    }

    /* ---------------- Menu ---------------- */
    function menuHtml() {
      return html`${sections.map((sec) => {
        const items = b.menu.filter((d) => d.section === sec && d[menuTemp] != null);
        if (!items.length) return "";
        return html`<section class="menu-sec" aria-label="${sec}">
          <h3 class="eyebrow menu-sec__title">${sec}</h3>
          <ul role="list">
            ${items.map((d) => html`<li>
              <button type="button" class="menu-row" data-drink="${d.id}" aria-haspopup="dialog" aria-controls="order-sheet">
                <span class="menu-row__main">
                  <span class="row__title">${S.drinkLabel(d, menuTemp)}</span>
                  <span class="row__meta num">${fmt.rs(d[menuTemp])}${d.hot != null && d.iced != null ? "" : ` · ${d.hot != null ? "hot only" : "iced only"}`}</span>
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

    /* ---------------- Plans ---------------- */
    function plansHtml() {
      const cur = ctx.member().plan;
      return html`<ul role="list" class="brand-plans">
        ${b.plans.map((p) => {
          const mine = cur?.type === "brand" && cur.brandId === b.id && cur.planId === p.id;
          return html`<li class="card brand-plan${mine ? " is-mine" : ""}">
            <div class="brand-plan__head">
              <span class="t-h3 num">${fmt.cups(p.cups)}</span>
              ${mine ? html`<span class="badge badge--accent">Your plan</span>` : ""}
              <span class="t-h3 num brand-plan__price">${fmt.rs(p.price)}</span>
            </div>
            <p class="t-small t-muted num">About ${fmt.rs(p.price / p.cups)} a cup, at any branch, every month.</p>
            ${mine ? "" : html`<button type="button" class="btn btn--secondary btn--block" data-brand-plan="${p.id}">Choose ${p.cups} cups</button>`}
          </li>`;
        })}
      </ul>`;
    }

    /* ---------------- Order sheet ---------------- */
    function sheetHtml() {
      const { item, temp } = picked;
      const p = S.drinkPrice(b.id, item, temp);
      const both = item.hot != null && item.iced != null;
      const canUse = hasPlan() && left() > 0;
      return html`
        <div class="sheet__scrim" data-sheet-close></div>
        <div class="sheet__panel">
          <div class="sheet__handle" aria-hidden="true"></div>
          <div class="sheet__body order-sheet">
            <div class="stack" style="--stack-gap:var(--space-1)">
              <p class="eyebrow">${item.section}</p>
              <h2 class="t-h2" id="order-title" data-order-name>${S.drinkLabel(item, temp)}</h2>
              <p class="t-small t-muted num" data-order-price>${fmt.rs(p.price)} at the counter</p>
            </div>
            ${both
              ? ui.segmented({ name: "ordertemp", label: "Hot or iced", value: p.temp, options: [{ value: "hot", label: "Hot" }, { value: "iced", label: "Iced" }] })
              : html`<p class="t-small t-muted">${item.hot != null ? "Served hot." : "Served iced."}</p>`}
            <p class="order-sheet__cover num" data-order-cover>${p.included ? "Included in your cup." : `Cup + ${fmt.rs(p.topUp)}. A cup covers up to ${fmt.rs(cover)}; you pay the difference at the till.`}</p>
            ${canUse
              ? html`<button type="button" class="btn btn--primary btn--block" data-use-cup>Use a cup</button>
                  <p class="t-micro t-faint">The counter sees your drink when they scan your pass. Nothing is spent until they do.</p>`
              : html`<p class="t-small t-muted">${hasPlan() ? "No cups left this month. Your plan renews soon." : `Choose a ${b.name} plan to use cups for this.`}</p>
                  ${hasPlan() ? "" : html`<button type="button" class="btn btn--primary btn--block" data-sheet-to-plans>See ${b.name} plans</button>`}`}
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
      const p = S.drinkPrice(b.id, item, temp);
      $("[data-order-name]", sheet).textContent = S.drinkLabel(item, temp);
      $("[data-order-price]", sheet).textContent = `${fmt.rs(p.price)} at the counter`;
      $("[data-order-cover]", sheet).textContent = p.included ? "Included in your cup." : `Cup + ${fmt.rs(p.topUp)}. A cup covers up to ${fmt.rs(cover)}; you pay the difference at the till.`;
    }
    const toPlans = () => $("#brand-plans", view)?.scrollIntoView({ block: "start", behavior: ui.reducedMotion() ? "auto" : "smooth" });

    function onSheetClick(e) {
      const seg = e.target.closest('[data-segmented="ordertemp"] .segmented__option');
      if (seg) { ui.selectSegment(seg.parentElement, seg.dataset.value); picked.temp = seg.dataset.value; paintOrder(); return; }
      if (e.target.closest("[data-use-cup]")) {
        A.placeOrder({ brandId: b.id, drinkId: picked.item.id, temp: picked.temp });
        ctx.go("#/app/pass");
        return;
      }
      if (e.target.closest("[data-skip-order]")) { A.placeOrder({}); ctx.go("#/app/pass"); return; }
      if (e.target.closest("[data-sheet-to-plans]")) { ui.closeSheet(sheet); toPlans(); }
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
      if (e.target.closest("[data-to-plans]")) { e.preventDefault(); toPlans(); return; }
      const pl = e.target.closest("[data-brand-plan]");
      if (pl) { LCC.appPlan?.start({ mode: "brand", brandPlanId: pl.dataset.brandPlan }); ctx.go("#/app/plan"); }
    }

    const repaintMine = () => {
      const set = (sel, markup) => { const n = $(sel, view); if (n) n.innerHTML = markup.s; };
      set("[data-brand-cups]", cupsHtml());
      set("[data-brand-plans]", plansHtml());
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
              <p class="t-small t-muted num">A cup covers any drink up to ${fmt.rs(cover)}. Above that, you pay the difference at the till.</p>
              <div data-menu>${menuHtml()}</div>
              <p class="t-micro t-faint">${b.menuNote}</p>
            </section>

            <section class="app-section" aria-labelledby="branches-h">
              <h2 class="eyebrow app-section__title" id="branches-h">Branches</h2>
              <div data-branches>${branchesHtml()}</div>
            </section>

            <section class="app-section" id="brand-plans" aria-labelledby="plans-h">
              <h2 class="eyebrow app-section__title" id="plans-h">${b.name} plans</h2>
              <div data-brand-plans>${plansHtml()}</div>
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
        return () => {
          ui.closeSheet(sheet);
          sheet.remove();
          view.removeEventListener("click", onClick);
          view.removeEventListener("scroll", onScroll);
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
