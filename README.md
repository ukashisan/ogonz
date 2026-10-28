# Ogonz

A life simulator that plays itself. There is nothing to control: you watch a
household of Ogonz live their lives in a two-storey house.

Watch: https://ukashisan.github.io/ogonz/

## What happens

- Ogonz have six needs (Hunger, Energy, Bladder, Hygiene, Fun, Social) and
  look after themselves: eating, sleeping, showering, watching TV, reading and
  chatting. Run out and they have accidents or pass out.
- Children go to school, adults go to work on weekdays, elders retire.
- Everyone ages one year per game day. Friends become partners, couples have
  babies, grown children move out, newcomers move in, elders pass away. If the
  house empties, a new family arrives.
- Jobs bring promotions and the odd layoff. Furniture breaks and gets repaired.
  The household buys beds for new arrivals and treats when money allows.
- The side panel lists the household, follows a different Ogon every 15
  seconds, and keeps the news.

The only controls are pause and speed (buttons, or keys `space`, `1`, `2`, `3`).

Plays in landscape on any device with a modern browser: TV, computer, tablet,
or a phone held sideways (held upright, it asks you to turn it). Install it
with the browser's "Add to Home Screen" / "Install app" for full screen and
offline play. The world saves automatically in the browser.

## Code

| Path | What |
| --- | --- |
| `src/sim.js` | Rules and state: needs, autonomy, jobs, daily life events (no DOM; unit tested). |
| `src/data.js` | Tunables: layout, need decay, furniture, jobs, ages, money. |
| `src/render.js` | Canvas drawing. |
| `src/main.js` | Game loop, pause/speed, side panel, saving. |
| `sw.js` | Offline cache. |
| `tests/` | `sim.test.js` (rules, multi-generation runs) and `smoke.mjs` (browser test at landscape phone, tablet, desktop and TV sizes). |
| `maker/` | Separate, paused project: the mobile game maker. |

No build step and no dependencies: serve the folder and open it.

```sh
python3 -m http.server        # then open http://localhost:8000
npm test                      # rules tests (Node 22+)
npm install --no-save playwright && npx playwright install chromium && npm run smoke
```
