# The Round: Brand rules (for building)

Replaces the old Lahore Coffee Club `docs/BRAND.md`. This file wins over anything older in the repo, including `docs/LCC-Brand-Book.pdf` (old name, old look: reference for layout ideas only).

## Name
- **The Round**. Always "The Round" with a capital T. Never "Round", "Rounds", "TheRound", "TR" or "LCC" in anything a person sees.
- Descriptor where context helps (titles, app store, link previews): "The Round — coffee club".
- The café app is **The Round Cafés**. The admin panel is **The Round Admin**.
- The city lives in the copy ("Lahore's cafés"), not the name.
- Internal code names stay as they are: the `LCC` JavaScript namespace, `lcc:` storage keys and events, `lcc-` CSS classes and ids, file names. Renaming them gains nothing and breaks saved state.

## Direction
Extremely minimal, quietly premium. Ink and Paper do the main work in both modes, Stone separates things, Gold is the single accent (about 10% of a screen or less). No brown backgrounds anywhere. Green only in Matcha mode.

## Logos (`src/logos/`, use as-is, never retype or rebuild in HTML/CSS)
All three are vector shapes (no fonts needed) and take their colours from CSS variables, so one file works in light, dark and Matcha:
`--logo-ink` (letters), `--logo-face`, `--logo-side`, `--logo-top` (the 3D bricks). Each has a gold fallback inside the SVG.

| File | What | Use |
|---|---|---|
| `wordmark.svg` | Stacked THE / R◯UND, the brick ring is the O | Splash and welcome screens, big empty states, console sign-in screens, the "about" sheet, print. Min 160px wide; below that use the mark |
| `mark.svg` | The brick ring with an R inside | Everywhere space is small: app header, tab-bar-sized spots, console sidebars/top bars, café counter header, loading, favicon-sized spots. Min 24px |
| `ring.svg` | The brick ring alone | Not a logo: the graphic behind cups-left rings, loading, Circles icons. `ui.brickRing()` stays the live, per-cup version |

App icons (`src/logos/`, already sized): `app-icon-1024.png`, `app-icon-512.png`, `app-icon-192.png`, `app-icon-maskable-512.png` (mark smaller, inside the safe zone), `apple-touch-icon-180.png`, `favicon-32.png`. All are the dark icon: Ink square, Gold ring, Paper R. The café app uses the same icons.

Clear space: the height of the THE line around the wordmark; one brick width around the mark. Don't stretch, rotate, recolour outside the tokens, add shadows, put on busy backgrounds, or swap the ring for a normal O.

## Colour tokens (`src/base.css`)

Base palette (fixed, both modes):
```
--black: #0B0B0B  (Ink)    --cream: #FAF8F4 (Paper)    --stone: #E9E5DD
--accent: #C2A878  (Gold)  --accent-deep: #775C38 (Gold deep)
--status-quiet: #4E7D5B  --status-moderate: #C9962B  --status-packed: #B5503C
```

Light mode:
```
--bg: #FAF8F4          --surface: #F2EFE9      --surface-2: #E9E5DD
--ink: #0B0B0B         --ink-2: #5F5E5C        --ink-3: #8E8D8A     --ink-4: #BDBAB4 (decoration/placeholders only)
--line: #E9E5DD        --line-strong: #D6D1C7
--primary: #0B0B0B     --primary-hover: #2A2A29   --on-primary: #FAF8F4   --primary-soft: #E9E5DD
--accent-text: #775C38   (Gold deep: 5.9:1 on --bg, the only gold allowed as text on light)
--logo-ink: var(--ink) --logo-face: #C2A878  --logo-side: #775C38  --logo-top: #4A341E
```

Dark mode (`prefers-color-scheme`, the theme toggle, and `.theme-dark` surfaces):
```
--bg: #0B0B0B          --surface: #1E1E1D      --surface-2: #2A2A28
--ink: #FAF8F4         --ink-2: #A6A5A2        --ink-3: #777674     --ink-4: #4A4947
--line: #2A2A28        --line-strong: #3A3A38
--primary: #FAF8F4     --primary-hover: #E9E5DD   --on-primary: #0B0B0B   --primary-soft: #2A2A28
--accent-text: #C2A878   (8.6:1 on --bg)
--logo-ink: var(--ink) --logo-face: #C2A878  --logo-side: #775C38  --logo-top: #4A341E
```

Never: Gold `#C2A878` as text on light (2.2:1). Gold backgrounds in the product UI.

### Matcha mode (member app only, `[data-flavour="matcha"]`)
Keep the existing Matcha mechanism and its green accent tokens (`--accent`, `--accent-deep`, `--accent-text`, the card tokens). Change only:
- Neutrals: use the same Ink/Paper/Stone neutrals as coffee (drop the green-tinted porcelain and tea-leaf inks), so Matcha reads as "same brand, green accent".
- Bricks, light: `--logo-face: #6E8B3D; --logo-side: #3F5A22; --logo-top: #26361A`.
- Bricks, dark: `--logo-face: #A6C46A; --logo-side: #6E8B3D; --logo-top: #3F5A22`.

### Where accents are allowed (nowhere else)
- The filled bricks of the cups-left ring and any `ui.brickRing`.
- The logo bricks.
- The active tab indicator.
- Small uppercase labels and eyebrows (`--accent-text`).
- At most one highlighted number or word per screen.

Still true from before: no member-facing savings figures ("You save Rs X", member price beside menu price, "pays for itself", "Rs X a cup"). The counter still sees list price, member price and amount to charge.

## Type

| Font | File | Job |
|---|---|---|
| **Versailles** | `src/fonts/Versailles-Regular.woff2` | Display only: screen titles in the member app, big section headings, console page titles, eyebrows if they're short. **Capitals only** (the font has no lowercase), tracked 0.12–0.2em, 5 words max. Never for paragraphs, buttons, form labels, prices, numbers you need to read fast, or the counter's working UI. |
| **Montserrat** | `src/fonts/Montserrat-{Light,Regular,Medium,SemiBold}.woff2` | Everything else. Light 300 for big quiet numbers (cups left, totals), Regular 400 body, Medium 500 buttons and labels, SemiBold 600 in-app headings and card titles. No Bold/Black. Tabular figures (`font-variant-numeric: tabular-nums`) for prices, counts, codes. |
| LT Rogile | not shipped | Only inside the logos, already outlined. Don't load it. |

```
--font-display: "Versailles", Georgia, "Times New Roman", serif;
--font-sans: "Montserrat", system-ui, -apple-system, "Segoe UI", sans-serif;
```
Small uppercase labels: Montserrat Medium 12px, tracked 0.2em. Scale: 12 / 14 / 16 / 20 / 28 / 40 / 64. Sentence case (except Versailles, which is always capitals).
Urdu: no Urdu font now. Drop `--font-urdu`'s "29LT Bukra"; keep `"Noto Sans Arabic", sans-serif` for any Urdu text that remains.

Licences: Montserrat is free (SIL OFL). Versailles and LT Rogile are personal-use demos for this prototype; commercial licences get bought before anything goes public. Don't add them to anything outside this repo's prototype.

## Shape, motion, voice
Unchanged: radius 12 cards, 999 buttons/pills, 20 sheets. Hairlines, no shadows (same exceptions as before: the always-dark card, passport and gift card in dark mode). Buttons 56px tall on mobile: Ink with Paper text on light, Paper with Ink text on dark.
Motion 200–300ms, cubic-bezier(0.22, 1, 0.36, 1), transform and opacity only, respect reduced motion.
Voice: warm, short, specific, a little Lahori. No hype words ("Unlock", "Elevate", "Seamless", "Revolutionize"), no emojis as icons.
