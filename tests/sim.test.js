import test from 'node:test';
import assert from 'node:assert/strict';
import * as sim from '../src/sim.js';
import { MAX_PER_TRAILER, SCHEMES } from '../src/data.js';

const fresh = (seed = 42) => sim.newGame(seed);
const setAll = (o, v) => { for (const n in o.needs) o.needs[n] = v; };
// Leave only the given residents in the park, calm and with no ties.
function only(s, ...people) {
  s.ogonz = people;
  s.stalls = s.stalls.filter(st => people.some(o => o.id === st.ownerId));
  for (const o of people) { setAll(o, 95); o.rel = {}; o.partnerId = null; o.parents = []; o.out = null; o.plan = null; o.inside = null; o.regrets = []; }
  s.events = [];
  s.eventRate = 0;
  s.rng = 1;
}
const hours = (s, h) => sim.step(s, h * 60);
const evening = s => { s.minutes = 19 * 60; s.lastHour = 19; };

test('new game: a park of trailers, residents with schemes, and amenities', () => {
  const s = fresh();
  assert.equal(s.trailers.length, 12);
  assert.equal(s.trailers.filter(t => sim.residentsOf(s, t.id).length).length, 7);
  assert.ok(s.ogonz.some(o => sim.stage(o) === 'child'));
  for (const o of s.ogonz) {
    assert.equal(o.traits.length, 2);
    if (sim.stage(o) !== 'child') assert.ok(sim.stallOf(s, o), o.name + ' has a scheme');
  }
  for (const type of ['bbq', 'hottub', 'potty', 'track', 'laundry']) assert.ok(s.amenities.some(a => a.type === type));
});

test('hungry resident finds food', () => {
  const s = fresh();
  const o = s.ogonz[0];
  only(s, o);
  evening(s);
  o.needs.hunger = 10;
  hours(s, 1.5);
  assert.ok(o.needs.hunger > 70, 'hunger ' + o.needs.hunger);
});

test('tired residents go home and sleep inside their own trailer', () => {
  const s = fresh();
  const o = s.ogonz[0];
  only(s, o);
  s.minutes = 22 * 60; s.lastHour = 22;
  o.needs.energy = 10;
  let slept = false;
  for (let i = 0; i < 180 && !slept; i++) {
    sim.step(s, 1);
    slept = sim.isSleeping(s, o);
  }
  assert.ok(slept, 'doing ' + sim.activityLabel(s, o));
  assert.equal(o.inside, o.home);
});

test('kids go to school on weekdays and come back', () => {
  const s = fresh();
  const kid = s.ogonz.find(o => sim.stage(o) === 'child');
  only(s, kid);
  kid.age = 9;
  kid.workedDay = -1;
  hours(s, 2);
  assert.equal(kid.out && kid.out.reason, 'school', 'doing ' + sim.activityLabel(s, kid));
  hours(s, 6.1);
  assert.equal(kid.out, null);
});

test('a full bladder causes an accident', () => {
  const s = fresh();
  const o = s.ogonz[0];
  only(s, o);
  o.needs.bladder = 0.01;
  sim.step(s, 0.25);
  assert.equal(o.needs.hygiene, 0);
  assert.ok(s.log.some(l => l.text.includes('accident')));
});

test('owners run their schemes and neighbours pay them', () => {
  const s = fresh();
  const [seller, buyer] = s.ogonz.filter(o => sim.stage(o) !== 'child');
  only(s, seller, buyer);
  s.minutes = 10 * 60; s.lastHour = 10;
  const stall = sim.stallOf(s, seller);
  stall.type = 'lemonade';
  seller.traits = ['hustler', 'cheerful'];
  buyer.traits = ['gullible', 'cheerful'];
  sim.stallOf(s, buyer).type = 'worms';
  buyer.cash = 500;
  buyer.needs.hunger = 30;
  const before = seller.cash;
  let tended = false;
  for (let i = 0; i < 240; i++) { sim.step(s, 1); tended = tended || sim.isTending(seller, stall); }
  assert.ok(tended, 'seller never opened');
  assert.ok(seller.cash > before, 'seller earned nothing');
});

test('scam victims eventually wise up', () => {
  const s = fresh();
  const [seller, buyer] = s.ogonz.filter(o => sim.stage(o) !== 'child');
  only(s, seller, buyer);
  buyer.traits = ['grumpy', 'dramatic'];
  buyer.rel[seller.id] = 20;
  buyer.regrets = [{ ownerId: seller.id, type: 'alien' }];
  hours(s, 24 * 6);
  assert.ok(buyer.regrets.length === 0);
  assert.ok(sim.getRel(buyer, seller) < 20);
});

function meet(traitsA, traitsB) {
  const s = fresh();
  const [a, b] = s.ogonz;
  only(s, a, b);
  evening(s);
  s.stalls = [];
  a.traits = traitsA;
  b.traits = traitsB;
  a.needs.social = b.needs.social = 5;
  a.x = 300; a.y = 220; b.x = 312; b.y = 220;
  hours(s, 2);
  return [s, a, b];
}

test('personalities clash or click', () => {
  const [, a1, b1] = meet(['grumpy', 'sleepy'], ['cheerful', 'party']);
  const [, a2, b2] = meet(['party', 'cheerful'], ['party', 'cheerful']);
  assert.ok(sim.compat(a1, b1) < 0 && sim.compat(a2, b2) > 0);
  assert.ok(sim.pairRel(a1, b1) < sim.pairRel(a2, b2), sim.pairRel(a1, b1) + ' vs ' + sim.pairRel(a2, b2));
  assert.ok(sim.pairRel(a2, b2) > 10);
});

test('enemies argue', () => {
  const s = fresh();
  const [a, b] = s.ogonz;
  only(s, a, b);
  evening(s);
  s.stalls = [];
  a.traits = ['grumpy', 'dramatic'];
  b.traits = ['sleepy', 'gullible'];
  a.rel[b.id] = b.rel[a.id] = -50;
  a.needs.social = 5;
  a.x = 300; a.y = 220; b.x = 310; b.y = 220;
  const kinds = new Set();
  for (let i = 0; i < 120; i++) {
    sim.step(s, 1);
    const st = a.plan && a.plan.steps[0];
    if (st && st.type === 'interact') kinds.add(st.kind);
  }
  assert.ok(kinds.has('argue'), [...kinds].join());
  assert.ok(['Enemy', 'Nemesis'].includes(sim.relLabel(s, a, b)));
});

test('relationships span hostile to in love', () => {
  const s = fresh();
  const [a, b] = s.ogonz;
  only(s, a, b);
  const labels = [];
  for (const v of [-90, -50, -20, 0, 20, 45, 65, 80]) {
    a.rel[b.id] = b.rel[a.id] = v;
    labels.push(sim.relLabel(s, a, b));
  }
  a.partnerId = b.id; b.partnerId = a.id;
  labels.push(sim.relLabel(s, a, b));
  assert.deepEqual(labels, ['Nemesis', 'Enemy', 'Rival', 'Stranger', 'Acquaintance', 'Friend', 'Best friend', 'Crush', 'In love']);
});

test('crushes become couples who move in together, have babies, and can break up', () => {
  const s = fresh(5);
  const homes = s.trailers.filter(t => sim.residentsOf(s, t.id).length);
  const a = sim.residentsOf(s, homes[0].id)[0], b = sim.residentsOf(s, homes[1].id)[0];
  only(s, a, b);
  a.age = b.age = 28;
  a.traits = b.traits = ['romantic', 'cheerful'];
  a.rel[b.id] = b.rel[a.id] = 90;
  hours(s, 24 * 3);
  assert.equal(a.partnerId, b.id);
  assert.equal(a.home, b.home, 'moved in together');
  hours(s, 24 * 20);
  assert.ok(s.ogonz.some(o => o.parents.includes(a.id)), 'a baby');
  a.rel[b.id] = b.rel[a.id] = -40;
  hours(s, 24 * 4);
  assert.equal(a.partnerId, null);
  assert.ok(s.log.some(l => l.text.includes('broke up')));
});

test('empty trailers fill up and none overflows', () => {
  const s = fresh(9);
  for (let d = 0; d < 40; d++) {
    hours(s, 24);
    for (const t of s.trailers) assert.ok(sim.residentsOf(s, t.id).length <= MAX_PER_TRAILER);
  }
  assert.ok(s.trailers.filter(t => sim.residentsOf(s, t.id).length).length >= 8);
});

test('every silly event starts and ends cleanly', () => {
  for (const type of Object.keys(sim.EVENTS)) {
    const s = fresh(3);
    evening(s);
    s.eventRate = 0;
    for (const o of s.ogonz) { o.out = null; o.inside = null; }
    if (type === 'gusher') sim.stallOf(s, s.ogonz.find(o => sim.stallOf(s, o))).type = 'oil';
    const looks = s.ogonz.map(o => o.id + o.shirt + o.hat);
    assert.ok(sim.EVENTS[type](s), type + ' did not start');
    hours(s, 26);
    assert.ok(!s.events.some(e => e.type === type && e.until < s.minutes), type + ' never ended');
    if (type === 'swap') assert.deepEqual(s.ogonz.slice(0, looks.length).map(o => o.id + o.shirt + o.hat), looks);
  }
});

test('the seminar takes attendees\' money', () => {
  const s = fresh(3);
  s.minutes = 18 * 60; s.lastHour = 18;
  s.eventRate = 0;
  for (const o of s.ogonz) { o.out = null; o.inside = null; o.plan = null; o.cash = 300; }
  s.ogonz[0].traits = ['hustler', 'cheerful'];
  const total = s.ogonz.reduce((t, o) => t + o.cash, 0);
  assert.ok(sim.EVENTS.seminar(s));
  hours(s, 2);
  const host = s.ogonz[0];
  assert.ok(host.cash > 300, 'host got rich');
  assert.ok(Math.abs(s.ogonz.reduce((t, o) => t + o.cash, 0) - total) < 400, 'money moved, mostly');
  assert.ok(s.log.some(l => l.text.includes('seminar made')));
});

test('alien abductees come back', () => {
  const s = fresh(3);
  evening(s);
  s.eventRate = 0;
  for (const o of s.ogonz) { o.out = null; o.inside = null; }
  sim.EVENTS.ufo(s);
  const gone = s.ogonz.find(o => o.out && o.out.reason === 'space');
  assert.equal(sim.activityLabel(s, gone), 'In outer space');
  hours(s, 6);
  assert.equal(gone.out, null);
});

test('save and load round-trip, old saves rejected', () => {
  const s = fresh();
  hours(s, 30);
  assert.deepEqual(sim.deserialize(sim.serialize(s)), s);
  assert.throws(() => sim.deserialize('{"version":3,"ogonz":[],"objects":[]}'));
});

test('a long run stays sane across generations', () => {
  for (const seed of [1, 2, 3]) {
    const s = fresh(seed);
    for (let d = 0; d < 120; d++) {
      hours(s, 24);
      for (const t of s.trailers) assert.ok(sim.residentsOf(s, t.id).length <= MAX_PER_TRAILER);
      for (const o of s.ogonz) {
        for (const v of Object.values(o.needs)) assert.ok(v >= 0 && v <= 100 && !Number.isNaN(v));
        assert.ok(Number.isFinite(o.cash) && o.cash >= -0.001, o.name + ' cash ' + o.cash);
        assert.ok(o.x >= 0 && o.x <= 640 && o.y >= 0 && o.y <= 360, o.name + ' off the map');
        assert.ok(s.trailers.some(t => t.id === o.home));
        if (o.partnerId) assert.equal(sim.byId(s.ogonz, o.partnerId).partnerId, o.id, 'partners match');
      }
      for (const st of s.stalls) assert.ok(sim.byId(s.ogonz, st.ownerId), 'orphan stall');
      for (const a of s.amenities) assert.ok(a.users.length <= a.slots && a.users.every(id => sim.byId(s.ogonz, id)));
    }
    assert.ok(s.ogonz.length >= 4, 'seed ' + seed + ': park empty');
    assert.ok(s.ogonz.every(o => SCHEMES[sim.stallOf(s, o)?.type] || sim.stage(o) === 'child'));
  }
});
