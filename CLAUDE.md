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
- `data.js` — fictional seed: 8 cafés, 3 tiers, members with plans and
  member numbers, the ledger (Mumtaz's earlier months, and a month generated
  under the real rules), club rules (levels, badges, perks, gatherings)
- `state.js` — one store with pub-sub (`store.on`, `actions`, `select`), the
  ledger and derived balances, pricing, pass codes, redemption rules, the
  club (`select.club`, gatherings, RSVPs), gifts, presenter sessions,
  `LCC.fmt` formatting
- `ui.js` — templating, icons, toast, bottom sheet, steppers, live pills
- `router.js` — hash router, top switcher (with the presenter Demo menu),
  theme toggle, Pass 1 shells
- `sync.js` — live sync per room: BroadcastChannel (same computer) and
  Supabase Realtime Broadcast (other devices), join handshake, `LCC.sync`
- `kit.js` — `#/kit` component sheet wired to the real store
- `cafe.css`, `cafe.js` — café partner view (`#/cafe`): redeem, busy status, today
- `app.css`, `app.js` — member app (`#/app/…`): shell, in-app routing, tab
  bar, Pass, Home, Map, café sheet, club milestone toasts
- `app-cafes.js` — Cafés tab (search, filters) and café detail (`#/app/cafes/:id`)
- `app-plan.js` — plan picker (Explorer / My cafés), simulated payment
  (`#/app/plan`, `#/app/plan/pay`)
- `app-club.js` — Club tab (`#/app/club`: member card, status, passport,
  badges, perks, gatherings, invite) and gifting (`#/app/gift`)
- `app-welcome.js` — onboarding (`#/app/welcome`) and card issue
  (`#/app/welcome/card`); `LCC.onboarding`
- `club.css` — styles for the Club tab, gifting and onboarding
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
5. [x] Member app: Club, gifting, onboarding
6. [x] Landing page and waitlist
7. [x] Explorer and My cafés plans, cups ledger

Build order was 1, 2, 3, 4, 4.5, 6, 7, 5 (6 and 7 came first on request).

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
- Free cups (`reward` entries) join the Explorer pool. For My cafés they sit
  in `balance().bonus` and can be spent at any café once nothing reserved is
  left there (the redeem entry carries `bonus: true`).
- A new member has `plan: null` until they pay; selectors treat that as no
  cups and "No plan yet".

## Ledger

- `state.ledger` is append-only: `{ id, type: purchase|redeem|gift|expire|reward,
  memberId, cafeId|null, cups, at, cycle }`. `cups` is signed (purchase and
  reward +, the rest −). Redeem entries also carry `drinkId`, `credits`,
  `firstVisit` (and `bonus` when a free cup is spent); the café's redemption
  list is read from them. Gift entries carry `giftCode` and `toName`; reward
  entries a `reason` (`passport-5`, `passport-all`, `invite`, `invited`).
- A month's `total` is purchases plus rewards; `left` is the sum of the
  cycle's entries.
- Balances are never stored. `select.balance`, `poolBalance`, `cafeBalance`,
  `usedHereThisCycle` and `canRedeemHere` derive everything from the entries
  of the member's current `cycle`. Write only through `appendEntries` (via
  actions), which is idempotent by id.
- A plan switch writes `expire` entries for whatever is left (per café for My
  cafés), then `purchase` entries in a new cycle. Works in both directions.
- The club is lifetime, not per cycle: `select.club` reads every redeem
  entry of the member (cups, cafés visited, cups before 9 am, cups per area).
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
  `changedAt` wins; members who joined in this session also send their
  profile, so other devices can look them up); RSVPs (`rsvp`; newest answer
  per member wins).
- Join handshake: a new window says hello. A café window answers with
  statuses plus this session's entries, plan changes and RSVPs; other
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
- Pass 5 (reworked): the Rewards tab is now Club. Status (Member → Local
  30 cups → Connoisseur 100 cups and 10 different cafés, or every partner
  café while there are fewer than 10), passport, badges and perks are all
  derived from the ledger by `select.club`. Rules live in `data.js` `club`;
  the Connoisseur copy is written in `select.club` from the café count.
- Mumtaz: No. 0042, Founding Member, Local (41 cups), 4 of 8 cafés, 7 of 10
  morning cups. Three earlier months on My cafés (Kiln 6, Noon 4, Slow Pour
  3) are seeded in the ledger. A cup at a fifth café gives a free cup.
- Ledger type `reward` (+cups, cafeId null): passport at 5 and at all cafés
  (fixed ids, so once only), invites (both sides). Rewards count in the
  month's total; My cafés members spend them from `balance().bonus`
  (redeem entries carry `bonus: true`).
- Member numbers: first 500 are Founding; new members get
  `club.membersIssued + 1` (No. 0487 in the demo). Invite code = first name
  + number (MUMTAZ42).
- Gatherings: next one is the second Saturday ahead (Maple, 9 am, 30 seats,
  19 taken); Founding Members and Connoisseurs RSVP before the general
  opening a week ahead. RSVPs sync (`rsvp` message, newest wins, in join
  snapshots). Members created in a session sync their profile in the plan
  header, so a café on another device can look them up.
- Gifts: Explorer from the pool (any café), My cafés from one café's cups
  (that café only). Max 3, expire in 60 days, open WhatsApp with a code.
- Presenter "Demo" menu in the switcher: "Start as a new member" and "Back
  to Mumtaz's demo" (`actions.beginNewMember` / `restoreDemo`; Mumtaz's
  data is never touched, except a free cup if her invite code is used).
- Café view after lookup: "No. 0042 · Founding Member · Local" and any perk
  claimable at that café.
