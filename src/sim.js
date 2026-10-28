// Ogonz simulation: pure game state and rules, no DOM.
//
// Time is measured in game minutes. Each Ogon has needs (0-100) that decay,
// a current plan (a list of steps such as "walk there, then use that"), and a
// queue of plans the player asked for. With nothing queued, an Ogon picks the
// most useful thing to do on its own.

import {
  STAIRS, EXIT_X, BUILD_MIN, BUILD_MAX, WALK, CLIMB_MINUTES, MAX_OGONZ, START_MONEY,
  NEEDS, DECAY, CATALOG, NAMES, COLORS, JOBS
} from './data.js';

export const SAVE_VERSION = 1;
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
const clamp = v => Math.max(0, Math.min(100, v));

// ---------- setup ----------

export function newGame(seed = Date.now()) {
  const s = {
    version: SAVE_VERSION, rng: seed | 0, minutes: 7 * 60, money: START_MONEY,
    nextId: 1, objects: [], ogonz: [], log: []
  };
  const place = (type, floor, x) => s.objects.push({ id: s.nextId++, type, floor, x, user: null });
  place('fridge', 0, 200);
  place('sofa', 0, 330);
  place('tv', 0, 420);
  place('bookshelf', 0, 520);
  place('toilet', 1, 175);
  place('shower', 1, 225);
  place('bed', 1, 340);
  place('bed', 1, 470);
  place('plant', 1, 560);
  addOgon(s);
  addOgon(s);
  return s;
}

export function addOgon(s) {
  if (s.ogonz.length >= MAX_OGONZ) return { ok: false, reason: 'The house is full' };
  const used = new Set(s.ogonz.map(o => o.name));
  const name = pick(s, NAMES.filter(n => !used.has(n)));
  const o = {
    id: s.nextId++, name, color: COLORS[s.ogonz.length % COLORS.length],
    floor: 0, x: 260 + rand(s) * 300, facing: 1, climb: null,
    needs: Object.fromEntries(NEEDS.map(n => [n, 60 + rand(s) * 30])),
    plan: null, queue: [], job: { ...pick(s, JOBS) }, away: false, workedDay: -1, rel: {}
  };
  s.ogonz.push(o);
  log(s, o.name + ' moved in (' + o.job.title + ')');
  return { ok: true, ogon: o };
}

// ---------- queries ----------

export function clock(s) {
  const day = Math.floor(s.minutes / 1440);
  const inDay = s.minutes - day * 1440;
  return { day, weekday: day % 7, hour: Math.floor(inDay / 60), minute: Math.floor(inDay % 60), hourF: inDay / 60 };
}

export const byId = (list, id) => list.find(x => x.id === id);

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
  if (o.away) return 'At work';
  return o.plan ? o.plan.label : 'Idle';
}

// ---------- player commands ----------

export function commandUse(s, ogonId, objectId) {
  const o = byId(s.ogonz, ogonId), obj = byId(s.objects, objectId);
  if (!o || !obj || !CATALOG[obj.type].verb) return false;
  queuePlan(o, usePlan(obj, true));
  return true;
}

export function commandChat(s, ogonId, targetId) {
  const o = byId(s.ogonz, ogonId), t = byId(s.ogonz, targetId);
  if (!o || !t || o === t) return false;
  queuePlan(o, chatPlan(t, true));
  return true;
}

export function cancelAll(s, ogonId) {
  const o = byId(s.ogonz, ogonId);
  if (!o) return;
  o.queue = [];
  if (o.plan && !o.plan.work) endPlan(s, o);
}

function queuePlan(o, plan) {
  o.queue.push(plan);
  // A player order interrupts whatever the Ogon chose by itself.
  if (o.plan && !o.plan.player && !o.plan.work && !o.plan.forced) o.plan.interrupt = true;
}

export function canPlace(s, type, floor, x) {
  const cat = CATALOG[type];
  if (!cat || (floor !== 0 && floor !== 1)) return false;
  if (x - cat.w / 2 < BUILD_MIN || x + cat.w / 2 > BUILD_MAX) return false;
  return !s.objects.some(o => o.floor === floor && Math.abs(o.x - x) < (CATALOG[o.type].w + cat.w) / 2 + 4);
}

export function buy(s, type, floor, x) {
  const cat = CATALOG[type];
  if (!cat) return { ok: false, reason: 'Unknown item' };
  if (s.money < cat.cost) return { ok: false, reason: 'Not enough money' };
  if (!canPlace(s, type, floor, x)) return { ok: false, reason: "Doesn't fit there" };
  s.money -= cat.cost;
  const obj = { id: s.nextId++, type, floor, x: Math.round(x), user: null };
  s.objects.push(obj);
  return { ok: true, object: obj };
}

export function sell(s, objectId) {
  const obj = byId(s.objects, objectId);
  if (!obj) return { ok: false };
  for (const o of s.ogonz) {
    if (o.plan && o.plan.steps.some(st => st.objectId === objectId)) endPlan(s, o);
    o.queue = o.queue.filter(p => !p.steps.some(st => st.objectId === objectId));
  }
  s.objects = s.objects.filter(x => x !== obj);
  const refund = Math.floor(CATALOG[obj.type].cost / 2);
  s.money += refund;
  return { ok: true, refund };
}

// ---------- plans ----------

function usePlan(obj, player) {
  const cat = CATALOG[obj.type];
  return {
    label: cat.verb, player, long: !!cat.sleep,
    steps: [{ type: 'goto', floor: obj.floor, x: obj.x }, { type: 'use', objectId: obj.id, left: cat.minutes }]
  };
}

function chatPlan(target, player) {
  return { label: 'Chat with ' + target.name, player, long: true, steps: [{ type: 'approach', targetId: target.id }] };
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
  return !o.away && !isSleeping(s, o) && !(o.plan && (o.plan.player || o.plan.work || o.plan.forced));
}

function choosePlan(s, o) {
  const hour = clock(s).hourF;
  const night = hour >= 21 || hour < 5;
  let best = null, bestScore = 4;
  for (const obj of s.objects) {
    const cat = CATALOG[obj.type];
    if (!cat.verb || (obj.user && obj.user !== o.id)) continue;
    let score = 0;
    for (const need in cat.gains) score += needValue(o, need, cat.gains[need] * cat.minutes);
    // Ogonz prefer to sleep at night.
    if (cat.sleep) score *= night && o.needs.energy < 85 ? 3 : 0.7;
    score = score / (1 + travel(o, obj.floor, obj.x) / 300) + rand(s) * 0.5;
    if (score > bestScore) { bestScore = score; best = usePlan(obj, false); }
  }
  for (const t of s.ogonz) {
    if (t === o || !available(s, t)) continue;
    const score = needValue(o, 'social', 50) / (1 + travel(o, t.floor, t.x) / 300) + rand(s) * 0.5;
    if (score > bestScore) { bestScore = score; best = chatPlan(t, false); }
  }
  if (best) return best;
  const x = BUILD_MIN + rand(s) * (BUILD_MAX - BUILD_MIN);
  return {
    label: 'Wandering', player: false, long: true,
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
  const budget = WALK * dt;
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
    for (const o of s.ogonz) tickOgon(s, o, dt);
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

  if (o.plan && (o.plan.interrupt || urgentElsewhere(s, o))) endPlan(s, o);
  if (!o.plan) o.plan = o.queue.length ? o.queue.shift() : choosePlan(s, o);
  runStep(s, o, dt);
}

// True when the Ogon is in a long autonomous activity (sleep, chat, wander),
// a need is critical, and a free object could fix it. Wakes sleepers who need
// the toilet. Short activities always finish, so plans can't thrash.
function urgentElsewhere(s, o) {
  const plan = o.plan;
  if (!plan.long || plan.player) return false;
  const served = new Set();
  for (const st of plan.steps) {
    const obj = st.objectId && byId(s.objects, st.objectId);
    if (obj) Object.keys(CATALOG[obj.type].gains || {}).forEach(n => served.add(n));
  }
  // Only hunger and the toilet are worth waking up for.
  const needs = isSleeping(s, o) ? ['hunger', 'bladder'] : NEEDS;
  return needs.some(n => o.needs[n] < 12 && !served.has(n) &&
    s.objects.some(obj => !obj.user && CATALOG[obj.type].gains && n in CATALOG[obj.type].gains));
}

function checkJob(s, o) {
  const c = clock(s);
  const workday = c.weekday < 5;
  if (o.away) {
    if (c.hourF >= o.job.end || !workday) {
      o.away = false;
      o.floor = 0;
      o.x = EXIT_X;
      s.money += o.job.pay;
      log(s, o.name + ' came home from work (+§' + o.job.pay + ')');
    }
    return;
  }
  const due = workday && o.workedDay !== c.day && c.hourF >= o.job.start - 1 && c.hourF < o.job.end - 1;
  if (due && !(o.plan && (o.plan.work || o.plan.forced))) {
    endPlan(s, o);
    o.plan = { label: 'Going to work', work: true,
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
      if (!obj || (obj.user && obj.user !== o.id)) return endPlan(s, o);
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
      o.needs.social = clamp(o.needs.social + 2.5 * dt);
      o.needs.fun = clamp(o.needs.fun + 0.4 * dt);
      o.rel[t.id] = Math.max(-100, Math.min(100, (o.rel[t.id] || 0) + 0.4 * dt));
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
  const label = name => 'Chatting with ' + name;
  for (const [a, b] of [[o, t], [t, o]]) {
    if (a === t) endPlan(s, a);
    const keepPlayer = a.plan ? a.plan.player : false;
    a.plan = { label: label(b.name), player: keepPlayer, chatWith: b.id, long: true,
      steps: [{ type: 'chatting', withId: b.id, left: CHAT_MINUTES }] };
  }
}

// ---------- log, save, load ----------

function log(s, text) {
  s.log.push({ t: s.minutes, text });
  if (s.log.length > 30) s.log.shift();
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

