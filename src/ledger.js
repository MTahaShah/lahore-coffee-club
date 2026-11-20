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
     LCC.ledger.passUsedToday(42)                  -> true
     LCC.ledger.savingsThisMonth(42)               -> 800 (Rs, this pass month)
     LCC.ledger.memberCupsThisMonth("kiln")        -> { cups, pass, total }

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
     pass-sale 0  an LCC Pass coffee: the member paid the café the member
                 price (listPrice, memberPrice, discount, drinkId, temp,
                 staffId, at). No cups and no LCC payout; it counts for
                 the club (passport, Beans, Circles) like a cup
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

  const TYPES = ["purchase", "redeem", "pass-sale", "hold", "release", "cancel", "undo", "adjust", "reward", "gift", "expire", "beans"];

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
      channel: e.channel || (e.orderId ? "pickup" : e.type === "redeem" || e.type === "undo" || e.type === "pass-sale" ? "counter" : null),
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
        available today that the café has in LCC plans (inPlan). */
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
        if (d.inPlan === false) return; // the café keeps it out of LCC plans
        ["hot", "iced"].filter((t) => d[t] != null).forEach((t) => {
          const p = S.drinkPrice(b.id, d, t, band);
          out.push({ drinkId: d.id, name: S.drinkLabel(d, t), size: d.size || null, temp: t, price: p.price, band: p.band?.id || null, topUp: p.topUp, included: p.included, inPlan: true });
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
      const { from, key } = monthRange(month);
      const p = S.monthPayout(cafeId, from); // the same sums #/partner shows
      const rec = S.payoutRecord(cafeId, from);
      return {
        cafeId, month: key,
        cups: p.cups,
        cupsPayout: p.cupEarned,
        paidOrders: p.paid.count, paidGross: p.paid.gross, paidNet: p.paid.net,
        total: p.earned,
        paidAt: rec?.paidAt || null, // a payout record exists (seeded history, or marked paid in admin)
      };
    },

    /* ---------------- LCC Pass ---------------- */

    /** Has this Pass member had today's member coffee (planConfig.pass.dailyLimit)? */
    passUsedToday(memberNo, at = Date.now()) {
      // BACKEND: SELECT count(*) FROM ledger WHERE member_id = :id AND type = 'pass-sale' AND at >= today
      const m = memberOf(memberNo);
      return m ? S.passToday(m.id, at).used : false;
    },

    /** Rs saved on pass sales this month (list price less member price).
        For a Pass member "this month" is the pass month, from the day it
        started or last renewed; otherwise the calendar month. */
    savingsThisMonth(memberNo, at = Date.now()) {
      // BACKEND: SELECT sum(list_price - member_price) FROM ledger WHERE member_id = :id AND type = 'pass-sale' AND at >= :since
      const m = memberOf(memberNo);
      return m ? S.passMonth(m.id, at).saved : 0;
    },

    /** Member coffees at a café (a branch id, or a brand id for all its
        branches) this calendar month: cups redeemed plus pass sales. */
    memberCupsThisMonth(cafeId, month = Date.now()) {
      // BACKEND: SELECT type, count(*) FROM ledger WHERE cafe_id = ANY(:branches) AND type IN ('redeem','pass-sale') AND month = :m
      const { from, to } = monthRange(month);
      const rows = ledger.ledgerFor({ cafeId, from, to, types: ["redeem", "pass-sale"] }).filter((e) => !e.undone);
      const cups = rows.filter((e) => e.type === "redeem").reduce((n, e) => n + (e.credits || 1), 0);
      const pass = rows.filter((e) => e.type === "pass-sale").length;
      return { cafeId, cups, pass, total: cups + pass };
    },

    /** Record a Pass sale (the counter, from the café pass on). See actions.recordPassSale. */
    passSale({ memberNo, branchId, drinkId, temp, staffId, method, at }) {
      const m = memberOf(memberNo);
      if (!m) return { ok: false, reason: "no-member", message: "No member with that number." };
      return A.recordPassSale({ memberId: m.id, branchId, drinkId, temp, staffId, method, at });
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
