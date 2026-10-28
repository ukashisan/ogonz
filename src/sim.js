// Ogonz simulation: pure game state and rules, no DOM, no player input.
//
// Time is measured in game minutes. Each Ogon has needs (0-100) that decay and
// a current plan (a list of steps such as "walk there, then use that"). Ogonz
// pick the most useful thing to do on their own. Once a day, life happens:
// everyone ages, Ogonz fall in love, have babies, find or lose jobs, move in
// and out, buy furniture, and eventually die.

import {
  STAIRS, EXIT_X, BUILD_MIN, BUILD_MAX, WALK, CLIMB_MINUTES, MAX_OGONZ, START_MONEY,
  NEEDS, DECAY, CATALOG, NAMES, COLORS, JOBS,
  YEARS_PER_DAY, SCHOOL_AGE, ADULT_AGE, ELDER_AGE, SCHOOL, DAILY_BILLS, PENSION
} from './data.js';

export const SAVE_VERSION = 2;
const SUBSTEP = 0.25;
const CHAT_MINUTES = 20;
const CHAT_RANGE = 48;

// ---------- random (seeded, stored in state so runs are reproducible) ----------

function rand(s) {
  s.rng = (s.rng + 0x6D2B79F5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (s, list) => list[Math.floor(rand(s) * list.length)];
const chance = (s, p) => rand(s) < p;
const clamp = v => Math.max(0, Math.min(100, v));

// ---------- setup ----------

export function newGame(seed = Date.now()) {
  const s = {
    version: SAVE_VERSION, rng: seed | 0, minutes: 7 * 60, money: START_MONEY,
    nextId: 1, objects: [], ogonz: [], log: [], lastDay: 0, generation: 1
  };
  const place = (type, floor, x) => s.objects.push({ id: s.nextId++, type, floor, x, user: null, broken: false });
  place('fridge', 0, 200);
  place('sofa', 0, 330);
  place('tv', 0, 420);
  place('bookshelf', 0, 520);
  place('toilet', 1, 175);
  place('shower', 1, 225);
  place('bed', 1, 340);
  place('bed', 1, 470);
  place('plant', 1, 560);
  newFamily(s);
  return s;
}

function newFamily(s) {
  const a = addOgon(s, { age: 22 + rand(s) * 14 });
  const b = addOgon(s, { age: 22 + rand(s) * 14 });
  a.partnerId = b.id;
  b.partnerId = a.id;
  a.rel[b.id] = b.rel[a.id] = 75;
  log(s, 'The ' + a.name + ' & ' + b.name + ' family moved in');
}

function addOgon(s, { age, parents = [] }) {
  const living = new Set(s.ogonz.map(o => o.name));
  const free = NAMES.filter(n => !living.has(n));
  const name = free.length ? pick(s, free) : pick(s, NAMES) + ' ' + (s.nextId % 10);
  const parent = parents.length ? byId(s.ogonz, parents[0]) : null;
  const o = {
    id: s.nextId++, name, age,
    color: parent && chance(s, 0.6) ? parent.color : pick(s, COLORS),
    parents, partnerId: null,
    floor: 0, x: 260 + rand(s) * 300, facing: 1, climb: null,
    needs: Object.fromEntries(NEEDS.map(n => [n, 60 + rand(s) * 30])),
    plan: null, job: null, away: false, workedDay: clock(s).day, rel: {}
  };
  for (const p of parents) o.rel[p] = 60;
  o.job = jobFor(s, o);
  s.ogonz.push(o);
  return o;
}

function jobFor(s, o) {
  const st = stage(o);
  if (st === 'child') return o.age >= SCHOOL_AGE ? { ...SCHOOL } : null;
  if (st === 'adult') return { ...pick(s, JOBS) };
  return null;
}

// ---------- queries ----------

export function clock(s) {
  const day = Math.floor(s.minutes / 1440);
  const inDay = s.minutes - day * 1440;
  return { day, weekday: day % 7, hour: Math.floor(inDay / 60), minute: Math.floor(inDay % 60), hourF: inDay / 60 };
}

export const byId = (list, id) => list.find(x => x.id === id);

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

export function isSleeping(s, o) {
  const step = o.plan && o.plan.steps[0];
  if (!step) return false;
  if (step.type === 'passout') return true;
  if (step.type !== 'use') return false;
  const obj = byId(s.objects, step.objectId);
  return !!(obj && obj.user === o.id && CATALOG[obj.type].sleep);
}

export function activityLabel(o) {
  if (o.away) return o.job && o.job.title === SCHOOL.title ? 'At school' : 'At work';
  return o.plan ? o.plan.label : 'Idle';
}

function related(a, b) {
  return a.parents.includes(b.id) || b.parents.includes(a.id) ||
    a.parents.some(p => b.parents.includes(p));
}

// ---------- furniture ----------

export function canPlace(s, type, floor, x) {
  const cat = CATALOG[type];
  if (!cat || (floor !== 0 && floor !== 1)) return false;
  if (x - cat.w / 2 < BUILD_MIN || x + cat.w / 2 > BUILD_MAX) return false;
  return !s.objects.some(o => o.floor === floor && Math.abs(o.x - x) < (CATALOG[o.type].w + cat.w) / 2 + 4);
}

// The household buys an item and puts it in the first free spot.
function buyAnywhere(s, type) {
  const cat = CATALOG[type];
  if (s.money < cat.cost) return null;
  const floors = type === 'bed' || type === 'shower' || type === 'toilet' ? [1, 0] : [0, 1];
  for (const floor of floors) {
    for (let x = BUILD_MIN + cat.w / 2; x <= BUILD_MAX - cat.w / 2; x += 6) {
      if (canPlace(s, type, floor, x)) {
        s.money -= cat.cost;
        const obj = { id: s.nextId++, type, floor, x: Math.round(x), user: null, broken: false };
        s.objects.push(obj);
        return obj;
      }
    }
  }
  return null;
}

// ---------- plans ----------

function usePlan(obj) {
  const cat = CATALOG[obj.type];
  return {
    label: cat.verb, long: !!cat.sleep,
    steps: [{ type: 'goto', floor: obj.floor, x: obj.x }, { type: 'use', objectId: obj.id, left: cat.minutes }]
  };
}

function chatPlan(o, target) {
  const verb = o.partnerId === target.id ? 'Flirting with ' : 'Chatting with ';
  return { label: verb + target.name, long: true, steps: [{ type: 'approach', targetId: target.id }] };
}

function endPlan(s, o) {
  for (const obj of s.objects) if (obj.user === o.id) obj.user = null;
  o.plan = null;
}

function travel(o, floor, x) {
  if (o.floor === floor) return Math.abs(o.x - x);
  return Math.abs(o.x - STAIRS.x) + Math.abs(STAIRS.x - x) + CLIMB_MINUTES * WALK;
}

// Value of gaining `amount` of a need: worth more the lower the need is.
function needValue(o, need, amount) {
  const deficit = 100 - o.needs[need];
  const gained = Math.min(amount, deficit);
  return gained * Math.pow(deficit / 100, 2);
}

function available(s, o) {
  return !o.away && !isSleeping(s, o) && !(o.plan && (o.plan.work || o.plan.forced));
}

function choosePlan(s, o) {
  const hour = clock(s).hourF;
  const night = hour >= 21 || hour < 5;
  let best = null, bestScore = 4;
  for (const obj of s.objects) {
    const cat = CATALOG[obj.type];
    if (!cat.verb || obj.broken || (obj.user && obj.user !== o.id)) continue;
    let score = 0;
    for (const need in cat.gains) score += needValue(o, need, cat.gains[need] * cat.minutes);
    // Ogonz prefer to sleep at night.
    if (cat.sleep) score *= night && o.needs.energy < 85 ? 3 : 0.7;
    score = score / (1 + travel(o, obj.floor, obj.x) / 300) + rand(s) * 0.5;
    if (score > bestScore) { bestScore = score; best = usePlan(obj); }
  }
  for (const t of s.ogonz) {
    if (t === o || !available(s, t)) continue;
    let score = needValue(o, 'social', 50) / (1 + travel(o, t.floor, t.x) / 300) + rand(s) * 0.5;
    if (o.partnerId === t.id) score *= 1.5;
    if (score > bestScore) { bestScore = score; best = chatPlan(o, t); }
  }
  if (best) return best;
  const x = BUILD_MIN + rand(s) * (BUILD_MAX - BUILD_MIN);
  return {
    label: 'Wandering', long: true,
    steps: [{ type: 'goto', floor: o.floor, x }, { type: 'wait', left: 10 + rand(s) * 20 }]
  };
}

// ---------- movement ----------

// Moves toward (floor, x). Returns true on arrival.
function move(o, floor, x, dt) {
  if (o.climb) {
    o.climb.t += dt / CLIMB_MINUTES;
    if (o.climb.t >= 1) { o.floor = o.climb.to; o.climb = null; }
    return false;
  }
  const budget = WALK * dt * (stage(o) === 'elder' ? 0.7 : 1);
  const tx = o.floor === floor ? x : STAIRS.x;
  const dx = tx - o.x;
  if (Math.abs(dx) > budget) {
    o.x += Math.sign(dx) * budget;
    o.facing = Math.sign(dx);
    return false;
  }
  o.x = tx;
  if (o.floor !== floor) {
    o.climb = { from: o.floor, to: o.floor + Math.sign(floor - o.floor), t: 0 };
    return false;
  }
  return true;
}

// ---------- simulation ----------

export function step(s, minutes) {
  let left = minutes;
  while (left > 1e-9) {
    const dt = Math.min(SUBSTEP, left);
    left -= dt;
    s.minutes += dt;
    const day = clock(s).day;
    while (s.lastDay < day) dailyLife(s, ++s.lastDay);
    for (const o of [...s.ogonz]) tickOgon(s, o, dt);
  }
}

function tickOgon(s, o, dt) {
  const mode = o.away ? 'work' : isSleeping(s, o) ? 'sleep' : 'awake';
  for (const n of NEEDS) o.needs[n] = clamp(o.needs[n] - DECAY[mode][n] * dt);

  checkJob(s, o);
  if (o.away) return;

  if (o.needs.bladder <= 0) {
    o.needs.bladder = 100;
    o.needs.hygiene = 0;
    o.needs.fun = clamp(o.needs.fun - 25);
    log(s, o.name + ' had an accident!');
  }
  if (o.needs.energy <= 0 && !isSleeping(s, o) && !(o.plan && o.plan.work)) {
    endPlan(s, o);
    o.climb = null;
    o.plan = { label: 'Passed out', forced: true, steps: [{ type: 'passout', left: 120 }] };
    log(s, o.name + ' passed out from exhaustion');
  }

  if (o.plan && urgentElsewhere(s, o)) endPlan(s, o);
  if (!o.plan) o.plan = choosePlan(s, o);
  runStep(s, o, dt);
}

// True when the Ogon is in a long activity (sleep, chat, wander), a need is
// critical, and a free object could fix it. Wakes sleepers who need the
// toilet. Short activities always finish, so plans can't thrash.
function urgentElsewhere(s, o) {
  const plan = o.plan;
  if (!plan.long) return false;
  const served = new Set();
  for (const st of plan.steps) {
    const obj = st.objectId && byId(s.objects, st.objectId);
    if (obj) Object.keys(CATALOG[obj.type].gains || {}).forEach(n => served.add(n));
  }
  // Only hunger and the toilet are worth waking up for.
  const needs = isSleeping(s, o) ? ['hunger', 'bladder'] : NEEDS;
  return needs.some(n => o.needs[n] < 12 && !served.has(n) &&
    s.objects.some(obj => !obj.user && !obj.broken && CATALOG[obj.type].gains && n in CATALOG[obj.type].gains));
}

function checkJob(s, o) {
  const c = clock(s);
  const workday = c.weekday < 5;
  if (o.away) {
    if (!o.job || c.hourF >= o.job.end || !workday) {
      o.away = false;
      o.floor = 0;
      o.x = EXIT_X;
      if (o.job) s.money += o.job.pay;
    }
    return;
  }
  if (!o.job) return;
  const due = workday && o.workedDay !== c.day && c.hourF >= o.job.start - 1 && c.hourF < o.job.end - 1;
  if (due && !(o.plan && (o.plan.work || o.plan.forced))) {
    endPlan(s, o);
    const school = o.job.title === SCHOOL.title;
    o.plan = { label: school ? 'Going to school' : 'Going to work', work: true,
      steps: [{ type: 'goto', floor: 0, x: EXIT_X }, { type: 'leave' }] };
  }
}

function runStep(s, o, dt) {
  const plan = o.plan;
  const st = plan.steps[0];
  let done = false;

  switch (st.type) {
    case 'goto':
      done = move(o, st.floor, st.x, dt);
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
      o.away = true;
      o.workedDay = clock(s).day;
      o.climb = null;
      done = true;
      break;

    case 'use': {
      const obj = byId(s.objects, st.objectId);
      if (!obj || obj.broken || (obj.user && obj.user !== o.id)) return endPlan(s, o);
      obj.user = o.id;
      const cat = CATALOG[obj.type];
      for (const need in cat.gains) o.needs[need] = clamp(o.needs[need] + cat.gains[need] * dt);
      st.left -= dt;
      const full = Object.keys(cat.gains).every(n => o.needs[n] >= 99.5);
      if (st.left <= 0 || full) { obj.user = null; done = true; }
      break;
    }

    case 'approach': {
      const t = byId(s.ogonz, st.targetId);
      if (!t || !available(s, t) && !(t.plan && t.plan.chatWith === o.id)) return endPlan(s, o);
      if (t.floor === o.floor && !t.climb && !o.climb && Math.abs(t.x - o.x) <= CHAT_RANGE) {
        startChat(s, o, t);
        return;
      }
      move(o, t.floor, t.x + (o.x < t.x ? -40 : 40), dt);
      break;
    }

    case 'chatting': {
      const t = byId(s.ogonz, st.withId);
      if (!t || t.away || !(t.plan && t.plan.chatWith === o.id)) return endPlan(s, o);
      const partners = o.partnerId === t.id;
      o.needs.social = clamp(o.needs.social + 2.5 * dt);
      o.needs.fun = clamp(o.needs.fun + (partners ? 0.8 : 0.4) * dt);
      o.rel[t.id] = Math.max(-100, Math.min(100, (o.rel[t.id] || 0) + (partners ? 0.6 : 0.4) * dt));
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

function startChat(s, o, t) {
  for (const [a, b] of [[o, t], [t, o]]) {
    if (a === t) endPlan(s, a);
    const verb = a.partnerId === b.id ? 'Flirting with ' : 'Chatting with ';
    a.plan = { label: verb + b.name, chatWith: b.id, long: true,
      steps: [{ type: 'chatting', withId: b.id, left: CHAT_MINUTES }] };
  }
}

// ---------- daily life ----------

function dailyLife(s) {
  // Ageing, growing up, retiring.
  for (const o of s.ogonz) {
    const before = stage(o);
    const wasSchoolAge = o.age >= SCHOOL_AGE;
    o.age += YEARS_PER_DAY;
    const now = stage(o);
    if (before === 'child' && now === 'child' && !wasSchoolAge && o.age >= SCHOOL_AGE) {
      o.job = { ...SCHOOL };
      log(s, o.name + ' started school');
    } else if (before === 'child' && now === 'adult') {
      o.job = jobFor(s, o);
      log(s, o.name + ' grew up and became a ' + o.job.title);
    } else if (before === 'adult' && now === 'elder') {
      o.job = null;
      log(s, o.name + ' retired');
    }
  }

  // Deaths: elders get frailer each year.
  for (const o of [...s.ogonz]) {
    if (stage(o) === 'elder' && chance(s, Math.max(0, (o.age - ELDER_AGE - 4) / 30))) die(s, o);
  }

  const adults = s.ogonz.filter(o => stage(o) === 'adult');

  // Romance.
  for (const a of adults) {
    for (const b of adults) {
      if (a.id >= b.id || a.partnerId || b.partnerId || related(a, b)) continue;
      if ((a.rel[b.id] || 0) >= 45 && (b.rel[a.id] || 0) >= 45 && chance(s, 0.5)) {
        a.partnerId = b.id;
        b.partnerId = a.id;
        log(s, a.name + ' and ' + b.name + ' fell in love ♥');
      }
    }
  }

  // Babies.
  for (const a of adults) {
    const b = byId(s.ogonz, a.partnerId);
    if (!b || a.id > b.id || stage(b) !== 'adult' || a.age > 46 || b.age > 46) continue;
    if (s.ogonz.length >= MAX_OGONZ || (a.rel[b.id] || 0) < 60) continue;
    if (chance(s, 0.25)) {
      const baby = addOgon(s, { age: 0, parents: [a.id, b.id] });
      baby.floor = a.floor;
      baby.x = a.x;
      a.rel[baby.id] = b.rel[baby.id] = 60;
      log(s, a.name + ' and ' + b.name + ' had a baby: ' + baby.name);
    }
  }

  // Grown children move out when the house gets crowded.
  for (const o of [...s.ogonz]) {
    if (stage(o) !== 'adult' || !o.parents.length || o.age > 34) continue;
    if (s.ogonz.length >= MAX_OGONZ - 1 && chance(s, 0.35)) leave(s, o, o.name + ' moved out to start a new life');
  }

  // Newcomers.
  if (!s.ogonz.length) {
    s.generation += 1;
    newFamily(s);
  } else {
    const singles = s.ogonz.filter(o => stage(o) === 'adult' && !o.partnerId);
    if (s.ogonz.length < 3 && (singles.length || !adults.length) && chance(s, 0.35)) {
      const o = addOgon(s, { age: 20 + rand(s) * 12 });
      log(s, o.name + ' moved in (' + o.job.title + ')');
    }
  }

  // Jobs.
  for (const o of s.ogonz) {
    if (stage(o) !== 'adult') continue;
    if (!o.job) {
      if (chance(s, 0.5)) { o.job = jobFor(s, o); log(s, o.name + ' found work as a ' + o.job.title); }
    } else if (chance(s, 0.04)) {
      o.job.pay = Math.round(o.job.pay * 1.2);
      log(s, o.name + ' got a promotion! (§' + o.job.pay + '/day)');
    } else if (chance(s, 0.015)) {
      log(s, o.name + ' lost their job as a ' + o.job.title);
      o.job = null;
      o.needs.fun = clamp(o.needs.fun - 30);
    }
  }

  // Money.
  const elders = s.ogonz.filter(o => stage(o) === 'elder').length;
  s.money += elders * PENSION - s.ogonz.length * DAILY_BILLS;
  if (chance(s, 0.04)) {
    const found = 100 + Math.floor(rand(s) * 300);
    s.money += found;
    log(s, pick(s, s.ogonz).name + ' found §' + found + ' in an old coat');
  }
  if (chance(s, 0.005)) {
    s.money += 3000;
    log(s, 'The household won the lottery! +§3000');
  }

  // Repairs, then new breakages.
  for (const obj of s.objects) {
    if (!obj.broken) continue;
    const cost = Math.round(CATALOG[obj.type].cost / 4);
    if (s.money >= cost) {
      s.money -= cost;
      obj.broken = false;
      log(s, 'The ' + CATALOG[obj.type].name.toLowerCase() + ' was repaired (§' + cost + ')');
    }
  }
  if (chance(s, 0.12)) {
    const usable = s.objects.filter(o => CATALOG[o.type].verb && !o.broken && CATALOG[o.type].sleep !== true);
    if (usable.length) {
      const obj = pick(s, usable);
      obj.broken = true;
      if (obj.user) { const u = byId(s.ogonz, obj.user); if (u) endPlan(s, u); }
      log(s, 'The ' + CATALOG[obj.type].name.toLowerCase() + ' broke!');
    }
  }

  // Shopping: a bed for everyone first, then the odd treat when well off.
  const beds = s.objects.filter(o => o.type === 'bed').length;
  if (beds < s.ogonz.length && s.money >= CATALOG.bed.cost + 100) {
    if (buyAnywhere(s, 'bed')) log(s, 'The household bought a new bed');
  } else if (s.money > 2500 && chance(s, 0.4)) {
    const wishes = Object.keys(CATALOG).filter(t => t !== 'bed' && s.objects.filter(o => o.type === t).length < 2);
    const type = wishes.length && pick(s, wishes);
    if (type && buyAnywhere(s, type)) log(s, 'The household bought a ' + CATALOG[type].name.toLowerCase());
  }
}

function die(s, o) {
  leave(s, o, o.name + ' passed away at ' + Math.floor(o.age) + '. Rest in peace.');
  for (const other of s.ogonz) {
    if ((other.rel[o.id] || 0) > 20) {
      other.needs.fun = clamp(other.needs.fun - 40);
      other.needs.social = clamp(other.needs.social - 20);
    }
  }
}

function leave(s, o, text) {
  endPlan(s, o);
  s.ogonz = s.ogonz.filter(x => x !== o);
  for (const other of s.ogonz) {
    if (other.partnerId === o.id) other.partnerId = null;
    if (other.plan && other.plan.steps.some(st => st.targetId === o.id || st.withId === o.id)) endPlan(s, other);
  }
  log(s, text);
}

// ---------- log, save, load ----------

function log(s, text) {
  s.log.push({ t: s.minutes, text });
  if (s.log.length > 40) s.log.shift();
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
