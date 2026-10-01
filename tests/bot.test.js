'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.js');
const Bot = require('../js/ai/bot.js');

const { C, makeGame, startStacked, chipsOnly, play, Cards } = H;
const PROFILES = Bot.PROFILE_KEYS;

function decideMany(game, seat, count, profile) {
  const results = [];
  for (let i = 0; i < count; i++) {
    results.push(Bot.decide(game.getView(seat), { profile: profile, rng: Cards.seededRng(1000 + i), iterations: 300 }));
  }
  return results;
}

test('başlanğıc əl faizləri məntiqlidir', () => {
  assert.ok(Bot.handPercentile(...C('As Ad')) < 0.005);
  assert.ok(Bot.handPercentile(...C('Ks Kh')) < 0.01);
  assert.ok(Bot.handPercentile(...C('As Ks')) < Bot.handPercentile(...C('Ad Kc')));
  assert.ok(Bot.handPercentile(...C('7c 2d')) > 0.97);
  assert.equal(Bot.handPercentile(...C('2c 3c')), Bot.handPercentile(...C('3h 2h')));
});

test('Monte Carlo qələbə ehtimalı: AA təsadüfi ələ qarşı ~85%, güclü diapazona qarşı az', () => {
  const rng = Cards.seededRng(5);
  const vsRandom = Bot.estimateEquity(C('As Ad'), [], [{ range: 1, aggr: 0 }], 6000, rng);
  assert.ok(Math.abs(vsRandom - 0.85) < 0.02, String(vsRandom));
  const kkVsTight = Bot.estimateEquity(C('Ks Kd'), [], [{ range: 0.01, aggr: 0 }], 6000, rng);
  assert.ok(kkVsTight < 0.6, String(kkVsTight));
  const nuts = Bot.estimateEquity(C('Js Ts'), C('As Ks Qs 7d 2c'), [{ range: 1, aggr: 0 }], 500, rng);
  assert.equal(nuts, 1);
});

test('AA ilə preflop həmişə artırır, 72o ilə ilk mövqedə pas deyir', () => {
  for (const profile of PROFILES) {
    const g = makeGame([2000, 2000, 2000, 2000, 2000]);
    startStacked(g, 0, { 3: 'As Ad' });
    for (const d of decideMany(g, 3, 20, profile)) {
      assert.equal(d.type, 'raise', profile);
      const legal = g.legalActions(3);
      assert.ok(d.amount >= legal.minTo && d.amount <= legal.maxTo);
    }
    const h = makeGame([2000, 2000, 2000, 2000, 2000]);
    startStacked(h, 0, { 3: '7c 2d' });
    for (const d of decideMany(h, 3, 20, profile)) assert.equal(d.type, 'fold', profile);
  }
});

test('böyük blayd pulsuz çek edə bilirsə, heç vaxt pas demir', () => {
  const g = makeGame([2000, 2000, 2000, 2000, 2000]);
  startStacked(g, 0, { 2: '7c 2d' });
  play(g, { type: 'call' });
  play(g, { type: 'call' });
  play(g, { type: 'call' });
  play(g, { type: 'call' });
  assert.equal(g.state.toAct, 2);
  for (const profile of PROFILES) {
    for (const d of decideMany(g, 2, 15, profile)) assert.notEqual(d.type, 'fold');
  }
});

test('100BB va-banka qarşı: 72o pas, AA bərabərləşir', () => {
  for (const [hole, expected] of [['7c 2d', 'fold'], ['As Ad', 'call']]) {
    const g = makeGame([2000, 2000, 2000, 2000, 2000]);
    startStacked(g, 0, { 4: hole });
    play(g, { type: 'allin' }); // seat 3
    for (const profile of PROFILES) {
      for (const d of decideMany(g, 4, 10, profile)) assert.equal(d.type, expected, profile + ' ' + hole);
    }
  }
});

test('riverdə ən güclü əl ilə mərc edir, heç nəsiz böyük mərcə pas deyir', () => {
  // Təkbətək: 0 = diler/SB, 1 = BB. Postflopda 1 birinci danışır.
  const g = makeGame([2000, 2000]);
  startStacked(g, 0, { 0: '3h 4d', 1: 'Js Ts' }, 'As Ks Qs 7d 2c');
  play(g, { type: 'call' });
  play(g, { type: 'check' });
  for (let i = 0; i < 4; i++) play(g, { type: 'check' });
  assert.equal(g.state.street, 'river');
  assert.equal(g.state.toAct, 1);
  let bets = 0;
  for (const profile of PROFILES) {
    for (const d of decideMany(g, 1, 10, profile)) if (d.type === 'bet') bets++;
  }
  assert.ok(bets >= 36, 'güclü əllə mərc: ' + bets + '/40');

  play(g, { type: 'bet', amount: 40 }); // bankın ölçüsündə
  let folds = 0;
  for (const profile of PROFILES) {
    for (const d of decideMany(g, 0, 10, profile)) if (d.type === 'fold') folds++;
  }
  assert.ok(folds >= 32, 'zəif əllə pas: ' + folds + '/40');
});

test('yalnız botlar: 1500 əl — hər qərar qanunidir, fişkalar saxlanılır, qərarlar sürətlidir', () => {
  const rng = Cards.seededRng(31337);
  const profiles = ['solid', 'rock', 'aggressive', 'station', 'solid'];
  const g = makeGame([2000, 2000, 2000, 2000, 2000], { seed: 77 });
  const total = chipsOnly(g);
  let decisions = 0;
  let elapsed = 0;
  const counts = { fold: 0, check: 0, call: 0, bet: 0, raise: 0 };
  for (let hand = 0; hand < 1500; hand++) {
    g.state.players.forEach((p, i) => {
      if (p.chips === 0) {
        // Yeni bot gəlir: fişkaları "masaya" əlavə edirik — cəmi ayrıca saxlayırıq.
        p.chips = 2000;
      }
      void i;
    });
    const before = chipsOnly(g);
    g.startHand();
    let steps = 0;
    while (g.state.phase === 'betting') {
      const seat = g.state.toAct;
      const t0 = process.hrtime.bigint();
      const action = Bot.decide(g.getView(seat), { profile: profiles[seat], rng: rng });
      elapsed += Number(process.hrtime.bigint() - t0) / 1e6;
      decisions++;
      counts[action.type === 'allin' ? 'raise' : action.type]++;
      g.act(seat, action); // qanunsuz olsa xəta atar
      assert.ok(++steps < 200);
    }
    assert.equal(chipsOnly(g), before);
  }
  assert.ok(total > 0);
  const avg = elapsed / decisions;
  assert.ok(avg < 15, 'orta qərar müddəti ' + avg.toFixed(2) + ' ms');
  // Botlar həm pas deyir, həm də aqressiv oynayır
  for (const k of Object.keys(counts)) assert.ok(counts[k] > 0, k);
  console.log('# bot qərarları:', JSON.stringify(counts), 'orta', avg.toFixed(2), 'ms');
});
