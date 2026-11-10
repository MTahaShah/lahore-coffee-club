# Lahore Coffee Club: Brand rules (for building)

Full visual reference: `docs/LCC-Brand-Book.pdf`. This file wins over anything older in the repo.

## Direction
Extremely minimal, quietly premium. **Black, white and cream are the main colours, in both modes.** The coffee palette (caramel, cinnamon, espresso, mocha, roast) is for accents only: small touches that make things pop, never large surfaces. **No green accent anywhere.**

## Logos (in `src/logos/`, use as-is, never retype)
- `wordmark.svg`: لاہور + COFFEE CLUB. Landing hero/nav, splash, footer.
- `monogram-horizontal.svg`: brick ring + LCC. App header, café screen header.
- `app-icon-mark.svg`: ring with LCC centred. Icons, loading.
- `ring.svg`: ring alone. Favicon and anything under 32px.
- `app-icon-espresso-1024.png`, `app-icon-cream-1024.png`, `favicon-32.png`.
- Inline the SVGs so colours come from CSS variables:
  - `--logo-ink` (wordmark and LCC) is `--ink`: black on light, cream on dark.
  - The ring's bricks keep their coffee tones, so the mark is the colour pop:
    - On light: face #4F351C, side #341100, top #7F5E35.
    - On dark: face #CFAB71, side #7F5E35, top #4F351C.
- Clear space = height of the C in COFFEE. Min sizes: wordmark 120px, horizontal monogram 72px.

## Colour tokens
Light mode:
```
--bg: #FFF7E8   --surface: #FFFFFF   --surface-2: #F4EFE6
--ink: #0B0B0B  --ink-2: #4D4A45     --ink-3: #8A857D     --line: #E6E0D6
--primary: #0B0B0B   --on-primary: #FFFFFF
--accent-text: #713105   (the only coffee colour allowed for text on light)
```
Dark mode (`prefers-color-scheme: dark`):
```
--bg: #0B0B0B   --surface: #151515   --surface-2: #1E1D1B
--ink: #FFF7E8  --ink-2: #BDB7AD     --ink-3: #807B74     --line: #2A2927
--primary: #FFF7E8   --on-primary: #0B0B0B
--accent-text: #CFAB71
```
Both modes:
```
--accent: #CFAB71  --accent-deep: #713105  --espresso: #341100  --mocha: #7F5E35  --roast: #4F351C
--status-quiet: #4E7D5B  --status-moderate: #C9962B  --status-packed: #B5503C
```

### Where accents are allowed (nowhere else)
- The filled bricks of the cups-left ring.
- The brick ring around the QR on the Pass screen.
- The monogram's (and ring logo's) bricks.
- The active tab indicator.
- The "You save Rs X" line.
- Small uppercase labels and eyebrows.
- At most one highlighted number or word per screen.

Keep accents to roughly 10% of any screen or less. Everything else uses the neutral tokens only: backgrounds, cards, buttons (black on light, cream on dark), body text, borders, the tab bar, lists and landing sections. **No espresso or brown backgrounds anywhere**; the Pass screen is black with a caramel brick ring and the QR on a cream rounded square.
Status colours only for busy status, always with a text label.

## Type
- **Glacial Indifference** (`src/fonts/`): all Latin text. Regular almost everywhere, Bold sparingly. Small capitals labels tracked 0.3em.
- **29LT Bukra**: all Urdu text. Licensed; until `src/fonts/29LTBukra-*.woff2` exists, fall back to `"Noto Sans Arabic", sans-serif`.
- Fallbacks: `"Glacial Indifference", "Century Gothic", Futura, system-ui, sans-serif`.
- Scale 12 / 14 / 16 / 20 / 28 / 40 / 64. Sentence case. Tabular numbers for prices and counts.

## The brick ring (signature graphic)
- Home: cups-left ring. One brick per cup on a ring with one gap at 3 o'clock; used cups become outlined bricks. Bricks are small rounded rectangles pointing outward, with a slight twist.
- Loading: bricks fill in one after another.
- Pass screen: black background, QR on a cream rounded square inside a caramel ring.
- Café screen header: small ring next to the café name.

## Shape, motion, voice
Radius 12 cards, 999 buttons/pills, 20 sheets. Hairline 1px borders, no shadows. Buttons 56px tall on mobile: black with white text on light, cream with black text on dark.
Motion 200 to 300ms, cubic-bezier(0.22, 1, 0.36, 1), transform and opacity only, respect reduced motion.
Voice: warm, short, specific, a little Lahori. No hype words.
