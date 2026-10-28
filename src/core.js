// Core simulation shared by the life and fun modules: randomness, time,
// residents' needs, autonomy, movement through the building, and how
// residents interact with each other. No DOM, no player input.

import {
  ROOMS, ELEVATOR, EXIT_X, WALK, RIDE_MINUTES, CHAT_MINUTES, NEEDS, DECAY, CATALOG,
  CHEMISTRY, SCHOOL, ADULT_AGE, ELDER_AGE
} from './data.js';

const CHAT_RANGE = 48;

// ---------- random (seeded, stored in state so runs are reproducible) ----------

export function rand(s) {
  s.rng = (s.rng + 0x6D2B79F5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const pick = (s, list) => list[Math.floor(rand(s) * list.length)];
export const chance = (s, p) => rand(s) < p;
export const clamp = v => Math.max(0, Math.min(100, v));

// ---------- lookups ----------

export const byId = (list, id) => list.find(x => x.id === id);
export const room = id => ROOMS.find(r => r.id === id);
export const has = (o, trait) => o.traits.includes(trait);

export function clock(s) {
  const day = Math.floor(s.minutes / 1440);
  const inDay = s.minutes - day * 1440;
  return { day, weekday: day % 7, hour: Math.floor(inDay / 60), minute: Math.floor(inDay % 60), hourF: inDay / 60 };
}

export function stage(o) {
  if (o.age < ADULT_AGE) return 'child';
  if (o.age < ELDER_AGE) return 'adult';
  return 'elder';
}

export function mood(o) {
  let sum = 0, penalty = 0;
  for (const n of NEEDS) {
    sum += o.needs[n];
    if (o.needs[n] < 15) penalty += 10;
  }
  return clamp(sum / NEEDS.length - penalty);
}

export function log(s, text) {
  s.log.push({ t: s.minutes, text });
  if (s.log.length > 60) s.log.shift();
}

export const eventActive = (s, type) => s.events.some(e => e.type === type && e.until > s.minutes);
export const statusActive = (s, o, key) => (o.status[key] || 0) > s.minutes;
export const home = o => !o.out;     // inside the building

// ---------- relationships ----------

export const getRel = (a, b) => a.rel[b.id] || 0;
export function addRel(a, b, d) {
  a.rel[b.id] = Math.max(-100, Math.min(100, getRel(a, b) + d));
}
// Average of both directions.
export const pairRel = (a, b) => (getRel(a, b) + getRel(b, a)) / 2;

export function related(a, b) {
  return a.parents.includes(b.id) || b.parents.includes(a.id) || a.parents.some(p => b.parents.includes(p));
}

// How well two residents get along by nature (-1..1): their traits' chemistry
// plus a little personal spark that is stable for the pair.
export function compat(a, b) {
  let sum = 0, n = 0;
  for (const x of a.traits) {
    for (const y of b.traits) {
      sum += CHEMISTRY[x + '+' + y] ?? CHEMISTRY[y + '+' + x] ?? 0;
      n++;
    }
  }
  const lo = Math.min(a.id, b.id), hi = Math.max(a.id, b.id);
  const spark = (((lo * 2654435761) ^ (hi * 40503)) >>> 0) % 1000 / 1000 - 0.5;   // -0.5..0.5
  return Math.max(-1, Math.min(1, sum / Math.max(1, n) + spark * 0.6));
}

export function relLabel(s, a, b) {
  if (a.partnerId === b.id) return 'In love';
  if (a.parents.includes(b.id)) return 'Parent';
  if (b.parents.includes(a.id)) return 'Child';
  const v = pairRel(a, b);
  if (v <= -70) return 'Nemesis';
  if (v <= -40) return 'Enemy';
  if (v <= -15) return 'Rival';
  if (v < 10) return 'Stranger';
  if (v < 30) return 'Acquaintance';
  if (v < 60) return 'Friend';
  if (v >= 70 && canRomance(a, b)) return 'Crush';
  return 'Best friend';
}

export function canRomance(a, b) {
  return stage(a) !== 'child' && stage(b) !== 'child' && !related(a, b) &&
    (a.partnerId === b.id || (!a.partnerId && !b.partnerId));
}

// ---------- availability ----------

export function isSleeping(s, o) {
  const step = o.plan && o.plan.steps[0];
  if (!step) return false;
  if (step.type === 'passout') return true;
  if (step.type !== 'use') return false;
  const obj = byId(s.objects, step.objectId);
  return !!(obj && obj.user === o.id && CATALOG[obj.type].sleep);
}

function available(s, o) {
  return home(o) && !isSleeping(s, o) && !(o.plan && (o.plan.work || o.plan.forced));
}

export function activityLabel(s, o) {
  let label;
  if (o.out) label = { work: 'At work', school: 'At school', space: 'In outer space' }[o.out.reason] || 'Out';
  else label = o.plan ? o.plan.label : 'Idle';
  if (statusActive(s, o, 'cat')) label += ' (as a cat)';
  return label;
}

// Objects a resident may use: their own apartment's and the common rooms'.
function usable(o, obj) {
  const cat = CATALOG[obj.type];
  if (!cat.verb) return false;
  if (cat.kids && o.age >= 12) return false;
  const r = room(obj.room);
  return r.common || obj.room === o.home;
}

// ---------- plans ----------

export function endPlan(s, o) {
  for (const obj of s.objects) if (obj.user === o.id) obj.user = null;
  o.plan = null;
}

function usePlan(obj) {
  const cat = CATALOG[obj.type];
  return {
    label: cat.verb, long: !!cat.sleep,
    steps: [{ type: 'goto', floor: obj.floor, x: obj.x }, { type: 'use', objectId: obj.id, left: cat.minutes }]
  };
}

function travel(o, floor, x) {
  if (o.floor === floor) return Math.abs(o.x - x);
  return Math.abs(o.x - ELEVATOR.x) + Math.abs(ELEVATOR.x - x) + Math.abs(floor - o.floor) * RIDE_MINUTES * WALK;
}

// Value of gaining `amount` of a need: worth more the lower the need is.
function needValue(o, need, amount) {
  const deficit = 100 - o.needs[need];
  return Math.min(amount, deficit) * Math.pow(deficit / 100, 2);
}

function choosePlan(s, o) {
  const hour = clock(s).hourF;
  const night = hour >= 21 || hour < 5;
  let best = null, bestScore = 4;

  for (const obj of s.objects) {
    const cat = CATALOG[obj.type];
    if (!usable(o, obj) || (obj.user && obj.user !== o.id)) continue;
    let score = 0;
    for (const need in cat.gains) score += needValue(o, need, cat.gains[need] * cat.minutes);
    if (cat.sleep) score *= (night && o.needs.energy < 85 ? 3 : 0.7) * (has(o, 'sleepy') ? 1.6 : 1);
    if (cat.gains.fun && has(o, 'party')) score *= 1.4;
    score = score / (1 + travel(o, obj.floor, obj.x) / 400) + rand(s) * 0.5;
    if (score > bestScore) { bestScore = score; best = usePlan(obj); }
  }

  for (const t of s.ogonz) {
    if (t === o || !available(s, t)) continue;
    const r = getRel(o, t);
    let f = 1;
    if (r < -30) f = has(o, 'grumpy') || has(o, 'dramatic') ? 0.9 : 0.15;   // drama seekers go looking for trouble
    if (o.partnerId === t.id) f *= 1.6;
    if (has(o, 'shy')) f *= 0.6;
    if (has(o, 'prankster') || has(o, 'gossip')) f *= 1.25;
    const score = needValue(o, 'social', 50) * f / (1 + travel(o, t.floor, t.x) / 900) + rand(s) * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = { label: 'Looking for ' + t.name, long: true, steps: [{ type: 'approach', targetId: t.id }] };
    }
  }
  if (best) return best;

  // Nothing pressing: potter about at home, or hang out downstairs.
  const r = chance(s, 0.3) || !o.home ? pick(s, ROOMS.filter(x => x.common)) : room(o.home);
  return {
    label: r.common ? 'Hanging out in the ' + r.name.toLowerCase() : 'Pottering about',
    long: true,
    steps: [{ type: 'goto', floor: r.floor, x: r.l + 20 + rand(s) * (r.r - r.l - 40) }, { type: 'wait', left: 10 + rand(s) * 25 }]
  };
}

// ---------- movement ----------

function rideMinutes(s, floors) {
  return Math.abs(floors) * RIDE_MINUTES * (eventActive(s, 'elevator') ? 6 : 1);
}

// Moves toward (floor, x), using the elevator between floors. True on arrival.
function move(s, o, floor, x, dt) {
  if (o.ride) {
    o.ride.t += dt / o.ride.minutes;
    if (o.ride.t >= 1) { o.floor = o.ride.to; o.ride = null; }
    return false;
  }
  const budget = WALK * dt * (stage(o) === 'elder' ? 0.7 : 1);
  const tx = o.floor === floor ? x : ELEVATOR.x;
  const dx = tx - o.x;
  if (Math.abs(dx) > budget) {
    o.x += Math.sign(dx) * budget;
    o.facing = Math.sign(dx);
    return false;
  }
  o.x = tx;
  if (o.floor !== floor) {
    o.ride = { from: o.floor, to: floor, t: 0, minutes: rideMinutes(s, floor - o.floor) };
    return false;
  }
  return true;
}

// ---------- per-resident tick ----------

export function tickResident(s, o, dt) {
  const mode = o.out ? 'out' : isSleeping(s, o) ? 'sleep' : 'awake';
  for (const n of NEEDS) o.needs[n] = clamp(o.needs[n] - DECAY[mode][n] * dt);

  checkOut(s, o);
  if (o.out) return;

  // Fun-event effects on residents at home.
  if (eventActive(s, 'gravity')) o.needs.fun = clamp(o.needs.fun + 0.3 * dt);
  const ghost = s.events.find(e => e.type === 'ghost' && e.until > s.minutes);
  if (ghost && o.floor === room(ghost.room).floor && inRoom(o, ghost.room)) o.needs.fun = clamp(o.needs.fun - 0.3 * dt);

  if (o.needs.bladder <= 0) {
    o.needs.bladder = 100;
    o.needs.hygiene = 0;
    o.needs.fun = clamp(o.needs.fun - 25);
    log(s, o.name + ' had an accident!');
  }
  if (o.needs.energy <= 0 && !isSleeping(s, o) && !(o.plan && o.plan.work)) {
    endPlan(s, o);
    o.ride = null;
    o.plan = { label: 'Passed out', forced: true, steps: [{ type: 'passout', left: 120 }] };
    log(s, o.name + ' fell asleep on the floor');
  }

  if (o.plan && urgentElsewhere(s, o)) endPlan(s, o);
  if (!o.plan) o.plan = choosePlan(s, o);
  runStep(s, o, dt);
}

export function inRoom(o, roomId) {
  const r = room(roomId);
  return o.floor === r.floor && o.x >= r.l && o.x <= r.r;
}

// True when the resident is in a long activity (sleep, chat, wander, dance), a
// need is critical, and a free object could fix it. Short activities always
// finish, so plans can't thrash.
function urgentElsewhere(s, o) {
  const plan = o.plan;
  if (!plan.long) return false;
  const served = new Set();
  for (const st of plan.steps) {
    const obj = st.objectId && byId(s.objects, st.objectId);
    if (obj) Object.keys(CATALOG[obj.type].gains || {}).forEach(n => served.add(n));
    if (st.type === 'approach' || st.type === 'interact' || st.type === 'dance') served.add('social');
  }
  const needs = isSleeping(s, o) ? ['hunger', 'bladder'] : NEEDS;   // only worth waking up for these
  return needs.some(n => o.needs[n] < 12 && !served.has(n) &&
    s.objects.some(obj => !obj.user && usable(o, obj) && n in (CATALOG[obj.type].gains || {})));
}

// Leaving for work/school, and coming back from wherever they went.
function checkOut(s, o) {
  const c = clock(s);
  if (o.out) {
    if (s.minutes >= o.out.until) {
      if (o.out.reason === 'space') {
        o.needs.fun = 100;
        log(s, o.name + ' was returned by the aliens, glowing slightly');
        if (!has(o, 'conspiracy') && chance(s, 0.5)) {
          o.traits[1] = 'conspiracy';
          log(s, o.name + ' now has some theories');
        }
      }
      o.out = null;
      o.floor = 0;
      o.x = EXIT_X;
    }
    return;
  }
  if (!o.job || c.weekday >= 5) return;
  const due = o.workedDay !== c.day && c.hourF >= o.job.start - 1 && c.hourF < o.job.end - 1;
  if (due && !(o.plan && (o.plan.work || o.plan.forced))) {
    endPlan(s, o);
    const school = o.job.title === SCHOOL.title;
    o.plan = { label: school ? 'Going to school' : 'Off to work', work: true,
      steps: [{ type: 'goto', floor: 0, x: EXIT_X }, { type: 'leave', reason: school ? 'school' : 'work',
        until: c.day * 1440 + o.job.end * 60 }] };
  }
}

function runStep(s, o, dt) {
  const plan = o.plan;
  const st = plan.steps[0];
  let done = false;

  switch (st.type) {
    case 'goto':
      done = move(s, o, st.floor, st.x, dt);
      break;

    case 'wait':
      st.left -= dt;
      done = st.left <= 0;
      break;

    case 'passout':
      o.needs.energy = clamp(o.needs.energy + 0.4 * dt);
      st.left -= dt;
      done = st.left <= 0;
      break;

    case 'leave':
      o.out = { reason: st.reason, until: Math.max(st.until, s.minutes + 30) };
      o.workedDay = clock(s).day;
      o.ride = null;
      done = true;
      break;

    case 'use': {
      const obj = byId(s.objects, st.objectId);
      if (!obj || (obj.user && obj.user !== o.id)) return endPlan(s, o);
      obj.user = o.id;
      const cat = CATALOG[obj.type];
      for (const need in cat.gains) o.needs[need] = clamp(o.needs[need] + cat.gains[need] * dt);
      st.left -= dt;
      if (st.left <= 0 || Object.keys(cat.gains).every(n => o.needs[n] >= 99.5)) { obj.user = null; done = true; }
      break;
    }

    case 'dance': {
      o.needs.fun = clamp(o.needs.fun + 1.2 * dt);
      o.needs.social = clamp(o.needs.social + 1 * dt);
      for (const t of s.ogonz) {
        if (t !== o && t.plan && t.plan.steps[0] && t.plan.steps[0].type === 'dance') addRel(o, t, 0.15 * dt);
      }
      st.left -= dt;
      done = st.left <= 0 || !eventActive(s, 'dance');
      break;
    }

    case 'approach': {
      const t = byId(s.ogonz, st.targetId);
      if (!t || !available(s, t)) return endPlan(s, o);
      if (t.floor === o.floor && !t.ride && !o.ride && Math.abs(t.x - o.x) <= CHAT_RANGE) {
        startInteraction(s, o, t);
        return;
      }
      move(s, o, t.floor, t.x + (o.x < t.x ? -40 : 40), dt);
      break;
    }

    case 'interact': {
      const t = byId(s.ogonz, st.withId);
      if (!t || t.out || !(t.plan && t.plan.withId === o.id)) return endPlan(s, o);
      interactEffects(s, o, t, st, dt);
      o.facing = Math.sign(t.x - o.x) || o.facing;
      st.left -= dt;
      done = st.left <= 0;
      break;
    }
  }

  if (done) {
    plan.steps.shift();
    if (!plan.steps.length) o.plan = null;
  }
}

// ---------- interactions ----------

const LABELS = {
  chat: (a, b) => 'Chatting with ' + b.name,
  argue: (a, b) => 'Arguing with ' + b.name,
  prank: (a, b, role) => role === 'by' ? 'Pranking ' + b.name : 'Pranked by ' + b.name,
  flirt: (a, b) => 'Flirting with ' + b.name,
  gossip: (a, b, role, about) => 'Gossiping about ' + about
};

function startInteraction(s, o, t) {
  const r = getRel(o, t);
  let kind = 'chat', about = null;
  const enemies = s.ogonz.filter(x => x !== o && x !== t && getRel(o, x) < 0 && home(x));
  if (r <= -30) kind = 'argue';
  else if (has(o, 'prankster') && chance(s, 0.45)) kind = 'prank';
  else if (has(o, 'gossip') && enemies.length && chance(s, 0.5)) kind = 'gossip';
  else if (canRomance(o, t) && r >= 40 && (has(o, 'romantic') || r >= 60 || o.partnerId === t.id)) kind = 'flirt';

  if (kind === 'gossip') {
    const victim = pick(s, enemies);
    about = victim.name;
    addRel(o, victim, -6);
    addRel(t, victim, -8);
  }
  for (const [a, b, role] of [[o, t, 'by'], [t, o, 'to']]) {
    if (a === t) endPlan(s, a);
    a.plan = { label: LABELS[kind](a, b, role, about), withId: b.id, long: true,
      steps: [{ type: 'interact', withId: b.id, kind, role, left: CHAT_MINUTES }] };
  }
  if (kind === 'argue' && pairRel(o, t) <= -70 && (has(o, 'dramatic') || has(t, 'dramatic')) && chance(s, 0.3)) {
    log(s, pick(s, [
      o.name + ' and ' + t.name + ' had a slap fight in the hallway',
      o.name + ' threw a sandwich at ' + t.name,
      o.name + ' challenged ' + t.name + ' to a dance-off. Nobody won.',
      o.name + ' and ' + t.name + ' screamed at each other through the elevator doors'
    ]));
  }
  if (kind === 'prank' && chance(s, 0.25)) {
    log(s, pick(s, [
      o.name + ' filled ' + t.name + "'s shoes with jelly",
      o.name + ' replaced ' + t.name + "'s shampoo with mayonnaise",
      o.name + ' taped a "kick me" sign on ' + t.name,
      o.name + " hid a rubber chicken in " + t.name + "'s fridge"
    ]));
  }
}

function interactEffects(s, o, t, st, dt) {
  const cheer = has(o, 'cheerful') || has(t, 'cheerful') ? 0.15 : 0;
  o.needs.social = clamp(o.needs.social + (st.kind === 'argue' ? 1.5 : 2.5) * dt);
  switch (st.kind) {
    case 'chat':
      addRel(o, t, (0.9 * (compat(o, t) + 0.05) + cheer) * dt);
      o.needs.fun = clamp(o.needs.fun + 0.4 * dt);
      break;
    case 'argue':
      addRel(o, t, -0.7 * dt);
      o.needs.fun = clamp(o.needs.fun + (has(o, 'dramatic') ? 0.4 : -0.3) * dt);
      break;
    case 'prank':
      if (st.role === 'by') {
        o.needs.fun = clamp(o.needs.fun + 1.2 * dt);
        addRel(o, t, 0.2 * dt);
      } else if (has(o, 'prankster')) {
        o.needs.fun = clamp(o.needs.fun + 0.6 * dt);
        addRel(o, t, 0.4 * dt);
      } else {
        o.needs.fun = clamp(o.needs.fun - 0.6 * dt);
        addRel(o, t, -0.8 * dt);
      }
      break;
    case 'flirt':
      addRel(o, t, 0.9 * dt);
      o.needs.fun = clamp(o.needs.fun + 0.7 * dt);
      break;
    case 'gossip':
      addRel(o, t, 0.5 * dt);
      o.needs.fun = clamp(o.needs.fun + 0.6 * dt);
      break;
  }
}
