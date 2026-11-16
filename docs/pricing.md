# Pricing

How Lahore Coffee Club prices plans and pays cafés. The numbers here match
`src/data.js` (`BANDS`, `PLANS`), which is the single source in the
prototype. All prices are in Pakistani rupees, before tax.

## Bands

Every drink belongs to a band, set by its menu price before tax.

| Band      | Menu price        | Café rate per cup |
|-----------|-------------------|------------------:|
| Classic   | up to Rs 800      | Rs 500            |
| Signature | Rs 801 to 1,100   | Rs 700            |
| Reserve   | Rs 1,101 to 1,500 | Rs 950            |
| None      | above Rs 1,500    | not covered       |

Each plan covers drinks up to a band. The café is paid the rate of the
band of the drink actually redeemed, capped at the plan's band.

## Plans

| Plan       | Cups | Covers          | Price     | Price per cup |
|------------|-----:|-----------------|----------:|--------------:|
| Starter    | 8    | Classic         | Rs 4,500  | Rs 562.50     |
| Regular    | 16   | Classic         | Rs 9,000  | Rs 562.50     |
| Enthusiast | 30   | Classic         | Rs 16,500 | Rs 550.00     |
| Executive  | 16   | up to Signature | Rs 12,000 | Rs 750.00     |
| Reserve    | 12   | up to Reserve   | Rs 12,500 | Rs 1,041.67   |

These are Explorer plans: one pool of cups for any partner café, at most
2 cups at one café a month and 2 a day.

## Margin per plan

This is the worst case: every cup is redeemed at the plan's top band.
Café cost = cups × that band's rate. Margin = price − café cost.

| Plan       | Price     | Café cost (top band) | Margin   | Margin % |
|------------|----------:|---------------------:|---------:|---------:|
| Starter    | Rs 4,500  | 8 × 500 = Rs 4,000   | Rs 500   | 11.1%    |
| Regular    | Rs 9,000  | 16 × 500 = Rs 8,000  | Rs 1,000 | 11.1%    |
| Enthusiast | Rs 16,500 | 30 × 500 = Rs 15,000 | Rs 1,500 | 9.1%     |
| Executive  | Rs 12,000 | 16 × 700 = Rs 11,200 | Rs 800   | 6.7%     |
| Reserve    | Rs 12,500 | 12 × 950 = Rs 11,400 | Rs 1,100 | 8.8%     |

Members who drink below their plan's top band cost less. For example, an
Executive cup of a Classic drink costs Rs 500, not Rs 700.

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
| Classic   | Rs 560              | Rs 500    | Rs 60          | 10.7%    |
| Signature | Rs 760              | Rs 700    | Rs 60          | 7.9%     |
| Reserve   | Rs 1,040            | Rs 950    | Rs 90          | 8.7%     |

- Price = the sum over cafés of cups × the band's price per cup.
- At most 10 cups at one café and at least 6 in total.
- A café offers only the bands it serves. Maple Roastery and Slow Pour offer
  Classic and Reserve; Double Shot offers all three; the others offer
  Classic and Signature.
- Double Shot counts as one café: its cups work at any branch, and each cup
  is paid to the branch that served it.
- The margins above are the worst case. A member who drinks below the band
  they chose costs less: a Classic drink on a Signature cup pays the café
  Rs 500, not Rs 700.
- "You save Rs X vs the counter" compares the plan with the counter price
  of the same cups. For Classic that's the café's latte price. For
  Signature and Reserve it's the average price of that café's drinks in
  that band.

Worked example: Kiln & Bean 3 Classic, Maple Roastery 2 Reserve, Double
Shot 2 Signature.

| Café           | Cups | Band      | Member pays      | Counter price              | Café paid (top of band) |
|----------------|-----:|-----------|-----------------:|---------------------------:|------------------------:|
| Kiln & Bean    | 3    | Classic   | 3 × 560 = 1,680  | 3 × 700 (latte) = 2,100    | 3 × 500 = 1,500         |
| Maple Roastery | 2    | Reserve   | 2 × 1,040 = 2,080 | 2 × 1,325 = 2,650         | 2 × 950 = 1,900         |
| Double Shot    | 2    | Signature | 2 × 760 = 1,520  | 2 × 950 = 1,900            | 2 × 700 = 1,400         |
| Total          | 7    |           | Rs 5,280         | Rs 6,650                   | Rs 4,800                |

- Maple's Reserve price is the average of its two Reserve pour-overs:
  (1,200 + 1,450) ÷ 2 = Rs 1,325. Double Shot's Signature price is the
  average of its 31 Signature drinks, Rs 29,435 ÷ 31 = Rs 949.52, shown as
  Rs 950.
- The member saves 6,650 − 5,280 = Rs 1,370 vs the counter.
- Margin: 5,280 − 4,800 = Rs 480 (9.1%).

## Worked example: one Executive member's month

Rs 12,000 for 16 cups, covering up to Signature. With at most 2 cups at
each café, here is a month across eight cafés:

| Café           | Drink (menu price)                       | Band      | Top-up | Café paid |
|----------------|------------------------------------------|-----------|-------:|----------:|
| Kiln & Bean    | Single-origin pour-over (950), twice     | Signature | 0      | 2 × 700   |
| Ember          | Pistachio latte (900), twice             | Signature | 0      | 2 × 700   |
| Third Floor    | Lotus iced latte (950)                   | Signature | 0      | 700       |
| Third Floor    | Affogato (850)                           | Signature | 0      | 700       |
| Noon Café      | Kunafa latte (950)                       | Signature | 0      | 700       |
| Noon Café      | Cappuccino (600)                         | Classic   | 0      | 500       |
| Grind & Grain  | Brown sugar oat latte (850)              | Signature | 0      | 700       |
| Grind & Grain  | Grain latte (650)                        | Classic   | 0      | 500       |
| Quiet Hours    | Dark chocolate mocha (880)               | Signature | 0      | 700       |
| Quiet Hours    | Flat white (650)                         | Classic   | 0      | 500       |
| Maple Roastery | Ethiopia Yirgacheffe pour-over (1,200)   | Reserve   | 100    | 700       |
| Maple Roastery | Oat honey latte (750)                    | Classic   | 0      | 500       |
| Slow Pour      | Ethiopia Guji, Chemex (1,250)            | Reserve   | 150    | 700       |
| Slow Pour      | Latte (800)                              | Classic   | 0      | 500       |

- Cups: 16. Eleven paid at the Signature rate (11 × 700 = Rs 7,700) and
  five at the Classic rate (5 × 500 = Rs 2,500).
- Café cost: Rs 10,200.
- Margin: 12,000 − 10,200 = Rs 1,800 (15.0%), compared with Rs 800 (6.7%)
  in the worst case.
- The two Reserve drinks are above the plan's band, so the member paid
  Rs 250 in top-ups (100 + 150) at those counters. That money goes to the
  cafés, not to us, and is not in the margin.

## Drinks above the plan's band

The member still uses one cup and pays the difference at the counter:
"Cup + Rs X", where X = drink price − the plan's band ceiling (Rs 800
Classic, Rs 1,100 Signature, Rs 1,500 Reserve). The member pays X to the
café directly. We pay the café the rate of the plan's band. On My cafés,
the plan's band is the one chosen for that café.

Worked example: a member on Regular (Classic) orders a Salted Caramel Latte
at Double Shot, Rs 910 (Signature).

- Top-up: 910 − 800 = Rs 110, paid by the member at the till.
- We pay Double Shot the Classic rate: Rs 500.
- Double Shot receives 110 + 500 = Rs 610 for a Rs 910 drink.

For drinks above Rs 1,500 the same rule applies. A Reserve member's Rs 1,650
Coconut Latte is Cup + Rs 150, and the café is paid Rs 950.

The same applies to pickup orders and group tables. There the member pays
the top-up in the app. The café receives it less the 5% LCC order fee, as
with any online payment.

## Risks

- **Payment fees are not included.** Card and wallet fees come out of the
  margins above. For example, a 2.5% fee on Rs 12,000 is Rs 300, which
  brings Executive's worst-case margin from Rs 800 (6.7%) to Rs 500 (4.2%).
  The real rate depends on the provider.
- **Prices are before tax.** Bands use menu prices before tax. Where a café
  lists prices with tax, we need the pre-tax price to band each drink, and
  members will see different numbers on the menu board.
- **Members who redeem only at top-band cafés.** The margin table already
  assumes every cup is at the plan's top band. That is the floor, and it is
  thin for Executive (6.7%) and Reserve (8.8%). The 2-cups-per-café cap
  spreads cups out, but a Reserve member with enough Reserve-priced cafés
  could land at that floor every month.
- **My cafés savings are small at lower-priced cafés.** A Classic cup is
  Rs 560. Where the latte is Rs 600 (Ember Coffee Co., Third Floor) the
  member saves only Rs 40 a cup. The Signature margin, Rs 60 on Rs 760
  (7.9%), is the thinnest per cup.
- **Complimentary cups.** Beans rewards and passport rewards are paid to
  cafés at band rates with no plan revenue behind them.
- **Top-ups pay cafés less than the menu.** In the example above the café
  gets Rs 610 for a Rs 910 drink. Some cafés may push back on this.
- **These are placeholders.** The band rates, the band ceilings and the plan
  prices are working numbers until cafés agree to the rates.
