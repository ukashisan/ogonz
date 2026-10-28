// Ogonz simulation: public API. The rules live in core.js (needs, autonomy,
// interactions), life.js (daily life events) and fun.js (silly events).

import { ROOMS, APARTMENT_LAYOUT, COMMON_LAYOUT } from './data.js';
import { tickResident, clock, log } from './core.js';
import { dailyLife, moveIn, addResident } from './life.js';
import { maybeStartEvent, updateEvents } from './fun.js';

export {
  clock, mood, stage, byId, room, isSleeping, activityLabel, relLabel, pairRel, getRel,
  compat, statusActive, eventActive
} from './core.js';
export { residentsOf } from './life.js';
export { EVENTS } from './fun.js';

export const SAVE_VERSION = 3;
const SUBSTEP = 0.25;

export function newGame(seed = Date.now()) {
  const s = {
    version: SAVE_VERSION, rng: seed | 0, minutes: 7 * 60, nextId: 1,
    objects: [], ogonz: [], events: [], log: [], pairs: {}, lastDay: 0, lastHour: 7
  };
  for (const r of ROOMS) {
    const layout = r.common ? COMMON_LAYOUT[r.id] : APARTMENT_LAYOUT;
    for (const [type, dx] of layout) {
      s.objects.push({ id: s.nextId++, type, room: r.id, floor: r.floor, x: r.l + dx, user: null });
    }
  }
  // Four households to start; two apartments stay empty for newcomers.
  moveIn(s, '1A');
  moveIn(s, '2B');
  moveIn(s, '3A');
  const parents = moveIn(s, '3B');
  const kid = addResident(s, { age: 8, homeId: '3B', parents: parents.map(x => x.id) });
  for (const x of parents) x.rel[kid.id] = 60;
  log(s, 'Welcome to the Ogonz apartments');
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
  if (!s || s.version !== SAVE_VERSION || !Array.isArray(s.ogonz) || !Array.isArray(s.objects)) {
    throw new Error('Unsupported save');
  }
  return s;
}
