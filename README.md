# Ogonz

A life simulator that plays itself. There is nothing to control: you watch the
residents of **Sunset Trailer Haven** chase get-rich-quick schemes, fall in
love, feud, and get abducted by aliens.

Watch: https://ukashisan.github.io/ogonz/

## What happens

- **The park:** a pixel-art trailer park seen from above, with a BBQ, a
  kiddie-pool hot tub, a porta-potty (often out of order), a shopping-cart race
  track, snail racing, a laundromat run by cats, a trampoline and a catapult.
- **Schemes:** every adult runs one at a stall by their trailer: lemonade at
  $20 a cup, a crypto mine in a bathtub, a pyramid scheme, alien urine, digging
  for oil, selling air, a fish farm, worms, NFT rocks, miracle hair tonic,
  "invest in my robot", a car-hood tanning bed, a cart casino. Neighbours buy
  from each other, hustlers pitch, schemes boom and bust, and scam victims
  eventually realize the alien urine was apple juice.
- **Residents** have needs and two personality traits each (cheerful, grumpy,
  romantic, prankster, dramatic, gossip, hustler, gullible, sleepy, party
  animal, conspiracy theorist; the last wear tinfoil hats).
- **Relationships** run from Nemesis, Enemy and Rival through Stranger,
  Acquaintance, Friend and Best friend to Crush and In love, built from chats,
  arguments, pranks, gossip, sales pitches and flirting.
- **Life goes on:** one year per game day. Couples move in together, have
  babies and break up; kids go to school; newcomers pull in with a trailer and
  big dreams; elders ride off to the big trailer park in the sky.
- **Silly events:** alien abductions, pizza rain, a get-rich-quick seminar that
  takes everyone's money, shopping-cart grand prix, snail derbies, goose
  attacks, raccoon heists, oil gushers, tiny tornadoes, porta-potty explosions,
  bathrobe BBQ parties, cat curses, invisibility, body swaps, love potions.
- The HUD shows the day, park cash, open schemes and the top hustler; a
  spotlight card follows a different resident every 15 seconds; the news
  ticker tells the story.

The only controls are pause and speed (buttons, or keys `space`, `1`, `2`, `3`).

Plays in landscape on any device with a modern browser: TV, computer, tablet,
or a phone held sideways. Install it with the browser's "Add to Home Screen" /
"Install app" for full screen and offline play. The world saves automatically
in the browser.

## Run it on your computer, watch it on the TV

The park can run on your computer and show on any screen on the same Wi-Fi,
including a Fire TV Stick. The computer does the simulating; the TV only
draws it.

1. Install [Node.js](https://nodejs.org) 22 or newer on the computer.
2. Download this repo (Code → Download ZIP, unzip) and in that folder run:
   ```sh
   npm start
   ```
   It prints the park's addresses, e.g. `http://192.168.1.20:8080`. Open
   `http://localhost:8080` on the computer to watch there too. The park keeps
   running while the window is open and is saved to `ogonz-save.json`.
   Allow Node through the firewall if your computer asks (private networks).
3. On the Fire TV, one time only:
   - Settings → My Fire TV → Developer options: turn on **Install unknown
     apps** for Downloader (or **Apps from Unknown Sources**). If Developer
     options is missing, open My Fire TV → About and press OK on the device
     name seven times.
   - Install the **Downloader** app from the Amazon Appstore, open it and
     enter `http://<computer address>:8080/apk` (the address from step 2),
     then choose Install.
4. Open **Ogonz** from Your Apps. It finds the computer by itself; if not,
   type the address. Play/pause and fast-forward/rewind on the remote change
   the speed; the menu button (☰) goes back to the connection screen.

Every screen shows the same park, and the speed buttons on any of them
control it.

The APK is built by GitHub Actions (`.github/workflows/tv.yml`) and published
as the `tv-latest` release; `/apk` on the computer forwards there. The app's
source is in `tv/`.

## Code

| Path | What |
| --- | --- |
| `src/sim.js` | Public API: new world, time steps, save/load. |
| `src/core.js` | Needs, autonomy, walking, trailers, schemes, interactions between residents. |
| `src/life.js` | Daily life: ageing, romance, breakups, babies, moving in and out, scheme booms and busts. |
| `src/fun.js` | The silly events. |
| `src/data.js` | Tunables: park layout, amenities, schemes, traits and chemistry, names. |
| `src/render.js` | Pixel-art drawing at 640x360, scaled up. |
| `src/pixelfont.js` | Tiny 3x5 font for signs. |
| `src/main.js` | Game loop, pause/speed, side panel, saving; viewer mode when served by the server. |
| `server/server.js` | Runs the park on a computer, streams it to screens on the Wi-Fi, answers the TV app's search. |
| `tv/` | Fire TV / Android TV app: a full-screen viewer that finds the computer. |
| `sw.js` | Offline cache. |
| `tests/` | `sim.test.js` (rules, relationships, events, multi-generation runs), `server.test.js` (streaming, speed, discovery, saving), `smoke.mjs` (browser test at landscape phone, tablet, desktop and TV sizes) and `viewer.mjs` (two screens on one server). |
| `maker/` | Separate, paused project: the mobile game maker. |

No build step and no dependencies: serve the folder and open it.

```sh
npm start                     # park on this computer, http://localhost:8080
python3 -m http.server        # or: park in the browser only, http://localhost:8000
npm test                      # rules tests (Node 22+)
npm install --no-save playwright && npx playwright install chromium && npm run smoke
```
