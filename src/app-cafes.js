/* =====================================================================
   Lahore Coffee Club — app-cafes.js
   Member app: Cafés tab (#/app/cafes) and café detail (#/app/cafes/:id).
   Registers screen factories on LCC.appScreens; app.js mounts them.
   ===================================================================== */
(function () {
  "use strict";
  const LCC = window.LCC;
  const { store, fmt, ui } = LCC;
  const { html, $, $$, icon } = ui;
  const S = store.select;
  const REG = (LCC.appScreens = LCC.appScreens || {});
  const USUAL_HOUR = 18;
  const EXPLORER_GOAL = 5;

  // Search and filters survive a trip into a café and back
  const filters = { query: "", areaId: null, openNow: false, quietNow: false };
  let listScroll = 0;

  /** A short badge for list rows: what this member's plan means here. */
  function hereBadge(cafeId) {
    const here = S.cafeBalance(S.member().id, cafeId);
    if (here.type === "mycafes") return here.reserved ? html`<span class="badge badge--accent">${here.left} of ${here.reserved} reserved</span>` : "";
    return here.used >= here.cap ? html`<span class="badge">${here.cap} of ${here.cap} this month</span>` : "";
  }

  /* -------------------------------------------------------------------
     Cafés list
     ------------------------------------------------------------------- */
  REG.cafes = (ctx) => {
    const { view } = ctx;
    const areas = store.getState().areas;

    function chip(label, attrs, pressed) {
      return html`<button type="button" class="chip" ${ui.raw(attrs)} aria-pressed="${pressed}">${label}</button>`;
    }

    function rowHtml(c, i) {
      const open = S.openState(c);
      return html`<li class="enter" style="--i:${Math.min(i, 8)}">
        <a class="row cafe-row" href="#/app/cafes/${c.id}">
          <span class="row__main">
            <span class="row__title">${c.name}</span>
            <span class="row__meta num">${S.area(c.area).name} · ${fmt.rs(c.price)} a cup${open.open ? "" : " · Closed now"}</span>
            <span class="cafe-row__pills">
              ${ui.statusPill(c.id)}
              ${hereBadge(c.id)}
            </span>
          </span>
          <span class="row__trail" aria-hidden="true">${icon("chevronRight", { size: 20 })}</span>
        </a>
      </li>`;
    }

    function emptyHtml() {
      // e.g. “Nothing open and quiet in DHA right now.” / “Nothing in Liberty matches “mocha”.”
      const adj = [filters.openNow && "open", filters.quietNow && "quiet"].filter(Boolean).join(" and ");
      const where = filters.areaId ? ` in ${S.area(filters.areaId).name}` : "";
      const q = filters.query.trim();
      const line = `Nothing${adj ? ` ${adj}` : ""}${where}${q ? ` matches “${q}”` : ""}${adj ? " right now" : ""}.`;
      return html`<li class="cafes-empty enter">
        <p class="t-h3">${line}</p>
        <p class="t-small t-muted">Lahore has more good coffee than this list. Try fewer filters, or a drink like “latte”.</p>
        <button type="button" class="btn btn--secondary btn--compact" data-clear-filters>Clear filters</button>
      </li>`;
    }

    function paintList() {
      const list = $("[data-cafe-list]", view);
      if (!list) return;
      const results = S.searchCafes(filters);
      list.innerHTML = results.length ? html`${results.map(rowHtml)}`.s : emptyHtml().s;
      const any = filters.query || filters.areaId || filters.openNow || filters.quietNow;
      $("[data-cafe-count]", view).textContent = any ? `${results.length} of ${S.cafes().length} cafés` : `${S.cafes().length} partner cafés`;
      $$("[data-filter]", view).forEach((b) => b.setAttribute("aria-pressed", String(!!filters[b.dataset.filter])));
      $$("[data-area]", view).forEach((b) => b.setAttribute("aria-pressed", String(filters.areaId === b.dataset.area)));
      $("[data-clear-search]", view).hidden = !filters.query;
    }

    function onInput(e) {
      if (!e.target.matches("[data-cafe-q]")) return;
      filters.query = e.target.value;
      paintList();
    }

    function onClick(e) {
      const t = e.target;
      const f = t.closest("[data-filter]");
      if (f) { filters[f.dataset.filter] = !filters[f.dataset.filter]; paintList(); return; }
      const a = t.closest("[data-area]");
      if (a) { filters.areaId = filters.areaId === a.dataset.area ? null : a.dataset.area; paintList(); return; }
      if (t.closest("[data-clear-search]")) { filters.query = ""; $("[data-cafe-q]", view).value = ""; paintList(); $("[data-cafe-q]", view).focus(); return; }
      if (t.closest("[data-clear-filters]")) {
        Object.assign(filters, { query: "", areaId: null, openNow: false, quietNow: false });
        $("[data-cafe-q]", view).value = "";
        paintList();
        $("[data-cafe-q]", view).focus();
      }
    }

    return {
      html: html`
        <div class="app-screen cafes">
          <h1 class="t-h2">Cafés</h1>
          <div class="search">
            <label class="sr-only" for="cafe-q">Search by café, area or drink</label>
            ${icon("search", { size: 20 })}
            <input class="input search__input" id="cafe-q" type="search" data-cafe-q placeholder="Café, area or drink" autocomplete="off" enterkeyhint="search" value="${filters.query}">
            <button type="button" class="icon-btn search__clear" data-clear-search aria-label="Clear search" hidden>${icon("close", { size: 18 })}</button>
          </div>
          <div class="chip-row" role="group" aria-label="Filters">
            ${chip("Open now", 'data-filter="openNow"', filters.openNow)}
            ${chip("Quiet now", 'data-filter="quietNow"', filters.quietNow)}
            <span class="chip-row__rule" aria-hidden="true"></span>
            ${areas.map((a) => chip(a.name, `data-area="${a.id}"`, filters.areaId === a.id))}
          </div>
          <p class="t-small t-faint" data-cafe-count aria-live="polite"></p>
          <ul role="list" class="cafe-list" data-cafe-list></ul>
        </div>`.s,
      mount() {
        paintList();
        view.scrollTop = listScroll;
        view.addEventListener("input", onInput);
        view.addEventListener("click", onClick);
        return () => {
          listScroll = view.scrollTop;
          view.removeEventListener("input", onInput);
          view.removeEventListener("click", onClick);
        };
      },
      on: {
        // Pills update themselves; the list only changes when a filter depends on it
        "cafe:status": () => { if (filters.quietNow) paintList(); },
        tick: () => { if (filters.openNow) paintList(); },
        plan: () => paintList(),
        ledger: () => paintList(),
      },
    };
  };

  /* -------------------------------------------------------------------
     Café detail
     ------------------------------------------------------------------- */
  REG.cafeDetail = (ctx, cafeId) => {
    const { view } = ctx;
    const c = S.cafe(cafeId);
    const area = S.area(c.area);

    function visitsHtml() {
      const m = ctx.member();
      const total = (m.visits || {})[c.id] || 0;
      const loyal = S.loyalty(c.id);
      const tried = m.cafesTried || [];
      const beenHere = tried.includes(c.id);
      let explorer;
      if (tried.length >= EXPLORER_GOAL) explorer = "You’ve earned Explorer: five cafés tried.";
      else if (beenHere) explorer = `One of the ${tried.length} cafés you’ve tried. ${EXPLORER_GOAL - tried.length} more for the Explorer badge.`;
      else explorer = `New to you. A cup here makes ${tried.length + 1} of ${EXPLORER_GOAL} cafés for the Explorer badge.`;
      const exploredNow = Math.min(EXPLORER_GOAL, tried.length);
      return html`
        <div class="visits">
          <div class="visits__item">
            <div class="visits__head">
              <span class="row__title">${total ? `${total} ${total === 1 ? "visit" : "visits"} here` : "You haven’t been yet"}</span>
              <span class="t-small t-muted num">${loyal.visits} of ${loyal.goal} to a free cup</span>
            </div>
            ${meter(loyal.visits, loyal.goal, `${loyal.visits} of ${loyal.goal} visits to a free cup`)}
            ${loyal.freeCupsEarned ? html`<p class="t-micro t-faint">${fmt.cups(loyal.freeCupsEarned)} on the house so far.</p>` : ""}
          </div>
          <div class="visits__item">
            <div class="visits__head">
              <span class="row__title">Explorer</span>
              <span class="t-small t-muted num">${exploredNow} of ${EXPLORER_GOAL} cafés</span>
            </div>
            ${meter(exploredNow, EXPLORER_GOAL, `${exploredNow} of ${EXPLORER_GOAL} cafés tried`)}
            <p class="t-small t-muted">${explorer}</p>
          </div>
        </div>`;
    }

    function meter(value, goal, label) {
      return html`<div class="meter" role="img" aria-label="${label}">
        ${Array.from({ length: goal }, (_, i) => html`<span class="meter__seg${i < value ? " is-on" : ""}"></span>`)}
      </div>`;
    }

    /** What the member can use here, from the ledger, and the next step. */
    function actionHtml() {
      const here = S.cafeBalance(ctx.member().id, c.id);
      if (here.type === "mycafes") {
        return here.reserved
          ? html`<p class="t-small t-muted num" data-here-line><strong>${fmt.cups(here.left)} reserved here</strong>, of ${here.reserved} this month.</p>
              <button type="button" class="btn btn--secondary btn--block" data-start-plan="${c.id}">Change my cups</button>`
          : html`<p class="t-small t-muted" data-here-line><strong>Not in your plan.</strong> Add it?</p>
              <button type="button" class="btn btn--primary btn--block" data-start-plan="${c.id}">Add to my plan</button>`;
      }
      const line = here.left > 0
        ? html`<strong>You can have ${here.left === 1 ? "1 more" : `${here.left} more`} here this month</strong> on your Explorer plan.`
        : here.used >= here.cap
          ? html`<strong>You’ve had your ${here.cap} here this month.</strong> Every other partner café is still open to you.`
          : html`<strong>No cups left this month.</strong> Your plan renews on ${fmt.shortDate(ctx.member().renewsAt)}.`;
      return html`<p class="t-small t-muted num" data-here-line>${line}</p>
        <button type="button" class="btn btn--secondary btn--block" data-start-plan="${c.id}">Reserve cups here with My cafés</button>`;
    }

    function paintOpen() {
      const n = $("[data-open-state]", view);
      if (n) n.textContent = S.openState(c).label;
    }

    let onScroll = null;
    return {
      html: html`
        <div class="cafe-detail">
          <div class="screen-bar" data-screen-bar>
            <button type="button" class="icon-btn" data-back="#/app/cafes" aria-label="Back">${icon("arrowLeft")}</button>
            <span class="screen-bar__title" aria-hidden="true">${c.name}</span>
          </div>
          <div class="app-screen cafe-detail__body">
            <div class="stack" style="--stack-gap:var(--space-2)">
              <p class="eyebrow">${area.name} · ${c.distanceKm} km</p>
              <h1 class="t-h1" data-detail-title>${c.name}</h1>
              <p class="t-body t-muted">${c.blurb}</p>
            </div>
            <div class="cafe-detail__status">${ui.statusPill(c.id)}</div>

            <dl class="facts">
              <div><dt>${icon("clock", { size: 18 })}<span class="sr-only">Hours</span></dt><dd>${c.hours.label}<span class="t-faint"> · <span data-open-state>${S.openState(c).label}</span></span></dd></div>
              <div><dt>${ui.cupIcon(S.usualStatus(c, USUAL_HOUR).status, { size: 18, cls: "" })}<span class="sr-only">Typical</span></dt><dd>Usually ${fmt.statusLabel(S.usualStatus(c, USUAL_HOUR).status).toLowerCase()} at 6 pm</dd></div>
              <div><dt>${icon("store", { size: 18 })}<span class="sr-only">Price</span></dt><dd class="num">${fmt.rs(c.price)} a cup at the counter</dd></div>
            </dl>
            <div class="cluster" style="--cluster-gap:var(--space-2)">${c.tags.map((t) => html`<span class="badge">${t}</span>`)}</div>

            <section class="app-section" aria-labelledby="drinks-h">
              <h2 class="eyebrow app-section__title" id="drinks-h">Signature drinks</h2>
              <ul role="list">
                ${c.drinks.map((d) => html`<li class="row">
                  <div class="row__main"><div class="row__title">${d.name}</div><div class="row__meta num">${fmt.rs(d.price)} at the counter</div></div>
                  <span class="badge${d.credits > 1 ? " badge--accent" : ""}">Uses ${fmt.cups(d.credits)}</span>
                </li>`)}
              </ul>
            </section>

            <section class="app-section" aria-labelledby="visits-h">
              <h2 class="eyebrow app-section__title" id="visits-h">Your visits</h2>
              <div data-visits>${visitsHtml()}</div>
            </section>
          </div>
          <div class="sticky-action" data-detail-action>${actionHtml()}</div>
        </div>`.s,
      mount() {
        // The bar shows the name once the big title scrolls away
        const bar = $("[data-screen-bar]", view);
        const title = $("[data-detail-title]", view);
        onScroll = () => bar.classList.toggle("is-titled", title.getBoundingClientRect().bottom < bar.getBoundingClientRect().bottom);
        view.addEventListener("scroll", onScroll, { passive: true });
        return () => view.removeEventListener("scroll", onScroll);
      },
      on: {
        redeem: ({ entry }) => { if (entry.memberId === ctx.member().id) $("[data-visits]", view).innerHTML = visitsHtml().s; },
        plan: () => { $("[data-detail-action]", view).innerHTML = actionHtml().s; },
        ledger: () => { $("[data-detail-action]", view).innerHTML = actionHtml().s; },
        tick: paintOpen,
      },
    };
  };
})();
