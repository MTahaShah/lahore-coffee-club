/* =====================================================================
   Lahore Coffee Club — ledger.js
   One record of every cup, read the same way by the member app, the
   counter, the owner dashboard and (later) the admin panel.

   The entries themselves live in the store (state.ledger, written only
   through state.js actions, append-only and idempotent by id). This file
   is the read side plus the one admin write, keyed by membership number:

     LCC.ledger.cupsLeft(42)                       -> 11
     LCC.ledger.eligibleItems("LCC 42", "kiln")    -> drinks a cup covers here now
     LCC.ledger.ledgerFor({ memberNo: 42, from, to })
     LCC.ledger.ledgerFor({ cafeId: "ds-gulberg" }) / ({ all: true })
     LCC.ledger.payoutFor("ds-gulberg", "2026-11")
     LCC.ledger.adjust({ memberNo, cups, reason, admin })

   Entry types (cups signed: + gives cups, − takes them):
     purchase  + a plan's cups at the start of a cycle
     redeem    − a cup at the counter (channel "counter") or a collected
                 pickup (channel "pickup", orderId). Undone ones don't count
     hold      − a pickup order paid with a cup, while it's open
     release   + the hold comes back: the café rejected it, or it was
                 collected (a redeem follows)
     cancel    + the member cancelled while "placed" (cancels: the hold)
     undo      + reverses a redeem (undoes: the redeem). Only the cashier
                 who served it, within rules.undoMinutes
     adjust    ± LCC admin only, with a reason
     reward    + a complimentary cup (passport, Beans)
     gift, expire  − cups given away, or left at a plan's end
     beans     0  Beans spent (see select.beans)
   Paid pickups don't touch cups; they are state.orders with pay "paid"
   (or "group"), and count in payoutFor as paid orders.

   Flags set after the fact (undone, reported) are read-only marks that a
   later entry exists; the cups and amounts of an entry never change.
   ===================================================================== */
(function () {
  "use strict";
  const LCC = window.LCC;
  if (!LCC || !LCC.store) throw new Error("ledger.js: state.js must load first");
  const { store } = LCC;
  const S = store.select;
  const A = store.actions;

  const TYPES = ["purchase", "redeem", "hold", "release", "cancel", "undo", "adjust", "reward", "gift", "expire", "beans"];
  const counts = (e) => e.type === "redeem" && !e.undone;

  /** The member, from a number in any shape (42, "LCC 42", "LCC-0042"), or a member object. */
  function memberOf(no) {
    if (no && typeof no === "object") return no;
    return S.memberByNo(no);
  }

  /** "2026-11", a Date or a timestamp -> [start of month, start of next month). */
  function monthRange(month = Date.now()) {
    let d;
    if (typeof month === "string" && /^\d{4}-\d{1,2}$/.test(month)) {
      const [y, m] = month.split("-").map(Number);
      d = new Date(y, m - 1, 1);
    } else {
      d = new Date(month); d.setDate(1);
    }
    d.setHours(0, 0, 0, 0);
    const from = d.getTime();
    d.setMonth(d.getMonth() + 1);
    return { from, to: d.getTime(), key: `${new Date(from).getFullYear()}-${String(new Date(from).getMonth() + 1).padStart(2, "0")}` };
  }

  /** One entry as everyone reads it: a frozen copy with the number, channel and staff name. */
  function view(e) {
    const m = S.member(e.memberId);
    const staff = e.staffId ? S.staffMember(e.staffId) : null;
    const drink = e.drinkId ? S.entryDrinkName(e) : null;
    return Object.freeze({
      ...e,
      memberNo: m?.memberNo ?? null,
      channel: e.channel || (e.orderId ? "pickup" : e.type === "redeem" || e.type === "undo" ? "counter" : null),
      staffName: staff?.name || null,
      drink,
      ref: e.ref || e.undoes || e.cancels || e.releases || null,
      mods: e.mods ? Object.freeze({ ...e.mods }) : null,
      extras: Object.freeze((e.extras || []).map((x) => Object.freeze({ ...x }))),
    });
  }

  const ledger = {
    types: TYPES,
    member: memberOf,

    /** Cups left right now, across every plan the member holds (Home and the
        Pass show the first plan; S.plansOf has each one). Always summed
        from the ledger, never stored. */
    cupsLeft(memberNo) {
      // BACKEND: SELECT sum(cups) FROM ledger WHERE member_id = :id AND cycle = ANY(:current_cycles)
      const m = memberOf(memberNo);
      return m ? S.plansOf(m.id).reduce((n, p) => n + p.left, 0) : 0;
    },

    /** The drinks a cup covers for this member at this café right now, as
        served (hot and iced), with any "Cup + Rs X" top-up. Empty when the
        counter would refuse (no plan, not reserved here on My cafés, those
        cups used up, Explorer limit, daily limit, paused). Only drinks
        available today and inside a band. */
    eligibleItems(memberNo, cafeId) {
      // BACKEND: GET /members/:no/eligible?cafe=:id
      const m = memberOf(memberNo);
      const b = S.brandFor(cafeId);
      if (!m || !b) return [];
      const check = S.counterCheck(m.id, cafeId);
      if (!check.ok) return [];
      const band = S.planBand(check.plan.plan, cafeId);
      const out = [];
      b.menu.filter((d) => S.isAvailable(cafeId, d.id)).forEach((d) => {
        ["hot", "iced"].filter((t) => d[t] != null).forEach((t) => {
          const p = S.drinkPrice(b.id, d, t, band);
          if (!p.band) return; // above every band: not a member drink
          out.push({ drinkId: d.id, name: S.drinkLabel(d, t), size: d.size || null, temp: t, price: p.price, band: p.band.id, topUp: p.topUp, included: p.included, inPlan: true });
        });
      });
      return out;
    },

    /** Entries, oldest first, for one café (a branch id, or a brand id for all
        its branches), one member, or everyone (all: true), between from and to. */
    ledgerFor({ cafeId = null, memberNo = null, all = false, from = 0, to = Infinity, types = null } = {}) {
      // BACKEND: GET /ledger?cafe=…&member=…&from=…&to=… (row-level security per role)
      if (!cafeId && memberNo == null && !all) return [];
      const m = memberNo != null ? memberOf(memberNo) : null;
      if (memberNo != null && !m) return [];
      const brand = cafeId ? S.brand(cafeId) : null;
      const branchIds = brand ? S.branches(brand.id).map((c) => c.id) : null;
      return S.ledger()
        .filter((e) => (!m || e.memberId === m.id)
          && (!cafeId || e.cafeId === cafeId || (branchIds && (branchIds.includes(e.cafeId) || e.brandId === brand.id)))
          && e.at >= from && e.at < to && (!types || types.includes(e.type)))
        .sort((x, y) => x.at - y.at)
        .map(view);
    },

    /** What LCC pays a branch for a month: each cup served at the rate of its
        band (capped at the plan's band; see docs/pricing.md), plus paid
        pickup orders less the LCC fee. month: "2026-11", a Date or a time. */
    payoutFor(cafeId, month = Date.now()) {
      // BACKEND: GET /cafes/:id/statement?month=YYYY-MM
      const { from, to, key } = monthRange(month);
      const cups = S.ledger().filter((e) => counts(e) && e.cafeId === cafeId && e.at >= from && e.at < to);
      const cupsPayout = cups.reduce((n, e) => n + S.entryPayout(e), 0);
      const orders = S.paidOrders([cafeId], from);
      // paidOrders counts from a time on; take off anything collected after the month
      const later = S.paidOrders([cafeId], to);
      const paid = { count: orders.count - later.count, gross: orders.gross - later.gross, net: orders.net - later.net };
      return {
        cafeId, month: key,
        cups: cups.reduce((n, e) => n + e.credits, 0),
        cupsPayout,
        paidOrders: paid.count, paidGross: paid.gross, paidNet: paid.net,
        total: cupsPayout + paid.net,
      };
    },

    /** LCC admin only: add (+) or take (−) cups, with a reason. */
    adjust({ memberNo, cups, reason, admin, cafeId = null }) {
      const m = memberOf(memberNo);
      if (!m) return { ok: false, reason: "no-member", message: "No member with that number." };
      return A.adjustCups({ memberId: m.id, cups, reason, admin, cafeId });
    },
  };

  LCC.ledger = ledger;
})();
