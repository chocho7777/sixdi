'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./helpers.js');

const { makeGame, startStacked, totalChips, chipsOnly, types, play, HoldemGame, Cards } = H;

function chipsOf(game) {
  return game.state.players.map((p) => (p ? p.chips : null));
}

test('5 nəfər: blaydlar, ilk danışan və minimum artırma', () => {
  const g = makeGame([1000, 1000, 1000, 1000, 1000]);
  const events = g.startHand({ dealer: 0 });
  assert.deepEqual(types(events), ['handStart', 'blind', 'blind', 'deal', 'turn']);
  assert.equal(g.state.sbSeat, 1);
  assert.equal(g.state.bbSeat, 2);
  assert.equal(g.state.toAct, 3);
  assert.equal(g.potTotal(), 30);
  assert.deepEqual(chipsOf(g), [1000, 990, 980, 1000, 1000]);
  for (const p of g.state.players) assert.equal(p.hole.length, 2);
  const deal = events[3];
  assert.deepEqual(deal.order, [1, 2, 3, 4, 0]);

  const legal = g.legalActions(3);
  assert.equal(legal.toCall, 20);
  assert.equal(legal.canCheck, false);
  assert.equal(legal.canRaise, true);
  assert.equal(legal.minTo, 40);
  assert.equal(legal.maxTo, 1000);

  play(g, { type: 'raise', amount: 60 }); // seat 3: +40 artırma
  assert.equal(g.legalActions(4).minTo, 100);
  assert.throws(() => play(g, { type: 'raise', amount: 90 }), (e) => e.code === 'BAD_AMOUNT');
  play(g, { type: 'raise', amount: 100 });
  assert.equal(g.legalActions(0).minTo, 140);
});

test('təkbətək: diler kiçik blaydı qoyur, preflopda birinci, sonra ikinci danışır', () => {
  const g = makeGame([1000, 1000]);
  g.startHand({ dealer: 0 });
  assert.equal(g.state.sbSeat, 0);
  assert.equal(g.state.bbSeat, 1);
  assert.equal(g.state.toAct, 0);
  play(g, { type: 'call' });
  assert.equal(g.state.toAct, 1);
  const legal = g.legalActions(1);
  assert.equal(legal.canCheck, true, 'BB-nin seçimi var');
  assert.equal(legal.canRaise, true);
  play(g, { type: 'check' });
  assert.equal(g.state.street, 'flop');
  assert.equal(g.state.toAct, 1, 'flopda BB birinci danışır');

  // Növbəti əldə düymə keçir
  play(g, { type: 'check' });
  play(g, { type: 'check' });
  play(g, { type: 'check' });
  play(g, { type: 'check' });
  play(g, { type: 'check' });
  play(g, { type: 'check' });
  assert.equal(g.state.phase, 'complete');
  g.startHand();
  assert.equal(g.state.dealer, 1);
  assert.equal(g.state.sbSeat, 1);
  assert.equal(g.state.toAct, 1);
});

test('BB seçimi, hamı çek deyir, küçələr irəliləyir və açılış olur', () => {
  const g = makeGame([1000, 1000, 1000, 1000, 1000]);
  g.startHand({ dealer: 0 });
  play(g, { type: 'call' }); // 3
  play(g, { type: 'call' }); // 4
  play(g, { type: 'call' }); // 0
  play(g, { type: 'call' }); // 1 (SB)
  assert.equal(g.state.toAct, 2);
  assert.equal(g.legalActions(2).canCheck, true);
  const ev = play(g, { type: 'check' });
  assert.deepEqual(types(ev), ['action', 'collect', 'board', 'turn']);
  assert.equal(g.state.board.length, 3);
  assert.equal(g.state.toAct, 1, 'flopda dilerdən sonrakı');
  assert.equal(g.potTotal(), 100);

  for (const street of ['turn', 'river']) {
    for (let i = 0; i < 5; i++) play(g, { type: 'check' });
    assert.equal(g.state.street, street);
  }
  let last;
  for (let i = 0; i < 5; i++) last = play(g, { type: 'check' });
  assert.deepEqual(types(last).slice(-4), ['collect', 'showdown', 'win', 'handEnd']);
  assert.equal(g.state.phase, 'complete');
  assert.equal(chipsOnly(g), 5000);
  const won = g.state.result.pots.reduce((s, p) => s + p.amount, 0);
  assert.equal(won, 100);
});

test('hamı pas deyir: BB qazanır, bərabərləşdirilməmiş hissə qaytarılır', () => {
  const g = makeGame([1000, 1000, 1000, 1000, 1000]);
  g.startHand({ dealer: 0 });
  play(g, { type: 'fold' });
  play(g, { type: 'fold' });
  play(g, { type: 'fold' });
  const ev = play(g, { type: 'fold' });
  assert.deepEqual(types(ev), ['action', 'return', 'collect', 'win', 'handEnd']);
  assert.equal(ev[1].seat, 2);
  assert.equal(ev[1].amount, 10);
  assert.deepEqual(chipsOf(g), [1000, 990, 1010, 1000, 1000]);
  assert.equal(g.state.result.uncontested, true);
  assert.equal(g.state.players[2].revealed, false, 'kartlar açılmır');
});

test('tam artırma olmayan va-bank artıq danışmış oyunçu üçün mərcləri açmır', () => {
  const g = makeGame([1000, 150, 1000]);
  g.startHand({ dealer: 2 }); // SB=0, BB=1, ilk = 2
  play(g, { type: 'call' }); // 2
  play(g, { type: 'call' }); // 0
  play(g, { type: 'check' }); // 1
  assert.equal(g.state.street, 'flop');
  assert.equal(g.state.toAct, 0);
  play(g, { type: 'bet', amount: 100 }); // 0
  play(g, { type: 'allin' }); // 1: 130-a qədər (qısa artırma)
  assert.equal(g.state.currentBet, 130);
  assert.equal(g.state.minRaise, 100, 'minimum artırma dəyişmir');
  const c = g.legalActions(2);
  assert.equal(c.canRaise, true, 'hələ danışmamış oyunçu artıra bilər');
  assert.equal(c.minTo, 230);
  play(g, { type: 'call' }); // 2
  const a = g.legalActions(0);
  assert.equal(a.toCall, 30);
  assert.equal(a.canRaise, false, 'A yalnız bərabərləşə və ya pas deyə bilər');
  assert.throws(() => play(g, { type: 'raise', amount: 400 }), (e) => e.code === 'ILLEGAL_ACTION');
  play(g, { type: 'call' });
  assert.equal(g.state.street, 'turn');
});

test('ardıcıl qısa va-banklar cəmi tam artırma olduqda mərclər yenidən açılır', () => {
  const g = makeGame([1000, 170, 240, 1000]);
  g.startHand({ dealer: 3 }); // SB=0, BB=1, ilk=2
  play(g, { type: 'call' }); // 2
  play(g, { type: 'call' }); // 3
  play(g, { type: 'call' }); // 0
  play(g, { type: 'check' }); // 1
  assert.equal(g.state.toAct, 0);
  play(g, { type: 'bet', amount: 100 }); // 0
  play(g, { type: 'allin' }); // 1 → 150
  play(g, { type: 'allin' }); // 2 → 220
  assert.equal(g.state.currentBet, 220);
  assert.equal(g.legalActions(3).minTo, 320);
  play(g, { type: 'call' }); // 3
  const a = g.legalActions(0);
  assert.equal(a.canRaise, true);
  assert.equal(a.minTo, 320);
});

test('bərabərləşdirilməmiş va-bank fərqi dərhal qaytarılır, kartlar açılır', () => {
  const g = makeGame([1000, 300]);
  g.startHand({ dealer: 0 });
  play(g, { type: 'allin' }); // 0 → 1000
  const ev = play(g, { type: 'call' }); // 1 all-in 300
  const t = types(ev);
  assert.deepEqual(t.slice(0, 4), ['action', 'return', 'collect', 'reveal']);
  assert.equal(ev[1].seat, 0);
  assert.equal(ev[1].amount, 700);
  assert.deepEqual(t.filter((x) => x === 'board').length, 3);
  assert.deepEqual(t.slice(-3), ['showdown', 'win', 'handEnd']);
  assert.equal(chipsOnly(g), 1300);
  const pot = g.state.result.pots.reduce((s, p) => s + p.amount, 0);
  assert.equal(pot, 600);
});

test('yan banklar: hər bank öz qalibinə', () => {
  const g = makeGame([100, 300, 600, 1000]);
  startStacked(g, 3, { 0: 'As Ad', 1: 'Ks Kd', 2: 'Qs Qd', 3: 'Js Jd' }, '2c 7d 9h 4s 3c');
  assert.equal(g.state.toAct, 2);
  play(g, { type: 'allin' }); // 2 → 600
  play(g, { type: 'call' }); // 3
  play(g, { type: 'call' }); // 0 all-in 100
  play(g, { type: 'call' }); // 1 all-in 300
  assert.equal(g.state.phase, 'complete');
  const pots = g.state.result.pots;
  assert.deepEqual(pots.map((p) => p.amount), [400, 600, 600]);
  assert.deepEqual(pots.map((p) => p.winners), [
    [{ seat: 0, amount: 400 }],
    [{ seat: 1, amount: 600 }],
    [{ seat: 2, amount: 600 }]
  ]);
  assert.deepEqual(chipsOf(g), [400, 600, 600, 400]);
  assert.equal(pots[0].hand, 'Cüt (A)');
});

test('stol oynayır: bank bölünür, tək fişka dilerin solundakı qalibə', () => {
  const g = makeGame([1000, 1000, 1000], { smallBlind: 5, bigBlind: 10 });
  startStacked(g, 0, { 0: '2c 3d', 1: '4h 5h', 2: '7c 8d' }, 'As Ks Qs Js Ts');
  play(g, { type: 'call' }); // 0
  play(g, { type: 'fold' }); // 1 (SB)
  play(g, { type: 'check' }); // 2 (BB)
  for (let i = 0; i < 6; i++) play(g, { type: 'check' });
  assert.equal(g.state.phase, 'complete');
  const pot = g.state.result.pots[0];
  assert.equal(pot.amount, 25);
  assert.deepEqual(pot.winners, [{ seat: 2, amount: 13 }, { seat: 0, amount: 12 }]);
  assert.equal(pot.hand, 'Royal-flaş');
  assert.deepEqual(chipsOf(g), [1002, 995, 1003]);
});

test('böyük blayd tam deyilsə, digərləri tam blaydı bərabərləşdirir; artıq qaytarılır', () => {
  const g = makeGame([1000, 1000, 15]);
  g.startHand({ dealer: 0 }); // SB=1, BB=2 (15, va-bank)
  assert.equal(g.state.players[2].allIn, true);
  assert.equal(g.state.currentBet, 20);
  assert.equal(g.legalActions(0).toCall, 20);
  play(g, { type: 'fold' }); // 0
  const ev = play(g, { type: 'call' }); // 1: 20-yə qədər
  const ret = ev.find((e) => e.type === 'return');
  assert.deepEqual([ret.seat, ret.amount], [1, 5]);
  assert.equal(g.state.phase, 'complete');
  assert.equal(chipsOnly(g), 2015);
});

test('təkbətək: SB blaydla va-bank olursa, heç kim danışmadan kartlar açılır', () => {
  const g = makeGame([5, 1000]);
  const ev = g.startHand({ dealer: 0 });
  assert.deepEqual(types(ev), [
    'handStart', 'blind', 'blind', 'deal', 'return', 'collect', 'reveal',
    'board', 'board', 'board', 'showdown', 'win', 'handEnd'
  ]);
  assert.equal(ev.find((e) => e.type === 'return').amount, 15);
  assert.equal(chipsOnly(g), 1005);
});

test('fişkası bitən oyunçu əldən kənarda qalır, düymə onu ötür', () => {
  const g = makeGame([1000, 0, 1000]);
  g.startHand({ dealer: 0 });
  assert.equal(g.state.players[1].inHand, false);
  assert.equal(g.state.sbSeat, 0, 'iki nəfər: diler = SB');
  assert.equal(g.state.bbSeat, 2);
  play(g, { type: 'fold' });
  g.setChips(1, 500);
  g.startHand();
  assert.equal(g.state.dealer, 1);
  assert.equal(g.state.sbSeat, 2);
  assert.equal(g.state.bbSeat, 0);
});

test('qadağan olunmuş hərəkətlər xəta verir', () => {
  const g = makeGame([1000, 1000, 1000]);
  assert.throws(() => g.act(0, { type: 'check' }), (e) => e.code === 'NO_HAND');
  g.startHand({ dealer: 0 }); // ilk = 0
  assert.throws(() => g.act(1, { type: 'call' }), (e) => e.code === 'NOT_YOUR_TURN');
  assert.throws(() => g.act(0, { type: 'check' }), (e) => e.code === 'ILLEGAL_ACTION');
  assert.throws(() => g.act(0, { type: 'raise', amount: 30 }), (e) => e.code === 'BAD_AMOUNT');
  assert.throws(() => g.act(0, { type: 'raise', amount: 1001 }), (e) => e.code === 'BAD_AMOUNT');
  assert.throws(() => g.act(0, { type: 'dance' }), (e) => e.code === 'ILLEGAL_ACTION');
  assert.throws(() => g.startHand(), (e) => e.code === 'HAND_IN_PROGRESS');
  assert.throws(() => g.setChips(0, 5), (e) => e.code === 'HAND_IN_PROGRESS');
});

test('seriallaşdırma: yarıda saxlanmış əl eyni nəticə ilə davam edir', () => {
  const a = makeGame([1000, 800, 1200, 600]);
  a.startHand({ dealer: 1 });
  play(a, { type: 'raise', amount: 60 });
  play(a, { type: 'call' });
  const saved = JSON.parse(JSON.stringify(a.serialize()));
  const b = HoldemGame.restore(saved, Cards.seededRng(1));
  const script = [{ type: 'call' }, { type: 'call' }, { type: 'call' }, { type: 'check' }, { type: 'bet', amount: 100 },
    { type: 'call' }, { type: 'fold' }, { type: 'call' }];
  for (const action of script) {
    if (a.state.phase !== 'betting') break;
    play(a, action);
    play(b, action);
  }
  while (a.state.phase === 'betting') {
    play(a, { type: 'check' });
    play(b, { type: 'check' });
  }
  assert.deepEqual(b.state, a.state);
});

test('görüntü maskası: başqalarının kartları gizlidir, açılışdan sonra görünür', () => {
  const g = makeGame([1000, 1000, 1000]);
  const ev = g.startHand({ dealer: 0 });
  const view = g.getView(1);
  assert.equal(view.players[1].hole.length, 2);
  assert.equal(view.players[0].hole, null);
  assert.equal(view.players[0].cardCount, 2);
  assert.equal(view.legal, null, 'növbə 0-dadır');
  assert.notEqual(g.getView(0).legal, null);
  const deal = HoldemGame.maskEvent(ev.find((e) => e.type === 'deal'), 2);
  assert.deepEqual(Object.keys(deal.hole), ['2']);
  assert.equal(deal.state.players[1].hole, null);
  const spectator = g.getView(-1);
  assert.ok(spectator.players.every((p) => p.hole === null));

  while (g.state.phase === 'betting') {
    const l = g.legalActions(g.state.toAct);
    play(g, { type: l.canCheck ? 'check' : 'call' });
  }
  const after = g.getView(1);
  assert.ok(after.players.every((p) => p.hole && p.hole.length === 2), 'açılışda hamısı görünür');
});

function randomAction(legal, rng) {
  const r = rng();
  if (legal.canCheck && r < 0.35) return { type: 'check' };
  if (legal.canCall && r < 0.45) return { type: 'call' };
  if ((legal.canBet || legal.canRaise) && r < 0.72) {
    const span = legal.maxTo - legal.minTo;
    const amount = rng() < 0.15 ? legal.maxTo : legal.minTo + Math.floor(rng() * rng() * (span + 1));
    return { type: legal.canBet ? 'bet' : 'raise', amount: amount };
  }
  if (r < 0.78) return { type: 'allin' };
  if (r < 0.85) return { type: 'call' };
  return legal.canCheck && rng() < 0.6 ? { type: 'check' } : { type: 'fold' };
}

test('stress: 6000 təsadüfi əl — fişkalar itmir, qaydalar pozulmur', () => {
  const rng = Cards.seededRng(2024);
  for (let table = 0; table < 60; table++) {
    const seats = 2 + Math.floor(rng() * 8);
    const stacks = [];
    for (let i = 0; i < seats; i++) stacks.push(rng() < 0.12 ? null : 20 + Math.floor(rng() * 3000));
    if (stacks.filter((x) => x).length < 2) { stacks[0] = 500; stacks[1] = 500; }
    const g = makeGame(stacks, { seed: Math.floor(rng() * 1e9), smallBlind: 5, bigBlind: 10 });
    let total = chipsOnly(g);

    for (let hand = 0; hand < 100; hand++) {
      if (!g.canStartHand()) {
        // Fişkası bitənləri yenidən oturt
        g.state.players.forEach((p, i) => {
          if (!p || p.chips === 0) {
            const chips = 50 + Math.floor(rng() * 2000);
            g.seatPlayer(i, { id: 'n' + i, name: 'N' + i, chips: chips });
            total += chips - (p ? p.chips : 0);
          }
        });
      }
      g.startHand();
      let steps = 0;
      while (g.state.phase === 'betting') {
        const seat = g.state.toAct;
        const p = g.state.players[seat];
        assert.ok(p && p.inHand && !p.folded && !p.allIn, 'növbə düzgün oyunçudadır');
        const legal = g.legalActions(seat);
        assert.ok(legal.toCall >= 0 && legal.toCall <= p.chips);
        if (legal.canBet || legal.canRaise) assert.ok(legal.minTo <= legal.maxTo && legal.minTo > g.state.currentBet);
        const events = g.act(seat, randomAction(legal, rng));
        for (const e of events) assert.ok(e.state, 'hər hadisədə görüntü var');
        const inPlay = g.state.phase === 'betting' ? totalChips(g) : chipsOnly(g);
        assert.equal(inPlay, total, 'fişkalar saxlanılır');
        for (const q of g.state.players) if (q) assert.ok(q.chips >= 0 && q.bet >= 0);
        assert.ok(++steps < 300, 'əl sonsuz dövrə girmir');
      }
      assert.equal(g.state.phase, 'complete');
      assert.equal(chipsOnly(g), total);
      const result = g.state.result;
      const contributed = g.state.players.reduce((s, q) => s + (q ? q.totalBet : 0), 0);
      const paid = result.pots.reduce((s, pot) => s + pot.winners.reduce((x, w) => x + w.amount, 0), 0);
      assert.equal(paid, contributed, 'bütün bank paylanır');
      if (!result.uncontested) {
        assert.equal(g.state.board.length, 5);
        for (const q of g.state.players) if (q && q.inHand && !q.folded) assert.ok(q.revealed);
        for (const pot of result.pots) {
          for (const w of pot.winners) assert.ok(pot.eligible.includes(w.seat), 'qalib bu bankda iştirak edir');
        }
      }
    }
  }
});
