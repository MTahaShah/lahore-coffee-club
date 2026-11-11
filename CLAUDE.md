# Lahore Coffee Club

A clickable, high-fidelity prototype of a monthly coffee membership across
Lahore cafés. It is shown to café owners and potential members. There is no
backend: all data is fictional and all state is in memory. One approved
exception: live sync between devices over Supabase Realtime Broadcast
(Pass 4.5; messages only, nothing stored).
Full spec: `docs/spec.md` (verbatim; the source of truth for product and
behaviour).

## Design

**`docs/BRAND.md` is the design source of truth** and replaces the spec's
design system (colours, type, logos). Visual reference:
`docs/LCC-Brand-Book.pdf` (pages 15–19: brick ring, app screens, café
counter screen).

- Colour: black, white and cream are the base in both modes; the coffee
  palette is for small accents only (see "Where accents are allowed" in
  BRAND.md: the cups-left bricks, the QR ring, the monogram's bricks, the
  active tab, the savings line, eyebrows, one highlight per screen). Tokens
  live in `src/base.css`: neutrals (`--bg`, `--surface`, `--ink`, `--line`,
  `--primary` = black on light, cream on dark), `--accent-text` (the only
  coffee colour for text), and fixed `--accent`, `--accent-deep`,
  `--espresso`, `--mocha`, `--roast`, plus `--black`, `--white`, `--cream`.
  No espresso or brown backgrounds anywhere.
- Dark mode is black with cream text (`prefers-color-scheme`, the theme
  toggle, and `.theme-dark` for surfaces that are always dark, such as the
  pass screen).
- Type: Glacial Indifference (`src/fonts/`, inlined by `build.sh`) for all
  Latin text; Urdu uses `--font-urdu` ("29LT Bukra", then "Noto Sans
  Arabic"). Small caps labels are tracked 0.3em.
- Logos: the SVGs in `src/logos/`, never retyped. `build.sh` inlines them
  as `<template id="logo-NAME">`; render with `ui.logo(name)`. Colours come
  from `--logo-ink` (= `--ink`), and `--logo-face`, `--logo-side`,
  `--logo-top` (coffee tones, so the bricks are the colour pop).
- Brick ring: `ui.brickRing()`, one brick per cup, gap at 3 o'clock, used
  cups outlined (Home ring in `--accent-text`, caramel around the QR on the
  black pass screen).
- Hairlines, no shadows. Status colours only for busy status, with text.
- Matcha mode (member app only): a second flavour, `[data-flavour="matcha"]`
  on `<html>` in `base.css` (colour tokens only, light and dark; coffee
  stays the default). `router.js` owns flavour and Light / Dark / Auto
  (`LCC.theme`: `flavour()`, `mode()`, `setFlavour`, `setMode`), sets the
  attribute only while `#/app` shows (café view, landing and kit stay
  coffee), crossfades 300ms (`.theme-fading`, none with reduced motion)
  and sets the theme-color metas from `--bg`. Switch: Appearance in the
  profile drawer. In Matcha, menus list matcha first and the Cafés list
  tags cafés whose drinks include matcha (`lcc:flavour` DOM event repaints).
  Text accent is #4E6A25 on light (the #6E8B3D accent is 3.45:1, rings
  and bars only).

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
`index.html` is generated (one self-contained file: fonts, logos and
favicon are inlined). Edit `src/`, never `index.html`.

## src/ layout

- `index.template.html` — page skeleton; `build.sh` replaces its
  `<!-- @favicon -->`, `<!-- @styles -->`, `<!-- @logos -->` and
  `<!-- @scripts -->` markers
- `base.css` — brand tokens, light/dark themes, `@font-face`,
  typography, components, shells
- `fonts/` — Glacial Indifference Regular and Bold (woff2)
- `logos/` — wordmark, horizontal monogram, ring, app icons, favicon
- `data.js` — seed: 8 fictional cafés, the Double Shot brand (7 branches,
  menu, economics, plans), 3 tiers, members with plans and
  member numbers, the ledger (Mumtaz's earlier months, and a month generated
  under the real rules), club rules (levels, badges, perks, gatherings)
- `state.js` — one store with pub-sub (`store.on`, `actions`, `select`), the
  ledger and derived balances, pricing, pass codes, redemption rules, the
  club (`select.club`, gatherings, RSVPs), Beans (`select.beans`),
  referrals (`select.invitations`), gifts, pickup orders (`state.orders`),
  group orders (`state.groups`), Circles (`state.circles`, `rounds`,
  `acks`, `member.privacy`), presenter sessions, `LCC.fmt` formatting
- `ui.js` — templating, icons, logos (`ui.logo`), the brick ring
  (`ui.brickRing`), toast, bottom sheet, steppers, live pills
- `router.js` — hash router, top switcher (with the presenter Demo menu),
  theme toggle, Pass 1 shells
- `sync.js` — live sync per room: BroadcastChannel (same computer) and
  Supabase Realtime Broadcast (other devices), join handshake, `LCC.sync`
- `kit.js` — `#/kit` component sheet wired to the real store
- `cafe.css`, `cafe.js` — café partner view (`#/cafe`): header (staff on
  shift, taking or paused), Counter, Orders, Today, Payouts, Settings; a
  left rail on tablets (768px and up), segmented tabs on phones
- `app.css`, `app.js` — member app (`#/app/…`): shell, in-app routing, tab
  bar (Home · Cafés · Pass · Circles · Club; the Circles icon is a small
  `ui.brickRing`), Pass, Home, the busy map (`ctx.busyMap`, drawn in the
  Cafés tab), café sheet, club milestone toasts. Old links redirect:
  `#/app/map` → Cafés with Map, `#/app/circle/…` → `#/app/circles/…`
- `app-cafes.js` — Cafés tab (search, filters, a List | Map switch; search
  and filters apply to both) and café detail (`#/app/cafes/:id`)
- `app-brand.js` — a brand's page (`#/app/cafes/doubleshot`, also from any
  branch row or pin): your cups, menu with Hot / Iced, ordering ("Use a
  cup"), branches, plans
- `app-plan.js` — plan picker (Explorer / My cafés), simulated payment
  (`#/app/plan`, `#/app/plan/pay`); shares its payment helpers as
  `LCC.payKit`
- `app-order.js` — pickup orders (`#/app/order`, `#/app/order/pay`), group
  orders (`#/app/group/:id`), the order status card (Home, profile
  drawer); `LCC.appOrder`
- `app-club.js` — Club tab (`#/app/club`, personal only: Beans at the top
  with their sheet, passport, member card, status, perks, badges, invite
  with statuses, Send a gift) and gifting (`#/app/gift`)
- `app-circles.js` — the Circles tab (`#/app/circles`: Upcoming, today's
  rounds from all your Circles and gatherings with an RSVP, soonest first;
  Your Circles; Recent, activity from all your Circles), a Circle
  (`#/app/circles/:id`) and its invitation link (`#/app/circles/:id/join`)
- `app-welcome.js` — onboarding (`#/app/welcome`) and card issue
  (`#/app/welcome/card`); `LCC.onboarding`
- `club.css` — styles for the Club tab, gifting and onboarding
- `landing.css`, `landing.js` — landing page (`#/`): hero, plans with a live
  Build-your-own teaser, busy map teaser, café estimator, waitlist and
  partner forms, FAQ
- `manifest.json`, `sw.js` — installable app (PWA). `build.sh` copies them,
  and the icons (`logos/app-icon-192.png`, `-512`, `-maskable-512`,
  `apple-touch-icon-180.png`, resized from `app-icon-cream-1024.png`) into
  `icons/`, next to `index.html`. The service worker is network first; bump
  `CACHE_VERSION` to clear old caches
- `manifest-cafe.json` — the café app, "LCC Cafés" (id `./?app=cafe`; the
  member manifest is `./?app=member`). `build.sh` also writes `cafe.html`:
  the same page with this manifest, "LCC Cafés" titles, opening on
  `#/cafe` when there's no route. Installed, the café view keeps the screen
  awake (Wake Lock, re-requested on return, silent if unsupported)
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
8. [x] Pickup orders: order ahead with a cup or online payment, café queue
9. [x] Club: Beans, referrals, group orders
10. [x] Club: Circles with rounds, activity and the brick-ring mark

Build order was 1, 2, 3, 4, 4.5, 6, 7, 5, 8, 9, 10 (6 and 7 came first on request).
The user's "Pass E" is Pass 9 here.

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
- **Brand** (`plan.type` `"brand"`, `brandId`, `planId`): Double Shot plans,
  8 cups Rs 5,600 · 15 Rs 9,750 · 22 Rs 13,500. Cups belong to the brand, not
  a branch: one pool, any branch. A brand branch takes only its own brand's
  cups (`brand-only`); brand cups work nowhere else (`not-brand`). Explorer
  and My cafés cover the other cafés only (`select.clubCafes()`).

## Double Shot (demo partner)

- The one real brand, by name only: no logo, a neutral "DS" monogram
  (`.monogram`). Config in `data.js` `brands`: menu (drinks only; `hot` /
  `iced` prices, null if not served that way), `menuNote` ("Prices from
  Double Shot's public menu, Nov 2026. Demo only."), plans, economics.
- Economics: a cup covers any drink up to Rs 880 (`coverUpTo`); above that
  "Cup + Rs X" is paid at the till (`topUp`). Payout per cup = 72%
  (`payoutShare`) × min(price, 880), so at most Rs 634 (`select.entryPayout`).
- Branches are cafés with `brandId`, `branch`, `short`, `label`, `pinName`:
  Gulberg · Falcon Complex, Cantt · C Block, Model Town, DHA · Phase 6,
  DHA · Lalak Jan Chowk, Pine Avenue, DHA · Dolmen Mall. New area: Cantt.
- Brand redeem entries carry `brandId`, `drinkId`, `temp`, `price`, `topUp`.
- Ordering: the member picks a drink and taps "Use a cup"
  (`actions.placeOrder`; `member.order`, fresh for 3 hours). It syncs
  (`order` message, newest wins, in join snapshots) and shows on the Pass and
  the counter; nothing is spent until the counter redeems, which clears it.
- Club: a brand counts as one café (one passport stamp, any branch), so the
  passport has 9 stamps.
- Café view: Double Shot is one choice in the Demo café picker; branches are
  picked in the header. Today and Payouts have This branch / All branches.
  Settings shows the cover rule (set by the brand) instead of the checkboxes.
- Demo codes: Rabia 341862 (5 of 8), Kamran 905417 (daily limit at
  Gulberg), Nida 274639 (no cups). Explorer / My cafés codes are refused at
  Double Shot. Staff PINs: branch number (list order) then 234 (counter) or
  678 (manager): Gulberg 1234 / 1678 … Dolmen 7234 / 7678.
- 90 background Double Shot regulars generate the last 10 days under the
  real rules; three months of payout history per branch (amounts seeded).

## Ledger

- `state.ledger` is append-only: `{ id, type: purchase|redeem|gift|expire|reward|hold|release|beans,
  memberId, cafeId|null, cups, at, cycle }`. `cups` is signed (purchase,
  reward and release +, the rest −). `hold` / `release` belong to pickup
  orders (they carry `orderId`, and `itemId` at a table; see Pickup
  orders). `beans` entries have 0 cups and carry `beans` (signed),
  `title`, `meta`: Beans spent on rewards (see Beans). Redeem entries also carry `drinkId`, `credits`,
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
- What travels: Circles (`circle`, newest `updatedAt` wins; `round`,
  answers merge per member; `ack`, add or undo, newest wins per member and entry; `privacy`,
  newest wins; all in join snapshots); tables (`group`, the whole table; drinks merge by id,
  header newest wins, sent / cancelled stay; in join snapshots); pickup orders (`pickup`, the whole order; status only moves
  forward, finished ones never change; in join snapshots); café status (`cafe:status`); ledger entries of every type
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

## Pickup orders (Pass 8)

- Member app: "Order for pickup" is Home's primary button (Change plan and
  Send a gift are quiet links under it), on every café page and drink row,
  the brand menu's drink sheet ("Use a cup at the counter" is the old
  pass choice) and the map sheet. `#/app/order`: café or branch (defaults
  to the nearest one taking orders), drink, Hot / Iced, pickup time
  ("ASAP, about 10 min" or 15-minute slots until 15 min before closing,
  `select.pickupTimes`), and Use a cup or Pay the full price. A cup's
  top-up, or the full price, is paid online on `#/app/order/pay` (same
  simulated payment as plans; a wallet ending 0000 fails).
- One drink per order (the data is per order; place another for a second).
- `state.orders[id]`: `{ memberId, memberName, cafeId, brandId, drinkId,
  temp, price, credits, topUp, pay: "cup"|"paid", amount (paid online),
  payment, asap, pickupAt, status, placedAt, updatedAt, times, reason }`.
  Status: placed → making → ready → collected, or cancelled / rejected.
  Pickup code and reference are derived from the id
  (`select.pickupCode`, `pickupRef`; cup orders reuse `redemptionRef` of
  their redeem entry `rd_<orderId>`).
- Cups: placing a cup order writes `hold` (−cups, `hd_<id>`); cancel or
  reject writes `release` (+cups, `rl_<id>`); Collected writes the release
  plus an ordinary `redeem` (with `orderId`, and `topUpOnline` when the
  top-up was paid in the app). So the counter's checks count held cups
  (`usedToday`, `usedHereThisCycle`, `cafeCupsToday`), and a collected cup
  pays out, stamps the passport and counts for the club like any other.
- Cancel: the member, while the order is placed and within
  `rules.orderCancelMinutes` (2). Reject: the café, before Ready, with
  "Out of stock" or "Closing soon"; the cup comes back, paid amounts are
  marked refunded. No new orders while the café is paused or closed.
- Café view Orders tab: this branch's queue, oldest first, big Start /
  Ready / Collected buttons, Reject with a reason, the till line and
  reference on every ticket; a badge counts new (placed) orders. Done
  today lists finished ones.
- Money: cup orders pay out exactly as redemptions. Paid orders and online
  top-ups: the café gets `amount × (1 − rules.orderFeeShare)` (5% LCC fee),
  when collected (`select.paidOrders`, `pickupPayout`). Payouts shows Cups
  and Paid orders separately, per branch and for all branches. Top-ups
  paid at the till stay out of the payout, as before.
- Seed: a few collected paid orders a day per café this month
  (`data.js` `orders`), so Payouts has a paid-orders figure.
- Toasts on the phone: "<café> is making your <drink>.", "Your <drink> is
  ready at <Double Shot Gulberg>." (`select.pickupPlace`), rejected (with
  the reason and the refund), collected. The café gets "New pickup order".
- // BACKEND: an orders table (Postgres Changes for the queue), holds and
  releases as ledger inserts in the same transaction, refunds through the
  payment provider.

## Club: Beans, referrals, group orders (Pass 9)

- Tone: understated. No exclamation marks; "complimentary", never "free"
  (all member-facing "free cup" copy was changed to "complimentary cup").
- The tab was already named Club (Pass 5); nothing to rename.
- Beans rules: one block in `data.js` `beans` (`launchedAt` = the 1st of
  this month; `perDrink` 10; `referral` 100; `hostPerFriend` 5;
  `groupJoinMinutes` 10; `rewards` 150 drink / 400 drinks for two / 600
  members' evening).
- Beans are derived, never stored (`select.beans`): +10 per counter
  redeem (no `orderId`), +10 per drink of a collected pickup order or
  table (cup, paid or covered), host +5 per friend at a collected table,
  +100 to both for a referral at the friend's first purchase or paid
  order. Only spends are written: a `beans` ledger entry (−cost), plus a
  `reward` entry (reason `beans`, +1 or +2 cups) so a complimentary drink
  is funded like any cup, or an RSVP for the evening. Drinks need a plan.
  Earned when collected, not when ordered (so cancelled orders earn none).
- Mumtaz starts on 130 Beans (four cups this month and Fatima's referral):
  20 to her first complimentary drink, so one more cup gets her there.
- The members' evening (`gather-members-evening`, Noon, `inviteOnly`) is
  not listed under Gatherings; 600 Beans keeps a seat (synced RSVP).
- Club tab: Beans at the top (number, 2px progress line, the next reward
  in words) opening a sheet: the ladder, Redeem (two taps: Redeem, then
  "Use 150 Beans"), history. Success states show a quiet "+10 Beans"
  (pass after a counter cup, the Collected toast). The bean icon is
  `ui.icon("bean")`, in `--accent-text` (an accent use).
- Referrals: codes are first name + 3 letters from the member id
  (`select.inviteCode`, MUMTAZ-JB9), replacing MUMTAZ42. Onboarding's
  "Have an invitation code?" sets `member.invitedBy` when the member is
  created (Joined); Rewarded is derived (`select.invitations`). The old
  free-cup invite reward is gone (old `invite` reward entries still read).
  Seeded: Fatima (Double Shot regular, Rewarded) and Saad R. (no plan,
  Joined). `invitedBy` travels in the synced profile.
- Group orders ("For your Circle" on the order screen): the host picks café,
  branch and time, and optionally "I'll cover the table". `#/app/group/:id`
  is one screen for everyone: the share link (WhatsApp, copy; always the
  live site with the room), drinks so far with names, "Add your drink"
  (cup or pay online; nothing to pay when covered), and for the host
  (on the device that opened it) Send to the café (paying for covered
  drinks first) and Cancel. Joining closes after 10 minutes; the host
  sends by hand. A device whose member is the host but didn't open the
  table joins as a guest with a name (the demo's second phone). Cup drinks
  hold a cup on join (`hd_<itemId>`, `orderId` `o_<tableId>`).
- Sent tables are one pickup order (`o_<tableId>`, `pay: "group"`,
  `items[]` with `name`, `memberId|null`, `pay: cup|online|host`, `amount`).
  The café ticket shows a name on each drink, the total and "N of N paid".
  Collected writes release + redeem per cup drink; paid and covered
  amounts go to Payouts as one paid order (less the 5% fee).

## Circles (Pass 10)

- Small private groups in their own tab (moved out of Club; see "Tabs"
  below), up to `circleRules.maxMembers` (12)
  (`data.js` `circleRules`). "Start a Circle" names it (you host);
  "Add them to your circle" shares the invitation link on WhatsApp
  (`#/app/circles/:id/join`, always the live site with the room). The host
  can remove members; anyone can leave (a leaving host hands over to the
  longest-standing member; the last one out closes it).
- The mark: `ui.brickRing({ total: 12, filled: members })`, one brick per
  member slot, joined filled (accent), empty slots hairline outlines.
  Small (48px) in the Club list, large (200px, "5 of 12") on the page.
- Activity ("This week", `circleRules.activityDays` 7): drinks after the
  fact (counter cups, pickups, table drinks) as "Hira · Iced Matcha at
  Double Shot Phase 6 · 2 hr ago", new passport stamps and badges, all
  derived (`select.circleActivity`). One acknowledgement per member per
  entry (thin-line cup and a count; `state.acks[key][memberId]`); tapping
  again takes it back. Adding and undoing sync the same way (`ack` with
  `on`; the newest change per member and entry wins).
- Rounds (`state.rounds`): "Call a round" (café or branch, a time today).
  "I'll be there" / "Not this time"; who's coming. "Order together" turns
  it into a table (`LCC.appOrder.startTable`, `round.groupId`), so the
  others get "Add your drink to the table". Attending = said yes and had a
  drink there from an hour before to three hours after: +5 Beans
  (`beans.roundAttend`, derived in `select.beans`).
- This month: cafés explored together (a brand counts once), the streak
  (calendar weeks running with a round two or more came to), and "Most
  explored" by cafés, never by cups (`select.circleMonth`).
- Privacy (drawer): "Share my coffee with my Circles" (on by default) and
  "Hide which branch" (`member.privacy`, synced). No live location
  anywhere: only the café and the time, after the fact.
- Seed: The Gulberg Circle (Mumtaz hosts) with Hira, Usman, Mahnoor and
  Faraz (background members with codes-free plans and lifetime visits), a
  week of coffee, Mahnoor's fifth-café stamp and Explorer badge today, three
  past rounds a week apart (three weeks running), a round Hira called for
  later today (Double Shot Phase 6), a few acknowledgements. Faraz hides
  his branch. Mumtaz's Beans stay 130.

## Tabs (reorganised after Pass 10)

- Bottom bar: Home · Cafés · Pass · Circles · Club (five tabs). Map is a
  List | Map switch in Cafés (the busy map unchanged; pins follow the
  search and filters). Features work exactly as before.
- Circles tab: Upcoming (rounds today from all your Circles, the next
  gathering, and the members' evening when you hold a seat; each with I'll
  be there / Not this time; the Beans evening shows "Your seat is kept
  with Beans" without buttons, as before there was no way to give it up),
  Your Circles, Recent (7 days, deduplicated across Circles). With no
  Circles: "Coffee is better in company. Start a Circle, or ask a friend to
  add you to theirs."
- "Not this time" on a gathering you hadn't answered records a no (synced
  RSVP); on one you're going to it gives up the seat, as before.
- Club keeps the personal things: Beans, passport, member card, status,
  perks, badges, invite, Send a gift. Gatherings moved to Circles.

## Decisions

- Max 2 redemptions per café per member per day (`rules.dailyLimitPerCafe`).
- Pass codes stay valid for one extra 30s window after rotating.
- The demo member is Mumtaz Begum (initials MB), not the spec's "Ayesha".
  Her internal id stays `m_ayesha` (and the `ayesha` variable in data.js).
- Demo members for the café view (static codes): Bilal 615028 (Explorer, at
  the cap at Kiln & Bean), Sana 207341 (My cafés: Kiln & Bean 6, Maple 4;
  3 + 3 left), Omar 558190 (Explorer Starter, 2 left), Zara 482913 (My cafés,
  daily limit at Kiln & Bean), Hamza 730215 (no cups left).
- Mumtaz: Double Shot, 15-cup plan, 11 left (cups at Gulberg, Phase 6, Model
  Town and Pine Avenue this month). Her codes are refused at Kiln & Bean.
- The café view opens on Double Shot Gulberg (`partnerCafeId`).
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
- Approved exception to "all state is in memory": the Coffee / Matcha choice
  is remembered on the device in localStorage `"lcc-flavour"` (try/catch;
  if storage fails it defaults to Coffee). Light / Dark / Auto stays in
  memory.
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
- Mumtaz: No. 0042, Founding Member, Local (40 cups), 4 of 9 cafés, 7 of 10
  morning cups. Three earlier months on My cafés (Kiln 6, Noon 4, Slow Pour
  3) are seeded in the ledger. A cup at a fifth café gives a free cup.
- Ledger type `reward` (+cups, cafeId null): passport at 5 and at all cafés
  (fixed ids, so once only), Beans rewards (reason `beans`). Invites no
  longer give cups (Beans instead, Pass 9). Rewards count in the
  month's total; My cafés members spend them from `balance().bonus`
  (redeem entries carry `bonus: true`).
- Member numbers: first 500 are Founding; new members get
  `club.membersIssued + 1` (No. 0487 in the demo). Invite code = first name
  + three letters (MUMTAZ-JB9; see Pass 9).
- Club tab: the passport is a book at the top (black cover, cream foil
  type, the ring logo; opens with a 360ms rotateY flip, crossfade with
  reduced motion). Page 1 is an ID page, then 4 stamps a page from
  `select.club().passport`. Stamps are ink in `--accent-text` (an accent
  use added on request). Badges are one "Badges · X of Y" row that opens a
  sheet (Earned with dates, Still to earn with progress). Earned dates are
  replayed from redeem entries in `select.club` (`badge.earnedAt`).
  Badges added: DHA local, Familiar face (50 cups), First light (30 cups
  before 9 am).
- Club tab perks: one "Perks · N" row (the member's unlocked perks; locked
  ones are counted in its second line) that fans out a stack of ticket
  stubs (280ms, fade with reduced motion). Used / expired come from optional
  `member.perksUsed[perkId]` and `perk.expiresAt`; none are seeded.
- Gatherings (now in the Circles tab, Upcoming): next one is the second Saturday ahead (Maple, 9 am, 30 seats,
  19 taken); Founding Members and Connoisseurs RSVP before the general
  opening a week ahead. RSVPs sync (`rsvp` message, newest wins, in join
  snapshots). Members created in a session sync their profile in the plan
  header, so a café on another device can look them up.
- Gifts: Explorer from the pool (any café), My cafés from one café's cups
  (that café only). Max 3, expire in 60 days, open WhatsApp with a code.
- Presenter "Demo" menu in the switcher: "Start as a new member" and "Back
  to Mumtaz's demo" (`actions.beginNewMember` / `restoreDemo`; Mumtaz's
  data is never touched, except a free cup if her invite code is used).
- Member card (redesign, ref `docs/ref/member-card.png`): `LCC.memberCard`
  in `app-club.js`, built in code, 7:4, radius 16, no shadow. 22 hairline
  rings centred a little left, lit at top right and bottom left by a
  per-ring gradient; the wordmark (unaltered, it carries "COFFEE CLUB")
  top right; name and "Founding Member" (or the level) bottom left;
  `LCC-0042` bottom right. Card tokens `--card-bg`, `--card-ring`,
  `--card-ink`, `--card-muted`, `--card-edge` in `base.css` (coffee
  #0B0B0B / caramel / cream; Matcha #0F140E / #93B35A / foam), the same in
  light and dark. Shown at the top of the profile drawer, on the Club tab
  and the onboarding issue screen; type scales with the card width (cqw).
  Tap (a real button over the card) turns it over, 400ms rotateY,
  crossfade with reduced motion: member since, plan, Circles, "Show your
  pass at any partner café". The old seal is gone.
- Café view after lookup: "No. 0042 · Founding Member · Local" and any perk
  claimable at that café.
- Café view (redesign): Counter scans or takes a 6-digit code, shows what a
  cup covers, redeems with a reference (`select.redemptionRef`, the same on
  every device) and "Ring it up on your till as: LCC member", then resets
  after 6 s. The redemption records the café's first one-cup drink (the till
  handles the actual drink).
- Busy level: Auto by default (`select.busyEstimate`: cups here in the last
  30 min, 0–1 quiet, 2–4 moderate, 5+ packed), or a fixed level. Only the
  café view drives Auto (`actions.refreshAutoBusy` on redeem and tick); the
  status syncs to the member map as before, now with its mode.
- Pause member cups for 30 min (`cafe.pausedUntil`, synced as `cafe:pause`).
  While paused, codes are refused with a friendly message.
- Partner settings live in `state.partner[cafeId]` (Kiln & Bean seeded in
  `data.js`; others get defaults): what a cup covers, limits (member cups a
  day for the café, cups per member a day; both enforced in
  `canRedeemHere`), opening hours (`cafe.hours`, also used by the app),
  staff PINs, payout account and history. Settings are not synced.
- Demo staff PINs at Kiln & Bean: Bilal 1234, Hira 5678, Saad 2468.
- Payouts: this month from the ledger (calendar month) × the café's rate
  (`payoutPerCup`; Kiln & Bean Rs 520 = 80% of Rs 650); next payout on the
  5th; three months of seeded history. CSV export and PDF statement are
  simulated with a toast.
