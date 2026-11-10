ROLE
You are a senior product designer and front-end engineer who has shipped 
consumer apps at the level of Apple, Airbnb, and Monzo. You care about 
restraint, typography, and detail. You do not produce template-looking work.

OBJECTIVE
Build a high-fidelity, clickable prototype for "Lahore Coffee Club", a 
monthly coffee membership for Lahore cafés. It will be shown to café owners 
to prove the product is real, and to potential members. It must feel like a 
finished, expensive product: calm, minimal, confident. No backend; use 
simulated data and in-memory state.

THE PRODUCT
Members pay one monthly fee and redeem coffees across partner cafés. Cafés 
receive guaranteed cups per member, new customers, and monthly payouts, with 
no hardware needed. Features: fixed tiers, a Build-Your-Own plan (choose 
cafés and cups per café), QR redemption, a live busy map, gifting, loyalty.

=====================================================
1. DESIGN PHILOSOPHY
=====================================================
Extremely minimal, quietly luxurious. Think a specialty roastery's packaging, 
not a tech startup. Luxury comes from: generous whitespace, few colors, 
excellent typography, precise alignment, and slow, subtle motion. Every 
element must earn its place. When in doubt, remove it.

PRINCIPLES TO BORROW (do not copy layouts or branding):
- Apple: typographic hierarchy, restraint, big calm headlines, whitespace.
- Aesop: warm, editorial, premium minimalism; serif headlines on a soft 
  neutral background.
- Blue Bottle Coffee: product-first calm, coffee-world tone.
- Airbnb: card-based browsing, search/filter clarity, map + list pairing, 
  bottom-sheet details on mobile.
- Starbucks app: the QR/pay screen being the hero, simple rewards display.
- Monzo / Revolut: clear balance display, clean transaction list, friendly 
  but precise microcopy.
- Stripe: clear pricing tables, clean forms, trustworthy detail.
- Linear: crisp interactions, hairline borders, fast, tight spacing.
- Apple Maps / Uber: map with a draggable bottom sheet and clean pins.

ANTI-"AI LOOK" RULES (strict):
- NO purple/blue gradients, neon glows, glassmorphism stacks, or gradient text.
- NO emoji as icons or decoration. Use a consistent thin-line SVG icon set 
  (1.5px stroke, drawn inline, same optical size throughout).
- NO generic 3-column "icon in a circle + title + sentence" feature grids.
- NO stock phrases: "Unlock", "Elevate", "Seamless", "Revolutionize", 
  "Supercharge", "Game-changer", "Your journey", "all-in-one solution".
- NO centered-everything layouts. Use left-aligned text, asymmetric grids, 
  and deliberate negative space.
- NO heavy drop shadows or colored shadows. Prefer 1px hairline borders and, 
  at most, one very soft shadow for floating elements.
- NO fake testimonials, fake stats, or fake logos.
- NO lorem ipsum. Write real, specific, human copy (see Voice).
- Avoid default look of Tailwind/Bootstrap. Everything is custom.

=====================================================
2. DESIGN SYSTEM (define as CSS variables on :root)
=====================================================
Color (warm neutral, one accent):
--bg: #F6F1EA (warm paper)
--surface: #FBF8F3
--surface-2: #EFE8DD
--ink: #1C1612 (near-black espresso, main text)
--ink-2: #5E554C (secondary text)
--ink-3: #968B7F (tertiary/placeholder)
--line: #E3DACD (hairline borders)
--accent: #2F4A3A (deep green) used sparingly: primary buttons, active 
  states, key numbers
--accent-soft: #E4EAE2
--status-quiet: #4E7D5B, --status-moderate: #C9962B, --status-packed: #B5503C 
  (used ONLY for busy status, muted tones, never neon)
Dark mode: provide via prefers-color-scheme with equivalent tokens (deep 
espresso background #14100D, cream text), and design every surface for both.

Typography (Google Fonts, with real fallback stacks):
- Headings: "Fraunces" or "Cormorant Garamond" (editorial serif), light to 
  regular weight, tight tracking, large sizes.
- UI/body: "Inter Tight" or "DM Sans".
- Numbers (prices, cup counts): use tabular figures (font-variant-numeric: 
  tabular-nums).
- Type scale: 12 / 14 / 16 / 20 / 28 / 40 / 64 px; line-height 1.5 body, 
  1.05-1.15 headings. Max line length ~60ch.
- Use sentence case everywhere. Small uppercase labels allowed only for tiny 
  eyebrow text with +0.08em letter-spacing.

Spacing and shape:
- 8px grid. Spacing tokens: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128.
- Radius: 12px cards, 999px pills/buttons, 20px phone sheets. Be consistent.
- Borders: 1px solid var(--line). Cards are flat surfaces with hairline 
  borders, not floating shadows.
- Touch targets minimum 44x44px.

Components to build once and reuse:
- Button: primary (accent fill, cream text), secondary (outline), text-link. 
  56px tall on mobile, pill-shaped, no gradient. Pressed state scales to 0.98.
- Input: 56px, hairline border, label above, clear focus ring (2px accent), 
  inline validation messages in plain language.
- Card, list row, stepper (- / +), segmented control, chip, toggle, 
  bottom sheet, toast, badge, progress ring (cups remaining).
- Busy-status pill: small colored dot + word ("Quiet", "Moderate", "Packed") 
  + "updated 6 min ago" in tertiary text.

Motion:
- 200-300ms, ease-out cubic-bezier(0.22, 1, 0.36, 1). Fade + 8px translate 
  for entering content, subtle stagger on lists. Number changes animate 
  (count up/down). Success states use a calm check draw animation, no 
  confetti. Respect prefers-reduced-motion.

=====================================================
3. VOICE AND COPY
=====================================================
Warm, understated, confident, a little Lahori. Short sentences. Concrete 
benefits over adjectives. Examples of tone:
- Hero: "Every café you love. One monthly pass."
- Sub: "Pick your places, pick your cups. Pay once, drink well all month."
- Empty state: "No cups used yet. Your first one is waiting."
- Café pitch: "We send you regulars. You serve them coffee. You get paid 
  monthly, per cup, at a rate you set."
Never use exclamation marks more than once per screen. No hype.

=====================================================
4. SURFACES TO BUILD (one HTML file, hash routing)
=====================================================
Routes: #/ (landing), #/app (member app in phone frame), #/cafe (café 
partner screen). A slim, discreet top switcher (Landing / Member app / 
Café view) so the viewer can jump between them while presenting.

--- 4A. LANDING PAGE (desktop + mobile responsive) ---
Reference feel: Aesop + Apple + Stripe pricing clarity.
1. Minimal nav: wordmark left (typographic logo, serif, "Lahore Coffee 
   Club", no icon-mark), links "How it works", "Cafés", "Join", and a 
   secondary button "Partner with us".
2. Hero: very large serif headline, left-aligned, one sentence below, two 
   buttons (Join the waitlist / See the app). On the right (desktop), a 
   refined CSS/SVG composition of the app's QR screen in a phone frame, 
   slightly cropped. No stock photos or external images; use typography, 
   shapes, and SVG illustration (e.g. a single line-drawn cup).
3. "How it works": 3 steps as a numbered editorial list (01 / 02 / 03) with 
   hairline dividers, not cards with icons.
4. The plans: a clean pricing table, Starter, Regular, Enthusiast, plus a 
   wider "Build your own" row with a mini interactive builder teaser.
5. Busy map teaser: a static-looking but real SVG map slice with 4 status 
   dots, with short copy about "Know before you go."
6. Gifting and loyalty: one concise two-column section, text-led.
7. "For cafés" section (important, this is the sales pitch): four 
   benefits written plainly (guaranteed cups, new customers, no hardware: 
   works on any phone or tablet, monthly payouts) and a short "How 
   we pay you" explanation. Form: café name, owner name, area, WhatsApp. 
   Button: "Request a partner call".
8. Member waitlist form: name, WhatsApp number, area (select), favorite 
   café (text). Button: "Join the waitlist". On submit: inline validation, 
   then a calm confirmation state replacing the form ("You're on the list. 
   We'll message you on WhatsApp."). Store submissions in an in-memory array 
   and log to console.
9. FAQ: 6 to 7 accordion items (how are cafés paid, do cups roll over, what 
   if I don't use all, can I change cafés, gifting rules, what areas, how do 
   cafés join).
10. Footer: minimal, with the line "Prototype: prices and cafés are for 
    demonstration."

--- 4B. MEMBER APP PROTOTYPE (390x844 phone frame centered on desktop; 
full-screen on actual mobile) ---
Reference feel: Monzo clarity + Starbucks QR hero + Airbnb browsing.
Bottom tab bar (5 tabs, thin-line icons with labels): Home, Cafés, Pass 
(center, QR), Map, Rewards. Profile via avatar at top of Home.

Screens:
1. Onboarding (3 swipeable slides, skippable) then phone number entry with a 
   simulated OTP screen (any 4 digits work), then plan selection.
2. Home: greeting by name, large progress ring of "cups left this month" 
   (e.g. 11 of 16), renewal date, a "Next up" horizontal row of 
   recommended/nearby cafés with live status pills, and recent activity list.
3. Cafés: search bar + filter chips (Area, Quiet now, Roastery, Pastries). 
   List of café cards: name, area, distance, status pill, "cups from your 
   plan" if applicable. Tapping opens Café detail.
4. Café detail: sticky title, status pill, hours, eligible drinks list (with 
   credit value), "Add to my plan" button, loyalty progress for that café 
   (e.g. "3 of 5 visits to a free cup"). A bottom sheet style on open.
5. Plan picker: segmented control "Fixed" | "Build your own".
   - Fixed: three tiers as stacked cards, selecting one highlights it.
   - Build your own: list of all 8 cafés, each with a - / + stepper for 
     cups per month (0 to 10 per café; total minimum 6). A sticky summary bar 
     at the bottom showing total cups and monthly price, animating on change. 
     Pricing logic (see Section 6). Final CTA "Continue to payment" leads to 
     a simulated payment screen (JazzCash / Easypaisa / Card options, no 
     real data) then a success state.
6. Pass (QR): a large QR code (generated, scannable-looking), the member's 
   name, a short numeric code below it, a "refreshes in 0:30" circular timer 
   (QR regenerates every 30s), and the cups left. Screen brightness hint text 
   "Show this to the barista."
7. Map: a custom-drawn stylized SVG map of Lahore (simplified roads, a river 
   or canal line, area labels: Gulberg, DHA, Model Town, Johar Town, 
   Fortress, Liberty). Muted map palette matching the tokens. Pins for each 
   café colored by busy status. Tapping a pin opens a bottom sheet with 
   name, status, "updated X min ago", and a "Directions" button (no real 
   navigation). Toggle at top: "Now" | "Usually at 6pm" (shows a simulated 
   typical-busyness bar chart by hour for the selected café).
   IMPORTANT: busy status shown here must update live when the café view 
   (4C) changes a café's status. Use one shared in-memory state store.
8. Gifting: choose a recipient (phone/contact simulated), choose how many 
   cups or credits (1 to 3), choose a café or "any café", write a personal 
   message, preview the gift as a refined card, send. Success screen with a 
   shareable link. Show rules in small text (gifts expire in 60 days).
9. Rewards: streak counter, badges (designed as tasteful minimal SVG marks, 
   not cartoon icons), "Explorer: try 5 cafés" progress, referral section 
   ("Invite a friend, both get a cup"), and café-funded free cups.
10. Profile/settings (simple): plan, renewal, payment method, invite.

--- 4C. CAFÉ PARTNER VIEW (tablet landscape or phone; web) ---
Reference feel: Stripe dashboard simplicity + Square POS clarity. Used by a 
busy barista with one hand: huge targets, minimal reading.
1. Header: café name, today's date, a clear "Open" indicator.
2. Redeem panel (primary): a 6-digit code input with big numpad, or a 
   "Scan QR" button (simulated: opens a camera-style frame then resolves to a 
   sample member). On valid code show member name, cups remaining, daily limit 
   status, and a large "Redeem 1 cup" button. Success: calm check animation, 
   cups-left updates, and the entry appears in the list. Invalid or limit 
   reached shows a clear, polite error.
3. Busy status: three very large buttons (Quiet / Moderate / Packed) with 
   current one selected. Changing it updates the member map in real time and 
   stamps "updated just now".
4. Today: redemptions count, new customers brought in, estimated payout this 
   month (Rs), and a clean list of recent redemptions (time, drink, member 
   first name).
5. A small note: "Works on any phone or tablet. No special hardware."

=====================================================
5. DATA (fictional; no real brands)
=====================================================
8 cafés with: name, area, list price per cup (Rs 450 to 750), tags, 
current status, hours, 3 signature drinks.
Names: Kiln & Bean (Gulberg), Maple Roastery (DHA), Ember Coffee Co. 
(Model Town), Third Floor (Johar Town), Quiet Hours (Fortress), 
Slow Pour (Liberty), Noon Café (Gulberg), Grind & Grain (DHA).
Seed a demo member "Ayesha" on the Regular plan with 11/16 cups left.
Fixed tiers: Starter 8 cups Rs 3,500; Regular 16 cups Rs 6,500; 
Enthusiast 30 cups Rs 11,000.

=====================================================
6. LOGIC
=====================================================
- Build-your-own price = sum over cafés of (cups x café list price x 0.80), 
  rounded to nearest Rs 50, with a per-café max of 10 cups and a total 
  minimum of 6 cups. Show "You save Rs X vs paying at the counter" beneath 
  the total, calculated live.
- One global store object (state) holds: member, plan, cups remaining, 
  café statuses with timestamps, redemption log, gifts, waitlist entries. All 
  three surfaces read and write it so changes are reflected everywhere in 
  real time (use a simple pub-sub or event dispatch).
- "Updated X min ago" derives from timestamps and ticks forward.
- QR rotates every 30s with a visible countdown.
- Keep comments like // BACKEND: POST /redeem marking where a real API would 
  connect.

=====================================================
7. TECHNICAL REQUIREMENTS
=====================================================
- One self-contained .html file: inline CSS and JS, vanilla JavaScript (no 
  frameworks, no build step) unless a small library is genuinely needed.
- External resources limited to Google Fonts and, if needed, a pinned-version 
  script from cdnjs (for QR generation). NO remote images, NO external map 
  tiles, NO other CDNs. All imagery is inline SVG or CSS.
- Do not use localStorage/sessionStorage as a dependency; it must work with 
  in-memory state and render correctly when storage is unavailable.
- Responsive: landing page fluid from 360px to 1440px+; app screens designed 
  for 390px width; café view for 768px+ landscape and also works on phone.
- Accessibility: semantic HTML, labelled inputs, visible focus states, 
  color contrast AA, status never conveyed by color alone (always with text), 
  aria attributes for tabs/accordions/sheets, prefers-reduced-motion support.
- Performance: no layout shift, smooth 60fps transitions (animate transform 
  and opacity only).
- Use the typographic apostrophe and proper quotation marks in all copy.
- Include a viewport meta tag with viewport-fit=cover and respect safe-area 
  insets.

=====================================================
8. QUALITY BAR (self-review before delivering)
=====================================================
Check and fix before you finish:
[ ] Does it look like a premium brand, not an AI template? Remove anything 
    generic.
[ ] Only one accent color used; status colors only for status.
[ ] Consistent spacing, radius, icon stroke, and type scale everywhere.
[ ] Every button, tab, stepper, and form actually works; no dead links.
[ ] Changing a café's status in the café view updates the member map.
[ ] Price in the builder updates live and matches the formula.
[ ] Copy is specific, short, and free of banned phrases.
[ ] Dark mode is correct on every surface.
[ ] No console errors.

PROCESS
1. First, write a short plan: sitemap, screen list, and the state model.
2. Then build the complete file.
3. Then list 5 specific refinements I could ask for next.
Do not ask me questions before starting; make sensible assumptions and 
state them in one line.
