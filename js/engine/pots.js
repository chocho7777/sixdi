/*
 * Bank (pot) hesablamaları: əsas bank, yan banklar və uduşun bölünməsi.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    (root.Poker = root.Poker || {}).Pots = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Oyunçuların ümumi qoyuluşlarından bankları qurur.
   * @param {Array<{seat:number, amount:number, folded:boolean}>} contributions
   * @returns {Array<{amount:number, eligible:number[]}>}
   *   Birinci element əsas bankdır, qalanları yan banklar.
   *   eligible — həmin bankı qazana bilən (pas deməmiş) oyunçular.
   */
  function buildPots(contributions) {
    const rest = contributions
      .filter(function (c) { return c.amount > 0; })
      .map(function (c) { return { seat: c.seat, amount: c.amount, folded: !!c.folded }; });
    const pots = [];

    for (;;) {
      let level = Infinity;
      for (const c of rest) {
        if (!c.folded && c.amount > 0 && c.amount < level) level = c.amount;
      }
      if (level === Infinity) break;

      let amount = 0;
      const eligible = [];
      for (const c of rest) {
        if (c.amount <= 0) continue;
        const take = Math.min(c.amount, level);
        amount += take;
        c.amount -= take;
        if (!c.folded) eligible.push(c.seat);
      }
      pots.push({ amount: amount, eligible: eligible.sort(function (a, b) { return a - b; }) });
    }

    // Normalda olmamalıdır (artıq mərc geri qaytarılır), amma pul itməsin.
    let leftover = 0;
    for (const c of rest) leftover += Math.max(0, c.amount);
    if (leftover > 0) {
      if (pots.length) pots[pots.length - 1].amount += leftover;
      else pots.push({ amount: leftover, eligible: [] });
    }

    // Eyni iştirakçıları olan ardıcıl bankları birləşdir.
    const merged = [];
    for (const pot of pots) {
      const last = merged[merged.length - 1];
      if (last && sameSeats(last.eligible, pot.eligible)) last.amount += pot.amount;
      else merged.push({ amount: pot.amount, eligible: pot.eligible.slice() });
    }
    return merged;
  }

  function sameSeats(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  /**
   * Bankları qaliblər arasında bölür.
   * @param pots buildPots nəticəsi
   * @param scores {seat: score} — açılışdakı əllərin qiyməti
   * @param order dilerdən soldan başlayan oturacaq sırası (tək fişka bu sıra ilə verilir)
   */
  function awardPots(pots, scores, order) {
    return pots.map(function (pot) {
      let best = -Infinity;
      let winners = [];
      for (const seat of pot.eligible) {
        const s = pot.eligible.length === 1 ? 0 : scores[seat];
        if (s > best) {
          best = s;
          winners = [seat];
        } else if (s === best) {
          winners.push(seat);
        }
      }
      winners.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
      const share = winners.length ? Math.floor(pot.amount / winners.length) : 0;
      let remainder = pot.amount - share * winners.length;
      const payouts = winners.map(function (seat) {
        const extra = remainder > 0 ? 1 : 0;
        remainder -= extra;
        return { seat: seat, amount: share + extra };
      });
      return {
        amount: pot.amount,
        eligible: pot.eligible.slice(),
        winners: payouts,
        score: pot.eligible.length === 1 ? null : best
      };
    });
  }

  return { buildPots, awardPots };
});
