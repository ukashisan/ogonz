import test from 'node:test';
import assert from 'node:assert/strict';
import * as sim from '../src/sim.js';
import { CATALOG, EXIT_X } from '../src/data.js';

const fresh = () => sim.newGame(42);
const setAll = (o, v) => { for (const n in o.needs) o.needs[n] = v; };
const objOf = (s, type) => s.objects.find(o => o.type === type);

test('new game has two Ogonz with jobs and starter furniture', () => {
  const s = fresh();
  assert.equal(s.ogonz.length, 2);
  assert.ok(s.ogonz.every(o => o.job && o.job.pay > 0));
  for (const t of ['fridge', 'bed', 'toilet', 'shower']) assert.ok(objOf(s, t), t);
});

test('hungry Ogon walks to the fridge and eats', () => {
  const s = fresh();
  s.ogonz.length = 1;
  const o = s.ogonz[0];
  o.job = { ...o.job, start: 25, end: 26 };          // never works
  setAll(o, 95);
  o.needs.hunger = 10;
  sim.step(s, 60);
  assert.ok(o.needs.hunger > 80, 'hunger ' + o.needs.hunger);
});

test('tired Ogon climbs the stairs to a bed and sleeps', () => {
  const s = fresh();
  s.ogonz.length = 1;
  const o = s.ogonz[0];
  o.job = { ...o.job, start: 25, end: 26 };
  setAll(o, 95);
  o.needs.energy = 15;
  let slept = false;
  for (let i = 0; i < 120; i++) {
    sim.step(s, 1);
    if (sim.isSleeping(s, o)) { slept = true; break; }
  }
  assert.ok(slept, 'never slept; doing ' + sim.activityLabel(o));
  assert.equal(o.floor, 1);
});

test('player command overrides autonomy', () => {
  const s = fresh();
  s.ogonz.length = 1;
  const o = s.ogonz[0];
  o.job = { ...o.job, start: 25, end: 26 };
  setAll(o, 90);
  o.needs.fun = 30;
  const shower = objOf(s, 'shower');
  sim.commandUse(s, o.id, shower.id);
  sim.step(s, 1);
  assert.equal(sim.activityLabel(o), 'Shower');
});

test('two Ogonz with low social chat and build a relationship', () => {
  const s = fresh();
  const [a, b] = s.ogonz;
  for (const o of s.ogonz) { o.job = { ...o.job, start: 25, end: 26 }; setAll(o, 95); }
  a.needs.social = 5;
  sim.commandChat(s, a.id, b.id);
  sim.step(s, 30);
  assert.ok(a.rel[b.id] > 0 && b.rel[a.id] > 0, JSON.stringify([a.rel, b.rel]));
  assert.ok(a.needs.social > 30);
});

test('Ogon goes to work on a weekday and is paid on return', () => {
  const s = fresh();
  s.ogonz.length = 1;
  const o = s.ogonz[0];
  o.job = { title: 'Test', start: 9, end: 17, pay: 300 };
  const money = s.money;
  sim.step(s, 9 * 60 - 7 * 60);       // to 09:00 on day 0 (Mon)
  assert.ok(o.away, 'should be at work, doing ' + sim.activityLabel(o));
  sim.step(s, 8 * 60 + 1);             // past 17:00
  assert.ok(!o.away);
  assert.equal(o.floor, 0);
  assert.ok(o.x < EXIT_X + 100, 'walks in from the bus stop, x=' + o.x);
  assert.equal(s.money, money + 300);
});

test('no work on weekends', () => {
  const s = fresh();
  s.ogonz.length = 1;
  const o = s.ogonz[0];
  o.job = { title: 'Test', start: 9, end: 17, pay: 300 };
  s.minutes = 5 * 1440 + 8 * 60;      // Saturday 08:00
  sim.step(s, 120);
  assert.ok(!o.away);
});

test('full bladder causes an accident', () => {
  const s = fresh();
  s.ogonz.length = 1;
  const o = s.ogonz[0];
  s.objects = s.objects.filter(x => x.type !== 'toilet');
  o.job = { ...o.job, start: 25, end: 26 };
  o.needs.bladder = 0.1;
  sim.step(s, 1);
  assert.equal(o.needs.hygiene, 0);
  assert.ok(s.log.some(l => l.text.includes('accident')));
});

test('buy checks money and space; sell refunds half', () => {
  const s = fresh();
  s.money = 1000;
  assert.equal(sim.buy(s, 'tv', 0, 200).ok, false, 'overlaps fridge');
  assert.equal(sim.buy(s, 'tv', 0, 9999).ok, false, 'outside house');
  const r = sim.buy(s, 'tv', 0, 620);
  assert.ok(r.ok, r.reason);
  assert.equal(s.money, 1000 - CATALOG.tv.cost);
  s.money = 0;
  assert.equal(sim.buy(s, 'plant', 1, 640).reason, 'Not enough money');
  const sold = sim.sell(s, r.object.id);
  assert.equal(sold.refund, CATALOG.tv.cost / 2);
});

test('selling an object in use stops the user', () => {
  const s = fresh();
  s.ogonz.length = 1;
  const o = s.ogonz[0];
  o.job = { ...o.job, start: 25, end: 26 };
  const fridge = objOf(s, 'fridge');
  o.floor = 0; o.x = fridge.x;
  sim.commandUse(s, o.id, fridge.id);
  sim.step(s, 2);
  assert.equal(fridge.user, o.id);
  sim.sell(s, fridge.id);
  sim.step(s, 1);
  assert.notEqual(sim.activityLabel(o), 'Eat');
});

test('household is capped', () => {
  const s = fresh();
  while (sim.addOgon(s).ok);
  assert.equal(s.ogonz.length, 6);
});

test('save and load round-trip, bad saves rejected', () => {
  const s = fresh();
  sim.step(s, 300);
  const back = sim.deserialize(sim.serialize(s));
  assert.deepEqual(back, s);
  assert.throws(() => sim.deserialize('{"version":99}'));
});

test('a week of simulation stays sane', () => {
  const s = fresh();
  sim.addOgon(s);
  sim.step(s, 7 * 1440);
  for (const o of s.ogonz) {
    for (const v of Object.values(o.needs)) assert.ok(v >= 0 && v <= 100 && !Number.isNaN(v));
    assert.ok(o.floor === 0 || o.floor === 1);
    assert.ok(sim.mood(o) > 25, o.name + ' mood ' + sim.mood(o) + ' ' + JSON.stringify(o.needs));
  }
  assert.ok(s.money > 1500, 'jobs should pay: ' + s.money);
});
