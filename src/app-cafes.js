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
  const filters = { query: "", areaId: null, openNow: false, statuses: [], tags: [] };
  const PAGE = 6;
  let shown = PAGE;
  let listScroll = 0;

  // Matcha mode: matcha drinks first, and a small tag on cafés that serve it (read from the drinks)
  const matchaMode = () => LCC.theme?.flavour() === "matcha";
  const isMatcha = (d) => /matcha/i.test(d.name);
  const servesMatcha = (c) => c.drinks.some(isMatcha);

  /** Filters from the sheet that are on: one per choice, for “Filters · 2”. */
  const sheetCount = (f = filters) => (f.openNow ? 1 : 0) + f.statuses.length + f.tags.length;

  /* -------------------------------------------------------------------
     Cafés list: sticky search, area dropdown, Filters sheet, short rows
     ------------------------------------------------------------------- */
  REG.cafes = (ctx) => {
    const { view, el } = ctx;
    const areas = store.getState().areas;
    // Every tag a partner café uses, in a stable order
    const allTags = [...new Set(S.cafes().flatMap((c) => c.tags))].sort();
    let draft = null; // the sheet's choices until Apply
    let sheet = null;
    let painted = ""; // what the list shows (ids and open state), so the clock only repaints on a change
    const signature = (results) => `${shown}|${results.map((c) => `${c.id}:${S.openState(c).open ? 1 : 0}`).join(",")}`;

    function rowHtml(c) {
      const open = S.openState(c).open;
      return html`<li>
        <a class="cafe-line" href="#/app/cafes/${c.brandId || c.id}" aria-label="${c.name}, ${c.branch || S.area(c.area).name}${matchaMode() && servesMatcha(c) ? ", serves matcha" : ""}, ${fmt.statusLabel(c.status).toLowerCase()}, ${open ? "open" : "closed"}">
          <span class="cafe-line__name">${c.name}</span>
          <span class="cafe-line__area">${c.branch || S.area(c.area).name}</span>
          <span class="cafe-line__end" aria-hidden="true">
            ${matchaMode() && servesMatcha(c) ? html`<span class="badge badge--matcha">Matcha</span>` : ""}
            ${ui.statusPill(c.id, { bare: true, time: false })}
            <span class="cafe-line__open${open ? "" : " is-closed"}">${open ? "Open" : "Closed"}</span>
          </span>
        </a>
      </li>`;
    }

    function paintList() {
      const list = $("[data-cafe-list]", view);
      if (!list) return;
      const results = S.searchCafes(filters);
      painted = signature(results);
      const any = filters.query || filters.areaId || sheetCount();
      $("[data-cafe-count]", view).textContent = any ? `${results.length} of ${S.cafes().length} cafés` : `${S.cafes().length} partner cafés`;
      list.innerHTML = results.length
        ? html`${results.slice(0, shown).map(rowHtml)}`.s
        : html`<li class="cafes-empty">
            <p class="t-body">No cafés match that. Try another area.</p>
            ${any ? html`<button type="button" class="btn btn--secondary btn--compact" data-clear-filters>Clear search and filters</button>` : ""}
          </li>`.s;
      const more = $("[data-show-more]", view);
      more.hidden = results.length <= shown;
      more.textContent = `Show more (${Math.max(0, results.length - shown)})`;
      const n = sheetCount();
      const fb = $("[data-open-filters]", view);
      $("[data-filter-label]", fb).textContent = n ? `Filters · ${n}` : "Filters";
      fb.classList.toggle("is-on", n > 0);
      fb.setAttribute("aria-label", n ? `Filters, ${n} on` : "Filters");
      $("[data-clear-search]", view).hidden = !filters.query;
      $("[data-cafe-area]", view).value = filters.areaId || "";
    }

    // A new search or filter starts the list from the top again
    const refilter = () => { shown = PAGE; paintList(); };

    /* Filters sheet: lives on the phone screen (not in the scrolling view) */
    function sheetHtml() {
      const chip = (label, attrs, on) => html`<button type="button" class="chip" ${ui.raw(attrs)} aria-pressed="${on}">${label}</button>`;
      return html`
        <div class="sheet__scrim" data-sheet-close></div>
        <div class="sheet__panel">
          <div class="sheet__handle" aria-hidden="true"></div>
          <div class="sheet__body filters">
            <h2 class="t-h3" id="filters-title">Filters</h2>
            <div class="filters__row">
              <span id="f-open-l">Open now</span>
              <button type="button" class="toggle" role="switch" aria-labelledby="f-open-l" aria-checked="${draft.openNow}" data-f-open></button>
            </div>
            <fieldset class="filters__group">
              <legend class="eyebrow">Busy level</legend>
              <div class="cluster" style="--cluster-gap:var(--space-2)">
                ${store.statuses.map((st) => chip(html`${ui.cupIcon(st, { size: 14, cls: "" })}${fmt.statusLabel(st)}`, `data-f-status="${st}"`, draft.statuses.includes(st)))}
              </div>
            </fieldset>
            <fieldset class="filters__group">
              <legend class="eyebrow">What they offer</legend>
              <div class="cluster" style="--cluster-gap:var(--space-2)">
                ${allTags.map((t) => chip(t, `data-f-tag="${t}"`, draft.tags.includes(t)))}
              </div>
            </fieldset>
            <div class="filters__actions">
              <button type="button" class="btn btn--secondary" data-f-clear>Clear</button>
              <button type="button" class="btn btn--primary" data-f-apply>Apply</button>
            </div>
          </div>
        </div>`;
    }

    function openFilters() {
      draft = { openNow: filters.openNow, statuses: [...filters.statuses], tags: [...filters.tags] };
      sheet.innerHTML = sheetHtml().s;
      ui.openSheet(sheet);
    }

    function paintDraft() {
      $("[data-f-open]", sheet).setAttribute("aria-checked", String(draft.openNow));
      $$("[data-f-status]", sheet).forEach((b) => b.setAttribute("aria-pressed", String(draft.statuses.includes(b.dataset.fStatus))));
      $$("[data-f-tag]", sheet).forEach((b) => b.setAttribute("aria-pressed", String(draft.tags.includes(b.dataset.fTag))));
    }

    const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

    function onSheetClick(e) {
      const t = e.target;
      if (t.closest("[data-f-open]")) { draft.openNow = !draft.openNow; paintDraft(); return; }
      const st = t.closest("[data-f-status]");
      if (st) { draft.statuses = toggleIn(draft.statuses, st.dataset.fStatus); paintDraft(); return; }
      const tag = t.closest("[data-f-tag]");
      if (tag) { draft.tags = toggleIn(draft.tags, tag.dataset.fTag); paintDraft(); return; }
      if (t.closest("[data-f-clear]")) { draft = { openNow: false, statuses: [], tags: [] }; paintDraft(); return; }
      if (t.closest("[data-f-apply]")) {
        Object.assign(filters, draft);
        ui.closeSheet(sheet);
        refilter();
      }
    }

    function onInput(e) {
      if (e.target.matches("[data-cafe-q]")) { filters.query = e.target.value; refilter(); }
    }
    function onChange(e) {
      if (e.target.matches("[data-cafe-area]")) { filters.areaId = e.target.value || null; refilter(); }
    }

    function onClick(e) {
      const t = e.target;
      // Focus the button first, so closing the sheet returns there (Safari doesn't focus on tap)
      const fb = t.closest("[data-open-filters]");
      if (fb) { fb.focus(); openFilters(); return; }
      if (t.closest("[data-show-more]")) {
        const first = shown;
        shown = S.searchCafes(filters).length;
        paintList();
        // Keep keyboard focus in the list: on the first new café
        $$("[data-cafe-list] a", view)[first]?.focus();
        return;
      }
      if (t.closest("[data-clear-search]")) { filters.query = ""; $("[data-cafe-q]", view).value = ""; refilter(); $("[data-cafe-q]", view).focus(); return; }
      if (t.closest("[data-clear-filters]")) {
        Object.assign(filters, { query: "", areaId: null, openNow: false, statuses: [], tags: [] });
        $("[data-cafe-q]", view).value = "";
        refilter();
        $("[data-cafe-q]", view).focus();
      }
    }

    return {
      html: html`
        <div class="app-screen cafes">
          <h1 class="t-h2">Cafés</h1>
          <div class="cafes__search">
            <div class="search">
              <label class="sr-only" for="cafe-q">Search by café name or area</label>
              ${icon("search", { size: 20 })}
              <input class="input search__input" id="cafe-q" type="search" data-cafe-q placeholder="Café name or area" autocomplete="off" enterkeyhint="search" value="${filters.query}">
              <button type="button" class="icon-btn search__clear" data-clear-search aria-label="Clear search" hidden>${icon("close", { size: 18 })}</button>
            </div>
          </div>
          <div class="cafes__tools">
            <div class="select">
              <label class="sr-only" for="cafe-area">Area</label>
              <select class="input" id="cafe-area" data-cafe-area>
                <option value="">All areas</option>
                ${areas.map((a) => html`<option value="${a.id}">${a.name}</option>`)}
              </select>
            </div>
            <button type="button" class="btn btn--secondary cafes__filters" data-open-filters aria-haspopup="dialog" aria-controls="filters-sheet">
              ${icon("sliders", { size: 18 })}<span data-filter-label>Filters</span>
            </button>
          </div>
          <div>
            <p class="sr-only" data-cafe-count aria-live="polite"></p>
            <ul role="list" class="cafe-lines" data-cafe-list></ul>
            <button type="button" class="btn btn--secondary btn--block cafes__more" data-show-more hidden>Show more</button>
          </div>
        </div>`.s,
      mount() {
        sheet = document.createElement("div");
        sheet.className = "sheet";
        sheet.id = "filters-sheet";
        sheet.setAttribute("role", "dialog");
        sheet.setAttribute("aria-modal", "true");
        sheet.setAttribute("aria-labelledby", "filters-title");
        sheet.setAttribute("aria-hidden", "true");
        $(".phone__screen", el).appendChild(sheet);
        sheet.addEventListener("click", onSheetClick);
        paintList();
        view.scrollTop = listScroll;
        view.addEventListener("input", onInput);
        view.addEventListener("change", onChange);
        view.addEventListener("click", onClick);
        document.addEventListener("lcc:flavour", paintList);
        return () => {
          document.removeEventListener("lcc:flavour", paintList);
          listScroll = view.scrollTop;
          ui.closeSheet(sheet);
          sheet.remove();
          view.removeEventListener("input", onInput);
          view.removeEventListener("change", onChange);
          view.removeEventListener("click", onClick);
        };
      },
      on: {
        // Status words update themselves; the list only changes when a filter depends on it
        "cafe:status": () => { if (filters.statuses.length) paintList(); },
        tick: () => { if (signature(S.searchCafes(filters)) !== painted) paintList(); }, // open / closed follows the clock
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
      // Same source as the Club tab's passport and Explorer badge: the ledger
      const tried = S.club(m.id).passport.stamps.filter((x) => x.visited).map((x) => x.cafe.id);
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
              <button type="button" class="btn btn--secondary btn--block" data-start-plan="${c.id}">Add to my plan</button>`;
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
                ${(matchaMode() ? [...c.drinks.filter(isMatcha), ...c.drinks.filter((d) => !isMatcha(d))] : c.drinks).map((d) => html`<li>
                  <button type="button" class="row drink-row" data-start-order="${c.id}" data-drink="${d.id}" aria-label="${d.name}, ${fmt.rs(d.price)}, uses ${fmt.cups(d.credits)}. Order for pickup">
                    <span class="row__main"><span class="row__title">${d.name}</span><span class="row__meta num">${fmt.rs(d.price)} at the counter</span></span>
                    <span class="badge${d.credits > 1 ? " badge--accent" : ""}">Uses ${fmt.cups(d.credits)}</span>
                  </button>
                </li>`)}
              </ul>
              <p class="t-micro t-faint">Tap a drink to order it for pickup.</p>
            </section>

            <section class="app-section" aria-labelledby="visits-h">
              <h2 class="eyebrow app-section__title" id="visits-h">Your visits</h2>
              <div data-visits>${visitsHtml()}</div>
            </section>
          </div>
          <div class="sticky-action">
            <button type="button" class="btn btn--primary btn--block" data-start-order="${c.id}">Order for pickup</button>
            <div class="stack" style="--stack-gap:var(--space-3)" data-detail-action>${actionHtml()}</div>
          </div>
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
