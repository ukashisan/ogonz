// Ogonz simulation: public API. The rules live in core.js (needs, autonomy,
// schemes, interactions), life.js (daily life) and fun.js (silly events).

import { TRAILER_SPOTS, TRAILER_COLORS, AMENITIES } from './data.js';
import { tickResident, clock, log } from './core.js';
import { dailyLife, moveIn, addResident } from './life.js';
import { maybeStartEvent, updateEvents } from './fun.js';

export {
  clock, mood, stage, byId, isSleeping, isTending, activityLabel, relLabel, pairRel, getRel, compat,
  statusActive, eventActive, schemeOpen, stallOf, trailerOf, doorOf, money, visible
} from './core.js';
export { residentsOf, emptyTrailers } from './life.js';
export { EVENTS } from './fun.js';

export const SAVE_VERSION = 4;
const SUBSTEP = 0.25;

export function newGame(seed = Date.now()) {
  const s = {
    version: SAVE_VERSION, rng: seed | 0, minutes: 7 * 60, nextId: 1,
    trailers: [], amenities: [], stalls: [], ogonz: [], events: [], log: [], pairs: {},
    lastDay: 0, lastHour: 7
  };
  TRAILER_SPOTS.forEach((p, i) => {
    s.trailers.push({ id: s.nextId++, x: p.x, y: p.y, color: TRAILER_COLORS[i % TRAILER_COLORS.length],
      rust: (i * 7919) % 5, dish: i % 3 === 0, ac: i % 2 === 0 });
  });
  for (const a of AMENITIES) s.amenities.push({ id: s.nextId++, ...a, users: [] });

  // Seven households to start; the rest of the trailers wait for newcomers.
  const homes = s.trailers;
  for (const i of [0, 2, 3, 6, 9, 10]) moveIn(s, homes[i].id);
  const parents = moveIn(s, homes[7].id);
  const kid = addResident(s, { age: 9, homeId: homes[7].id, parents: parents.map(x => x.id) });
  for (const x of parents) x.rel[kid.id] = 60;
  s.log = [];
  log(s, 'Welcome to Sunset Trailer Haven, where everyone is one scheme away from riches');
  return s;
}

export function step(s, minutes) {
  let left = minutes;
  while (left > 1e-9) {
    const dt = Math.min(SUBSTEP, left);
    left -= dt;
    s.minutes += dt;
    const c = clock(s);
    while (s.lastDay < c.day) { s.lastDay++; dailyLife(s); }
    const hour = c.day * 24 + c.hour;
    if (hour !== s.lastHour) { s.lastHour = hour; maybeStartEvent(s); }
    updateEvents(s);
    for (const o of [...s.ogonz]) tickResident(s, o, dt);
  }
}

export function serialize(s) {
  return JSON.stringify(s);
}

export function deserialize(json) {
  const s = JSON.parse(json);
  if (!s || s.version !== SAVE_VERSION || !Array.isArray(s.ogonz) || !Array.isArray(s.trailers)) {
    throw new Error('Unsupported save');
  }
  return s;
}
