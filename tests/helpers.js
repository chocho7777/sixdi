'use strict';

const Cards = require('../js/engine/cards.js');
const HoldemGame = require('../js/engine/game.js');

const C = Cards.parseCards;

/** Oyunçu massivindən oyun yaradır: [1000, 1000, null, 500] */
function makeGame(stacks, opts) {
  opts = opts || {};
  return new HoldemGame({
    smallBlind: opts.smallBlind || 10,
    bigBlind: opts.bigBlind || 20,
    rng: Cards.seededRng(opts.seed || 12345),
    players: stacks.map(function (chips, i) {
      return chips == null ? null : { id: 'p' + i, name: 'P' + i, chips: chips };
    })
  });
}

/**
 * Paylanma sırasına uyğun dəstə qurur.
 * order: dilerin solundan başlayan oturacaqlar (startHand-dəki kimi)
 * holes: {seat: 'As Kd'}; board: 'Ah Kh Qh Jh Th' (5 kartdan az ola bilər)
 */
function stackedDeck(order, holes, board) {
  const used = new Set();
  const holeCards = {};
  for (const seat of order) {
    holeCards[seat] = holes[seat] ? C(holes[seat]) : null;
    if (holeCards[seat]) holeCards[seat].forEach(function (c) { used.add(c); });
  }
  const boardCards = board ? C(board) : [];
  boardCards.forEach(function (c) { used.add(c); });
  const spare = Cards.freshDeck().filter(function (c) { return !used.has(c); });
  const take = function () { return spare.shift(); };

  const seq = [];
  for (let round = 0; round < 2; round++) {
    for (const seat of order) seq.push(holeCards[seat] ? holeCards[seat][round] : take());
  }
  const boardSeq = boardCards.slice();
  const next = function () { return boardSeq.length ? boardSeq.shift() : take(); };
  seq.push(take()); // burn
  seq.push(next(), next(), next());
  seq.push(take()); // burn
  seq.push(next());
  seq.push(take()); // burn
  seq.push(next());
  return seq;
}

/** Dilerin solundan başlayan, fişkası olan oturacaqlar. */
function dealOrder(game, dealer) {
  const n = game.state.players.length;
  const order = [];
  for (let i = 1; i <= n; i++) {
    const seat = (dealer + i) % n;
    const p = game.state.players[seat];
    if (p && p.chips > 0) order.push(seat);
  }
  return order;
}

function startStacked(game, dealer, holes, board) {
  return game.startHand({ dealer: dealer, deck: stackedDeck(dealOrder(game, dealer), holes, board) });
}

function totalChips(game) {
  let sum = 0;
  for (const p of game.state.players) if (p) sum += p.chips + p.totalBet;
  return sum;
}

function chipsOnly(game) {
  let sum = 0;
  for (const p of game.state.players) if (p) sum += p.chips;
  return sum;
}

function types(events) {
  return events.map(function (e) { return e.type; });
}

/** Növbədə olan oyunçu üçün hərəkət et. */
function play(game, action) {
  return game.act(game.state.toAct, action);
}

module.exports = { C, makeGame, stackedDeck, dealOrder, startStacked, totalChips, chipsOnly, types, play, Cards, HoldemGame };
