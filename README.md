# Ogonz

A life sim in the browser. Look after a household of Ogonz: they have needs,
jobs and friendships, and live in a two-storey house you furnish.

Play: https://ukashisan.github.io/ogonz/

Runs on any device with a modern browser (phone, tablet, desktop). Install it
from the browser's "Add to Home Screen" / "Install app" for a full-screen app
that works offline. The game saves automatically in the browser.

## How to play

- **Tap an Ogon** (in the house or the Household list) to select it.
- **Tap furniture** to tell the selected Ogon to use it. Orders queue up;
  **Cancel** clears them. Left alone, Ogonz look after themselves.
- **Chat** (under Relationships) sends the selected Ogon to talk to another.
- **Buy** opens the catalog: pick an item, then tap a free spot. In buy mode,
  tap existing furniture to sell it for half price.
- Ogonz go to work on weekdays and bring home their pay.
- Speed buttons (or keys `space`, `1`, `2`, `3`) pause and fast-forward.

Needs: Hunger, Energy, Bladder, Hygiene, Fun, Social. The diamond over each
Ogon shows its mood. If needs run out, Ogonz have accidents or pass out.

## Code

| Path | What |
| --- | --- |
| `src/sim.js` | Game rules and state (no DOM; unit tested). |
| `src/data.js` | Tunables: layout, need decay, furniture, jobs. |
| `src/render.js` | Canvas drawing. |
| `src/main.js` | Game loop, input, side panel, saving. |
| `sw.js` | Offline cache. |
| `tests/` | `sim.test.js` (rules) and `smoke.mjs` (browser test on phone, tablet and desktop sizes). |
| `maker/` | Separate, paused project: the mobile game maker. |

No build step and no dependencies: serve the folder and open it.

```sh
python3 -m http.server        # then open http://localhost:8000
npm test                      # rules tests (Node 22+)
npm install --no-save playwright && npx playwright install chromium && npm run smoke
```
