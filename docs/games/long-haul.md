# Long Haul — notes on the original and a log of every change

*Long Haul* is a remake of **Trucker**, a GW-BASIC program by Hughes
Glantzberg from the early 1980s. The source (`sources/Trucker/trucker.bas`,
386 numbered lines, its title drawn in CP437 box characters) is the
reference for everything below: where this document and the prompt that
commissioned the port disagree, the source wins, and the disagreement is
listed.

The original prints its author's postal address under the title. That
address is not reproduced anywhere in the port, its documents or its tests;
the title shows only "by Hughes Glantzberg".

- [How the original behaves](#how-the-original-behaves)
- [What the port keeps](#what-the-port-keeps)
- [Bugs in the original, and what the port does instead](#bugs-in-the-original-and-what-the-port-does-instead)
- [Corrections to the route tables](#corrections-to-the-route-tables)
- [Where the brief and the source disagree](#where-the-brief-and-the-source-disagree)
- [Diff log: every deliberate change](#diff-log-every-deliberate-change)
- [Balance](#balance)

## How the original behaves

Variable names are the original's; line numbers are in brackets.

### Start-up (l. 5–200, 1000–1375)

The title spells TRUCKER in double-line box characters across an 80-column
screen, frames it, and signs it "by Hughes Glantzberg" (l. 20–150). It waits
four seconds, seeds the generator from the time of day (l. 160) and reads the
three route tables from `DATA` (l. 1130–1170).

Every trip starts at **the Los Angeles trucking terminal at 8 AM on Monday**
(HR = 0 is 8 AM, l. 2100). The player has slept 7 hours (HS = 7) and has been
awake 3 (HL = 3). In order the program asks:

1. **Cargo** (l. 1030–1090): oranges ("highest profit if they don't spoil"),
   freight forwarding ("penalty for late delivery") or U.S. Mail ("lowest
   rate, but no hurry to arrive"). "The cargo is due in New York by 4 PM on
   Thursday."
2. **Pounds** (l. 1100–1200): "40,000 is the legal limit"; under 25,000 is
   refused ("You can't make a living on half a load."), over 50,000 is
   trimmed to a full trailer.
3. **Diesel**: 190 gallons are bought for $190 without asking (l. 1225).
4. **Tyres** (l. 1230–1330): "Two of your tires are worn." New tyres cost
   $200 and take 4 off the wear TC (which starts at 10); retreads $100 and 3.
   Asking for three new tyres puts a new one on the spare too (TS = 2).
5. **Route** (l. 1350–1375): northern (RT = 1, RH = 4: 2,710 miles), middle
   (RT = 0, RH = 2: 2,850) or southern (RT = 2, RH = 1: 3,120). RH makes the
   north kind to tyres but strict about speed, the south the opposite.

### The hour (l. 1400–1670)

The program asks "How fast do you wish to go (20-100)?" and then simulates
one hour at that speed, in this order:

- **Crash** (l. 1420): `SP² × CD × CR > RND × 10⁷`, where CD is the fatigue
  risk (1, 2, 4, 8, 25 or 100) and CR the weather risk (1 clear, 3 wet, 5 rain
  or light snow, 10 fog, 50 blizzard).
- **Blowout** (l. 1440): `√(MF + 100) × TC > RH × 25000 × RND`. MF is the
  odometer, so the risk grows through the trip.
- **Police** (l. 1450): above `SL − RH + 10` a patrol may stop the truck; no
  ticket while `(SP − SL + 2·RH − 5)² < 900 × RND` (l. 2310). Each offence
  costs hours at the justice of the peace and a fine of `5 × (RT + NT × RND × 4)`
  dollars plus `NT × RND × 5` dollars per mph over (l. 2390–2410). The fourth
  is 30 days in jail and the end of the game (l. 2430–2460).
- **Fuel** (l. 1480–1500): miles per gallon are `4.5 − 0.2 × min(|55 − SP|, 12.5)`.
  Running dry costs a roadside barrel (l. 2500–2590, "DUMMY !!").
- **Odometer and arrival** (l. 1510–1520).

Speeds over half again the limit are capped ("You can only get the old rig to
go 82 MPH on this road.", l. 1660). Every fourth hour a truck stop is offered
(l. 1630). The screen shows the day and time, an *approximate* fuel figure
(±5 gallons, l. 1560), speed, odometer and miles to go.

### Truck stops (l. 1700–2020)

"Truck stop ahead. Do you want to stop?" Saying no costs an hour more awake
(l. 1720). Stopping: diesel at 85–119 ¢ a gallon (l. 1740), a 200-gallon
tank that spills the excess (l. 1790), a tyre shop when the spare is gone
(l. 1800), an hour for fuel and food, and an offer of sleep. Sleep between
8 PM and 6 AM counts in full; in daytime "thanks to the daytime noise" only
half of it does (l. 1970). More than three hours of sleep resets HL; less
halves it (l. 1990). A parked reefer burns 7 gallons an hour, and with
oranges aboard the program offers more fuel after the nap (l. 2015).

### Weather (l. 2800–2985) and fatigue (l. 3000–3060)

Each hour the weather is drawn afresh as `AF = (3000 + MF) × RND` against
per-route thresholds, so the further east the truck gets, the worse it can
be; a blizzard needs `AF` over 4,800 on the middle route, 4,900 on the north
and 5,700 on the south. Fatigue is a ladder on HL (hours awake) and HR/HS
(how much of the trip was spent awake): rested, fine, bored, tired,
fatigued, exhausted.

### Waypoints (l. 3100–3920)

Each route is a `DATA` table of waypoints: mile, name, road, and a code ZH
whose integer part says what happens there and whose fraction is a
probability or an amount (l. 3130):

| Code | Event |
|---|---|
| 1 | Time zone: "set clock ahead one hour" (HR + 1) |
| 2 | Toll of `100 × fraction` dollars |
| 3 | Construction with probability `1 − fraction`: limit 35 for an hour |
| 4 | Radar with probability `1 − fraction`; reads ±2.5 mph, ticket if over limit + 3 |
| 5 | Weigh station, open with probability `1 − fraction` (a whole 5 is a coin toss); 60,000 lb gross limit, fine $200 + 2–5 ¢ a pound; a whole 5 in Louisiana turns the truck back for a 200-mile detour at 45 mph |
| 6 | Rock slide at the Allegheny tunnel: 0–5 hours, half of them slept |
| 7 | Reefer failure (oranges only): 2 hours, $100 and 0–4 points of damage |

### Crash (l. 4000–4170)

"C R A S H !!", one of six causes chosen by the state of driver and road
(asleep, a snow-filled ditch, a pick-up in the fog, speed, a slick spot, a
drunk driver), then "You lose your truck & profits." and the record is wiped.

### Arrival and pay (l. 5000–5490)

"WELCOME TO NEW YORK". A night arrival waits for the warehouse (l. 5110).
The trip costs its expenses plus **$85 for every day started** (l. 5180).
Oranges pay 6.5 ¢ a pound, less 5 % per point of damage, and pick up random
damage for each day beyond four; over 6 points they are hauled to the dump
(l. 5220–5290). Freight pays 5 ¢, with a 10 % penalty if late (HR ≥ 95,
Friday 7 AM). Mail pays 4.75 ¢ whenever it arrives. Then the verdict: "Your
net profit this trip was …", "G O O D   W O R K  !!" over $100, the running
average from the second trip, "You'd make more money washing dishes !" under
$200 profit or a $250 average, and, after a loss that leaves the running
total below zero, "You are bankrupt !!! Your rig has been repossessed."

## What the port keeps

- **Every rule above**, as code in `ports/long-haul/src/engine/`, with the
  original's line numbers in its comments: the crash, blowout, police, fuel,
  weather and fatigue formulas, the waypoint codes, the stop, the arrival and
  the verdict. Money is kept in cents.
- **The three route tables**, verbatim in `original-data.ts`, decoded at
  start-up; corrections are applied on top and listed below.
- **The original's words** wherever it had them: "Your just blew a tire !!",
  "Smokey is behind you with his lights on. Pull over!", "STOP! Pay toll",
  "DUMMY !!", "C R A S H !!", "You lose your truck & profits.",
  "G O O D   W O R K  !!", "You'd make more money washing dishes !", "You are
  bankrupt !!!". The event cards quote them in a green-screen box.
- **Monday 8 AM at the terminal**, 190 gallons for $190, two worn tyres, the
  80-hour due time and the 95-hour cutoff.
- **The pacing**: the game is still an hour at a time. Real time plays each
  hour in about three seconds; leg by leg and the text mode play it as the
  original did.

## Bugs in the original, and what the port does instead

| Line | What the original does | What the port does |
|---|---|---|
| 1850 | Buying a tyre at a truck stop runs `STOP`, ending the program. | Sells a new or retreaded spare, as the prompt before it promises. |
| 2550 | The $200 barrel of diesel is added to `ZC`, a variable nothing reads, so running dry is free. | Charges the $200. |
| 2660 | After changing a tyre, `HL = HR + T + 1` sets the hours awake to the whole trip's hours: anyone who changes a tyre after the first day is instantly exhausted. | Adds the hours of the change plus one to the hours awake. |
| 2740 | `TIMEPUT=2` (for `TIMEOUT`) skips the pause after the tow truck. | The tow truck has its own card, like any other event. |
| 2170 | `DH$="Midnight"` assigns the wrong variable (`DM$` was meant), so midnight prints as "12 AM". | Midnight and Noon are named. |
| 3020–3030 | `COS(HR/HS) < 2.3` and `< 2.5` can never be false, so the two best fatigue states depend on HL alone. The neighbouring lines compare HR/HS itself with 3 and 4. | Compares the ratio HR/HS with 2.3 and 2.5. The original ladder is kept as `originalFatigueOf` for comparison: it lets a sleepless driver feel "fine" longer, and simulated balanced drivers crash a little less with it (about 8 % of trips against 10 %). |
| 1520 / 1600 | Arrival is checked before the waypoints, so an hour that crosses the last waypoints and New York at once skips them, and the Holland Tunnel toll with them. | Every waypoint passed in the hour is handled, then the arrival. |
| 5110 | The hour of the day is taken as `HR − INT(HR/24)` (instead of `HR − 24 × INT(HR/24)`), which leaves the range after the first day: the warehouse never closes. Had it worked, the wait would have run to 8 AM. | The warehouse is shut from 6 PM to 6 AM, local time, and a night arrival waits for 6 AM, which is what gives the 95-hour (Friday 7 AM) cutoff its meaning. |
| 5340 | "You're late!! Subtract ten percent penalty." — and nothing is subtracted. | Subtracts 10 %. |
| 1100 / 3540 | The prompt calls 40,000 lb "the legal limit", but the scale checks 60,000 lb gross: rig 19,000 + cargo + 7 lb a gallon + up to 225 lb. With a full tank the true limit is 39,375 lb; with 100 gallons, 40,075. | The dispatch sheet shows the real legal load for the fuel aboard. |
| Hours after a stop | Fatigue and weather are worked out once per hour before the stop, so the first hour after a night's sleep is driven "exhausted" through the previous evening's blizzard. | After sleep, the driver and the weather are judged afresh. A stop without sleep keeps the weather: an hour over coffee does not move a storm. |
| 1720 / 1630 | (Kept.) Passing up a stop costs an hour awake. | Kept, and said so on the stop sign. |

## Corrections to the route tables

The tables are copied verbatim into `original-data.ts`; these edits are
applied when they are decoded (`TABLE_CORRECTIONS` in `original-routes.ts`,
checked by the tests).

| Route | Waypoint | Change | Why |
|---|---|---|---|
| middle | Flagstaff | road "I-40 in California" → "I-40 in Arizona" | Flagstaff is in Arizona. |
| middle | Indianapolis, Ohio border | "Indianna" → "Indiana" | Spelling. |
| middle | Holland Tunnel | "I-70 in New Jersey" → "New Jersey Turnpike" | I-70 never reaches New Jersey. |
| north | Demoines | → "Des Moines" | Spelling. |
| north | Ohio border | "Indianna Turnpike" → "Indiana Turnpike" | Spelling. |
| north | East Stroudsberg | → "East Stroudsburg" | Spelling. |
| north | Washington Bridge | → "George Washington Bridge" | Its name. |
| north | Las Vegas → Utah border | the Mountain time change moves to the Utah border | Las Vegas keeps Pacific time. |
| north | Gary | adds the Eastern time change | The north never set its clock to Eastern and arrived an hour behind the other two routes. |
| south | Alabama border → Georgia border | the Eastern time change moves to the Georgia border | Alabama is on Central time. |
| south | Carolina border | → "South Carolina border" | The first Carolina on I-85 is the South one. |
| south | Greensboro | "I-85 in Carolina" → "I-85 in the Carolinas" | The leg crosses both. |
| south | New Lersey border | → "New Jersey border" | Spelling. |

## Where the brief and the source disagree

- **The 40,000 vs 60,000 lb limits**: the brief lists it among the bugs; the
  source's 60,000 lb gross check is the rule, and the 40,000 in the prompt is
  treated as a misleading label (see above).
- **Oranges "spoil after four days"**: in the source they do not spoil at a
  fixed time. From the fifth day on, each day can add 0–2 points of damage;
  over 6 points the load is dumped. The port keeps the source's rule, and
  the dispatch sheet and the route strip count the four days.
- **"Every fourth hour" for truck stops**: the source offers a stop once more
  than three hours have passed since the last (`NS > 3`), so after a stop or
  a refusal the next comes four hours later. Same thing, said differently.

## Diff log: every deliberate change

**Front ends.** The engine plays an hour at a time and three front ends sit
on it (ADR 0016):

- *Real time*, the default: each hour plays in about three seconds (1×, 2×
  or 4× warp) with a throttle that sets the speed for the coming hours.
  Serious events (a crash, police, a blowout, a closed scale, running dry)
  stop the clock as cards; small ones (tolls, time zones, passing a scale)
  slide in as notes. Setting *Stop the clock for every event* makes all of
  them cards. A truck stop is a sign that slides in; press Pull in (T) to
  take it. **The game asks, as the original always did, when passing it up
  would be risky**: a tank under 30 %, a tired driver, or no spare.
- *Leg by leg*: the original's rhythm, a speed chosen at every waypoint (and
  again when the weather turns or fatigue sets in), the leg then plays out
  quickly; every truck stop asks.
- *Text mode* (Settings → Text mode, Single Haul only): the original prompts,
  green on black, hour by hour, with the bugs fixed. Enter repeats the last
  speed and fills the tank.

**Two views** of the same road, switchable at any time: the side diorama
(32 landscapes drawn in code, from the Mojave to Manhattan) and the cab,
with the dashboard, the CB set and a folded atlas clipped to the dash.

**Truck stops** become places: a named diner with a special and a pie of the
day, the pump, the tyre shop, a **cup of coffee** (50 ¢, two hours fewer
awake, never below zero) and a **motel room** ($16–27, quiet in daytime, so
daytime sleep counts in full). In a career a **sleeper cab** does the same.

**Single Haul** adds the **return trip**, New York to Los Angeles, on the
same three routes reversed: tolls on the Hudson crossings are paid
eastbound only, the Louisiana barrier and the Allegheny rock slide face the
other way, and the clock goes back three hours. Freight is due Thursday
4 PM local time as before, which is 74 hours (late at 89) with the clock
going back.

**Living weather.** On the career and daily network, weather is not drawn
per hour but comes from drifting systems (blizzards out of the Rockies and
the northern plains, fog in the Appalachians and the Central Valley, rain
off the Gulf), seeded per trip and season, mapped onto the original's six
conditions. The original routes keep the original weather draw. The planner shows
the forecast; the map shows the systems.

**Career** (new): nineteen hubs joined by thirty-four interstate corridors
(ADR 0017). A job board of five loads a day, better ones as your reputation
grows; contracts pay the original rates per pound, scaled by distance; rush,
heavy and early-bonus loads; six upgrades; seasons; an offence record that
forgets after 60 days. Changes to the original's economy, all for the
career only:

- **Diesel carries over.** The tank is not refilled at $1 a gallon at every
  terminal; only the top-up to 190 gallons is paid for.
- **Heavy loads are 40,000 lb**, legal with up to about 110 gallons aboard,
  and pay 15 % more. The terminal fills a heavy load's tank only that far.
  The first design posted 44,000–48,000 lb heavy loads, which no tank could
  make legal: simulated careful careers lost $1,000–2,800 per heavy load to
  the scales and 44 % were repossessed.
- **A wreck does not end a career.** The rig is repaired, less a $500
  deductible, and spends three days in the shop at $85 a day; the load is
  lost and reputation drops by 20. A crash is a per-hour risk even at 55 mph
  on a clear day, so over thirty loads a careful driver would otherwise lose
  a third of their careers to bad luck. A balance below zero still means
  repossession, and a fourth offence still means jail.

**Daily Haul** (new): one contract a day from the UTC date's seed
(`shared/daily`), always on Normal; the first run counts, later ones are
practice; a streak and a calendar; a share line that gives the profit and
time but not the road.

**Postcards and the CB** (new): a postcard for every town and state line
passed (351 in all, each with two modest sentences), and several hundred
authored CB lines from eighteen regulars whose tips are right most of the
time — some more than others. "DUMMY !!" and "washing dishes" made it onto
channel 19.

**Difficulty**: *Normal* is the original's odds. *Easy* makes waypoint events and
blowouts 40 % rarer and halves fines. *Hard* adds weather (systems 25 %
denser, the original draw 10 % wider), patrols 35 % keener with a threshold 2
mph lower, and fines 25 % steeper.

**Units**: miles or kilometres, for display only; the engine works in miles.

**The setting.** The original names no year. The port sets its trips in
March 1982: the 55 mph national limit, the CB craze and the original's diesel
prices (85 ¢ to $1.19 a gallon) all fit. The year drives the calendar, the
sun's path, the career's seasons and the postmark on the postcards; it is a
setting, not a claim about when Trucker was written. The title's highway
shield reads 40, for the I-40 the middle route follows.

**Things not carried over**: the original's chained `RUN "b:…"` and
`RUN "menu"` at the end (it was one program of a menu-driven disk); the
address on the title; the seeding by time of day (the port seeds from a
number, which can be typed into the address as `?seed=`).

## Balance

The engine is fast enough to drive thousands of trips. Three simple drivers
(in `src/sim/drivers.ts`):

- **cautious**: 55 mph and slower in bad weather; sleeps when tired or late
  at night, waits out blizzards and fog; two retreads at the terminal.
- **balanced**: just under the patrols' threshold and at most 8 over the
  limit, slowing for radar traps it can see on the strip; sleeps at night
  when it must.
- **reckless**: over the threshold whatever the weather (until the record
  holds two offences); sleeps only when exhausted.

`npx tsx ports/long-haul/scripts/balance.ts 300` drives 300 seeded Single
Hauls, Los Angeles to New York with 39,000 lb, for every driver, route,
cargo and difficulty. Profits are medians over the trips that arrived; "HR"
is the median delivery hour (80 is due, 95 is late).

#### Easy

| Driver | Route | Cargo | Arrived | Crashed | Jailed | Late | Spoiled | Median profit | Median HR |
|---|---|---|---|---|---|---|---|---|---|
| cautious | north | oranges | 96 % | 4 % | 0 % | 0 % | 0 % | $565 | 100 |
| cautious | north | freight | 97 % | 3 % | 0 % | 97 % | 0 % | $24 | 103 |
| cautious | north | mail | 97 % | 3 % | 0 % | 0 % | 0 % | $122 | 103 |
| cautious | middle | oranges | 97 % | 3 % | 0 % | 0 % | 0 % | $459 | 104 |
| cautious | middle | freight | 96 % | 4 % | 0 % | 96 % | 0 % | $-45 | 118 |
| cautious | middle | mail | 96 % | 4 % | 0 % | 0 % | 0 % | $52 | 118 |
| cautious | south | oranges | 96 % | 4 % | 0 % | 0 % | 0 % | $565 | 118 |
| cautious | south | freight | 97 % | 3 % | 0 % | 97 % | 0 % | $15 | 118 |
| cautious | south | mail | 97 % | 3 % | 0 % | 0 % | 0 % | $113 | 118 |
| balanced | north | oranges | 93 % | 7 % | 0 % | 0 % | 0 % | $773 | 94 |
| balanced | north | freight | 90 % | 10 % | 0 % | 16 % | 0 % | $374 | 94 |
| balanced | north | mail | 90 % | 10 % | 0 % | 0 % | 0 % | $283 | 94 |
| balanced | middle | oranges | 92 % | 8 % | 0 % | 0 % | 0 % | $552 | 94 |
| balanced | middle | freight | 90 % | 10 % | 0 % | 21 % | 0 % | $194 | 94 |
| balanced | middle | mail | 90 % | 10 % | 0 % | 0 % | 0 % | $100 | 94 |
| balanced | south | oranges | 93 % | 7 % | 0 % | 0 % | 0 % | $538 | 98 |
| balanced | south | freight | 91 % | 9 % | 0 % | 90 % | 0 % | $-44 | 98 |
| balanced | south | mail | 91 % | 9 % | 0 % | 0 % | 0 % | $54 | 98 |
| reckless | north | oranges | 30 % | 62 % | 8 % | 0 % | 0 % | $721 | 77 |
| reckless | north | freight | 37 % | 53 % | 10 % | 0 % | 0 % | $292 | 75 |
| reckless | north | mail | 37 % | 53 % | 10 % | 0 % | 0 % | $195 | 75 |
| reckless | middle | oranges | 29 % | 71 % | 0 % | 0 % | 0 % | $448 | 79 |
| reckless | middle | freight | 29 % | 71 % | 0 % | 0 % | 0 % | $15 | 78 |
| reckless | middle | mail | 29 % | 71 % | 0 % | 0 % | 0 % | $-83 | 78 |
| reckless | south | oranges | 38 % | 62 % | 0 % | 0 % | 0 % | $430 | 94 |
| reckless | south | freight | 39 % | 61 % | 0 % | 1 % | 0 % | $-9 | 94 |
| reckless | south | mail | 39 % | 61 % | 0 % | 0 % | 0 % | $-107 | 94 |

#### Normal

| Driver | Route | Cargo | Arrived | Crashed | Jailed | Late | Spoiled | Median profit | Median HR |
|---|---|---|---|---|---|---|---|---|---|
| cautious | north | oranges | 96 % | 4 % | 0 % | 0 % | 0 % | $538 | 101 |
| cautious | north | freight | 97 % | 3 % | 0 % | 97 % | 0 % | $18 | 104 |
| cautious | north | mail | 97 % | 3 % | 0 % | 0 % | 0 % | $116 | 104 |
| cautious | middle | oranges | 97 % | 3 % | 0 % | 0 % | 0 % | $422 | 105 |
| cautious | middle | freight | 96 % | 4 % | 0 % | 96 % | 0 % | $-55 | 118 |
| cautious | middle | mail | 96 % | 4 % | 0 % | 0 % | 0 % | $42 | 118 |
| cautious | south | oranges | 95 % | 5 % | 0 % | 0 % | 0 % | $522 | 118 |
| cautious | south | freight | 97 % | 3 % | 0 % | 97 % | 0 % | $9 | 118 |
| cautious | south | mail | 97 % | 3 % | 0 % | 0 % | 0 % | $106 | 118 |
| balanced | north | oranges | 92 % | 8 % | 0 % | 0 % | 0 % | $755 | 94 |
| balanced | north | freight | 91 % | 9 % | 0 % | 18 % | 0 % | $364 | 94 |
| balanced | north | mail | 91 % | 9 % | 0 % | 0 % | 0 % | $271 | 94 |
| balanced | middle | oranges | 92 % | 8 % | 0 % | 0 % | 0 % | $469 | 95 |
| balanced | middle | freight | 91 % | 9 % | 0 % | 33 % | 0 % | $158 | 94 |
| balanced | middle | mail | 91 % | 9 % | 0 % | 0 % | 0 % | $82 | 94 |
| balanced | south | oranges | 93 % | 7 % | 0 % | 0 % | 0 % | $452 | 100 |
| balanced | south | freight | 91 % | 9 % | 0 % | 91 % | 0 % | $-86 | 98 |
| balanced | south | mail | 91 % | 9 % | 0 % | 0 % | 0 % | $11 | 98 |
| reckless | north | oranges | 25 % | 57 % | 18 % | 0 % | 0 % | $607 | 78 |
| reckless | north | freight | 29 % | 50 % | 20 % | 0 % | 0 % | $176 | 77 |
| reckless | north | mail | 29 % | 50 % | 20 % | 0 % | 0 % | $78 | 77 |
| reckless | middle | oranges | 27 % | 73 % | 0 % | 0 % | 0 % | $281 | 81 |
| reckless | middle | freight | 28 % | 72 % | 0 % | 0 % | 0 % | $-90 | 79 |
| reckless | middle | mail | 28 % | 72 % | 0 % | 0 % | 0 % | $-187 | 79 |
| reckless | south | oranges | 37 % | 63 % | 0 % | 0 % | 0 % | $257 | 94 |
| reckless | south | freight | 37 % | 63 % | 0 % | 2 % | 0 % | $-178 | 94 |
| reckless | south | mail | 37 % | 63 % | 0 % | 0 % | 0 % | $-273 | 94 |

#### Hard

| Driver | Route | Cargo | Arrived | Crashed | Jailed | Late | Spoiled | Median profit | Median HR |
|---|---|---|---|---|---|---|---|---|---|
| cautious | north | oranges | 96 % | 4 % | 0 % | 0 % | 0 % | $480 | 104 |
| cautious | north | freight | 95 % | 5 % | 0 % | 95 % | 0 % | $-24 | 118 |
| cautious | north | mail | 95 % | 5 % | 0 % | 0 % | 0 % | $73 | 118 |
| cautious | middle | oranges | 96 % | 4 % | 0 % | 0 % | 0 % | $321 | 118 |
| cautious | middle | freight | 95 % | 5 % | 0 % | 95 % | 0 % | $-117 | 118 |
| cautious | middle | mail | 95 % | 5 % | 0 % | 0 % | 0 % | $-19 | 118 |
| cautious | south | oranges | 94 % | 6 % | 0 % | 0 % | 0 % | $469 | 118 |
| cautious | south | freight | 97 % | 3 % | 0 % | 97 % | 0 % | $-34 | 118 |
| cautious | south | mail | 97 % | 3 % | 0 % | 0 % | 0 % | $64 | 118 |
| balanced | north | oranges | 85 % | 15 % | 0 % | 0 % | 0 % | $669 | 103 |
| balanced | north | freight | 83 % | 17 % | 0 % | 67 % | 0 % | $177 | 103 |
| balanced | north | mail | 83 % | 17 % | 0 % | 0 % | 0 % | $271 | 103 |
| balanced | middle | oranges | 90 % | 10 % | 0 % | 0 % | 0 % | $421 | 101 |
| balanced | middle | freight | 86 % | 14 % | 0 % | 80 % | 0 % | $29 | 104 |
| balanced | middle | mail | 86 % | 14 % | 0 % | 0 % | 0 % | $127 | 104 |
| balanced | south | oranges | 89 % | 11 % | 0 % | 0 % | 0 % | $429 | 102 |
| balanced | south | freight | 86 % | 14 % | 0 % | 86 % | 0 % | $-30 | 118 |
| balanced | south | mail | 86 % | 14 % | 0 % | 0 % | 0 % | $68 | 118 |
| reckless | north | oranges | 21 % | 67 % | 12 % | 0 % | 0 % | $736 | 78 |
| reckless | north | freight | 23 % | 64 % | 13 % | 0 % | 0 % | $304 | 78 |
| reckless | north | mail | 23 % | 64 % | 13 % | 0 % | 0 % | $206 | 78 |
| reckless | middle | oranges | 15 % | 85 % | 0 % | 0 % | 0 % | $471 | 81 |
| reckless | middle | freight | 22 % | 78 % | 0 % | 0 % | 0 % | $38 | 79 |
| reckless | middle | mail | 22 % | 78 % | 0 % | 0 % | 0 % | $-60 | 79 |
| reckless | south | oranges | 26 % | 74 % | 0 % | 0 % | 0 % | $378 | 94 |
| reckless | south | freight | 34 % | 66 % | 0 % | 1 % | 0 % | $-70 | 94 |
| reckless | south | mail | 34 % | 66 % | 0 % | 0 % | 0 % | $-168 | 94 |

What the numbers say:

- **Careful play is reliably profitable with oranges and mail**: the
  cautious driver arrives 95–98 % of the time and clears $400–550 with
  oranges on Normal. Freight is the hustler's load, as in the original: a driver who
  sleeps every night arrives around HR 104–118, past the Friday 7 AM cutoff,
  and the 10 % penalty eats the margin.
- **Balanced play is the best living**: under the threshold, through the
  radar traps at the limit, it arrives about 91 % of the time with the
  biggest profits, $450–750 with oranges.
- **Reckless play is a thrill and a loss**: two trips in three end in a
  wreck or in jail, and the survivors' profits are no better than careful
  driving's.
- **Normal keeps the original's feel**: the same formulas and odds, with the
  bugs fixed. The fatigue fix is the one that shifts things measurably, and
  it makes the game slightly harder, not easier.

Careers, with `npx tsx ports/long-haul/scripts/career-sim.ts 200`: each
driver takes the best-paying load per mile on the board, drives the shortest
road, keeps the tank light enough for the scales with a heavy load, and
plays for up to 90 days.

#### Easy

| Driver | Still trucking | Licence lost | Repossessed | Median loads | Wrecks per career | Median bank at the end | Median reputation |
|---|---|---|---|---|---|---|---|
| cautious | 97 % | 0 % | 4 % | 29 | 0.80 | $17,710 | 88 |
| balanced | 90 % | 0 % | 10 % | 31 | 1.48 | $13,081 | 85 |
| reckless | 0 % | 78 % | 22 % | 3 | 0.34 | $1,429 | 44 |
#### Normal

| Driver | Still trucking | Licence lost | Repossessed | Median loads | Wrecks per career | Median bank at the end | Median reputation |
|---|---|---|---|---|---|---|---|
| cautious | 96 % | 0 % | 4 % | 30 | 0.84 | $16,343 | 85 |
| balanced | 90 % | 0 % | 11 % | 31 | 1.54 | $12,065 | 80 |
| reckless | 0 % | 84 % | 16 % | 2 | 0.19 | $1,000 | 44 |
#### Hard

| Driver | Still trucking | Licence lost | Repossessed | Median loads | Wrecks per career | Median bank at the end | Median reputation |
|---|---|---|---|---|---|---|---|
| cautious | 95 % | 0 % | 5 % | 30 | 0.91 | $15,427 | 84 |
| balanced | 93 % | 0 % | 8 % | 30 | 1.38 | $12,052 | 78 |
| reckless | 0 % | 82 % | 18 % | 2 | 0.24 | $1,000 | 44 |

The weather mix over thousands of simulated hours
(`scripts/weather-mix.ts`): on the original routes, 81 % of hours are clear,
10 % wet, 4 % rain, 3.5 % light snow, 1 % fog and 1.3 % blizzard. The living
weather was calibrated to land near that: winter 83 / 10 / 2.4 / 3.4 / 0.4 /
0.7 %, summer 85 / 7 / 7 / 0 / 0.6 / 0 %.

The browser playtest (`npx playwright test -c ports/long-haul --project=playtest`)
drives whole Single Hauls through the real page, leg by leg, with a player
that takes the suggested speed (55), reads every card, pulls in whenever
asked, fills the tank and sleeps when the stop suggests it, and checks that
every logbook adds up. Six oranges runs on the northern route (seeds 11, 23,
37, 41, 59 and 67) all arrived and all earned the "Good work!!" stamp, with
profits of $652 to $890, 12–13 truck stops and one to three event cards
each.
