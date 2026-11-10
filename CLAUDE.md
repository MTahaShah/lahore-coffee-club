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

Script order matters: data → state → ui → router → surfaces. New files must
be added to the lists in `build.sh`. Mark API seams with `// BACKEND:` comments.

## Pass plan

This order overrides any order implied by the spec.

1. [x] Design system, data, state, router
2. [ ] Café partner view (`#/cafe`)
3. [ ] Member app: Pass (QR), Home, Map
4. [ ] Member app: Cafés, plan builder, payment
5. [ ] Member app: gifting, rewards, onboarding
6. [ ] Landing page and waitlist

**Rule: build one pass at a time, then stop and report. Do not start the
next pass until asked.**

## Decisions

- `--ink-3` is `#70655A` for AA contrast; the spec's `#968B7F` is `--ink-4`,
  used for placeholders only.
- Max 2 redemptions per café per member per day (`rules.dailyLimitPerCafe`).
- Pass codes stay valid for one extra 30s window after rotating.
- Demo members Bilal, Sana, Omar, Zara and Hamza exist for the café view
  (Zara hits the daily limit; Hamza has no cups left).
- Design polish comes later; the current palette and fonts stay for now.
