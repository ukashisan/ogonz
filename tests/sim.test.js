import test from 'node:test';
import assert from 'node:assert/strict';
import * as sim from '../src/sim.js';
import { EXIT_X, CATALOG } from '../src/data.js';

const fresh = (seed = 42) => sim.newGame(seed);
const setAll = (o, v) => { for (const n in o.needs) o.needs[n] = v; };
const objOf = (s, type) => s.objects.find(o => o.type === type);
const noJob = o => { o.job = null; };

test('new game: a couple moves into a furnished house', () => {
  const s = fresh();
  assert.equal(s.ogonz.length, 2);
  const [a, b] = s.ogonz;
  assert.equal(a.partnerId, b.id);
  assert.equal(b.partnerId, a.id);
  assert.ok(s.ogonz.every(o => sim.stage(o) === 'adult' && o.job && o.job.pay > 0));
  for (const t of ['fridge', 'bed', 'toilet', 'shower']) assert.ok(objOf(s, t), t);
});

test('hungry Ogon walks to the fridge and eats', () => {
  const s = fresh();
  s.ogonz.length = 1;
  const o = s.ogonz[0];
  noJob(o);
  setAll(o, 95);
  o.needs.hunger = 10;
  sim.step(s, 60);
  assert.ok(o.needs.hunger > 80, 'hunger ' + o.needs.hunger);
});

test('tired Ogon climbs the stairs to a bed and sleeps', () => {
  const s = fresh();
  s.ogonz.length = 1;
  const o = s.ogonz[0];
  noJob(o);
  setAll(o, 95);
  o.needs.energy = 15;
  let slept = false;
  for (let i = 0; i < 120 && !slept; i++) {
    sim.step(s, 1);
    slept = sim.isSleeping(s, o);
  }
  assert.ok(slept, 'never slept; doing ' + sim.activityLabel(o));
  assert.equal(o.floor, 1);
});

test('lonely Ogonz chat on their own and grow closer', () => {
  const s = fresh();
  const [a, b] = s.ogonz;
  for (const o of s.ogonz) { noJob(o); setAll(o, 95); o.needs.social = 5; o.rel = {}; }
  sim.step(s, 60);
  assert.ok((a.rel[b.id] || 0) > 0 && (b.rel[a.id] || 0) > 0, JSON.stringify([a.rel, b.rel]));
  assert.ok(a.needs.social > 30);
});

test('Ogon goes to work on a weekday and is paid on return', () => {
  const s = fresh();
  s.ogonz.length = 1;
  const o = s.ogonz[0];
  o.job = { title: 'Test', start: 9, end: 17, pay: 300 };
  o.workedDay = -1;                    // newcomers skip their moving-in day
  const money = s.money;
  sim.step(s, 9 * 60 - 7 * 60);
  assert.ok(o.away, 'should be at work, doing ' + sim.activityLabel(o));
  sim.step(s, 8 * 60 + 1);
  assert.ok(!o.away);
  assert.equal(o.floor, 0);
  assert.ok(o.x < EXIT_X + 100);
  assert.equal(s.money, money + 300);
});

test('no work on weekends', () => {
  const s = fresh();
  s.ogonz.length = 1;
  const o = s.ogonz[0];
  o.job = { title: 'Test', start: 9, end: 17, pay: 300 };
  s.minutes = 5 * 1440 + 8 * 60;
  s.lastDay = 5;
  sim.step(s, 120);
  assert.ok(!o.away);
});

test('full bladder causes an accident', () => {
  const s = fresh();
  s.ogonz.length = 1;
  const o = s.ogonz[0];
  s.objects = s.objects.filter(x => x.type !== 'toilet');
  noJob(o);
  o.needs.bladder = 0.1;
  sim.step(s, 1);
  assert.equal(o.needs.hygiene, 0);
  assert.ok(s.log.some(l => l.text.includes('accident')));
});

test('children go to school at 6 and get a job at 18; adults retire', () => {
  const s = fresh();
  const [a] = s.ogonz;
  const kid = s.ogonz[1];
  kid.partnerId = null; a.partnerId = null;
  kid.age = 5.5; kid.job = null; kid.parents = [a.id];
  a.age = 63.5;
  s.ogonz.forEach(o => { o.rel = {}; });
  sim.step(s, 1440);
  assert.equal(kid.job && kid.job.title, 'School');
  assert.equal(a.job, null, 'retired');
  kid.age = 17.5;
  sim.step(s, 1440);
  assert.equal(sim.stage(kid), 'adult');
  assert.ok(kid.job && kid.job.pay > 0);
});

test('a loving couple has children, who get beds', () => {
  const s = fresh(7);
  s.money = 5000;
  sim.step(s, 1440 * 30);
  const kids = s.ogonz.filter(o => o.parents.length);
  assert.ok(kids.length >= 1, 'no babies in 30 days: ' + s.log.map(l => l.text).join(' | '));
  const beds = s.objects.filter(o => o.type === 'bed').length;
  assert.ok(beds >= Math.min(s.ogonz.length, 6) - 1, beds + ' beds for ' + s.ogonz.length);
});

test('elders pass away and a new family arrives when the house is empty', () => {
  const s = fresh();
  for (const o of s.ogonz) o.age = 95;
  sim.step(s, 1440 * 10);
  assert.ok(s.ogonz.length >= 1);
  assert.ok(s.ogonz.every(o => o.age < 95), 'the old couple should be gone');
  assert.ok(s.log.some(l => l.text.includes('passed away')));
  assert.ok(s.generation >= 2 || s.log.some(l => l.text.includes('moved in')));
});

test('broken furniture is avoided and repaired', () => {
  const s = fresh();
  const fridge = objOf(s, 'fridge');
  fridge.broken = true;
  s.ogonz.length = 1;
  const o = s.ogonz[0];
  noJob(o);
  setAll(o, 95);
  o.needs.hunger = 10;
  sim.step(s, 30);
  assert.ok(o.needs.hunger < 15, 'should not eat from a broken fridge');
  sim.step(s, 1440);
  assert.equal(fridge.broken, false);
});

test('save and load round-trip, old saves rejected', () => {
  const s = fresh();
  sim.step(s, 300);
  const back = sim.deserialize(sim.serialize(s));
  assert.deepEqual(back, s);
  assert.throws(() => sim.deserialize('{"version":1,"ogonz":[],"objects":[]}'));
});

test('a long life stays sane for many generations', () => {
  for (const seed of [1, 2, 3]) {
    const s = fresh(seed);
    for (let d = 0; d < 200; d++) {
      sim.step(s, 1440);
      assert.ok(s.ogonz.length <= 6, 'too many Ogonz');
      for (const o of s.ogonz) {
        for (const v of Object.values(o.needs)) assert.ok(v >= 0 && v <= 100 && !Number.isNaN(v));
        assert.ok(o.floor === 0 || o.floor === 1);
        if (o.partnerId) assert.equal(sim.byId(s.ogonz, o.partnerId).partnerId, o.id, 'partners match');
      }
    }
    assert.ok(s.ogonz.length >= 1, 'seed ' + seed + ': house empty');
    assert.ok(Number.isFinite(s.money));
  }
});
