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

  /* Pricing rules, shared by the builder and the landing teaser ------- */
  const rules = {
    customDiscount: 0.8,       // member pays 80% of list price
    roundTo: 50,               // round monthly price to nearest Rs 50
    maxCupsPerCafe: 10,
    minCupsTotal: 6,
    dailyLimitPerCafe: 2,      // cups a member can redeem at one café per day
    passRotateSeconds: 30,
    giftExpiryDays: 60,
    giftMaxCups: 3,
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
     avgDailyCups: a typical day’s cups; drives today’s seed and month-to-date.
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
      avgDailyCups: 22,
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
      avgDailyCups: 18,
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
      avgDailyCups: 26,
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
      avgDailyCups: 15,
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
      avgDailyCups: 16,
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
      avgDailyCups: 24,
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
      avgDailyCups: 20,
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
      avgDailyCups: 19,
    },
  ];

  /* Members --------------------------------------------------------------
     Mumtaz is the demo member. The others exist so the café view can show
     a realistic day, and so error states can be demonstrated:
       Zara  — has already had 2 cups at Kiln & Bean today (daily limit)
       Hamza — no cups left this month                                  */
  const ayesha = {
    id: "m_ayesha",
    firstName: "Mumtaz",
    lastName: "Begum",
    initials: "MB",
    phone: "+92 300 1234567",
    area: "gulberg",
    planId: "regular",
    cupsTotal: 16,
    cupsLeft: 11,
    cycleStartedAt: daysAgo(18),
    renewsAt: daysAgo(-12),
    payment: { method: "JazzCash", last4: "4567" },
    streakWeeks: 4,
    cafesTried: ["kiln", "slowpour", "noon"],
    visits: { kiln: 3, slowpour: 1, noon: 1 },   // loyalty: visits per café
    referralCode: "MUMTAZ-K7",
    onboarded: false,
  };

  const demoMembers = [
    { id: "m_bilal", firstName: "Bilal", cupsTotal: 16, cupsLeft: 7,  staticCode: "615028", visits: { kiln: 6 } },
    { id: "m_sana",  firstName: "Sana",  cupsTotal: 30, cupsLeft: 19, staticCode: "207341", visits: { kiln: 2 } },
    { id: "m_omar",  firstName: "Omar",  cupsTotal: 8,  cupsLeft: 2,  staticCode: "558190", visits: { kiln: 1 } },
    { id: "m_zara",  firstName: "Zara",  cupsTotal: 16, cupsLeft: 9,  staticCode: "482913", visits: { kiln: 4 } },
    { id: "m_hamza", firstName: "Hamza", cupsTotal: 8,  cupsLeft: 0,  staticCode: "730215", visits: { kiln: 2 } },
  ];

  /* Regulars: background members who fill out each café’s day. They have
     no codes, so they can’t be redeemed in the demo; they only appear in
     the café view’s lists and totals.                                  */
  const regulars = ["Fatima", "Usman", "Hira", "Ali", "Mahnoor", "Saad", "Iqra", "Danish", "Noor", "Ahmed", "Rida", "Faraz", "Amna", "Hassan"]
    .map((n) => ({ id: `m_${n.toLowerCase()}`, firstName: n, cupsTotal: 16, cupsLeft: 8, background: true, visits: {} }));

  const members = [ayesha, ...demoMembers, ...regulars];

  /* Redemption log ------------------------------------------------------
     History: Mumtaz’s earlier cups this cycle. With her one cup at Kiln &
     Bean today that makes 5 used (16 − 11).
     Today: generated below, about avgDailyCups per café.               */
  const history = [
    { id: "r1", at: daysAgo(14, 30), cafeId: "kiln",     memberId: "m_ayesha", drinkId: "kiln-flat", credits: 1, firstVisit: false },
    { id: "r2", at: daysAgo(10, 90), cafeId: "slowpour", memberId: "m_ayesha", drinkId: "sp-v60",    credits: 1, firstVisit: true  },
    { id: "r3", at: daysAgo(6, 40),  cafeId: "noon",     memberId: "m_ayesha", drinkId: "noon-capp", credits: 1, firstVisit: true  },
    { id: "r4", at: daysAgo(2, 15),  cafeId: "kiln",     memberId: "m_ayesha", drinkId: "kiln-cort", credits: 1, firstVisit: false },
  ];

  /* Today’s hand-written rows. They set up the café-view demo cases:
     Mumtaz has 1 cup left of her daily limit here, Zara has none.     */
  const handToday = {
    kiln: [
      { memberId: "m_ayesha", drinkId: "kiln-flat" },
      { memberId: "m_zara",   drinkId: "kiln-flat" },
      { memberId: "m_zara",   drinkId: "kiln-cort" },
      { memberId: "m_omar",   drinkId: "kiln-cort", firstVisit: true },
      { memberId: "m_bilal",  drinkId: "kiln-flat" },
      { memberId: "m_sana",   drinkId: "kiln-pour", firstVisit: true },
    ],
  };

  // Small seeded PRNG. Seeded by date, so every open window builds the same day.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  const startOfToday = midnight.getTime();
  const rand = mulberry32(midnight.getFullYear() * 10000 + (midnight.getMonth() + 1) * 100 + midnight.getDate());
  const pick = (list) => list[Math.floor(rand() * list.length)];

  /** n timestamps across today’s open hours so far, weighted by busyByHour.
      Counts stay fixed so the demo looks the same at any hour; early in the
      day they bunch into the hours that have passed.                     */
  function todayTimes(cafe, n) {
    const at = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return startOfToday + (h * 60 + (m || 0)) * MIN; };
    let start = at(cafe.hours.open);
    let close = at(cafe.hours.close);
    if (close <= start) close += DAY;
    let end = Math.min(now - 2 * MIN, close);
    if (end - start < 60 * MIN) { start = Math.max(startOfToday, now - 3 * 60 * MIN); end = now - 2 * MIN; }
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

  function seedToday() {
    const out = [];
    cafes.forEach((cafe) => {
      const specs = (handToday[cafe.id] || []).map((s) => ({ firstVisit: false, ...s }));
      const credits = (s) => cafe.drinks.find((d) => d.id === s.drinkId).credits;
      const cups = () => specs.reduce((n, s) => n + credits(s), 0);
      const perMember = {};
      const oneCup = cafe.drinks.filter((d) => d.credits === 1);
      const twoCup = cafe.drinks.filter((d) => d.credits > 1);
      let guard = 0;
      while (cups() < cafe.avgDailyCups && guard++ < 200) {
        const m = pick(regulars);
        if ((perMember[m.id] || 0) >= rules.dailyLimitPerCafe) continue;
        perMember[m.id] = (perMember[m.id] || 0) + 1;
        const drink = twoCup.length && rand() < 0.08 ? pick(twoCup) : pick(oneCup);
        specs.push({ memberId: m.id, drinkId: drink.id, firstVisit: perMember[m.id] === 1 && rand() < 0.12 });
      }
      // Shuffle, then lay the rows over the day in time order
      for (let i = specs.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [specs[i], specs[j]] = [specs[j], specs[i]]; }
      const times = todayTimes(cafe, specs.length);
      specs.forEach((s, i) => out.push({ id: `t-${cafe.id}-${i}`, at: times[i], cafeId: cafe.id, credits: credits(s), ...s }));
    });
    return out;
  }

  const redemptions = [...history, ...seedToday()];

  /* Rewards ------------------------------------------------------------- */
  const badges = [
    { id: "first-cup",  name: "First cup",     line: "Your first redemption.",           earned: true  },
    { id: "four-weeks", name: "Four weeks",    line: "A cup every week for a month.",    earned: true  },
    { id: "explorer",   name: "Explorer",      line: "Try five different cafés.",        earned: false, progress: 3, goal: 5 },
    { id: "early",      name: "Early riser",   line: "Three cups before 9 am.",          earned: false, progress: 1, goal: 3 },
    { id: "generous",   name: "Generous",      line: "Send your first gift.",            earned: false, progress: 0, goal: 1 },
  ];

  LCC.data = {
    seededAt: now,
    rules,
    tiers,
    areas,
    cafes,
    members,
    memberId: ayesha.id,
    partnerCafeId: "kiln",       // the café shown in the partner view
    redemptions,
    badges,
    // Builder default for the “Build your own” plan
    builderDraft: { kiln: 4, slowpour: 2, noon: 2 },
  };
})();
