'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Pots = require('../js/engine/pots.js');

test('all-in olmadan tək bank, pas deyənlərin pulu banka qalır', () => {
  const pots = Pots.buildPots([
    { seat: 0, amount: 100, folded: false },
    { seat: 1, amount: 100, folded: false },
    { seat: 2, amount: 40, folded: true }
  ]);
  assert.deepEqual(pots, [{ amount: 240, eligible: [0, 1] }]);
});

test('qısa all-in: əsas bank + yan bank', () => {
  const pots = Pots.buildPots([
    { seat: 0, amount: 50, folded: false },
    { seat: 1, amount: 200, folded: false },
    { seat: 2, amount: 200, folded: false }
  ]);
  assert.deepEqual(pots, [
    { amount: 150, eligible: [0, 1, 2] },
    { amount: 300, eligible: [1, 2] }
  ]);
});

test('üç fərqli all-in səviyyəsi və pas deyənin ölü pulu', () => {
  const pots = Pots.buildPots([
    { seat: 0, amount: 100, folded: false },
    { seat: 1, amount: 300, folded: false },
    { seat: 2, amount: 600, folded: false },
    { seat: 3, amount: 600, folded: false },
    { seat: 4, amount: 250, folded: true }
  ]);
  assert.deepEqual(pots, [
    { amount: 500, eligible: [0, 1, 2, 3] },
    { amount: 750, eligible: [1, 2, 3] },
    { amount: 600, eligible: [2, 3] }
  ]);
  const total = pots.reduce((s, p) => s + p.amount, 0);
  assert.equal(total, 100 + 300 + 600 + 600 + 250);
});

test('yalnız bir iddiaçısı olan bank (qalanlar pas)', () => {
  const pots = Pots.buildPots([
    { seat: 0, amount: 200, folded: false },
    { seat: 1, amount: 1000, folded: false },
    { seat: 2, amount: 1000, folded: true },
    { seat: 3, amount: 1000, folded: true }
  ]);
  assert.deepEqual(pots, [
    { amount: 800, eligible: [0, 1] },
    { amount: 2400, eligible: [1] }
  ]);
});

test('bölünmə: tək fişka dilerin solundakı birinci qalibə', () => {
  const awards = Pots.awardPots(
    [{ amount: 101, eligible: [0, 2, 3] }],
    { 0: 500, 2: 500, 3: 400 },
    [3, 0, 1, 2] // diler = 2
  );
  assert.deepEqual(awards[0].winners, [{ seat: 0, amount: 51 }, { seat: 2, amount: 50 }]);
});

test('üç nəfər arasında bölünmə, qalıq 2 fişka', () => {
  const awards = Pots.awardPots(
    [{ amount: 302, eligible: [1, 2, 4] }],
    { 1: 900, 2: 900, 4: 900 },
    [2, 4, 1]
  );
  assert.deepEqual(awards[0].winners, [
    { seat: 2, amount: 101 },
    { seat: 4, amount: 101 },
    { seat: 1, amount: 100 }
  ]);
});

test('hər bank öz iddiaçıları arasında ən yaxşı ələ verilir', () => {
  const pots = [
    { amount: 150, eligible: [0, 1, 2] },
    { amount: 300, eligible: [1, 2] }
  ];
  const awards = Pots.awardPots(pots, { 0: 900, 1: 500, 2: 700 }, [0, 1, 2]);
  assert.deepEqual(awards[0].winners, [{ seat: 0, amount: 150 }]);
  assert.deepEqual(awards[1].winners, [{ seat: 2, amount: 300 }]);
});
