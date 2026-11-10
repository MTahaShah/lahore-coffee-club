# Lahore Coffee Club

A clickable, high-fidelity prototype of a monthly coffee membership across
Lahore cafés. It is shown to café owners and potential members. There is no
backend: all data is fictional and all state is in memory.
Full spec: `docs/spec.md` (verbatim; the source of truth).

## Build and preview

```bash
./build.sh            # assemble src/ into one self-contained index.html
./build.sh --watch    # rebuild on every change in src/
open index.html       # file:// works
python3 -m http.server 8000   # needed to mirror state across two windows
```

Routes: `#/` landing, `#/app` member app (phone frame), `#/cafe` café view,
`#/kit` component sheet (not in the switcher; for review).
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
- `kit.js` — `#/kit` component sheet wired to the real store
- `cafe.css`, `cafe.js` — café partner view (`#/cafe`): redeem, busy status, today
- `app.css`, `app.js` — member app (`#/app/…`): shell, in-app routing, tab
  bar, Pass, Home, Map, café sheet
- `app-cafes.js` — Cafés tab (search, filters) and café detail (`#/app/cafes/:id`)
- `app-plan.js` — plan picker, Build your own, simulated payment
  (`#/app/plan`, `#/app/plan/pay`)

Script order matters: data → state → ui → router → surfaces. New files must
be added to the lists in `build.sh`. Mark API seams with `// BACKEND:` comments.

## Pass plan

This order overrides any order implied by the spec.

1. [x] Design system, data, state, router
2. [x] Café partner view (`#/cafe`)
3. [x] Member app: Pass (QR), Home, Map
4. [x] Member app: Cafés, plan builder, payment
5. [ ] Member app: gifting, rewards, onboarding
6. [ ] Landing page and waitlist

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
- Live sync works between windows on the same computer only.
- QR library: qrcode-generator 1.4.4 from cdnjs; falls back to the 6-digit
  code offline.
- Plan changes apply immediately: cups start fresh, renewal = one month from
  today.
- Wallet numbers ending in 0000 simulate a failed payment (presenter
  knowledge only, not shown on screen).
- "Add to my plan" adds the café with 2 cups.
- Plan changes don't sync across windows; status and redemptions do.
