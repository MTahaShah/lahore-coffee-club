/* =====================================================================
   Lahore Coffee Club — partner.js
   The owner dashboard (#/partner). Sign in with the brand's owner PIN
   (demo: Double Shot 0000, Kiln & Bean 1111), or a branch manager's PIN
   (that branch only). A left rail on laptops and tablets, tabs on phones,
   and a branch filter everywhere: "All branches" or one.

     Live      redemptions, pickup orders, undos and "Not you" reports as
               they happen, with today's totals
     Menu      prices (changes apply from tomorrow) and an "Available
               today" switch per drink and branch (synced to counters)
     Rules     what a cup covers and the café's share, limits, pause member
               cups per branch, busy level (Auto or fixed), opening hours
     Money     this month's payout per branch and in total, history, CSV
               and PDF statements (simulated)
     Insights  from the ledger only: new faces, returning members, busiest
               hours, top drinks, cups per staff member
     Members   Your members (also on the counter for managers)
     Branches  branches, staff, manager PINs, counter setup codes

   Works for any brand: a single café sees one branch and no filter.
   // BACKEND: GET /brands/:id/… for every section; writes are PATCH/POST on
   //   brands, branches, staff and menu, with the owner's session
   ===================================================================== */
(function () {
  "use strict";
  const LCC = window.LCC;
  const { store, fmt, ui } = LCC;
  const { html, raw, $, $$, icon } = ui;
  const S = store.select;
  const A = store.actions;

  const SECTIONS = [
    { id: "live", label: "Live" },
    { id: "menu", label: "Menu" },
    { id: "rules", label: "Rules" },
    { id: "money", label: "Money" },
    { id: "insights", label: "Insights" },
    { id: "members", label: "Members" },
    { id: "branches", label: "Branches" },
  ];
  const RAIL = {
    live: '<circle cx="12" cy="12" r="2.5"/><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.6 4.6a10.4 10.4 0 0 0 0 14.8M19.4 4.6a10.4 10.4 0 0 1 0 14.8"/>',
    menu: '<path d="M6 4.5h12M6 9.5h12M6 14.5h8M6 19.5h5"/>',
    rules: '<path d="M5 7h9M18 7h1M5 17h3M12 17h7"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    money: '<rect x="3.5" y="6" width="17" height="12" rx="1.5"/><circle cx="12" cy="12" r="2.5"/><path d="M7 9.5v5M17 9.5v5"/>',
    insights: '<path d="M4 20h16M7 20v-6M12 20V8M17 20v-9"/>',
    members: '<circle cx="9" cy="8.5" r="3.5"/><path d="M3 19.5c.6-3.3 3-5 6-5s5.4 1.7 6 5M15.5 5.3a3.5 3.5 0 0 1 0 6.4M17.5 14.8c1.8.7 3 2.3 3.5 4.7"/>',
    branches: '<path d="M4 9.5L5.5 4h13L20 9.5M4 9.5h16M5.5 12.5V20h13v-7.5M10 20v-4.5h4V20"/>',
  };
  const railIcon = (id) => raw(`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${RAIL[id]}</svg>`);
  const BUSY = [{ id: "auto", label: "Auto" }, { id: "quiet", label: "Quiet" }, { id: "moderate", label: "Moderate" }, { id: "packed", label: "Packed" }];
  const shortName = (m) => (m ? `${m.firstName}${m.lastName ? ` ${m.lastName[0]}.` : ""}` : "Member");
  const branchShort = (c) => c.branch || c.name;
  const slug = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const monthName = (ts) => new Date(ts).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  /* ===================================================================
     Your members: shared by the dashboard and the counter (managers)
     =================================================================== */
  const MEMBERS_STEP = 30;
  LCC.partnerMembers = {
    /** filter: { branchId, planType, thisMonth, limit, lockBranch } */
    html(brandId, f) {
      const b = S.brand(brandId);
      const branches = S.branches(brandId);
      const all = S.yourMembers(brandId, { branchId: f.branchId, planType: f.planType, thisMonth: f.thisMonth });
      const rows = all.slice(0, f.limit || MEMBERS_STEP);
      const types = [["all", "All plans"], ["brand", `${b.name} plan`], ["explorer", "Explorer"], ["mycafes", "My cafés"]]
        .filter(([t]) => t === "all" || t === "explorer" || (t === "brand" && b.plans.length) || (t === "mycafes" && !b.plans.length));
      return html`<section class="pd-section" aria-labelledby="ym-h">
        <div class="pd-section__head">
          <h2 class="pd-title" id="ym-h">Your members</h2>
          <p class="t-small t-muted">Members on your plan, and Explorer members who’ve visited you.</p>
        </div>
        <div class="pd-filters" role="group" aria-label="Filter members">
          <label class="pd-filter"><span class="t-micro t-faint">Plan</span>
            <span class="select"><select class="input" data-ym="planType">${types.map(([v, l]) => html`<option value="${v}" ${f.planType === v ? raw("selected") : ""}>${l}</option>`)}</select></span></label>
          ${branches.length > 1 && !f.lockBranch ? html`<label class="pd-filter"><span class="t-micro t-faint">Branch visited</span>
            <span class="select"><select class="input" data-ym="branchId"><option value="">All branches</option>${branches.map((c) => html`<option value="${c.id}" ${f.branchId === c.id ? raw("selected") : ""}>${branchShort(c)}</option>`)}</select></span></label>` : ""}
          <label class="switch-row pd-filter pd-filter--switch"><span class="switch-row__text"><span class="row__title">Visited this month</span></span>
            <input type="checkbox" role="switch" class="switch" data-ym="thisMonth" ${f.thisMonth ? raw("checked") : ""}></label>
        </div>
        <p class="t-small t-muted num" aria-live="polite">${all.length} ${all.length === 1 ? "member" : "members"}${all.length > rows.length ? `, showing ${rows.length}` : ""}</p>
        <ul class="pd-members" role="list">
          ${rows.map((r) => html`<li class="pd-member">
            ${ui.avatar(r.member, { size: 44 })}
            <div class="pd-member__who"><p class="pd-member__name">${S.fullName(r.member)}</p><p class="t-small t-faint num">${fmt.lcc(r.member.memberNo)} · ${r.planLabel}</p></div>
            <dl class="pd-member__facts">
              <div><dt>Cups left</dt><dd class="num">${r.cupsLeft}${r.type === "explorer" ? " here" : ""}</dd></div>
              <div><dt>Last visit</dt><dd>${r.lastVisit ? fmt.ago(r.lastVisit) : "Not yet"}</dd></div>
              <div><dt>Usual</dt><dd>${r.usual || "–"}</dd></div>
              ${branches.length > 1 ? html`<div><dt>Most visited</dt><dd>${r.topBranch ? branchShort(r.topBranch) : "–"}</dd></div>` : ""}
            </dl>
          </li>`)}
          ${rows.length ? "" : html`<li class="t-small t-muted">No members match these filters.</li>`}
        </ul>
        ${all.length > rows.length ? html`<button type="button" class="btn btn--secondary" data-ym-more>Show ${Math.min(MEMBERS_STEP, all.length - rows.length)} more</button>` : ""}
      </section>`;
    },
    click(t, f, repaint) {
      if (!t.closest("[data-ym-more]")) return false;
      f.limit = (f.limit || MEMBERS_STEP) + MEMBERS_STEP; repaint(); return true;
    },
    change(t, f, repaint) {
      const k = t.dataset?.ym;
      if (!k) return false;
      f[k] = k === "thisMonth" ? t.checked : t.value || null;
      if (k === "planType" && !f.planType) f.planType = "all";
      f.limit = MEMBERS_STEP;
      repaint();
      $(`[data-ym="${k}"]`)?.focus();
      return true;
    },
  };

  /* ===================================================================
     The dashboard
     =================================================================== */
  let session = null; // { brandId, role, branchId (manager), name }, in memory only

  LCC.router.register("partner", {
    title: "Partner dashboard",
    mount(el) {
      let section = "live";
      let filter = null;                 // branch id, or null for all branches
      let membersFilter = { branchId: null, planType: "all", thisMonth: false, limit: MEMBERS_STEP };
      let addingStaff = null;            // branch id with the add-staff form open
      let editingPin = null;             // staff id whose PIN is being changed
      LCC.partnerScope = () => session?.brandId || null;

      const brand = () => S.brand(session.brandId);
      const branches = () => S.branches(session.brandId);
      const scope = () => (session.role === "manager" ? session.branchId : filter);
      const scopeIds = () => (scope() ? [scope()] : branches().map((c) => c.id));
      const owner = () => session.role === "owner";

      /* Sign in ----------------------------------------------------------- */
      function renderSignIn(err = "", brandId = "doubleshot") {
        el.innerHTML = html`<div class="surface pd pd--signin">
          <form class="ct-setup" data-signin novalidate>
            ${ui.logo("ring", { label: null, cls: "ct-setup__ring" })}
            <h1 class="ct-name">Partner dashboard</h1>
            <p class="t-body t-muted">For café owners and branch managers.</p>
            <label class="field"><span class="field__label">Café or brand</span>
              <span class="select"><select class="input" name="brand">${S.partnerBrands().map((b) => html`<option value="${b.id}" ${b.id === brandId ? raw("selected") : ""}>${b.name}${S.branches(b.id).length > 1 ? ` (${S.branches(b.id).length} branches)` : ""}</option>`)}</select></span>
            </label>
            <div class="field" data-invalid="${!!err}">
              <label class="field__label" for="pd-pin">Owner or manager PIN</label>
              <input class="input ct-setup__input num" id="pd-pin" name="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" aria-describedby="pd-pin-hint pd-pin-err" aria-invalid="${!!err}">
              <p class="field__hint" id="pd-pin-hint">Demo: Double Shot owner 0000, Kiln &amp; Bean owner 1111. A manager’s PIN opens their branch only.</p>
              <p class="field__error" id="pd-pin-err" role="alert">${err}</p>
            </div>
            <button type="submit" class="btn btn--primary btn--block btn--tall">Sign in</button>
          </form>
        </div>`;
        $("#pd-pin", el).focus();
      }

      /* Shell ------------------------------------------------------------- */
      function renderAll() {
        if (!session || !S.brand(session.brandId)) return renderSignIn();
        const b = brand();
        el.innerHTML = html`<div class="surface pd">
          <header class="pd-head">
            <div class="ct-head__id">
              <span class="monogram" aria-hidden="true">${b.monogram}</span>
              <div>
                <h1 class="ct-name">${b.name}</h1>
                <p class="t-small t-muted">${owner() ? `Owner · ${branches().length} ${branches().length === 1 ? "branch" : "branches"}` : `Manager · ${branchShort(S.branch(session.branchId))}`} · ${fmt.date(Date.now())}</p>
              </div>
            </div>
            <div class="pd-head__aside">
              ${owner() && branches().length > 1 ? html`<label class="pd-filter"><span class="t-micro t-faint">Showing</span>
                <span class="select"><select class="input" data-branch-filter><option value="">All branches</option>${branches().map((c) => html`<option value="${c.id}" ${filter === c.id ? raw("selected") : ""}>${branchShort(c)}</option>`)}</select></span></label>` : ""}
              ${LCC.sync ? LCC.sync.pill() : ""}
              <button type="button" class="btn btn--link" data-signout>Sign out</button>
            </div>
          </header>
          <div class="cv-body pd-body">
            <nav class="cv-nav" aria-label="Dashboard">
              <div class="cv-tabs pd-tabs" role="tablist" aria-label="Sections">
                ${SECTIONS.map((x) => html`<button type="button" role="tab" class="cv-tab" id="pd-tab-${x.id}" data-section="${x.id}" aria-controls="pd-panel"
                  aria-selected="${x.id === section}" tabindex="${x.id === section ? 0 : -1}">${railIcon(x.id)}<span>${x.label}</span>${x.id === "live" ? html`<span class="cv-tab__count num" data-reports-count hidden></span>` : ""}</button>`)}
              </div>
            </nav>
            <main class="cv-main" id="pd-panel" role="tabpanel" aria-labelledby="pd-tab-${section}" tabindex="-1" data-panel></main>
          </div>
        </div>`;
        paint();
      }

      function showSection(id, { focus = false } = {}) {
        section = id;
        $$("[data-section]", el).forEach((b) => { const on = b.dataset.section === id; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; });
        $("[data-panel]", el).setAttribute("aria-labelledby", `pd-tab-${id}`);
        paint();
        if (focus) $("[data-panel]", el).focus({ preventScroll: true });
      }

      /** Repaint the section, keeping focus on the same control (data-fk). */
      function paint() {
        const panel = $("[data-panel]", el);
        if (!panel) return;
        const fk = document.activeElement?.closest?.("[data-panel]") ? document.activeElement.dataset.fk : null;
        const make = { live: liveHtml, menu: menuHtml, rules: rulesHtml, money: moneyHtml, insights: insightsHtml, members: () => LCC.partnerMembers.html(session.brandId, { ...membersFilter, branchId: scope() || membersFilter.branchId, lockBranch: !!scope() }), branches: branchesHtml }[section];
        panel.innerHTML = make().s;
        if (fk) $(`[data-fk="${fk}"]`, panel)?.focus({ preventScroll: true });
        paintReportsCount();
      }
      function paintReportsCount() {
        const n = S.brandToday(session.brandId, scope()).reports;
        const badge = $("[data-reports-count]", el);
        if (badge) { badge.textContent = n; badge.hidden = !n; badge.setAttribute("aria-label", `${n} reports today`); }
      }
      const scopeLabel = () => (scope() ? branchShort(S.branch(scope())) : branches().length > 1 ? "All branches" : brand().name);
      const head = (title, line) => html`<div class="pd-section__head"><h2 class="pd-title">${title}</h2><p class="t-small t-muted">${line}</p></div>`;
      const stat = (label, value, sub = "") => html`<div class="pd-stat"><p class="t-micro t-faint">${label}</p><p class="pd-stat__value num">${value}</p>${sub ? html`<p class="t-small t-faint">${sub}</p>` : ""}</div>`;

      /* Live -------------------------------------------------------------- */
      const METHOD = { number: "said their number", scan: "scanned", code: "6-digit code" };
      const PICKUP_WORD = { placed: "Placed", making: "Being made", ready: "Ready", collected: "Collected", cancelled: "Cancelled", rejected: "Rejected" };
      function liveHtml() {
        const t = S.brandToday(session.brandId, scope());
        const feed = S.liveFeed(session.brandId, scope()).slice(0, 40);
        const multi = !scope() && branches().length > 1;
        return html`<section class="pd-section">
          ${head("Live", `${scopeLabel()} · today, as it happens.`)}
          <div class="pd-stats">
            ${stat("Cups today", fmt.num(t.cups), `${t.members} ${t.members === 1 ? "member" : "members"}`)}
            ${stat("Payout so far", fmt.rs(t.payout), "cups and paid orders")}
            ${stat("Pickup orders", fmt.num(t.pickups), t.pickupsOpen ? `${t.pickupsOpen} still open` : "none open")}
            ${stat("Undos", fmt.num(t.undos), "cups given back")}
            ${stat("“Not you” reports", fmt.num(t.reports), t.reports ? "for you to check" : "none today")}
          </div>
          <h3 class="eyebrow">As it happens</h3>
          <ol class="pd-feed" role="list" aria-live="polite" aria-relevant="additions">
            ${feed.length ? feed.map((x) => feedRow(x, multi)) : html`<li class="t-small t-muted">Nothing yet today. Cups appear here the moment a counter redeems them.</li>`}
          </ol>
        </section>`;
      }
      function feedRow(x, multi) {
        const where = multi ? html` <span class="t-faint">· ${branchShort(S.branch(x.branchId))}</span>` : "";
        if (x.kind === "redeem") {
          const e = x.entry;
          const staff = e.staffId ? S.staffMember(e.staffId)?.name : null;
          return html`<li class="pd-feed__row${e.live ? " enter" : ""}">
            <span class="pd-feed__time num">${fmt.time(e.at)}</span>
            <span class="badge">${e.orderId ? "Pickup cup" : "Cup"}</span>
            <span class="pd-feed__main"><span>${shortName(S.member(e.memberId))} · ${S.entryDrinkName(e)}${e.topUp ? html` <span class="t-faint num">· top-up ${fmt.rs(e.topUp)}</span>` : ""}</span>
              <span class="pd-feed__meta t-small t-faint">${[staff, e.method ? METHOD[e.method] : null, `Ref ${e.ref || S.redemptionRef(e)}`].filter(Boolean).join(" · ")}${where}${e.undone ? " · undone" : ""}${e.reported ? " · reported" : ""}</span></span>
          </li>`;
        }
        if (x.kind === "undo") {
          return html`<li class="pd-feed__row${x.entry.live ? " enter" : ""}"><span class="pd-feed__time num">${fmt.time(x.at)}</span><span class="badge">Undo</span>
            <span class="pd-feed__main"><span>${shortName(S.member(x.entry.memberId))} · ${S.entryDrinkName(x.entry)}</span><span class="pd-feed__meta t-small t-faint">Cup given back${where}</span></span></li>`;
        }
        if (x.kind === "report") {
          const e = x.entry;
          return html`<li class="pd-feed__row pd-feed__row--report${x.report ? " enter" : ""}"><span class="pd-feed__time num">${fmt.time(x.at)}</span><span class="badge badge--accent">Report</span>
            <span class="pd-feed__main"><span><strong>“Not you”</strong> from ${shortName(S.member(x.report.memberId))}${e ? html` · ${S.entryDrinkName(e)} at ${fmt.time(e.at)}` : ""}</span>
              <span class="pd-feed__meta t-small t-faint">${e ? `Ref ${e.ref || S.redemptionRef(e)} · served by ${S.staffMember(e.staffId)?.name || "the counter"}` : ""}${where} · LCC has a copy and will be in touch</span></span></li>`;
        }
        const o = x.order;
        return html`<li class="pd-feed__row"><span class="pd-feed__time num">${fmt.time(x.at)}</span><span class="badge">Pickup</span>
          <span class="pd-feed__main"><span>${o.memberName} · ${S.pickupDrinkName(o)}</span><span class="pd-feed__meta t-small t-faint">${PICKUP_WORD[o.status]} · ${o.items ? "table" : o.pay === "cup" ? "cup" : `paid ${fmt.rs(o.amount)}`}${where}</span></span></li>`;
      }

      /* Menu -------------------------------------------------------------- */
      function menuHtml() {
        const b = brand();
        const ids = scopeIds();
        const sections = [...new Set(b.menu.map((d) => d.section))];
        const priceCell = (d, t) => {
          if (d[t] == null) return html`<span class="t-faint">–</span>`;
          const pend = S.pendingPrice(b.id, d.id);
          return html`<label class="pd-price"><span class="sr-only">${d.name}, ${t} price in rupees</span>
            <input class="input num" type="number" min="50" step="5" inputmode="numeric" value="${pend && pend[t] != null ? pend[t] : d[t]}" data-price="${d.id}" data-temp="${t}" data-fk="price-${d.id}-${t}" ${owner() ? "" : raw("disabled")}>
            ${pend && pend[t] != null && pend[t] !== d[t] ? html`<span class="t-micro t-faint num">${fmt.rs(d[t])} today</span>` : ""}</label>`;
        };
        return html`<section class="pd-section">
          ${head("Menu", `${b.menuNote || ""} Price changes apply from tomorrow. “Available today” is back on at midnight.`)}
          ${owner() ? "" : html`<p class="t-small cv-note">Prices are set by the owner. You can switch drinks off for today at your branch.</p>`}
          <p class="t-small t-muted">A cup covers drinks up to ${fmt.rs(b.economics.coverUpTo)}; above that the counter says “Cup + Rs X”. ${ids.length > 1 ? "Switches apply to every branch shown." : `Switches apply to ${scopeLabel()}.`}</p>
          ${sections.map((sec) => html`<div class="pd-menu" role="table" aria-label="${sec}">
            <div class="pd-menu__row pd-menu__row--head" role="row"><span role="columnheader">${sec}</span><span role="columnheader">Hot</span><span role="columnheader">Iced</span><span role="columnheader">Available today</span></div>
            ${b.menu.filter((d) => d.section === sec).map((d) => {
              const off = ids.filter((id) => !S.isAvailable(id, d.id)).length;
              return html`<div class="pd-menu__row" role="row">
                <span role="cell" class="pd-menu__name">${d.name}</span>
                <span role="cell">${priceCell(d, "hot")}</span>
                <span role="cell">${priceCell(d, "iced")}</span>
                <span role="cell" class="pd-menu__avail">
                  <label class="pd-switch"><input type="checkbox" role="switch" class="switch" data-avail="${d.id}" data-fk="avail-${d.id}" ${off < ids.length && off === 0 ? raw("checked") : ""} aria-label="${d.name} available today">
                  <span class="t-small">${off === 0 ? "On" : off === ids.length ? "Off today" : `Off at ${off} of ${ids.length}`}</span></label>
                </span>
              </div>`;
            })}
          </div>`)}
        </section>`;
      }

      /* Rules ------------------------------------------------------------- */
      function rulesHtml() {
        const b = brand();
        const e = b.economics;
        const list = scopeIds().map((id) => S.branch(id));
        const time = (s) => { const [h, m] = s.split(":").map(Number); return `${String(h % 24).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`; };
        return html`<section class="pd-section">
          ${head("Rules", owner() ? "What a cup covers, what you’re paid, and the limits at every branch." : "Set by the owner. You can pause member cups, set the busy level and the hours at your branch.")}
          <div class="pd-grid2">
            <div class="pd-card">
              <h3 class="eyebrow">Rate per cup</h3>
              <label class="field"><span class="field__label">A cup covers drinks up to</span>
                <span class="pd-inline"><span class="t-muted">Rs</span><input class="input num" type="number" min="100" step="10" value="${e.coverUpTo}" data-econ="coverUpTo" data-fk="econ-cover" ${owner() ? "" : raw("disabled")}></span></label>
              <label class="field"><span class="field__label">You’re paid this share of each drink’s price</span>
                <span class="pd-inline"><input class="input num" type="number" min="30" max="95" step="1" value="${Math.round(e.payoutShare * 100)}" data-econ="payoutShare" data-fk="econ-share" ${owner() ? "" : raw("disabled")}><span class="t-muted">%</span></span></label>
              <p class="t-small t-muted num">So at most ${fmt.rs(Math.round(e.coverUpTo * e.payoutShare))} a cup. Above ${fmt.rs(e.coverUpTo)}, the member pays the difference at your till, and that stays with you.</p>
            </div>
            <div class="pd-card">
              <h3 class="eyebrow">Limits</h3>
              ${limitRow("perMemberPerDay", "Cups per member a day, at one branch", 1, 4, 1)}
              ${limitRow("branchCupsPerDay", "Member cups a day, per branch", 10, 400, 10)}
            </div>
          </div>
          <h3 class="eyebrow">Each branch</h3>
          <ul class="pd-branchrules" role="list">
            ${list.map((c) => {
              const paused = S.isPaused(c.id);
              return html`<li class="pd-card pd-branchrule">
                <p class="pd-branchrule__name">${branchShort(c)} ${ui.statusPill(c.id)}</p>
                <div class="pd-branchrule__grid">
                  <div><p class="t-micro t-faint">Member cups</p>
                    <p class="t-small">${paused ? `Paused until ${fmt.time(c.pausedUntil)}` : "Taking member cups"}</p>
                    ${paused ? html`<button type="button" class="btn btn--secondary btn--compact" data-resume="${c.id}" data-fk="resume-${c.id}">Resume now</button>`
                      : html`<button type="button" class="btn btn--secondary btn--compact" data-pause="${c.id}" data-fk="pause-${c.id}">Pause for 30 minutes</button>`}</div>
                  <label class="field"><span class="t-micro t-faint">Busy level</span>
                    <span class="select"><select class="input" data-busy="${c.id}" data-fk="busy-${c.id}">${BUSY.map((x) => html`<option value="${x.id}" ${(c.busyMode === "auto" ? "auto" : c.status) === x.id ? raw("selected") : ""}>${x.id === "auto" ? `Auto (now ${fmt.statusLabel(c.status).toLowerCase()})` : x.label}</option>`)}</select></span></label>
                  <fieldset class="pd-hours"><legend class="t-micro t-faint">Opening hours</legend>
                    <label><span class="sr-only">Opens</span><input class="input num" type="time" value="${time(c.hours.open)}" data-hours="${c.id}" data-which="open" data-fk="open-${c.id}"></label>
                    <span class="t-faint">to</span>
                    <label><span class="sr-only">Closes</span><input class="input num" type="time" value="${time(c.hours.close)}" data-hours="${c.id}" data-which="close" data-fk="close-${c.id}"></label>
                  </fieldset>
                </div>
              </li>`;
            })}
          </ul>
        </section>`;
      }
      function limitRow(key, label, min, max, step) {
        const v = brand().rules[key];
        return html`<div class="pd-limit"><span class="t-small">${label}</span>
          <span class="stepper" data-limit="${key}" data-min="${min}" data-max="${max}" data-step-by="${step}">
            <button type="button" class="stepper__btn" data-limit-step="-1" data-fk="lim-${key}-dn" aria-label="Fewer" ${!owner() || v <= min ? raw("disabled") : ""}>${icon("minus", { size: 18 })}</button>
            <span class="stepper__value num" aria-live="polite">${v}</span>
            <button type="button" class="stepper__btn" data-limit-step="1" data-fk="lim-${key}-up" aria-label="More" ${!owner() || v >= max ? raw("disabled") : ""}>${icon("plus", { size: 18 })}</button>
          </span></div>`;
      }

      /* Money ------------------------------------------------------------- */
      function moneyHtml() {
        const m = S.brandMoney(session.brandId, scope());
        const multi = m.rows.length > 1;
        return html`<section class="pd-section">
          ${head("Money", `${scopeLabel()} · ${monthName(m.monthStart)} so far.`)}
          <div class="pd-stats">
            ${stat("This month so far", fmt.rs(m.earned), `${fmt.num(m.cups)} cups and ${m.paidCount} paid orders`)}
            ${stat("Cups", fmt.rs(m.cupEarned), `${m.share}% of each drink, up to ${fmt.rs(m.maxPerCup)}`)}
            ${stat("Paid orders", fmt.rs(m.paidNet), `after the ${m.feePct}% LCC fee`)}
            ${stat("Next payout", fmt.longDate(m.nextAt), `to the ${m.account.label} ending ${m.account.last4}`)}
          </div>
          ${multi ? html`<div class="pd-table" role="table" aria-label="This month by branch">
            <div class="pd-table__row pd-table__row--head" role="row"><span role="columnheader">Branch</span><span role="columnheader">Cups</span><span role="columnheader">Cup payout</span><span role="columnheader">Paid orders</span><span role="columnheader">Total</span></div>
            ${m.rows.map((r) => html`<div class="pd-table__row" role="row"><span role="cell">${branchShort(r.cafe)}</span><span role="cell" class="num">${fmt.num(r.cups)}</span><span role="cell" class="num">${fmt.rs(r.cupEarned)}</span><span role="cell" class="num">${fmt.rs(r.paid.net)}</span><span role="cell" class="num"><strong>${fmt.rs(r.earned)}</strong></span></div>`)}
            <div class="pd-table__row pd-table__row--foot" role="row"><span role="cell">All branches</span><span role="cell" class="num">${fmt.num(m.cups)}</span><span role="cell" class="num">${fmt.rs(m.cupEarned)}</span><span role="cell" class="num">${fmt.rs(m.paidNet)}</span><span role="cell" class="num"><strong>${fmt.rs(m.earned)}</strong></span></div>
          </div>` : ""}
          ${m.topUps ? html`<p class="t-small t-muted num">Members also paid ${fmt.rs(m.topUps)} in top-ups at your till this month. That’s yours already, so it isn’t in the payout.</p>` : ""}
          <div class="pd-acts">
            <button type="button" class="btn btn--secondary" data-csv>Download CSV</button>
            <button type="button" class="btn btn--secondary" data-pdf>PDF statement</button>
          </div>
          <h3 class="eyebrow">Paid out</h3>
          <div class="pd-table pd-table--3" role="table" aria-label="Past payouts">
            <div class="pd-table__row pd-table__row--head" role="row"><span role="columnheader">Month</span><span role="columnheader">Cups</span><span role="columnheader">Amount</span><span role="columnheader">Paid on</span></div>
            ${m.history.map((h) => html`<div class="pd-table__row" role="row"><span role="cell">${monthName(h.month)}</span><span role="cell" class="num">${fmt.num(h.cups)}</span><span role="cell" class="num">${fmt.rs(h.amount)}</span><span role="cell" class="num">${fmt.longDate(h.paidAt)}</span></div>`)}
          </div>
        </section>`;
      }

      /* Insights ---------------------------------------------------------- */
      function insightsHtml() {
        const x = S.insights(session.brandId, scope());
        const max = Math.max(1, ...x.hours.map((h) => h.cups));
        const top = x.busiest[0]?.hour;
        return html`<section class="pd-section">
          ${head("Insights", `${scopeLabel()} · this month, from LCC cups only.`)}
          <div class="pd-stats">
            ${stat("New faces this month", `${x.newPct}%`, `of LCC cups, from ${x.newMembers} ${x.newMembers === 1 ? "member" : "members"} new to ${brand().name}`)}
            ${stat("Returning members", fmt.num(x.returning), `of ${x.members} this month had been before`)}
            ${stat("LCC cups", fmt.num(x.total), "this month")}
          </div>
          <div class="pd-grid2">
            <div class="pd-card">
              <h3 class="eyebrow">Busiest hours</h3>
              <p class="t-small t-muted">${x.busiest.length ? `Busiest at ${x.busiest.map((h) => fmt.clock(h.hour * 60)).join(", then ")}.` : "No cups yet this month."}</p>
              <ol class="pd-bars" role="list" aria-label="Cups by hour">
                ${x.hours.map((h) => html`<li class="pd-bars__bar${h.hour === top ? " is-top" : ""}" style="--v:${(h.cups / max).toFixed(3)}" title="${fmt.clock(h.hour * 60)}: ${h.cups}">
                  <span class="sr-only">${fmt.clock(h.hour * 60)}: ${h.cups} cups</span><span class="pd-bars__fill" aria-hidden="true"></span>
                  <span class="pd-bars__label t-micro t-faint" aria-hidden="true">${h.hour % 3 === 0 ? fmt.clock(h.hour * 60).replace(/\s?(am|pm)$/, "$1").replace("noon", "12pm").replace("midnight", "12am") : ""}</span></li>`)}
              </ol>
            </div>
            <div class="pd-card">
              <h3 class="eyebrow">Top drinks</h3>
              <ol class="pd-rank" role="list">${x.topDrinks.map((d, i) => html`<li><span class="num t-faint">${i + 1}</span><span>${d.name}</span><span class="num">${d.n}</span></li>`)}</ol>
            </div>
          </div>
          <div class="pd-card">
            <h3 class="eyebrow">Cups per staff member</h3>
            <ol class="pd-rank" role="list">${x.perStaff.slice(0, 12).map((s) => html`<li><span></span><span>${s.name}${s.branch ? html` <span class="t-faint">· ${s.branch.replace(`${brand().name} `, "")}</span>` : ""}</span><span class="num">${s.n}</span></li>`)}</ol>
          </div>
        </section>`;
      }

      /* Branches and staff ------------------------------------------------ */
      function branchesHtml() {
        const b = brand();
        const list = scopeIds().map((id) => S.branch(id));
        return html`<section class="pd-section">
          ${head("Branches and staff", "Counter staff tap their name to start a shift; managers have a PIN. Each branch’s counter is set up once with its setup code.")}
          <ul class="pd-branches" role="list">
            ${list.map((c) => html`<li class="pd-card pd-branch">
              <form class="pd-branch__name" data-rename="${c.id}">
                <label class="field"><span class="t-micro t-faint">${S.branches(b.id).length > 1 ? "Branch name" : "Café name"}</span>
                  <span class="pd-inline"><input class="input" name="name" value="${c.branch || c.name}" data-fk="rename-${c.id}" ${owner() ? "" : raw("disabled")}>
                  ${owner() ? html`<button type="submit" class="btn btn--secondary btn--compact">Save</button>` : ""}</span></label>
              </form>
              <p class="t-small t-muted">${S.area(c.area)?.name || ""} · ${c.hours.label}</p>
              <div class="pd-code"><span class="t-micro t-faint">Counter setup code</span><span class="pd-code__value num">${c.setupCode}</span>
                <button type="button" class="btn btn--link" data-newcode="${c.id}" data-fk="code-${c.id}">New code</button></div>
              <ul class="pd-staff" role="list">
                ${c.staff.map((s) => html`<li class="pd-staff__row">
                  ${ui.avatar({ firstName: s.name, initials: s.name.slice(0, 2) }, { size: 32 })}
                  <span class="pd-staff__name">${s.name} <span class="t-faint t-small">· ${s.role === "manager" ? "manager" : "counter"}</span></span>
                  ${s.role === "manager" ? (editingPin === s.id
                    ? html`<form class="pd-inline" data-pinform="${c.id}" data-staff="${s.id}"><label class="sr-only" for="pin-${s.id}">New PIN for ${s.name}</label><input class="input num pd-pininput" id="pin-${s.id}" name="pin" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="0000"><button type="submit" class="btn btn--secondary btn--compact">Save</button></form>`
                    : html`<span class="t-small t-faint num">PIN ••••</span><button type="button" class="btn btn--link" data-editpin="${s.id}" data-fk="pin-${s.id}">Change PIN</button>`) : ""}
                  <button type="button" class="btn btn--link" data-rmstaff="${c.id}" data-staff="${s.id}" aria-label="Remove ${s.name}" data-fk="rm-${s.id}">Remove</button>
                </li>`)}
              </ul>
              ${addingStaff === c.id ? html`<form class="pd-addstaff" data-addstaff="${c.id}" novalidate>
                  <label class="field"><span class="t-micro t-faint">Name</span><input class="input" name="name" autocomplete="off"></label>
                  <label class="field"><span class="t-micro t-faint">Role</span><span class="select"><select class="input" name="role"><option value="staff">Counter</option><option value="manager">Manager</option></select></span></label>
                  <label class="field"><span class="t-micro t-faint">PIN (managers)</span><input class="input num" name="pin" inputmode="numeric" maxlength="4" autocomplete="off"></label>
                  <p class="cv-error" data-add-err role="alert"></p>
                  <span class="pd-inline"><button type="submit" class="btn btn--primary btn--compact">Add</button><button type="button" class="btn btn--link" data-addstaff-cancel>Cancel</button></span>
                </form>`
                : html`<button type="button" class="btn btn--secondary btn--compact" data-addstaff-open="${c.id}" data-fk="add-${c.id}">Add staff</button>`}
            </li>`)}
          </ul>
          ${owner() ? html`<form class="pd-card pd-addbranch" data-addbranch novalidate>
            <h3 class="eyebrow">Add a branch</h3>
            <label class="field"><span class="t-micro t-faint">Branch name</span><input class="input" name="name" placeholder="MM Alam Road" autocomplete="off"></label>
            <label class="field"><span class="t-micro t-faint">Area</span><span class="select"><select class="input" name="area">${store.getState().areas.map((a) => html`<option value="${a.id}">${a.name}</option>`)}</select></span></label>
            <p class="cv-error" data-branch-err role="alert"></p>
            <button type="submit" class="btn btn--primary">Add branch</button>
            <p class="t-small t-faint">It appears in the member app’s Cafés and map, with its own counter setup code.</p>
          </form>` : ""}
        </section>`;
      }

      /* Events ------------------------------------------------------------ */
      const onClick = (e) => {
        const t = e.target;
        const tab = t.closest("[data-section]");
        if (tab) return showSection(tab.dataset.section);
        if (t.closest("[data-signout]")) { session = null; return renderSignIn(); }
        const pz = t.closest("[data-pause]");
        if (pz) { A.pauseMemberCups(pz.dataset.pause, 30); paint(); return ui.toast(`Member cups paused at ${branchShort(S.branch(pz.dataset.pause))} until ${fmt.time(S.branch(pz.dataset.pause).pausedUntil)}.`); }
        const rs = t.closest("[data-resume]");
        if (rs) { A.pauseMemberCups(rs.dataset.resume, 0); paint(); return ui.toast(`${branchShort(S.branch(rs.dataset.resume))} is taking member cups again.`); }
        const ls = t.closest("[data-limit-step]");
        if (ls) {
          const st = ls.closest("[data-limit]");
          const k = st.dataset.limit;
          const v = Math.max(Number(st.dataset.min), Math.min(Number(st.dataset.max), brand().rules[k] + Number(ls.dataset.limitStep) * Number(st.dataset.stepBy)));
          A.setBrandRules(session.brandId, { [k]: v }); paint(); return;
        }
        if (t.closest("[data-csv]")) {
          // BACKEND: GET /brands/:id/statement.csv?month=…&branch=…
          const m = S.brandMoney(session.brandId, scope());
          return ui.toast(`${slug(brand().name)}-${scope() ? slug(branchShort(S.branch(scope()))) + "-" : ""}${new Date().toISOString().slice(0, 7)}.csv: ${fmt.num(m.cups)} cups, ${fmt.rs(m.earned)}. Prototype: no file saved.`, { duration: 4200 });
        }
        if (t.closest("[data-pdf]")) return ui.toast("Statement for this month and the last three is ready. Prototype: no file saved.", { duration: 4200 });
        const nc = t.closest("[data-newcode]");
        if (nc) { const code = A.newSetupCode(nc.dataset.newcode); paint(); return ui.toast(`New setup code: ${code}. Counters already set up keep working.`); }
        const ep = t.closest("[data-editpin]");
        if (ep) { editingPin = ep.dataset.editpin; paint(); return $(`#pin-${editingPin}`, el)?.focus(); }
        const rm = t.closest("[data-rmstaff]");
        if (rm) { const name = S.staffMember(rm.dataset.staff)?.name; const res = A.removeStaff(rm.dataset.rmstaff, rm.dataset.staff); paint(); return ui.toast(res.ok ? `${name} removed.` : res.message, { iconName: res.ok ? "check" : "info" }); }
        const ao = t.closest("[data-addstaff-open]");
        if (ao) { addingStaff = ao.dataset.addstaffOpen; paint(); return $(`[data-addstaff="${addingStaff}"] input[name=name]`, el)?.focus(); }
        if (t.closest("[data-addstaff-cancel]")) { addingStaff = null; return paint(); }
        if (section === "members" && LCC.partnerMembers.click(t, membersFilter, paint)) return;
      };
      const onChange = (e) => {
        const t = e.target;
        if (t.matches("[data-branch-filter]")) { filter = t.value || null; membersFilter.branchId = null; paint(); return; }
        if (t.matches("[data-avail]")) {
          A.setAvailable(scopeIds(), t.dataset.avail, t.checked);
          const d = S.menuItem(session.brandId, t.dataset.avail);
          paint();
          return ui.toast(`${d.name} is ${t.checked ? "on" : "off"} today${scopeIds().length > 1 ? " at every branch shown" : ` at ${scopeLabel()}`}.`);
        }
        if (t.matches("[data-price]")) {
          const d = S.menuItem(session.brandId, t.dataset.price);
          const pend = S.pendingPrice(session.brandId, d.id) || {};
          const next = { hot: pend.hot ?? d.hot, iced: pend.iced ?? d.iced, [t.dataset.temp]: Math.max(50, Math.round(Number(t.value) || d[t.dataset.temp])) };
          A.setMenuPrice(session.brandId, d.id, next);
          paint();
          return ui.toast(`${d.name}: the new price applies from tomorrow.`);
        }
        if (t.matches("[data-econ]")) {
          const v = Number(t.value);
          if (!v) return paint();
          A.setEconomics(session.brandId, t.dataset.econ === "payoutShare" ? { payoutShare: v / 100 } : { coverUpTo: v });
          paint(); return ui.toast("Saved. Counters use it from the next cup.");
        }
        if (t.matches("[data-busy]")) { A.setBusyMode(t.dataset.busy, t.value); paint(); return ui.toast(`Busy level at ${branchShort(S.branch(t.dataset.busy))}: ${t.value === "auto" ? "Auto" : fmt.statusLabel(t.value)}.`); }
        if (t.matches("[data-hours]")) {
          const id = t.dataset.hours;
          const open = $(`[data-hours="${id}"][data-which="open"]`, el).value, close = $(`[data-hours="${id}"][data-which="close"]`, el).value;
          if (!open || !close) return;
          A.setCafeHours(id, open.replace(/^0(\d)/, "$1"), close === "00:00" ? "24:00" : close.replace(/^0(\d)/, "$1"));
          paint(); return ui.toast("Hours saved. Members see them in the app.");
        }
        if (section === "members" && LCC.partnerMembers.change(t, membersFilter, paint)) return;
      };
      const onSubmit = (e) => {
        const f = e.target;
        if (f.matches("[data-signin]")) {
          e.preventDefault();
          const who = S.pinRole(f.elements.brand.value, f.elements.pin.value);
          if (!who) return renderSignIn("That PIN doesn’t match this café’s owner or a manager.", f.elements.brand.value);
          session = { brandId: who.brandId, role: who.role, branchId: who.branchId || null };
          filter = null; section = "live";
          return renderAll();
        }
        e.preventDefault();
        if (f.matches("[data-rename]")) { A.renameBranch(f.dataset.rename, f.elements.name.value); paint(); return ui.toast("Name saved."); }
        if (f.matches("[data-pinform]")) {
          const res = A.setStaffPin(f.dataset.pinform, f.dataset.staff, f.elements.pin.value.trim());
          if (!res.ok) return ui.toast(res.message, { iconName: "info" });
          editingPin = null; paint(); return ui.toast("PIN changed.");
        }
        if (f.matches("[data-addstaff]")) {
          const res = A.addStaff(f.dataset.addstaff, { name: f.elements.name.value, role: f.elements.role.value, pin: f.elements.pin.value.trim() });
          if (!res.ok) { $("[data-add-err]", f).textContent = res.message; return; }
          addingStaff = null; paint(); return ui.toast(`${res.staff.name} added. They can tap their name on the counter now.`);
        }
        if (f.matches("[data-addbranch]")) {
          const res = A.addBranch(session.brandId, { name: f.elements.name.value, area: f.elements.area.value });
          if (!res.ok) { $("[data-branch-err]", f).textContent = res.message; return; }
          renderAll(); return ui.toast(`${res.branch.label} added. Its counter setup code is ${res.branch.setupCode}.`, { duration: 4200 });
        }
      };
      const onKeydown = (e) => {
        const tab = e.target.closest?.("[data-section]");
        if (!tab) return;
        const ids = SECTIONS.map((x) => x.id);
        let i = ids.indexOf(tab.dataset.section);
        const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
        if (e.key in keys) i = (i + keys[e.key] + ids.length) % ids.length;
        else if (e.key === "Home") i = 0; else if (e.key === "End") i = ids.length - 1; else return;
        e.preventDefault();
        showSection(ids[i]); $(`[data-section="${ids[i]}"]`, el).focus();
      };
      el.addEventListener("click", onClick);
      el.addEventListener("change", onChange);
      el.addEventListener("submit", onSubmit);
      el.addEventListener("keydown", onKeydown);

      // Live data: repaint the sections that read it
      const mineBranch = (id) => session && scopeIds().includes(id);
      const repaintIf = (cond, sections) => { if (cond && sections.includes(section)) paint(); else if (cond) paintReportsCount(); };
      const offs = [
        store.on("redeem", ({ entry }) => repaintIf(mineBranch(entry.cafeId), ["live", "money", "insights", "members"])),
        store.on("undo", ({ entry }) => repaintIf(mineBranch(entry.cafeId), ["live", "money", "insights", "members"])),
        store.on("report", ({ report }) => {
          if (!mineBranch(report.branchId)) return;
          repaintIf(true, ["live"]);
          const m = S.member(report.memberId);
          ui.toast(`“Not you” report from ${shortName(m)} at ${S.branchName(report.branchId)}.`, { iconName: "info", duration: 6000 });
        }),
        store.on("pickup", ({ order }) => repaintIf(mineBranch(order.cafeId), ["live", "money"])),
        store.on("menu", ({ branchId }) => repaintIf(mineBranch(branchId), ["menu"])),
        store.on("brand", ({ brandId }) => { if (session?.brandId === brandId && !el.contains(document.activeElement?.closest?.("form"))) paint(); }),
        store.on("cafe:status", ({ cafeId }) => repaintIf(mineBranch(cafeId), ["rules"])),
        store.on("cafe:pause", ({ cafeId }) => repaintIf(mineBranch(cafeId), ["rules"])),
        store.on("profile", () => repaintIf(!!session, ["members"])),
        store.on("tick", () => { if (session && section === "live") paint(); }),
        store.on("snapshot", () => { if (session) paint(); }),
      ];

      renderAll();
      return () => {
        LCC.partnerScope = null;
        offs.forEach((off) => off());
        el.removeEventListener("click", onClick);
        el.removeEventListener("change", onChange);
        el.removeEventListener("submit", onSubmit);
        el.removeEventListener("keydown", onKeydown);
      };
    },
  });
})();
