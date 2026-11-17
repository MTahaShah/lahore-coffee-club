# Pricing

How Lahore Coffee Club prices plans and pays cafés. The numbers here match
`src/data.js` (`BANDS`, `PLANS`), which is the single source in the
prototype. All prices are in Pakistani rupees, before tax.

## Where the numbers come from

The 17 Nov 2026 menu research (13 Lahore cafés on foodpanda.pk, project
doc `explorer-pricing-research.md`). Members tend to order the dearest
drink their cup allows, so each band's cup is valued halfway between the
band's average price and its top price:

| Band      | Average in band | Average top | Cup valued at |
|-----------|----------------:|------------:|--------------:|
| Classic   | Rs 654          | Rs 733      | Rs 694        |
| Signature | Rs 884          | Rs 961      | Rs 922        |
| Reserve   | Rs 1,206        | Rs 1,335    | Rs 1,270      |

(Reserve uses the 80 drinks priced Rs 1,001–1,500.) The café is paid 70%
of that value, rounded to Rs 10. Members pay about 80% of it, a little less
on bigger packs, rounded to Rs 50.

## Bands

Every drink belongs to a band, set by its menu price before tax.

| Band      | Menu price        | Café rate per cup |
|-----------|-------------------|------------------:|
| Classic   | up to Rs 750      | Rs 490            |
| Signature | Rs 751 to 1,000   | Rs 650            |
| Reserve   | Rs 1,001 to 1,500 | Rs 890            |
| None      | above Rs 1,500    | not covered       |

Each plan covers drinks up to a band. The café is paid the rate of the
band of the drink actually redeemed, capped at the plan's band.

## Plans

| Plan       | Cups | Covers          | Price     | Price per cup | Saving vs counter |
|------------|-----:|-----------------|----------:|--------------:|------------------:|
| Starter    | 8    | Classic         | Rs 4,450  | Rs 556        | 20%               |
| Regular    | 16   | Classic         | Rs 8,650  | Rs 541        | 22%               |
| Enthusiast | 30   | Classic         | Rs 16,250 | Rs 542        | 22%               |
| Executive  | 16   | up to Signature | Rs 11,500 | Rs 719        | 22%               |
| Reserve    | 12   | up to Reserve   | Rs 12,200 | Rs 1,017      | 20%               |

These are Explorer plans: one pool of cups for any partner café, at most
2 cups at one café a month and 2 a day.

Enthusiast costs the same per cup as Regular. The research advised against
a 30-cup pack at a deeper discount: at 25% off the margin falls to about 4%.

## Margin per plan

This is the worst case: every cup is redeemed at the plan's top band.
Café cost = cups × that band's rate. Margin = price − café cost, before
payment fees (about 3%; see Risks).

| Plan       | Price     | Café cost (top band) | Margin   | Margin % | After 3% fees |
|------------|----------:|---------------------:|---------:|---------:|--------------:|
| Starter    | Rs 4,450  | 8 × 490 = Rs 3,920   | Rs 530   | 11.9%    | 8.9%          |
| Regular    | Rs 8,650  | 16 × 490 = Rs 7,840  | Rs 810   | 9.4%     | 6.4%          |
| Enthusiast | Rs 16,250 | 30 × 490 = Rs 14,700 | Rs 1,550 | 9.5%     | 6.5%          |
| Executive  | Rs 11,500 | 16 × 650 = Rs 10,400 | Rs 1,100 | 9.6%     | 6.6%          |
| Reserve    | Rs 12,200 | 12 × 890 = Rs 10,680 | Rs 1,520 | 12.5%    | 9.5%          |

Members who drink below their plan's top band cost less. For example, an
Executive cup of a Classic drink costs Rs 490, not Rs 650. Unused cups
expire, so the real margin is higher: the research puts it near 21–23%
if 85% of cups are used.

## Legacy Double Shot plans (not for sale)

Double Shot's own plans (8 cups Rs 5,600, 15 cups Rs 9,750, 22 cups
Rs 13,500) are no longer sold and don't appear in the plan picker. Members
who already hold one keep it until they change plans. They cover Classic
drinks, and every cup is paid at the band rates like any other. Double Shot
is now a partner café on Explorer and My cafés, counted as one café across
its seven branches.

## My cafés

Cups reserved at chosen cafés, usable only there. For each café the member
picks a band, and every cup at that café costs the band's My cafés price:

| Band      | Member pays per cup | Café rate | Margin per cup | Margin % |
|-----------|--------------------:|----------:|---------------:|---------:|
| Classic   | Rs 550              | Rs 490    | Rs 60          | 10.9%    |
| Signature | Rs 720              | Rs 650    | Rs 70          | 9.7%     |
| Reserve   | Rs 1,010            | Rs 890    | Rs 120         | 11.9%    |

- Price = the sum over cafés of cups × the band's price per cup.
- At most 30 cups a month in total (all at one café or spread out), and at least 6.
- A café offers only the bands it serves. Maple Roastery and Slow Pour offer
  Classic and Reserve; Double Shot offers all three; the others offer
  Classic and Signature.
- Double Shot counts as one café: its cups work at any branch, and each cup
  is paid to the branch that served it.
- The margins above are the worst case. A member who drinks below the band
  they chose costs less: a Classic drink on a Signature cup pays the café
  Rs 490, not Rs 650.
- "You save Rs X vs the counter" compares the plan with the counter price
  of the same cups. For Classic that's the café's latte price. For
  Signature and Reserve it's the average price of that café's drinks in
  that band.

Worked example: Kiln & Bean 3 Classic, Maple Roastery 2 Reserve, Double
Shot 2 Signature.

| Café           | Cups | Band      | Member pays       | Counter price           | Café paid (top of band) |
|----------------|-----:|-----------|------------------:|------------------------:|------------------------:|
| Kiln & Bean    | 3    | Classic   | 3 × 550 = 1,650   | 3 × 700 (latte) = 2,100 | 3 × 490 = 1,470         |
| Maple Roastery | 2    | Reserve   | 2 × 1,010 = 2,020 | 2 × 1,325 = 2,650       | 2 × 890 = 1,780         |
| Double Shot    | 2    | Signature | 2 × 720 = 1,440   | 2 × 876 = 1,752         | 2 × 650 = 1,300         |
| Total          | 7    |           | Rs 5,110          | Rs 6,502                | Rs 4,550                |

- Maple's Reserve price is the average of its two Reserve pour-overs:
  (1,200 + 1,450) ÷ 2 = Rs 1,325. Double Shot's Signature price is the
  average of its drinks priced Rs 751–1,000, Rs 876.
- The member saves 6,502 − 5,110 = Rs 1,392 vs the counter.
- Margin: 5,110 − 4,550 = Rs 560 (11.0%).

## Worked example: one Executive member's month

Rs 11,500 for 16 cups, covering up to Signature. With at most 2 cups at
each café, here is a month across eight cafés:

| Café           | Drink (menu price)                       | Band      | Top-up | Café paid |
|----------------|------------------------------------------|-----------|-------:|----------:|
| Kiln & Bean    | Single-origin pour-over (950), twice     | Signature | 0      | 2 × 650   |
| Ember          | Pistachio latte (900), twice             | Signature | 0      | 2 × 650   |
| Third Floor    | Lotus iced latte (950)                   | Signature | 0      | 650       |
| Third Floor    | Affogato (850)                           | Signature | 0      | 650       |
| Noon Café      | Kunafa latte (950)                       | Signature | 0      | 650       |
| Noon Café      | Cappuccino (600)                         | Classic   | 0      | 490       |
| Grind & Grain  | Brown sugar oat latte (850)              | Signature | 0      | 650       |
| Grind & Grain  | Grain latte (650)                        | Classic   | 0      | 490       |
| Quiet Hours    | Dark chocolate mocha (880)               | Signature | 0      | 650       |
| Quiet Hours    | Flat white (650)                         | Classic   | 0      | 490       |
| Maple Roastery | Ethiopia Yirgacheffe pour-over (1,200)   | Reserve   | 200    | 650       |
| Maple Roastery | Oat honey latte (750)                    | Classic   | 0      | 490       |
| Slow Pour      | Ethiopia Guji, Chemex (1,250)            | Reserve   | 250    | 650       |
| Slow Pour      | Latte (800)                              | Signature | 0      | 650       |

- Cups: 16. Twelve paid at the Signature rate (12 × 650 = Rs 7,800) and
  four at the Classic rate (4 × 490 = Rs 1,960).
- Café cost: Rs 9,760.
- Margin: 11,500 − 9,760 = Rs 1,740 (15.1%), compared with Rs 1,100 (9.6%)
  in the worst case.
- The two Reserve drinks are above the plan's band, so the member paid
  Rs 450 in top-ups (200 + 250) at those counters. That money goes to the
  cafés, not to us, and is not in the margin.

## Drinks above the plan's band

The member still uses one cup and pays the difference at the counter:
"Cup + Rs X", where X = drink price − the plan's band ceiling (Rs 750
Classic, Rs 1,000 Signature, Rs 1,500 Reserve). The member pays X to the
café directly. We pay the café the rate of the plan's band. On My cafés,
the plan's band is the one chosen for that café.

Worked example: a member on Regular (Classic) orders a Salted Caramel Latte
at Double Shot, Rs 910 (Signature).

- Top-up: 910 − 750 = Rs 160, paid by the member at the till.
- We pay Double Shot the Classic rate: Rs 490.
- Double Shot receives 160 + 490 = Rs 650 for a Rs 910 drink.

For drinks above Rs 1,500 the same rule applies. A Reserve member's Rs 1,650
Coconut Latte is Cup + Rs 150, and the café is paid Rs 890.

The same applies to pickup orders and group tables. There the member pays
the top-up in the app. The café receives it less the 5% LCC order fee, as
with any online payment.

## Risks

- **Payment fees are not included.** Card and wallet fees come out of the
  margins above. For example, a 3% fee on Rs 11,500 is Rs 345, which
  brings Executive's worst-case margin from Rs 1,100 (9.6%) to Rs 755 (6.6%).
  The real rate depends on the provider.
- **Prices are before tax.** Bands use menu prices before tax. Where a café
  lists prices with tax, we need the pre-tax price to band each drink, and
  members will see different numbers on the menu board.
- **Members who redeem only at top-band cafés.** The margin table already
  assumes every cup is at the plan's top band. That is the floor, and it is
  thin for Regular, Enthusiast and Executive (about 6.5% after fees). The 2-cups-per-café cap
  spreads cups out, but a Reserve member with enough Reserve-priced cafés
  could land at that floor every month.
- **My cafés savings are small at lower-priced cafés.** A Classic cup is
  Rs 550. Where the latte is Rs 600 (Ember Coffee Co., Third Floor) the
  member saves only Rs 50 a cup. The Signature margin, Rs 70 on Rs 720
  (9.7%), is the thinnest per cup.
- **Complimentary cups.** Beans rewards and passport rewards are paid to
  cafés at band rates with no plan revenue behind them. Beans: 10 a drink,
  500 for a complimentary drink, so a 30-cup member earns at most one
  free Classic cup (Rs 490) about every 7 weeks.
- **Owners may push for 75%.** At 75% of the cup's value the café rates
  become about Rs 520 / 690 / 950, and worst-case margins after fees fall
  close to zero. The business would then rely on unused cups.
- **Top-ups pay cafés less than the menu.** In the example above the café
  gets Rs 650 for a Rs 910 drink. Some cafés may push back on this.
- **These are placeholders.** The band rates, the band ceilings and the plan
  prices are working numbers until cafés agree to the rates.
