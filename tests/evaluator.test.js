'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Cards = require('../js/engine/cards.js');
const E = require('../js/engine/evaluator.js');

const C = Cards.parseCards;
const ev = (s) => E.evaluate(C(s));
const cat = (s) => E.categoryOf(ev(s));

test('kateqoriyalar düzgün tanınır (7 kart)', () => {
  assert.equal(cat('Ah Kh Qh Jh Th 2c 3d'), E.CATEGORY.STRAIGHT_FLUSH);
  assert.equal(cat('5s 4s 3s 2s As Kd Kc'), E.CATEGORY.STRAIGHT_FLUSH);
  assert.equal(cat('9c 9d 9h 9s 2c 3d 4h'), E.CATEGORY.QUADS);
  assert.equal(cat('7c 7d 7h 5s 5c 2d 3h'), E.CATEGORY.FULL_HOUSE);
  assert.equal(cat('7c 7d 7h 5s 5c 5d 3h'), E.CATEGORY.FULL_HOUSE);
  assert.equal(cat('2h 7h 9h Jh Kh Ac Ad'), E.CATEGORY.FLUSH);
  assert.equal(cat('As 2d 3c 4h 5s Kd Kc'), E.CATEGORY.STRAIGHT);
  assert.equal(cat('Ts Jd Qc Kh As 2d 2c'), E.CATEGORY.STRAIGHT);
  assert.equal(cat('8s 8d 8c Kh 2s 4d 9c'), E.CATEGORY.TRIPS);
  assert.equal(cat('8s 8d Kc Kh 2s 2d 9c'), E.CATEGORY.TWO_PAIR);
  assert.equal(cat('8s 8d Kc Qh 2s 4d 9c'), E.CATEGORY.PAIR);
  assert.equal(cat('8s 3d Kc Qh 2s 4d 9c'), E.CATEGORY.HIGH_CARD);
});

test('strit-flaş müqayisələri', () => {
  assert.ok(ev('Ah Kh Qh Jh Th 2c 3d') > ev('Kh Qh Jh Th 9h 2c 3d'), 'royal > K-high SF');
  assert.ok(ev('6s 5s 4s 3s 2s Kd Kc') > ev('5s 4s 3s 2s As Kd Kc'), '6-high SF > steel wheel');
  assert.ok(ev('5s 4s 3s 2s As Kd Kc') > ev('9c 9d 9h 9s Ac Ad Ah'), 'steel wheel > quads');
});

test('strit: A–5 ən zəif, A ilə yuxarı ən güclü', () => {
  assert.ok(ev('6d 2d 3c 4h 5s Kd Kc') > ev('As 2d 3c 4h 5s Kd Kc'), '6-high > wheel');
  assert.ok(ev('As 2d 3c 4h 5s Kd Kc') > ev('Ks Kd Kh 4h 5s 9d 2c'), 'wheel > trips');
  assert.ok(ev('Ts Jd Qc Kh As 2d 2c') > ev('9s Td Jc Qh Ks 2d 2c'), 'broadway > K-high');
  // 7 ardıcıl kart: ən yüksək strit
  assert.equal(ev('3c 4d 5h 6s 7c 8d 9h'), ev('5h 6s 7c 8d 9h 2c 2d'));
});

test('flaş: ən yaxşı 5 kart götürülür, kikerlər müqayisə olunur', () => {
  assert.ok(ev('Ah 9h 7h 5h 3h 2h Kc') > ev('Ah 9h 7h 5h 2h Kc Qc'));
  assert.ok(ev('Ah Kh 3h 4h 6h Qc Qd') > ev('Ah Qh Jh Th 8h 2c 2d'));
  assert.ok(ev('2h 3h 4h 5h 7h Ac Ad') > ev('As Ks Qs Jd Tc 2c 3d'), 'flush > straight');
  assert.ok(ev('2h 2d 2c 3h 3d Ac Kd') > ev('Ah Kh Qh Jh 9h 2c 3d'), 'full house > flush');
});

test('full-haus: üçlük əvvəl, sonra cüt; iki üçlükdən ən yaxşısı', () => {
  assert.ok(ev('Ac Ad Ah Kc Kd 2s 3s') > ev('Kc Kd Kh Ac Ad 2s 3s'));
  assert.equal(ev('7c 7d 7h 5s 5c 5d 3h'), ev('7c 7d 7h 5s 5c 2d 3h'), '777 55 = 777 555');
  assert.ok(ev('7c 7d 7h Ks Kc 5d 5h') > ev('7c 7d 7h Qs Qc 5d 5h'));
});

test('kare: kiker qərar verir', () => {
  assert.ok(ev('9c 9d 9h 9s Ac 2d 3h') > ev('9c 9d 9h 9s Kc Qd Jh'));
  assert.equal(ev('9c 9d 9h 9s Ac 2d 3h'), ev('9c 9d 9h 9s Ad Ah Kh'));
});

test('iki cüt: üç cüt olduqda üçüncü cüt kiker ola bilər', () => {
  assert.ok(ev('Kc Kd 8h 8s 5c 5d Qh') > ev('Kc Kd 8h 8s 5c 5d Jh'));
  assert.equal(ev('Kc Kd 8h 8s 7c 7d 2h'), ev('Kc Kd 8h 8s 7c 2d 3h'), 'kicker 7');
  assert.ok(ev('Kc Kd 8h 8s 7c 7d 2h') < ev('Kc Kd 8h 8s Ac 2d 3h'));
  assert.ok(ev('Ac Ad 3h 3s 4c 9d Th') > ev('Kc Kd Qh Qs 4c 9d Th'));
});

test('cüt və yüksək kart kikerləri', () => {
  assert.ok(ev('Ac Kd 8h 7s 2c 4d 3h') > ev('Ac Qd 8h 7s 2c 4d 3h'));
  assert.ok(ev('As Ad Kh 7s 2c 4d 9h') > ev('Ac Ah Qh 7s 2c 4d 9h'));
  assert.equal(ev('As Ad Kh Qs Jc 4d 3h'), ev('Ac Ah Kd Qc Jd 2d 3c'), '6-7 kartlar oynamır');
});

test('bestFive ən yaxşı 5 kartı qaytarır', () => {
  const r = E.bestFive(C('Ah Kh Qh Jh Th 2c 3d'));
  assert.equal(r.score, ev('Ah Kh Qh Jh Th'));
  assert.deepEqual(r.cards.slice().sort((a, b) => a - b), C('Ah Kh Qh Jh Th').sort((a, b) => a - b));
  const wheel = E.bestFive(C('As 2d 3c 4h 5s Kd Kc'));
  assert.equal(Cards.cardsToString(wheel.cards), '5s 4h 3c 2d As');
  const fh = E.bestFive(C('2c Kd 2h Ks 2s 9c 4d'));
  assert.equal(Cards.cardsToString(fh.cards), '2s 2h 2c Ks Kd');
});

test('Azərbaycan dilində adlar', () => {
  assert.equal(E.describe(ev('Ah Kh Qh Jh Th 2c 3d')).text, 'Royal-flaş');
  assert.equal(E.describe(ev('9h Kh Qh Jh Th 2c 3d')).text, 'Strit-flaş (9–K)');
  assert.equal(E.describe(ev('As 2d 3c 4h 5s Kd Qc')).text, 'Strit (A–5)');
  assert.equal(E.describe(ev('7c 7d 7h Ks Kc 5d 5h')).text, 'Full-haus (7 və K)');
  assert.equal(E.describe(ev('Tc Td 4h 4s 2c 8d 9h')).text, 'İki cüt (10 və 4)');
  assert.equal(E.describe(ev('Qc Qd 4h 5s 2c 8d 9h')).text, 'Cüt (Q)');
  assert.equal(E.describe(ev('9c 9d 9h 9s Ac 2d 3h')).text, 'Kare (9)');
  assert.equal(E.describe(E.evaluate(C('As Kd'))).text, 'Yüksək kart (A)');
  assert.equal(E.describe(E.evaluate(C('8s 8d'))).text, 'Cüt (8)');
});

test('bütün 2 598 960 beşkartlıq əl: kateqoriya sayları və 7462 fərqli dəyər', () => {
  const counts = new Array(9).fill(0);
  const distinct = new Set();
  const c = [0, 0, 0, 0, 0];
  for (let a = 0; a < 48; a++) for (let b = a + 1; b < 49; b++) for (let d = b + 1; d < 50; d++)
    for (let e = d + 1; e < 51; e++) for (let f = e + 1; f < 52; f++) {
      c[0] = a; c[1] = b; c[2] = d; c[3] = e; c[4] = f;
      const s = E.evaluate(c);
      counts[s >> 20]++;
      distinct.add(s);
    }
  assert.deepEqual(counts, [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40]);
  assert.equal(distinct.size, 7462);
});

// Müstəqil, sadə (sıralama əsaslı) 5 kartlıq qiymətləndirici — sıralamanı yoxlamaq üçün.
function reference5(cards) {
  const ranks = cards.map((c) => (c >> 2) + 2).sort((a, b) => b - a);
  const suits = cards.map((c) => c & 3);
  const flush = suits.every((s) => s === suits[0]);
  const groups = {};
  ranks.forEach((r) => { groups[r] = (groups[r] || 0) + 1; });
  const byGroup = Object.keys(groups).map(Number)
    .sort((a, b) => groups[b] - groups[a] || b - a);
  const shape = byGroup.map((r) => groups[r]).join('');
  let straightHigh = 0;
  if (byGroup.length === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
    else if (ranks.join(',') === '14,5,4,3,2') straightHigh = 5;
  }
  if (straightHigh && flush) return [8, straightHigh];
  if (shape === '41') return [7].concat(byGroup);
  if (shape === '32') return [6].concat(byGroup);
  if (flush) return [5].concat(ranks);
  if (straightHigh) return [4, straightHigh];
  if (shape === '311') return [3].concat(byGroup);
  if (shape === '221') return [2].concat(byGroup);
  if (shape === '2111') return [1].concat(byGroup);
  return [0].concat(ranks);
}

function cmpArr(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

test('müstəqil qiymətləndirici ilə 200 000 təsadüfi müqayisə üst-üstə düşür', () => {
  const rng = Cards.seededRng(777);
  for (let i = 0; i < 200000; i++) {
    const deck = Cards.shuffle(Cards.freshDeck(), rng);
    const a = deck.slice(0, 5);
    const b = deck.slice(5, 10);
    const got = Math.sign(E.evaluate(a) - E.evaluate(b));
    const want = cmpArr(reference5(a), reference5(b));
    if (got !== want) {
      assert.fail(Cards.cardsToString(a) + ' vs ' + Cards.cardsToString(b) + ': ' + got + ' != ' + want);
    }
  }
});

test('7 kartlıq qiymət = 21 beşlik kombinasiyanın maksimumu', () => {
  const rng = Cards.seededRng(4242);
  for (let i = 0; i < 20000; i++) {
    const cards = Cards.shuffle(Cards.freshDeck(), rng).slice(0, 7);
    assert.equal(E.evaluate(cards), E.bestFive(cards).score, Cards.cardsToString(cards));
  }
});
