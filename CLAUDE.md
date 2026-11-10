# Lahore Coffee Club

A clickable, high-fidelity prototype of a monthly coffee membership across
Lahore cafés. It is shown to café owners and potential members. There is no
backend: all data is fictional and all state is in memory. One approved
exception: live sync between devices over Supabase Realtime Broadcast
(Pass 4.5; messages only, nothing stored).
Full spec: `docs/spec.md` (verbatim; the source of truth).

## Build and preview

```bash
./build.sh            # assemble src/ into one self-contained index.html
./build.sh --watch    # rebuild on every change in src/
open index.html       # file:// works
python3 -m http.server 8000   # or file://; phones need the deployed link
```

Live: https://lcc-omega.vercel.app (Vercel). The café
view's "Pair a phone" QR always points here (`LIVE_URL` in `sync.js`), with
`#/app/pass?room=XXXX`, even when the café window runs locally.

Routes: `#/` landing, `#/app` member app (phone frame), `#/cafe` café view,
`#/kit` component sheet (not in the switcher; for review).
Any route can carry a sync room: `#/cafe?room=4821`, `#/app/pass?room=4821`.
`index.html` is generated. Edit `src/`, never `index.html`.

## src/ layout

- `index.template.html` — page skeleton; `build.sh` replaces its
  `<!-- @styles -->` and `<!-- @scripts -->` markers
- `base.css` — tokens, light/dark themes, typography, components, shells
- `data.js` — fictional seed: 8 cafés, 3 tiers, members with plans, the
  ledger (generated month under the real rules), badges
- `state.js` — one store with pub-sub (`store.on`, `actions`, `select`), the
  ledger and derived balances, pricing, pass codes, redemption rules,
  gifts, `LCC.fmt` formatting
- `ui.js` — templating, icons, toast, bottom sheet, steppers, live pills
- `router.js` — hash router, top switcher, theme toggle, Pass 1 shells
- `sync.js` — live sync per room: BroadcastChannel (same computer) and
  Supabase Realtime Broadcast (other devices), join handshake, `LCC.sync`
- `kit.js` — `#/kit` component sheet wired to the real store
- `cafe.css`, `cafe.js` — café partner view (`#/cafe`): redeem, busy status, today
- `app.css`, `app.js` — member app (`#/app/…`): shell, in-app routing, tab
  bar, Pass, Home, Map, café sheet
- `app-cafes.js` — Cafés tab (search, filters) and café detail (`#/app/cafes/:id`)
- `app-plan.js` — plan picker (Explorer / My cafés), simulated payment
  (`#/app/plan`, `#/app/plan/pay`)
- `landing.css`, `landing.js` — landing page (`#/`): hero, plans with a live
  Build-your-own teaser, busy map teaser, café estimator, waitlist and
  partner forms, FAQ
- `og.png` (repo root) — 1200×630 link-preview image, rendered with
  headless Chrome; referenced by absolute URL in the template's OG tags

Script order matters: data → state → ui → router → surfaces. New files must
be added to the lists in `build.sh`. Mark API seams with `// BACKEND:` comments.

## Pass plan

This order overrides any order implied by the spec.

1. [x] Design system, data, state, router
2. [x] Café partner view (`#/cafe`)
3. [x] Member app: Pass (QR), Home, Map
4. [x] Member app: Cafés, plan builder, payment
4.5. [x] Cross-device live sync (Supabase Realtime Broadcast)
5. [ ] Member app: gifting, rewards, onboarding
6. [x] Landing page and waitlist
7. [x] Explorer and My cafés plans, cups ledger

Build order so far: 1, 2, 3, 4, 4.5, 6, 7 (6 and 7 came before 5 on request).

**Rule: build one pass at a time, then stop and report. Do not start the
next pass until asked.**

## Plan types

- **Explorer** (the tiers Starter 8 / Regular 16 / Enthusiast 30): one pool of
  cups for any partner café, at most `rules.explorerCapPerCafe` (2) at one café
  per plan cycle. Tier names stay; the type is called Explorer.
- **My cafés** (formerly Build your own): cups reserved per café, usable only
  there. Price = sum(cups × list price × 0.80), rounded to Rs 50; min 6 total,
  max 10 per café.
- Both: max 2 cups per café per day (`rules.dailyLimitPerCafe`).
- Internal ids: `plan.type` is `"explorer"` (`tierId`) or `"mycafes"`
  (`allocation`), stored on each member (`member.plan`), with `member.cycle`.
- Refusal order at the counter: no cups → not reserved here (My cafés) →
  reserved cups here used up → Explorer cap here → daily limit → drink too big.

## Ledger

- `state.ledger` is append-only: `{ id, type: purchase|redeem|gift|expire,
  memberId, cafeId|null, cups, at, cycle }`. `cups` is signed (purchase +, the rest −).
  Redeem entries also carry `drinkId`, `credits`, `firstVisit`; the café's
  redemption list is read from them.
- A month's `total` is its purchases; `left` is the sum of the cycle's
  entries.
- Balances are never stored. `select.balance`, `poolBalance`, `cafeBalance`,
  `usedHereThisCycle` and `canRedeemHere` derive everything from the entries
  of the member's current `cycle`. Write only through `appendEntries` (via
  actions), which is idempotent by id.
- A plan switch writes `expire` entries for whatever is left (per café for My
  cafés), then `purchase` entries in a new cycle. Works in both directions.
- // BACKEND: the ledger becomes an insert-only Supabase table; balances stay
  derived (a view or query per member and cycle).

## Sync (`sync.js`, Pass 4.5)

- Per room (`?room=` in the hash). With no room, the browser reuses its last
  one (localStorage, optional) or makes a 4-digit one.
- Two transports carry the same messages: BroadcastChannel (windows on one
  computer) and Supabase Realtime Broadcast (other devices). Messages are
  de-duplicated by id; incoming ones go through `store.applyRemote`, which
  never re-sends.
- What travels: café status (`cafe:status`); ledger entries of every type
  with a plan header for members whose plan changed (`ledger`; newest
  `changedAt` wins).
- Join handshake: a new window says hello. A café window answers with
  statuses plus this session's entries and plan changes; other
  windows answer with their live data, if any. Snapshot entries apply
  quietly (no redeem events, toasts or success screens).
- If supabase-js can't load or connect, sync falls back to same-computer
  windows and shows "Offline, this device only".

## Decisions

- `--ink-3` is `#70655A` for AA contrast; the spec's `#968B7F` is `--ink-4`,
  used for placeholders only.
- Max 2 redemptions per café per member per day (`rules.dailyLimitPerCafe`).
- Pass codes stay valid for one extra 30s window after rotating.
- The demo member is Mumtaz Begum (initials MB), not the spec's "Ayesha".
  Her internal id stays `m_ayesha` (and the `ayesha` variable in data.js).
- Demo members for the café view (static codes): Bilal 615028 (Explorer, at
  the cap at Kiln & Bean), Sana 207341 (My cafés: Kiln & Bean 6, Maple 4;
  3 + 3 left), Omar 558190 (Explorer Starter, 2 left), Zara 482913 (My cafés,
  daily limit at Kiln & Bean), Hamza 730215 (no cups left).
- Mumtaz: Explorer Regular, 11 of 16, 1 cup at Kiln & Bean this month (so one
  more works there, then the cap refuses).
- Design polish comes later; the current palette and fonts stay for now.
- Payout today = cups today × the café's payout rate. The café's "This month"
  block (calendar month) reads the ledger: cups reserved here and by how many
  My cafés members, cups redeemed so far, payout so far = redeemed × rate.
- 80 background regulars (mixed Explorer / My cafés) have no codes; the seed
  generates the last 10 days of their redemptions under the real rules,
  around each café's `avgDailyCups` (4–9 a day).
- PENDING business decision: `rules.reservedPayoutShare` (default 0) would
  pay cafés a share of unused reserved cups. Computed in `cafeSummary`
  (`reservedPayout`), not shown anywhere yet.
- Busy status uses the cup-level icon (`ui.cupIcon`) everywhere, in ink.
- Live sync (approved exception to "no backend"): Supabase Realtime
  Broadcast only. No tables, no database writes, nothing stored. Only the
  publishable key is in the code; never add a secret key.
- supabase-js 2.118.0 loads from jsDelivr (approved exception: it isn't on
  cdnjs), pinned with SRI.
- QR library: qrcode-generator 1.4.4 from cdnjs; falls back to the 6-digit
  code offline.
- Plan changes apply immediately: leftover cups expire (ledger), new cups
  start fresh, renewal = one month from today.
- Wallet numbers ending in 0000 simulate a failed payment (presenter
  knowledge only, not shown on screen).
- "Add to my plan" adds the café with 2 cups (opens My cafés).
- Landing forms (waitlist, café partner) open WhatsApp to 923100008242 via
  `wa.me` with the details pre-filled, then show a thank-you. Button label:
  "Send on WhatsApp". Mobile numbers must be 03XX XXXXXXX. Favourite café
  is optional; areas include "Somewhere else".
- The landing teaser prices with `select.customPrice` and shares the store's
  builder; "Build your plan in the app" opens `#/app/plan` on My cafés
  with the same cups.
- The café estimator is members × visits × rate (10–200, 1–8, Rs 300–700),
  showing only what the café enters.
- FAQ product answers (to confirm): unused cups don't roll over; cancel any
  time and keep cups until the month ends; billing on the day you joined.
- Pass 5 (gifting, rewards, onboarding) is still to do; Passes 6 and 7
  were built first on request.
