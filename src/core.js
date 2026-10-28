// Core simulation shared by the life and fun modules: randomness, time,
// residents' needs, autonomy, walking around the park, going inside trailers,
// running and buying from schemes, and how residents treat each other.
// No DOM, no player input.

import {
  PARK, GATE, AMENITY_INFO, INDOOR, SCHEMES, SCHEME_HOURS, WALK, CHAT_MINUTES, NEEDS, DECAY,
  CHEMISTRY, SCHOOL, ADULT_AGE, ELDER_AGE
} from './data.js';

const CHAT_RANGE = 16;

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
export const has = (o, trait) => o.traits.includes(trait);
export const trailerOf = (s, o) => byId(s.trailers, o.home);
export const stallOf = (s, o) => s.stalls.find(st => st.ownerId === o.id);
export const doorOf = t => ({ x: t.x - 14, y: t.y + 3 });

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
export const present = o => !o.out;          // in the park (possibly inside a trailer)
export const visible = o => !o.out && !o.inside;
export const money = n => '$' + Math.round(n).toLocaleString('en-US');

// ---------- relationships ----------

export const getRel = (a, b) => a.rel[b.id] || 0;
export function addRel(a, b, d) {
  a.rel[b.id] = Math.max(-100, Math.min(100, getRel(a, b) + d));
}
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
  const spark = (((lo * 2654435761) ^ (hi * 40503)) >>> 0) % 1000 / 1000 - 0.5;
  return Math.max(-1, Math.min(1, sum / Math.max(1, n) + spark * 0.6));
}

export function canRomance(a, b) {
  return stage(a) !== 'child' && stage(b) !== 'child' && !related(a, b) &&
    (a.partnerId === b.id || (!a.partnerId && !b.partnerId));
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

// ---------- state of a resident ----------

const step0 = o => o.plan && o.plan.steps[0];

export function isSleeping(s, o) {
  const st = step0(o);
  return !!st && ((st.type === 'indoor' && st.kind === 'sleep' && o.inside) || st.type === 'passout');
}

export function isTending(o, stall) {
  const st = step0(o);
  return !!st && st.type === 'tend' && (!stall || st.stallId === stall.id) && dist(o, stall || o) < 14;
}

function available(s, o) {
  return visible(o) && !isSleeping(s, o) && !(o.plan && (o.plan.work || o.plan.forced || o.plan.event));
}

export function activityLabel(s, o) {
  let label;
  if (o.out) label = { school: 'At school', space: 'In outer space', away: 'Away' }[o.out.reason] || 'Out';
  else label = o.plan ? o.plan.label : 'Idle';
  if (statusActive(s, o, 'cat')) label += ' (as a cat)';
  return label;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------- plans ----------

export function endPlan(s, o) {
  for (const a of s.amenities) a.users = a.users.filter(id => id !== o.id);
  if (o.inside) exitTrailer(s, o);
  o.plan = null;
}

function exitTrailer(s, o) {
  const t = byId(s.trailers, o.inside);
  o.inside = null;
  if (t) { const d = doorOf(t); o.x = d.x; o.y = d.y; }
}

function indoorPlan(s, o, kind) {
  const t = trailerOf(s, o);
  const d = doorOf(t);
  const info = INDOOR[kind];
  return { label: info.verb, long: !!info.sleep, steps: [
    { type: 'goto', x: d.x, y: d.y }, { type: 'indoor', kind, left: info.minutes }] };
}

function amenityPlan(s, a) {
  const info = AMENITY_INFO[a.type];
  const x = a.x + (rand(s) - 0.5) * (a.spread || 0);
  return { label: info.verb, steps: [
    { type: 'goto', x, y: a.y + (a.dy ?? 10) }, { type: 'use', amenityId: a.id, left: info.minutes }] };
}

function travel(o, x, y) {
  return Math.hypot(o.x - x, o.y - y);
}

// Value of gaining `amount` of a need: worth more the lower the need is.
function needValue(o, need, amount) {
  const deficit = 100 - o.needs[need];
  return Math.min(amount, deficit) * Math.pow(deficit / 100, 2);
}

export function schemeOpen(s) {
  const h = clock(s).hourF;
  return h >= SCHEME_HOURS.start && h < SCHEME_HOURS.end;
}

function choosePlan(s, o) {
  const hour = clock(s).hourF;
  const night = hour >= 21 || hour < 5;
  let best = null, bestScore = 4;
  const consider = (score, plan) => { if (score > bestScore) { bestScore = score; best = plan; } };
  const far = (x, y) => 1 + travel(o, x, y) / 250;

  // Inside their own trailer.
  const t = trailerOf(s, o);
  if (t) {
    const d = doorOf(t);
    for (const kind in INDOOR) {
      const info = INDOOR[kind];
      let score = 0;
      for (const need in info.gains) score += needValue(o, need, info.gains[need] * info.minutes);
      if (info.sleep) score *= (night && o.needs.energy < 85 ? 3 : 0.7) * (has(o, 'sleepy') ? 1.6 : 1);
      if (kind === 'tv') score *= 0.8;
      consider(score / far(d.x, d.y) + rand(s) * 0.5, () => indoorPlan(s, o, kind));
    }
  }

  // Shared amenities around the park.
  for (const a of s.amenities) {
    const info = AMENITY_INFO[a.type];
    if (!info.gains || a.users.length >= a.slots || (a.brokenUntil || 0) > s.minutes) continue;
    if (a.type === 'catapult' && stage(o) === 'child') continue;
    let score = 0;
    for (const need in info.gains) score += needValue(o, need, info.gains[need] * info.minutes);
    if (info.gains.fun && has(o, 'party')) score *= 1.4;
    consider(score / far(a.x, a.y) + rand(s) * 0.5, () => amenityPlan(s, a));
  }

  // Running their own scheme during business hours.
  const mine = stallOf(s, o);
  if (mine && schemeOpen(s) && stage(o) !== 'child') {
    const drive = (has(o, 'hustler') ? 14 : 9) * (o.needs.energy > 30 ? 1 : 0.3);
    consider(drive / far(mine.x, mine.y) + rand(s), () => ({ label: 'Running ' + SCHEMES[mine.type].name.toLowerCase(),
      long: true, steps: [{ type: 'goto', x: mine.x, y: mine.y + 8 }, { type: 'tend', stallId: mine.id, left: 90 }] }));
  }

  // Buying from someone else's scheme.
  for (const st of s.stalls) {
    const owner = byId(s.ogonz, st.ownerId);
    const sc = SCHEMES[st.type];
    if (!owner || owner === o || o.cash < sc.price || !isTending(owner, st)) continue;
    let score = 0;
    for (const need in sc.gains) score += needValue(o, need, sc.gains[need]) * 1.5;
    score *= has(o, 'gullible') ? 2 : has(o, 'hustler') ? 0.4 : 1;
    score *= getRel(o, owner) < -20 ? 0.2 : 1;
    consider(score / far(st.x, st.y) + rand(s) * 0.5, () => ({ label: 'Buying ' + sc.name.toLowerCase(),
      steps: [{ type: 'goto', x: st.x - 8, y: st.y + 10 }, { type: 'buy', stallId: st.id }] }));
  }

  // Someone to talk to (or pick a fight with).
  for (const other of s.ogonz) {
    if (other === o || !available(s, other)) continue;
    const r = getRel(o, other);
    let f = 1;
    if (r < -30) f = has(o, 'grumpy') || has(o, 'dramatic') ? 0.9 : 0.15;
    if (o.partnerId === other.id) f *= 1.6;
    if (has(o, 'prankster') || has(o, 'gossip') || has(o, 'hustler')) f *= 1.25;
    consider(needValue(o, 'social', 50) * f / (1 + travel(o, other.x, other.y) / 500) + rand(s) * 0.5,
      () => ({ label: 'Looking for ' + other.name, long: true, steps: [{ type: 'approach', targetId: other.id }] }));
  }

  if (best) return best();
  return {
    label: pick(s, ['Wandering about', 'Kicking a can', 'Staring at the sky', 'Admiring the cacti', 'Pacing']),
    long: true,
    steps: [{ type: 'goto', x: PARK.left + 30 + rand(s) * (PARK.right - PARK.left - 60),
      y: PARK.top + 40 + rand(s) * (PARK.bottom - PARK.top - 60) }, { type: 'wait', left: 10 + rand(s) * 25 }]
  };
}

// ---------- movement ----------

// Walks straight toward (x, y). True on arrival.
function move(s, o, x, y, dt) {
  const speed = WALK * (stage(o) === 'elder' ? 0.7 : 1) * (statusActive(s, o, 'chased') ? 2.2 : 1);
  const dx = x - o.x, dy = y - o.y;
  const d = Math.hypot(dx, dy);
  const step = speed * dt;
  if (Math.abs(dx) > 0.5) o.facing = Math.sign(dx);
  if (d <= step) { o.x = x; o.y = y; return true; }
  o.x += dx / d * step;
  o.y += dy / d * step;
  return false;
}

// ---------- per-resident tick ----------

export function tickResident(s, o, dt) {
  const mode = o.out ? 'out' : isSleeping(s, o) ? 'sleep' : 'awake';
  for (const n of NEEDS) o.needs[n] = clamp(o.needs[n] - DECAY[mode][n] * dt);

  checkOut(s, o);
  if (o.out) return;

  if (o.needs.bladder <= 0) {
    o.needs.bladder = 100;
    o.needs.hygiene = 0;
    o.needs.fun = clamp(o.needs.fun - 25);
    log(s, o.name + ' had an accident behind a cactus');
  }
  if (o.needs.energy <= 0 && !isSleeping(s, o) && !(o.plan && o.plan.work)) {
    endPlan(s, o);
    o.plan = { label: 'Passed out in the dirt', forced: true, steps: [{ type: 'passout', left: 120 }] };
    log(s, o.name + ' fell asleep face down in the dirt');
  }

  if (o.plan && urgentElsewhere(s, o)) endPlan(s, o);
  if (!o.plan) o.plan = choosePlan(s, o);
  runStep(s, o, dt);
}

// True when the resident is in a long activity (sleep, chat, wander, tending,
// a gathering), a need is critical, and something could fix it. Short
// activities always finish, so plans can't thrash.
function urgentElsewhere(s, o) {
  const plan = o.plan;
  if (!plan.long) return false;
  const served = new Set();
  for (const st of plan.steps) {
    const gains = st.type === 'indoor' ? INDOOR[st.kind].gains
      : st.type === 'use' ? AMENITY_INFO[byId(s.amenities, st.amenityId).type].gains
        : st.type === 'gather' ? st.gains : null;
    if (gains) Object.keys(gains).forEach(n => served.add(n));
    if (st.type === 'approach' || st.type === 'interact') served.add('social');
  }
  const needs = isSleeping(s, o) ? ['hunger', 'bladder'] : NEEDS;   // only worth waking up for these
  return needs.some(n => o.needs[n] < 12 && !served.has(n));
}

// School for kids, and coming back from wherever they went.
function checkOut(s, o) {
  const c = clock(s);
  if (o.out) {
    if (s.minutes >= o.out.until) {
      if (o.out.reason === 'space') {
        o.needs.fun = 100;
        log(s, o.name + ' was returned by the aliens. The tinfoil crowd feels vindicated.');
        if (!has(o, 'conspiracy') && chance(s, 0.5)) {
          o.traits[1] = 'conspiracy';
          o.hat = 'tinfoil';
        }
      }
      o.out = null;
      o.x = GATE.x;
      o.y = GATE.y - 6;
    }
    return;
  }
  if (stage(o) !== 'child' || o.age < 6 || c.weekday >= 5) return;
  const due = o.workedDay !== c.day && c.hourF >= SCHOOL.start - 1 && c.hourF < SCHOOL.end - 1;
  if (due && !(o.plan && (o.plan.work || o.plan.forced))) {
    endPlan(s, o);
    o.plan = { label: 'Going to school', work: true, steps: [
      { type: 'goto', x: GATE.x, y: GATE.y }, { type: 'leave', reason: 'school', until: c.day * 1440 + SCHOOL.end * 60 }] };
  }
}

function runStep(s, o, dt) {
  const plan = o.plan;
  const st = plan.steps[0];
  let done = false;

  switch (st.type) {
    case 'goto':
      done = move(s, o, st.x, st.y, dt);
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
      done = true;
      break;

    case 'indoor': {
      const t = trailerOf(s, o);
      if (!t) return endPlan(s, o);
      o.inside = t.id;
      const info = INDOOR[st.kind];
      for (const need in info.gains) o.needs[need] = clamp(o.needs[need] + info.gains[need] * dt);
      st.left -= dt;
      if (st.left <= 0 || Object.keys(info.gains).every(n => o.needs[n] >= 99.5)) {
        exitTrailer(s, o);
        done = true;
      }
      break;
    }

    case 'use': {
      const a = byId(s.amenities, st.amenityId);
      if (!a.users.includes(o.id)) {
        if (a.users.length >= a.slots || (a.brokenUntil || 0) > s.minutes) return endPlan(s, o);
        a.users.push(o.id);
      }
      const info = AMENITY_INFO[a.type];
      for (const need in info.gains) o.needs[need] = clamp(o.needs[need] + info.gains[need] * dt);
      st.left -= dt;
      if (st.left <= 0 || Object.keys(info.gains).every(n => o.needs[n] >= 99.5)) {
        a.users = a.users.filter(id => id !== o.id);
        if (a.type === 'catapult') launch(s, o);
        done = true;
      }
      break;
    }

    case 'tend': {
      const stall = byId(s.stalls, st.stallId);
      if (!stall || !schemeOpen(s)) return endPlan(s, o);
      // Passing tourists, mostly.
      const sc = SCHEMES[stall.type];
      const rate = 0.006 * stall.hype * (has(o, 'hustler') ? 1.6 : 1);
      if (chance(s, rate * dt)) { o.cash += sc.price; stall.earned += sc.price; }
      o.needs.fun = clamp(o.needs.fun + (has(o, 'hustler') ? 0.3 : -0.05) * dt);
      st.left -= dt;
      done = st.left <= 0;
      break;
    }

    case 'buy': {
      const stall = byId(s.stalls, st.stallId);
      const owner = stall && byId(s.ogonz, stall.ownerId);
      const sc = stall && SCHEMES[stall.type];
      if (owner && isTending(owner, stall) && o.cash >= sc.price) {
        o.cash -= sc.price;
        owner.cash += sc.price;
        stall.earned += sc.price;
        for (const need in sc.gains) o.needs[need] = clamp(o.needs[need] + sc.gains[need]);
        addRel(o, owner, 3);
        addRel(owner, o, 4);
        if (sc.scam) o.regrets.push({ ownerId: owner.id, type: stall.type });
        if (chance(s, 0.12)) log(s, o.name + ' bought ' + sc.name.toLowerCase() + ' from ' + owner.name + ' for ' + money(sc.price));
      }
      done = true;
      break;
    }

    case 'gather': {
      // Event gatherings (seminar, BBQ party, races). fun.js sets the gains.
      if (!eventActive(s, st.event)) { done = true; break; }
      for (const need in st.gains) o.needs[need] = clamp(o.needs[need] + st.gains[need] * dt);
      if (st.event === 'seminar' && o.cash > 0) {
        const loss = Math.min(o.cash, (has(o, 'gullible') ? 1.2 : 0.4) * dt);
        o.cash -= loss;
        s.seminarTake = (s.seminarTake || 0) + loss;
      }
      for (const t of s.ogonz) {
        const ts = step0(t);
        if (t !== o && ts && ts.type === 'gather' && ts.event === st.event) addRel(o, t, 0.1 * dt);
      }
      st.left -= dt;
      done = st.left <= 0;
      break;
    }

    case 'approach': {
      const t = byId(s.ogonz, st.targetId);
      if (!t || !available(s, t)) return endPlan(s, o);
      if (dist(o, t) <= CHAT_RANGE) {
        startInteraction(s, o, t);
        return;
      }
      move(s, o, t.x + (o.x < t.x ? -11 : 11), t.y, dt);
      break;
    }

    case 'interact': {
      const t = byId(s.ogonz, st.withId);
      if (!t || !visible(t) || !(t.plan && t.plan.withId === o.id)) return endPlan(s, o);
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

// The catapult throws you somewhere random in the park.
function launch(s, o) {
  const x = PARK.left + 40 + rand(s) * (PARK.right - PARK.left - 80);
  const y = PARK.top + 60 + rand(s) * (PARK.bottom - PARK.top - 80);
  s.events.push({ type: 'flight', start: s.minutes, until: s.minutes + 6, who: o.id, fx: o.x, fy: o.y, tx: x, ty: y });
  o.x = x;
  o.y = y;
  if (chance(s, 0.3)) log(s, o.name + ' was catapulted across the park. Landed fine. Mostly.');
}

// ---------- interactions ----------

const LABELS = {
  chat: (a, b) => 'Chatting with ' + b.name,
  argue: (a, b) => 'Arguing with ' + b.name,
  prank: (a, b, role) => role === 'by' ? 'Pranking ' + b.name : 'Pranked by ' + b.name,
  flirt: (a, b) => 'Flirting with ' + b.name,
  gossip: (a, b, role, about) => 'Gossiping about ' + about,
  pitch: (a, b, role) => role === 'by' ? 'Pitching a scheme to ' + b.name : 'Hearing a pitch from ' + b.name
};

function startInteraction(s, o, t) {
  const r = getRel(o, t);
  const mine = stallOf(s, o);
  let kind = 'chat', about = null;
  const enemies = s.ogonz.filter(x => x !== o && x !== t && getRel(o, x) < 0 && present(x));
  if (r <= -30) kind = 'argue';
  else if (has(o, 'prankster') && chance(s, 0.45)) kind = 'prank';
  else if (mine && (has(o, 'hustler') || chance(s, 0.15)) && stage(t) !== 'child' && chance(s, 0.5)) kind = 'pitch';
  else if (has(o, 'gossip') && enemies.length && chance(s, 0.5)) kind = 'gossip';
  else if (canRomance(o, t) && r >= 40 && (has(o, 'romantic') || r >= 60 || o.partnerId === t.id)) kind = 'flirt';

  if (kind === 'gossip') {
    const victim = pick(s, enemies);
    about = victim.name;
    addRel(o, victim, -6);
    addRel(t, victim, -8);
  }
  if (kind === 'pitch') {
    const sc = SCHEMES[mine.type];
    const sold = t.cash >= sc.price * 2 && chance(s, has(t, 'gullible') ? 0.8 : has(t, 'hustler') ? 0.05 : 0.3);
    if (sold) {
      const amount = sc.price * 2;
      t.cash -= amount;
      o.cash += amount;
      mine.earned += amount;
      if (sc.scam) t.regrets.push({ ownerId: o.id, type: mine.type });
      log(s, o.name + ' talked ' + t.name + ' into investing ' + money(amount) + ' in ' + sc.name.toLowerCase());
    }
  }
  for (const [a, b, role] of [[o, t, 'by'], [t, o, 'to']]) {
    if (a === t) endPlan(s, a);
    a.plan = { label: LABELS[kind](a, b, role, about), withId: b.id, long: true,
      steps: [{ type: 'interact', withId: b.id, kind, role, left: CHAT_MINUTES }] };
  }
  if (kind === 'argue' && pairRel(o, t) <= -70 && (has(o, 'dramatic') || has(t, 'dramatic')) && chance(s, 0.3)) {
    log(s, pick(s, [
      o.name + ' and ' + t.name + ' had a slap fight by the porta-potty',
      o.name + ' threw a hotdog at ' + t.name,
      o.name + ' challenged ' + t.name + ' to a shopping cart joust',
      o.name + ' and ' + t.name + ' screamed at each other across the trailer park'
    ]));
  }
  if (kind === 'prank' && chance(s, 0.25)) {
    log(s, pick(s, [
      o.name + " filled " + t.name + "'s boots with baked beans",
      o.name + " parked a goose in " + t.name + "'s trailer",
      o.name + ' taped a "KICK ME" sign on ' + t.name,
      o.name + " replaced " + t.name + "'s hot sauce with ketchup"
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
    case 'pitch':
      addRel(o, t, (st.role === 'by' ? 0.2 : has(o, 'gullible') ? 0.3 : -0.25) * dt);
      o.needs.fun = clamp(o.needs.fun + 0.3 * dt);
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
