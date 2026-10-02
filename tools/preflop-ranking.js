/*
 * 169 başlanğıc əlin sıralamasını hesablayır və js/ai/bot.js-dəki
 * PREFLOP_ORDER sətrini çıxarır.
 *
 * Sıralama iki göstəricinin ortalamasıdır:
 *   - təsadüfi bir ələ qarşı qələbə payı (təkbətək),
 *   - üç təsadüfi ələ qarşı qələbə payı (çoxnəfərli bank).
 * Beləliklə kiçik cütlər və eyni mastlı ardıcıl kartlar daha real yer tutur.
 *
 *   node tools/preflop-ranking.js [trials]
 */
'use strict';
const Cards = require('../js/engine/cards.js');
const E = require('../js/engine/evaluator.js');

const trials = Number(process.argv[2] || 40000);
const rng = Cards.seededRng(99);
const R = Cards.RANKS;
const classes = [];
for (let hi = 12; hi >= 0; hi--) {
  for (let lo = hi; lo >= 0; lo--) {
    if (hi === lo) classes.push({ name: R[hi] + R[lo], hole: [Cards.makeCard(hi, 0), Cards.makeCard(lo, 1)] });
    else {
      classes.push({ name: R[hi] + R[lo] + 's', hole: [Cards.makeCard(hi, 0), Cards.makeCard(lo, 0)] });
      classes.push({ name: R[hi] + R[lo] + 'o', hole: [Cards.makeCard(hi, 0), Cards.makeCard(lo, 1)] });
    }
  }
}

function equity(hole, opponents) {
  const rest = Cards.freshDeck().filter((c) => !hole.includes(c));
  const need = 5 + opponents * 2;
  const mine = new Array(7);
  const opp = new Array(7);
  let score = 0;
  for (let t = 0; t < trials; t++) {
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(rng() * (rest.length - i));
      const x = rest[i]; rest[i] = rest[j]; rest[j] = x;
    }
    mine[0] = hole[0]; mine[1] = hole[1];
    for (let b = 0; b < 5; b++) mine[2 + b] = rest[b];
    const my = E.evaluate(mine);
    let best = -1, ties = 0;
    for (let o = 0; o < opponents; o++) {
      opp[0] = rest[5 + o * 2]; opp[1] = rest[6 + o * 2];
      for (let b = 0; b < 5; b++) opp[2 + b] = rest[b];
      const s = E.evaluate(opp);
      if (s > best) { best = s; ties = 0; }
      if (s === best) ties++;
    }
    if (my > best) score += 1;
    else if (my === best) score += 1 / (ties + 1);
  }
  return score / trials;
}

for (const cls of classes) {
  cls.hu = equity(cls.hole, 1);
  cls.multi = equity(cls.hole, 3);
}
function percentileBy(key) {
  const sorted = classes.slice().sort((a, b) => b[key] - a[key]);
  sorted.forEach((c, i) => { c[key + 'Rank'] = i; });
}
percentileBy('hu');
percentileBy('multi');
classes.forEach((c) => { c.blend = c.huRank + c.multiRank; });
classes.sort((a, b) => a.blend - b.blend || b.hu - a.hu);
console.log('PREFLOP_ORDER:');
console.log(classes.map((c) => c.name).join(' '));
