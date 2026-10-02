'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Cards = require('../js/engine/cards.js');
const Storage = require('../js/app/storage.js');
const LocalTable = require('../js/app/local-table.js');

function makeTable(storage, seed) {
  return new LocalTable({
    storage: storage,
    rng: Cards.seededRng(seed || 1),
    botRng: Cards.seededRng((seed || 1) + 100),
    schedule: function (fn) { return setImmediate(fn); },
    cancel: function (id) { clearImmediate(id); }
  });
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

async function idle(table) {
  for (let i = 0; i < 10000; i++) {
    await tick();
    const s = table.game.state;
    if (table.pending === 0 && !table.timer && (s.phase !== 'betting' || s.toAct === table.humanSeat)) return;
  }
  throw new Error('table did not settle');
}

function humanMove(view) {
  const legal = view.legal;
  if (legal.canCheck) return { type: 'check' };
  if (legal.toCall <= 100) return { type: 'call' };
  return { type: 'fold' };
}

test('LocalTable: əllər oynanılır, botlar dəyişir, fişkalar düzgün sayılır', async () => {
  const storage = Storage.createStorage(Storage.memoryBackend());
  const table = makeTable(storage, 7);
  const log = [];
  table.subscribe((events) => { log.push(...events); });
  table.start();
  let seated = 0;
  let hands = 0;
  while (hands < 40) {
    await idle(table);
    const s = table.game.state;
    if (s.phase === 'betting') {
      assert.equal(table.canAct(), true);
      assert.ok(table.act(humanMove(table.getView())));
    } else {
      hands++;
      if (table.human.chips <= 0) break;
      assert.ok(table.nextHand());
    }
  }
  seated = log.filter((e) => e.type === 'seat').length;
  const types = new Set(log.map((e) => e.type));
  for (const t of ['sync', 'handStart', 'blind', 'deal', 'action', 'turn', 'board', 'win', 'handEnd']) {
    assert.ok(types.has(t), t);
  }
  // Başqa oyunçuların kartları heç vaxt görünmür (açılış istisna)
  for (const e of log) {
    for (const p of e.state.players) {
      if (p && p.seat !== 0 && p.hole) assert.ok(p.revealed, 'gizli kart sızmadı');
    }
    if (e.type === 'deal') assert.deepEqual(Object.keys(e.hole), ['0']);
  }
  await idle(table);
  const total = table.game.state.players.reduce((sum, p) => sum + p.chips + (table.game.inProgress ? p.totalBet : 0), 0);
  assert.equal(total, 10000 + 2000 * seated);
  assert.ok(table.getStats().handsPlayed > 0);
});

test('LocalTable: yaddaşdan bərpa (əlin ortasında da) və eyni vəziyyət', async () => {
  const storage = Storage.createStorage(Storage.memoryBackend());
  const a = makeTable(storage, 11);
  a.start();
  await idle(a);
  // Əlin ortasında saxlanılıb
  assert.equal(a.game.state.phase, 'betting');
  const saved = a.game.serialize();
  const b = makeTable(storage, 99);
  assert.deepEqual(b.game.serialize(), saved);
  assert.deepEqual(b.bots, a.bots);
  const events = [];
  b.subscribe((batch) => { events.push(...batch); });
  b.start();
  await idle(b);
  assert.equal(events[0].type, 'sync');
  assert.equal(events[0].state.phase, 'betting');
  assert.equal(b.canAct(), true);
});

test('LocalTable: fişka bitəndə "busted", yenidən başlayanda balans bərpa olunur', async () => {
  const storage = Storage.createStorage(Storage.memoryBackend());
  const table = makeTable(storage, 3);
  const events = [];
  table.subscribe((batch) => { events.push(...batch); });
  table.start();
  await idle(table);
  // Oyunçu az fişka ilə hər əldə va-bank gedir, ta ki fişkası bitənə qədər
  for (let i = 0; i < 5000 && (table.human.chips > 0 || table.game.inProgress); i++) {
    await idle(table);
    if (table.game.state.phase === 'betting') {
      table.act({ type: 'allin' });
    } else {
      if (table.human.chips > 40) table.game.setChips(0, 40);
      table.nextHand();
    }
  }
  await idle(table);
  assert.equal(table.human.chips, 0);
  assert.ok(events.some((e) => e.type === 'busted'));
  assert.equal(table.nextHand(), false);

  await table.restart();
  await idle(table);
  assert.ok(table.human.chips > 0 || table.game.inProgress);
  const p = table.game.player(0);
  assert.equal(p.chips + p.totalBet, 2000);
  assert.equal(table.getStats().handsPlayed, 0);
  const reloaded = makeTable(storage, 5);
  assert.deepEqual(reloaded.game.serialize(), table.game.serialize());
});

test('Storage: zədələnmiş məlumat yeni oyunla əvəzlənir', () => {
  const backend = Storage.memoryBackend();
  backend.setItem(Storage.KEY, '{bad json');
  const table = makeTable(Storage.createStorage(backend), 1);
  assert.equal(table.human.chips, 2000);
  backend.setItem(Storage.KEY, JSON.stringify({ version: 1, game: { version: 99 } }));
  const t2 = makeTable(Storage.createStorage(backend), 1);
  assert.equal(t2.game.state.players.length, 5);
  const noStore = makeTable(Storage.createStorage(null), 1);
  assert.equal(noStore.human.chips, 2000);
});
