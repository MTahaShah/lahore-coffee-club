/* =====================================================================
   The Round — admin.js
   The LCC admin panel (#/admin), desktop-first. Demo sign-in: any four
   digits. Four sections, all reading the one ledger and the store:

     Cafés     each partner brand: its branches, staff, setup codes; the
               menu with prices, band, size, and the LCC
               switch (in plan / not in plan); reset the owner's and each
               branch's 6-digit executive PIN (a single café has one)
     Members   search by membership number or name (names repeat, so the
               number is always shown); a member's plans, cups left and
               full ledger; "Adjust cups" appends an `adjust` entry with a
               required reason. Entries are never edited or deleted
     Ledger    every entry at every café, filtered by brand or branch,
               member, type, staff and dates
     Payouts   per branch per month and per brand, with a total, from
               store.select.monthPayout (the same sums #/partner shows):
               pack cups at the branch's rate step for the month
               (PLAN_CONFIG.rateSteps), plus paid orders less the fee.
               "Mark paid" writes a payout record (actions.markPayoutPaid)
               that #/partner shows under Paid out

   Uses the dashboard's shell classes (partner.css) and admin.css.
   // BACKEND: an admin session (SSO), and GET/POST /admin/… for every
   //   section; the ledger stays insert-only, adjustments are inserts
   ===================================================================== */
(function () {
  "use strict";
  const LCC = window.LCC;
  const { store, fmt, ui } = LCC;
  const { html, raw, $, $$ } = ui;
  const S = store.select;

  /** "1 cup", "2 cups": a count with the right word. */
  const pl = (n, one, many = `${one}s`) => `${fmt.num(n)} ${n === 1 ? one : many}`;
  const A = store.actions;

  const SECTIONS = [
    { id: "cafes", label: "Cafés" },
    { id: "members", label: "Members" },
    { id: "ledger", label: "Ledger" },
    { id: "payouts", label: "Payouts" },
  ];
  const TYPE_LABEL = {
    purchase: "Purchase", redeem: "Redeem", hold: "Hold (pickup)", release: "Release", cancel: "Cancel", undo: "Undo",
    adjust: "Adjust", reward: "Complimentary", gift: "Gift", expire: "Expire", beans: "Beans",
  };
  const PAGE = 100;
  const ADMIN = { id: "lcc-admin", name: "The Round Admin" };

  let session = null; // { at }, in memory only

  const branchLabel = (c) => (S.branches(c.brandId).length > 1 ? `${S.brand(c.brandId).name} · ${c.branch || c.short || c.name}` : c.name);
  const placeOf = (e) => (e.cafeId ? (S.cafe(e.cafeId) ? branchLabel(S.cafe(e.cafeId)) : S.brand(e.cafeId)?.name || e.cafeId) : "–");
  const when = (ts) => `${new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${fmt.time(ts)}`;
  const monthLabel = (ts) => new Date(ts).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const monthStart = (n = 0) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(1); d.setMonth(d.getMonth() - n); return d.getTime(); };
  const dateInput = (s, end = false) => { if (!s) return end ? Infinity : 0; const [y, m, d] = s.split("-").map(Number); const t = new Date(y, m - 1, d).getTime(); return end ? t + 86400000 : t; };
  const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");
  const modsText = (e) => [...Object.entries(e.mods || {}).map(([k, v]) => (k === "milk" ? `${v} milk` : k === "ice" ? v : `${v} ${k}`)), ...(e.extras || []).map((x) => x.label)].join(", ");
  /** Every member, including the ones made in this session, by number. */
  const members = () => Object.values(store.getState().members).filter((m) => m.memberNo).sort((a, b) => a.memberNo - b.memberNo);

  /** The ledger table: same columns everywhere (member detail, Ledger). */
  function ledgerTable(rows, { showMember = true } = {}) {
    if (!rows.length) return html`<p class="t-small t-muted">No entries match.</p>`;
    return html`<div class="ad-scroll"><table class="ad-table">
      <thead><tr><th>When</th>${showMember ? html`<th>Member</th>` : ""}<th>Type</th><th>Café</th><th>Drink</th><th>Channel</th><th>Staff</th><th class="ad-num">Cups</th><th>Reference or reason</th></tr></thead>
      <tbody>${rows.map((e) => {
        const m = S.member(e.memberId);
        return html`<tr class="${e.undone ? "is-struck" : ""}">
          <td class="num">${when(e.at)}</td>
          ${showMember ? html`<td><button type="button" class="btn btn--link ad-member-link" data-open-member="${e.memberId}">${S.fullName(m)}</button> <span class="t-faint num">${fmt.lcc(e.memberNo ?? m?.memberNo)}</span></td>` : ""}
          <td><span class="badge">${TYPE_LABEL[e.type] || e.type}</span>${e.undone ? html` <span class="t-small t-faint">undone</span>` : ""}${e.uncollected ? html` <span class="t-small t-faint">not picked up</span>` : ""}</td>
          <td>${placeOf(e)}</td>
          <td>${e.drink || "–"}${modsText(e) ? html`<br><span class="t-small t-faint">${modsText(e)}</span>` : ""}</td>
          <td>${e.channel || "–"}</td>
          <td>${e.staffName || (e.adminName ? e.adminName : "–")}</td>
          <td class="ad-num num">${signed(e.cups)}</td>
          <td class="t-small">${e.reason ? html`<strong>${e.reason}</strong>` : ""}${e.ref ? html`<span class="num">${e.ref}</span>` : ""}${e.orderId && !e.ref ? html`<span class="t-faint num">${e.orderId}</span>` : ""}</td>
        </tr>`;
      })}</tbody></table></div>`;
  }

  LCC.router.register("admin", {
    title: "Admin",
    mount(el) {
      let section = "cafes";
      let brandId = S.partnerBrands()[0]?.id;
      let memberQuery = "";
      let memberId = null;
      let adjustErr = "";
      let shownPin = null;        // { key, pin }: a PIN just reset, shown once
      const lf = { brand: "", branch: "", member: "", type: "", staff: "", from: "", to: "", limit: PAGE }; // ledger filters
      let payMonth = monthStart(0);
      LCC.partnerScope = null; // admin sees every brand's messages

      /* Sign in --------------------------------------------------------- */
      function renderSignIn(err = "") {
        el.innerHTML = html`<div class="surface pd pd--signin">
          <form class="ct-setup" data-ad-signin novalidate>
            ${ui.logo("wordmark", { cls: "ct-setup__wordmark" })}
            <h1 class="ct-name t-title">The Round Admin</h1>
            <p class="t-body t-muted">For the team at The Round.</p>
            <div class="field" data-invalid="${!!err}">
              <label class="field__label" for="ad-pin">Admin PIN</label>
              <input class="input ct-setup__input num" id="ad-pin" name="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" aria-describedby="ad-pin-hint ad-pin-err" aria-invalid="${!!err}">
              <p class="field__hint" id="ad-pin-hint">Demo: any four digits.</p>
              <p class="field__error" id="ad-pin-err" role="alert">${err}</p>
            </div>
            <button type="submit" class="btn btn--primary btn--block btn--tall">Sign in</button>
          </form>
        </div>`;
        $("#ad-pin", el).focus();
      }

      /* Shell ------------------------------------------------------------ */
      function renderAll() {
        if (!session) return renderSignIn();
        el.innerHTML = html`<div class="surface pd ad">
          <header class="pd-head">
            <div class="ct-head__id">
              <span class="ad-mark">${ui.logo("mark")}</span>
              <div>
                <h1 class="ct-name t-title">Admin</h1>
                <p class="t-small t-muted">${S.partnerBrands().length} partners · ${S.cafes().length} branches · ${members().length} members · ${fmt.date(Date.now())}</p>
              </div>
            </div>
            <div class="pd-head__aside">
              ${LCC.sync ? LCC.sync.pill() : ""}
              <button type="button" class="btn btn--link" data-ad-signout>Sign out</button>
            </div>
          </header>
          <div class="cv-body pd-body">
            <nav class="cv-nav" aria-label="Admin">
              <div class="cv-tabs pd-tabs" role="tablist" aria-label="Sections">
                ${SECTIONS.map((x) => html`<button type="button" role="tab" class="cv-tab" id="ad-tab-${x.id}" data-ad-section="${x.id}" aria-controls="ad-panel"
                  aria-selected="${x.id === section}" tabindex="${x.id === section ? 0 : -1}"><span>${x.label}</span></button>`)}
              </div>
            </nav>
            <main class="cv-main" id="ad-panel" role="tabpanel" aria-labelledby="ad-tab-${section}" tabindex="-1" data-ad-panel></main>
          </div>
        </div>`;
        paint();
      }
      function showSection(id) {
        section = id;
        $$("[data-ad-section]", el).forEach((b) => { const on = b.dataset.adSection === id; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; });
        $("[data-ad-panel]", el).setAttribute("aria-labelledby", `ad-tab-${id}`);
        paint();
      }
      function paint() {
        const panel = $("[data-ad-panel]", el);
        if (!panel) return;
        const fk = document.activeElement?.closest?.("[data-ad-panel]") ? document.activeElement.dataset.fk : null;
        const pos = fk && document.activeElement.selectionStart;
        panel.innerHTML = ({ cafes: cafesHtml, members: membersHtml, ledger: ledgerHtml, payouts: payoutsHtml }[section])().s;
        if (fk) { const n = $(`[data-fk="${fk}"]`, panel); n?.focus({ preventScroll: true }); if (n && pos != null && n.setSelectionRange) try { n.setSelectionRange(pos, pos); } catch (_) {} }
      }
      const head = (title, line) => html`<div class="pd-section__head"><h2 class="pd-title">${title}</h2><p class="t-small t-muted">${line}</p></div>`;

      /* Cafés ------------------------------------------------------------ */
      function pinCell(key, label, resetAttrs) {
        const fresh = shownPin && shownPin.key === key;
        return html`<div class="ad-pin">
          <span class="t-micro t-faint">${label}</span>
          <span class="num ad-pin__value">${fresh ? shownPin.pin : "••••••"}</span>
          <button type="button" class="btn btn--link" ${raw(resetAttrs)}>Reset</button>
          ${fresh ? html`<span class="t-small t-faint">New PIN, shown once. Send it to the owner.</span>` : ""}
        </div>`;
      }
      function cafesHtml() {
        const b = S.brand(brandId);
        const list = S.branches(b.id);
        const single = list.length === 1;
        return html`<section class="pd-section">
          ${head("Cafés and branches", "Menus, bands and rates, staff, and executive PINs for every partner.")}
          <div class="pd-filters">
            <label class="pd-filter"><span class="t-micro t-faint">Partner</span>
              <span class="select"><select class="input" data-ad-brand data-fk="brand">${S.partnerBrands().map((x) => html`<option value="${x.id}" ${x.id === b.id ? raw("selected") : ""}>${x.name}${S.branches(x.id).length > 1 ? ` (${S.branches(x.id).length} branches)` : ""}</option>`)}</select></span></label>
          </div>
          <div class="pd-card">
            <h3 class="eyebrow">${b.name}${b.plans.length ? " · sells its own plans" : ""}</h3>
            ${pinCell(`owner:${b.id}`, single ? "Owner and branch executive PIN (one café, one PIN)" : "Brand owner executive PIN (every branch)", `data-ad-reset-owner="${b.id}"`)}
            <p class="t-small t-muted num">Limits: ${pl(b.rules.perMemberPerDay, "cup")} per member a day at one branch · ${b.rules.branchCupsPerDay} member cups a day per branch</p>
          </div>

          <h3 class="eyebrow">Branches and staff</h3>
          <div class="ad-branches">
            ${list.map((c) => html`<div class="pd-card">
              <p class="pd-branchrule__name">${branchLabel(c)}</p>
              <p class="t-small t-muted">${S.area(c.area)?.name || ""} · ${c.hours.label} · setup code <span class="num">${c.setupCode}</span></p>
              ${single ? "" : pinCell(`branch:${c.id}`, "Branch executive PIN (this branch only)", `data-ad-reset-branch="${c.id}"`)}
              <ul class="ad-staff" role="list">${c.staff.map((s) => html`<li><span>${s.name}</span><span class="t-small t-faint">${s.role === "manager" ? "manager" : "counter"} · PIN ••••</span></li>`)}</ul>
            </div>`)}
          </div>

          <h3 class="eyebrow">Menu</h3>
          <p class="t-small t-muted">The band comes from the menu price and sets what a pack covers. The café is paid its rate step for the month (${S.planConfig().rateSteps.map((x) => `${Math.round(x.rate * 100)}%`).join(", ")}) times the drink’s price, up to the pack’s band. “Not in plan” keeps a drink out of cup packs: members pay for it as usual.</p>
          <div class="ad-scroll"><table class="ad-table">
            <thead><tr><th>Drink</th><th>Section</th><th>Size</th><th class="ad-num">Hot</th><th class="ad-num">Iced</th><th>Band</th><th>In plans</th></tr></thead>
            <tbody>${b.menu.map((d) => {
              const band = S.itemBand(d);
              return html`<tr class="${d.inPlan === false ? "is-off" : ""}">
                <td>${d.name}</td><td class="t-small t-muted">${d.section || ""}</td><td class="t-small">${d.size || "–"}</td>
                <td class="ad-num num">${d.hot != null ? fmt.rs(d.hot) : "–"}</td><td class="ad-num num">${d.iced != null ? fmt.rs(d.iced) : "–"}</td>
                <td>${band ? band.label : "Above Reserve"}</td>
                <td><label class="ad-switch"><input type="checkbox" role="switch" class="switch" data-ad-inplan="${d.id}" data-fk="inplan-${d.id}" ${d.inPlan === false ? "" : raw("checked")} aria-label="${d.name} in member plans">
                  <span class="t-small">${d.inPlan === false ? "Not in plan" : "In plan"}</span></label></td>
              </tr>`;
            })}</tbody></table></div>
        </section>`;
      }

      /* Members ---------------------------------------------------------- */
      function searchMembers(q) {
        const t = q.trim().toLowerCase();
        if (!t) return [];
        const digits = t.replace(/^lcc[\s-]*/, "").replace(/^0+(?=\d)/, "");
        const byNo = /^\d+$/.test(digits);
        return members().filter((m) => (byNo ? String(m.memberNo).startsWith(digits) : S.fullName(m).toLowerCase().includes(t) || String(m.phone || "").replace(/\D/g, "").endsWith(t.replace(/\D/g, "") || "x")))
          .sort((a, b) => (byNo && String(a.memberNo) === digits ? -1 : byNo && String(b.memberNo) === digits ? 1 : a.memberNo - b.memberNo)).slice(0, 40);
      }
      function membersHtml() {
        const results = searchMembers(memberQuery);
        const m = memberId ? S.member(memberId) : null;
        return html`<section class="pd-section">
          ${head("Members", "Search by membership number or name. Names repeat, so the number is always shown.")}
          <div class="pd-filters">
            <label class="pd-filter ad-grow"><span class="t-micro t-faint">Number or name</span>
              <input class="input" type="search" data-ad-mq data-fk="mq" value="${memberQuery}" placeholder="42, No. 42 or Mumtaz" autocomplete="off"></label>
          </div>
          ${memberQuery ? html`<ul class="ad-results" role="list">${results.length ? results.map((x) => html`<li>
              <button type="button" class="ad-result" data-open-member="${x.id}" aria-current="${x.id === memberId}">
                ${ui.avatar(x, { size: 32 })}<span class="ad-result__name">${S.fullName(x)}</span>
                <span class="num ad-result__no">${fmt.lcc(x.memberNo)}</span>
                <span class="t-small t-faint">${S.plansOf(x.id).map((p) => p.name).join(" · ") || "No plan"}</span>
              </button></li>`) : html`<li class="t-small t-muted">No member matches.</li>`}</ul>` : ""}
          ${m ? memberDetailHtml(m) : html`<p class="t-small t-muted">Pick a member to see their plan, cups and full ledger.</p>`}
        </section>`;
      }
      function memberDetailHtml(m) {
        const plans = S.plansOf(m.id);
        const rows = LCC.ledger.ledgerFor({ memberNo: m.memberNo }).slice().reverse();
        return html`<div class="ad-member">
          <div class="ad-member__head">
            ${ui.avatar(m, { size: 56 })}
            <div>
              <h3 class="ad-member__name">${S.fullName(m)} <span class="num t-muted">${fmt.lcc(m.memberNo)}</span></h3>
              <p class="t-small t-muted num">${m.phone || "No phone"} · member since ${fmt.shortDate(m.memberSince || Date.now())}${m.invitedBy ? ` · invited by ${S.fullName(S.member(m.invitedBy))}` : ""}</p>
            </div>
          </div>
          <div class="pd-stats">
            ${plans.length ? plans.map((p) => html`<div class="pd-stat"><p class="t-micro t-faint">${p.name}${p.plan.paused ? " · paused" : ""}</p><p class="pd-stat__value num">${p.left} of ${p.total}</p><p class="t-small t-faint">cups left this cycle${p.renewsAt ? ` · renews ${fmt.shortDate(p.renewsAt)}` : ""}</p></div>`)
              : html`<div class="pd-stat"><p class="t-micro t-faint">Plan</p><p class="pd-stat__value">No plan yet</p></div>`}
            <div class="pd-stat"><p class="t-micro t-faint">Cups left, all plans</p><p class="pd-stat__value num">${LCC.ledger.cupsLeft(m.memberNo)}</p><p class="t-small t-faint">summed from the ledger</p></div>
          </div>
          ${m.plan ? html`<form class="pd-card ad-adjust" data-ad-adjust novalidate>
            <h4 class="eyebrow">Adjust cups</h4>
            <p class="t-small t-muted">Adds a new <strong>adjust</strong> entry to this cycle. Nothing is edited or deleted. Use a minus for cups taken off.</p>
            <div class="ad-adjust__fields">
              <label class="field"><span class="field__label">Cups</span><input class="input num" name="cups" type="number" step="1" min="-30" max="30" value="1" required></label>
              <label class="field ad-grow"><span class="field__label">Reason (required)</span><input class="input" name="reason" maxlength="140" placeholder="Machine down at Drip, cup not served" required></label>
              <button type="submit" class="btn btn--primary">Add entry</button>
            </div>
            <p class="cv-error" role="alert">${adjustErr}</p>
          </form>` : ""}
          <h4 class="eyebrow">Ledger · ${rows.length} entries, newest first</h4>
          ${ledgerTable(rows, { showMember: false })}
        </div>`;
      }

      /* Ledger ----------------------------------------------------------- */
      function filteredLedger() {
        const q = lf.member.trim().toLowerCase();
        const no = q.replace(/^lcc[\s-]*/, "").replace(/^0+(?=\d)/, "");
        const who = q ? (/^\d+$/.test(no) ? members().filter((m) => String(m.memberNo) === no) : members().filter((m) => S.fullName(m).toLowerCase().includes(q))).map((m) => m.id) : null;
        const brandIds = lf.brand ? S.branches(lf.brand).map((c) => c.id) : null;
        return LCC.ledger.ledgerFor({ all: true, from: dateInput(lf.from), to: dateInput(lf.to, true) })
          .filter((e) => (!lf.branch || e.cafeId === lf.branch)
            && (!brandIds || brandIds.includes(e.cafeId) || e.brandId === lf.brand || e.cafeId === lf.brand)
            && (!who || who.includes(e.memberId))
            && (!lf.type || e.type === lf.type)
            && (!lf.staff || e.staffId === lf.staff))
          .reverse();
      }
      function ledgerHtml() {
        const rows = filteredLedger();
        const shown = rows.slice(0, lf.limit);
        const branches = lf.brand ? S.branches(lf.brand) : S.cafes();
        const staff = (lf.branch ? [S.cafe(lf.branch)] : branches).flatMap((c) => c.staff.map((s) => ({ ...s, where: branchLabel(c) })));
        const sum = rows.reduce((n, e) => n + e.cups, 0);
        return html`<section class="pd-section">
          ${head("Ledger", "Every entry at every café. Append-only: corrections are new entries (undo, cancel, adjust).")}
          <div class="pd-filters ad-filters">
            <label class="pd-filter"><span class="t-micro t-faint">Partner</span><span class="select"><select class="input" data-lf="brand" data-fk="lf-brand"><option value="">All partners</option>${S.partnerBrands().map((b) => html`<option value="${b.id}" ${lf.brand === b.id ? raw("selected") : ""}>${b.name}</option>`)}</select></span></label>
            <label class="pd-filter"><span class="t-micro t-faint">Branch</span><span class="select"><select class="input" data-lf="branch" data-fk="lf-branch"><option value="">All branches</option>${branches.map((c) => html`<option value="${c.id}" ${lf.branch === c.id ? raw("selected") : ""}>${branchLabel(c)}</option>`)}</select></span></label>
            <label class="pd-filter"><span class="t-micro t-faint">Member</span><input class="input" type="search" data-lf="member" data-fk="lf-member" value="${lf.member}" placeholder="Number or name" autocomplete="off"></label>
            <label class="pd-filter"><span class="t-micro t-faint">Type</span><span class="select"><select class="input" data-lf="type" data-fk="lf-type"><option value="">All types</option>${Object.entries(TYPE_LABEL).map(([k, v]) => html`<option value="${k}" ${lf.type === k ? raw("selected") : ""}>${v}</option>`)}</select></span></label>
            <label class="pd-filter"><span class="t-micro t-faint">Staff</span><span class="select"><select class="input" data-lf="staff" data-fk="lf-staff"><option value="">Anyone</option>${staff.map((s) => html`<option value="${s.id}" ${lf.staff === s.id ? raw("selected") : ""}>${s.name} · ${s.where}</option>`)}</select></span></label>
            <label class="pd-filter"><span class="t-micro t-faint">From</span><input class="input num" type="date" data-lf="from" data-fk="lf-from" value="${lf.from}"></label>
            <label class="pd-filter"><span class="t-micro t-faint">To</span><input class="input num" type="date" data-lf="to" data-fk="lf-to" value="${lf.to}"></label>
            <button type="button" class="btn btn--link" data-lf-clear>Clear filters</button>
          </div>
          <p class="t-small t-muted num" aria-live="polite">${fmt.num(rows.length)} ${rows.length === 1 ? "entry" : "entries"} · net ${signed(sum)} cups${rows.length > shown.length ? ` · showing the newest ${shown.length}` : ""}</p>
          ${ledgerTable(shown)}
          ${rows.length > shown.length ? html`<button type="button" class="btn btn--secondary" data-lf-more>Show ${Math.min(PAGE, rows.length - shown.length)} more</button>` : ""}
        </section>`;
      }

      /* Payouts ---------------------------------------------------------- */
      function payoutsHtml() {
        const current = payMonth === monthStart(0);
        const brands = S.partnerBrands().map((b) => {
          const rows = S.branches(b.id).map((c) => {
            const rec = S.payoutRecord(c.id, payMonth);
            const live = S.monthPayout(c.id, payMonth);
            // Paid months show what was paid; open months what's owed so far
            return rec ? { cafe: c, rec, cups: rec.cups, cupEarned: null, paidNet: null, total: rec.amount } : { cafe: c, rec: null, cups: live.cups, cupEarned: live.cupEarned, paidNet: live.paid.net, total: live.earned };
          });
          return { b, rows, total: rows.reduce((n, r) => n + r.total, 0), cups: rows.reduce((n, r) => n + r.cups, 0), open: rows.filter((r) => !r.rec) };
        });
        const total = brands.reduce((n, x) => n + x.total, 0);
        const owed = brands.reduce((n, x) => n + x.open.reduce((k, r) => k + r.total, 0), 0);
        const cell = (v) => (v == null ? html`<span class="t-faint">–</span>` : fmt.rs(v));
        return html`<section class="pd-section">
          ${head("Payouts", "Per branch and per partner, from the ledger: each pack cup at the branch’s rate step for the month, times the drink’s price up to the pack’s band, plus paid orders less the 5% fee. Pass sales pay nothing. The same sums as each partner’s Money tab.")}
          <div class="pd-filters">
            <label class="pd-filter"><span class="t-micro t-faint">Month</span><span class="select"><select class="input" data-ad-month data-fk="month">${[0, 1, 2, 3].map((n) => html`<option value="${monthStart(n)}" ${monthStart(n) === payMonth ? raw("selected") : ""}>${monthLabel(monthStart(n))}${n === 0 ? " (so far)" : ""}</option>`)}</select></span></label>
          </div>
          <div class="pd-stats">
            <div class="pd-stat"><p class="t-micro t-faint">${current ? "This month so far" : monthLabel(payMonth)}</p><p class="pd-stat__value num">${fmt.rs(total)}</p><p class="t-small t-faint">all partners</p></div>
            <div class="pd-stat"><p class="t-micro t-faint">Not paid yet</p><p class="pd-stat__value num">${fmt.rs(owed)}</p><p class="t-small t-faint">${pl(brands.reduce((n, x) => n + x.open.length, 0), "branch", "branches")}</p></div>
          </div>
          <div class="ad-scroll"><table class="ad-table ad-payouts">
            <thead><tr><th>Branch</th><th class="ad-num">Cups</th><th class="ad-num">Rate step</th><th class="ad-num">Cup payout</th><th class="ad-num">Paid orders</th><th class="ad-num">Total</th><th>Status</th></tr></thead>
            ${brands.map((x) => html`<tbody>
              <tr class="ad-brandrow"><th colspan="7" scope="rowgroup">${x.b.name}</th></tr>
              ${x.rows.map((r) => html`<tr>
                <td>${S.branches(x.b.id).length > 1 ? r.cafe.branch || r.cafe.short : r.cafe.name}</td>
                <td class="ad-num num">${fmt.num(r.cups)}</td><td class="ad-num num">${Math.round(S.rateStepAt(r.cafe.id, payMonth).rate * 100)}%</td><td class="ad-num num">${cell(r.cupEarned)}</td><td class="ad-num num">${cell(r.paidNet)}</td>
                <td class="ad-num num"><strong>${fmt.rs(r.total)}</strong></td>
                <td>${r.rec ? html`<span class="t-small">Paid ${fmt.longDate(r.rec.paidAt)}${r.rec.ref ? html` · <span class="num">${r.rec.ref}</span>` : ""}</span>`
                  : html`<button type="button" class="btn btn--secondary btn--compact" data-ad-pay="${r.cafe.id}" data-fk="pay-${r.cafe.id}">Mark paid</button>`}</td>
              </tr>`)}
              ${x.rows.length > 1 ? html`<tr class="ad-subtotal"><td>${x.b.name} total</td><td class="ad-num num">${fmt.num(x.cups)}</td><td></td><td></td><td class="ad-num num"><strong>${fmt.rs(x.total)}</strong></td>
                <td>${x.open.length ? html`<button type="button" class="btn btn--secondary btn--compact" data-ad-paybrand="${x.b.id}" data-fk="paybrand-${x.b.id}">Mark ${x.open.length === x.rows.length ? "all" : `${x.open.length} more`} paid</button>` : html`<span class="t-small">All paid</span>`}</td></tr>` : ""}
            </tbody>`)}
            <tfoot><tr class="ad-total"><td>All partners</td><td class="ad-num num">${fmt.num(brands.reduce((n, x) => n + x.cups, 0))}</td><td></td><td></td><td class="ad-num num"><strong>${fmt.rs(total)}</strong></td><td></td></tr></tfoot>
          </table></div>
          ${current ? html`<p class="t-small t-muted">This month is still running: marking it paid records what’s owed so far. Cups after that belong to next month’s statement.</p>` : ""}
        </section>`;
      }

      /* Events ----------------------------------------------------------- */
      const onClick = (e) => {
        const t = e.target;
        const sec = t.closest("[data-ad-section]");
        if (sec) return showSection(sec.dataset.adSection);
        if (t.closest("[data-ad-signout]")) { session = null; return renderSignIn(); }
        const om = t.closest("[data-open-member]");
        if (om) { memberId = om.dataset.openMember; adjustErr = ""; if (section !== "members") return showSection("members"); return paint(); }
        const ro = t.closest("[data-ad-reset-owner]");
        if (ro) { const res = A.resetExecPin(ro.dataset.adResetOwner, null); if (res.ok) { shownPin = { key: `owner:${ro.dataset.adResetOwner}`, pin: res.pin }; paint(); ui.toast("New executive PIN set. The old one stops working now."); } return; }
        const rb = t.closest("[data-ad-reset-branch]");
        if (rb) { const c = S.cafe(rb.dataset.adResetBranch); const res = A.resetExecPin(c.brandId, c.id); if (res.ok) { shownPin = { key: `branch:${c.id}`, pin: res.pin }; paint(); ui.toast(`New executive PIN for ${branchLabel(c)}.`); } return; }
        if (t.closest("[data-lf-more]")) { lf.limit += PAGE; return paint(); }
        if (t.closest("[data-lf-clear]")) { Object.assign(lf, { brand: "", branch: "", member: "", type: "", staff: "", from: "", to: "", limit: PAGE }); return paint(); }
        const pay = t.closest("[data-ad-pay]");
        if (pay) { const c = S.cafe(pay.dataset.adPay); const res = A.markPayoutPaid(c.id, payMonth, ADMIN); paint(); return ui.toast(res.ok ? `${branchLabel(c)}: ${monthLabel(payMonth)} marked paid. The partner sees it under Paid out.` : res.message); }
        const pb = t.closest("[data-ad-paybrand]");
        if (pb) { const b = S.brand(pb.dataset.adPaybrand); const res = A.markPayoutPaid(S.branches(b.id).map((c) => c.id), payMonth, ADMIN); paint(); return ui.toast(res.ok ? `${b.name}: ${res.count} ${res.count === 1 ? "branch" : "branches"} marked paid for ${monthLabel(payMonth)}.` : res.message); }
      };
      const onInput = (e) => {
        const t = e.target;
        if (t.matches("[data-ad-mq]")) { memberQuery = t.value; return paint(); }
        if (t.matches('[data-lf="member"]')) { lf.member = t.value; lf.limit = PAGE; return paint(); }
      };
      const onChange = (e) => {
        const t = e.target;
        if (t.matches("[data-ad-brand]")) { brandId = t.value; shownPin = null; return paint(); }
        if (t.matches("[data-ad-inplan]")) {
          const res = A.setInPlan(brandId, t.dataset.adInplan, t.checked);
          paint();
          return res.ok && ui.toast(`${res.item.name} is ${res.item.inPlan ? "in member plans" : "not in plan"} now. Counters and the app follow.`);
        }
        if (t.matches("[data-ad-month]")) { payMonth = Number(t.value); return paint(); }
        const k = t.dataset?.lf;
        if (k && k !== "member") {
          lf[k] = t.value; lf.limit = PAGE;
          if (k === "brand") { lf.branch = ""; lf.staff = ""; }
          if (k === "branch") lf.staff = "";
          return paint();
        }
      };
      const onSubmit = (e) => {
        const f = e.target;
        if (f.matches("[data-ad-signin]")) {
          e.preventDefault();
          if (!/^\d{4}$/.test(f.elements.pin.value.trim())) return renderSignIn("Four digits, please.");
          session = { at: Date.now() };
          return renderAll();
        }
        if (f.matches("[data-ad-adjust]")) {
          e.preventDefault();
          const m = S.member(memberId);
          const res = LCC.ledger.adjust({ memberNo: m.memberNo, cups: f.elements.cups.value, reason: f.elements.reason.value, admin: ADMIN });
          adjustErr = res.ok ? "" : res.message;
          paint();
          if (res.ok) ui.toast(`${signed(res.entry.cups)} ${Math.abs(res.entry.cups) === 1 ? "cup" : "cups"} for ${m.firstName} (${fmt.lcc(m.memberNo)}). Logged with your reason.`);
        }
      };
      const onKeydown = (e) => {
        const tab = e.target.closest?.("[data-ad-section]");
        if (!tab) return;
        const ids = SECTIONS.map((x) => x.id);
        let i = ids.indexOf(tab.dataset.adSection);
        const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
        if (!(e.key in keys)) return;
        e.preventDefault();
        i = (i + keys[e.key] + ids.length) % ids.length;
        showSection(ids[i]); $(`[data-ad-section="${ids[i]}"]`, el).focus();
      };
      el.addEventListener("click", onClick);
      el.addEventListener("input", onInput);
      el.addEventListener("change", onChange);
      el.addEventListener("submit", onSubmit);
      el.addEventListener("keydown", onKeydown);

      // Live: cups served at any counter show up here as they happen
      const busy = () => el.contains(document.activeElement) && document.activeElement.matches("input[type=search], input[name=reason], input[name=cups]");
      const repaint = (sections) => { if (session && sections.includes(section) && !busy()) paint(); };
      const offs = [
        store.on("ledger", () => repaint(["members", "ledger", "payouts"])),
        store.on("undo", () => repaint(["members", "ledger", "payouts"])),
        store.on("pickup", () => repaint(["payouts"])),
        store.on("brand", () => repaint(["cafes", "payouts"])),
        store.on("snapshot", () => repaint(["members", "ledger", "payouts", "cafes"])),
      ];

      renderAll();
      return () => {
        offs.forEach((off) => off());
        el.removeEventListener("click", onClick);
        el.removeEventListener("input", onInput);
        el.removeEventListener("change", onChange);
        el.removeEventListener("submit", onSubmit);
        el.removeEventListener("keydown", onKeydown);
      };
    },
  });
})();
