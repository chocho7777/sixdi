/*
 * Kartlar, dəstə və təsadüfi ədədlər.
 *
 * Kart 0..51 arası tam ədəddir: rank = card >> 2 (0 = "2" ... 12 = "A"),
 * mast = card & 3 (0 = ♣, 1 = ♦, 2 = ♥, 3 = ♠).
 *
 * Fayl həm brauzerdə (window.Poker.Cards), həm də Node.js-də
 * (require) işləyir — gələcəkdə server tərəfdə də istifadə üçün.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    (root.Poker = root.Poker || {}).Cards = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RANKS = '23456789TJQKA';
  const SUITS = 'cdhs';
  const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'];
  const RANK_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

  function rankOf(card) {
    return card >> 2;
  }

  function suitOf(card) {
    return card & 3;
  }

  function makeCard(rank, suit) {
    return (rank << 2) | suit;
  }

  function isRed(card) {
    const s = card & 3;
    return s === 1 || s === 2;
  }

  function cardToString(card) {
    return RANKS[rankOf(card)] + SUITS[suitOf(card)];
  }

  function cardFromString(str) {
    if (typeof str !== 'string' || str.length !== 2) {
      throw new Error('Invalid card: ' + str);
    }
    const r = RANKS.indexOf(str[0].toUpperCase());
    const s = SUITS.indexOf(str[1].toLowerCase());
    if (r < 0 || s < 0) throw new Error('Invalid card: ' + str);
    return makeCard(r, s);
  }

  /** "As Kd 7h" -> [51, 45, 22] */
  function parseCards(str) {
    return str.trim().split(/\s+/).filter(Boolean).map(cardFromString);
  }

  function cardsToString(cards) {
    return cards.map(cardToString).join(' ');
  }

  function freshDeck() {
    const deck = new Array(52);
    for (let i = 0; i < 52; i++) deck[i] = i;
    return deck;
  }

  /** Fisher–Yates qarışdırma (yerində). rng() [0, 1) qaytarmalıdır. */
  function shuffle(array, rng) {
    const random = rng || defaultRng;
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const t = array[i];
      array[i] = array[j];
      array[j] = t;
    }
    return array;
  }

  /** Kriptoqrafik mənbə varsa onu, yoxdursa Math.random istifadə edir. */
  const cryptoObj = typeof globalThis !== 'undefined' && globalThis.crypto &&
    typeof globalThis.crypto.getRandomValues === 'function' ? globalThis.crypto : null;
  const buffer = new Uint32Array(128);
  let bufferPos = buffer.length;

  function defaultRng() {
    if (!cryptoObj) return Math.random();
    if (bufferPos >= buffer.length) {
      cryptoObj.getRandomValues(buffer);
      bufferPos = 0;
    }
    return buffer[bufferPos++] / 4294967296;
  }

  /** Toxumlu (təkrarlana bilən) sürətli generator — testlər və bot simulyasiyası üçün. */
  function seededRng(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomSeed() {
    return Math.floor(defaultRng() * 4294967296) >>> 0;
  }

  return {
    RANKS,
    SUITS,
    SUIT_SYMBOLS,
    RANK_LABELS,
    rankOf,
    suitOf,
    makeCard,
    isRed,
    cardToString,
    cardFromString,
    parseCards,
    cardsToString,
    freshDeck,
    shuffle,
    defaultRng,
    seededRng,
    randomSeed
  };
});
