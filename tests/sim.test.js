import test from 'node:test';
import assert from 'node:assert/strict';
import * as sim from '../src/sim.js';
import { ROOMS, APARTMENTS, EXIT_X, MAX_PER_APARTMENT, CATALOG } from '../src/data.js';

const fresh = (seed = 42) => sim.newGame(seed);
const setAll = (o, v) => { for (const n in o.needs) o.needs[n] = v; };
const calm = o => { o.job = null; setAll(o, 95); };
// Leave only the given residents in the building, with no jobs.
function only(s, ...people) {
  s.ogonz = people;
  for (const o of people) { calm(o); o.rel = {}; o.partnerId = null; o.parents = []; o.out = null; o.plan = null; }
  s.events = [];
  s.rng = 1;
}
const hours = (s, h) => sim.step(s, h * 60);

test('new game: four households in a six-apartment building', () => {
  const s = fresh();
  assert.equal(ROOMS.length, 8);
  const occupied = APARTMENTS.filter(a => sim.residentsOf(s, a).length);
  assert.equal(occupied.length, 4);
  assert.ok(sim.residentsOf(s, '3B').some(o => o.parents.length), 'a family with a kid in 3B');
  for (const o of s.ogonz) {
    assert.equal(o.traits.length, 2);
    assert.notEqual(o.traits[0], o.traits[1]);
  }
  for (const r of ROOMS) assert.ok(s.objects.some(x => x.room === r.id), r.id + ' has furniture');
});

test('hungry resident finds food', () => {
  const s = fresh();
  const o = s.ogonz[0];
  only(s, o);
  o.needs.hunger = 10;
  hours(s, 1.5);
  assert.ok(o.needs.hunger > 70, 'hunger ' + o.needs.hunger);
});

test('residents sleep in their own bed and only use their own or shared things', () => {
  const s = fresh();
  for (const o of s.ogonz) o.needs.energy = 10;
  let slept = 0;
  for (let i = 0; i < 24 * 60; i++) {
    sim.step(s, 1);
    for (const obj of s.objects) {
      if (!obj.user) continue;
      const u = sim.byId(s.ogonz, obj.user);
      assert.ok(sim.room(obj.room).common || obj.room === u.home, u.name + ' used ' + obj.type + ' in ' + obj.room);
      if (CATALOG[obj.type].sleep) slept++;
    }
  }
  assert.ok(slept > 0);
});

test('the elevator takes residents between floors', () => {
  const s = fresh();
  const o = s.ogonz.find(x => sim.room(x.home).floor === 3) || s.ogonz[0];
  only(s, o);
  o.floor = 3;
  o.needs.hunger = 5;
  s.objects = s.objects.filter(x => x.type !== 'fridge');   // must go down to the café
  hours(s, 1);
  assert.equal(o.floor, 0);
  assert.ok(o.needs.hunger > 40);
});

test('residents go to work on weekdays and come back', () => {
  const s = fresh();
  const o = s.ogonz[0];
  only(s, o);
  o.job = { title: 'Test', start: 9, end: 17 };
  o.workedDay = -1;
  hours(s, 2);
  assert.equal(o.out && o.out.reason, 'work', 'doing ' + sim.activityLabel(s, o));
  hours(s, 8.01);
  assert.equal(o.out, null);
  assert.equal(o.floor, 0);
  assert.ok(o.x < EXIT_X + 100, 'walks in from the bus stop, x=' + o.x);
});

test('no work on weekends', () => {
  const s = fresh();
  const o = s.ogonz[0];
  only(s, o);
  o.job = { title: 'Test', start: 9, end: 17 };
  s.minutes = 5 * 1440 + 8 * 60;
  s.lastDay = 5;
  s.lastHour = 5 * 24 + 8;
  hours(s, 2);
  assert.equal(o.out, null);
});

test('a full bladder causes an accident', () => {
  const s = fresh();
  const o = s.ogonz[0];
  only(s, o);
  s.objects = s.objects.filter(x => x.type !== 'toilet');
  o.needs.bladder = 0.1;
  sim.step(s, 1);
  assert.equal(o.needs.hygiene, 0);
  assert.ok(s.log.some(l => l.text.includes('accident')));
});

function meet(traitsA, traitsB) {
  const s = fresh();
  const [a, b] = s.ogonz;
  only(s, a, b);
  a.traits = traitsA;
  b.traits = traitsB;
  a.needs.social = b.needs.social = 5;
  a.floor = b.floor = 0;
  a.x = 300; b.x = 330;
  hours(s, 2);
  return [s, a, b];
}

test('personalities clash or click', () => {
  const [, a1, b1] = meet(['grumpy', 'shy'], ['cheerful', 'party']);
  const [, a2, b2] = meet(['party', 'cheerful'], ['party', 'cheerful']);
  assert.ok(sim.compat(a1, b1) < 0 && sim.compat(a2, b2) > 0);
  assert.ok(sim.pairRel(a1, b1) < sim.pairRel(a2, b2), sim.pairRel(a1, b1) + ' vs ' + sim.pairRel(a2, b2));
  assert.ok(sim.pairRel(a2, b2) > 10);
});

test('enemies argue, and pranksters prank', () => {
  const s = fresh();
  const [a, b] = s.ogonz;
  only(s, a, b);
  a.traits = ['grumpy', 'dramatic'];
  b.traits = ['shy', 'sleepy'];
  a.rel[b.id] = b.rel[a.id] = -50;
  a.needs.social = 5;
  a.floor = b.floor = 0; a.x = 300; b.x = 320;
  let kinds = new Set();
  for (let i = 0; i < 120; i++) {
    sim.step(s, 1);
    const st = a.plan && a.plan.steps[0];
    if (st && st.type === 'interact') kinds.add(st.kind);
  }
  assert.ok(kinds.has('argue'), [...kinds].join());
  assert.ok(sim.pairRel(a, b) < -50);
  assert.ok(['Enemy', 'Nemesis'].includes(sim.relLabel(s, a, b)));
});

test('relationships span hostile to in love', () => {
  const s = fresh();
  const [a, b] = s.ogonz;
  only(s, a, b);
  const labels = new Set();
  for (const v of [-90, -50, -20, 0, 20, 45, 65]) {
    a.rel[b.id] = b.rel[a.id] = v;
    labels.add(sim.relLabel(s, a, b));
  }
  a.rel[b.id] = b.rel[a.id] = 80;
  labels.add(sim.relLabel(s, a, b));
  a.partnerId = b.id; b.partnerId = a.id;
  labels.add(sim.relLabel(s, a, b));
  assert.deepEqual([...labels], ['Nemesis', 'Enemy', 'Rival', 'Stranger', 'Acquaintance', 'Friend', 'Best friend', 'Crush', 'In love']);
});

test('crushes become couples who move in together, have babies, and can break up', () => {
  const s = fresh(5);
  const a = sim.residentsOf(s, '2B')[0], b = sim.residentsOf(s, '3A')[0];
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

test('empty apartments fill up and none overflows', () => {
  const s = fresh(9);
  for (let d = 0; d < 60; d++) {
    hours(s, 24);
    for (const apt of APARTMENTS) assert.ok(sim.residentsOf(s, apt).length <= MAX_PER_APARTMENT, apt + ' overflowing');
  }
  assert.ok(APARTMENTS.filter(a => sim.residentsOf(s, a).length).length >= 4);
});

test('every silly event starts and ends cleanly', () => {
  for (const type of Object.keys(sim.EVENTS)) {
    const s = fresh(3);
    s.minutes = 18 * 60;          // evening: everyone home
    s.lastHour = 18;
    for (const o of s.ogonz) { o.out = null; o.job = null; }
    s.eventRate = 0;              // no other random events during the test
    const looks = s.ogonz.map(o => o.id + o.color + o.hat);
    assert.ok(sim.EVENTS[type](s), type + ' did not start');
    hours(s, 26);
    assert.ok(!s.events.some(e => e.type === type && e.until < s.minutes), type + ' never ended');
    if (type === 'swap') {
      assert.deepEqual(s.ogonz.slice(0, looks.length).map(o => o.id + o.color + o.hat), looks, 'looks swapped back');
    }
  }
});

test('alien abductees come back', () => {
  const s = fresh(3);
  s.minutes = 18 * 60;
  s.lastHour = 18;
  for (const o of s.ogonz) { o.out = null; o.job = null; }
  sim.EVENTS.ufo(s);
  const gone = s.ogonz.find(o => o.out && o.out.reason === 'space');
  assert.ok(gone);
  assert.equal(sim.activityLabel(s, gone), 'In outer space');
  hours(s, 6);
  assert.equal(gone.out, null);
});

test('save and load round-trip, old saves rejected', () => {
  const s = fresh();
  hours(s, 30);
  assert.deepEqual(sim.deserialize(sim.serialize(s)), s);
  assert.throws(() => sim.deserialize('{"version":2,"ogonz":[],"objects":[]}'));
});

test('a long run stays sane across generations', () => {
  for (const seed of [1, 2, 3]) {
    const s = fresh(seed);
    for (let d = 0; d < 150; d++) {
      hours(s, 24);
      for (const apt of APARTMENTS) assert.ok(sim.residentsOf(s, apt).length <= MAX_PER_APARTMENT);
      for (const o of s.ogonz) {
        for (const v of Object.values(o.needs)) assert.ok(v >= 0 && v <= 100 && !Number.isNaN(v));
        assert.ok(o.floor >= 0 && o.floor <= 3);
        assert.ok(APARTMENTS.includes(o.home));
        if (o.partnerId) assert.equal(sim.byId(s.ogonz, o.partnerId).partnerId, o.id, 'partners match');
      }
      for (const obj of s.objects) if (obj.user) assert.ok(sim.byId(s.ogonz, obj.user), 'object used by a ghost');
    }
    assert.ok(s.ogonz.length >= 2, 'seed ' + seed + ': building empty');
  }
});
