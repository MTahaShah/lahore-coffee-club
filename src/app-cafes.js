/* =====================================================================
   Lahore Coffee Club — app-cafes.js
   Member app: Cafés tab (#/app/cafes) and café detail (#/app/cafes/:id).
   The tab is one map + list screen (Cafés search pass): the Lahore map
   behind everything, a floating search bar and quick chips, and a bottom
   sheet (peek / half / full) listing the cafés in view. #/app/map opens
   it with the sheet lowered.
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


  // Matcha mode: matcha drinks first, and a small tag on cafés that serve it (read from the drinks)
  const matchaMode = () => LCC.theme?.flavour() === "matcha";
  const isMatcha = (d) => /matcha/i.test(d.name);
  // A drink's band, and the top-up on the member's plan (empty when it's included)
  const bandLabel = (c, d) => S.itemBand(S.menuItem(c.brandId, d.id) || { hot: d.price })?.label || "Above Reserve";
  const topUpFor = (c, d) => {
    const item = S.menuItem(c.brandId, d.id);
    if (!item || !S.member().plan || S.isPass()) return ""; // the Pass takes any drink
    const p = S.drinkPrice(c.brandId, item, "hot", S.bandAt(undefined, c.brandId));
    return p.included ? "" : ` · Cup + ${fmt.rs(p.topUp)} on your plan`;
  };
  const servesMatcha = (c) => c.drinks.some(isMatcha);


  /* -------------------------------------------------------------------
     Cafés tab (Cafés search pass): one map + list screen.
     The Lahore map (LCC.memberMap.svg) fills the screen; a floating
     search bar and a row of quick chips sit on top; a bottom sheet with
     three heights (peek, half, full) holds the list. Pins show the member
     price of a latte (or of the drink searched for) with a busy dot. The
     list shows the cafés in view, and follows panning and zooming.
     ------------------------------------------------------------------- */
  // Kept across visits (and a trip into a café and back); in memory only
  const CS = {
    q: "",              // free text from the search screen (name, area, drink words)
    drink: null,        // a drink chosen in search: filters to cafés serving it, prices follow it
    barLabel: "",       // what the search bar shows while a search is on
    areas: [], openNow: false, quiet: false, tags: [], price: null, // filters (price: "classic" | "signature")
    nearMe: false,
    sort: "nearest",    // nearest | quietest | price
    snap: "half",       // peek | half | full
    selected: null,
    cam: null,          // { k, tx, ty } map camera, screen px
    recent: [],         // last 3 searches: { kind, value, label }
    saved: new Set(),   // saved cafés, this session only
  };
  REG.cafesView = (v) => { if (v === "map") CS.snap = "peek"; }; // #/app/map opens the map (sheet down)
  const ME = { x: 505, y: 352 }; // the member's (fake) location: Gulberg, on the data grid
  const SNAPS = ["peek", "half", "full"];
  const STATUS_WORD = { quiet: "Quiet now", moderate: "Busy", packed: "Packed" };
  const STATUS_RANK = { quiet: 0, moderate: 1, packed: 2 };
  const QUICK = [
    { id: "open", label: "Open now" }, { id: "quiet", label: "Quiet now" }, { id: "near", label: "Near me" },
    { id: "Work-friendly", label: "Work-friendly", tag: true }, { id: "Pickup", label: "Pickup", tag: true }, { id: "classic", label: "Under Rs 750" },
  ];
  const SHEET_TAGS = ["Work-friendly", "Outdoor", "Pickup", "Late night"];
  const TRY = {
    areas: ["gulberg", "dha", "model-town"],
    drinks: ["Spanish latte", "Pistachio latte", "V60"],
    moods: [{ id: "work", label: "Quiet to work" }, { id: "late", label: "Open late" }],
  };
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const esc = ui.esc;
  /** Text with the matched letters marked. */
  function hl(text, q) {
    const t = String(text), n = norm(q);
    const i = n ? norm(t).indexOf(n) : -1;
    if (i < 0) return raw(esc(t));
    return raw(`${esc(t.slice(0, i))}<mark>${esc(t.slice(i, i + n.length))}</mark>${esc(t.slice(i + n.length))}`);
  }
  const { raw } = ui;
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  /** The drink a café's price line uses: the one searched for (its cheapest match), else the latte. */
  function refDrink(c, drink = CS.drink) {
    const b = S.brandFor(c.id);
    const menu = b?.menu || [];
    let item = null;
    if (drink) {
      const d = norm(drink);
      item = menu.filter((x) => norm(x.name).includes(d)).sort((x, y) => (x.hot ?? x.iced) - (y.hot ?? y.iced))[0] || null;
    } else {
      item = S.menuItem(b?.id, c.latte || "ds-latte") || menu.find((x) => /latte/i.test(x.name)) || null;
    }
    if (!item) return null;
    const temp = item.hot != null ? "hot" : "iced";
    const list = S.drinkPrice(b.id, item, temp).price;
    return { item, name: drink ? item.name : "Latte", list, member: S.memberPrice(list) };
  }
  const servesDrink = (c, d) => !!refDrink(c, d);
  const pickupOk = (c) => !!S.pickupAvailable?.(c.id)?.ok;
  const hasTag = (c, t) => (t === "Pickup" ? pickupOk(c) : c.tags.includes(t));
  /** Every drink on a partner menu, once (for search). */
  let drinkNames = null;
  const allDrinks = () => (drinkNames ??= [...new Map(S.partnerBrands().flatMap((b) => b.menu).map((d) => [norm(d.name), d.name])).values()]);

  /** Does a café pass the search and filters? f: a filter set (the sheet's draft, or CS). */
  function matches(c, f = CS) {
    if (f.q && !S.searchCafes({ query: f.q }).some((x) => x.id === c.id) && !servesDrink(c, f.q)) return false;
    if (f.drink && !servesDrink(c, f.drink)) return false;
    if (f.areas.length && !f.areas.includes(c.area)) return false;
    if (f.openNow && !S.openState(c).open) return false;
    if (f.quiet && c.status !== "quiet") return false;
    if (f.tags.length && !f.tags.every((t) => hasTag(c, t))) return false;
    if (f.price) {
      const r = refDrink(c, f.drink);
      if (!r || r.list > S.band(f.price).maxPrice) return false;
    }
    return true;
  }
  // BACKEND: GET /cafes?q=&drink=&area=&open=&quiet=&tags=&price= (the same filters, server-side)
  const filtered = (f = CS) => S.cafes().filter((c) => matches(c, f));
  const filterCount = (f = CS) => f.areas.length + (f.openNow ? 1 : 0) + (f.quiet ? 1 : 0) + f.tags.length + (f.price ? 1 : 0);

  /** "Open · closes 11pm", "Closes in 40 min", "Opens 8am tomorrow". */
  const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };
  const clock = (mins) => { const h = Math.floor(mins / 60) % 24, m = mins % 60; return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`; };
  function hoursLine(c, at = Date.now()) {
    const open = toMin(c.hours.open);
    let close = toMin(c.hours.close);
    if (close <= open) close += 1440;
    const d = new Date(at);
    let now = d.getHours() * 60 + d.getMinutes();
    if (now < open && now + 1440 < close) now += 1440;
    if (now >= open && now < close) {
      const left = close - now;
      return left <= 60 ? `Closes in ${left} min` : `Open · closes ${clock(close)}`;
    }
    return now < open ? `Opens ${clock(open)}` : `Opens ${clock(open)} tomorrow`;
  }

  REG.cafes = (ctx) => {
    const { view, el } = ctx;
    const M = LCC.memberMap;
    const reduce = () => ui.reducedMotion();
    let root = null, mapEl = null, worldEl = null, pinsEl = null, sheetEl = null, searchEl = null, filterSheet = null;
    let size = { w: 360, h: 640 };
    let inView = [];            // ids in the visible map region
    let inViewTimer = null, flyRaf = null;
    let draft = null;           // the filter sheet's choices until "Show"
    let searchText = "";

    /* ---------- Geometry ---------- */
    const worldOf = (c) => M.project(c.x, c.y);
    const kMin = () => size.w / M.width; // the map is always as wide as the screen
    const kMax = () => kMin() * 4;
    const topInset = () => (root ? $(".cs-top", root).offsetHeight + 12 : 120);
    const sheetHeight = (snap = CS.snap) => (snap === "peek" ? 196 : snap === "half" ? Math.round(size.h * 0.5) : size.h - topInset() + 4);
    /** The map you can see: under the chips, above the sheet (at half when the sheet is full). */
    function visibleRect() {
      const top = topInset();
      const bottom = size.h - sheetHeight(CS.snap === "full" ? "half" : CS.snap);
      return { x: 0, y: top, w: size.w, h: Math.max(80, bottom - top) };
    }
    const toScreen = (p, cam = CS.cam) => ({ x: p.x * cam.k + cam.tx, y: p.y * cam.k + cam.ty });
    function clampCam(cam) {
      const k = Math.max(kMin(), Math.min(kMax(), cam.k));
      // The map can be pulled a little past its edges (up to half the
      // visible area), so cafés near the edge of Lahore can still be centred
      const w = M.width * k, h = M.height * k;
      const r = visibleRect();
      const ox = r.w * 0.5, oy = r.h * 0.6;
      const tx = Math.min(ox, Math.max(size.w - w - ox, cam.tx));
      const lo = r.y + r.h - h - oy, hi = r.y + oy;
      const ty = lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, cam.ty));
      return { k, tx, ty };
    }
    /** A camera that fits these world points inside the visible map. */
    function fitCam(points, { minK = null } = {}) {
      const r = visibleRect();
      if (!points.length) points = S.cafes().map(worldOf);
      const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const pad = 44;
      let k = Math.min((r.w - pad * 2) / Math.max(1, x1 - x0), (r.h - pad * 2) / Math.max(1, y1 - y0));
      k = Math.max(minK ?? kMin(), Math.min(kMax(), k));
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      return clampCam({ k, tx: r.x + r.w / 2 - cx * k, ty: r.y + r.h / 2 - cy * k });
    }
    const centreCam = (p, k) => { const r = visibleRect(); return clampCam({ k, tx: r.x + r.w / 2 - p.x * k, ty: r.y + r.h / 2 - p.y * k }); };

    /* ---------- Camera ---------- */
    function applyCam() {
      worldEl.style.transform = `translate(${CS.cam.tx}px, ${CS.cam.ty}px) scale(${CS.cam.k})`;
      positionPins();
      queueInView();
    }
    function setCam(cam) { cancelAnimationFrame(flyRaf); CS.cam = clampCam(cam); applyCam(); }
    /** Glide to a camera (450ms); reduced motion jumps. */
    function flyTo(cam) {
      cancelAnimationFrame(flyRaf);
      const to = clampCam(cam), from = { ...CS.cam };
      if (reduce()) return setCam(to);
      const t0 = performance.now(), dur = 450;
      const ease = (t) => 1 - Math.pow(1 - t, 3);
      const step = (now) => {
        const t = Math.min(1, (now - t0) / dur), e = ease(t);
        CS.cam = { k: from.k + (to.k - from.k) * e, tx: from.tx + (to.tx - from.tx) * e, ty: from.ty + (to.ty - from.ty) * e };
        applyCam();
        if (t < 1) flyRaf = requestAnimationFrame(step);
      };
      flyRaf = requestAnimationFrame(step);
    }

    /* ---------- Pins ---------- */
    function pinHtml(c) {
      const r = refDrink(c);
      const sel = CS.selected === c.id;
      return html`<button type="button" class="cs-pin${sel ? " is-selected" : ""}" data-cs-pin="${c.id}" tabindex="-1"
          aria-label="${S.placeName(c.id)}, ${r ? `${r.name} member price ${fmt.rs(r.member)}` : "no price"}, ${STATUS_WORD[c.status]}">
          <span class="cs-dot" data-status="${c.status}" aria-hidden="true"></span><span class="num">${r ? fmt.rs(r.member) : "–"}</span>
        </button>`;
    }
    function paintPins() {
      const list = filtered();
      pinsEl.innerHTML = html`${list.map(pinHtml)}${CS.nearMe ? html`<span class="cs-me" data-cs-me aria-hidden="true"></span>` : ""}`.s;
      positionPins();
    }
    function positionPins() {
      if (!CS.cam) return;
      $$("[data-cs-pin]", pinsEl).forEach((p) => {
        const s = toScreen(worldOf(S.cafe(p.dataset.csPin)));
        p.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -50%) scale(var(--pin-s, 1))`;
      });
      const me = $("[data-cs-me]", pinsEl);
      if (me) { const s = toScreen(M.project(ME.x, ME.y)); me.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -50%)`; }
    }

    /* ---------- In view (debounced) ---------- */
    // BACKEND: GET /cafes?bbox=… for the visible map region (here: the seeded cafés' positions)
    function computeInView() {
      const r = visibleRect();
      inView = filtered().filter((c) => { const s = toScreen(worldOf(c)); return s.x >= r.x - 4 && s.x <= r.x + r.w + 4 && s.y >= r.y - 4 && s.y <= r.y + r.h + 4; }).map((c) => c.id);
      paintList();
    }
    function queueInView() {
      if (CS.snap === "full") return; // the map region is the one from before the list went full
      clearTimeout(inViewTimer);
      inViewTimer = setTimeout(computeInView, 300);
    }

    /* ---------- List ---------- */
    function sorted(list) {
      const by = {
        nearest: (a, b) => a.distanceKm - b.distanceKm,
        quietest: (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.distanceKm - b.distanceKm,
        price: (a, b) => (refDrink(a)?.member ?? 1e9) - (refDrink(b)?.member ?? 1e9) || a.distanceKm - b.distanceKm,
      }[CS.sort];
      return list.slice().sort(by);
    }
    function cardHtml(c) {
      const r = refDrink(c);
      const sel = CS.selected === c.id;
      const saved = CS.saved.has(c.id);
      const name = S.placeName(c.id);
      return html`<li class="cs-card${sel ? " is-selected" : ""}" data-cs-card="${c.id}">
        <button type="button" class="cs-card__main" data-cs-select="${c.id}" aria-label="${name}. ${sel ? "Selected. Tap again to open." : "Show on the map."}">
          <span class="cs-card__name">${CS.q ? hl(name, CS.q) : name}</span>
          <span class="cs-card__meta num">${S.area(c.area).name} · ${c.distanceKm} km</span>
          <span class="cs-card__status"><span class="cs-dot" data-status="${c.status}" aria-hidden="true"></span>${STATUS_WORD[c.status]} <span class="t-faint" data-rel-time="${c.statusUpdatedAt}" data-rel-prefix="updated">${fmt.updated(c.statusUpdatedAt)}</span></span>
          <span class="cs-card__hours" data-cs-hours="${c.id}">${hoursLine(c)}</span>
          ${r ? html`<span class="cs-card__price num"><span class="cs-member">${r.name} ${fmt.rs(r.member)}</span> · ${fmt.rs(r.list)} at the counter</span>` : ""}
          ${c.tags.length ? html`<span class="cs-card__tags">${c.tags.slice(0, 2).map((t) => html`<span class="badge">${t}</span>`)}</span>` : ""}
        </button>
        <div class="cs-card__acts">
          <button type="button" class="icon-btn cs-save" data-cs-save="${c.id}" aria-pressed="${saved}" aria-label="${saved ? "Saved" : "Save"} ${name}">${raw(BOOKMARK)}</button>
          <a class="icon-btn" href="#/app/cafes/${c.chainId || c.id}" aria-label="Open ${name}">${icon("chevronRight", { size: 20 })}</a>
        </div>
      </li>`;
    }
    function paintList() {
      const listEl = $("[data-cs-list]", root);
      if (!listEl) return;
      const all = filtered();
      const shown = sorted(S.cafes().filter((c) => inView.includes(c.id) && all.includes(c)));
      // The selected café leads the list (the peek shows its card)
      if (CS.selected) { const i = shown.findIndex((c) => c.id === CS.selected); if (i > 0) shown.unshift(...shown.splice(i, 1)); }
      $("[data-cs-count]", root).textContent = `${plural(shown.length, "café")} in view`;
      if (!all.length) {
        listEl.innerHTML = html`<li class="cs-empty"><p class="t-body">Nothing matches yet. Try an area or a drink.</p>
          <button type="button" class="btn btn--secondary btn--compact" data-cs-clear-all>Clear search</button></li>`.s;
      } else if (!shown.length) {
        listEl.innerHTML = html`<li class="cs-empty"><p class="t-body">No cafés in this part of the map.</p>
          <button type="button" class="btn btn--secondary btn--compact" data-cs-fit>Show all ${plural(all.length, "café")}</button></li>`.s;
      } else listEl.innerHTML = html`${shown.map(cardHtml)}`.s;
    }

    /* ---------- Search bar and chips ---------- */
    function topHtml() {
      const n = filterCount();
      const on = (q) => (q.id === "open" ? CS.openNow : q.id === "quiet" ? CS.quiet : q.id === "near" ? CS.nearMe : q.id === "classic" ? CS.price === "classic" : CS.tags.includes(q.id));
      return html`
        <div class="cs-bar">
          <button type="button" class="cs-bar__field" data-cs-open-search aria-haspopup="dialog" aria-controls="cs-search">
            ${icon("search", { size: 20 })}<span class="${CS.barLabel ? "" : "cs-bar__ph"}">${CS.barLabel || "Café, area or drink"}</span>
          </button>
          ${CS.barLabel ? html`<button type="button" class="icon-btn cs-bar__clear" data-cs-clear-search aria-label="Clear search">${icon("close", { size: 18 })}</button>` : ""}
        </div>
        <div class="cs-chips" role="toolbar" aria-label="Quick filters">
          ${QUICK.map((q) => html`<button type="button" class="chip" data-cs-chip="${q.id}" aria-pressed="${on(q)}">${q.label}</button>`)}
          <button type="button" class="chip cs-chips__filters${n ? " is-on" : ""}" data-cs-filters aria-haspopup="dialog" aria-controls="cs-filters" aria-label="${n ? `Filters, ${n} on` : "Filters"}">${icon("sliders", { size: 14 })}${n ? `Filters · ${n}` : "Filters"}</button>
        </div>`;
    }
    function paintTop() { $(".cs-top", root).innerHTML = topHtml().s; }
    /** After any change to search or filters: pins, chips and (soon) the list. */
    function refresh({ fit = false } = {}) {
      paintTop();
      paintPins();
      if (fit) flyTo(fitCam(filtered().map(worldOf)));
      computeInView();
    }

    /* ---------- Sheet (peek / half / full) ---------- */
    function setSnap(snap, { focus = false } = {}) {
      CS.snap = snap;
      sheetEl.dataset.snap = snap;
      sheetEl.style.setProperty("--sheet-h", `${sheetHeight(snap)}px`);
      sheetEl.style.removeProperty("--drag");
      const h = $("[data-cs-handle]", root);
      h.setAttribute("aria-label", `List: ${snap === "peek" ? "lowered" : snap === "half" ? "half height" : "full height"}. Change size`);
      h.setAttribute("aria-expanded", String(snap === "full"));
      $("[data-cs-map-pill]", root).hidden = snap !== "full";
      // The map behind a full list is out of reach
      mapEl.toggleAttribute("inert", snap === "full");
      if (snap !== "full") { clearTimeout(inViewTimer); inViewTimer = setTimeout(computeInView, reduce() ? 0 : 320); }
      if (focus) h.focus({ preventScroll: true });
    }
    const nextSnap = (s) => (s === "peek" ? "half" : s === "half" ? "full" : "half");
    function bindSheetDrag() {
      const grip = $("[data-cs-grip]", root);
      let start = null;
      grip.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        start = { y: e.clientY, h: sheetHeight(), t: performance.now(), moved: false };
        grip.setPointerCapture(e.pointerId);
        sheetEl.classList.add("is-dragging");
      });
      grip.addEventListener("pointermove", (e) => {
        if (!start) return;
        const dy = (e.clientY - start.y) / ratio;
        if (Math.abs(dy) > 6) start.moved = true;
        const h = Math.max(120, Math.min(sheetHeight("full"), start.h - dy));
        sheetEl.style.setProperty("--sheet-h", `${h}px`);
      });
      const end = (e) => {
        if (!start) return;
        sheetEl.classList.remove("is-dragging");
        const s = start; start = null;
        if (!s.moved) { setSnap(nextSnap(CS.snap)); return; } // a tap moves up a step (full goes back to half)
        const dy = (e.clientY - s.y) / ratio, v = dy / Math.max(1, performance.now() - s.t); // px per ms, + is down
        const h = s.h - dy;
        let target = SNAPS.reduce((best, x) => (Math.abs(sheetHeight(x) - h) < Math.abs(sheetHeight(best) - h) ? x : best), "half");
        if (Math.abs(v) > 0.6) target = SNAPS[Math.max(0, Math.min(2, SNAPS.indexOf(CS.snap) + (v > 0 ? -1 : 1)))];
        setSnap(target);
      };
      grip.addEventListener("pointerup", end);
      grip.addEventListener("pointercancel", end);
    }

    /* ---------- Map gestures: drag to pan, pinch or wheel to zoom ---------- */
    let moved = false;
    function bindMap() {
      const pts = new Map();
      let last = null;
      const down = new Map(); // where each pointer started (capture only once it moves, so pin taps still click)
      mapEl.addEventListener("pointerdown", (e) => {
        down.set(e.pointerId, { x: e.clientX, y: e.clientY });
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        moved = false;
        last = null;
        cancelAnimationFrame(flyRaf);
      });
      mapEl.addEventListener("pointermove", (e) => {
        if (!pts.has(e.pointerId)) return;
        const d0 = down.get(e.pointerId);
        if (d0 && !mapEl.hasPointerCapture(e.pointerId) && Math.hypot(e.clientX - d0.x, e.clientY - d0.y) > 4) mapEl.setPointerCapture(e.pointerId);
        const prev = pts.get(e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const box = mapEl.getBoundingClientRect();
        if (pts.size === 1) {
          const dx = (e.clientX - prev.x) / ratio, dy = (e.clientY - prev.y) / ratio;
          const d0b = down.get(e.pointerId);
          if (d0b && Math.hypot(e.clientX - d0b.x, e.clientY - d0b.y) > 4) moved = true;
          if (moved) setCam({ ...CS.cam, tx: CS.cam.tx + dx, ty: CS.cam.ty + dy });
        } else if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          const mid = { x: ((a.x + b.x) / 2 - box.left) / ratio, y: ((a.y + b.y) / 2 - box.top) / ratio };
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (last) zoomAt(mid, dist / last.dist, { dx: mid.x - last.mid.x, dy: mid.y - last.mid.y });
          last = { mid, dist };
          moved = true;
        }
      });
      const up = (e) => { pts.delete(e.pointerId); down.delete(e.pointerId); last = null; };
      mapEl.addEventListener("pointerup", up);
      mapEl.addEventListener("pointercancel", up);
      mapEl.addEventListener("wheel", (e) => {
        e.preventDefault();
        const box = mapEl.getBoundingClientRect();
        zoomAt({ x: (e.clientX - box.left) / ratio, y: (e.clientY - box.top) / ratio }, Math.exp(-e.deltaY * 0.0018));
      }, { passive: false });
      mapEl.addEventListener("dblclick", (e) => {
        const box = mapEl.getBoundingClientRect();
        const to = zoomCam({ x: (e.clientX - box.left) / ratio, y: (e.clientY - box.top) / ratio }, 1.8);
        flyTo(to);
      });
      // Keyboard: arrows pan, + and − zoom (the list is the main way through; this is extra)
      mapEl.addEventListener("keydown", (e) => {
        const step = 48;
        const r = visibleRect(), mid = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
        const k = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
        if (k) { e.preventDefault(); setCam({ ...CS.cam, tx: CS.cam.tx + k[0], ty: CS.cam.ty + k[1] }); return; }
        if (e.key === "+" || e.key === "=") { e.preventDefault(); flyTo(zoomCam(mid, 1.5)); }
        if (e.key === "-" || e.key === "_") { e.preventDefault(); flyTo(zoomCam(mid, 1 / 1.5)); }
      });
    }
    function zoomCam(at, f) {
      const k = Math.max(kMin(), Math.min(kMax(), CS.cam.k * f)), r = k / CS.cam.k;
      return { k, tx: at.x - (at.x - CS.cam.tx) * r, ty: at.y - (at.y - CS.cam.ty) * r };
    }
    function zoomAt(at, f, pan = { dx: 0, dy: 0 }) {
      const c = zoomCam(at, f);
      setCam({ ...c, tx: c.tx + pan.dx, ty: c.ty + pan.dy });
    }

    /* ---------- Selecting ---------- */
    function select(id, { from }) {
      CS.selected = id;
      const c = S.cafe(id);
      $$("[data-cs-pin]", pinsEl).forEach((p) => p.classList.toggle("is-selected", p.dataset.csPin === id));
      if (from === "pin") {
        setSnap("peek");
        computeInView();
        $("[data-cs-list]", root).scrollTop = 0;
      } else {
        if (CS.snap === "full") setSnap("half");
        flyTo(centreCam(worldOf(c), Math.max(CS.cam.k, kMin() * 2)));
        paintList();
        $(`[data-cs-card="${id}"]`, root)?.scrollIntoView({ block: "nearest", behavior: reduce() ? "auto" : "smooth" });
        $(`[data-cs-select="${id}"]`, root)?.focus({ preventScroll: true });
      }
    }

    /* ---------- Search screen ---------- */
    function pushRecent(item) {
      CS.recent = [item, ...CS.recent.filter((r) => !(r.kind === item.kind && r.value === item.value))].slice(0, 3);
    }
    function searchBodyHtml() {
      const q = searchText.trim();
      const row = (attrs, label, meta = "") => html`<li><button type="button" class="cs-res" ${raw(attrs)}><span class="cs-res__label">${label}</span>${meta ? html`<span class="cs-res__meta t-small t-muted">${meta}</span>` : ""}</button></li>`;
      if (!q) {
        const areas = store.getState().areas;
        return html`
          ${CS.recent.length ? html`<section class="cs-group" aria-labelledby="csg-recent"><h3 class="eyebrow" id="csg-recent">Recent</h3>
            <ul role="list">${CS.recent.map((r) => row(`data-cs-pick="${r.kind}" data-value="${esc(r.value)}"`, r.label, { cafe: "Café", area: "Area", drink: "Drink", mood: "", text: "Search" }[r.kind]))}</ul></section>` : ""}
          <section class="cs-group" aria-labelledby="csg-try"><h3 class="eyebrow" id="csg-try">Try</h3>
            <ul role="list">
              ${TRY.areas.map((id) => row(`data-cs-pick="area" data-value="${id}"`, areas.find((a) => a.id === id)?.name || id, "Area"))}
              ${TRY.drinks.map((d) => row(`data-cs-pick="drink" data-value="${esc(d)}"`, d, "Drink"))}
              ${TRY.moods.map((m) => row(`data-cs-pick="mood" data-value="${m.id}"`, m.label, "Mood"))}
            </ul></section>`;
      }
      // BACKEND: GET /search?q=… -> { cafes, areas, drinks } (here: the seed, in memory)
      const n = norm(q);
      const cafes = S.cafes().filter((c) => norm(`${S.placeName(c.id)} ${c.branch || ""}`).includes(n)).slice(0, 6);
      const areas = store.getState().areas.filter((a) => norm(a.name).includes(n));
      const drinks = allDrinks().filter((d) => norm(d).includes(n)).slice(0, 6);
      if (!cafes.length && !areas.length && !drinks.length) {
        return html`<div class="cs-noresults" role="status"><p class="t-body">Nothing matches yet. Try an area or a drink.</p>
          <button type="button" class="btn btn--secondary btn--compact" data-cs-search-clear>Clear search</button></div>`;
      }
      const at = (d) => S.cafes().filter((c) => servesDrink(c, d)).length;
      return html`
        ${cafes.length ? html`<section class="cs-group" aria-labelledby="csg-c"><h3 class="eyebrow" id="csg-c">Cafés</h3><ul role="list">${cafes.map((c) => row(`data-cs-pick="cafe" data-value="${c.id}"`, hl(S.placeName(c.id), q), `${S.area(c.area).name} · ${c.distanceKm} km`))}</ul></section>` : ""}
        ${areas.length ? html`<section class="cs-group" aria-labelledby="csg-a"><h3 class="eyebrow" id="csg-a">Areas</h3><ul role="list">${areas.map((a) => row(`data-cs-pick="area" data-value="${a.id}"`, hl(a.name, q), plural(S.cafes().filter((c) => c.area === a.id).length, "café")))}</ul></section>` : ""}
        ${drinks.length ? html`<section class="cs-group" aria-labelledby="csg-d"><h3 class="eyebrow" id="csg-d">Drinks</h3><ul role="list">${drinks.map((d) => row(`data-cs-pick="drink" data-value="${esc(d)}"`, hl(d, q), `at ${plural(at(d), "café")}`))}</ul></section>` : ""}`;
    }
    function paintSearch() { $("[data-cs-search-body]", searchEl).innerHTML = searchBodyHtml().s; $("[data-cs-search-x]", searchEl).hidden = !searchText; }
    function openSearch() {
      searchText = CS.q || "";
      searchEl.hidden = false;
      searchEl.dataset.open = "true";
      const input = $("[data-cs-search-q]", searchEl);
      input.value = searchText;
      paintSearch();
      requestAnimationFrame(() => input.focus());
    }
    function closeSearch({ focusBar = true } = {}) {
      searchEl.dataset.open = "false";
      searchEl.hidden = true;
      if (focusBar) $("[data-cs-open-search]", root)?.focus({ preventScroll: true });
    }
    function pick(kind, value) {
      const areas = store.getState().areas;
      closeSearch({ focusBar: false });
      if (kind === "cafe") {
        const c = S.cafe(value);
        pushRecent({ kind, value, label: S.placeName(value) });
        Object.assign(CS, { q: "", drink: null, barLabel: "" });
        refresh();
        if (!matches(c)) { Object.assign(CS, { areas: [], openNow: false, quiet: false, tags: [], price: null }); refresh(); }
        flyTo(centreCam(worldOf(c), Math.max(CS.cam.k, kMin() * 2)));
        setTimeout(() => select(value, { from: "pin" }), reduce() ? 0 : 460);
      } else if (kind === "area") {
        const a = areas.find((x) => x.id === value);
        pushRecent({ kind, value, label: a.name });
        Object.assign(CS, { q: "", drink: null, barLabel: a.name, selected: null });
        refresh();
        const pts = S.cafes().filter((c) => c.area === value).map(worldOf);
        flyTo(pts.length ? fitCam(pts) : centreCam(M.project(a.x, a.y), kMin() * 1.5));
      } else if (kind === "drink") {
        pushRecent({ kind, value, label: value });
        Object.assign(CS, { q: "", drink: value, barLabel: value, selected: null });
        refresh({ fit: true });
      } else if (kind === "mood") {
        const m = TRY.moods.find((x) => x.id === value);
        pushRecent({ kind, value, label: m.label });
        if (value === "work") Object.assign(CS, { quiet: true, tags: [...new Set([...CS.tags, "Work-friendly"])] });
        if (value === "late") Object.assign(CS, { tags: [...new Set([...CS.tags, "Late night"])] });
        Object.assign(CS, { barLabel: m.label, selected: null });
        refresh({ fit: true });
      } else if (kind === "text") {
        pushRecent({ kind, value, label: value });
        Object.assign(CS, { q: value, drink: null, barLabel: value, selected: null });
        refresh({ fit: true });
      }
      $("[data-cs-open-search]", root)?.focus({ preventScroll: true });
    }
    function clearSearch() {
      Object.assign(CS, { q: "", drink: null, barLabel: "" });
      refresh();
    }

    /* ---------- Filter sheet ---------- */
    function filterSheetHtml() {
      const chip = (label, attrs, on) => html`<button type="button" class="chip" ${raw(attrs)} aria-pressed="${on}">${label}</button>`;
      const n = filtered({ ...CS, ...draft }).length;
      return html`
        <div class="sheet__scrim" data-sheet-close></div>
        <div class="sheet__panel">
          <div class="sheet__handle" aria-hidden="true"></div>
          <div class="sheet__body filters cs-filters">
            <div class="cs-filters__bar">
              <h2 class="t-h3" id="cs-filters-title">Filters</h2>
              <button type="button" class="btn btn--link" data-f-clear>Clear all</button>
            </div>
            <fieldset class="filters__group"><legend class="eyebrow">Area</legend>
              <div class="cluster" style="--cluster-gap:var(--space-2)">${store.getState().areas.map((a) => chip(a.name, `data-f-area="${a.id}"`, draft.areas.includes(a.id)))}</div>
            </fieldset>
            <div class="filters__row">
              <span id="cs-f-open-l">Open now</span>
              <button type="button" class="toggle" role="switch" aria-labelledby="cs-f-open-l" aria-checked="${draft.openNow}" data-f-open></button>
            </div>
            <fieldset class="filters__group"><legend class="eyebrow">Busy status</legend>
              <div class="cluster" style="--cluster-gap:var(--space-2)">${chip("Quiet", 'data-f-quiet="1"', draft.quiet)}${chip("Any", 'data-f-quiet="0"', !draft.quiet)}</div>
            </fieldset>
            <fieldset class="filters__group"><legend class="eyebrow">Tags</legend>
              <div class="cluster" style="--cluster-gap:var(--space-2)">${SHEET_TAGS.map((t) => chip(t, `data-f-tag="${t}"`, draft.tags.includes(t)))}</div>
            </fieldset>
            <fieldset class="filters__group"><legend class="eyebrow">Price</legend>
              <div class="cluster" style="--cluster-gap:var(--space-2)">
                ${chip(`Classic, up to ${fmt.rs(S.band("classic").maxPrice)}`, 'data-f-price="classic"', draft.price === "classic")}
                ${chip(`Signature, up to ${fmt.rs(S.band("signature").maxPrice)}`, 'data-f-price="signature"', draft.price === "signature")}
              </div>
            </fieldset>
            <button type="button" class="btn btn--primary btn--block" data-f-show ${n ? "" : raw("disabled")}>${n ? `Show ${plural(n, "café")}` : "No cafés match"}</button>
          </div>
        </div>`;
    }
    function openFilters(btn) {
      btn?.focus();
      draft = { areas: [...CS.areas], openNow: CS.openNow, quiet: CS.quiet, tags: [...CS.tags], price: CS.price };
      filterSheet.innerHTML = filterSheetHtml().s;
      ui.openSheet(filterSheet);
    }
    /** Update the open sheet in place (pressed states and the live count), so focus stays put. */
    function repaintFilters() {
      $$("[data-f-area]", filterSheet).forEach((b) => b.setAttribute("aria-pressed", String(draft.areas.includes(b.dataset.fArea))));
      $("[data-f-open]", filterSheet).setAttribute("aria-checked", String(draft.openNow));
      $$("[data-f-quiet]", filterSheet).forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.fQuiet === "1") === draft.quiet)));
      $$("[data-f-tag]", filterSheet).forEach((b) => b.setAttribute("aria-pressed", String(draft.tags.includes(b.dataset.fTag))));
      $$("[data-f-price]", filterSheet).forEach((b) => b.setAttribute("aria-pressed", String(draft.price === b.dataset.fPrice)));
      const n = filtered({ ...CS, ...draft }).length;
      const show = $("[data-f-show]", filterSheet);
      show.textContent = n ? `Show ${plural(n, "café")}` : "No cafés match";
      show.disabled = !n;
    }
    const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
    function onFilterClick(e) {
      const t = e.target;
      const a = t.closest("[data-f-area]");
      if (a) { draft.areas = toggleIn(draft.areas, a.dataset.fArea); return repaintFilters(); }
      if (t.closest("[data-f-open]")) { draft.openNow = !draft.openNow; return repaintFilters(); }
      const qz = t.closest("[data-f-quiet]");
      if (qz) { draft.quiet = qz.dataset.fQuiet === "1"; return repaintFilters(); }
      const tg = t.closest("[data-f-tag]");
      if (tg) { draft.tags = toggleIn(draft.tags, tg.dataset.fTag); return repaintFilters(); }
      const pr = t.closest("[data-f-price]");
      if (pr) { draft.price = draft.price === pr.dataset.fPrice ? null : pr.dataset.fPrice; return repaintFilters(); }
      if (t.closest("[data-f-clear]")) { draft = { areas: [], openNow: false, quiet: false, tags: [], price: null }; return repaintFilters(); }
      if (t.closest("[data-f-show]")) {
        Object.assign(CS, draft, { selected: null });
        ui.closeSheet(filterSheet);
        refresh({ fit: true });
      }
    }

    /* ---------- Clicks and keys ---------- */
    function onClick(e) {
      const t = e.target;
      const pin = t.closest("[data-cs-pin]");
      if (pin) { if (!moved) select(pin.dataset.csPin, { from: "pin" }); return; }
      if (t.closest("[data-cs-open-search]")) return openSearch();
      if (t.closest("[data-cs-clear-search]")) { clearSearch(); $("[data-cs-open-search]", root)?.focus(); return; }
      const chip = t.closest("[data-cs-chip]");
      if (chip) {
        const id = chip.dataset.csChip;
        if (id === "open") CS.openNow = !CS.openNow;
        else if (id === "quiet") CS.quiet = !CS.quiet;
        else if (id === "classic") CS.price = CS.price === "classic" ? null : "classic";
        else if (id === "near") {
          CS.nearMe = !CS.nearMe;
          paintTop(); paintPins();
          flyTo(CS.nearMe ? centreCam(M.project(ME.x, ME.y), kMin() * 2.6) : fitCam(filtered().map(worldOf)));
          $(`[data-cs-chip="near"]`, root)?.focus();
          return;
        } else CS.tags = toggleIn(CS.tags, id);
        CS.selected = null;
        refresh();
        $(`[data-cs-chip="${id}"]`, root)?.focus();
        return;
      }
      const fb = t.closest("[data-cs-filters]");
      if (fb) return openFilters(fb);
      if (t.closest("[data-cs-map-pill]")) { setSnap("half"); return $("[data-cs-handle]", root).focus(); }
      const sel = t.closest("[data-cs-select]");
      if (sel) {
        const id = sel.dataset.csSelect;
        if (CS.selected === id) { location.hash = `#/app/cafes/${S.cafe(id).chainId || id}`; return; } // a second tap opens it
        return select(id, { from: "card" });
      }
      const sv = t.closest("[data-cs-save]");
      if (sv) {
        const id = sv.dataset.csSave;
        if (CS.saved.has(id)) CS.saved.delete(id); else CS.saved.add(id);
        // BACKEND: PUT /members/:id/saved-cafes (in memory for now)
        const on = CS.saved.has(id);
        sv.setAttribute("aria-pressed", String(on));
        sv.setAttribute("aria-label", `${on ? "Saved" : "Save"} ${S.placeName(id)}`);
        ui.toast(on ? `Saved ${S.placeName(id)}.` : `Removed ${S.placeName(id)} from saved.`);
        return;
      }
      if (t.closest("[data-cs-fit]")) { flyTo(fitCam(filtered().map(worldOf))); return; }
      if (t.closest("[data-cs-clear-all]")) {
        Object.assign(CS, { q: "", drink: null, barLabel: "", areas: [], openNow: false, quiet: false, tags: [], price: null, selected: null });
        refresh({ fit: true });
      }
    }
    function onChange(e) {
      if (e.target.matches("[data-cs-sort]")) { CS.sort = e.target.value; paintList(); }
    }
    function onHandleKey(e) {
      const i = SNAPS.indexOf(CS.snap);
      if (e.key === "ArrowUp") { e.preventDefault(); setSnap(SNAPS[Math.min(2, i + 1)]); }
      if (e.key === "ArrowDown") { e.preventDefault(); setSnap(SNAPS[Math.max(0, i - 1)]); }
    }
    function onSearchClick(e) {
      const t = e.target;
      if (t.closest("[data-cs-search-back]")) return closeSearch();
      if (t.closest("[data-cs-search-x]") || t.closest("[data-cs-search-clear]")) {
        searchText = ""; const input = $("[data-cs-search-q]", searchEl); input.value = ""; paintSearch(); input.focus();
        if (t.closest("[data-cs-search-clear]")) clearSearch();
        return;
      }
      const p = t.closest("[data-cs-pick]");
      if (p) pick(p.dataset.csPick, p.dataset.value);
    }
    function onSearchInput(e) { if (e.target.matches("[data-cs-search-q]")) { searchText = e.target.value; paintSearch(); } }
    function onSearchKey(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeSearch(); return; }
      if (e.key === "Enter" && e.target.matches("[data-cs-search-q]")) {
        e.preventDefault();
        const q = searchText.trim();
        if (!q) return;
        const first = $("[data-cs-pick]", searchEl);
        if (first && norm(first.textContent).includes(norm(q))) return pick(first.dataset.csPick, first.dataset.value);
        pick("text", q);
      }
      // Keep focus inside the dialog
      if (e.key === "Tab") {
        const f = $$("button, input, [href]", searchEl).filter((x) => !x.hidden && x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    }

    // Layout px (the desktop phone frame is CSS-zoomed, so screen px differ): pointer
    // positions are divided by `ratio` (screen px per layout px) before use
    let ratio = 1;
    function measure() {
      size = { w: Math.max(240, root.offsetWidth), h: Math.max(320, root.offsetHeight) };
      const r = root.getBoundingClientRect();
      ratio = r.width ? r.width / root.offsetWidth : 1;
    }

    return {
      html: html`
        <div class="cs" data-cs>
          <h1 class="sr-only">Cafés</h1>
          <div class="cs-map map" data-cs-map tabindex="0" role="application" aria-roledescription="map" aria-label="Map of partner cafés. Arrow keys move it, plus and minus zoom. The list below has every café in view.">
            <div class="cs-world" data-cs-world>${M.svg()}</div>
            <div class="cs-pins" data-cs-pins></div>
          </div>
          <div class="cs-top">${topHtml()}</div>
          <section class="cs-sheet" data-cs-sheet data-snap="${CS.snap}" role="dialog" aria-modal="false" aria-labelledby="cs-count">
            <div class="cs-sheet__grip" data-cs-grip>
              <button type="button" class="cs-sheet__handle" data-cs-handle aria-controls="cs-list" aria-expanded="false" aria-label="Change list size"><span aria-hidden="true"></span></button>
              <div class="cs-sheet__head">
                <p class="cs-sheet__count" id="cs-count" data-cs-count aria-live="polite"></p>
                <label class="cs-sort"><span class="sr-only">Sort by</span>
                  <span class="select"><select class="input" data-cs-sort>
                    ${[["nearest", "Nearest"], ["quietest", "Quietest"], ["price", "Lowest member price"]].map(([v, l]) => html`<option value="${v}" ${CS.sort === v ? raw("selected") : ""}>${l}</option>`)}
                  </select></span></label>
              </div>
            </div>
            <ul role="list" class="cs-list" id="cs-list" data-cs-list></ul>
          </section>
          <button type="button" class="cs-mappill" data-cs-map-pill hidden>${icon("map", { size: 18 })}Map</button>
          <div class="cs-search" id="cs-search" data-cs-search role="dialog" aria-modal="true" aria-labelledby="cs-search-title" hidden>
            <h2 class="sr-only" id="cs-search-title">Search cafés</h2>
            <div class="cs-search__bar">
              <button type="button" class="icon-btn" data-cs-search-back aria-label="Back to the map">${icon("arrowLeft")}</button>
              <label class="sr-only" for="cs-q">Café, area or drink</label>
              <input class="input cs-search__input" id="cs-q" type="search" data-cs-search-q placeholder="Café, area or drink" autocomplete="off" enterkeyhint="search">
              <button type="button" class="icon-btn" data-cs-search-x aria-label="Clear" hidden>${icon("close", { size: 18 })}</button>
            </div>
            <div class="cs-search__body" data-cs-search-body aria-live="polite"></div>
          </div>
        </div>`.s,
      mount() {
        root = $("[data-cs]", view);
        mapEl = $("[data-cs-map]", root);
        worldEl = $("[data-cs-world]", root);
        pinsEl = $("[data-cs-pins]", root);
        sheetEl = $("[data-cs-sheet]", root);
        searchEl = $("[data-cs-search]", root);
        filterSheet = document.createElement("div");
        filterSheet.className = "sheet";
        filterSheet.id = "cs-filters";
        filterSheet.setAttribute("role", "dialog");
        filterSheet.setAttribute("aria-modal", "true");
        filterSheet.setAttribute("aria-labelledby", "cs-filters-title");
        filterSheet.setAttribute("aria-hidden", "true");
        $(".phone__screen", el).appendChild(filterSheet);
        filterSheet.addEventListener("click", onFilterClick);
        measure();
        paintPins();
        setSnap(CS.snap);
        // First visit: the cafés near the member (the list's default is Nearest)
        const near = filtered().filter((c) => c.distanceKm <= 3.5).map(worldOf);
        CS.cam = CS.cam ? clampCam(CS.cam) : fitCam(near.length >= 2 ? near : filtered().map(worldOf));
        applyCam();
        computeInView();
        bindSheetDrag();
        bindMap();
        const ro = new ResizeObserver(() => { const old = size; measure(); if (old.w !== size.w || old.h !== size.h) { setSnap(CS.snap); applyCam(); } });
        ro.observe(root);
        root.addEventListener("click", onClick);
        root.addEventListener("change", onChange);
        $("[data-cs-handle]", root).addEventListener("keydown", onHandleKey);
        searchEl.addEventListener("click", onSearchClick);
        searchEl.addEventListener("input", onSearchInput);
        searchEl.addEventListener("keydown", onSearchKey);
        return () => {
          ro.disconnect();
          clearTimeout(inViewTimer);
          cancelAnimationFrame(flyRaf);
          ui.closeSheet(filterSheet);
          filterSheet.remove();
        };
      },
      on: {
        // BACKEND: busy status arrives over Realtime (cafe:status); pins and cards repaint
        "cafe:status": () => { paintPins(); paintList(); },
        tick: () => { $$("[data-cs-hours]", root).forEach((n) => { n.textContent = hoursLine(S.cafe(n.dataset.csHours)); }); },
        cafesView: () => setSnap(CS.snap),
      },
    };
  };
  const BOOKMARK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6.5 4.5h11v15l-5.5-4-5.5 4z"/></svg>';

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
              <span class="t-small t-muted num">${loyal.visits} of ${loyal.goal} to a complimentary cup</span>
            </div>
            ${meter(loyal.visits, loyal.goal, `${loyal.visits} of ${loyal.goal} visits to a complimentary cup`)}
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

    /** What the member can use here, from the ledger. My cafés and the old
        tiers aren't sold any more, so there's no "Add to my plan" here. */
    function actionHtml() {
      const m = ctx.member();
      const here = S.cafeBalance(m.id, c.id);
      if (here.type === "pass") {
        const t = S.passToday();
        const pct = Math.round(S.planConfig().pass.discount * 100);
        return html`<p class="t-small t-muted num" data-here-line>${t.used
          ? html`<strong>Today’s member coffee is used.</strong> Back tomorrow; this one is full price.`
          : html`<strong>Today’s member coffee: available.</strong> ${pct}% off any drink here.`}</p>`;
      }
      if (here.type === "mycafes") {
        return html`<p class="t-small t-muted num" data-here-line>${here.reserved
          ? html`<strong>${fmt.cups(here.left)} reserved here</strong>, of ${here.reserved} this month.`
          : html`<strong>Not in your plan.</strong> Your cups are for your cafés.`}</p>`;
      }
      if (!here.type) return html`<p class="t-small t-muted" data-here-line><strong>No plan yet.</strong></p>`;
      const line = here.left <= 0
        ? html`<strong>No cups left.</strong> ${S.planDateLine(m)}.`
        : here.today >= here.dailyLimit
          ? html`<strong>Today’s cup from your pack is used.</strong> The next one is tomorrow.`
          : html`<strong>${fmt.cups(here.left)} left on your ${S.planName(m.plan)}</strong>, all usable here. One a day.`;
      return html`<p class="t-small t-muted num" data-here-line>${line}</p>`;
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
            </dl>
            <div class="cluster" style="--cluster-gap:var(--space-2)">${c.tags.map((t) => html`<span class="badge">${t}</span>`)}</div>

            <section class="app-section" aria-labelledby="drinks-h">
              <h2 class="eyebrow app-section__title" id="drinks-h">Drinks</h2>
              <p class="t-small t-muted">Member price: ${Math.round(S.planConfig().pass.discount * 100)}% off with the ${S.planConfig().pass.name}, one coffee a day.</p>
              <ul role="list">
                ${(matchaMode() ? [...c.drinks.filter(isMatcha), ...c.drinks.filter((d) => !isMatcha(d))] : c.drinks).map((d) => html`<li>
                  <button type="button" class="row drink-row" data-start-order="${c.id}" data-drink="${d.id}" aria-label="${d.name}, ${fmt.rs(d.price)}, member price ${fmt.rs(S.memberPrice(d.price))}, ${bandLabel(c, d)}. Order for pickup">
                    <span class="row__main"><span class="row__title">${d.name}</span><span class="row__meta num">${fmt.rs(d.price)} · <span class="drink-row__member">${fmt.rs(S.memberPrice(d.price))} member price</span>${topUpFor(c, d)}</span></span>
                    <span class="badge">${bandLabel(c, d)}</span>
                  </button>
                </li>`)}
              </ul>
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
