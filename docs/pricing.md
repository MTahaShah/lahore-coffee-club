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

### Other plans, for reference

**Double Shot plans** are Double Shot's own and cover Classic drinks only.
They pay out at the same band rates.

| Plan     | Price     | Per cup   | Café cost            | Margin   | Margin % |
|----------|----------:|----------:|---------------------:|---------:|---------:|
| 8 cups   | Rs 5,600  | Rs 700.00 | 8 × 500 = Rs 4,000   | Rs 1,600 | 28.6%    |
| 15 cups  | Rs 9,750  | Rs 650.00 | 15 × 500 = Rs 7,500  | Rs 2,250 | 23.1%    |
| 22 cups  | Rs 13,500 | Rs 613.64 | 22 × 500 = Rs 11,000 | Rs 2,500 | 18.5%    |

**My cafés** (Build your own) covers Classic only. Price = the sum over cafés
of cups × that café's latte price × 0.80, rounded to the nearest Rs 50. At
least 6 cups in total and at most 10 at one café. Every cup costs Rs 500,
so the margin per cup is 0.80 × latte price − 500. The prototype's default
plan is Kiln & Bean 4, Slow Pour 2, Noon Café 2:

- Counter value: 4 × 700 + 2 × 800 + 2 × 650 = Rs 5,700
- Price: 5,700 × 0.80 = 4,560, rounded to Rs 4,550
- Café cost: 8 × 500 = Rs 4,000
- Margin: Rs 550 (12.1%)

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
café directly. We pay the café the rate of the plan's band.

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
- **My cafés at low latte prices.** At a Rs 600 latte the member pays Rs 480
  a cup and the café is paid Rs 500, a Rs 20 loss per cup. Break-even is a
  Rs 625 latte. Ember Coffee Co. and Third Floor are at Rs 600 today.
- **Complimentary cups.** Beans rewards and passport rewards are paid to
  cafés at band rates with no plan revenue behind them.
- **Top-ups pay cafés less than the menu.** In the example above the café
  gets Rs 610 for a Rs 910 drink. Some cafés may push back on this.
- **These are placeholders.** The band rates, the band ceilings and the plan
  prices are working numbers until cafés agree to the rates.
