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
- `data.js` — fictional seed: 8 cafés, 3 tiers, members, redemptions, badges
- `state.js` — one store with pub-sub (`store.on`, `actions`, `select`),
  pricing, pass codes, redemption rules, `LCC.fmt` formatting
- `ui.js` — templating, icons, toast, bottom sheet, steppers, live pills
- `router.js` — hash router, top switcher, theme toggle, Pass 1 shells
- `sync.js` — live sync per room: BroadcastChannel (same computer) and
  Supabase Realtime Broadcast (other devices), join handshake, `LCC.sync`
- `kit.js` — `#/kit` component sheet wired to the real store
- `cafe.css`, `cafe.js` — café partner view (`#/cafe`): redeem, busy status, today
- `app.css`, `app.js` — member app (`#/app/…`): shell, in-app routing, tab
  bar, Pass, Home, Map, café sheet
- `app-cafes.js` — Cafés tab (search, filters) and café detail (`#/app/cafes/:id`)
- `app-plan.js` — plan picker, Build your own, simulated payment
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
4.5. [ ] Cross-device live sync (Supabase Realtime Broadcast)
5. [ ] Member app: gifting, rewards, onboarding
6. [x] Landing page and waitlist

**Rule: build one pass at a time, then stop and report. Do not start the
next pass until asked.**

## Decisions

- `--ink-3` is `#70655A` for AA contrast; the spec's `#968B7F` is `--ink-4`,
  used for placeholders only.
- Max 2 redemptions per café per member per day (`rules.dailyLimitPerCafe`).
- Pass codes stay valid for one extra 30s window after rotating.
- The demo member is Mumtaz Begum (initials MB), not the spec's "Ayesha".
  Her internal id stays `m_ayesha` (and the `ayesha` variable in data.js).
- Demo members Bilal, Sana, Omar, Zara and Hamza exist for the café view
  (Zara hits the daily limit; Hamza has no cups left).
- Design polish comes later; the current palette and fonts stay for now.
- Payout today = cups today × the café's payout rate. "This month so far" is
  a separate line based on `avgDailyCups`.
- 14 background "regulars" fill each café's day; they have no codes.
- Busy status uses the cup-level icon (`ui.cupIcon`) everywhere, in ink.
- Live sync (Pass 4.5, approved exception to "no backend"): Supabase
  Realtime Broadcast only. No tables, no database writes, nothing stored.
  Only the publishable key is in the code; never add a secret key.
- supabase-js 2.118.0 loads from jsDelivr (approved exception: it isn't on
  cdnjs), pinned with SRI. If it can't load or connect, sync quietly falls
  back to same-computer windows and shows "Offline, this device only".
- Devices sync per "room" (`?room=` in the hash). With no room, the browser
  reuses its last one (localStorage, optional) or makes a 4-digit one.
- Synced: café status, redemptions, and Mumtaz's plan and cups (newest copy
  wins by `syncAt`). A joining device says hello; a café device answers with
  statuses, today's live redemptions and Mumtaz's plan and cups.
- QR library: qrcode-generator 1.4.4 from cdnjs; falls back to the 6-digit
  code offline.
- Plan changes apply immediately: cups start fresh, renewal = one month from
  today.
- Wallet numbers ending in 0000 simulate a failed payment (presenter
  knowledge only, not shown on screen).
- "Add to my plan" adds the café with 2 cups.
- Plan changes now sync too (Pass 4.5), across windows and devices.
- Landing forms (waitlist, café partner) open WhatsApp to 923100008242 via
  `wa.me` with the details pre-filled, then show a thank-you. Button label:
  "Send on WhatsApp". Mobile numbers must be 03XX XXXXXXX. Favourite café
  is optional; areas include "Somewhere else".
- The landing teaser prices with `select.customPrice` and shares the store's
  builder; "Build your plan in the app" opens `#/app/plan` on Build your own
  with the same cups.
- The café estimator is members × visits × rate (10–200, 1–8, Rs 300–700),
  showing only what the café enters.
- FAQ product answers (to confirm): unused cups don't roll over; cancel any
  time and keep cups until the month ends; billing on the day you joined.
- Pass 5 (gifting, rewards, onboarding) is still to do; Pass 6 was built
  first on request.
