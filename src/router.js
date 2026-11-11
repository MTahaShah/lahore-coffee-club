/* =====================================================================
   Lahore Coffee Club — router.js
   Hash routes:
     #/            landing
     #/app[/…]     member app (phone frame); sub-paths go to the app
     #/cafe[/…]    café partner view
     #/kit         component sheet (not in the switcher; for review)

   Surfaces register as:
     LCC.router.register("app", {
       title: "Member app",
       mount(el, path) { …; return cleanup },   // called on entering
       update(path) { … },                       // sub-path change only
     });
   The shells below are the Pass 1 defaults; later passes replace them.
   ===================================================================== */
(function () {
  "use strict";
  // The page's own title: "Lahore Coffee Club", or "LCC Cafés" in cafe.html
  const BASE_TITLE = document.title || "Lahore Coffee Club";
  const LCC = (window.LCC = window.LCC || {});
  const { store, fmt, ui } = LCC;
  const { html, raw, $, icon } = ui;

  const surfaces = {};
  let current = { name: null, cleanup: null };

  function register(name, def) {
    surfaces[name] = def;
    // Re-render if the surface being replaced is on screen
    if (current.name === name) { current.name = null; render(); }
  }

  function parse() {
    // “#/cafe?room=4821” -> cafe. The query belongs to sync.js.
    const clean = location.hash.replace(/^#\/?/, "").replace(/\?.*$/, "").replace(/\/+$/, "");
    const [name = "", ...path] = clean.split("/");
    return { name, path };
  }

  function navigate(to) {
    if (location.hash !== to) location.hash = to;
    else render();
  }

  function render() {
    const { name, path } = parse();
    if (!surfaces[name]) { history.replaceState(null, "", "#/"); return render(); }
    const main = $("#main");
    const def = surfaces[name];

    if (current.name === name && def.update) {
      def.update(path);
    } else {
      if (typeof current.cleanup === "function") current.cleanup();
      const firstLoad = current.name === null && !main.childElementCount;
      main.innerHTML = "";
      main.dataset.surface = name || "landing";
      current = { name, cleanup: def.mount(main, path) || null };
      window.scrollTo(0, 0);
      if (!firstLoad) main.focus({ preventScroll: true });
    }
    document.title = def.title ? `${def.title} · ${BASE_TITLE}` : BASE_TITLE;
    applyTheme(); // the flavour belongs to the member app only
    renderProtoBar(name);
  }

  /* -------------------------------------------------------------------
     Prototype switcher
     ------------------------------------------------------------------- */
  const SWITCH = [
    { name: "", href: "#/", label: "Landing" },
    { name: "app", href: "#/app", label: "Member app" },
    { name: "cafe", href: "#/cafe", label: "Café view" },
  ];
  const THEMES = ["auto", "light", "dark"];
  let theme = "auto"; // Light / Dark / Auto (follows the phone); in memory, as before

  /* Flavour: Coffee (default) or Matcha, for the member app only. The
     café view and landing stay coffee, so data-flavour is on <html> only
     while #/app is showing. Remembered on this device (CLAUDE.md:
     approved localStorage exception); any storage failure means Coffee. */
  const FLAVOUR_KEY = "lcc-flavour";
  let flavour = "coffee";
  try { if (localStorage.getItem(FLAVOUR_KEY) === "matcha") flavour = "matcha"; } catch (e) { /* Coffee */ }
  const FLAVOUR_SURFACES = ["app"];
  const darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  /** Point the phone's status bar at the page background. */
  function paintThemeColor() {
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    if (bg) document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", bg));
  }
  /** Apply mode and flavour to <html>; fade colours unless it's the first paint. */
  function applyTheme({ fade = false } = {}) {
    const root = document.documentElement;
    if (fade && !ui.reducedMotion()) {
      root.classList.add("theme-fading");
      clearTimeout(applyTheme.t);
      applyTheme.t = setTimeout(() => root.classList.remove("theme-fading"), 320);
    }
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.dataset.theme = theme;
    if (flavour === "matcha" && FLAVOUR_SURFACES.includes(current.name)) root.dataset.flavour = "matcha";
    else root.removeAttribute("data-flavour");
    paintThemeColor();
  }
  darkQuery?.addEventListener?.("change", paintThemeColor);

  function setMode(next) {
    if (!THEMES.includes(next) || next === theme) return;
    theme = next;
    applyTheme({ fade: true });
    renderProtoBar(parse().name);
  }
  function setFlavour(next) {
    if (!["coffee", "matcha"].includes(next) || next === flavour) return;
    flavour = next;
    try { localStorage.setItem(FLAVOUR_KEY, flavour); } catch (e) { /* this session only */ }
    applyTheme({ fade: true });
    document.dispatchEvent(new CustomEvent("lcc:flavour", { detail: { flavour } }));
  }

  function renderProtoBar(active) {
    const bar = $("#proto-bar");
    bar.className = "proto-bar";
    bar.setAttribute("aria-label", "Prototype navigation");
    bar.innerHTML = html`
      <span class="proto-bar__label">Prototype</span>
      <nav class="proto-bar__nav" aria-label="Surfaces">
        ${SWITCH.map((s) => html`<a class="proto-bar__link" href="${s.href}" ${s.name === active ? raw('aria-current="page"') : ""}>${s.label}</a>`)}
      </nav>
      <div class="proto-bar__end">
        <div class="proto-demo">
          <button type="button" class="proto-bar__theme" data-demo-toggle aria-expanded="false" aria-controls="proto-demo-menu">Demo</button>
          <div class="proto-demo__menu" id="proto-demo-menu" role="menu" aria-label="Presenter" hidden>
            <button type="button" role="menuitem" data-demo="new">Start as a new member</button>
            <button type="button" role="menuitem" data-demo="mumtaz">Back to Mumtaz’s demo</button>
          </div>
        </div>
        <button type="button" class="proto-bar__theme" data-theme-toggle aria-label="Colour theme: ${theme}. Change theme">
          ${theme === "auto" ? "Auto" : theme === "light" ? "Light" : "Dark"}
        </button>
      </div>`;
  }

  /* Presenter menu: start onboarding as a new member, or go back to Mumtaz */
  function demoMenu(open) {
    const btn = $("[data-demo-toggle]"), menu = $("#proto-demo-menu");
    if (!btn || !menu) return;
    btn.setAttribute("aria-expanded", String(open));
    menu.hidden = !open;
    if (open) menu.querySelector("[role=menuitem]").focus();
  }
  const withRoom = (h) => (LCC.sync ? LCC.sync.withRoom(h) : h);
  function demoAction(which) {
    demoMenu(false);
    if (which === "new") {
      LCC.onboarding?.restart();
      const already = current.name === "app" && parse().path[0] === "welcome" && !parse().path[1];
      location.hash = withRoom("#/app/welcome");
      // Already on the first step's screen: no hashchange, so redraw from the top
      if (already) surfaces.app.update(["welcome"], { force: true });
    } else {
      LCC.onboarding?.reset();
      store.actions.restoreDemo();
      location.hash = withRoom("#/app");
    }
  }

  function cycleTheme() {
    setMode(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]);
    $("[data-theme-toggle]")?.focus();
  }

  document.addEventListener("keydown", (e) => {
    const menu = $("#proto-demo-menu");
    if (!menu || menu.hidden) return;
    const items = [...menu.querySelectorAll("[role=menuitem]")];
    const i = items.indexOf(document.activeElement);
    if (e.key === "Escape") { e.preventDefault(); demoMenu(false); $("[data-demo-toggle]").focus(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus(); }
  });

  /* -------------------------------------------------------------------
     Global behaviour
     ------------------------------------------------------------------- */
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-theme-toggle]")) return cycleTheme();
    if (e.target.closest("[data-demo-toggle]")) return demoMenu($("#proto-demo-menu")?.hidden);
    const demo = e.target.closest("[data-demo]");
    if (demo) return demoAction(demo.dataset.demo);
    if (!e.target.closest(".proto-demo")) demoMenu(false);

    // In-page scroll links (hash is taken by the router)
    const scroller = e.target.closest("[data-scroll]");
    if (scroller) {
      e.preventDefault();
      const target = document.getElementById(scroller.dataset.scroll);
      if (target) {
        target.scrollIntoView({ behavior: ui.reducedMotion() ? "auto" : "smooth", block: "start" });
        target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      }
      return;
    }

    const skip = e.target.closest(".skip-link");
    if (skip) { e.preventDefault(); $("#main").focus(); }
  });

  // Fit the 844px phone into shorter laptop screens without changing its layout
  function fitPhone() {
    const available = window.innerHeight - 40 /* proto bar */ - 48 /* breathing room */;
    const scale = Math.min(1, Math.max(0.6, available / 864));
    document.documentElement.style.setProperty("--phone-scale", scale.toFixed(3));
  }
  window.addEventListener("resize", fitPhone);

  /* -------------------------------------------------------------------
     Pass 1 shells
     ------------------------------------------------------------------- */
  const LANDING_SECTIONS = [
    { id: "how", label: "How it works" },
    { id: "plans", label: "Plans" },
    { id: "map", label: "Busy map" },
    { id: "gifting", label: "Gifting and loyalty" },
    { id: "partner", label: "For cafés" },
    { id: "join", label: "Join the waitlist" },
    { id: "faq", label: "Questions" },
  ];

  register("", {
    title: null,
    mount(el) {
      el.innerHTML = html`
        <div class="surface landing">
          <header class="container landing-nav">
            <a class="wordmark" href="#/">Lahore Coffee Club</a>
            <nav class="landing-nav__links" aria-label="Main">
              <a class="landing-nav__link" href="#/" data-scroll="how">How it works</a>
              <a class="landing-nav__link" href="#/" data-scroll="plans">Cafés</a>
              <a class="landing-nav__link" href="#/" data-scroll="join">Join</a>
              <a class="btn btn--secondary btn--compact" href="#/" data-scroll="partner">Partner with us</a>
            </nav>
          </header>
          <div class="container">
            ${LANDING_SECTIONS.map((s, i) => html`
              <section class="landing-section" id="${s.id}" aria-labelledby="${s.id}-h">
                <div class="landing-section__head">
                  <p class="eyebrow num">${String(i + 1).padStart(2, "0")}</p>
                  <div class="placeholder">
                    <h2 class="t-h3" id="${s.id}-h" style="color:var(--ink)">${s.label}</h2>
                    <span>Built in Pass 6.</span>
                  </div>
                </div>
              </section>`)}
          </div>
        </div>`;
    },
  });

  register("app", {
    title: "Member app",
    mount(el) {
      fitPhone();
      const m = store.select.member();
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
              <div class="app-view" id="app-view">
                <div class="app-view__inner stack" style="--stack-gap:var(--space-4)">
                  <p class="eyebrow">Member app</p>
                  <h1 class="t-h2">Salaam, ${m.firstName}.</h1>
                  <div class="placeholder">
                    <span>Built in Passes 3 to 5.</span>
                    <span>Store check: <span class="num" data-bind="cups">${store.select.balance().left} of ${store.select.balance().total}</span> cups left. Kiln &amp; Bean is ${ui.statusPill("kiln", { bare: true })}</span>
                  </div>
                </div>
              </div>
              <div class="toast-region" style="position:absolute" role="status" aria-live="polite"></div>
            </div>
          </div>
        </div>`;
      const cups = $('[data-bind="cups"]', el);
      const paint = () => { cups.textContent = `${store.select.balance().left} of ${store.select.balance().total}`; };
      const off = store.on("member", paint);
      const off2 = store.on("ledger", paint);
      return () => { off(); off2(); };
    },
  });

  register("cafe", {
    title: "Café view",
    mount(el) {
      const cafe = store.select.partnerCafe();
      const area = store.select.area(cafe.area);
      el.innerHTML = html`
        <div class="surface cafe">
          <header class="cafe-header">
            <div class="stack" style="--stack-gap:var(--space-2)">
              <p class="eyebrow">Partner view · ${area.name}</p>
              <h1 class="t-h1">${cafe.name}</h1>
              <p class="t-small t-muted">${fmt.date(Date.now())}</p>
            </div>
            <span class="open-indicator">Open <span class="t-faint t-small" style="font-weight:400">until ${cafe.hours.label.split("–")[1].trim()}</span></span>
          </header>
          <div class="cafe-grid">
            <section class="card" aria-labelledby="redeem-h">
              <div class="panel-title"><h2 class="eyebrow" id="redeem-h">Redeem a cup</h2></div>
              <div class="placeholder" style="min-height:360px">Code entry, numpad, and QR scan. Built in Pass 2.</div>
            </section>
            <div class="cafe-grid__side">
              <section class="card" aria-labelledby="busy-h">
                <div class="panel-title"><h2 class="eyebrow" id="busy-h">How busy are you?</h2>${ui.statusPill(cafe.id)}</div>
                <div class="placeholder">Quiet, Moderate, Packed. Built in Pass 2.</div>
              </section>
              <section class="card" aria-labelledby="today-h">
                <div class="panel-title"><h2 class="eyebrow" id="today-h">Today</h2></div>
                <div class="placeholder">Redemptions, new customers, payout. Built in Pass 2.</div>
              </section>
            </div>
          </div>
          <p class="t-small t-faint" style="margin-top:var(--space-6)">Works on any phone or tablet. No special hardware.</p>
        </div>`;
    },
  });

  /* Boot ---------------------------------------------------------------- */
  window.addEventListener("hashchange", render);
  LCC.router = { register, navigate, render, parse };
  LCC.theme = { mode: () => theme, flavour: () => flavour, setMode, setFlavour };

  // Defer first render so later scripts (kit.js, screens) can register first
  document.addEventListener("DOMContentLoaded", render);
})();
