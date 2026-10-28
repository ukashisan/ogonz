// Ridiculous things that happen in the building. Each game hour there is a
// small chance one starts. Active events live in s.events as
// { type, start, until, ... } and are drawn by render.js.

import { ROOMS, APARTMENTS } from './data.js';
import {
  rand, pick, chance, byId, room, stage, log, endPlan, isSleeping, statusActive, addRel, related, home
} from './core.js';
import { residentsOf } from './life.js';

const awakeAtHome = s => s.ogonz.filter(o => home(o) && !isSleeping(s, o) && !(o.plan && o.plan.work));

// Each starter returns false when it can't happen right now.
export const EVENTS = {
  ufo(s) {
    const o = pick(s, awakeAtHome(s));
    if (!o) return false;
    endPlan(s, o);
    s.events.push({ type: 'ufo', start: s.minutes, until: s.minutes + 25, x: o.x, floor: o.floor });
    o.out = { reason: 'space', until: s.minutes + 180 + rand(s) * 120 };
    o.ride = null;
    log(s, o.name + ' was abducted by aliens!');
    return true;
  },

  pizza(s) {
    s.events.push({ type: 'pizza', start: s.minutes, until: s.minutes + 40 });
    for (const o of s.ogonz) if (home(o)) o.needs.hunger = 100;
    log(s, 'It rained pizza. Everyone is full.');
    return true;
  },

  elevator(s) {
    if (s.events.some(e => e.type === 'elevator')) return false;
    s.events.push({ type: 'elevator', start: s.minutes, until: s.minutes + 360 });
    log(s, 'The elevator is sulking and refuses to hurry');
    return true;
  },

  ghost(s) {
    const apts = APARTMENTS.filter(a => residentsOf(s, a).length);
    if (!apts.length) return false;
    const apt = pick(s, apts);
    s.events.push({ type: 'ghost', start: s.minutes, until: s.minutes + 300, room: apt });
    log(s, 'A ghost is haunting ' + room(apt).name + '. It keeps rearranging the spoons.');
    return true;
  },

  gravity(s) {
    s.events.push({ type: 'gravity', start: s.minutes, until: s.minutes + 60 });
    log(s, 'Gravity switched off for an hour. Everyone is floating.');
    return true;
  },

  duck(s) {
    if (s.events.some(e => e.type === 'duck')) return false;
    s.events.push({ type: 'duck', start: s.minutes, until: s.minutes + 1440 });
    log(s, 'A duck has been appointed building manager. Nobody knows by whom.');
    return true;
  },

  dance(s) {
    const people = awakeAtHome(s).filter(o => !(o.plan && o.plan.forced));
    if (people.length < 2) return false;
    const host = people.find(o => o.traits.includes('party')) || pick(s, people);
    const party = ROOMS.find(r => r.id === 'party');
    s.events.push({ type: 'dance', start: s.minutes, until: s.minutes + 120 });
    for (const o of people) {
      endPlan(s, o);
      o.plan = { label: 'Dancing', long: true, steps: [
        { type: 'goto', floor: party.floor, x: party.l + 150 + rand(s) * (party.r - party.l - 200) },
        { type: 'dance', left: 90 }] };
    }
    log(s, host.name + ' started a surprise dance party!');
    return true;
  },

  cat(s) {
    const o = pick(s, s.ogonz.filter(x => home(x) && !statusActive(s, x, 'cat')));
    if (!o) return false;
    o.status.cat = s.minutes + 360;
    s.events.push({ type: 'cat', start: s.minutes, until: o.status.cat, who: o.id });
    log(s, o.name + ' turned into a cat. Nobody is sure why.');
    return true;
  },

  invisible(s) {
    const o = pick(s, s.ogonz.filter(x => home(x) && !statusActive(s, x, 'invisible')));
    if (!o) return false;
    o.status.invisible = s.minutes + 240;
    s.events.push({ type: 'invisible', start: s.minutes, until: o.status.invisible, who: o.id });
    log(s, o.name + ' went invisible and is enjoying it far too much');
    return true;
  },

  potion(s) {
    const adults = s.ogonz.filter(o => home(o) && stage(o) !== 'child');
    const pairs = [];
    for (const a of adults) for (const b of adults) if (a.id < b.id && !related(a, b)) pairs.push([a, b]);
    const pair = pick(s, pairs);
    if (!pair) return false;
    const [a, b] = pair;
    addRel(a, b, 50);
    addRel(b, a, 50);
    log(s, a.name + ' and ' + b.name + ' drank a love potion by mistake');
    return true;
  },

  swap(s) {
    if (s.events.some(e => e.type === 'swap')) return false;
    const people = s.ogonz.filter(home);
    if (people.length < 2) return false;
    const a = pick(s, people);
    const b = pick(s, people.filter(x => x !== a));
    swapLooks(a, b);
    s.events.push({ type: 'swap', start: s.minutes, until: s.minutes + 360, a: a.id, b: b.id });
    log(s, a.name + ' and ' + b.name + ' swapped bodies! Chaos.');
    return true;
  }
};

function swapLooks(a, b) {
  for (const k of ['color', 'skin', 'hat']) [a[k], b[k]] = [b[k], a[k]];
}

// Called once per game hour.
export function maybeStartEvent(s) {
  const active = s.events.filter(e => e.until > s.minutes).length;
  if (active >= 2 || !s.ogonz.length || !chance(s, s.eventRate ?? 0.05)) return;
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
    if (e.type === 'cat') {
      const o = byId(s.ogonz, e.who);
      if (o) log(s, o.name + ' is no longer a cat, but still knocks things off tables');
    }
    if (e.type === 'duck') log(s, 'The duck resigned as building manager');
  }
  s.events = s.events.filter(e => !e.ended);
}
