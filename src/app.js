/* =====================================================================
   Lahore Coffee Club — app.js
   Member app (#/app). Replaces the Pass 1 shell in router.js.

   Routes:  #/app (Home) · #/app/cafes · #/app/cafes/:id · #/app/pass
            #/app/map · #/app/rewards · #/app/plan · #/app/plan/pay
   This file owns the shell, tabs, Home, Pass and Map. Cafés live in
   app-cafes.js, the plan picker and payment in app-plan.js; they add
   screen factories to LCC.appScreens and get a small ctx object.
   Rewards is still a placeholder (Pass 5).

   Everything reads the shared store, so a redemption or status change
   in the café view (same window or another one) shows up here live.
   ===================================================================== */
(function () {
  "use strict";
  const LCC = window.LCC;
  const { store, fmt, ui } = LCC;
  const { html, raw, $, $$, icon } = ui;
  const S = store.select;
  // Screens added by app-cafes.js / app-plan.js: name -> (ctx, arg) => screen
  const REG = (LCC.appScreens = LCC.appScreens || {});

  const TABS = [
    { id: "home",    label: "Home",    icon: "home" },
    { id: "cafes",   label: "Cafés",   icon: "store" },
    { id: "pass",    label: "Pass",    icon: "qr" },
    { id: "map",     label: "Map",     icon: "map" },
    { id: "rewards", label: "Rewards", icon: "award" },
  ];
  const tabFromPath = (path) => (TABS.some((t) => t.id === path[0]) ? path[0] : "home");
  const hrefFor = (id) => (id === "home" ? "#/app" : `#/app/${id}`);

  /* -------------------------------------------------------------------
     Map geometry. data.js stores café/area positions on a 1000 x 800
     landscape grid; the phone map is a portrait 360 x 560 schematic.
     ------------------------------------------------------------------- */
  const MAP_W = 360, MAP_H = 560;
  const project = (x, y) => ({ x: 24 + (x - 260) * 0.58, y: 60 + (y - 250) * 1.1 });
  // Where each pin's name sits, so names stay inside the frame and don't collide (default: right)
  const LABEL_SIDE = { slowpour: "left", maple: "left", grind: "left", quiethours: "left", ember: "below", thirdfloor: "below" };
  const AREA_LABELS = {
    gulberg: [236, 196], liberty: [92, 286], fortress: [292, 70],
    dha: [300, 514], "model-town": [196, 512], "johar-town": [58, 530],
  };
  const USUAL_HOUR = 18;

  function mapSvg() {
    const areas = store.getState().areas;
    return html`<svg viewBox="0 0 ${MAP_W} ${MAP_H}" aria-hidden="true" focusable="false">
      ${areas.map((a) => { const p = project(a.x, a.y); return html`<ellipse class="m-area" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" rx="64" ry="54"/>`; })}
      <path class="m-river" d="M-20 78 C 50 52, 110 22, 190 -16"/>
      <path class="m-road m-road--major" d="M40 140 L 360 296"/>
      <path class="m-road m-road--major" d="M0 392 C 110 548, 250 572, 360 476"/>
      <path class="m-road" d="M150 0 L 112 560"/>
      <path class="m-road" d="M0 336 L 360 226"/>
      <path class="m-road" d="M262 0 L 236 560"/>
      <path class="m-canal" d="M336 0 C 284 112, 222 150, 206 262 S 122 424, 66 560"/>
      <text class="m-label m-label--water" x="34" y="44">Ravi</text>
      <text class="m-label m-label--water" x="150" y="372" transform="rotate(-58 150 372)">Canal</text>
      ${areas.map((a) => { const [x, y] = AREA_LABELS[a.id] || [0, 0]; return html`<text class="m-label" x="${x}" y="${y}" text-anchor="middle">${a.name}</text>`; })}
    </svg>`;
  }

  /* -------------------------------------------------------------------
     Surface
     ------------------------------------------------------------------- */
  let api = null; // set while mounted, so router.update can reach it

  LCC.router.register("app", {
    title: "Member app",
    update(path) { if (api) api.show(path); },
    mount(el, path) {
      const member = () => S.member();
      let active = { key: null, tab: null, cleanup: null, on: {} };
      // Screens visited in this app session, so Back knows whether history.back() stays in the app
      const trail = [];
      let replacing = false;
      let mapMode = "now";

      // Fit the 844px frame on short laptop screens
      const fit = () => {
        const scale = Math.min(1, Math.max(0.6, (window.innerHeight - 88) / 864));
        document.documentElement.style.setProperty("--phone-scale", scale.toFixed(3));
      };
      fit();
      window.addEventListener("resize", fit);

      el.innerHTML = html`
        <div class="surface stage">
          <div class="phone">
            <div class="phone__screen">
              <div class="phone__status" aria-hidden="true">
                <span>9:41</span>
                <span class="phone__island"></span>
                <span class="phone__status-icons">
                  <svg viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
                  <svg viewBox="0 0 26 12" style="width:26px"><rect x="0.75" y="0.75" width="21.5" height="10.5" rx="3" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".5"/><rect x="2.5" y="2.5" width="15" height="7" rx="1.6" fill="currentColor"/><rect x="23.5" y="4" width="1.6" height="4" rx=".8" fill="currentColor" opacity=".5"/></svg>
                </span>
              </div>
              <div class="app-view" id="app-view" role="tabpanel" tabindex="-1"></div>
              <div class="tabbar" role="tablist" aria-label="Sections">
                ${TABS.map((t) => html`
                  <button type="button" role="tab" class="tab${t.id === "pass" ? " tab--pass" : ""}" id="tab-${t.id}" data-tab="${t.id}"
                    aria-controls="app-view" aria-selected="false" tabindex="-1">
                    ${t.id === "pass" ? html`<span class="tab__pass">${icon(t.icon)}</span>` : icon(t.icon)}
                    <span>${t.label}</span>
                  </button>`)}
              </div>
              <div class="sheet" id="cafe-sheet" role="dialog" aria-modal="true" aria-labelledby="cafe-sheet-title" aria-hidden="true">
                <div class="sheet__scrim" data-sheet-close></div>
                <div class="sheet__panel">
                  <div class="sheet__handle" aria-hidden="true"></div>
                  <div class="sheet__body" data-sheet-body></div>
                </div>
              </div>
              <div class="toast-region" style="position:absolute;bottom:104px" role="status" aria-live="polite"></div>
            </div>
          </div>
        </div>`;

      const view = $("#app-view", el);

      /* ---------------- Routing inside the app ---------------- */
      function resolve(path) {
        const [a = "home", b] = path;
        if (a === "cafes" && b && S.cafe(b) && REG.cafeDetail) return { key: `cafes/${b}`, tab: "cafes", make: () => REG.cafeDetail(ctx, b) };
        if (a === "cafes" && REG.cafes) return { key: "cafes", tab: "cafes", make: () => REG.cafes(ctx) };
        if (a === "plan" && b === "pay" && REG.pay) return { key: "plan/pay", tab: "home", flow: true, make: () => REG.pay(ctx) };
        if (a === "plan" && REG.plan) return { key: "plan", tab: "home", flow: true, make: () => REG.plan(ctx) };
        const tab = tabFromPath(path);
        return { key: tab, tab, make: SCREENS[tab] };
      }

      function show(path, { force = false } = {}) {
        const r = resolve(Array.isArray(path) ? path : [path]);
        if (active.key === r.key && !force) return;
        const screen = r.make();
        if (screen.redirect) { history.replaceState(null, "", LCC.sync ? LCC.sync.withRoom(screen.redirect) : screen.redirect); LCC.router.render(); return; }
        if (active.key !== r.key) {
          if (replacing && trail.length) trail[trail.length - 1] = r.key;
          else if (trail[trail.length - 2] === r.key) trail.pop();
          else trail.push(r.key);
        }
        replacing = false;
        if (typeof active.cleanup === "function") active.cleanup();
        ui.closeSheet($("#cafe-sheet", el));
        $$("[data-tab]", el).forEach((btn) => {
          const on = btn.dataset.tab === r.tab;
          btn.setAttribute("aria-selected", on);
          btn.tabIndex = on ? 0 : -1;
        });
        // Plan and payment are a focused flow: no tab bar
        $(".phone__screen", el).classList.toggle("is-flow", !!r.flow);
        view.setAttribute("aria-labelledby", `tab-${r.tab}`);
        view.scrollTop = 0;
        view.innerHTML = `<div class="enter">${screen.html}</div>`;
        active = { key: r.key, tab: r.tab, cleanup: screen.mount ? screen.mount() : null, on: screen.on || {} };
      }

      /** Navigate inside the app. replace: swap the history entry (after payment, redirects). */
      function go(hash, { replace = false } = {}) {
        const to = LCC.sync ? LCC.sync.withRoom(hash) : hash; // keep the sync room in the URL
        if (replace) { replacing = true; history.replaceState(null, "", to); LCC.router.render(); }
        else location.hash = to;
      }
      /** Back button: step back if we got here inside the app, otherwise go to the fallback. */
      function back(fallback) {
        if (trail.length > 1) history.back();
        else go(fallback, { replace: true });
      }
      const ctx = { el, view, go, back, member, openCafe: (id) => openCafe(id), toast: ui.toast, rerender: () => show(LCC.router.parse().path, { force: true }) };

      /* ---------------- Café sheet ---------------- */
      function openCafe(cafeId) {
        const c = S.cafe(cafeId);
        const open = S.openState(c);
        const usual = S.usualStatus(c, USUAL_HOUR).status;
        $("[data-sheet-body]", el).innerHTML = html`
          <div class="cafe-sheet">
            <div class="stack" style="--stack-gap:var(--space-1)">
              <h2 class="t-h2" id="cafe-sheet-title">${c.name}</h2>
              <p class="t-small t-muted">${S.area(c.area).name} · ${c.distanceKm} km · ${fmt.rs(c.price)} a cup at the counter</p>
            </div>
            <div>${ui.statusPill(c.id)}</div>
            <div class="cafe-sheet__facts">
              <span>${icon("clock")} ${c.hours.label} · ${open.open ? "open now" : "closed now"}</span>
              <span>${ui.cupIcon(usual, { size: 18, cls: "" })} Usually ${fmt.statusLabel(usual).toLowerCase()} at 6 pm</span>
            </div>
            <p class="t-small t-muted">${c.blurb}</p>
            <div>
              <h3 class="eyebrow">Signature drinks</h3>
              <ul role="list">
                ${c.drinks.map((d) => html`<li class="row"><div class="row__main"><div class="row__title">${d.name}</div></div><span class="badge">${fmt.cups(d.credits)}</span></li>`)}
              </ul>
            </div>
            <div class="cafe-sheet__actions">
              <button type="button" class="btn btn--primary btn--block" data-directions="${c.id}">Directions</button>
              <a class="btn btn--secondary btn--block" href="#/app/cafes/${c.id}">More about ${c.name}</a>
            </div>
          </div>`;
        ui.openSheet($("#cafe-sheet", el));
      }

      /* ---------------- Screens ---------------- */
      const SCREENS = {
        home: homeScreen,
        pass: passScreen,
        map: mapScreen,
        rewards: () => soon("Rewards", "Streaks, badges, referrals, and free cups from cafés.", 5),
      };

      function soon(title, line, pass) {
        return { html: html`<div class="app-screen"><div class="soon"><p class="eyebrow">${title}</p><h1 class="t-h2">${line}</h1><p class="t-body t-muted">Coming in Pass ${pass}.</p></div></div>`.s };
      }

      /* Home ------------------------------------------------------------ */
      const RING_C = 2 * Math.PI * 96;
      function homeScreen() {
        const m = member();
        const near = S.cafes().slice().sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 4);
        return {
          html: html`
            <div class="app-screen">
              <div class="app-head">
                <div>
                  <p class="t-small t-muted">${fmt.date(Date.now())}</p>
                  <h1 class="t-h2">Salaam, ${m.firstName}.</h1>
                </div>
                <span class="avatar" role="img" aria-label="${m.firstName} ${m.lastName || ""}">${m.initials || m.firstName[0]}</span>
              </div>

              <div class="ring-wrap">
                <div class="ring" data-ring role="img" aria-label="${m.cupsLeft} of ${m.cupsTotal} cups left this month">
                  <svg viewBox="0 0 208 208" aria-hidden="true">
                    <circle class="track" cx="104" cy="104" r="96"/>
                    <circle class="bar" cx="104" cy="104" r="96" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${RING_C.toFixed(2)}"/>
                  </svg>
                  <div class="ring__center" aria-hidden="true">
                    <span class="ring__num" data-ring-num data-value="0">0</span>
                    <span class="t-small t-muted">of <span class="num" data-ring-total>${m.cupsTotal}</span> cups left</span>
                  </div>
                </div>
                <p class="t-small t-muted" data-plan-line>${planLine()}</p>
                <button type="button" class="btn btn--link" data-start-plan>Change plan</button>
              </div>

              <section class="app-section" aria-labelledby="near-h">
                <h2 class="eyebrow app-section__title" id="near-h">Near you</h2>
                <ul role="list">
                  ${near.map((c) => html`<li>
                    <button type="button" class="row near-row" data-open-cafe="${c.id}" aria-label="${c.name}, ${S.area(c.area).name}. Open details">
                      <span class="row__main">
                        <span class="row__title">${c.name}</span>
                        <span class="row__meta num">${S.area(c.area).name} · ${fmt.rs(c.price)} a cup · ${c.distanceKm} km</span>
                        ${ui.statusPill(c.id)}
                      </span>
                      <span class="row__trail" aria-hidden="true">${icon("chevronRight", { size: 20 })}</span>
                    </button>
                  </li>`)}
                </ul>
              </section>

              <section class="app-section" aria-labelledby="recent-h">
                <h2 class="eyebrow app-section__title" id="recent-h">Recent cups</h2>
                <ul role="list" data-recent aria-live="polite">${recentRows()}</ul>
              </section>
            </div>`.s,
          mount() {
            requestAnimationFrame(() => paintRing());
          },
          on: {
            redeem: ({ entry }) => {
              paintRing();
              $("[data-recent]", view).innerHTML = recentRows(entry.id).s;
            },
            member: () => { paintRing(); const l = $("[data-plan-line]", view); if (l) l.textContent = planLine(); },
          },
        };
      }

      function planLine() {
        const m = member();
        return `${S.memberPlan(m).name} plan · renews on ${fmt.shortDate(m.renewsAt)}`;
      }

      function recentRows(newId) {
        const rows = S.activity().slice(0, 3);
        if (!rows.length) return html`<li class="row"><div class="row__main row__meta">No cups used yet. Your first one is waiting.</div></li>`;
        return html`${rows.map((r) => {
          const c = S.cafe(r.cafeId);
          const d = S.drink(r.cafeId, r.drinkId);
          return html`<li class="row${r.id === newId ? " enter" : ""}">
            <div class="row__main">
              <div class="row__title">${d ? d.name : "Coffee"}</div>
              <div class="row__meta">${c.name} · <span data-rel-time="${r.at}">${fmt.ago(r.at)}</span></div>
            </div>
            <span class="badge">${fmt.cups(r.credits)}</span>
          </li>`;
        })}`;
      }

      function paintRing() {
        const ring = $("[data-ring]", view);
        if (!ring) return;
        const m = member();
        const frac = m.cupsTotal ? Math.max(0, Math.min(1, m.cupsLeft / m.cupsTotal)) : 0;
        $(".bar", ring).setAttribute("stroke-dashoffset", (RING_C * (1 - frac)).toFixed(2));
        ui.animateNumber($("[data-ring-num]", ring), m.cupsLeft, { duration: 700 });
        $("[data-ring-total]", ring).textContent = m.cupsTotal;
        ring.setAttribute("aria-label", `${m.cupsLeft} of ${m.cupsTotal} cups left this month`);
      }

      /* Pass ------------------------------------------------------------ */
      const CD_C = 2 * Math.PI * 8;
      function passScreen() {
        const m = member();
        let timer = null, backTimer = null, lastCode = null;
        return {
          html: html`
            <div class="app-screen pass">
              <div class="stack" style="--stack-gap:var(--space-1)">
                <p class="eyebrow">Your pass</p>
                <h1 class="t-h2">${[m.firstName, m.lastName].filter(Boolean).join(" ")}</h1>
              </div>
              <div class="pass__card" data-pass-card></div>
              <p class="pass__note">${icon("sun")} Turn your brightness up if the scanner struggles.</p>
              ${LCC.sync ? LCC.sync.pill() : ""}
            </div>`.s,
          mount() {
            paintQrCard();
            timer = setInterval(tickCountdown, 250);
            return () => { clearInterval(timer); clearTimeout(backTimer); };
          },
          on: {
            pass: () => rotate(),
            redeem: ({ entry, member: who }) => { if (who.id === member().id) showSuccess(entry); },
            member: () => paintMeta(),
          },
        };

        function paintQrCard() {
          const m2 = member();
          const plan = S.memberPlan(m2);
          const card = $("[data-pass-card]", view);
          card.innerHTML = html`
            <div class="qr" data-qr role="img" aria-label="QR code for your pass"></div>
            <div class="countdown" aria-hidden="true">
              <svg viewBox="0 0 20 20"><circle class="track" cx="10" cy="10" r="8"/><circle class="bar" data-cd-bar cx="10" cy="10" r="8" stroke-dasharray="${CD_C.toFixed(2)}"/></svg>
              <span data-cd-text></span>
            </div>
            <p class="pass__code" data-code></p>
            <p class="t-small t-muted">Show this to the barista, or read them the code.</p>
            <div class="pass__meta">
              <div><p class="t-micro t-faint">Cups left</p><p class="t-h3 num"><span data-pass-cups>${m2.cupsLeft}</span> of <span data-pass-total>${m2.cupsTotal}</span></p></div>
              <div style="text-align:right"><p class="t-micro t-faint">Plan</p><p class="t-h3" data-pass-plan>${plan.name}</p></div>
            </div>`.s;
          lastCode = null;
          paintCode();
          tickCountdown();
        }

        // Plan change or gift while the pass is open
        function paintMeta() {
          const m2 = member();
          const set = (sel, v) => { const n = $(sel, view); if (n) n.textContent = v; };
          set("[data-pass-cups]", m2.cupsLeft);
          set("[data-pass-total]", m2.cupsTotal);
          set("[data-pass-plan]", S.memberPlan(m2).name);
        }

        function paintCode() {
          const p = S.pass();
          if (p.code === lastCode) return;
          lastCode = p.code;
          const qrEl = $("[data-qr]", view);
          if (qrEl) qrEl.innerHTML = ui.qrSvg(p.payload);
          const codeEl = $("[data-code]", view);
          if (codeEl) {
            codeEl.innerHTML = html`<span>${p.code.slice(0, 3)}</span><span>${p.code.slice(3)}</span>`.s;
            codeEl.setAttribute("aria-label", `Code ${p.code.split("").join(" ")}`);
          }
        }

        function rotate() {
          const qrEl = $("[data-qr]", view);
          if (!qrEl) return;
          qrEl.classList.add("is-rotating");
          setTimeout(() => { paintCode(); qrEl.classList.remove("is-rotating"); }, ui.reducedMotion() ? 0 : 180);
        }

        function tickCountdown() {
          const text = $("[data-cd-text]", view);
          if (!text) return;
          const p = S.pass();
          if (p.code !== lastCode) rotate(); // safety net if the rotation event was missed
          text.textContent = `Refreshes in ${fmt.countdown(p.secondsLeft)}`;
          $("[data-cd-bar]", view).setAttribute("stroke-dashoffset", (CD_C * (1 - p.secondsLeft / p.period)).toFixed(2));
        }

        function showSuccess(entry) {
          const card = $("[data-pass-card]", view);
          if (!card) return;
          const m2 = member();
          const cafe = S.cafe(entry.cafeId);
          const drink = S.drink(entry.cafeId, entry.drinkId);
          const before = m2.cupsLeft + entry.credits;
          card.innerHTML = html`
            <div class="pass-success" role="status">
              <svg class="check-draw" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" pathLength="1"/><path d="M15 24.5l6 6 12-13" pathLength="1"/></svg>
              <p class="t-h2">Enjoy your coffee at ${cafe.name}.</p>
              <p class="t-body t-muted">${drink ? drink.name : "1 cup"} · <span class="num" style="color:var(--ink);font-weight:500" data-success-cups data-value="${before}">${before}</span> of ${m2.cupsTotal} cups left</p>
              <button type="button" class="btn btn--secondary" data-pass-back style="margin-top:var(--space-3)">Back to my pass</button>
            </div>`.s;
          setTimeout(() => ui.animateNumber($("[data-success-cups]", view), m2.cupsLeft, { duration: 600 }), ui.reducedMotion() ? 0 : 450);
          clearTimeout(backTimer);
          backTimer = setTimeout(paintQrCard, 8000);
        }
      }

      /* Map ------------------------------------------------------------- */
      function pinStatus(c) {
        return mapMode === "now" ? c.status : S.usualStatus(c, USUAL_HOUR).status;
      }
      function pinLabel(c, status) {
        return mapMode === "now"
          ? `${c.name}, ${fmt.statusLabel(status)}, ${fmt.updated(c.statusUpdatedAt)}`
          : `${c.name}, usually ${fmt.statusLabel(status).toLowerCase()} at 6 pm`;
      }
      function pinHtml(c) {
        const p = project(c.x, c.y);
        const status = pinStatus(c);
        return html`<button type="button" class="pin${LABEL_SIDE[c.id] ? ` pin--${LABEL_SIDE[c.id]}` : ""}" data-pin="${c.id}" data-status="${status}"
            style="left:${(p.x / MAP_W * 100).toFixed(2)}%;top:${(p.y / MAP_H * 100).toFixed(2)}%" aria-label="${pinLabel(c, status)}">
            <span class="pin__dot">${ui.cupIcon(status, { size: 18, cls: "pin__icon" })}</span>
            <span class="pin__name" aria-hidden="true">${c.name}</span>
          </button>`;
      }
      function mapNote() {
        return mapMode === "now"
          ? html`Live from each café. Tap a pin for details.`
          : html`How busy each café usually is at 6 pm, from past weeks.`;
      }

      function mapScreen() {
        return {
          html: html`
            <div class="app-screen--flush">
              <div class="map-head">
                <h1 class="t-h2">Know before you go.</h1>
                ${ui.segmented({ name: "mapmode", label: "Map view", value: mapMode, options: [{ value: "now", label: "Now" }, { value: "usual", label: "Usually at 6 pm" }] })}
              </div>
              <div class="map" data-map>
                ${mapSvg()}
                <div data-pins>${S.cafes().map(pinHtml)}</div>
              </div>
              <div class="map-foot">
                <div class="legend" aria-hidden="true">
                  ${store.statuses.map((s) => html`<span>${ui.cupIcon(s, { size: 16, cls: "" })}${fmt.statusLabel(s)}</span>`)}
                </div>
                <p class="t-small t-muted" data-map-note aria-live="polite">${mapNote()}</p>
              </div>
            </div>`.s,
          on: {
            "cafe:status": ({ cafeId }) => {
              const c = S.cafe(cafeId);
              if (mapMode !== "now") return;
              const pin = $(`[data-pin="${cafeId}"]`, view);
              if (pin) {
                pin.dataset.status = c.status;
                $(".pin__icon", pin).outerHTML = ui.cupIcon(c.status, { size: 18, cls: "pin__icon" }).s;
                pin.setAttribute("aria-label", pinLabel(c, c.status));
                pin.classList.remove("is-changed"); void pin.offsetWidth; pin.classList.add("is-changed");
              }
              $("[data-map-note]", view).innerHTML = html`${c.name} is now ${fmt.statusLabel(c.status).toLowerCase()} · <span data-rel-time="${c.statusUpdatedAt}" data-rel-prefix="updated">${fmt.updated(c.statusUpdatedAt)}</span>`.s;
            },
            tick: () => {
              if (mapMode !== "now") return;
              $$("[data-pin]", view).forEach((pin) => { const c = S.cafe(pin.dataset.pin); pin.setAttribute("aria-label", pinLabel(c, c.status)); });
            },
          },
        };
      }

      function setMapMode(mode) {
        mapMode = mode;
        const pins = $("[data-pins]", view);
        if (!pins) return;
        pins.innerHTML = html`${S.cafes().map(pinHtml)}`.s;
        $("[data-map-note]", view).innerHTML = mapNote().s;
      }

      /* ---------------- Events ---------------- */
      const onClick = (e) => {
        const t = e.target;
        const tab = t.closest("[data-tab]");
        if (tab) { location.hash = hrefFor(tab.dataset.tab); return; }
        const cafeBtn = t.closest("[data-open-cafe], [data-pin]");
        if (cafeBtn) { openCafe(cafeBtn.dataset.openCafe || cafeBtn.dataset.pin); return; }
        const seg = t.closest('[data-segmented="mapmode"] .segmented__option');
        if (seg) { ui.selectSegment(seg.parentElement, seg.dataset.value); setMapMode(seg.dataset.value); return; }
        if (t.closest("[data-pass-back]")) { active.cleanup?.(); active.cleanup = null; show(["pass"], { force: true }); return; }
        const start = t.closest("[data-start-plan]");
        if (start) { LCC.appPlan?.start({ addCafe: start.dataset.startPlan || null }); go("#/app/plan"); return; }
        const backBtn = t.closest("[data-back]");
        if (backBtn) { back(backBtn.dataset.back); return; }
        const dir = t.closest("[data-directions]");
        if (dir) {
          // BACKEND: deep link to the phone's maps app with the café's coordinates
          ui.toast(`Directions to ${S.cafe(dir.dataset.directions).name} open in your maps app.`, { iconName: "pin" });
        }
      };

      // Tabs: arrows move and activate, Home/End jump
      const onKeydown = (e) => {
        const tab = e.target.closest?.("[data-tab]");
        if (!tab) return;
        const ids = TABS.map((t) => t.id);
        let i = ids.indexOf(tab.dataset.tab);
        if (e.key === "ArrowRight") i = (i + 1) % ids.length;
        else if (e.key === "ArrowLeft") i = (i - 1 + ids.length) % ids.length;
        else if (e.key === "Home") i = 0;
        else if (e.key === "End") i = ids.length - 1;
        else return;
        e.preventDefault();
        $(`[data-tab="${ids[i]}"]`, el).focus();
        location.hash = hrefFor(ids[i]);
      };

      el.addEventListener("click", onClick);
      el.addEventListener("keydown", onKeydown);

      // Store events go to whichever screen is showing
      const dispatch = (type) => (payload) => active.on?.[type]?.(payload);
      const offs = ["redeem", "member", "plan", "builder", "cafe:status", "pass", "tick"].map((type) => store.on(type, dispatch(type)));
      // A cup redeemed while Mumtaz is on another tab still deserves a word
      offs.push(store.on("redeem", ({ entry, member: who }) => {
        if (who.id !== member().id || active.key === "pass") return;
        ui.toast(`Cup redeemed at ${S.cafe(entry.cafeId).name}. ${fmt.cups(who.cupsLeft)} left.`);
      }));

      // Another device filled this one in (join handshake): redraw, unless mid-purchase
      offs.push(store.on("snapshot", () => {
        if (!$(".phone__screen", el).classList.contains("is-flow")) show(LCC.router.parse().path, { force: true });
      }));

      api = { show };
      show(path);

      return () => {
        if (typeof active.cleanup === "function") active.cleanup();
        offs.forEach((off) => off());
        el.removeEventListener("click", onClick);
        el.removeEventListener("keydown", onKeydown);
        window.removeEventListener("resize", fit);
        api = null;
      };
    },
  });
})();
