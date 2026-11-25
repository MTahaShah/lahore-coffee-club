/* =====================================================================
   The Round — app-history.js
   #/app/cups, "My cups" (Profile → My cups): every transaction from the
   ledger (LCC.ledger.ledgerFor), newest first, plus pickups paid online
   (orders, not cups). Date, café, drink and mods, counter or pickup,
   redeemed or paid; undos, cancels and cups coming back are said plainly.

   "Download PDF" builds a print-only table (#print-root, history.css)
   and calls window.print(); the browser saves it as a PDF. No library.
   The printout has the wordmark, the member's name and number, the month
   shown and a clean table.
   ===================================================================== */
(function () {
  "use strict";
  const LCC = window.LCC;
  const { store, fmt, ui } = LCC;
  const { html, raw, $, icon } = ui;
  const S = store.select;
  const REG = (LCC.appScreens = LCC.appScreens || {});

  const day = (ts) => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const monthKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
  const monthLabel = (key) => { const [y, m] = key.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" }); };
  const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "–");

  /** "Oat milk · Less ice · Extra shot (paid at the counter)". */
  function modsText(e) {
    const mods = Object.entries(e.mods || {}).map(([k, v]) => (k === "milk" ? `${v} milk` : k === "ice" ? (v === "No ice" ? v : `${v} ice`) : `${v} ${k}`));
    const extras = (e.extras || []).map((x) => x.label);
    return [...mods, ...(extras.length ? [`${extras.join(", ")} (paid at the counter)`] : [])].join(" · ");
  }
  const place = (cafeId) => (cafeId ? S.placeName(cafeId) || S.venueName?.(cafeId) || S.brand(cafeId)?.name || "" : "Any partner café");

  /** Which plan a cup came from, for the line under it ("Drip · 8:40 am · Classic 8 pack"). */
  function planOf(e) {
    if (e.type === "pass-sale" || e.pass) return S.passTier({ type: "pass", tier: e.tier }).name;
    if (e.bonus) return "Complimentary cup";
    if (e.packId) return `${S.tier(e.packId)?.name || "Cup"} pack`;
    return { brand: `${S.brand(e.brandId)?.name || "Brand"} plan`, mycafes: "My cafés", explorer: "Cup pack", pass: "The Round Pass" }[e.planType] || "";
  }

  /** One row per thing that happened, newest first. */
  function rowsFor(m) {
    const es = LCC.ledger.ledgerFor({ memberNo: m.memberNo });
    const redeemed = new Set(es.filter((e) => e.type === "redeem" && e.orderId).map((e) => e.itemId || e.orderId));
    const orders = store.getState().orders;
    const out = [];
    es.forEach((e) => {
      const base = { at: e.at, cafe: place(e.cafeId), cups: e.cups, channel: e.channel === "pickup" || e.orderId ? "Pickup" : e.type === "redeem" || e.type === "undo" ? "Counter" : "", drink: "", mods: "", note: "" };
      switch (e.type) {
        case "purchase": out.push({ ...base, paid: e.price || 0, what: e.pass ? `${S.passTier({ type: "pass", tier: e.tier }).name}, ${fmt.rs(e.price)}` : e.packId ? `${S.tier(e.packId)?.name || "Cup pack"} pack` : "Plan cups", drink: "", cafe: e.cafeId ? place(e.cafeId) : "Your plan" }); break;
        case "pass-sale": out.push({ ...base, plan: planOf(e), paid: e.memberPrice, plain: true, channel: "Counter", what: `${S.passTier({ type: "pass", tier: e.tier }).name}${e.cupNo === 2 ? " · second cup" : ""} · ${fmt.rs(e.memberPrice)} paid`, drink: e.drink || "Coffee" }); break;
        case "redeem": {
          const top = e.topUp ? ` · top-up ${fmt.rs(e.topUp)} ${e.topUpOnline ? "paid online" : "paid at the counter"}` : "";
          out.push({ ...base, plan: planOf(e), paid: e.topUp || 0, plain: !e.undone && !e.uncollected, what: e.undone ? "Redeemed, then undone" : e.uncollected ? "Redeemed (not picked up)" : "Redeemed", drink: e.drink || "Coffee", mods: modsText(e), note: `${e.bonus ? "Complimentary cup" : ""}${top}`.replace(/^ · /, ""), struck: !!e.undone });
          break;
        }
        case "undo": out.push({ ...base, what: "Undone, cup back", drink: e.drink || "", note: "The counter took this cup back." }); break;
        case "hold": {
          const o = orders[e.orderId];
          if (o && S.isPickupOpen(o)) out.push({ ...base, what: "Pickup ordered, cup held", drink: o ? S.pickupDrinkName(o) : "" });
          break;
        }
        case "cancel": out.push({ ...base, what: "Cancelled, cup back", drink: orders[e.orderId] ? S.pickupDrinkName(orders[e.orderId]) : "" }); break;
        case "release": {
          if (redeemed.has(e.itemId || e.orderId)) break; // collected: the redeem row says it
          const o = orders[e.orderId];
          out.push({ ...base, what: "Café couldn’t make it, cup back", drink: o ? S.pickupDrinkName(o) : "" });
          break;
        }
        case "reward": out.push({ ...base, what: "Complimentary cup", cafe: "The Round", note: e.reason === "beans" ? "From your Beans" : e.reason?.startsWith("passport") ? "Passport" : "" }); break;
        case "gift": out.push({ ...base, what: `Gift to ${e.toName || "a friend"}`, note: e.giftCode ? `Code ${e.giftCode}` : "" }); break;
        case "expire": out.push({ ...base, what: "Unused cups ended" }); break;
        case "adjust": out.push({ ...base, what: e.cups > 0 ? "Added by The Round" : "Taken off by The Round", cafe: "The Round", note: e.reason }); break;
        case "beans": out.push({ ...base, what: "Beans used", cafe: "The Round", note: e.title || "" }); break;
        default: break;
      }
    });
    // Pickups paid in full online: money, not cups
    Object.values(orders).filter((o) => o.memberId === m.id && !o.items && o.pay === "paid").forEach((o) => {
      const word = { collected: "Paid", cancelled: "Paid, then cancelled", rejected: "Paid, café couldn’t make it" }[o.status] || "Paid, on its way";
      out.push({ at: o.placedAt, cafe: place(o.cafeId), cups: 0, paid: o.amount, channel: "Pickup", what: word, drink: S.pickupDrinkName(o), mods: "",
        note: `${fmt.rs(o.amount)} with ${o.payment?.method || "card"}${o.refunded ? ", refunded" : ""}` });
    });
    return out.sort((a, b) => b.at - a.at);
  }

  /** Print-only copy of the table: the browser's "Save as PDF". */
  function printPdf(m, rows, month) {
    document.getElementById("print-root")?.remove();
    const root = document.createElement("div");
    root.id = "print-root";
    const cardNo = String(m.memberNo).padStart(4, "0");
    root.innerHTML = html`
      <header class="pr-head">
        <div class="pr-logo">${ui.logo("wordmark")}</div>
        <div class="pr-who">
          <p class="pr-name">${S.fullName(m)}</p>
          <p>${fmt.lcc(m.memberNo)} · Card ${cardNo}</p>
        </div>
      </header>
      <h1 class="pr-title">My cups · ${month === "all" ? "All months" : monthLabel(month)}</h1>
      <table class="pr-table">
        <thead><tr><th>Date</th><th>Café</th><th>Drink</th><th>Mods and extras</th><th>Where</th><th>What</th><th class="pr-num">Cups</th></tr></thead>
        <tbody>${rows.length ? rows.map((r) => html`<tr class="${r.struck ? "is-struck" : ""}">
          <td>${day(r.at)}<br><span class="pr-faint">${fmt.time(r.at)}</span></td><td>${r.cafe}</td><td>${r.drink || "–"}</td><td>${r.mods || "–"}</td>
          <td>${r.channel || "–"}</td><td>${r.what}${r.note ? html`<br><span class="pr-faint">${r.note}</span>` : ""}</td><td class="pr-num">${signed(r.cups)}</td></tr>`)
          : html`<tr><td colspan="7">Nothing this month.</td></tr>`}</tbody>
      </table>
      <p class="pr-foot">Printed ${fmt.date(Date.now())}. Every line comes from The Round’s ledger; entries are never changed or removed. Questions: WhatsApp 0310 0008242.</p>`.s;
    document.body.appendChild(root);
    const done = () => { root.remove(); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
  }

  /* -------------------------------------------------------------------
     #/app/cups
     ------------------------------------------------------------------- */
  let month = "all";
  REG.cups = (ctx) => {
    const { view } = ctx;
    const m = S.member();
    if (!m) return { redirect: "#/app" };

    const all = () => rowsFor(m);
    const shown = () => all().filter((r) => month === "all" || monthKey(r.at) === month);
    const months = () => [...new Set(all().map((r) => monthKey(r.at)))].sort().reverse();

    /* Grouped by day within the month: the drink, then "Drip · 8:40 am ·
       The Round Pass", anything else as a small note, the amount on the right. */
    function listHtml() {
      const rows = shown();
      if (!rows.length) return html`<p class="t-small t-muted">Nothing here yet.</p>`;
      const trail = (r) => {
        if (r.paid) return html`<span class="arow__amount num">${fmt.rs(r.paid)}</span>`;
        if (!r.cups) return "";
        const n = Math.abs(r.cups), word = n === 1 ? "cup" : "cups";
        return html`<span class="arow__amount num" aria-label="${r.cups > 0 ? "plus" : "minus"} ${n} ${word}">${signed(r.cups)} ${word}</span>`;
      };
      return html`<div class="cups-log">${ui.dayGroups(rows, (r) => {
        const note = [r.drink && !r.plain ? r.what : "", r.mods, r.note].filter(Boolean).join(" · ");
        return ui.activityRow({
          struck: r.struck,
          sentence: r.drink || r.what, note,
          line: [r.cafe, fmt.time(r.at), r.plan || r.channel].filter(Boolean).join(" · "),
          trail: trail(r),
        });
      }, { mode: "day" })}</div>`;
    }
    function filterHtml() {
      return html`<label class="field cups-filter"><span class="field__label">Month</span>
        <span class="select"><select class="input" data-cups-month>
          <option value="all" ${month === "all" ? raw("selected") : ""}>All months</option>
          ${months().map((k) => html`<option value="${k}" ${k === month ? raw("selected") : ""}>${monthLabel(k)}</option>`)}
        </select></span></label>`;
    }
    const paint = () => { const b = $("[data-cups-list]", view); if (b) b.innerHTML = listHtml().s; };
    const onChange = (e) => { if (e.target.matches("[data-cups-month]")) { month = e.target.value; paint(); } };
    const onClick = (e) => { if (e.target.closest("[data-cups-pdf]")) printPdf(m, shown(), month); };

    return {
      html: html`
        <div class="flow">
          <div class="screen-bar">
            <button type="button" class="icon-btn" data-back="#/app" aria-label="Back">${icon("arrowLeft")}</button>
          </div>
          <div class="app-screen flow__body">
            <div class="stack" style="--stack-gap:var(--space-1)">
              <h1 class="t-title">My cups</h1>
              <p class="t-small t-muted">Every cup in and out, from the club’s ledger.</p>
            </div>
            <div class="cups-tools">${filterHtml()}
              <button type="button" class="btn btn--secondary btn--compact" data-cups-pdf>Download PDF</button></div>
            <div data-cups-list>${listHtml()}</div>
          </div>
        </div>`.s,
      mount() {
        view.addEventListener("change", onChange);
        view.addEventListener("click", onClick);
        return () => { view.removeEventListener("change", onChange); view.removeEventListener("click", onClick); };
      },
      on: { ledger: paint, undo: paint, pickup: paint },
    };
  };
})();
