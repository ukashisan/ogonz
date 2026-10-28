// Once a day, life happens: everyone ages, residents fall in and out of love,
// couples move in together and have babies, grown kids get their own trailer,
// newcomers fill empty trailers, schemes boom and bust, scam victims wise up,
// and elders pass away.

import {
  TRAILER, MAX_PER_TRAILER, PARK, TRAITS, SCHEMES, NAMES, SHIRTS, SKINS, HAIRS, HATS, OUTFITS,
  YEARS_PER_DAY, SCHOOL_AGE, ELDER_AGE, NEEDS
} from './data.js';
import {
  rand, pick, chance, clamp, byId, stage, log, clock, endPlan, pairRel, canRomance, relLabel, related,
  addRel, has, money, stallOf, doorOf
} from './core.js';

// ---------- residents ----------

export const residentsOf = (s, trailerId) => s.ogonz.filter(o => o.home === trailerId);
export const emptyTrailers = s => s.trailers.filter(t => !residentsOf(s, t.id).length);

export function addResident(s, { age, homeId, parents = [] }) {
  const living = new Set(s.ogonz.map(o => o.name));
  const free = NAMES.filter(n => !living.has(n));
  const name = free.length ? pick(s, free) : pick(s, NAMES) + ' Jr';
  const parent = parents.length ? byId(s.ogonz, parents[0]) : null;
  const traitIds = Object.keys(TRAITS);
  const first = parent && chance(s, 0.5) ? parent.traits[0] : pick(s, traitIds);
  let second = pick(s, traitIds);
  while (second === first) second = pick(s, traitIds);
  const t = byId(s.trailers, homeId);
  const d = doorOf(t);
  const o = {
    id: s.nextId++, name, age,
    shirt: pick(s, SHIRTS),
    skin: parent && chance(s, 0.7) ? parent.skin : pick(s, SKINS),
    hair: parent && chance(s, 0.6) ? parent.hair : pick(s, HAIRS),
    hat: pick(s, HATS),
    outfit: pick(s, OUTFITS),
    traits: [first, second],
    parents, partnerId: null, home: homeId,
    x: d.x + (rand(s) - 0.5) * 20, y: d.y + 6 + rand(s) * 8, facing: 1, inside: null,
    needs: Object.fromEntries(NEEDS.map(n => [n, 60 + rand(s) * 30])),
    plan: null, out: null, workedDay: clock(s).day, rel: {}, status: {},
    cash: age < 18 ? 5 : Math.round(80 + rand(s) * 300), regrets: []
  };
  if (o.traits.includes('conspiracy')) o.hat = 'tinfoil';
  for (const p of parents) o.rel[p] = 60;
  s.ogonz.push(o);
  if (stage(o) !== 'child') openScheme(s, o);
  return o;
}

// ---------- schemes ----------

// Stall spots around a trailer: right side, in front, left side.
function stallSpots(t) {
  return [
    { x: t.x + TRAILER.w / 2 + 22, y: t.y + 2 },
    { x: t.x - 4, y: t.y + 32 },
    { x: t.x - TRAILER.w / 2 - 22, y: t.y + 2 }
  ].map(p => ({ x: Math.max(PARK.left + 16, Math.min(PARK.right - 16, p.x)), y: Math.min(PARK.bottom, p.y) }));
}

export function openScheme(s, o, type) {
  closeScheme(s, o);
  const t = byId(s.trailers, o.home);
  const taken = new Set(s.stalls.map(st => st.type));
  const options = Object.keys(SCHEMES).filter(k => !taken.has(k));
  type = type || pick(s, options.length ? options : Object.keys(SCHEMES));
  const used = s.stalls.filter(st => st.trailerId === t.id);
  const spot = stallSpots(t).find(p => !used.some(u => Math.hypot(u.x - p.x, u.y - p.y) < 4)) || stallSpots(t)[1];
  const stall = { id: s.nextId++, type, ownerId: o.id, trailerId: t.id, x: spot.x, y: spot.y,
    hype: 0.6 + rand(s) * 0.8, earned: 0 };
  s.stalls.push(stall);
  return stall;
}

function closeScheme(s, o) {
  s.stalls = s.stalls.filter(st => st.ownerId !== o.id);
}

// ---------- moving ----------

export function moveHome(s, o, trailerId) {
  endPlan(s, o);
  o.home = trailerId;
  if (stallOf(s, o)) openScheme(s, o, stallOf(s, o).type);
}

function leavePark(s, o, text) {
  endPlan(s, o);
  closeScheme(s, o);
  s.ogonz = s.ogonz.filter(x => x !== o);
  for (const other of s.ogonz) {
    if (other.partnerId === o.id) other.partnerId = null;
    if (other.plan && other.plan.steps.some(st => st.targetId === o.id || st.withId === o.id)) endPlan(s, other);
    other.regrets = other.regrets.filter(r => r.ownerId !== o.id);
  }
  log(s, text);
}

// A single or a couple moves into an empty trailer.
export function moveIn(s, trailerId) {
  const a = addResident(s, { age: 20 + rand(s) * 25, homeId: trailerId });
  if (chance(s, 0.45)) {
    const b = addResident(s, { age: Math.max(19, a.age + (rand(s) - 0.5) * 10), homeId: trailerId });
    a.partnerId = b.id;
    b.partnerId = a.id;
    a.rel[b.id] = b.rel[a.id] = 80;
    log(s, a.name + ' and ' + b.name + ' pulled in with a trailer and big dreams');
    return [a, b];
  }
  log(s, a.name + ' moved into a trailer and started ' + SCHEMES[stallOf(s, a).type].name.toLowerCase());
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
  schemeFates(s);
  regrets(s);
  milestones(s);
}

function ageEveryone(s) {
  for (const o of s.ogonz) {
    const before = stage(o);
    const wasSchoolAge = o.age >= SCHOOL_AGE;
    o.age += YEARS_PER_DAY;
    const now = stage(o);
    if (now === 'child' && !wasSchoolAge && o.age >= SCHOOL_AGE) {
      log(s, o.name + ' started school');
    } else if (before === 'child' && now === 'adult') {
      const st = openScheme(s, o);
      o.cash += 50;
      log(s, o.name + ' grew up and immediately started ' + SCHEMES[st.type].name.toLowerCase());
    } else if (before === 'adult' && now === 'elder') {
      log(s, o.name + ' retired, but is still running ' + SCHEMES[stallOf(s, o).type].name.toLowerCase());
    }
  }
}

function deaths(s) {
  for (const o of [...s.ogonz]) {
    if (stage(o) !== 'elder' || !chance(s, Math.max(0, (o.age - ELDER_AGE - 4) / 30))) continue;
    const heir = s.ogonz.find(x => x !== o && (x.partnerId === o.id || x.parents.includes(o.id)));
    if (heir) heir.cash += o.cash;
    leavePark(s, o, o.name + ' rode off to the big trailer park in the sky, aged ' + Math.floor(o.age) +
      (heir ? '. ' + heir.name + ' inherited ' + money(o.cash) : ''));
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
      if (a.home !== b.home) {
        const [stay, go] = residentsOf(s, a.home).length <= residentsOf(s, b.home).length ? [a, b] : [b, a];
        const goers = residentsOf(s, go.home).filter(x => x === go || (x.parents.includes(go.id) && stage(x) === 'child'));
        if (residentsOf(s, stay.home).length + goers.length <= MAX_PER_TRAILER) {
          for (const x of goers) moveHome(s, x, stay.home);
          log(s, go.name + ' moved into ' + stay.name + "'s trailer");
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
    log(s, a.name + ' and ' + b.name + ' broke up. ' + pick(s,
      ['Someone threw a lawn flamingo.', 'The whole park heard it.', 'It involved a megaphone.']));
    if (a.home === b.home) {
      const free = emptyTrailers(s);
      if (free.length) {
        moveHome(s, b, free[0].id);
        log(s, b.name + ' dragged their stuff to an empty trailer');
      } else {
        leavePark(s, b, b.name + ' left the park after the breakup');
      }
    }
  }
}

function babies(s) {
  for (const a of s.ogonz) {
    const b = byId(s.ogonz, a.partnerId);
    if (!b || a.id > b.id || a.home !== b.home || stage(a) !== 'adult' || stage(b) !== 'adult') continue;
    if (a.age > 46 || b.age > 46 || residentsOf(s, a.home).length >= MAX_PER_TRAILER) continue;
    if (pairRel(a, b) < 60 || !chance(s, 0.25)) continue;
    const baby = addResident(s, { age: 0, homeId: a.home, parents: [a.id, b.id] });
    a.rel[baby.id] = b.rel[baby.id] = 60;
    log(s, a.name + ' and ' + b.name + ' had a baby: ' + baby.name);
  }
}

function movingOut(s) {
  for (const o of [...s.ogonz]) {
    if (stage(o) !== 'adult' || o.age > 34 || o.partnerId) continue;
    if (!residentsOf(s, o.home).some(x => o.parents.includes(x.id))) continue;
    const free = emptyTrailers(s);
    if (free.length && chance(s, 0.3)) {
      moveHome(s, o, free[0].id);
      log(s, o.name + ' got their own trailer');
    } else if (!free.length && residentsOf(s, o.home).length >= MAX_PER_TRAILER && chance(s, 0.12)) {
      leavePark(s, o, o.name + ' left to chase their dreams in the city');
    }
  }
}

function newcomers(s) {
  for (const t of emptyTrailers(s)) {
    if (chance(s, s.ogonz.length < 5 ? 0.8 : 0.35)) moveIn(s, t.id);
  }
}

const BOOMS = {
  crypto: 'mined a coin worth', oil: 'struck oil! Sort of. Made', alien: 'sold a jar to a collector for',
  pyramid: 'recruited a whole bus tour for', nft: 'sold a rock to a celebrity for', robot: 'got funding:',
  air: 'sold a jar of "mountain air" for', fish: 'caught a fish worth', worms: 'won a worm contest:',
  tonic: 'regrew one (1) hair. Sales:', lemonade: 'had a heatwave rush:', tanning: 'tanned a tour group for',
  casino: 'hit the jackpot:'
};
const BUSTS = {
  crypto: 'crypto mine crashed (the bathtub flooded)', oil: 'oil well hit a water pipe', alien: 'alien urine got recalled',
  pyramid: 'pyramid collapsed', nft: 'rocks were stolen by raccoons', robot: 'robot ran away', air: 'air leaked',
  fish: 'fish farm dried up', worms: 'worms unionized', tonic: 'hair tonic turned customers green',
  lemonade: 'lemonade was found to be mostly sand', tanning: 'tanning bed (a car hood) got towed', casino: 'cart casino lost its carts'
};

function schemeFates(s) {
  for (const stall of [...s.stalls]) {
    const o = byId(s.ogonz, stall.ownerId);
    if (!o) continue;
    const r = rand(s);
    if (r < 0.03) {
      const gain = Math.round(200 + rand(s) * 800);
      o.cash += gain;
      stall.hype = Math.min(3, stall.hype + 0.5);
      log(s, o.name + ' ' + BOOMS[stall.type] + ' ' + money(gain) + '!');
    } else if (r < 0.06) {
      const loss = Math.round(o.cash * (0.3 + rand(s) * 0.4));
      o.cash -= loss;
      stall.hype = Math.max(0.3, stall.hype - 0.4);
      o.needs.fun = clamp(o.needs.fun - 30);
      log(s, o.name + "'s " + BUSTS[stall.type] + (loss ? ' (lost ' + money(loss) + ')' : ''));
    } else if (stall.earned < 20 && chance(s, 0.08)) {
      const old = SCHEMES[stall.type].name.toLowerCase();
      const next = openScheme(s, o);
      log(s, o.name + ' gave up on ' + old + ' and pivoted to ' + SCHEMES[next.type].name.toLowerCase());
      continue;
    }
    stall.earned *= 0.5;      // earnings memory fades
  }
}

const REALIZE = {
  crypto: 'that their crypto was a picture of a coin', pyramid: 'that they are at the bottom of the pyramid',
  alien: 'that the alien urine was apple juice', air: 'that the air was just air', nft: 'that they own a regular rock',
  tonic: 'that the hair tonic was maple syrup', robot: 'that the robot was a cardboard box'
};
function regrets(s) {
  for (const o of s.ogonz) {
    o.regrets = o.regrets.filter(r => {
      if (!chance(s, has(o, 'gullible') ? 0.1 : 0.3)) return true;
      const seller = byId(s.ogonz, r.ownerId);
      if (seller) {
        addRel(o, seller, -25);
        if (chance(s, 0.5)) log(s, o.name + ' realized ' + (REALIZE[r.type] || 'they got scammed') + '. Furious at ' + seller.name + '.');
      }
      return false;
    });
  }
}

// News when a pair becomes something notable.
const NOTABLE = { 'Best friend': 'are now best friends', 'Crush': 'have a crush on each other',
  'Enemy': 'are now enemies', 'Nemesis': 'are now sworn nemeses' };
function milestones(s) {
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
