/* =====================================================================
   Lahore Coffee Club — app-club.js
   Member app: the Club tab (#/app/club) and gifting (#/app/gift).

   Everything on the Club tab is earned by use and read from the ledger
   through store.select.club(): status, passport, badges and perks. The
   member card is shared with onboarding (LCC.memberCard).
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
        <span class="mcard__brand">Lahore Coffee Club</span>
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
  };
  const mark = (id) => raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${MARKS[id] || ""}</svg>`);

  const bar = (have, goal, label) => html`<div class="pbar" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${Math.min(have, goal)}"><span style="--p:${Math.min(1, have / goal).toFixed(3)}"></span></div>`;

  /* -------------------------------------------------------------------
     Club tab
     ------------------------------------------------------------------- */
  REG.club = (ctx) => {
    const { view } = ctx;

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

    function passportHtml(c) {
      const p = c.passport;
      const tilt = [-5, 3, -2, 6, -4, 2, -6, 4];
      const rewardLine = p.nextReward
        ? `A free cup at ${p.nextReward === p.total ? `all ${p.total}` : p.nextReward} cafés. ${p.nextReward - p.count === 1 ? "One more to go." : `${p.nextReward - p.count} more to go.`}`
        : `Every partner café, visited. Both free cups are yours.`;
      return html`
        <div class="passport__head">
          <p class="t-h3 num"><span class="passport__count">${p.count}</span> of ${p.total} cafés</p>
          <p class="t-small t-muted">${rewardLine}</p>
        </div>
        <ul class="passport" role="list">
          ${p.stamps.map((s, i) => html`<li class="stamp${s.visited ? " is-stamped" : ""}" style="--tilt:${tilt[i % tilt.length]}deg">
            <span class="stamp__ring" aria-hidden="true"></span>
            <span class="stamp__name">${shortName(s.cafe)}</span>
            <span class="stamp__date num">${s.visited ? fmt.shortDate(s.firstAt) : "Not yet"}</span>
            <span class="sr-only">${s.visited ? `, first cup ${fmt.longDate(s.firstAt)}` : ", not visited yet"}</span>
          </li>`)}
        </ul>`;
    }

    function badgesHtml(c) {
      return html`<ul role="list" class="badge-list">
        ${c.badges.map((b) => html`<li class="row badge-row${b.earned ? " is-earned" : ""}">
          <span class="badge-mark">${mark(b.id)}</span>
          <span class="row__main">
            <span class="row__title">${b.name}</span>
            <span class="row__meta">${b.how}</span>
          </span>
          ${b.earned
            ? html`<span class="badge badge--accent">Earned</span>`
            : html`<span class="row__trail num" aria-label="${b.have} of ${b.goal}">${b.have} of ${b.goal}</span>`}
        </li>`)}
      </ul>`;
    }

    function perksHtml(c) {
      const order = ["founding", "local", "connoisseur"];
      const perks = c.perks.slice().sort((a, b) => (b.unlocked - a.unlocked) || (order.indexOf(a.for) - order.indexOf(b.for)));
      return html`<ul role="list">
        ${perks.map((p) => html`<li class="row perk-row${p.unlocked ? " is-yours" : ""}">
          <span class="row__main">
            <span class="row__title">${p.text}</span>
            <span class="row__meta">From ${p.cafe.name} · for ${p.audience}</span>
          </span>
          ${p.unlocked ? html`<span class="badge badge--accent">Yours</span>` : html`<span class="badge">${p.for === "founding" ? "Founding" : p.audience.slice(0, -1)}</span>`}
        </li>`)}
      </ul>
      <p class="t-micro t-faint">Paid for by each café, not by your plan. Show your pass and the barista will see what’s yours.</p>`;
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
      const url = `${LIVE_URL()}#/app/welcome?invite=${c.inviteCode}`;
      const msg = `I’m a member of Lahore Coffee Club: one monthly pass for independent cafés across Lahore. Join with my code ${c.inviteCode} and we both get a free cup.\n${url}`;
      return html`<div class="card invite">
        <div class="stack" style="--stack-gap:var(--space-1)">
          <h3 class="t-h3">Invite a friend</h3>
          <p class="t-small t-muted">When they join with your code, you both get a free cup.</p>
        </div>
        <div class="invite__code">
          <span class="t-micro t-faint">Your code</span>
          <span class="invite__value num" data-invite-code>${c.inviteCode}</span>
          <button type="button" class="icon-btn" data-copy="${c.inviteCode}" aria-label="Copy your invite code">${icon("copy", { size: 20 })}</button>
        </div>
        <a class="btn btn--secondary btn--block" href="${waLink(msg)}" target="_blank" rel="noopener">${icon("share")}Share on WhatsApp</a>
      </div>`;
    }

    function bodyHtml() {
      const c = S.club();
      return html`
        <div class="app-screen club">
          <div class="stack" style="--stack-gap:var(--space-1)">
            <p class="eyebrow">The club</p>
            <h1 class="t-h2">${c.founding ? "One of the first 500." : `Member ${c.number}.`}</h1>
          </div>
          <div data-club-card>${memberCard(c.member.id)}</div>

          <section class="app-section" aria-labelledby="status-h">
            <h2 class="eyebrow app-section__title" id="status-h">Your status</h2>
            <div data-club="status">${statusHtml(c)}</div>
          </section>

          <section class="app-section" aria-labelledby="passport-h">
            <h2 class="eyebrow app-section__title" id="passport-h">Lahore coffee passport</h2>
            <div data-club="passport">${passportHtml(c)}</div>
          </section>

          <section class="app-section" aria-labelledby="gather-h">
            <h2 class="eyebrow app-section__title" id="gather-h">Gatherings</h2>
            <div class="stack" style="--stack-gap:var(--space-3)" data-club="gathering">${gatheringHtml()}</div>
          </section>

          <section class="app-section" aria-labelledby="perks-h">
            <h2 class="eyebrow app-section__title" id="perks-h">Perks from cafés</h2>
            <div data-club="perks">${perksHtml(c)}</div>
          </section>

          <section class="app-section" aria-labelledby="badges-h">
            <h2 class="eyebrow app-section__title" id="badges-h">Badges</h2>
            <div data-club="badges">${badgesHtml(c)}</div>
          </section>

          <section class="app-section stack" style="--stack-gap:var(--space-3)" aria-label="Share the club">
            ${inviteHtml(c)}
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
      set("passport", passportHtml(c));
      set("badges", badgesHtml(c));
      set("perks", perksHtml(c));
      const card = $("[data-club-card]", view);
      if (card) card.innerHTML = memberCard(c.member.id).s;
    }
    const repaintGathering = () => { const n = $('[data-club="gathering"]', view); if (n) n.innerHTML = gatheringHtml().s; };

    function onClick(e) {
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
        view.addEventListener("click", onClick);
        return () => view.removeEventListener("click", onClick);
      },
      on: {
        ledger: ({ entries }) => { if (entries.some((e) => e.memberId === S.member().id)) repaint(); },
        member: repaint,
        rsvp: repaintGathering,
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
        <div class="gift-card__top"><span class="mcard__brand">Lahore Coffee Club</span><span class="t-micro">A gift</span></div>
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
