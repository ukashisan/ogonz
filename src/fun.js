// Ridiculous things that happen in the park. Each game hour there is a small
// chance one starts. Active events live in s.events as
// { type, start, until, ... } and are drawn by render.js.

import { PARK } from './data.js';
import {
  rand, pick, chance, byId, stage, log, endPlan, isSleeping, statusActive, addRel, related, visible,
  money, clamp, has
} from './core.js';

const awake = s => s.ogonz.filter(o => visible(o) && !isSleeping(s, o) && !(o.plan && (o.plan.work || o.plan.forced)));
const amenity = (s, type) => s.amenities.find(a => a.type === type);

// Sends everyone awake to a spot for a while.
function gather(s, people, type, at, minutes, gains, label) {
  for (const o of people) {
    endPlan(s, o);
    o.plan = { label, event: true, long: true, steps: [
      { type: 'goto', x: at.x + (rand(s) - 0.5) * 70, y: at.y + 14 + rand(s) * 24 },
      { type: 'gather', event: type, gains, left: minutes }] };
  }
}

// Each starter returns false when it can't happen right now.
export const EVENTS = {
  ufo(s) {
    const o = pick(s, awake(s));
    if (!o) return false;
    endPlan(s, o);
    s.events.push({ type: 'ufo', start: s.minutes, until: s.minutes + 25, x: o.x, y: o.y });
    o.out = { reason: 'space', until: s.minutes + 180 + rand(s) * 120 };
    log(s, o.name + ' was abducted by aliens! The tinfoil hats were right.');
    return true;
  },

  pizza(s) {
    s.events.push({ type: 'pizza', start: s.minutes, until: s.minutes + 40 });
    for (const o of s.ogonz) if (!o.out) o.needs.hunger = 100;
    log(s, 'It rained pizza. Everyone is full. Nobody asks questions.');
    return true;
  },

  seminar(s) {
    const people = awake(s).filter(o => stage(o) !== 'child');
    if (people.length < 3 || s.events.some(e => e.type === 'seminar')) return false;
    const host = people.find(o => has(o, 'hustler')) || null;
    const crowd = people.filter(o => o !== host);
    s.events.push({ type: 'seminar', start: s.minutes, until: s.minutes + 90, host: host && host.id });
    s.seminarTake = 0;
    gather(s, crowd, 'seminar', amenity(s, 'podium'), 80, { fun: 0.4, social: 0.6 }, 'At the get-rich-quick seminar');
    if (host) {
      endPlan(s, host);
      const p = amenity(s, 'podium');
      host.plan = { label: 'Hosting a seminar', event: true, long: true,
        steps: [{ type: 'goto', x: p.x, y: p.y + 2 }, { type: 'gather', event: 'seminar', gains: { fun: 1 }, left: 85 }] };
    }
    log(s, (host ? host.name : 'A man named Chad') + ' is hosting a GET RICH QUICK seminar. Free hotdog!');
    return true;
  },

  race(s) {
    const people = awake(s);
    if (people.length < 3 || s.events.some(e => e.type === 'race')) return false;
    const racers = people.slice(0, 4);
    s.events.push({ type: 'race', start: s.minutes, until: s.minutes + 45, racers: racers.map(o => o.id) });
    gather(s, people.filter(o => !racers.includes(o)), 'race', amenity(s, 'track'), 40, { fun: 1.2, social: 0.6 }, 'Watching the cart race');
    for (const o of racers) {
      endPlan(s, o);
      const t = amenity(s, 'track');
      o.plan = { label: 'Racing a shopping cart', event: true, long: true,
        steps: [{ type: 'goto', x: t.x, y: t.y + 30 }, { type: 'gather', event: 'race', gains: { fun: 2 }, left: 40 }] };
    }
    log(s, 'Shopping cart grand prix! ' + racers.map(o => o.name).join(', ') + ' are racing. Bets are $5.');
    return true;
  },

  snails(s) {
    if (s.events.some(e => e.type === 'derby')) return false;
    const people = awake(s);
    if (people.length < 2) return false;
    s.events.push({ type: 'derby', start: s.minutes, until: s.minutes + 60 });
    gather(s, people.slice(0, 6), 'derby', amenity(s, 'snails'), 50, { fun: 1.4, social: 0.5 }, 'At the snail derby');
    log(s, 'Snail derby! The favorite is a snail named ' + pick(s, ['Lightning', 'Turbo', 'Gary', 'Sir Slime', 'Big Doug']) + '.');
    return true;
  },

  bbq(s) {
    const people = awake(s);
    if (people.length < 3 || s.events.some(e => e.type === 'bbqparty')) return false;
    const host = pick(s, people);
    s.events.push({ type: 'bbqparty', start: s.minutes, until: s.minutes + 120 });
    gather(s, people, 'bbqparty', amenity(s, 'bbq'), 100, { hunger: 1.2, fun: 1, social: 1 }, 'At the bathrobe BBQ');
    log(s, host.name + ' fired up the grill. Bathrobe BBQ party!');
    return true;
  },

  goose(s) {
    const o = pick(s, awake(s));
    if (!o || s.events.some(e => e.type === 'goose')) return false;
    endPlan(s, o);
    o.status.chased = s.minutes + 30;
    const tx = o.x < 320 ? PARK.right - 60 : PARK.left + 60;
    o.plan = { label: 'Running from a goose', forced: true, steps: [{ type: 'goto', x: tx, y: PARK.top + 60 + rand(s) * 200 }] };
    o.needs.fun = clamp(o.needs.fun - 20);
    s.events.push({ type: 'goose', start: s.minutes, until: s.minutes + 30, who: o.id });
    log(s, 'A goose is chasing ' + o.name + '. Nobody is helping.');
    return true;
  },

  raccoons(s) {
    const rich = s.ogonz.filter(o => o.cash > 30);
    const o = pick(s, rich);
    if (!o) return false;
    const loot = Math.round(Math.min(o.cash, 20 + rand(s) * 120));
    o.cash -= loot;
    s.events.push({ type: 'raccoons', start: s.minutes, until: s.minutes + 60, trailer: o.home });
    log(s, 'Raccoons broke into ' + o.name + "'s trailer and stole " + money(loot) + '. And a waffle.');
    return true;
  },

  gusher(s) {
    const well = s.stalls.find(st => st.type === 'oil');
    const owner = well && byId(s.ogonz, well.ownerId);
    if (!owner) return false;
    const gain = Math.round(500 + rand(s) * 1500);
    owner.cash += gain;
    well.hype = 3;
    s.events.push({ type: 'gusher', start: s.minutes, until: s.minutes + 40, x: well.x, y: well.y });
    log(s, 'OIL! ' + owner.name + "'s yard is gushing. +" + money(gain) + '. It might be maple syrup.');
    return true;
  },

  tornado(s) {
    const t = pick(s, s.trailers);
    t.nudge = (t.nudge || 0) + (rand(s) < 0.5 ? -3 : 3);
    s.events.push({ type: 'tornado', start: s.minutes, until: s.minutes + 20, x: PARK.left, y: t.y - 10 });
    log(s, 'A very small tornado moved a trailer three inches. It was the most exciting thing all week.');
    return true;
  },

  potty(s) {
    const p = amenity(s, 'potty');
    if ((p.brokenUntil || 0) > s.minutes) return false;
    p.brokenUntil = s.minutes + 720;
    for (const o of s.ogonz) if (p.users.includes(o.id)) endPlan(s, o);
    s.events.push({ type: 'pottyboom', start: s.minutes, until: s.minutes + 30, x: p.x, y: p.y });
    log(s, 'The porta-potty exploded. It is now OUT OF ORDER. Again.');
    return true;
  },

  cat(s) {
    const o = pick(s, s.ogonz.filter(x => !x.out && !statusActive(s, x, 'cat')));
    if (!o) return false;
    o.status.cat = s.minutes + 360;
    s.events.push({ type: 'cat', start: s.minutes, until: o.status.cat, who: o.id });
    log(s, o.name + ' turned into a cat. The laundry cats have accepted them.');
    return true;
  },

  invisible(s) {
    const o = pick(s, s.ogonz.filter(x => !x.out && !statusActive(s, x, 'invisible')));
    if (!o) return false;
    o.status.invisible = s.minutes + 240;
    s.events.push({ type: 'invisible', start: s.minutes, until: o.status.invisible, who: o.id });
    log(s, o.name + ' went invisible and immediately raided the BBQ');
    return true;
  },

  potion(s) {
    const adults = s.ogonz.filter(o => !o.out && stage(o) !== 'child');
    const pairs = [];
    for (const a of adults) for (const b of adults) if (a.id < b.id && !related(a, b)) pairs.push([a, b]);
    const pair = pick(s, pairs);
    if (!pair) return false;
    const [a, b] = pair;
    addRel(a, b, 50);
    addRel(b, a, 50);
    log(s, a.name + ' and ' + b.name + ' drank the "miracle hair tonic". It was a love potion.');
    return true;
  },

  swap(s) {
    if (s.events.some(e => e.type === 'swap')) return false;
    const people = s.ogonz.filter(o => !o.out);
    if (people.length < 2) return false;
    const a = pick(s, people);
    const b = pick(s, people.filter(x => x !== a));
    swapLooks(a, b);
    s.events.push({ type: 'swap', start: s.minutes, until: s.minutes + 360, a: a.id, b: b.id });
    log(s, a.name + ' and ' + b.name + ' swapped bodies after a hot tub incident');
    return true;
  }
};

const LOOKS = ['shirt', 'skin', 'hair', 'hat', 'outfit'];
function swapLooks(a, b) {
  for (const k of LOOKS) [a[k], b[k]] = [b[k], a[k]];
}

// Called once per game hour.
export function maybeStartEvent(s) {
  const active = s.events.filter(e => e.until > s.minutes && e.type !== 'flight').length;
  if (active >= 2 || !s.ogonz.length || !chance(s, s.eventRate ?? 0.06)) return;
  const types = Object.keys(EVENTS);
  for (let tries = 0; tries < 4; tries++) {
    if (EVENTS[pick(s, types)](s)) return;
  }
}

// Ends expired events.
export function updateEvents(s) {
  for (const e of s.events) {
    if (e.until > s.minutes || e.ended) continue;
    e.ended = true;
    if (e.type === 'swap') {
      const a = byId(s.ogonz, e.a), b = byId(s.ogonz, e.b);
      if (a && b) {
        swapLooks(a, b);
        log(s, a.name + ' and ' + b.name + ' swapped back. Mostly.');
      }
    }
    if (e.type === 'seminar' && s.seminarTake > 1) {
      const host = byId(s.ogonz, e.host);
      if (host) host.cash += s.seminarTake;
      log(s, 'The seminar made ' + money(s.seminarTake) + ' for ' + (host ? host.name : 'Chad') + '. Attendees got one hotdog.');
      s.seminarTake = 0;
    }
    if (e.type === 'race') {
      const racers = e.racers.map(id => byId(s.ogonz, id)).filter(Boolean);
      const winner = pick(s, racers);
      if (winner) {
        winner.cash += 40;
        log(s, winner.name + ' won the cart race and $40. ' + pick(s, ['One wheel fell off.', 'A raccoon finished second.', 'Protests were filed.']));
      }
    }
    if (e.type === 'cat') {
      const o = byId(s.ogonz, e.who);
      if (o) log(s, o.name + ' is no longer a cat, but still sleeps in the laundry basket');
    }
    if (e.type === 'goose') {
      const o = byId(s.ogonz, e.who);
      if (o) o.status.chased = 0;
    }
  }
  s.events = s.events.filter(e => !e.ended);
}

