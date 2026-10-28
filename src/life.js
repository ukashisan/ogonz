// Once a day, life happens: everyone ages, residents fall in and out of love,
// couples move in together and have babies, grown children find their own
// place, newcomers fill empty apartments, and elders pass away.

import {
  APARTMENTS, MAX_PER_APARTMENT, TRAITS, NAMES, COLORS, SKINS, HATS, JOBS, SCHOOL,
  YEARS_PER_DAY, SCHOOL_AGE, ADULT_AGE, ELDER_AGE, NEEDS
} from './data.js';
import {
  rand, pick, chance, clamp, byId, room, stage, log, clock, endPlan, pairRel, related, canRomance, relLabel
} from './core.js';

// ---------- residents ----------

export function addResident(s, { age, homeId, parents = [] }) {
  const living = new Set(s.ogonz.map(o => o.name));
  const free = NAMES.filter(n => !living.has(n));
  const name = free.length ? pick(s, free) : pick(s, NAMES) + ' ' + (s.nextId % 10);
  const parent = parents.length ? byId(s.ogonz, parents[0]) : null;
  const traitIds = Object.keys(TRAITS);
  const first = parent && chance(s, 0.5) ? parent.traits[0] : pick(s, traitIds);
  let second = pick(s, traitIds);
  while (second === first) second = pick(s, traitIds);
  const r = room(homeId);
  const o = {
    id: s.nextId++, name, age,
    color: parent && chance(s, 0.5) ? parent.color : pick(s, COLORS),
    skin: parent && chance(s, 0.7) ? parent.skin : pick(s, SKINS),
    hat: pick(s, HATS),
    traits: [first, second],
    parents, partnerId: null, home: homeId,
    floor: r.floor, x: r.l + 60 + rand(s) * (r.r - r.l - 120), facing: 1, ride: null,
    needs: Object.fromEntries(NEEDS.map(n => [n, 60 + rand(s) * 30])),
    plan: null, job: null, out: null, workedDay: clock(s).day, rel: {}, status: {}
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

export const residentsOf = (s, aptId) => s.ogonz.filter(o => o.home === aptId);
const emptyApartments = s => APARTMENTS.filter(a => !residentsOf(s, a).length);

export function moveHome(s, o, aptId) {
  endPlan(s, o);
  o.home = aptId;
}

function leaveBuilding(s, o, text) {
  endPlan(s, o);
  s.ogonz = s.ogonz.filter(x => x !== o);
  for (const other of s.ogonz) {
    if (other.partnerId === o.id) other.partnerId = null;
    if (other.plan && other.plan.steps.some(st => st.targetId === o.id || st.withId === o.id)) endPlan(s, other);
  }
  log(s, text);
}

// A single or a couple moves into an empty apartment.
export function moveIn(s, aptId) {
  const a = addResident(s, { age: 20 + rand(s) * 25, homeId: aptId });
  if (chance(s, 0.45)) {
    const b = addResident(s, { age: Math.max(19, a.age + (rand(s) - 0.5) * 10), homeId: aptId });
    a.partnerId = b.id;
    b.partnerId = a.id;
    a.rel[b.id] = b.rel[a.id] = 80;
    log(s, a.name + ' and ' + b.name + ' moved into ' + room(aptId).name);
    return [a, b];
  }
  log(s, a.name + ' moved into ' + room(aptId).name);
  return [a];
}

// ---------- the daily update ----------

export function dailyLife(s) {
  ageEveryone(s);
  deaths(s);
  romance(s);
  breakups(s);
  babies(s);
  movingOut(s);
  newcomers(s);
  careers(s);
  milestones(s);
}

function ageEveryone(s) {
  for (const o of s.ogonz) {
    const before = stage(o);
    const wasSchoolAge = o.age >= SCHOOL_AGE;
    o.age += YEARS_PER_DAY;
    const now = stage(o);
    if (now === 'child' && !wasSchoolAge && o.age >= SCHOOL_AGE) {
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
}

function deaths(s) {
  for (const o of [...s.ogonz]) {
    if (stage(o) !== 'elder' || !chance(s, Math.max(0, (o.age - ELDER_AGE - 4) / 30))) continue;
    leaveBuilding(s, o, o.name + ' floated off to the great apartment in the sky, aged ' + Math.floor(o.age));
    for (const other of s.ogonz) {
      if ((other.rel[o.id] || 0) > 20) {
        other.needs.fun = clamp(other.needs.fun - 40);
        other.needs.social = clamp(other.needs.social - 20);
      }
    }
  }
}

function romance(s) {
  const adults = s.ogonz.filter(o => stage(o) !== 'child');
  for (const a of adults) {
    for (const b of adults) {
      if (a.id >= b.id || a.partnerId || b.partnerId || !canRomance(a, b)) continue;
      if (pairRel(a, b) < 70 || !chance(s, 0.5)) continue;
      a.partnerId = b.id;
      b.partnerId = a.id;
      log(s, a.name + ' and ' + b.name + ' are in love ♥');
      // Move in together if one of their places has room.
      if (a.home !== b.home) {
        const [stay, go] = residentsOf(s, a.home).length <= residentsOf(s, b.home).length ? [a, b] : [b, a];
        const goers = residentsOf(s, go.home).filter(x => x === go || x.parents.includes(go.id) && stage(x) === 'child');
        if (residentsOf(s, stay.home).length + goers.length <= MAX_PER_APARTMENT) {
          for (const x of goers) moveHome(s, x, stay.home);
          log(s, go.name + ' moved in with ' + stay.name);
        }
      }
    }
  }
}

function breakups(s) {
  for (const a of s.ogonz) {
    const b = byId(s.ogonz, a.partnerId);
    if (!b || a.id > b.id || pairRel(a, b) >= 20 || !chance(s, 0.5)) continue;
    a.partnerId = null;
    b.partnerId = null;
    log(s, a.name + ' and ' + b.name + ' broke up. It was very dramatic.');
    if (a.home === b.home) {
      const free = emptyApartments(s);
      if (free.length) {
        moveHome(s, b, free[0]);
        log(s, b.name + ' moved out to ' + room(free[0]).name);
      } else {
        leaveBuilding(s, b, b.name + ' left the building after the breakup');
      }
    }
  }
}

function babies(s) {
  for (const a of s.ogonz) {
    const b = byId(s.ogonz, a.partnerId);
    if (!b || a.id > b.id || a.home !== b.home || stage(a) !== 'adult' || stage(b) !== 'adult') continue;
    if (a.age > 46 || b.age > 46 || residentsOf(s, a.home).length >= MAX_PER_APARTMENT) continue;
    if (pairRel(a, b) < 60 || !chance(s, 0.25)) continue;
    const baby = addResident(s, { age: 0, homeId: a.home, parents: [a.id, b.id] });
    baby.floor = a.floor;
    baby.x = a.x;
    a.rel[baby.id] = b.rel[baby.id] = 60;
    log(s, a.name + ' and ' + b.name + ' had a baby: ' + baby.name);
  }
}

function movingOut(s) {
  for (const o of [...s.ogonz]) {
    if (stage(o) !== 'adult' || o.age > 34 || o.partnerId) continue;
    if (!residentsOf(s, o.home).some(x => o.parents.includes(x.id))) continue;
    const free = emptyApartments(s);
    if (free.length && chance(s, 0.3)) {
      moveHome(s, o, free[0]);
      log(s, o.name + ' got their own place: ' + room(free[0]).name);
    } else if (!free.length && residentsOf(s, o.home).length >= MAX_PER_APARTMENT && chance(s, 0.12)) {
      leaveBuilding(s, o, o.name + ' moved out of the building to see the world');
    }
  }
}

function newcomers(s) {
  for (const apt of emptyApartments(s)) {
    if (chance(s, s.ogonz.length < 4 ? 0.8 : 0.35)) moveIn(s, apt);
  }
}

const TITLES = ['Senior ', 'Chief ', 'Supreme ', 'Galactic '];
function careers(s) {
  for (const o of s.ogonz) {
    if (stage(o) !== 'adult') continue;
    if (!o.job) {
      if (chance(s, 0.5)) { o.job = jobFor(s, o); log(s, o.name + ' became a ' + o.job.title); }
    } else if (chance(s, 0.03)) {
      const t = TITLES.find(x => !o.job.title.includes(x.trim()));
      if (t) {
        o.job.title = t + o.job.title;
        log(s, o.name + ' was promoted to ' + o.job.title);
      }
    } else if (chance(s, 0.015)) {
      log(s, o.name + ' was fired as ' + o.job.title + ' for ' + pick(s,
        ['napping too hard', 'excessive enthusiasm', 'bringing a goose to work', 'unclear reasons']));
      o.job = null;
      o.needs.fun = clamp(o.needs.fun - 30);
    }
  }
}

// News when a pair becomes something notable.
const NOTABLE = { 'Best friend': 'are now best friends', 'Crush': 'have a crush on each other',
  'Enemy': 'are now enemies', 'Nemesis': 'are now sworn nemeses' };
function milestones(s) {
  s.pairs = s.pairs || {};
  for (const a of s.ogonz) {
    for (const b of s.ogonz) {
      if (a.id >= b.id || related(a, b)) continue;
      const label = relLabel(s, a, b);
      const key = a.id + '-' + b.id;
      if (s.pairs[key] !== label && NOTABLE[label]) log(s, a.name + ' and ' + b.name + ' ' + NOTABLE[label]);
      s.pairs[key] = label;
    }
  }
}
