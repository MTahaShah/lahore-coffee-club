/* =====================================================================
   Lahore Coffee Club — data.js
   Fictional seed data. No real brands. Timestamps are relative to page
   load so “updated 6 min ago” always reads true.
   // BACKEND: GET /cafes, GET /tiers, GET /me replace this file.
   ===================================================================== */
(function () {
  "use strict";
  const LCC = (window.LCC = window.LCC || {});

  const now = Date.now();
  const MIN = 60 * 1000;
  const DAY = 24 * 60 * MIN;
  const minsAgo = (m) => now - m * MIN;
  const daysAgo = (d, m = 0) => now - d * DAY - m * MIN;
  const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

  /* Pricing rules, shared by the builder and the landing teaser ------- */
  const rules = {
    customDiscount: 0.8,       // member pays 80% of list price
    roundTo: 50,               // round monthly price to nearest Rs 50
    maxCupsPerCafe: 10,
    minCupsTotal: 6,
    dailyLimitPerCafe: 2,      // cups a member can redeem at one café per day
    explorerCapPerCafe: 2,     // Explorer plans: cups at one café per plan cycle (month)
    reservedPayoutShare: 0,    // share of unused reserved cups paid to cafés. PENDING business decision; not shown in the UI
    passRotateSeconds: 30,
    giftExpiryDays: 60,
    giftMaxCups: 3,
    giftMessageMax: 140,
  };

  /* Fixed tiers --------------------------------------------------------- */
  const tiers = [
    { id: "starter",    name: "Starter",    cups: 8,  price: 3500,  line: "Two good coffees a week." },
    { id: "regular",    name: "Regular",    cups: 16, price: 6500,  line: "Most weekdays, sorted." },
    { id: "enthusiast", name: "Enthusiast", cups: 30, price: 11000, line: "One a day, and then some." },
  ];

  /* Map areas (SVG coordinates in a 1000 x 800 viewBox) ----------------- */
  const areas = [
    { id: "gulberg",    name: "Gulberg",    x: 520, y: 360 },
    { id: "liberty",    name: "Liberty",    x: 430, y: 420 },
    { id: "fortress",   name: "Fortress",   x: 660, y: 300 },
    { id: "dha",        name: "DHA",        x: 760, y: 560 },
    { id: "model-town", name: "Model Town", x: 520, y: 600 },
    { id: "johar-town", name: "Johar Town", x: 280, y: 640 },
  ];

  /* Cafés ----------------------------------------------------------------
     busyByHour: typical busyness 0–1 for each hour from 8:00 to 23:00.
     payoutPerCup: the rate the café set; what we pay them per cup.
     avgDailyCups: a typical day’s cups; the seed generates the month around it.
     credits: how many cups from the plan a drink uses.               */
  const cafes = [
    {
      id: "kiln",
      name: "Kiln & Bean",
      area: "gulberg",
      price: 650,
      payoutPerCup: 480,
      tags: ["Roastery", "Pastries"],
      status: "moderate",
      statusUpdatedAt: minsAgo(6),
      hours: { open: "8:00", close: "23:00", label: "8 am – 11 pm" },
      blurb: "Roasts on site every Tuesday. The window seats go first.",
      distanceKm: 0.8,
      x: 545, y: 345,
      drinks: [
        { id: "kiln-flat",   name: "Kiln flat white",       price: 650, credits: 1 },
        { id: "kiln-cort",   name: "Cardamom cortado",      price: 600, credits: 1 },
        { id: "kiln-pour",   name: "Single-origin pour-over", price: 900, credits: 2 },
      ],
      busyByHour: [0.2, 0.45, 0.6, 0.5, 0.4, 0.45, 0.5, 0.4, 0.45, 0.6, 0.8, 0.85, 0.7, 0.55, 0.4, 0.2],
      avgDailyCups: 9,
    },
    {
      id: "maple",
      name: "Maple Roastery",
      area: "dha",
      price: 750,
      payoutPerCup: 560,
      tags: ["Roastery", "Work-friendly"],
      status: "quiet",
      statusUpdatedAt: minsAgo(12),
      hours: { open: "9:00", close: "22:00", label: "9 am – 10 pm" },
      blurb: "Light roasts, long tables, plugs at every seat.",
      distanceKm: 6.4,
      x: 790, y: 545,
      drinks: [
        { id: "maple-espresso", name: "Maple house espresso", price: 550, credits: 1 },
        { id: "maple-latte",    name: "Oat honey latte",      price: 750, credits: 1 },
        { id: "maple-filter",   name: "Ethiopian filter",     price: 950, credits: 2 },
      ],
      busyByHour: [0.1, 0.25, 0.4, 0.45, 0.35, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.65, 0.55, 0.4, 0.25, 0.1],
      avgDailyCups: 5,
    },
    {
      id: "ember",
      name: "Ember Coffee Co.",
      area: "model-town",
      price: 550,
      payoutPerCup: 400,
      tags: ["Pastries", "Garden"],
      status: "packed",
      statusUpdatedAt: minsAgo(3),
      hours: { open: "7:30", close: "22:00", label: "7:30 am – 10 pm" },
      blurb: "A garden café off the park. Croissants until they run out.",
      distanceKm: 5.1,
      x: 500, y: 615,
      drinks: [
        { id: "ember-latte",  name: "Ember latte",          price: 550, credits: 1 },
        { id: "ember-mocha",  name: "Gur mocha",            price: 600, credits: 1 },
        { id: "ember-cold",   name: "Cold brew tonic",      price: 650, credits: 1 },
      ],
      busyByHour: [0.5, 0.7, 0.75, 0.55, 0.45, 0.5, 0.55, 0.5, 0.6, 0.75, 0.9, 0.85, 0.65, 0.5, 0.3, 0.15],
      avgDailyCups: 7,
    },
    {
      id: "thirdfloor",
      name: "Third Floor",
      area: "johar-town",
      price: 500,
      payoutPerCup: 360,
      tags: ["Work-friendly", "Late hours"],
      status: "quiet",
      statusUpdatedAt: minsAgo(18),
      hours: { open: "10:00", close: "1:00", label: "10 am – 1 am" },
      blurb: "Up two flights of stairs, and worth it. Open late for exam season.",
      distanceKm: 9.7,
      x: 290, y: 625,
      drinks: [
        { id: "tf-americano", name: "Americano",            price: 450, credits: 1 },
        { id: "tf-spanish",   name: "Spanish latte",        price: 550, credits: 1 },
        { id: "tf-affogato",  name: "Affogato",             price: 650, credits: 1 },
      ],
      busyByHour: [0.05, 0.1, 0.2, 0.3, 0.35, 0.4, 0.45, 0.45, 0.5, 0.55, 0.65, 0.75, 0.8, 0.85, 0.75, 0.6],
      avgDailyCups: 4,
    },
    {
      id: "quiethours",
      name: "Quiet Hours",
      area: "fortress",
      price: 600,
      payoutPerCup: 440,
      tags: ["Work-friendly", "Pastries"],
      status: "moderate",
      statusUpdatedAt: minsAgo(9),
      hours: { open: "8:00", close: "21:00", label: "8 am – 9 pm" },
      blurb: "No music before noon. Ask for the banana bread.",
      distanceKm: 3.2,
      x: 670, y: 290,
      drinks: [
        { id: "qh-flat",     name: "Flat white",           price: 600, credits: 1 },
        { id: "qh-chai",     name: "Karak chai latte",     price: 500, credits: 1 },
        { id: "qh-cortado",  name: "Brown butter cortado", price: 650, credits: 1 },
      ],
      busyByHour: [0.3, 0.5, 0.55, 0.45, 0.35, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.45, 0.3, 0.15, 0.05, 0],
      avgDailyCups: 4,
    },
    {
      id: "slowpour",
      name: "Slow Pour",
      area: "liberty",
      price: 700,
      payoutPerCup: 520,
      tags: ["Roastery", "Pour-over"],
      status: "packed",
      statusUpdatedAt: minsAgo(4),
      hours: { open: "9:00", close: "24:00", label: "9 am – midnight" },
      blurb: "A six-seat bar and a hand grinder. Worth the wait.",
      distanceKm: 1.6,
      x: 440, y: 405,
      drinks: [
        { id: "sp-v60",     name: "V60 of the week",      price: 800, credits: 1 },
        { id: "sp-gibraltar", name: "Gibraltar",          price: 650, credits: 1 },
        { id: "sp-flight",  name: "Tasting flight",       price: 1300, credits: 2 },
      ],
      busyByHour: [0.15, 0.3, 0.45, 0.5, 0.55, 0.5, 0.55, 0.6, 0.7, 0.8, 0.9, 0.95, 0.85, 0.7, 0.5, 0.3],
      avgDailyCups: 7,
    },
    {
      id: "noon",
      name: "Noon Café",
      area: "gulberg",
      price: 450,
      payoutPerCup: 330,
      tags: ["Pastries", "Breakfast"],
      status: "quiet",
      statusUpdatedAt: minsAgo(22),
      hours: { open: "7:00", close: "20:00", label: "7 am – 8 pm" },
      blurb: "Early opener on MM Alam. Eggs, toast, a proper cappuccino.",
      distanceKm: 1.1,
      x: 575, y: 395,
      drinks: [
        { id: "noon-capp",   name: "Cappuccino",           price: 450, credits: 1 },
        { id: "noon-latte",  name: "Rose latte",           price: 500, credits: 1 },
        { id: "noon-iced",   name: "Iced long black",      price: 450, credits: 1 },
      ],
      busyByHour: [0.6, 0.75, 0.6, 0.45, 0.5, 0.55, 0.4, 0.3, 0.3, 0.35, 0.3, 0.2, 0.1, 0, 0, 0],
      avgDailyCups: 6,
    },
    {
      id: "grind",
      name: "Grind & Grain",
      area: "dha",
      price: 550,
      payoutPerCup: 400,
      tags: ["Pastries", "Roastery"],
      status: "moderate",
      statusUpdatedAt: minsAgo(14),
      hours: { open: "8:00", close: "23:00", label: "8 am – 11 pm" },
      blurb: "Bakery first, coffee a very close second. Sourdough from 9.",
      distanceKm: 7.2,
      x: 735, y: 600,
      drinks: [
        { id: "gg-latte",    name: "Grain latte",          price: 550, credits: 1 },
        { id: "gg-macch",    name: "Macchiato",            price: 450, credits: 1 },
        { id: "gg-dirty",    name: "Dirty chai",           price: 600, credits: 1 },
      ],
      busyByHour: [0.25, 0.5, 0.65, 0.6, 0.5, 0.55, 0.6, 0.5, 0.5, 0.6, 0.7, 0.7, 0.55, 0.4, 0.25, 0.1],
      avgDailyCups: 5,
    },
  ];

  /* Members --------------------------------------------------------------
     Two plan types:
       explorer  one pool of cups for any café, at most 2 a cycle at each
       mycafes   cups reserved per café, usable only there
     Nobody stores a cups-left number: balances come from the ledger below.

     Mumtaz is the demo member. The others exist so the café view (Kiln &
     Bean) can show a realistic month and every rule:
       Bilal  — Explorer, already 2 cups at Kiln & Bean this month (cap)
       Sana   — My cafés: Kiln & Bean 6, Maple Roastery 4 (3 + 3 left)
       Omar   — Explorer Starter, first visit to Kiln & Bean today
       Zara   — My cafés, 2 cups at Kiln & Bean today (daily limit)
       Hamza  — Explorer Starter, no cups left                          */
  const cycleStart = startOfDay(now) - 9 * DAY; // seeded members’ month started 9 days ago
  const cycleOf = (id) => `c_${id}_seed`;

  const mumtaz = {
    id: "m_ayesha",            // internal id kept from an earlier name
    firstName: "Mumtaz",
    lastName: "Begum",
    initials: "MB",
    pronoun: "her",
    phone: "+92 300 1234567",
    area: "gulberg",
    plan: { type: "explorer", tierId: "regular" },
    cycle: cycleOf("m_ayesha"),
    cycleStartedAt: daysAgo(18),
    renewsAt: daysAgo(-12),
    payment: { method: "JazzCash", last4: "4567" },
    // BACKEND: member numbers come from a database sequence, issued once at sign-up
    memberNo: 42,
    // visits and cafesTried are filled in from the ledger below
  };

  const demo = (id, firstName, pronoun, plan, staticCode, visits, memberNo) => ({
    id, firstName, pronoun, plan, staticCode, visits, memberNo,
    cycle: cycleOf(id), cycleStartedAt: cycleStart, renewsAt: cycleStart + 30 * DAY,
  });
  const demoMembers = [
    demo("m_bilal", "Bilal", "him",  { type: "explorer", tierId: "regular" },  "615028", { kiln: 6, slowpour: 2, noon: 2, maple: 2, ember: 1 }, 117),
    demo("m_sana",  "Sana",  "her",  { type: "mycafes", allocation: { kiln: 6, maple: 4 } }, "207341", { kiln: 5, maple: 2 }, 203),
    demo("m_omar",  "Omar",  "him",  { type: "explorer", tierId: "starter" },  "558190", { kiln: 1, noon: 2, slowpour: 2, thirdfloor: 1 }, 356),
    demo("m_zara",  "Zara",  "her",  { type: "mycafes", allocation: { kiln: 6, ember: 4 } }, "482913", { kiln: 4, ember: 2 }, 418),
    demo("m_hamza", "Hamza", "him",  { type: "explorer", tierId: "starter" },  "730215", { kiln: 2, noon: 2, slowpour: 2, grind: 2 }, 529),
  ];

  // Small seeded PRNG. Seeded by date, so every open window builds the same month.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const startOfToday = startOfDay(now);
  const today = new Date(startOfToday);
  const rand = mulberry32(today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate());
  const pick = (list) => list[Math.floor(rand() * list.length)];

  /* Background regulars: they fill each café’s month. No codes, so they
     can’t be redeemed in the demo; they appear in the café view’s lists
     and totals. A mix of plans gives every café some reserved cups.   */
  const REGULAR_NAMES = ["Fatima", "Usman", "Hira", "Ali", "Mahnoor", "Saad", "Iqra", "Danish", "Noor", "Ahmed", "Rida", "Faraz", "Amna", "Hassan", "Areeba", "Hamid", "Maryam", "Taimur", "Sara", "Bilquis"];
  const INITIALS = "ABCDFGHJKMNRSTWZ";
  const REGULAR_COUNT = 80;
  // Popularity weights for My cafés reservations
  const POPULAR = ["kiln", "kiln", "slowpour", "slowpour", "ember", "ember", "noon", "noon", "maple", "grind", "quiethours", "thirdfloor"];
  const regulars = Array.from({ length: REGULAR_COUNT }, (_, i) => {
    const firstName = REGULAR_NAMES[i % REGULAR_NAMES.length];
    const id = `m_r${i}_${firstName.toLowerCase()}`;
    let plan;
    if (rand() < 0.55) {
      const u = rand();
      plan = { type: "explorer", tierId: u < 0.3 ? "starter" : u < 0.8 ? "regular" : "enthusiast" };
    } else {
      const allocation = {};
      const n = 1 + Math.floor(rand() * 3);
      while (Object.keys(allocation).length < n) allocation[pick(POPULAR)] = 2 + Math.floor(rand() * 5);
      let total = Object.values(allocation).reduce((a, b) => a + b, 0);
      const first = Object.keys(allocation)[0];
      if (total < rules.minCupsTotal) allocation[first] += rules.minCupsTotal - total;
      plan = { type: "mycafes", allocation };
    }
    return {
      id, firstName, lastName: `${INITIALS[i % INITIALS.length]}.`, pronoun: "them", plan, background: true, visits: {},
      cycle: cycleOf(id), cycleStartedAt: cycleStart, renewsAt: cycleStart + 30 * DAY,
    };
  });

  const members = [mumtaz, ...demoMembers, ...regulars];

  /* Ledger ----------------------------------------------------------------
     Append-only. Every change to a member’s cups is one entry:
       { id, type: purchase|redeem|gift|expire, memberId, cafeId|null,
         cups (signed: purchase +, everything else −), at, cycle }
     Redeem entries also carry drinkId, credits and firstVisit, so the
     café’s redemption list is read straight from the ledger.
     // BACKEND: this becomes a Supabase table (ledger), insert-only.   */
  const ledger = [];
  let seq = 0;
  const tierCups = (id) => tiers.find((t) => t.id === id).cups;
  function purchase(m) {
    const at = m.cycleStartedAt;
    if (m.plan.type === "explorer") ledger.push({ id: `s${seq++}`, type: "purchase", memberId: m.id, cafeId: null, cups: tierCups(m.plan.tierId), at, cycle: m.cycle });
    else Object.entries(m.plan.allocation).forEach(([cafeId, n]) => ledger.push({ id: `s${seq++}`, type: "purchase", memberId: m.id, cafeId, cups: n, at, cycle: m.cycle }));
  }
  members.forEach(purchase);

  const cafeById = Object.fromEntries(cafes.map((c) => [c.id, c]));
  const drinkCredits = (cafeId, drinkId) => cafeById[cafeId].drinks.find((d) => d.id === drinkId).credits;
  function redeem(m, cafeId, drinkId, at, firstVisit = false) {
    const credits = drinkCredits(cafeId, drinkId);
    ledger.push({ id: `s${seq++}`, type: "redeem", memberId: m.id, cafeId, cups: -credits, credits, drinkId, firstVisit, at, cycle: m.cycle });
  }

  /* Mumtaz’s earlier months --------------------------------------------
     She joined three months before this cycle on My cafés (Kiln & Bean 6,
     Noon Café 4, Slow Pour 3), used 12 of 13 cups each month, then
     switched to Explorer Regular when this cycle began. The Club tab
     (status, passport, badges) reads all of it from the ledger.        */
  const clockAgo = (d, h, m = 0) => startOfToday - d * DAY + (h * 60 + m) * MIN;
  const monthsBefore = (ts, n) => { const d = new Date(ts); d.setMonth(d.getMonth() - n); return d.getTime(); };
  (function mumtazHistory() {
    const plan = { kiln: 6, noon: 4, slowpour: 3 };
    // [day in cycle, café, drink, hour, minute]; two Noon cups a month before 9 am
    const MONTH = [
      [1, "kiln", "kiln-flat", 10, 30], [3, "noon", "noon-capp", 8, 10], [5, "kiln", "kiln-cort", 13, 15],
      [7, "slowpour", "sp-v60", 18, 20], [9, "kiln", "kiln-flat", 16, 40], [11, "noon", "noon-latte", 8, 35],
      [13, "kiln", "kiln-cort", 11, 5], [15, "noon", "noon-capp", 12, 30], [18, "slowpour", "sp-gibraltar", 19, 0],
      [21, "kiln", "kiln-flat", 15, 20], [24, "noon", "noon-iced", 14, 45], [27, "kiln", "kiln-cort", 10, 50],
    ];
    for (let k = 3; k >= 1; k--) {
      const start = startOfDay(monthsBefore(mumtaz.cycleStartedAt, k));
      const end = k === 1 ? mumtaz.cycleStartedAt : startOfDay(monthsBefore(mumtaz.cycleStartedAt, k - 1));
      const cycle = `c_m_ayesha_past${k}`;
      Object.entries(plan).forEach(([cafeId, n]) => ledger.push({ id: `s${seq++}`, type: "purchase", memberId: mumtaz.id, cafeId, cups: n, at: start + 9 * 60 * MIN, cycle }));
      MONTH.forEach(([day, cafeId, drinkId, h, m]) => {
        ledger.push({ id: `s${seq++}`, type: "redeem", memberId: mumtaz.id, cafeId, cups: -1, credits: drinkCredits(cafeId, drinkId), drinkId, firstVisit: k === 3 && day <= 7, at: start + day * DAY + (h * 60 + m) * MIN, cycle });
      });
      // The plan ended with one Slow Pour cup unused
      ledger.push({ id: `s${seq++}`, type: "expire", memberId: mumtaz.id, cafeId: "slowpour", cups: -1, at: end, cycle });
    }
    mumtaz.memberSince = startOfDay(monthsBefore(mumtaz.cycleStartedAt, 3));
  })();

  /* Hand-written history: earlier this cycle, before today ----------- */
  const before = (k, n) => startOfToday - Math.round(((n - k) / (n + 1)) * 8 * DAY) - 3 * 60 * MIN; // spread over the last 8 days
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  const HISTORY = {
    m_ayesha: [["noon", "noon-capp", clockAgo(14, 8, 20)], ["slowpour", "sp-v60", clockAgo(10, 17, 40)], ["grind", "gg-latte", clockAgo(6, 11, 10)], ["slowpour", "sp-gibraltar", clockAgo(2, 19, 5)]],
    m_bilal:  [["kiln", "kiln-cort"], ["slowpour", "sp-v60"], ["slowpour", "sp-gibraltar"], ["noon", "noon-capp"], ["noon", "noon-iced"], ["maple", "maple-latte"], ["maple", "maple-espresso"], ["ember", "ember-latte"]],
    m_sana:   [["kiln", "kiln-flat"], ["kiln", "kiln-cort"], ["maple", "maple-latte"]],
    m_omar:   [["noon", "noon-capp"], ["noon", "noon-latte"], ["slowpour", "sp-v60"], ["slowpour", "sp-gibraltar"], ["thirdfloor", "tf-spanish"]],
    m_zara:   [["ember", "ember-latte"], ["ember", "ember-mocha"], ["kiln", "kiln-flat"]],
    m_hamza:  [["kiln", "kiln-flat"], ["kiln", "kiln-cort"], ["noon", "noon-capp"], ["noon", "noon-latte"], ["slowpour", "sp-v60"], ["slowpour", "sp-gibraltar"], ["grind", "gg-latte"], ["grind", "gg-macch"]],
  };
  Object.entries(HISTORY).forEach(([id, rows]) => rows.forEach(([cafeId, drinkId, at], k) => redeem(byId[id], cafeId, drinkId, at || before(k, rows.length))));

  /* Today’s hand-written rows at Kiln & Bean (the café view’s demo café).
     Mumtaz: 1 of 2 at Kiln & Bean this month. Zara: daily limit.       */
  const handToday = {
    kiln: [
      { memberId: "m_ayesha", drinkId: "kiln-flat" },
      { memberId: "m_zara",   drinkId: "kiln-flat" },
      { memberId: "m_zara",   drinkId: "kiln-cort" },
      { memberId: "m_omar",   drinkId: "kiln-cort", firstVisit: true },
      { memberId: "m_bilal",  drinkId: "kiln-flat" },
      { memberId: "m_sana",   drinkId: "kiln-flat" },
    ],
  };

  /** n timestamps across a day’s open hours, weighted by busyByHour.
      Today: only the hours that have passed (counts stay fixed, so the
      demo looks the same at any hour; early on they bunch up).        */
  function dayTimes(cafe, dayStart, n, isToday) {
    const at = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return dayStart + (h * 60 + (m || 0)) * MIN; };
    let start = at(cafe.hours.open);
    let close = at(cafe.hours.close);
    if (close <= start) close += DAY;
    let end = isToday ? Math.min(now - 2 * MIN, close) : close;
    if (isToday && end - start < 60 * MIN) { start = Math.max(dayStart, now - 3 * 60 * MIN); end = now - 2 * MIN; }
    if (end <= start) start = end - 30 * MIN;
    const slots = [];
    let total = 0;
    for (let t = start; t < end; ) {
      const next = new Date(t); next.setMinutes(60, 0, 0);
      const stop = Math.min(end, next.getTime());
      const w = Math.max(0.08, cafe.busyByHour[new Date(t).getHours() - 8] ?? 0.1) * (stop - t);
      slots.push({ t, stop, w }); total += w; t = stop;
    }
    return Array.from({ length: n }, () => {
      let u = rand() * total;
      const slot = slots.find((s) => (u -= s.w) <= 0) || slots[slots.length - 1];
      return Math.round(slot.t + rand() * (slot.stop - slot.t));
    }).sort((a, b) => a - b);
  }

  /* Regulars’ month so far, generated under the real rules: balance,
     2 a day per café, Explorer 2 a cycle per café, My cafés only where
     reserved.                                                         */
  (function generateMonth() {
    const left = {};      // memberId -> pool left (explorer) or { cafeId: left } (mycafes)
    const usedHere = {};  // memberId -> { cafeId: cups this cycle }
    regulars.forEach((m) => {
      left[m.id] = m.plan.type === "explorer" ? tierCups(m.plan.tierId) : { ...m.plan.allocation };
      usedHere[m.id] = {};
    });
    const canUse = (m, cafeId, credits, today) => {
      if ((today[m.id]?.[cafeId] || 0) + credits > rules.dailyLimitPerCafe) return false;
      if (m.plan.type === "mycafes") return (left[m.id][cafeId] || 0) >= credits;
      return left[m.id] >= credits && (usedHere[m.id][cafeId] || 0) + credits <= rules.explorerCapPerCafe;
    };
    const use = (m, cafeId, credits, today) => {
      if (m.plan.type === "mycafes") left[m.id][cafeId] -= credits; else left[m.id] -= credits;
      usedHere[m.id][cafeId] = (usedHere[m.id][cafeId] || 0) + credits;
      today[m.id] = today[m.id] || {};
      today[m.id][cafeId] = (today[m.id][cafeId] || 0) + credits;
    };
    for (let d = 9; d >= 0; d--) {
      const dayStart = startOfToday - d * DAY;
      const isToday = d === 0;
      const todayUse = {};
      cafes.forEach((cafe) => {
        const hand = isToday ? (handToday[cafe.id] || []) : [];
        const handCups = hand.reduce((n, s) => n + drinkCredits(cafe.id, s.drinkId), 0);
        // A normal day wobbles around the café’s average
        let target = Math.max(0, Math.round(cafe.avgDailyCups * (0.75 + rand() * 0.5)) - handCups);
        if (isToday) target = Math.max(0, cafe.avgDailyCups - handCups); // fixed, so today looks the same all day
        const oneCup = cafe.drinks.filter((x) => x.credits === 1);
        const twoCup = cafe.drinks.filter((x) => x.credits > 1);
        const rows = hand.map((s) => ({ m: byId[s.memberId], drinkId: s.drinkId, firstVisit: !!s.firstVisit }));
        let cups = 0, guard = 0;
        while (cups < target && guard++ < 400) {
          const m = pick(regulars);
          const drink = twoCup.length && rand() < 0.08 ? pick(twoCup) : pick(oneCup);
          if (!canUse(m, cafe.id, drink.credits, todayUse)) continue;
          use(m, cafe.id, drink.credits, todayUse);
          const first = !(m.visits[cafe.id] > 0) && rand() < 0.35;
          m.visits[cafe.id] = (m.visits[cafe.id] || 0) + 1;
          rows.push({ m, drinkId: drink.id, firstVisit: first });
          cups += drink.credits;
        }
        for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }
        const times = dayTimes(cafe, dayStart, rows.length, isToday);
        rows.forEach((r, i) => redeem(r.m, cafe.id, r.drinkId, times[i], r.firstVisit));
      });
    }
  })();
  ledger.sort((a, b) => a.at - b.at);

  // Mumtaz’s lifetime visits per café (café-detail loyalty), straight from her ledger
  mumtaz.visits = {};
  ledger.filter((e) => e.memberId === mumtaz.id && e.type === "redeem").forEach((e) => { mumtaz.visits[e.cafeId] = (mumtaz.visits[e.cafeId] || 0) + 1; });
  mumtaz.cafesTried = Object.keys(mumtaz.visits);

  /* The club ---------------------------------------------------------------
     Status, passport and badges are earned by use and computed from the
     ledger in state.js (select.club). Only the rules live here.         */
  const saturdayFrom = (ts, dir) => { const d = new Date(startOfDay(ts)); while (d.getDay() !== 6) d.setDate(d.getDate() + dir); return d.getTime(); };
  const club = {
    foundingLimit: 500,         // the first 500 member numbers are Founding Members
    membersIssued: 486,         // the next new member gets No. 0487. BACKEND: a sequence
    // Free cup when the passport reaches these counts ("all" = every partner café)
    passportRewards: [5, "all"],
    inviteReward: 1,            // cups each, for the member and the friend they invite
    levels: [
      { id: "member",      name: "Member",      plural: "Members",      cups: 0,   cafes: 0,  line: "Everyone starts here." },
      { id: "local",       name: "Local",       plural: "Locals",       cups: 30,  cafes: 0,  line: "30 cups with the club." },
      { id: "connoisseur", name: "Connoisseur", plural: "Connoisseurs", cups: 100, cafes: 10, line: null }, // 10 cafés, or every partner café while there are fewer (line is written in select.club)
    ],
    // metric: cups | founding | cafes | morning (cups before 9 am) | area:<id>; goal "all" = every partner café
    badges: [
      { id: "first-cup",  name: "First cup",       how: "Have your first cup with the club.",   metric: "cups",         goal: 1 },
      { id: "founding",   name: "Founding Member", how: "One of the first 500 members.",        metric: "founding",     goal: 1 },
      { id: "explorer",   name: "Explorer",        how: "Have a cup at 5 different cafés.",     metric: "cafes",        goal: 5 },
      { id: "all-lahore", name: "All of Lahore",   how: "Have a cup at every partner café.",    metric: "cafes",        goal: "all" },
      { id: "morning",    name: "Morning person",  how: "10 cups before 9 am.",                 metric: "morning",      goal: 10 },
      { id: "gulberg",    name: "Gulberg local",   how: "10 cups at cafés in Gulberg.",         metric: "area:gulberg", goal: 10 },
    ],
    // Funded by each café, not by plans. for: local (Local and up) | connoisseur | founding
    perks: [
      { id: "kiln-shot",      cafeId: "kiln",     for: "local",       text: "An extra shot in any drink, on the house" },
      { id: "kiln-pastry",    cafeId: "kiln",     for: "connoisseur", text: "A free pastry with your coffee, once a week" },
      { id: "noon-refill",    cafeId: "noon",     for: "local",       text: "A free refill on filter coffee" },
      { id: "ember-croissant", cafeId: "ember",   for: "local",       text: "Half-price croissants before 10 am" },
      { id: "slowpour-first", cafeId: "slowpour", for: "connoisseur", text: "The first pour of every new single origin" },
      { id: "maple-beans",    cafeId: "maple",    for: "founding",    text: "A bag of the house roast on your club anniversary" },
    ],
    // BACKEND: gatherings and RSVPs become tables (gatherings, rsvps); seats are enforced server-side
    gatherings: [
      {
        id: "gather-maple-cupping",
        kind: "Club morning",
        title: "Cupping at Maple Roastery",
        cafeId: "maple",
        at: saturdayFrom(now + 14 * DAY, 1) + 9 * 60 * MIN,
        seats: 30,
        taken: 19,                // RSVPs before this session
        priorityDays: 7,          // Founding Members and Connoisseurs book first; everyone else from a week before
        line: "Six coffees from three origins, tasted side by side with Maple’s roaster. Tea and something baked after.",
      },
      {
        id: "gather-slowpour-brew",
        kind: "Club evening",
        title: "Brew bar at Slow Pour",
        cafeId: "slowpour",
        at: saturdayFrom(now - 14 * DAY, -1) + 18 * 60 * MIN,
        seats: 24,
        came: 22,
        line: "Three brew methods, one coffee, and a long argument about which was best.",
      },
    ],
  };

  LCC.data = {
    seededAt: now,
    rules,
    tiers,
    areas,
    cafes,
    members,
    memberId: mumtaz.id,
    partnerCafeId: "kiln",       // the café shown in the partner view
    ledger,
    club,
    // Builder default for the “My cafés” plan
    builderDraft: { kiln: 4, slowpour: 2, noon: 2 },
  };
})();
