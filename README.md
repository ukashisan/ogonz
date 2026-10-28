# Ogonz

A life simulator that plays itself. There is nothing to control: you watch the
residents of the Ogonz apartments live their slightly ridiculous lives.

Watch: https://ukashisan.github.io/ogonz/

## What happens

- **The building:** six apartments on three floors, a café and a party room on
  the ground floor, and an elevator in the middle.
- **Residents** have needs (Hunger, Energy, Bladder, Hygiene, Fun, Social) and
  two personality traits each: cheerful, grumpy, romantic, prankster, dramatic,
  gossip, shy, sleepy, party animal or conspiracy theorist. Traits decide who
  clicks and who clashes.
- **Relationships** run from Nemesis, Enemy and Rival through Stranger,
  Acquaintance, Friend and Best friend to Crush and In love. They grow out of
  chats (good or bad, depending on chemistry), arguments, pranks, gossip about
  third parties, and flirting.
- **Life goes on:** one year per game day. Couples move in together, have
  babies and sometimes break up; kids go to school; grown-ups have silly jobs
  (Cloud Inspector, Sock Detective, Pigeon Translator…); newcomers fill empty
  apartments; elders eventually float off to the great apartment in the sky.
- **Silly events:** alien abductions, pizza rain, a sulking elevator, ghosts,
  gravity switching off, a duck appointed building manager, surprise dance
  parties, residents turning into cats or going invisible, body swaps and
  accidental love potions.
- The side panel follows a different resident every 15 seconds (traits, job,
  needs, strongest feelings), plus building gossip, the resident list and news.

The only controls are pause and speed (buttons, or keys `space`, `1`, `2`, `3`).

Plays in landscape on any device with a modern browser: TV (e.g. Fire TV's Silk
browser), computer, tablet, or a phone held sideways. Install it with the
browser's "Add to Home Screen" / "Install app" for full screen and offline play.
The world saves automatically in the browser.

## Code

| Path | What |
| --- | --- |
| `src/sim.js` | Public API: new world, time steps, save/load. |
| `src/core.js` | Needs, autonomy, elevator and movement, interactions between residents. |
| `src/life.js` | Daily life: ageing, romance, breakups, babies, moving in and out. |
| `src/fun.js` | The silly events. |
| `src/data.js` | Tunables: building layout, furniture, traits and chemistry, names, jobs. |
| `src/render.js` | Canvas drawing. |
| `src/main.js` | Game loop, pause/speed, side panel, saving. |
| `sw.js` | Offline cache. |
| `tests/` | `sim.test.js` (rules, relationships, events, multi-generation runs) and `smoke.mjs` (browser test at landscape phone, tablet, desktop and TV sizes). |
| `maker/` | Separate, paused project: the mobile game maker. |

No build step and no dependencies: serve the folder and open it.

```sh
python3 -m http.server        # then open http://localhost:8000
npm test                      # rules tests (Node 22+)
npm install --no-save playwright && npx playwright install chromium && npm run smoke
```
