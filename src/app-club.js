/* =====================================================================
   Lahore Coffee Club — app-club.js
   Member app: the Club tab (#/app/club) and gifting (#/app/gift).

   Everything on the Club tab is earned by use and read from the ledger
   through store.select.club(): status, passport, badges and perks. Beans
   (points) sit at the top, from store.select.beans(); invitations from
   store.select.invitations(). The member card is shared with onboarding
   (LCC.memberCard).
   ===================================================================== */
(function () {
  "use strict";
  const LCC = window.LCC;
  const { store, fmt, ui } = LCC;
  const { html, raw, $, $$, icon } = ui;
  const S = store.select;
  const A = store.actions;
  const REG = (LCC.appScreens = LCC.appScreens || {});
  const rules = () => store.getState().rules;
  const LIVE_URL = () => (LCC.sync ? LCC.sync.liveUrl : "https://lcc-omega.vercel.app/");

  const digits = (s) => String(s).replace(/\D/g, "");
  const formatPhone = (s) => { const d = digits(s).slice(0, 11); return d.length > 4 ? `${d.slice(0, 4)} ${d.slice(4)}` : d; };
  /** 0300 1234567 -> 923001234567, for wa.me links. */
  const waNumber = (s) => `92${digits(s).replace(/^0/, "")}`;
  const waLink = (text, phone) => `https://wa.me/${phone ? waNumber(phone) : ""}?text=${encodeURIComponent(text)}`;
  const shortName = (c) => c.name.replace(/ Coffee Co\.$| Roastery$/, "");
  const fullName = (m) => [m.firstName, m.lastName].filter(Boolean).join(" ");

  /* -------------------------------------------------------------------
     Member card (Club tab, café-free; onboarding issues it)
     ------------------------------------------------------------------- */
  // A seal with its words set on a circle. Thin lines, no fill.
  function seal() {
    return html`<svg class="mcard__seal" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs><path id="seal-ring" d="M32 32 m-23 0 a23 23 0 1 1 46 0 a23 23 0 1 1 -46 0"/></defs>
      <circle cx="32" cy="32" r="30.5"/>
      <circle cx="32" cy="32" r="16"/>
      <text><textPath href="#seal-ring" startOffset="0" textLength="140" lengthAdjust="spacing">FOUNDING MEMBER · LAHORE · </textPath></text>
      <path d="M25.5 29h12v3.6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V29zM37.5 30.5h1.2a2.1 2.1 0 0 1 0 4.2h-1.4"/>
    </svg>`;
  }

  function memberCard(memberId, { issuing = false } = {}) {
    const c = S.club(memberId);
    const m = c.member;
    const label = `Lahore Coffee Club member card. ${c.number}, ${fullName(m)}, member since ${fmt.monthYear(c.since)}, ${c.level.name}${c.founding ? ", Founding Member" : ""}`;
    return html`<div class="mcard${c.founding ? " mcard--founding" : ""}${issuing ? " is-issuing" : ""}" role="img" aria-label="${label}">
      <svg class="mcard__rings" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
        <circle cx="200" cy="200" r="60"/><circle cx="200" cy="200" r="92"/><circle cx="200" cy="200" r="124"/><circle cx="200" cy="200" r="156"/>
      </svg>
      <div class="mcard__top">
        <span class="mcard__brand">${ui.logo("wordmark", { label: null })}</span>
        ${c.founding ? seal() : ""}
      </div>
      <p class="mcard__no"><span class="mcard__no-label">No.</span> <span class="num" data-card-no>${String(c.memberNo).padStart(4, "0")}</span></p>
      <div class="mcard__foot">
        <div class="mcard__who">
          <span class="mcard__name">${fullName(m)}</span>
          <span class="mcard__meta">Since ${fmt.monthYear(c.since)}</span>
        </div>
        <div class="mcard__status">
          ${c.founding && c.level.id !== "member" ? html`<span class="mcard__meta">Founding Member</span>` : ""}
          <span class="mcard__level${c.founding && c.level.id === "member" ? " mcard__level--long" : ""}">${c.founding && c.level.id === "member" ? "Founding Member" : c.level.name}</span>
        </div>
      </div>
    </div>`;
  }
  LCC.memberCard = memberCard;

  /* -------------------------------------------------------------------
     Badge marks: 24px grid, 1.5px stroke, like the icon set
     ------------------------------------------------------------------- */
  const MARKS = {
    "first-cup": '<path d="M6 10h11v4.5a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 6 14.5V10zM17 11.5h1.2a2.3 2.3 0 0 1 0 4.6H17M9.5 4.5c0 1.2 1 1.6 1 3M13 4.5c0 1.2 1 1.6 1 3"/>',
    founding: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5" stroke-dasharray="1.6 1.9"/>',
    explorer: '<circle cx="12" cy="12" r="8"/><path d="M14.9 9.1l-1.7 4.1-4.1 1.7 1.7-4.1z"/>',
    "all-lahore": '<path d="M12 3.5v1.5M10.6 5h2.8l-.4 3.5h-2zM10 8.5h4l1 11H9zM6 19.5h12M11 13.5h2"/>',
    morning: '<path d="M4 17h16M7.5 17a4.5 4.5 0 0 1 9 0M12 8.5v2M6.6 11.6l1.3 1.1M17.4 11.6l-1.3 1.1M8.5 20h7"/>',
    gulberg: '<path d="M12 20s5.5-5 5.5-9.5a5.5 5.5 0 0 0-11 0C6.5 15 12 20 12 20z"/><path d="M12 8v5M10 10.5h4"/>',
    dha: '<path d="M12 20s5.5-5 5.5-9.5a5.5 5.5 0 0 0-11 0C6.5 15 12 20 12 20z"/><rect x="10" y="8.5" width="4" height="4" rx=".75"/>',
    familiar: '<circle cx="12" cy="12" r="8.5"/><path d="M8.25 10h6.5v2.25a3 3 0 0 1-3 3h-.5a3 3 0 0 1-3-3V10zM14.75 10.75h.6a1.35 1.35 0 0 1 0 2.7h-.6"/>',
    ticket: '<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4V7.5z"/><path d="M14.5 6.5v11" stroke-dasharray="1.5 2.25"/>',
    "first-light": '<path d="M3.5 16.5h17M7.5 19.5h9M8 16.5a4 4 0 0 1 8 0M12 7v2.5M6.3 9.8l1.5 1.3M17.7 9.8l-1.5 1.3"/>',
  };
  const mark = (id) => raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${MARKS[id] || ""}</svg>`);

  const bar = (have, goal, label) => html`<div class="pbar" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${Math.min(have, goal)}"><span style="--p:${Math.min(1, have / goal).toFixed(3)}"></span></div>`;

  /* -------------------------------------------------------------------
     Coffee passport: a closed book that opens to an ID page and stamp
     pages (4 stamps a page). Stamps come from select.club().passport.
     ------------------------------------------------------------------- */
  const book = { open: false, page: 0 }; // survives repaints and tab switches
  const STAMPS_PER_PAGE = 4;
  const TILT = [-6, 4, -3, 7, -5, 3, -7, 5];
  const FLIP_MS = 360;
  const stampDate = (ts) => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }).toUpperCase();

  function bookPages(c) {
    const stamps = c.passport.stamps;
    const pages = [];
    for (let i = 0; i < stamps.length; i += STAMPS_PER_PAGE) pages.push(stamps.slice(i, i + STAMPS_PER_PAGE).map((s, j) => ({ ...s, n: i + j })));
    return pages; // the ID page comes first, so page numbers are index + 2
  }

  function idPageHtml(c) {
    const m = c.member;
    const plan = S.memberPlan(m);
    return html`
      <div class="pbook__head"><span>Coffee passport</span><span class="num">1</span></div>
      <div class="pid">
        <span class="pid__photo" aria-hidden="true">${m.initials || (m.firstName || "?")[0]}</span>
        <dl class="pid__fields">
          <div><dt>Name</dt><dd>${fullName(m)}</dd></div>
          <div><dt>Member since</dt><dd>${fmt.monthYear(c.since)}</dd></div>
          <div><dt>Plan</dt><dd>${plan.type === "explorer" ? `Explorer · ${plan.name}` : plan.name}</dd></div>
        </dl>
      </div>
      <div class="pid__no"><span class="pid__label">Member no.</span><span class="pid__digits num">${String(c.memberNo ?? 0).padStart(4, "0")}</span></div>
      <div class="pid__sign" aria-hidden="true"><span class="pid__line"></span><span class="pid__label">Holder’s signature</span></div>`;
  }

  function stampPageHtml(stamps, pageNo, total) {
    const first = stamps[0].n + 1, last = stamps[stamps.length - 1].n + 1;
    return html`
      <div class="pbook__head"><span>Stamps · cafés ${first}–${last} of ${total}</span><span class="num">${pageNo}</span></div>
      <ul class="pstamps" role="list">
        ${stamps.map((s) => s.visited
          ? html`<li class="pstamp pstamp--${s.n % 3 === 1 ? "rect" : "round"}" style="--tilt:${TILT[s.n % TILT.length]}deg">
              <span class="pstamp__ink">
                <span class="pstamp__name">${shortName(s.cafe)}</span>
                <span class="pstamp__area">${S.area(s.cafe.area).name}</span>
                <span class="pstamp__date num">${stampDate(s.firstAt)}</span>
              </span>
              <span class="sr-only">, first cup ${fmt.longDate(s.firstAt)}</span>
            </li>`
          : html`<li class="pstamp is-empty">
              <span class="pstamp__ink">
                <span class="pstamp__name">${shortName(s.cafe)}</span>
                <span class="pstamp__date">Not yet</span>
              </span>
              <span class="sr-only">, not visited yet</span>
            </li>`)}
      </ul>`;
  }

  function passportBookHtml(c) {
    const p = c.passport;
    const pages = [idPageHtml(c), ...bookPages(c).map((st, i) => stampPageHtml(st, i + 2, p.total))];
    book.page = Math.min(book.page, pages.length - 1);
    const rewardLine = p.nextReward
      ? `A complimentary cup at ${p.nextReward === p.total ? `all ${p.total}` : p.nextReward} cafés. ${p.nextReward - p.count === 1 ? "One more to go." : `${p.nextReward - p.count} more to go.`}`
      : `Every partner café, visited. Both complimentary cups are yours.`;
    return html`
      <div class="pbook-stage">
        <div class="pbook${book.open ? " is-open" : ""}" data-pbook data-pages-total="${pages.length}">
          ${pages.map((pg, i) => html`<section class="pbook__page${i === book.page ? " is-current" : ""}" data-page="${i}" tabindex="-1"
              aria-label="Passport page ${i + 1} of ${pages.length}" ${!book.open || i !== book.page ? raw("hidden") : ""}>${pg}</section>`)}
          <button type="button" class="pbook__cover theme-dark" data-pbook-open aria-label="Open your coffee passport" ${book.open ? raw("hidden") : ""}>
            <span class="pbook__frame" aria-hidden="true"></span>
            <span class="pbook__foil pbook__foil--club">Lahore Coffee Club</span>
            <span class="pbook__crest">${ui.logo("ring", { label: null })}</span>
            <span class="pbook__foil pbook__foil--title">Coffee Passport</span>
            <span class="pbook__holder">${fullName(c.member)}</span>
          </button>
        </div>
      </div>
      <div class="pbook__controls" data-pbook-controls ${book.open ? "" : raw("hidden")}>
        <button type="button" class="btn btn--secondary btn--compact" data-pbook-turn="-1" aria-disabled="${book.page === 0}">${icon("arrowLeft", { size: 18 })}Previous</button>
        <p class="t-small t-muted num" data-pbook-at aria-live="polite">Page ${book.page + 1} of ${pages.length}</p>
        <button type="button" class="btn btn--secondary btn--compact" data-pbook-turn="1" aria-disabled="${book.page === pages.length - 1}">Next${icon("chevronRight", { size: 18 })}</button>
      </div>
      <div class="passport__foot">
        <div class="passport__head">
          <p class="t-h3 num"><span class="passport__count">${p.count}</span> of ${p.total} cafés</p>
          <p class="t-small t-muted">${rewardLine}</p>
        </div>
        <button type="button" class="btn btn--link" data-pbook-close ${book.open ? "" : raw("hidden")}>Close passport</button>
      </div>`;
  }

  /** Book behaviour on one rendered passport (open, turn, close, swipe). */
  function bindBook(root) {
    let busy = false;
    const $book = () => $("[data-pbook]", root);
    const total = () => Number($book().dataset.pagesTotal);
    const pageEl = (i) => $(`[data-page="${i}"]`, root);
    const still = () => ui.reducedMotion();
    // Wait for a transition, with a timer in case transitionend never fires
    const after = (el, ms = FLIP_MS) => new Promise((done) => {
      let t = null;
      const end = (e) => { if (e && e.target !== el) return; el.removeEventListener("transitionend", end); clearTimeout(t); done(); };
      el.addEventListener("transitionend", end);
      t = setTimeout(end, ms + 120);
    });
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    function paintControls() {
      const n = total();
      $("[data-pbook-at]", root).textContent = `Page ${book.page + 1} of ${n}`;
      $('[data-pbook-turn="-1"]', root).setAttribute("aria-disabled", String(book.page === 0));
      $('[data-pbook-turn="1"]', root).setAttribute("aria-disabled", String(book.page === n - 1));
    }

    async function open() {
      if (busy || book.open) return;
      busy = true;
      const cover = $("[data-pbook-open]", root);
      const first = pageEl(book.page);
      first.hidden = false;
      cover.classList.add(still() ? "is-fading" : "is-flipping");
      await frame();
      cover.classList.add("is-away");
      await after(cover);
      cover.hidden = true;
      cover.classList.remove("is-fading", "is-flipping", "is-away");
      book.open = true;
      $book().classList.add("is-open");
      $("[data-pbook-controls]", root).hidden = false;
      $("[data-pbook-close]", root).hidden = false;
      paintControls();
      first.focus({ preventScroll: true });
      busy = false;
    }

    async function close() {
      if (busy || !book.open) return;
      busy = true;
      const cover = $("[data-pbook-open]", root);
      cover.classList.add(still() ? "is-fading" : "is-flipping", "is-away");
      cover.hidden = false;
      await frame();
      cover.classList.remove("is-away");
      await after(cover);
      cover.classList.remove("is-fading", "is-flipping");
      pageEl(book.page).hidden = true;
      book.open = false;
      $book().classList.remove("is-open");
      $("[data-pbook-controls]", root).hidden = true;
      $("[data-pbook-close]", root).hidden = true;
      cover.focus({ preventScroll: true });
      busy = false;
    }

    // Next: the current page turns away over the next one, hinged on the left.
    // Previous: the earlier page turns back in on top. Reduced motion: crossfade.
    async function turn(dir) {
      if (busy || !book.open) return;
      const from = book.page, to = from + dir;
      if (to < 0 || to >= total()) return;
      busy = true;
      const a = pageEl(from), b = pageEl(to);
      const moving = dir > 0 && !still() ? a : b;
      b.hidden = false;
      moving.classList.add("is-top", still() ? "is-fading" : "is-flipping");
      if (moving === b) b.classList.add("is-away");
      await frame();
      moving.classList.toggle("is-away", moving === a);
      await after(moving);
      a.hidden = true;
      [a, b].forEach((el) => el.classList.remove("is-top", "is-fading", "is-flipping", "is-away", "is-current"));
      b.classList.add("is-current");
      book.page = to;
      paintControls();
      busy = false;
    }

    // Swipe left for the next page, right for the previous one
    let x0 = null, y0 = 0;
    const onDown = (e) => { if (book.open) { x0 = e.clientX; y0 = e.clientY; } };
    const onUp = (e) => {
      if (x0 == null) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) turn(dx < 0 ? 1 : -1);
    };
    const onClick = (e) => {
      if (e.target.closest("[data-pbook-open]")) { open(); return; }
      if (e.target.closest("[data-pbook-close]")) { close(); return; }
      const t = e.target.closest("[data-pbook-turn]");
      if (t && t.getAttribute("aria-disabled") !== "true") turn(Number(t.dataset.pbookTurn));
    };
    const onKey = (e) => {
      if (!book.open || !e.target.closest("[data-pbook], [data-pbook-controls]")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); turn(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); turn(-1); }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
    };
    root.addEventListener("pointerdown", onDown);
    root.addEventListener("pointerup", onUp);
    root.addEventListener("pointercancel", () => { x0 = null; });
    root.addEventListener("click", onClick);
    root.addEventListener("keydown", onKey);
  }

  /* -------------------------------------------------------------------
     Perks: a row that fans out a stack of ticket stubs (your perks only)
     ------------------------------------------------------------------- */
  const stack = { open: false, front: null };
  const TICKET_TILT = [-2.5, 2, -1.5, 3, -2, 1.5];
  const FAN_MS = 280;
  const PERK_ORDER = ["founding", "local", "connoisseur"];
  const STATE_WORD = { ready: "Perk", used: "Used", expired: "Expired" };

  /* -------------------------------------------------------------------
     Club tab
     ------------------------------------------------------------------- */
  REG.club = (ctx) => {
    const { view, el } = ctx;
    let badgeSheet = null;
    let beansSheet = null;
    let confirming = null; // reward id waiting for a second tap
    let confirmTimer = null;

    /* Beans: balance and the way to the next complimentary drink */
    function beansHtml() {
      const b = S.beans();
      return html`<button type="button" class="beans" data-open-beans aria-haspopup="dialog" aria-controls="beans-sheet" aria-label="${b.balance} Beans. ${b.line}. Rewards and history">
        <span class="beans__row">
          <span class="beans__icon" aria-hidden="true">${icon("bean", { size: 24 })}</span>
          <span class="beans__num num">${fmt.num(b.balance)}</span>
          <span class="beans__word">Beans</span>
          <span class="beans__go" aria-hidden="true">${icon("chevronRight", { size: 20 })}</span>
        </span>
        <span class="beans__bar" aria-hidden="true"><span style="--p:${b.progress.toFixed(3)}"></span></span>
        <span class="t-small t-muted num">${b.line}</span>
      </button>`;
    }

    function beansSheetHtml() {
      const b = S.beans();
      const R = b.rules;
      return html`
        <div class="sheet__scrim" data-sheet-close></div>
        <div class="sheet__panel">
          <div class="sheet__handle" aria-hidden="true"></div>
          <div class="sheet__body beans-sheet">
            <div class="badges-sheet__bar">
              <h2 class="t-h3" id="beans-title">Beans</h2>
              <button type="button" class="icon-btn" data-sheet-close aria-label="Close">${icon("close")}</button>
            </div>
            <p class="beans-sheet__bal"><span aria-hidden="true">${icon("bean", { size: 28 })}</span><span class="num">${fmt.num(b.balance)}</span> Beans</p>
            <p class="t-small t-muted num">${R.perDrink} Beans for every drink, at the counter or collected for pickup. ${R.referral} each when a friend joins with your code and buys a plan or pays for an order. Hosting a table adds ${R.hostPerFriend} for every friend who joins it.</p>

            <section aria-labelledby="beans-rw-h">
              <h3 class="eyebrow" id="beans-rw-h">Rewards</h3>
              <ol class="beans-ladder" role="list">
                ${b.rewards.map((r) => {
                  const kept = r.gathering?.going;
                  const where = r.gathering ? `${fmt.date(r.gathering.at)}, ${fmt.time(r.gathering.at)} at ${r.gathering.cafe.name}.` : "";
                  return html`<li class="beans-step${r.reached ? " is-reached" : ""}">
                    <span class="beans-step__cost num">${r.beans}</span>
                    <span class="beans-step__main">
                      <span class="row__title">${r.title}</span>
                      <span class="row__meta">${r.line}${where ? ` ${where}` : ""}</span>
                    </span>
                    ${kept ? html`<span class="badge">Seat kept</span>`
                      : r.reached ? html`<button type="button" class="btn ${confirming === r.id ? "btn--primary" : "btn--secondary"} btn--compact num" data-redeem-beans="${r.id}">${confirming === r.id ? `Use ${r.beans} Beans` : "Redeem"}</button>`
                      : html`<span class="t-small t-faint num">${r.beans - b.balance} to go</span>`}
                  </li>`;
                })}
              </ol>
            </section>

            <section aria-labelledby="beans-h-h">
              <h3 class="eyebrow" id="beans-h-h">History</h3>
              ${b.history.length ? html`<ul role="list">${b.history.slice(0, 30).map((h) => html`<li class="row">
                  <span class="row__main"><span class="row__title">${h.title}</span><span class="row__meta">${h.meta} · ${fmt.shortDate(h.at)}</span></span>
                  <span class="row__trail num">${h.beans > 0 ? "+" : "−"}${Math.abs(h.beans)}</span>
                </li>`)}</ul>` : html`<p class="t-small t-muted">Your first Beans come with your first cup.</p>`}
            </section>
          </div>
        </div>`;
    }
    function paintBeansSheet() {
      if (!beansSheet || beansSheet.dataset.open !== "true") return;
      const body = $(".sheet__body", beansSheet), top = body.scrollTop;
      const focusId = document.activeElement?.dataset?.redeemBeans;
      beansSheet.innerHTML = beansSheetHtml().s;
      $(".sheet__body", beansSheet).scrollTop = top;
      if (focusId) $(`[data-redeem-beans="${focusId}"]`, beansSheet)?.focus({ preventScroll: true });
    }
    function onBeansClick(e) {
      const btn = e.target.closest("[data-redeem-beans]");
      if (!btn) return;
      const id = btn.dataset.redeemBeans;
      // Two taps: Redeem, then "Use 150 Beans"
      if (confirming !== id) {
        confirming = id;
        clearTimeout(confirmTimer);
        confirmTimer = setTimeout(() => { confirming = null; paintBeansSheet(); }, 5000);
        return paintBeansSheet();
      }
      confirming = null; clearTimeout(confirmTimer);
      const res = A.redeemBeans(id);
      if (!res.ok) { ctx.toast(res.message, { iconName: "info" }); return paintBeansSheet(); }
      const r = res.reward;
      ctx.toast(r.gathering ? `Your seat is kept. ${fmt.longDate(r.gathering.at)}, ${fmt.time(r.gathering.at)}.` : `${r.title} added to your cups.`, { iconName: r.gathering ? "calendar" : "bean", duration: 4200 });
      paintBeansSheet();
    }

    stack.open = false;
    stack.front = null;

    function statusHtml(c) {
      const levels = c.levels;
      const at = levels.findIndex((l) => l.id === c.level.id);
      return html`
        <ol class="ladder" role="list" aria-label="Status levels">
          ${levels.map((l, i) => html`<li class="ladder__step${i <= at ? " is-reached" : ""}${i === at ? " is-current" : ""}" ${i === at ? raw('aria-current="step"') : ""}>
            <span class="ladder__dot" aria-hidden="true"></span>
            <span class="ladder__name">${l.name}</span>
            <span class="ladder__line">${l.line}</span>
          </li>`)}
        </ol>
        ${c.next
          ? html`<div class="club-next">
              <p class="t-small"><strong>${c.next.name}</strong> <span class="t-muted">${c.next.line}</span></p>
              ${c.next.needs.map((n) => html`<div class="club-next__row">
                ${bar(n.have, n.goal, `${n.label} towards ${c.next.name}`)}
                <span class="t-small t-muted num">${n.label}</span>
              </div>`)}
            </div>`
          : html`<p class="t-small t-muted">The top of the club. Every perk is yours.</p>`}`;
    }

    function badgesRowHtml(c) {
      const earned = c.badges.filter((b) => b.earned).length;
      return html`<button type="button" class="row badges-row" data-open-badges aria-haspopup="dialog" aria-controls="badges-sheet">
        <span class="badge-mark is-earned">${icon("award", { size: 22 })}</span>
        <span class="row__main"><span class="row__title">Badges · ${earned} of ${c.badges.length}</span></span>
        <span class="row__trail" aria-hidden="true">${icon("chevronRight", { size: 20 })}</span>
      </button>`;
    }

    function badgeSheetHtml() {
      const c = S.club();
      const earned = c.badges.filter((b) => b.earned).sort((a, b) => (b.earnedAt || 0) - (a.earnedAt || 0));
      const todo = c.badges.filter((b) => !b.earned);
      // Progress only where counting means something (not a one-off like Founding or a first cup)
      const progress = (b) => (b.goal > 1 && b.metric !== "founding" ? ` · ${b.have} of ${b.goal}` : "");
      return html`
        <div class="sheet__scrim" data-sheet-close></div>
        <div class="sheet__panel">
          <div class="sheet__handle" aria-hidden="true"></div>
          <div class="sheet__body badges-sheet">
            <div class="badges-sheet__bar">
              <h2 class="t-h3" id="badges-title">Badges</h2>
              <button type="button" class="icon-btn" data-sheet-close aria-label="Close">${icon("close")}</button>
            </div>
            <section aria-labelledby="badges-earned-h">
              <h3 class="eyebrow" id="badges-earned-h">Earned · ${earned.length}</h3>
              ${earned.length
                ? html`<ul role="list">${earned.map((b) => html`<li class="row badge-row is-earned">
                    <span class="badge-mark">${mark(b.id)}</span>
                    <span class="row__main"><span class="row__title">${b.name}</span><span class="row__meta num">${b.earnedAt ? `Earned ${fmt.longDate(b.earnedAt)} ${new Date(b.earnedAt).getFullYear()}` : "Earned"}</span></span>
                  </li>`)}</ul>`
                : html`<p class="t-small t-muted">None yet. Your first cup earns the first one.</p>`}
            </section>
            <section aria-labelledby="badges-todo-h">
              <h3 class="eyebrow" id="badges-todo-h">Still to earn · ${todo.length}</h3>
              ${todo.length
                ? html`<ul role="list">${todo.map((b) => html`<li class="row badge-row">
                    <span class="badge-mark">${mark(b.id)}</span>
                    <span class="row__main"><span class="row__title">${b.name}</span><span class="row__meta num">${b.how.replace(/\.$/, "")}${progress(b)}</span></span>
                  </li>`)}</ul>`
                : html`<p class="t-small t-muted">Every badge, earned.</p>`}
            </section>
          </div>
        </div>`;
    }

    /** Your perks: ready ones first, then used or expired. Locked perks stay off the stack. */
    function myPerks(c) {
      const rank = (p) => (p.state === "ready" ? 0 : 1);
      return c.perks.filter((p) => p.unlocked).sort((a, b) => rank(a) - rank(b) || PERK_ORDER.indexOf(a.for) - PERK_ORDER.indexOf(b.for));
    }

    function ticketHtml(p, i) {
      const when = p.state === "used" ? `Used on ${fmt.longDate(p.usedAt)}`
        : p.state === "expired" ? `Expired on ${fmt.longDate(p.expiresAt)}`
        : p.expiresAt ? `Until ${fmt.longDate(p.expiresAt)}` : "";
      return html`<li class="ticket-slot${stack.front === i ? " is-front" : ""}" style="--i:${i};--tilt:${TICKET_TILT[i % TICKET_TILT.length]}deg">
        <button type="button" class="ticket is-${p.state}" data-ticket="${i}" ${stack.front === i ? raw('aria-current="true"') : ""}
          aria-label="${p.text}. ${p.cafe.name.replace(/\.$/, "")}.${when ? ` ${when}.` : ""}${p.state === "ready" ? " Show your pass at the counter." : ""}${stack.front === i ? "" : " Bring to front."}">
          <span class="ticket__paper" aria-hidden="true">
            <span class="ticket__main">
              <span class="ticket__cafe">${p.cafe.name}</span>
              <span class="ticket__perk">${p.text}</span>
              <span class="ticket__meta">${when ? html`<span>${when}</span>` : ""}${p.state === "ready" ? html`<span>Show your pass at the counter</span>` : ""}</span>
            </span>
            <span class="ticket__stub"><span>${STATE_WORD[p.state]}</span></span>
          </span>
        </button>
      </li>`;
    }

    function perksHtml(c) {
      const mine = myPerks(c);
      const locked = c.perks.filter((p) => !p.unlocked);
      const lockedLine = locked.length ? `${locked.length} more for ${[...new Set(locked.map((p) => p.audience))].join(" and ")}` : "Every perk is yours";
      if (stack.front != null && stack.front >= mine.length) stack.front = null;
      return html`
        <button type="button" class="row badges-row perks-row" data-perks-toggle aria-expanded="${stack.open}" aria-controls="perk-stack">
          <span class="badge-mark is-earned">${mark("ticket")}</span>
          <span class="row__main"><span class="row__title">Perks · ${mine.length}</span><span class="row__meta">${lockedLine}</span></span>
          <span class="row__trail" aria-hidden="true">${icon("chevronDown", { size: 20 })}</span>
        </button>
        <div class="tickets${stack.open ? " is-fanned" : ""}" id="perk-stack" data-perk-stack role="group" aria-label="Your perks" ${stack.open ? "" : raw("hidden")}>
          <div class="tickets__bar">
            <p class="t-small t-muted">${mine.length > 1 ? "Tap a ticket to bring it to the front." : mine.length ? "Your perk, from a partner café." : "Your first perks come with Local: 30 cups with the club."}</p>
            <button type="button" class="icon-btn" data-perks-close aria-label="Fold the perks away">${icon("close")}</button>
          </div>
          ${mine.length ? html`<ul class="tickets__fan" role="list" style="--n:${mine.length}">${mine.map(ticketHtml)}</ul>` : ""}
          <p class="t-micro t-faint">Paid for by each café, not by your plan.</p>
        </div>`;
    }

    /** Fan out, fold back, bring a ticket forward. Reduced motion: a fade. */
    function bindPerks(root) {
      let busy = false;
      const still = () => ui.reducedMotion();
      const nodes = () => ({ box: $("[data-perk-stack]", root), row: $("[data-perks-toggle]", root) });
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));

      async function open() {
        if (busy || stack.open) return;
        busy = true;
        const { box, row } = nodes();
        box.classList.toggle("is-still", still());
        box.hidden = false;
        await frame();
        box.classList.add("is-fanned");
        stack.open = true;
        row.setAttribute("aria-expanded", "true");
        await wait(FAN_MS);
        busy = false;
      }

      async function close({ focusRow = false } = {}) {
        if (busy || !stack.open) return;
        busy = true;
        const { box, row } = nodes();
        box.classList.toggle("is-still", still());
        box.classList.remove("is-fanned");
        stack.open = false;
        row.setAttribute("aria-expanded", "false");
        if (focusRow || box.contains(document.activeElement)) row.focus({ preventScroll: true });
        await wait(FAN_MS);
        if (!stack.open) box.hidden = true;
        busy = false;
      }

      function bringForward(i) {
        stack.front = i;
        $$("[data-ticket]", root).forEach((t) => {
          const on = Number(t.dataset.ticket) === i;
          t.closest(".ticket-slot").classList.toggle("is-front", on);
          if (on) t.setAttribute("aria-current", "true"); else t.removeAttribute("aria-current");
          t.setAttribute("aria-label", t.getAttribute("aria-label").replace(/ Bring to front\.$/, "") + (on ? "" : " Bring to front."));
        });
      }

      root.addEventListener("click", (e) => {
        if (e.target.closest("[data-perks-toggle]")) { stack.open ? close() : open(); return; }
        if (e.target.closest("[data-perks-close]")) { close({ focusRow: true }); return; }
        const t = e.target.closest("[data-ticket]");
        if (t) bringForward(Number(t.dataset.ticket));
      });
      // Tap anywhere else, or Escape, folds the stack back
      const onDocClick = (e) => { if (stack.open && !root.contains(e.target)) close(); };
      const onKey = (e) => { if (stack.open && e.key === "Escape" && !document.querySelector('.sheet[data-open="true"]')) { e.preventDefault(); close({ focusRow: true }); } };
      document.addEventListener("click", onDocClick);
      document.addEventListener("keydown", onKey);
      return () => { document.removeEventListener("click", onDocClick); document.removeEventListener("keydown", onKey); };
    }

    function gatheringHtml() {
      const { next, past } = S.gatherings();
      const g = next && S.gathering(next.id);
      const when = (x) => `${fmt.date(x.at)} · ${fmt.time(x.at)}`;
      let action = "";
      if (g) {
        if (g.going) {
          action = html`<p class="gather__going">${icon("check", { size: 18 })}<span>You’re going. See you at ${g.cafe.name}.</span></p>
            <button type="button" class="btn btn--link" data-rsvp="no">Can’t make it? Give up your seat</button>`;
        } else if (g.left <= 0) {
          action = html`<p class="t-small t-muted">Every seat is taken. The next one is announced here first.</p>`;
        } else if (g.canRsvp) {
          action = html`<button type="button" class="btn btn--primary btn--block" data-rsvp="yes">${g.priority && !g.openToAll ? "Priority RSVP" : "RSVP"}</button>
            ${g.priority && !g.openToAll ? html`<p class="t-micro t-faint">Founding Members and Connoisseurs book first. Opens to every member on ${fmt.longDate(g.opensAt)}.</p>` : ""}`;
        } else {
          action = html`<button type="button" class="btn btn--secondary btn--block" disabled>RSVP opens ${fmt.longDate(g.opensAt)}</button>
            <p class="t-micro t-faint">Founding Members and Connoisseurs book first.</p>`;
        }
      }
      return html`
        ${g ? html`<article class="card gather" aria-labelledby="gather-title">
          <p class="eyebrow">Next gathering</p>
          <h3 class="t-h3" id="gather-title">${g.kind}: ${g.title.charAt(0).toLowerCase() + g.title.slice(1)}</h3>
          <p class="t-small t-muted gather__when">${icon("calendar", { size: 18 })}<span>${when(g)} · ${g.area.name}</span></p>
          <p class="t-small t-muted">${g.line}</p>
          <div class="gather__seats">
            ${bar(g.taken, g.seats, `${g.taken} of ${g.seats} seats taken`)}
            <p class="t-small num" aria-live="polite"><strong data-seats-left>${g.left}</strong> of ${g.seats} seats left</p>
          </div>
          <div class="gather__action">${action}</div>
        </article>` : html`<p class="t-small t-muted">The next gathering is announced here first.</p>`}
        ${past.slice(0, 1).map((p) => html`<div class="row gather-past">
          <span class="row__main">
            <span class="row__title">${p.kind}: ${p.title.charAt(0).toLowerCase() + p.title.slice(1)}</span>
            <span class="row__meta">${fmt.date(p.at)} · ${p.came} members came</span>
          </span>
          <span class="badge">Past</span>
        </div>`)}`;
    }

    function inviteHtml(c) {
      const code = c.inviteCode;
      const n = S.beans().rules.referral;
      const url = `${LIVE_URL()}#/app/welcome?invite=${code}`;
      const msg = `I’ve been using Lahore Coffee Club. Join with my code ${code} and we’ll both receive ${n} Beans.\n${url}`;
      const invites = S.invitations(c.member.id);
      return html`<div class="card invite">
        <div class="stack" style="--stack-gap:var(--space-1)">
          <h3 class="t-h3">Invite a friend</h3>
          <p class="t-small t-muted num">When a friend joins with your code and buys a plan or pays for an order, you each receive ${n} Beans.</p>
        </div>
        <div class="invite__code">
          <span class="t-micro t-faint">Your code</span>
          <span class="invite__value num" data-invite-code>${code}</span>
          <button type="button" class="icon-btn" data-copy="${code}" aria-label="Copy your invitation code">${icon("copy", { size: 20 })}</button>
        </div>
        <a class="btn btn--secondary btn--block" href="${waLink(msg)}" target="_blank" rel="noopener">${icon("share")}Share on WhatsApp</a>
        ${invites.length ? html`<div>
          <p class="t-micro t-faint">Your invitations</p>
          <ul role="list" class="invite__list">${invites.map((x) => html`<li class="row">
            <span class="row__main">
              <span class="row__title">${[x.member.firstName, x.member.lastName].filter(Boolean).join(" ")}</span>
              <span class="row__meta num">${x.rewardedAt ? `Rewarded ${fmt.shortDate(x.rewardedAt)} · +${n} Beans each` : `Joined ${fmt.shortDate(x.joinedAt)} · Beans after their first plan or paid order`}</span>
            </span>
            <span class="badge${x.rewardedAt ? " badge--accent" : ""}">${x.status}</span>
          </li>`)}</ul>
        </div>` : ""}
      </div>`;
    }

    function bodyHtml() {
      const c = S.club();
      return html`
        <div class="app-screen club">
          <div data-club="beans">${beansHtml()}</div>
          <div class="stack" style="--stack-gap:var(--space-1)">
            <p class="eyebrow">The club</p>
            <h1 class="t-h2">${c.founding ? "One of the first 500." : `Member ${c.number}.`}</h1>
          </div>

          <section aria-labelledby="passport-h">
            <h2 class="sr-only" id="passport-h">Lahore coffee passport</h2>
            <div class="passport" data-club="passport">${passportBookHtml(c)}</div>
          </section>

          <div data-club-card>${memberCard(c.member.id)}</div>

          <section class="app-section" aria-labelledby="status-h">
            <h2 class="eyebrow app-section__title" id="status-h">Your status</h2>
            <div data-club="status">${statusHtml(c)}</div>
          </section>

          <section class="app-section" aria-labelledby="gather-h">
            <h2 class="eyebrow app-section__title" id="gather-h">Gatherings</h2>
            <div class="stack" style="--stack-gap:var(--space-3)" data-club="gathering">${gatheringHtml()}</div>
          </section>

          <section class="app-section" aria-label="Perks from cafés">
            <div class="perks" data-club="perks">${perksHtml(c)}</div>
          </section>

          <section class="app-section" aria-label="Badges">
            <div data-club="badges">${badgesRowHtml(c)}</div>
          </section>

          <section class="app-section stack" style="--stack-gap:var(--space-3)" aria-label="Share the club">
            <div data-club="invite">${inviteHtml(c)}</div>
            <a class="row gift-link" href="#/app/gift">
              <span class="badge-mark">${icon("gift", { size: 22 })}</span>
              <span class="row__main"><span class="row__title">Send a gift</span><span class="row__meta">Give a friend up to ${rules().giftMaxCups} cups from your month</span></span>
              <span class="row__trail" aria-hidden="true">${icon("chevronRight", { size: 20 })}</span>
            </a>
          </section>
        </div>`;
    }

    function repaint() {
      const c = S.club();
      const set = (key, markup) => { const n = $(`[data-club="${key}"]`, view); if (n) n.innerHTML = markup.s; };
      set("status", statusHtml(c));
      set("passport", passportBookHtml(c));
      set("badges", badgesRowHtml(c));
      if (badgeSheet && badgeSheet.dataset.open === "true") {
        const body = $(".sheet__body", badgeSheet), top = body.scrollTop;
        badgeSheet.innerHTML = badgeSheetHtml().s;
        $(".sheet__body", badgeSheet).scrollTop = top;
      }
      set("perks", perksHtml(c));
      set("beans", beansHtml());
      set("invite", inviteHtml(c));
      paintBeansSheet();
      const card = $("[data-club-card]", view);
      if (card) card.innerHTML = memberCard(c.member.id).s;
    }
    const repaintGathering = () => { const n = $('[data-club="gathering"]', view); if (n) n.innerHTML = gatheringHtml().s; };

    function openBadges(btn) {
      btn.focus(); // so closing returns here (Safari doesn't focus on tap)
      badgeSheet.innerHTML = badgeSheetHtml().s;
      ui.openSheet(badgeSheet);
    }

    function onClick(e) {
      const ob = e.target.closest("[data-open-badges]");
      if (ob) { openBadges(ob); return; }
      const bb = e.target.closest("[data-open-beans]");
      if (bb) { bb.focus(); confirming = null; beansSheet.innerHTML = beansSheetHtml().s; ui.openSheet(beansSheet); return; }
      const r = e.target.closest("[data-rsvp]");
      if (r) {
        const g = S.gatherings().next;
        const going = r.dataset.rsvp === "yes";
        const res = A.rsvp(g.id, going);
        if (!res.ok) { ctx.toast(res.message || "That didn’t work. Try again.", { iconName: "info" }); return; }
        ctx.toast(going ? `You’re going. ${fmt.longDate(g.at)}, ${fmt.time(g.at)}.` : "Seat given up. Thanks for letting us know.", { iconName: going ? "calendar" : "check" });
        requestAnimationFrame(() => $("[data-rsvp], .gather__going", view)?.focus?.());
        return;
      }
      const copy = e.target.closest("[data-copy]");
      if (copy) {
        const done = () => ctx.toast(`Copied ${copy.dataset.copy}.`, { iconName: "copy" });
        try { navigator.clipboard.writeText(copy.dataset.copy).then(done, () => ctx.toast(`Your code is ${copy.dataset.copy}.`, { iconName: "copy" })); }
        catch (_) { ctx.toast(`Your code is ${copy.dataset.copy}.`, { iconName: "copy" }); }
      }
    }

    return {
      html: bodyHtml().s,
      mount() {
        // The passport container stays put across repaints, so its listeners do too
        bindBook($('[data-club="passport"]', view));
        const unbindPerks = bindPerks($('[data-club="perks"]', view));
        badgeSheet = document.createElement("div");
        badgeSheet.className = "sheet";
        badgeSheet.id = "badges-sheet";
        badgeSheet.setAttribute("role", "dialog");
        badgeSheet.setAttribute("aria-modal", "true");
        badgeSheet.setAttribute("aria-labelledby", "badges-title");
        badgeSheet.setAttribute("aria-hidden", "true");
        $(".phone__screen", el).appendChild(badgeSheet);
        beansSheet = document.createElement("div");
        beansSheet.className = "sheet";
        beansSheet.id = "beans-sheet";
        beansSheet.setAttribute("role", "dialog");
        beansSheet.setAttribute("aria-modal", "true");
        beansSheet.setAttribute("aria-labelledby", "beans-title");
        beansSheet.setAttribute("aria-hidden", "true");
        $(".phone__screen", el).appendChild(beansSheet);
        beansSheet.addEventListener("click", onBeansClick);
        view.addEventListener("click", onClick);
        return () => {
          clearTimeout(confirmTimer);
          unbindPerks();
          ui.closeSheet(badgeSheet);
          badgeSheet.remove();
          ui.closeSheet(beansSheet);
          beansSheet.remove();
          view.removeEventListener("click", onClick);
        };
      },
      on: {
        ledger: ({ entries }) => { if (entries.some((e) => e.memberId === S.member().id)) repaint(); },
        member: repaint,
        pickup: repaint, // a collected order earns Beans
        rsvp: () => { repaintGathering(); paintBeansSheet(); },
        tick: repaintGathering, // priority window can open while the tab is showing
      },
    };
  };

  /* -------------------------------------------------------------------
     Gifting (#/app/gift)
     ------------------------------------------------------------------- */
  const gift = { cups: 1, cafeId: null, name: "", phone: "", message: "", phase: "form", result: null, forMember: null };

  const GIFT_CHECKS = {
    name: (v) => (String(v).trim() ? "" : "Add your friend’s name."),
    phone: (v) => (/^03\d{9}$/.test(digits(v)) ? "" : "Enter an 11-digit WhatsApp number starting with 03, like 0300 1234567."),
  };

  /** Where gift cups can come from: the Explorer pool, or one café's reserved cups. */
  function sources() {
    const m = S.member();
    if (!m.plan) return [];
    if (m.plan.type === "explorer") return [{ id: null, label: "Your Explorer pool", left: S.poolBalance(), line: "They can use it at any partner café." }];
    if (m.plan.type === "brand") { const b = S.brand(m.plan.brandId); return [{ id: null, label: `Your ${b.name} cups`, left: S.poolBalance(), line: `They can use them at any ${b.name} branch.` }]; }
    const b = S.balance();
    return Object.entries(b.perCafe).filter(([, x]) => x.reserved).map(([id, x]) => ({ id, label: S.cafe(id).name, left: x.left, line: `Reserved cups stay at ${S.cafe(id).name}. They can only use them there.` }));
  }

  function giftMessage(g, from) {
    const where = g.cafeId ? `at ${S.cafe(g.cafeId).name}` : "at any partner café";
    return [
      `${from.firstName} sent you ${fmt.cups(g.cups)} of coffee from Lahore Coffee Club, to use ${where}.`,
      g.message ? `“${g.message}”` : null,
      `Gift code: ${g.code}`,
      `It keeps for ${rules().giftExpiryDays} days, until ${fmt.longDate(g.expiresAt)}.`,
      LIVE_URL(),
    ].filter(Boolean).join("\n");
  }

  REG.gift = (ctx) => {
    const { view } = ctx;
    const m = ctx.member();
    if (gift.forMember !== m.id) Object.assign(gift, { cups: 1, cafeId: null, name: "", phone: "", message: "", phase: "form", result: null, forMember: m.id });
    if (gift.phase === "sent" && !gift.result) gift.phase = "form";

    const source = () => {
      const list = sources();
      return list.find((x) => x.id === gift.cafeId) || list.find((x) => x.left > 0) || list[0] || null;
    };
    const maxCups = () => Math.max(0, Math.min(rules().giftMaxCups, source()?.left || 0));

    function sourceHtml() {
      const list = sources();
      const cur = source();
      if (list.length === 1) {
        return html`<p class="t-small t-muted num gift-source">From ${list[0].label.charAt(0).toLowerCase() + list[0].label.slice(1)}, ${fmt.cups(list[0].left)} left. ${list[0].line}</p>`;
      }
      return html`<fieldset class="method-list">
        <legend class="field__label">Cups from</legend>
        ${list.map((x) => html`<label class="method${x.left ? "" : " is-empty"}">
          <input class="sr-only" type="radio" name="gift-source" value="${x.id}" ${cur && cur.id === x.id ? raw("checked") : ""} ${x.left ? "" : raw("disabled")}>
          <span class="method__text"><span class="row__title">${x.label}</span><span class="row__meta num">${x.left ? `${fmt.cups(x.left)} left to give` : "None left this month"}</span></span>
          <span class="method__tick" aria-hidden="true">${icon("check", { size: 18 })}</span>
        </label>`)}
        <p class="t-micro t-faint">${cur ? cur.line : ""}</p>
      </fieldset>`;
    }

    function previewHtml() {
      const cur = source();
      const where = cur && cur.id ? S.cafe(cur.id).name : "Any partner café";
      const expires = Date.now() + rules().giftExpiryDays * 24 * 60 * 60 * 1000;
      return html`<div class="gift-card" aria-label="Gift preview">
        <div class="gift-card__top"><span class="mcard__brand">${ui.logo("wordmark", { label: null })}</span><span class="t-micro">A gift</span></div>
        <p class="gift-card__cups"><span class="num" data-preview-cups>${gift.cups}</span> <span data-preview-word>${gift.cups === 1 ? "cup" : "cups"}</span> of coffee</p>
        <p class="gift-card__to">For <span data-preview-name>${gift.name.trim() || "your friend"}</span>, from ${m.firstName}</p>
        <p class="gift-card__msg" data-preview-msg ${gift.message.trim() ? "" : raw("hidden")}>“${gift.message.trim()}”</p>
        <div class="gift-card__foot"><span>${where}</span><span class="num">Keeps until ${fmt.longDate(expires)}</span></div>
      </div>`;
    }

    function formHtml() {
      const cur = source();
      const max = maxCups();
      if (!cur || max <= 0) {
        return html`<div class="pay-state">
          <span class="pay-state__mark" aria-hidden="true">${icon("gift", { size: 28 })}</span>
          <h2 class="t-h3">No cups to give right now.</h2>
          <p class="t-small t-muted">${m.plan ? `Gifts come out of this month’s cups. Yours renew on ${fmt.longDate(m.renewsAt)}.` : "Choose a plan first, then you can share it."}</p>
          <a class="btn btn--secondary btn--block" href="#/app">Back to home</a>
        </div>`;
      }
      gift.cups = Math.min(Math.max(1, gift.cups), max);
      const msgMax = rules().giftMessageMax;
      return html`<form class="pay-form" data-gift-form novalidate>
        ${sourceHtml()}
        <div class="field">
          <span class="field__label" id="gift-cups-label">How many cups</span>
          <div class="gift-cups">
            ${ui.stepper({ id: "gift", value: gift.cups, min: 1, max, label: "Cups to gift" })}
            <span class="t-small t-muted num">Up to ${max}</span>
          </div>
        </div>
        <div class="field" data-field="name">
          <label class="field__label" for="gift-name">Friend’s name</label>
          <input class="input" id="gift-name" name="name" value="${gift.name}" autocomplete="off" aria-describedby="gift-name-err">
          <p class="field__error" id="gift-name-err"></p>
        </div>
        <div class="field" data-field="phone">
          <label class="field__label" for="gift-phone">Their WhatsApp number</label>
          <input class="input num" id="gift-phone" name="phone" value="${gift.phone}" inputmode="tel" autocomplete="off" placeholder="03XX XXXXXXX" aria-describedby="gift-phone-err">
          <p class="field__error" id="gift-phone-err"></p>
        </div>
        <div class="field">
          <label class="field__label" for="gift-msg">A short message <span class="t-faint" style="font-weight:400">(optional)</span></label>
          <textarea class="input gift-msg" id="gift-msg" name="message" maxlength="${msgMax}" rows="3" aria-describedby="gift-msg-count" placeholder="Your first flat white is on me.">${gift.message}</textarea>
          <p class="field__hint num" id="gift-msg-count" data-msg-count>${gift.message.length} of ${msgMax}</p>
        </div>
        <div data-gift-preview>${previewHtml()}</div>
        <p class="t-small t-muted">Gifts expire in ${rules().giftExpiryDays} days. The cups come off your month as soon as you send.</p>
        <button type="submit" class="btn btn--primary btn--block">Send on WhatsApp</button>
      </form>`;
    }

    function sentHtml() {
      const g = gift.result;
      return html`<div class="pay-state" role="status">
        <svg class="check-draw" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" pathLength="1"/><path d="M15 24.5l6 6 12-13" pathLength="1"/></svg>
        <h2 class="t-h2">${fmt.cups(g.cups)} for ${g.toName}.</h2>
        <p class="t-body t-muted">WhatsApp should have opened with the gift and its code. Press send there.</p>
        <p class="gift-code num" aria-label="Gift code ${g.code.split("").join(" ")}">${g.code}</p>
        <p class="t-small t-faint num">Keeps until ${fmt.longDate(g.expiresAt)}. ${S.balance().left} of ${S.balance().total} cups left for you this month.</p>
        <div class="pay-state__actions">
          <a class="btn btn--secondary btn--block" href="${waLink(giftMessage(g, m), g.toPhone)}" target="_blank" rel="noopener">Open WhatsApp again</a>
          <button type="button" class="btn btn--primary btn--block" data-gift-done>Back to home</button>
        </div>
      </div>`;
    }

    function paint() {
      $("[data-gift-body]", view).innerHTML = (gift.phase === "sent" ? sentHtml() : formHtml()).s;
    }
    function paintPreview() {
      const p = $("[data-gift-preview]", view);
      if (p) p.innerHTML = previewHtml().s;
    }

    function showError(id, msg) {
      const f = $(`[data-field="${id}"]`, view);
      if (!f) return;
      f.dataset.invalid = String(!!msg);
      $(".field__error", f).textContent = msg;
      $("input", f).setAttribute("aria-invalid", String(!!msg));
    }

    function onInput(e) {
      const t = e.target;
      if (t.name === "phone") { const v = formatPhone(t.value); if (v !== t.value) t.value = v; gift.phone = v; }
      else if (t.name === "name") gift.name = t.value;
      else if (t.name === "message") { gift.message = t.value; $("[data-msg-count]", view).textContent = `${t.value.length} of ${rules().giftMessageMax}`; }
      else return;
      if (GIFT_CHECKS[t.name] && t.closest(".field").dataset.invalid === "true") showError(t.name, GIFT_CHECKS[t.name](t.value));
      paintPreview();
    }
    function onFocusOut(e) {
      const t = e.target;
      if (GIFT_CHECKS[t.name] && t.value) showError(t.name, GIFT_CHECKS[t.name](t.value));
    }
    function onChange(e) {
      if (e.target.name !== "gift-source") return;
      gift.cafeId = e.target.value || null;
      paint();
    }
    function onClick(e) {
      const step = e.target.closest("[data-stepper=gift] [data-step]");
      if (step) {
        gift.cups = Math.max(1, Math.min(maxCups(), gift.cups + Number(step.dataset.step)));
        ui.setStepper(step.closest("[data-stepper]"), gift.cups);
        paintPreview();
        return;
      }
      if (e.target.closest("[data-gift-done]")) {
        Object.assign(gift, { phase: "form", result: null, name: "", phone: "", message: "", cups: 1 });
        ctx.go("#/app", { replace: true });
      }
    }
    function onSubmit(e) {
      if (!e.target.matches("[data-gift-form]")) return;
      e.preventDefault();
      const bad = Object.keys(GIFT_CHECKS).filter((id) => GIFT_CHECKS[id](gift[id]));
      Object.keys(GIFT_CHECKS).forEach((id) => showError(id, GIFT_CHECKS[id](gift[id])));
      if (bad.length) { $(`#gift-${bad[0]}`, view).focus(); return; }
      const cur = source();
      const res = A.sendGift({ toName: gift.name, toPhone: formatPhone(gift.phone), cups: gift.cups, cafeId: cur.id, message: gift.message });
      if (!res.ok) { ctx.toast(res.message, { iconName: "info" }); paint(); return; }
      window.open(waLink(giftMessage(res.gift, m), res.gift.toPhone), "_blank", "noopener");
      gift.phase = "sent";
      gift.result = res.gift;
      paint();
      $("[data-gift-body] [role=status]", view)?.setAttribute("tabindex", "-1");
      $("[data-gift-body] [role=status]", view)?.focus({ preventScroll: true });
    }

    return {
      html: html`
        <div class="flow">
          <div class="screen-bar">
            <button type="button" class="icon-btn" data-back="#/app" aria-label="Back">${icon("arrowLeft")}</button>
          </div>
          <div class="app-screen flow__body">
            <div class="stack" style="--stack-gap:var(--space-2)">
              <h1 class="t-h2">Send a gift</h1>
              <p class="t-small t-muted">Give a friend a few cups from your month. They get it on WhatsApp.</p>
            </div>
            <div data-gift-body></div>
          </div>
        </div>`.s,
      mount() {
        paint();
        view.addEventListener("input", onInput);
        view.addEventListener("focusout", onFocusOut);
        view.addEventListener("change", onChange);
        view.addEventListener("click", onClick);
        view.addEventListener("submit", onSubmit);
        return () => {
          view.removeEventListener("input", onInput);
          view.removeEventListener("focusout", onFocusOut);
          view.removeEventListener("change", onChange);
          view.removeEventListener("click", onClick);
          view.removeEventListener("submit", onSubmit);
        };
      },
      on: {
        // A redemption elsewhere can change how many cups are left to give
        ledger: ({ entries }) => {
          if (gift.phase !== "form" || !entries.some((e) => e.memberId === m.id)) return;
          const max = maxCups();
          const st = $("[data-stepper=gift]", view);
          if (!st || max <= 0) { paint(); return; }
          st.dataset.max = max;
          gift.cups = Math.min(gift.cups, max);
          ui.setStepper(st, gift.cups);
        },
      },
    };
  };

  LCC.appClub = { waLink, formatPhone };
})();
