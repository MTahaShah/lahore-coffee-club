/* =====================================================================
   The Round — app.js
   Member app (#/app). Replaces the Pass 1 shell in router.js.

   Routes:  #/app (Home) · #/app/cafes (List | Map) · #/app/cafes/:id
            #/app/pass · #/app/circles · #/app/circles/:id
            #/app/circles/:id/join · #/app/club · #/app/gift · #/app/plan
            #/app/plan/pay · #/app/order · #/app/order/pay · #/app/group/:id
            #/app/welcome · #/app/welcome/card
   Old links redirect: #/app/map (Cafés, Map), #/app/circle/:id(/join).
   This file owns the shell, tabs, Home, Pass and the busy map (drawn
   inside the Cafés tab, ctx.busyMap). Cafés live in app-cafes.js,
   Circles in app-circles.js, the plan picker and payment in
   app-plan.js, the Club and gifting in app-club.js, pickup orders in
   app-order.js, onboarding in app-welcome.js; they add
   screen factories to LCC.appScreens and get a small ctx object.

   Everything reads the shared store, so a redemption or status change
   in the café view (same window or another one) shows up here live.
   ===================================================================== */
(function () {
  "use strict";
  const LCC = window.LCC;
  const { store, fmt, ui } = LCC;
  const { html, raw, $, $$, icon } = ui;
  const S = store.select;
  const A = store.actions;
  // Screens added by app-cafes.js / app-plan.js: name -> (ctx, arg) => screen
  const REG = (LCC.appScreens = LCC.appScreens || {});

  /** A quiet link that opens "What your cup covers" (the shell handles the tap). */
  LCC.bandsGuide = {
    link(text) {
      const m = store.getState().members[store.getState().memberId];
      const label = text || (m?.plan ? `Covers ${S.coversLabel(S.bandAt())} drinks` : "What each band covers");
      return html`<button type="button" class="band-hint" data-bands-guide aria-haspopup="dialog" aria-controls="bands-sheet">${label}${icon("info", { size: 14 })}</button>`;
    },
  };

  const TABS = [
    { id: "home",    label: "Home",    icon: "home" },
    { id: "cafes",   label: "Cafés",   icon: "store" },
    { id: "pass",    label: "Pass",    icon: "qr" },
    { id: "circles", label: "Circles", icon: "circles" },
    { id: "club",    label: "Club",    icon: "award" },
  ];
  /** The Circles tab's icon: a small brick ring (ui.brickRing), thin outlines, at 24px. */
  const tabRing = () => ui.brickRing({ total: 6, filled: 6, size: 24, radius: 8, length: 5, twist: 14, cls: "tab__ring" });
  const tabFromPath = (path) => (TABS.some((t) => t.id === path[0]) ? path[0] : "home");
  const hrefFor = (id) => (id === "home" ? "#/app" : `#/app/${id}`);

  /* -------------------------------------------------------------------
     Map geometry. data.js stores café/area positions on a 1000 x 800
     landscape grid; the phone map is a portrait 360 x 560 schematic.
     ------------------------------------------------------------------- */
  const MAP_W = 360, MAP_H = 560;
  const project = (x, y) => ({ x: 24 + (x - 260) * 0.58, y: 60 + (y - 250) * 1.1 });
  // Where each pin's name sits, so names stay inside the frame and don't collide (default: right)
  const LABEL_SIDE = {
    kite: "left", blank: "left", nofilter: "left", housespecialty: "below", thirdculture: "left", brewtique: "below",
    extraction: "left", retrograde: "below", luna: "left", slab: "left", sixthree: "left",
    "ds-gulberg": "left", "ds-cantt": "below", "ds-lalakjan": "left", "ds-dha6": "left", "ds-dolmen": "left", "ds-pine": "left", "ds-modeltown": "left",
  };
  const AREA_LABELS = {
    gulberg: [236, 196], liberty: [92, 286], fortress: [292, 70],
    dha: [300, 540], "model-town": [196, 512], "johar-town": [58, 530], cantt: [318, 270],
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

  // The Cafés tab draws this map
  LCC.memberMap = { svg: mapSvg, project, labelSide: LABEL_SIDE, width: MAP_W, height: MAP_H };

  /* -------------------------------------------------------------------
     Surface
     ------------------------------------------------------------------- */
  let api = null; // set while mounted, so router.update can reach it

  LCC.router.register("app", {
    title: "Member app",
    update(path, opts) { if (api) api.show(path, opts); },
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
                    ${t.id === "pass" ? html`<span class="tab__pass">${icon(t.icon)}</span>` : t.id === "circles" ? tabRing() : icon(t.icon)}
                    <span>${t.label}</span>
                  </button>`)}
              </div>
              <div class="sheet" id="cafe-sheet" role="dialog" aria-modal="true" aria-labelledby="cafe-sheet-title" aria-hidden="true"></div>
              <div class="sheet" id="bands-sheet" role="dialog" aria-modal="true" aria-labelledby="bands-title" aria-hidden="true"></div>
              <div class="sheet" id="photo-sheet" role="dialog" aria-modal="true" aria-labelledby="photo-title" aria-hidden="true"></div>
              <div class="toast-region" style="position:absolute;bottom:104px" role="status" aria-live="polite"></div>
              <div class="sheet" id="wallet-sheet" role="dialog" aria-modal="true" aria-labelledby="wallet-title" aria-hidden="true"></div>
              <div class="cup-alert-region" data-cup-alerts aria-live="assertive"></div>
              <input type="file" accept="image/*" class="sr-only" tabindex="-1" aria-hidden="true" data-photo-input>
            </div>
          </div>
        </div>`;

      const view = $("#app-view", el);

      /* ---------------- Routing inside the app ---------------- */
      function resolve(path) {
        const [a = "home", b] = path;
        // A chain's page (a brand that sells its own plans); single cafés open their café page
        const brandId = b && (S.brand(b)?.plans.length ? b : S.cafe(b)?.chainId);
        if (a === "cafes" && brandId && REG.brand) return { key: `cafes/${brandId}`, tab: "cafes", make: () => REG.brand(ctx, brandId) };
        if (a === "cafes" && b && S.cafe(b) && REG.cafeDetail) return { key: `cafes/${b}`, tab: "cafes", make: () => REG.cafeDetail(ctx, b) };
        if (a === "cafes" && b && LCC.comingSoonCafe?.(b) && REG.soonDetail) return { key: `cafes/${b}`, tab: "cafes", make: () => REG.soonDetail(ctx, b) };
        if (a === "cafes" && REG.cafes) return { key: "cafes", tab: "cafes", make: () => REG.cafes(ctx) };
        // The busy map now sits in the Cafés tab (Map selected)
        if (a === "map") return { key: "map", tab: "cafes", make: () => { REG.cafesView?.("map"); active.on?.cafesView?.("map"); return { redirect: "#/app/cafes" }; } };
        if (a === "circles" && b && path[2] === "join" && REG.circleJoin) return { key: `circles/${b}/join`, tab: "circles", flow: true, make: () => REG.circleJoin(ctx, b) };
        if (a === "circles" && b && REG.circle) return { key: `circles/${b}`, tab: "circles", make: () => REG.circle(ctx, b) };
        if (a === "circles" && REG.circles) return { key: "circles", tab: "circles", make: () => REG.circles(ctx) };
        // Circles used to live in the Club tab: old links (and invitations already sent) still work
        if (a === "circle") return { key: "circle", tab: "circles", make: () => ({ redirect: b ? `#/app/circles/${b}${path[2] === "join" ? "/join" : ""}` : "#/app/circles" }) };
        if (a === "group" && b && REG.group) return { key: `group/${b}`, tab: "home", flow: true, make: () => REG.group(ctx, b) };
        if (a === "order" && b === "done" && path[2] && REG.orderDone) return { key: `order/done/${path[2]}`, tab: "home", flow: true, make: () => REG.orderDone(ctx, path[2]) };
        if (a === "profile") return { key: b ? `profile/${b}` : "profile", tab: "home", slide: true, make: () => profileScreen(b) };
        if (a === "cups" && REG.cups) return { key: "cups", tab: "home", flow: true, make: () => REG.cups(ctx) };
        if (a === "order" && b === "pay" && REG.orderPay) return { key: "order/pay", tab: "home", flow: true, make: () => REG.orderPay(ctx) };
        if (a === "order" && REG.order) return { key: "order", tab: "home", flow: true, make: () => REG.order(ctx, b) };
        if (a === "plan" && b === "pay" && REG.pay) return { key: "plan/pay", tab: "home", flow: true, make: () => REG.pay(ctx) };
        if (a === "plan" && REG.plan) return { key: "plan", tab: "home", flow: true, make: () => REG.plan(ctx) };
        if (a === "club" && REG.club) return { key: "club", tab: "club", make: () => REG.club(ctx) };
        if (a === "rewards") return { key: "rewards", tab: "club", make: () => ({ redirect: "#/app/club" }) };
        if (a === "gift" && REG.gift) return { key: "gift", tab: "home", flow: true, make: () => REG.gift(ctx) };
        if (a === "welcome" && b === "card" && REG.issued) return { key: "welcome/card", tab: "home", flow: true, make: () => REG.issued(ctx) };
        if (a === "welcome" && REG.welcome) return { key: "welcome", tab: "home", flow: true, make: () => REG.welcome(ctx) };
        const tab = tabFromPath(path);
        return { key: tab, tab, make: SCREENS[tab] };
      }

      function show(path, { force = false } = {}) {
        const r = resolve(Array.isArray(path) ? path : [path]);
        if (active.key === r.key && !force) return;
        const screen = r.make();
        if (screen.redirect) { history.replaceState(null, "", LCC.sync ? LCC.sync.withRoom(screen.redirect) : screen.redirect); LCC.router.render(); return; }
        let forward = false;
        if (active.key !== r.key) {
          if (replacing && trail.length) trail[trail.length - 1] = r.key;
          else if (trail[trail.length - 2] === r.key) trail.pop();
          else { trail.push(r.key); forward = true; }
        }
        replacing = false;
        if (typeof active.cleanup === "function") active.cleanup();
        ui.closeSheet($("#cafe-sheet", el));
        ui.closeSheet($("#photo-sheet", el));
        $$("[data-tab]", el).forEach((btn) => {
          const on = btn.dataset.tab === r.tab;
          btn.setAttribute("aria-selected", on);
          btn.tabIndex = on ? 0 : -1;
        });
        // Plan and payment are a focused flow: no tab bar
        $(".phone__screen", el).classList.toggle("is-flow", !!r.flow);
        // The pass is the moment at the counter: a black screen (BRAND.md)
        $(".phone__screen", el).classList.toggle("theme-dark", r.tab === "pass");
        view.setAttribute("aria-labelledby", `tab-${r.tab}`);
        // Profile pages slide in from the right over the screen they came from (300ms, transform only)
        const slide = r.slide && forward && !ui.reducedMotion();
        $$(".app-ghost", el).forEach((g) => g.remove());
        const prev = view.firstElementChild;
        if (slide && prev) {
          const ghost = document.createElement("div");
          ghost.className = "app-ghost";
          ghost.setAttribute("aria-hidden", "true");
          ghost.inert = true;
          ghost.style.top = `${view.offsetTop}px`;
          ghost.style.height = `${view.clientHeight}px`;
          prev.style.transform = `translateY(${-view.scrollTop}px)`;
          ghost.appendChild(prev);
          view.before(ghost);
          setTimeout(() => ghost.remove(), 320);
        }
        view.innerHTML = `<div class="enter${slide ? " slide-in" : ""}">${screen.html}</div>`;
        view.scrollTop = 0;
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
        const brand = S.brandOf(cafeId);
        const facts = html`<div>${ui.statusPill(c.id)}</div>
          <div class="cafe-sheet__facts">
            <span>${icon("clock")} ${c.hours.label} · ${open.open ? "open now" : "closed now"}</span>
            <span>${ui.cupIcon(usual, { size: 18, cls: "" })} Usually ${fmt.statusLabel(usual).toLowerCase()} at 6 pm</span>
          </div>`;
        const foot = html`<button type="button" class="btn btn--primary btn--block" data-start-order="${c.id}">Order for pickup</button>`;
        const sheet = $("#cafe-sheet", el);
        if (brand) {
          const cover = S.band(S.bandAt(undefined, brand.id)).maxPrice;
          sheet.innerHTML = ui.sheetPanel({
            id: "cafe-sheet-title", title: brand.name, cls: "cafe-sheet",
            subtitle: `${c.branch} · ${c.distanceKm} km · one of ${S.branches(brand.id).length} branches`,
            body: html`${facts}
              <p class="t-small t-muted">Your cups cover drinks up to ${fmt.rs(cover)}, at any ${brand.name} branch.</p>
              <div class="mlist">
                ${ui.menuRow({ label: "Menu and branches", href: `#/app/cafes/${brand.id}` })}
                ${ui.menuRow({ label: "Directions", attrs: { "data-directions": c.id }, chevron: false })}
              </div>`,
            foot,
          }).s;
          ui.openSheet(sheet);
          return;
        }
        sheet.innerHTML = ui.sheetPanel({
          id: "cafe-sheet-title", title: c.name, cls: "cafe-sheet",
          subtitle: `${S.area(c.area).name} · ${c.distanceKm} km · Latte ${fmt.rs(c.price)}`,
          body: html`${facts}
            <p class="t-small t-muted">${c.blurb}</p>
            <section aria-labelledby="cs-sig-h">
              <h3 class="eyebrow" id="cs-sig-h">Signature drinks</h3>
              <ul role="list">
                ${c.drinks.map((d) => html`<li class="row"><div class="row__main"><div class="row__title">${d.name}</div></div><span class="row__trail">${fmt.cups(d.credits)}</span></li>`)}
              </ul>
            </section>
            <div class="mlist">
              ${ui.menuRow({ label: `More about ${c.name}`, href: `#/app/cafes/${c.id}` })}
              ${ui.menuRow({ label: "Directions", attrs: { "data-directions": c.id }, chevron: false })}
            </div>`,
          foot,
        }).s;
        ui.openSheet(sheet);
      }

      /* ---------------- Screens ---------------- */
      const SCREENS = {
        home: homeScreen,
        pass: passScreen,
      };

      /* Home ------------------------------------------------------------ */
      // One calm, centred block: the brick ring, cups left, renewal, and
      // "Order for pickup" (plan and gift are quieter links under it). An
      // open pickup order sits above the ring, which shrinks to make room.
      // Recent activity lives in My cups; plan details and help in the profile page.
      function homeScreen() {
        const m = member();
        const hasPickup = () => !!LCC.appOrder?.visible().length;
        function paintPickups() {
          const box = $("[data-home-pickups]", view);
          if (!box) return;
          box.innerHTML = LCC.appOrder ? LCC.appOrder.cardsHtml().s : "";
          $(".home", view)?.classList.toggle("has-pickup", hasPickup());
        }
        return {
          html: html`
            <div class="app-screen home${hasPickup() ? " has-pickup" : ""}">
              <div class="app-top">
                <div class="app-brand">${ui.logo("mark")}</div>
                ${profileButton()}
              </div>
              <div>
                <p class="t-small t-muted">${fmt.date(Date.now())}</p>
                <h1 class="t-title">Salaam, ${m.firstName}</h1>
              </div>
              <div class="home__pickups" data-home-pickups>${LCC.appOrder ? LCC.appOrder.cardsHtml() : ""}</div>

              <div class="home__center">
                ${ringHtml()}
                <div class="home__lines" data-home-lines>${homeLinesHtml()}</div>
                <div class="home__actions">
                  <button type="button" class="btn btn--primary btn--block" data-start-order>Order for pickup</button>
                  <div class="home__more">
                    <button type="button" class="btn btn--quiet" data-start-plan>${m.plan ? "Change plan" : "Choose a plan"}</button>
                    <a class="btn btn--quiet" href="#/app/gift">Send a gift</a>
                  </div>
                </div>
              </div>
            </div>`.s,
          mount() {
            requestAnimationFrame(() => paintRing());
            return () => {};
          },
          on: {
            pickup: ({ order }) => { if (order.memberId === member().id) paintPickups(); },
            dismissPickup: paintPickups,
            // Redemptions, gifts and free cups, from this window or another device
            ledger: ({ entries }) => {
              if (!entries.some((e) => e.memberId === member().id)) return;
              paintRing();
              paintHomeLines();
            },
            member: () => {
              paintRing();
              paintHomeLines();
            },
          },
        };
      }

      /** Under the ring: "Double Shot · 11 cups left · any branch" on a brand plan. */
      const homeLine = () => S.brandBalanceLine() || (member().plan ? S.planLabel(member()) : "No plan yet");

      /** "Renews on 2 Dec" (Pass), "Use by 4 Jan" (packs). */
      const renewLine = () => S.planDateLine(member());

      /** The Home ring: the logo's own bricks (ui.logoRing, 15 of them).
          Cup packs: a gold brick per cup left (up to 15), the rest empty
          outlines; the number is cups left. LCC Pass: one brick per member
          coffee this pass month. No savings figures.                       */
      function ringSpec() {
        const N = ui.logoRingSize();
        if (S.isPass()) {
          // Member coffees this pass month, one brick each (no savings figures: menu prices may not match the counter)
          const n = S.passMonth().coffees;
          return { kind: "pass", filled: Math.min(N, n), num: n, cap: `member ${n === 1 ? "coffee" : "coffees"} this month`, label: `${n} member ${n === 1 ? "coffee" : "coffees"} this month` };
        }
        const b = S.balance();
        const left = Math.max(0, b.left);
        return { kind: "cups", filled: Math.min(N, left), num: left, cap: left === 1 ? "cup left" : "cups left", label: `${left} of ${fmt.cups(b.total)} left` };
      }
      function ringHtml() {
        const r = ringSpec();
        const bricks = html`<div class="ring__bricks" data-bricks data-key="${r.filled}">${ui.logoRing({ filled: r.filled, stagger: true })}</div>`;
        return html`<div class="ring ring--home" data-ring data-kind="${r.kind}" role="img" aria-label="${r.label}">
          ${bricks}
          <div class="ring__center" aria-hidden="true"><span class="ring__face ring__face--front"><span class="ring__num" data-ring-num data-value="0">0</span><span class="ring__cap" data-ring-cap>${r.cap}</span></span></div>
        </div>`;
      }

      /** Lines under the ring. Pass: today's member coffee, the plain offer
          and the renewal. No savings figures. */
      function homeLinesHtml() {
        const m = member();
        if (S.isPass()) {
          const t = S.passToday();
          return html`
            <p class="t-body num" data-home-line>${t.limit > 1 ? `Today: ${t.limit} member coffees · ${t.left} left` : `Today’s member coffee: ${t.used ? "used, back tomorrow" : "available"}`}</p>
            <p class="t-small t-muted num">${S.passTier().name} · ${LCC.passCopy ? LCC.passCopy.perDay(S.passTier()) : ""}. ${renewLine()}.</p>`;
        }
        return html`
          <p class="t-body" data-home-line>${homeLine()}</p>
          <p class="t-small t-muted" data-renew-line>${renewLine()}</p>
          ${m.plan ? LCC.bandsGuide.link() : ""}`;
      }
      function paintHomeLines() {
        const box = $("[data-home-lines]", view);
        if (box) box.innerHTML = homeLinesHtml().s;
      }

      /* What your cup covers ---------------------------------------------
         One quiet sheet, opened from any [data-bands-guide]: each band with
         a few typical drinks, the member's own band marked.            */
      function bandsSheetHtml() {
        const bands = store.getState().bands;
        const mine = member().plan ? S.bandAt() : null;
        const at = bands.findIndex((b) => b.id === mine);
        return ui.sheetPanel({
          id: "bands-title", title: "What your cup covers", cls: "bands-sheet",
          subtitle: `Every drink sits in a band by its menu price.${at >= 0 ? ` Your plan covers ${S.coversLabel(mine)}.` : ""}`,
          body: html`<ol class="bands" role="list">
              ${bands.map((b, i) => html`<li class="bands__item${at >= i ? " is-covered" : ""}">
                <div class="bands__head">
                  <span class="bands__name">${b.label}</span>
                  <span class="t-small t-faint num">up to ${fmt.rs(b.maxPrice)}</span>
                  ${at >= i ? html`<span class="badge">In your plan</span>` : ""}
                </div>
                ${b.line ? html`<p class="t-small t-muted">${b.line}</p>` : ""}
                ${b.examples?.length ? html`<p class="t-small bands__eg">${b.examples.join(" · ")}</p>` : ""}
              </li>`)}
            </ol>
            <p class="t-small t-faint">Above your band, use a cup and pay the difference at the counter. Prices vary by café, so the menu in the app shows each drink’s band.</p>`,
        });
      }
      function openBands(btn) {
        const sh = $("#bands-sheet", el);
        btn?.focus();
        sh.innerHTML = bandsSheetHtml().s;
        ui.openSheet(sh);
      }

      /* Profile (#/app/profile) ------------------------------------------
         A full page that slides in from the right over the screen (the tab
         bar stays). Hero (avatar, name in Versailles, number and level),
         then three groups: Membership, Settings, Support. Sub-pages are
         their own routes (#/app/profile/plan …) in the same card style. */
      function profileButton() {
        return html`<a class="icon-btn profile-btn" href="#/app/profile" aria-label="Profile and account">${icon("user")}</a>`;
      }

      const WHATSAPP = "https://wa.me/923100008242";
      const passPct = () => Math.round(S.planConfig().pass.discount * 100);
      function planLines(m) {
        const plan = S.memberPlan(m);
        if (!m.plan) return null;
        const quote = S.quote(m.plan);
        const T = plan.type === "pass" ? S.passTier(m) : null;
        const what = plan.type === "pass" ? `${passPct()}% off ${T.dailyLimit === 1 ? "one coffee" : `${T.dailyLimit} coffees`} a day, at any partner café`
          : plan.type === "brand" ? "Cups for any branch"
          : plan.type === "explorer" ? `${fmt.cups(plan.cups)}, any partner café`
          : `${fmt.cups(plan.cups)} this month at your cafés`;
        return {
          name: S.planLabel(m),
          what,
          price: quote ? `${fmt.rs(quote.price)}${plan.type === "explorer" ? "" : " a month"}` : "",
          date: S.planDateLine(m),
          short: S.planDateLine(m).replace(/^Renews on/, "renews").replace(/^Use by/, "use by"),
          paid: m.payment ? `${m.payment.method} ending ${m.payment.last4}` : "",
        };
      }
      const LOOK = { coffee: "Coffee", matcha: "Matcha", light: "Light", dark: "Dark", auto: "Auto" };
      const lookValue = () => `${LOOK[LCC.theme.flavour()]} · ${LOOK[LCC.theme.mode()]}`;
      function lastCupLine() {
        const r = S.activity(undefined, ["redeem", "pass-sale"])[0];
        return r ? `${S.entryDrinkName(r)} at ${S.placeName(r.cafeId)} · ${fmt.ago(r.at)}` : "None yet";
      }
      function pickupsLine() {
        const o = LCC.appOrder?.visible()[0];
        return o ? LCC.appOrder.statusLine(o) : "None right now";
      }
      function profileLines() {
        const p = planLines(member());
        return { plan: p ? `${p.name} · ${p.short}` : "No plan yet", cups: lastCupLine(), pickups: pickupsLine(), look: lookValue() };
      }
      const group = (id, label, rows) => html`<section class="pgroup" aria-labelledby="pg-${id}">
          <h2 class="eyebrow pgroup__label" id="pg-${id}">${label}</h2>
          <div class="pcard">${rows}</div>
        </section>`;

      function profileHeroHtml(m) {
        const c = S.club(m.id);
        return html`<div class="phero" data-phero>
          <button type="button" class="phero__avatar" data-photo-menu aria-haspopup="dialog" aria-label="${m.photo ? "Change or remove your photo" : "Add a photo"}">
            ${ui.avatar(m, { size: 72 })}
            <span class="phero__cam" aria-hidden="true">${icon(m.photo ? "sliders" : "plus", { size: 14 })}</span>
          </button>
          <h1 class="t-title phero__name">${S.fullName(m)}</h1>
          <p class="phero__line num">${fmt.lcc(m.memberNo)} · ${c.founding ? "Founding Member" : c.level.name}</p>
        </div>`;
      }

      function profileMainHtml() {
        const m = member();
        const L = profileLines();
        return html`
          ${profileHeroHtml(m)}
          ${group("member", "Membership", html`
            ${ui.menuRow({ label: "Plan", line: L.plan, lineKey: "plan", href: "#/app/profile/plan" })}
            ${ui.menuRow({ label: "My cups", line: L.cups, lineKey: "cups", href: "#/app/cups" })}
            ${ui.menuRow({ label: "Pickup orders", line: L.pickups, lineKey: "pickups", href: "#/app/profile/pickups" })}`)}
          ${group("settings", "Settings", html`
            ${ui.menuRow({ label: "Privacy", href: "#/app/profile/privacy" })}
            ${ui.menuRow({ label: "Appearance", value: L.look, href: "#/app/profile/look", attrs: { "data-look-row": "" } })}`)}
          ${group("support", "Support", html`
            ${ui.menuRow({ label: "Help", href: "#/app/profile/help" })}
            ${ui.menuRow({ label: "Message us on WhatsApp", href: WHATSAPP, external: true })}`)}`;
      }

      const SUB_TITLES = { plan: "Plan", pickups: "Pickup orders", privacy: "Privacy", look: "Appearance", help: "Help" };
      function profileSubBody(page) {
        const m = member();
        return {
          plan: () => {
            const p = planLines(m);
            return p
              ? html`${group("plan", "Your plan", html`
                    <div class="pcard__block">
                      <p class="pcard__name">${p.name}</p>
                      <p class="t-small t-muted">${p.what}</p>
                    </div>
                    ${p.price ? ui.menuRow({ label: "Price", value: p.price, chevron: false, cls: "mrow--static" }) : ""}
                    ${ui.menuRow({ label: p.date.startsWith("Use") ? "Use by" : "Renews", value: p.date.replace(/^(Renews on|Use by) /, ""), chevron: false, cls: "mrow--static" })}
                    ${p.paid ? ui.menuRow({ label: "Paid with", value: p.paid, chevron: false, cls: "mrow--static" }) : ""}`)}
                  <button type="button" class="btn btn--primary btn--block" data-start-plan>Change plan</button>`
              : html`<div class="pcard"><div class="pcard__block"><p class="t-body t-muted">No plan yet. Pick The Round Pass or a cup pack to start.</p></div></div>
                  <button type="button" class="btn btn--primary btn--block" data-start-plan>Choose a plan</button>`;
          },
          pickups: () => html`<div class="pstack" data-profile-pickups>${LCC.appOrder ? LCC.appOrder.drawerHtml() : ""}</div>`,
          privacy: () => html`<div class="pcard" data-privacy-box>${privacyHtml()}</div>`,
          look: () => html`<div class="pcard">
              <div class="pcard__block plook">
                <p class="plook__label">Colour</p>
                ${ui.segmented({ name: "flavour", label: "Colour", value: LCC.theme.flavour(), options: [{ value: "coffee", label: "Coffee" }, { value: "matcha", label: "Matcha" }] })}
              </div>
              <div class="pcard__block plook">
                <p class="plook__label">Light or dark</p>
                ${ui.segmented({ name: "mode", label: "Light or dark", value: LCC.theme.mode(), options: [{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "auto", label: "Auto" }] })}
              </div>
            </div>`,
          help: () => html`<div class="pcard phelp">
              ${ui.disclosure({ id: "help-pass", label: "How do I use my pass?", body: html`<p class="t-small t-muted">Show your pass at the counter. On The Round Pass it’s one QR with your membership number; on a cup pack, the QR or your 6-digit code.</p>` })}
              ${ui.disclosure({ id: "help-plan", label: "What does The Round Pass give me?", body: html`<p class="t-small t-muted">${passPct()}% off one coffee a day at any partner café. The barista takes it off at the till.</p>` })}
              ${ui.disclosure({ id: "help-pack", label: "How long do pack cups last?", body: html`<p class="t-small t-muted num">Pack cups last ${S.planConfig().packDays} days from the day you buy the pack.</p>` })}
            </div>
            <div class="pcard">${ui.menuRow({ label: "Message us on WhatsApp", href: WHATSAPP, external: true })}</div>`,
        }[page];
      }

      function profileScreen(page) {
        if (page && !SUB_TITLES[page]) return { redirect: "#/app/profile" };
        const box = () => $("[data-profile]", view);
        function paint(pages = []) {
          const root = box();
          if (!root) return;
          if (!page) {
            const L = profileLines();
            Object.entries(L).forEach(([k, v]) => { const n = $(`[data-mrow-line="${k}"]`, root); if (n) n.textContent = v; });
            const look = $("[data-look-row] .mrow__value", root);
            if (look) look.textContent = L.look;
            const hero = $("[data-phero]", root);
            if (hero && pages.includes("profile")) {
              const focus = hero.contains(document.activeElement);
              hero.outerHTML = profileHeroHtml(member()).s;
              if (focus) $("[data-photo-menu]", root)?.focus({ preventScroll: true });
            }
            return;
          }
          if (page === "pickups" && pages.includes("pickups")) { const p = $("[data-profile-pickups]", root); if (p && LCC.appOrder) p.innerHTML = LCC.appOrder.drawerHtml().s; }
          if (page === "plan" && pages.includes("plan")) { const b = $("[data-profile-body]", root); if (b && !b.contains(document.activeElement)) b.innerHTML = profileSubBody("plan")().s; }
        }
        const body = page ? profileSubBody(page) : null;
        return {
          html: html`<div class="profile${page ? " profile--sub" : ""}" data-profile>
              <div class="screen-bar">
                <button type="button" class="icon-btn" data-back="${page ? "#/app/profile" : "#/app"}" aria-label="Back">${icon("arrowLeft")}</button>
              </div>
              <div class="app-screen profile__body">
                ${page ? html`<h1 class="t-title profile__title" tabindex="-1" data-focus-title>${SUB_TITLES[page]}</h1>
                  <div class="pstack" data-profile-body>${body()}</div>` : profileMainHtml()}
              </div>
            </div>`.s,
          mount() {
            const t = () => { const h = $("[data-focus-title]", view); if (h && document.activeElement !== h) h.focus({ preventScroll: true }); };
            requestAnimationFrame(t);
            const timer = setTimeout(t, 60); // no frame comes in a background tab
            return () => clearTimeout(timer);
          },
          on: {
            ledger: () => paint(["plan"]),
            pickup: () => paint(["pickups"]),
            order: () => paint(["pickups"]),
            dismissPickup: () => paint(["pickups"]),
            plan: () => paint(["plan"]),
            member: () => paint(["plan"]),
            profile: () => paint(["profile"]),
            look: () => paint(),
            tick: () => paint(),
          },
        };
      }

      /* Photo options: a small sheet from the avatar (add, change, remove) */
      function openPhotoMenu(btn) {
        const m = member();
        const sh = $("#photo-sheet", el);
        btn?.focus();
        sh.innerHTML = ui.sheetPanel({
          id: "photo-title", title: "Your photo", subtitle: "Your photo helps the barista recognise you.",
          body: html`<div class="photo-sheet__face">${ui.avatar(m, { size: 96 })}</div>
            <div class="mlist">
              ${ui.menuRow({ label: m.photo ? "Change photo" : "Add a photo", attrs: { "data-add-photo": "", "data-sheet-close": "" }, chevron: false })}
              ${m.photo ? ui.menuRow({ label: "Remove photo", attrs: { "data-remove-photo": "", "data-sheet-close": "" }, chevron: false }) : ""}
            </div>`,
        }).s;
        ui.openSheet(sh);
      }

      /** A square 160px JPEG from the chosen picture, small enough to sync. */
      function readPhoto(file) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          const url = URL.createObjectURL(file);
          img.onload = () => {
            const n = 160, c = document.createElement("canvas");
            c.width = c.height = n;
            const side = Math.min(img.naturalWidth, img.naturalHeight);
            c.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, n, n);
            URL.revokeObjectURL(url);
            resolve(c.toDataURL("image/jpeg", 0.82));
          };
          img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("not an image")); };
          img.src = url;
        });
      }

      /** After every cup at a counter: what was used, where and when, with "That was me" and "Not you? Report". */
      function cupAlert(entry) {
        const region = $("[data-cup-alerts]", el);
        if (!region) return;
        $$(".cup-alert", region).forEach((n) => n.remove());
        const where = S.pickupPlace(entry.cafeId);
        region.insertAdjacentHTML("beforeend", html`<div class="cup-alert enter" role="alertdialog" aria-labelledby="ca-${entry.id}" data-cup-alert="${entry.id}">
          <p class="cup-alert__title" id="ca-${entry.id}">1 cup used at ${where} · ${fmt.time(entry.at)} · ${S.entryDrinkName(entry)}</p>
          ${entry.topUp ? html`<p class="t-small t-muted num">Cup + ${fmt.rs(entry.topUp)} top-up at the till.</p>` : ""}
          <div class="cup-alert__acts">
            <button type="button" class="btn btn--primary btn--compact" data-cup-me="${entry.id}">That was me</button>
            <button type="button" class="btn btn--secondary btn--compact" data-cup-report="${entry.id}">Not you? Report</button>
          </div>
        </div>`.s);
        $(`[data-cup-me="${entry.id}"]`, region)?.focus({ preventScroll: true });
      }
      function closeCupAlert(id) { $(`[data-cup-alert="${id}"]`, el)?.remove(); }

      /** After every pass sale: "LCC Pass used at Drip · 8:40 am. Not you? Tap here." (state.notices) */
      function passNotice(notice) {
        const region = $("[data-cup-alerts]", el);
        if (!region || notice.read || notice.undone) return;
        $$(".cup-alert", region).forEach((n) => n.remove());
        region.insertAdjacentHTML("beforeend", html`<div class="cup-alert enter" role="alertdialog" aria-labelledby="pn-${notice.id}" data-cup-alert="${notice.entryId}">
          <p class="cup-alert__title" id="pn-${notice.id}">${notice.text}</p>
          <div class="cup-alert__acts">
            <button type="button" class="btn btn--primary btn--compact" data-notice-ok="${notice.id}">That was me</button>
            <button type="button" class="btn btn--secondary btn--compact" data-notice-flag="${notice.entryId}">Not you? Tap here.</button>
          </div>
        </div>`.s);
        $(`[data-notice-ok="${notice.id}"]`, region)?.focus({ preventScroll: true });
      }

      /* Wallet (simulated): the same pass as a wallet card.
         // BACKEND: Google Wallet API / Apple PassKit signed pass (a .pkpass
         // or a "Save to Google Wallet" JWT from the server, with the static
         // QR, the member number and the valid-until date).               */
      function openWallet(kind) {
        const m = member();
        const T = S.passTier(m);
        const sheet = $("#wallet-sheet", el);
        const where = kind === "apple" ? "Apple Wallet" : "Google Wallet";
        sheet.innerHTML = ui.sheetPanel({
          id: "wallet-title", title: where,
          body: html`<div class="wallet-card">
            <div class="wallet-card__top">
              <span class="wallet-card__logo">${ui.logo("mark")}</span>
              <span class="t-micro wallet-card__tier">${T.name}</span>
            </div>
            <dl class="wallet-card__rows">
              <div><dt class="t-micro">Member</dt><dd>${S.fullName(m)}</dd></div>
              <div><dt class="t-micro">Number</dt><dd class="num">${fmt.lcc(m.memberNo)}</dd></div>
              <div><dt class="t-micro">Valid until</dt><dd class="num">${fmt.longDate(m.renewsAt)}</dd></div>
            </dl>
            <div class="qr wallet-card__qr" role="img" aria-label="QR code for membership number ${fmt.lcc(m.memberNo)}">${raw(ui.qrSvg(staticPayload(m), { fallback: fmt.lcc(m.memberNo) }))}</div>
          </div>
          <div class="stack" style="--stack-gap:var(--space-1)">
            <p class="t-body wallet-added" role="status">${icon("check", { size: 18 })} Added to your wallet.</p>
            <p class="t-small t-faint">Prototype: nothing was sent to ${where}.</p>
          </div>`,
          foot: html`<button type="button" class="btn btn--primary btn--block" data-sheet-close>Done</button>`,
        }).s;
        ui.openSheet(sheet);
      }
      /** The static pass QR encodes the membership number only ("LCC-0042"). */
      const staticPayload = (m) => `LCC-${String(m.memberNo).padStart(4, "0")}`;

      /** Circles see the café and the time after the fact; never a location. */
      function privacyHtml() {
        const p = S.privacy();
        const sw = (key, on, title, line, disabled = false) => html`<label class="switch-row${disabled ? " is-off" : ""}">
          <span class="switch-row__text"><span class="row__title">${title}</span><span class="row__meta">${line}</span></span>
          <input type="checkbox" role="switch" class="switch" data-privacy="${key}" ${on ? raw("checked") : ""} ${disabled ? raw("disabled") : ""}>
        </label>`;
        return html`${sw("share", p.share, "Share my coffee with my Circles", "The café and the time, after you’ve had it. Never where you are now.")}
          ${sw("hideBranch", p.hideBranch, "Hide which branch", "Your Circles see “Double Shot”, not the branch.", !p.share)}`;
      }

      function paintRing() {
        let ring = $("[data-ring]", view);
        if (!ring) return;
        const r = ringSpec();
        // A plan change (Pass <-> pack) swaps the whole ring
        if (ring.dataset.kind !== r.kind) { ring.outerHTML = ringHtml().s; ring = $("[data-ring]", view); }
        const bricks = $("[data-bricks]", ring);
        if (bricks.dataset.key !== String(r.filled)) { bricks.innerHTML = ui.logoRing({ filled: r.filled }).s; bricks.dataset.key = String(r.filled); }
        ui.animateNumber($("[data-ring-num]", ring), r.num, { duration: 700, format: fmt.num });
        const cap = $("[data-ring-cap]", ring); if (cap) cap.textContent = r.cap;
        ring.setAttribute("aria-label", r.label);
      }

      /* Pass ------------------------------------------------------------ */
      const CD_C = 2 * Math.PI * 8;
      function passScreen() {
        let timer = null, backTimer = null, lastCode = null;
        let cafesOpen = false; // "Cups by café": closed by default
        return {
          html: html`
            <div class="app-screen pass">
              <h1 class="sr-only">Your pass</h1>
              <div class="pass__card" data-pass-card></div>
              <p class="pass__note">${icon("sun")} Turn your brightness up if the scanner struggles.</p>
              ${LCC.sync ? LCC.sync.pill() : ""}
            </div>`.s,
          mount() {
            paintQrCard();
            timer = setInterval(tickCountdown, 250);
            const onClick = (e) => {
              const t = e.target.closest("[data-cafes-toggle]");
              if (!t) return;
              cafesOpen = !cafesOpen;
              t.setAttribute("aria-expanded", String(cafesOpen));
              const panel = $("#pass-cafes", view);
              panel.dataset.open = String(cafesOpen);
              panel.toggleAttribute("inert", !cafesOpen);
            };
            view.addEventListener("click", onClick);
            return () => { clearInterval(timer); clearTimeout(backTimer); view.removeEventListener("click", onClick); };
          },
          on: {
            pass: () => rotate(),
            redeem: ({ entry, member: who }) => { if (who.id === member().id && !entry.orderId) showSuccess(entry); },
            passSale: ({ entry, member: who }) => { if (who.id === member().id) showPassSale(entry); },
            undo: ({ member: who }) => { if (who.id === member().id) { clearTimeout(backTimer); paintQrCard(); } },
            profile: ({ memberId }) => { if (memberId === member().id) { const w = $("[data-pass-who]", view); if (w) w.innerHTML = passWho().s; } },
            member: () => paintMeta(),
            ledger: () => paintMeta(),
            order: ({ memberId }) => { if (memberId !== member().id) return; const box = $("[data-pass-order]", view); if (box) box.innerHTML = orderHtml().s; },
          },
        };

        /** Name, with the photo when there is one; "Add a photo" only while there isn't. */
        function passWho() {
          const m2 = member();
          return html`${m2.photo ? ui.avatar(m2, { size: 32 }) : ""}<span class="pass-who__name">${S.fullName(m2)}</span>${m2.photo ? "" : html`<button type="button" class="btn btn--quiet" data-add-photo>Add a photo</button>`}`;
        }
        /** "LCC Pass · 20% off · 1 today", "Cup pack · Classic 8 · 5 of 8 cups left" */
        function planLine() {
          const m2 = member();
          if (!m2.plan) return "No plan yet";
          if (m2.plan.type === "pass") {
            const P = S.passTier(m2);
            // The allowance, as on the card ("1 today"); Home says whether it's used
            const extra = Math.max(0, S.balance().left);
            return `${P.name} · ${Math.round(P.discount * 100)}% off · ${P.dailyLimit} today${extra ? ` · ${fmt.cups(extra)} complimentary` : ""}`;
          }
          const b = S.balance();
          return `${S.planLabel(m2)} · ${Math.max(0, b.left)} of ${b.total} cups left`;
        }
        function cardNo(n) { return String(n).padStart(4, "0"); }

        /** Pass members: today's member coffee, in words, from the ledger (every café). */
        function passTodayLine() {
          const m2 = member();
          const ps = S.passStatus(m2.id);
          const T = ps.tier;
          if (ps.state === "suspended") return "Your membership is suspended. Please contact The Round.";
          if (ps.state === "ended") return `Your pass ended on ${fmt.longDate(m2.renewsAt)}. Renew it in Choose your plan.`;
          if (ps.state === "paused") return "Your pass is paused.";
          if (ps.state === "used") return `Today: used at ${S.pickupPlace(ps.day.last.cafeId)} · ${fmt.time(ps.day.last.at)}. Back tomorrow.`;
          if (T.dailyLimit > 1) return `Today: ${ps.allowance}${ps.count ? ` · the second at ${S.pickupPlace(ps.day.first.cafeId)} until ${fmt.time(ps.until)}` : ""}`;
          return "Today: member coffee available";
        }

        /* The static member pass (LCC Pass and Plus): no rotation, no
           countdown. One QR that encodes the membership number; the
           counter asks for the last 4 digits of the phone when the number
           is typed instead.                                              */
        function staticCardHtml() {
          const m2 = member();
          const T = S.passTier(m2);
          const ended = S.passEnded(m2.id);
          return html`
            <div class="mpass">
              <div class="pass__logo">${ui.logo("mark")}</div>
              <p class="pass-who" data-pass-who>${passWho()}</p>
              <p class="pass__no num" aria-label="Membership number ${m2.memberNo}">${fmt.lcc(m2.memberNo)}</p>
              <p class="eyebrow mpass__tier">${T.name}</p>
              <div class="qr" data-static-qr role="img" aria-label="QR code with your membership number, ${fmt.lcc(m2.memberNo)}">${raw(ui.qrSvg(staticPayload(m2), { fallback: `Tell the counter: ${fmt.lcc(m2.memberNo)}` }))}</div>
              <p class="t-small t-muted num">${ended ? "Ended" : "Valid until"} ${fmt.longDate(m2.renewsAt)}</p>
            </div>
            <p class="t-body mpass__today num" data-pass-today>${passTodayLine()}</p>
            ${ended ? html`<a class="btn btn--primary" href="#/app/plan">Renew my pass</a>` : ""}
            <div class="mpass__wallets">
              <button type="button" class="btn btn--secondary" data-wallet="google">${icon("wallet", { size: 18 })}<span>Add to Google Wallet</span></button>
              <button type="button" class="btn btn--secondary" data-wallet="apple">${icon("wallet", { size: 18 })}<span>Add to Apple Wallet</span></button>
            </div>
            <p class="t-small t-muted">Show this at the counter, or tell them your membership number.</p>
            <div class="pass__stack">
              <div data-pass-plans>${extraPlansHtml()}</div>
            </div>
            <div class="pass-order" data-pass-order>${orderHtml()}</div>`;
        }

        function paintQrCard() {
          const m2 = member();
          const card = $("[data-pass-card]", view);
          if (S.isPass()) { card.innerHTML = staticCardHtml().s; lastCode = null; return; }
          const cafes = passCafes();
          card.innerHTML = html`
            <div class="pass__head">
              <div class="pass__logo">${ui.logo("mark")}</div>
              <p class="pass-who" data-pass-who>${passWho()}</p>
              <p class="pass__no num" aria-label="Member number ${m2.memberNo}">${fmt.lcc(m2.memberNo)}</p>
            </div>
            <div class="qr" data-qr role="img" aria-label="QR code for your pass"></div>
            <div class="pass__codes">
              <p class="pass__code" data-code></p>
              <p class="countdown" aria-hidden="true">
                <svg viewBox="0 0 20 20"><circle class="track" cx="10" cy="10" r="8"/><circle class="bar" data-cd-bar cx="10" cy="10" r="8" stroke-dasharray="${CD_C.toFixed(2)}"/></svg>
                <span data-cd-text></span>
              </p>
              <p class="sr-only">The code changes every 30 seconds. You can also tell the barista your number.</p>
            </div>
            <div class="pass__stack">
              <p class="t-small t-muted num" data-pass-plan>${planLine()}</p>
              <p class="t-small t-muted num">Card ${cardNo(m2.memberNo)}</p>
              <div data-pass-plans>${extraPlansHtml()}</div>
            </div>
            <div class="pass-order" data-pass-order>${orderHtml()}</div>
            ${cafes ? html`<div class="pass__cafes-box">
              <button type="button" class="disclosure" data-cafes-toggle aria-expanded="${cafesOpen}" aria-controls="pass-cafes">
                <span class="eyebrow" id="pass-cafes-h">Cups by café</span>
                <span class="disclosure__chev" aria-hidden="true">${icon("chevronRight", { size: 20 })}</span>
              </button>
              <div class="disclosure__panel" id="pass-cafes" role="region" aria-labelledby="pass-cafes-h" data-open="${cafesOpen}" ${cafesOpen ? "" : raw("inert")}>
                <div class="disclosure__inner"><div class="pass__cafes" data-pass-cafes>${cafes}</div></div>
              </div>
            </div>` : ""}`.s;
          lastCode = null;
          paintCode();
          tickCountdown();
        }

        /** The drink chosen in the app, in one compact row: café, drink, band. */
        function orderHtml() {
          const o = S.order();
          if (!o) return "";
          const item = S.menuItem(o.brandId, o.drinkId);
          const p = S.drinkPrice(o.brandId, item, o.temp, S.bandAt(undefined, o.brandId));
          return html`<div class="pass-order__row">
            <a class="pass-order__text" href="#/app/cafes/${o.brandId}" aria-label="Your order: ${S.drinkLabel(item, o.temp)} at ${S.brand(o.brandId).name}. Change it">
              <span class="t-small t-muted">${S.brand(o.brandId).name}</span>
              <span class="pass-order__drink">${S.drinkLabel(item, o.temp)}</span>
              <span class="t-small t-muted num">${S.isPass() ? `${fmt.rs(p.price)} on the menu` : `${p.band ? p.band.label : "Above Reserve"}${p.included ? "" : ` · Cup + ${fmt.rs(p.topUp)}`}`}</span>
            </a>
            <button type="button" class="icon-btn pass-order__clear" data-clear-order aria-label="Order at the counter instead">${icon("close", { size: 18 })}</button>
          </div>`;
        }

        /** Cup packs: cups used at each café on this pack ("Drip 2"), a chain counted once.
            My cafés: each café's balance ("Drip 3 of 6"). Brand plans: nothing,
            the plan line already says it. Empty string when there's nothing to show. */
        function passCafes() {
          const b = S.balance();
          if (!b.type || b.type === "brand" || b.type === "pass") return "";
          if (b.type === "mycafes") {
            const rows = Object.entries(b.perCafe).filter(([, x]) => x.reserved);
            return rows.length ? html`<ul role="list">${rows.map(([id, x]) => html`<li><span>${S.venueName(id)}</span> <span class="num">${x.left} of ${x.reserved} left</span></li>`)}</ul>` : "";
          }
          // Cup packs: no per-café limit; one cup a day at any café
          const used = {};
          Object.entries(b.usedAt).forEach(([id, n]) => { const v = S.venueOf(id); used[v] = (used[v] || 0) + n; });
          const rows = Object.entries(used);
          return html`<p class="t-small t-muted">Any partner café, ${fmt.cups(S.planConfig().packDailyLimit)} a day.</p>
            ${rows.length
              ? html`<ul role="list">${rows.map(([id, n]) => html`<li><span>${S.venueName(id)}</span> <span class="num">${n} used</span></li>`)}</ul>`
              : html`<p class="t-small t-muted">No cups used yet. Your first one is waiting.</p>`}`;
        }

        /** Any other plan the member holds: "Also: Explorer · 6 of 8 cups left". Nothing with one plan. */
        function extraPlansHtml() {
          const extra = S.plansOf(member().id).filter((p) => p.key !== "main");
          return extra.length ? html`<p class="pass__also t-small t-muted num">Also: ${extra.map((p) => `${p.name} · ${p.left} of ${p.total} cups left`).join(" · ")}</p>` : "";
        }

        // Plan change, redemption elsewhere or gift while the pass is open
        function paintMeta() {
          const set = (sel, v) => { const n = $(sel, view); if (n) n.textContent = v; };
          // A plan change between the Pass and a pack swaps the whole card
          if (!!S.isPass() !== !!$("[data-pass-today]", view) && !$(".pass-success", view)) return paintQrCard();
          set("[data-pass-plan]", planLine());
          set("[data-pass-today]", S.isPass() ? passTodayLine() : "");
          const list = $("[data-pass-cafes]", view);
          if (list) list.innerHTML = passCafes().s || "";
          const also = $("[data-pass-plans]", view);
          if (also) also.innerHTML = extraPlansHtml().s || "";
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
          if (S.isPass()) return; // the static pass doesn't rotate
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

        /** After a pass sale at the counter: the drink and what was paid at the till. */
        function showPassSale(entry) {
          const card = $("[data-pass-card]", view);
          if (!card) return;
          card.innerHTML = html`
            <div class="pass-success" role="status">
              <svg class="check-draw" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" pathLength="1"/><path d="M15 24.5l6 6 12-13" pathLength="1"/></svg>
              <p class="t-h2">Enjoy your coffee at ${S.pickupPlace(entry.cafeId)}.</p>
              <p class="t-body num">${S.entryDrinkName(entry)} · ${fmt.rs(entry.memberPrice)} at the till</p>
              <p class="t-small t-faint">${(() => { const ps = S.passStatus(member().id, entry.cafeId); return ps.state === "second" ? `${ps.allowance}. The second is here, until ${fmt.time(ps.until)}.` : "Today’s member coffee is used. Back tomorrow."; })()}</p>
              <p class="beans-plus num">${icon("bean", { size: 16 })}+${S.beans().perDrink} Beans</p>
              <button type="button" class="btn btn--secondary" data-pass-back style="margin-top:var(--space-3)">Back to my pass</button>
            </div>`.s;
          clearTimeout(backTimer);
          backTimer = setTimeout(paintQrCard, 8000);
        }

        function showSuccess(entry) {
          const card = $("[data-pass-card]", view);
          if (!card) return;
          const m2 = member();
          const cafe = S.cafe(entry.cafeId);
          const fromPlan = S.plansOf(m2.id).find((p) => p.cycle === entry.cycle);
          const b = fromPlan ? { left: fromPlan.left, total: fromPlan.total } : S.balance();
          const before = b.left + entry.credits;
          const here = S.cafeBalance(m2.id, entry.cafeId);
          const hereLine = fromPlan && fromPlan.key !== "main" ? `From your ${fromPlan.name} cups`
            : entry.bonus ? "That was a complimentary cup from the club"
            : here.type === "brand" ? `Your cups work at every ${cafe.name} branch`
            : here.type === "mycafes"
            ? `${here.left} of ${here.reserved} left at ${cafe.name}`
            : here.type === "explorer" ? `${here.pool} left on your pack · the next one tomorrow`
            : here.left > 0 ? `${here.left} more at ${cafe.name} this month` : `That’s your ${here.cap} at ${cafe.name} this month`;
          card.innerHTML = html`
            <div class="pass-success" role="status">
              <svg class="check-draw" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" pathLength="1"/><path d="M15 24.5l6 6 12-13" pathLength="1"/></svg>
              <p class="t-h2">Enjoy your coffee at ${S.pickupPlace(cafe.id)}.</p>
              ${entry.topUp ? html`<p class="t-body num">Pay ${fmt.rs(entry.topUp)} at the till for the difference.</p>` : ""}
              <p class="t-body t-muted">${S.entryDrinkName(entry)} · <span class="num" style="color:var(--ink);font-weight:500" data-success-cups data-value="${before}">${before}</span> of ${b.total} cups left</p>
              <p class="t-small t-faint num" data-success-here>${hereLine}</p>
              <p class="beans-plus num">${icon("bean", { size: 16 })}+${S.beans().perDrink} Beans</p>
              <button type="button" class="btn btn--secondary" data-pass-back style="margin-top:var(--space-3)">Back to my pass</button>
            </div>`.s;
          setTimeout(() => ui.animateNumber($("[data-success-cups]", view), b.left, { duration: 600 }), ui.reducedMotion() ? 0 : 450);
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
          ? `${S.placeName(c.id)}, ${fmt.statusLabel(status)}, ${fmt.updated(c.statusUpdatedAt)}`
          : `${S.placeName(c.id)}, usually ${fmt.statusLabel(status).toLowerCase()} at 6 pm`;
      }
      function pinHtml(c) {
        const p = project(c.x, c.y);
        const status = pinStatus(c);
        return html`<button type="button" class="pin${LABEL_SIDE[c.id] ? ` pin--${LABEL_SIDE[c.id]}` : ""}" data-pin="${c.id}" data-status="${status}"
            style="left:${(p.x / MAP_W * 100).toFixed(2)}%;top:${(p.y / MAP_H * 100).toFixed(2)}%" aria-label="${pinLabel(c, status)}">
            <span class="pin__dot">${ui.cupIcon(status, { size: 18, cls: "pin__icon" })}</span>
            <span class="pin__name" aria-hidden="true">${c.pinName || c.name}</span>
          </button>`;
      }
      function mapNote() {
        return mapMode === "now"
          ? html`Live from each café. Tap a pin for details.`
          : html`How busy each café usually is at 6 pm, from past weeks.`;
      }

      /** The busy map, drawn inside the Cafés tab (Map). Pins follow the
          tab's search and filters through busyMap.setList. */
      let mapList = () => S.cafes();
      function busyMapHtml() {
        return html`
            <div class="busy-map">
              <div class="map-head">
                <h2 class="t-h3">Know before you go.</h2>
                ${ui.segmented({ name: "mapmode", label: "Map view", value: mapMode, options: [{ value: "now", label: "Now" }, { value: "usual", label: "Usually at 6 pm" }] })}
              </div>
              <div class="map" data-map>
                ${mapSvg()}
                <div data-pins>${mapList().map(pinHtml)}</div>
              </div>
              <div class="map-foot">
                <div class="legend" aria-hidden="true">
                  ${store.statuses.map((s) => html`<span>${ui.cupIcon(s, { size: 16, cls: "" })}${fmt.statusLabel(s)}</span>`)}
                </div>
                <p class="t-small t-muted" data-map-note aria-live="polite">${mapNote()}</p>
              </div>
            </div>`;
      }
      function mapStatus({ cafeId }) {
        const c = S.cafe(cafeId);
        if (mapMode !== "now") return;
        const pin = $(`[data-pin="${cafeId}"]`, view);
        if (pin) {
          pin.dataset.status = c.status;
          $(".pin__icon", pin).outerHTML = ui.cupIcon(c.status, { size: 18, cls: "pin__icon" }).s;
          pin.setAttribute("aria-label", pinLabel(c, c.status));
          pin.classList.remove("is-changed"); void pin.offsetWidth; pin.classList.add("is-changed");
        }
        const note = $("[data-map-note]", view);
        if (note) note.innerHTML = html`${c.name} is now ${fmt.statusLabel(c.status).toLowerCase()} · <span data-rel-time="${c.statusUpdatedAt}" data-rel-prefix="updated">${fmt.updated(c.statusUpdatedAt)}</span>`.s;
      }
      function mapTick() {
        if (mapMode !== "now") return;
        $$("[data-pin]", view).forEach((pin) => { const c = S.cafe(pin.dataset.pin); pin.setAttribute("aria-label", pinLabel(c, c.status)); });
      }
      function paintPins() {
        const pins = $("[data-pins]", view);
        if (pins) pins.innerHTML = html`${mapList().map(pinHtml)}`.s;
      }

      function setMapMode(mode) {
        mapMode = mode;
        const pins = $("[data-pins]", view);
        if (!pins) return;
        paintPins();
        $("[data-map-note]", view).innerHTML = mapNote().s;
      }
      ctx.busyMap = {
        html: busyMapHtml,
        setList: (fn) => { mapList = fn || (() => S.cafes()); },
        paint: paintPins,
        status: mapStatus,
        tick: mapTick,
      };

      /* ---------------- Events ---------------- */
      const onClick = (e) => {
        const t = e.target;
        const tab = t.closest("[data-tab]");
        if (tab) { location.hash = hrefFor(tab.dataset.tab); return; }
        const pm = t.closest("[data-photo-menu]");
        if (pm) { openPhotoMenu(pm); return; }
        const bg = t.closest("[data-bands-guide]");
        if (bg) { openBands(bg); return; }
        const cafeBtn = t.closest("[data-open-cafe], [data-pin]");
        if (cafeBtn) { openCafe(cafeBtn.dataset.openCafe || cafeBtn.dataset.pin); return; }
        const look = t.closest('[data-segmented="flavour"] .segmented__option, [data-segmented="mode"] .segmented__option');
        if (look) {
          const group = look.parentElement;
          ui.selectSegment(group, look.dataset.value);
          if (group.dataset.segmented === "flavour") LCC.theme.setFlavour(look.dataset.value);
          else LCC.theme.setMode(look.dataset.value);
          active.on?.look?.();
          return;
        }
        const seg = t.closest('[data-segmented="mapmode"] .segmented__option');
        if (seg) { ui.selectSegment(seg.parentElement, seg.dataset.value); setMapMode(seg.dataset.value); return; }
        if (t.closest("[data-clear-order]")) { A.placeOrder({}); return; }
        if (t.closest("[data-add-photo]")) { $("[data-photo-input]", el).click(); return; }
        if (t.closest("[data-remove-photo]")) { A.setMemberPhoto(null); ui.toast("Photo removed. The counter sees your initials."); return; }
        const wal = t.closest("[data-wallet]");
        if (wal) { openWallet(wal.dataset.wallet); return; }
        const nok = t.closest("[data-notice-ok]");
        if (nok) { A.readNotice(nok.dataset.noticeOk); nok.closest(".cup-alert")?.remove(); return; }
        const nfl = t.closest("[data-notice-flag]");
        if (nfl) {
          A.flagPassUse(nfl.dataset.noticeFlag);
          nfl.closest(".cup-alert")?.remove();
          ui.toast("Thanks. We’ll look into it.", { iconName: "info", duration: 5000 });
          return;
        }
        const me = t.closest("[data-cup-me]");
        if (me) { A.confirmRedemption(me.dataset.cupMe); closeCupAlert(me.dataset.cupMe); return; }
        const rep = t.closest("[data-cup-report]");
        if (rep) {
          A.reportRedemption(rep.dataset.cupReport);
          closeCupAlert(rep.dataset.cupReport);
          ui.toast("Thanks. We’ve flagged it for the café and in our records, and we’ll be in touch on WhatsApp.", { iconName: "info", duration: 6000 });
          return;
        }
        const so = t.closest("[data-start-order]");
        if (so) {
          LCC.appOrder?.start({ cafeId: so.dataset.startOrder || null, drinkId: so.dataset.drink || null, temp: so.dataset.temp || null });
          go("#/app/order");
          return;
        }
        const cp = t.closest("[data-cancel-pickup]");
        if (cp) {
          const o = S.pickup(cp.dataset.cancelPickup);
          const res = A.cancelPickup(cp.dataset.cancelPickup);
          ui.toast(res.ok ? `Order cancelled. ${LCC.appOrder.backLine(o)}` : res.message, { iconName: res.ok ? "check" : "info", duration: 4200 });
          if (!res.ok) repaintPickups();
          return;
        }
        const dp = t.closest("[data-dismiss-pickup]");
        if (dp) { LCC.appOrder?.dismiss(dp.dataset.dismissPickup); repaintPickups(); return; }
        if (t.closest("[data-pass-back]")) { active.cleanup?.(); active.cleanup = null; show(["pass"], { force: true }); return; }
        const start = t.closest("[data-start-plan]");
        if (start) { LCC.appPlan?.start({ addCafe: start.dataset.startPlan || null }); go("#/app/plan"); return; }
        const backBtn = t.closest("[data-back]");
        if (backBtn) { back(backBtn.dataset.back); return; }
        const dir = t.closest("[data-directions]");
        if (dir) {
          // BACKEND: deep link to the phone's maps app with the café's coordinates
          ui.toast(`Directions to ${S.placeName(dir.dataset.directions)} open in your maps app.`, { iconName: "pin" });
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

      // Profile: privacy switches
      const onChange = (e) => {
        const t = e.target;
        if (t.matches("[data-photo-input]")) {
          const file = t.files?.[0];
          t.value = "";
          if (!file) return;
          readPhoto(file).then((photo) => { A.setMemberPhoto(photo); ui.toast("Photo added. The barista sees it when you give your number."); })
            .catch(() => ui.toast("That file isn’t a picture we can use. Try another.", { iconName: "info" }));
          return;
        }
        if (!t.matches("[data-privacy]")) return;
        A.setPrivacy({ [t.dataset.privacy]: t.checked });
        const box = t.closest("[data-privacy-box]");
        if (box) { box.innerHTML = privacyHtml().s; $(`[data-privacy="${t.dataset.privacy}"]`, box)?.focus(); }
        ui.toast(t.dataset.privacy === "share" ? (t.checked ? "Your Circles can see your coffee again." : "Your coffee is now private.") : (t.checked ? "Your Circles see the café, not the branch." : "Your Circles see the branch."));
      };
      el.addEventListener("change", onChange);
      el.addEventListener("click", onClick);
      el.addEventListener("keydown", onKeydown);

      // Store events go to whichever screen is showing
      const dispatch = (type) => (payload) => active.on?.[type]?.(payload);
      function repaintPickups() {
        active.on?.dismissPickup?.();
        active.on?.pickup?.();
      }
      const offs = ["redeem", "undo", "profile", "ledger", "member", "plan", "builder", "cafe:status", "pass", "tick", "rsvp", "order", "pickup", "group", "snapshot", "circle", "round", "ack", "privacy"].map((type) => store.on(type, dispatch(type)));

      // Pickup orders: the café's moves get a word (the profile page repaints through active.on)
      offs.push(store.on("pickup", ({ order, prev, quiet }) => {
        if (order.memberId !== member().id) return;
        if (quiet || prev === order.status) return;
        const place = S.pickupPlace(order.cafeId);
        const me = member().id;
        const mineAt = order.items ? order.items.find((i) => i.memberId === me) : null;
        // A table: "your table's order"; otherwise the drink by name
        const name = order.items ? (mineAt ? S.itemDrinkName(order.cafeId, mineAt) : "table’s order") : S.pickupDrinkName(order);
        const your = order.items && order.memberId === me ? "Your table’s order" : `Your ${name}`;
        const earned = order.items
          ? (mineAt ? S.beans().perDrink : 0) + (order.memberId === me ? order.items.filter((i) => i.memberId !== me).length * S.beans().rules.hostPerFriend : 0)
          : S.beans().perDrink;
        if (order.status === "ready") ui.toast(`${your} is ready at ${place}.`, { iconName: "check", duration: 6000 });
        else if (order.status === "preparing" && prev === "placed") ui.toast(`${place} is making ${your.replace(/^Your/, "your")}.`, { iconName: "clock" });
        else if (order.status === "rejected") ui.toast(`${place} couldn’t make ${your.replace(/^Your/, "your")}. ${LCC.appOrder.backLine(order)}`, { iconName: "info", duration: 6000 });
        else if (order.status === "collected" && order.uncollected) ui.toast(`${place} closed and ${your.replace(/^Your/, "your")} wasn’t collected, so it counts as used.`, { iconName: "info", duration: 6000 });
        else if (order.status === "collected") ui.toast(`Collected. Enjoy your ${order.items && !mineAt ? "table" : name}.${earned ? ` +${earned} Beans` : ""}`, { iconName: earned ? "bean" : "check" });
      }));

      // Club milestones: a free cup, a new badge, a new status. Same words on every device.
      const REWARD_TOASTS = {
        "passport-5": "Fifth café on your passport. A complimentary cup is yours.",
        "passport-all": "Every partner café on your passport. A complimentary cup is yours.",
        invite: "A friend joined with your code. A complimentary cup is yours.",
      };
      const earnedNow = () => { const c = S.club(); return { level: c.level.id, badges: c.badges.filter((b) => b.earned).map((b) => b.id) }; };
      let earned = earnedNow();
      offs.push(store.on("ledger", ({ entries, catchUp }) => {
        const mine = entries.filter((e) => e.memberId === member().id);
        if (!mine.length) return;
        const before = earned;
        earned = earnedNow();
        if (catchUp) return; // a join snapshot: no replayed news
        mine.filter((e) => e.type === "reward" && REWARD_TOASTS[e.reason]).forEach((e) => ui.toast(REWARD_TOASTS[e.reason], { iconName: "gift", duration: 4200 }));
        const club = S.club();
        const news = earned.badges.filter((id) => !before.badges.includes(id)).map((id) => `Badge earned: ${club.badges.find((x) => x.id === id).name}.`);
        if (earned.level !== before.level) news.push(`You’re a ${club.level.name} now.`);
        // After the “cup redeemed” and free-cup notes, not before
        if (news.length) setTimeout(() => news.forEach((t) => ui.toast(t, { iconName: "award", duration: 4200 })), 700);
      }));
      // Presenter switched member (new member, or back to Mumtaz): redraw
      offs.push(store.on("session", () => {
        earned = earnedNow();
        show(LCC.router.parse().path, { force: true });
      }));
      // A cup redeemed while Mumtaz is on another tab still deserves a word
      offs.push(store.on("redeem", ({ entry, member: who }) => {
        if (who.id !== member().id || entry.orderId) return;
        cupAlert(entry);
      }));
      // A pass sale for this member, at any counter: the notification with "Not you?"
      offs.push(store.on("notice", ({ notice }) => {
        if (notice.memberId !== member().id || notice.read) return;
        passNotice(notice);
      }));
      // The café undid a cup: it's back
      offs.push(store.on("undo", ({ entry, member: who }) => {
        if (who.id !== member().id) return;
        closeCupAlert(entry.id);
        // An LCC Pass sale undone at the counter: no cup was used, the day's discount comes back
        if (entry.type === "pass-sale") return ui.toast("Member price undone. Today’s member coffee is back.", { iconName: "check", duration: 6000 });
        const p = S.plansOf(who.id).find((x) => x.cycle === entry.cycle);
        ui.toast(`Cup returned. ${S.pickupPlace(entry.cafeId)} undid the ${S.entryDrinkName(entry)}${p ? `; ${fmt.cups(p.left)} left on your ${p.name}` : ""}.`, { iconName: "check", duration: 6000 });
      }));
      offs.push(store.on("profile", ({ memberId }) => {
        if (memberId !== member().id) return;
        // The profile page repaints its hero through active.on.profile
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
        el.removeEventListener("change", onChange);
        el.removeEventListener("keydown", onKeydown);
        window.removeEventListener("resize", fit);
        api = null;
      };
    },
  });
})();
