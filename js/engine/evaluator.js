/*
 * Əl qiymətləndirmə (5–7 kart).
 *
 * evaluate(cards) bir tam ədəd (score) qaytarır: böyük ədəd = güclü əl.
 * Strukturu: kateqoriya << 20 | beş "rank" yuvası (hər biri 4 bit).
 * Eyni kateqoriyada yuvalar həmişə eyni mənanı daşıyır, ona görə iki
 * əli sadəcə ədəd kimi müqayisə etmək kifayətdir.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./cards.js'));
  } else {
    const ns = (root.Poker = root.Poker || {});
    ns.Evaluator = factory(ns.Cards);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Cards) {
  'use strict';

  const CATEGORY = {
    HIGH_CARD: 0,
    PAIR: 1,
    TWO_PAIR: 2,
    TRIPS: 3,
    STRAIGHT: 4,
    FLUSH: 5,
    FULL_HOUSE: 6,
    QUADS: 7,
    STRAIGHT_FLUSH: 8
  };

  const CATEGORY_NAMES = [
    'Yüksək kart',
    'Cüt',
    'İki cüt',
    'Üçlük',
    'Strit',
    'Flaş',
    'Full-haus',
    'Kare',
    'Strit-flaş'
  ];
  const ROYAL_FLUSH_NAME = 'Royal-flaş';

  // Təkrar istifadə olunan buferlər (zibil yaratmamaq üçün).
  const counts = new Int32Array(13);
  const suitCounts = new Int32Array(4);
  const suitMasks = new Int32Array(4);

  function makeScore(cat, a, b, c, d, e) {
    return (cat << 20) | ((a || 0) << 16) | ((b || 0) << 12) | ((c || 0) << 8) | ((d || 0) << 4) | (e || 0);
  }

  /** Bit maskasında ən yüksək stritin yuxarı rankı, yoxdursa -1. A-2-3-4-5 = 3. */
  function straightHigh(mask) {
    for (let hi = 12; hi >= 4; hi--) {
      if (((mask >> (hi - 4)) & 31) === 31) return hi;
    }
    if ((mask & 0x100f) === 0x100f) return 3;
    return -1;
  }

  /** Maskadan ən yüksək n rankı (except rankı xaric) götürür. */
  function topRanks(mask, n, out) {
    let k = 0;
    for (let r = 12; r >= 0 && k < n; r--) {
      if (mask & (1 << r)) out[k++] = r;
    }
    while (k < n) out[k++] = 0;
    return out;
  }

  const tmp = [0, 0, 0, 0, 0];

  /**
   * 5–7 kartın ən yaxşı 5 kartlıq kombinasiyasının qiyməti.
   * (Daha az kartla da işləyir — məs. preflopda iki kartın adı üçün.)
   */
  function evaluate(cards) {
    const len = cards.length;
    counts.fill(0);
    suitCounts.fill(0);
    suitMasks.fill(0);
    let rankMask = 0;
    for (let i = 0; i < len; i++) {
      const c = cards[i];
      const r = c >> 2;
      const s = c & 3;
      counts[r]++;
      suitCounts[s]++;
      suitMasks[s] |= 1 << r;
      rankMask |= 1 << r;
    }

    let flushSuit = -1;
    for (let s = 0; s < 4; s++) {
      if (suitCounts[s] >= 5) flushSuit = s;
    }
    if (flushSuit >= 0) {
      const sf = straightHigh(suitMasks[flushSuit]);
      if (sf >= 0) return makeScore(CATEGORY.STRAIGHT_FLUSH, sf);
    }

    let quad = -1;
    let trip1 = -1;
    let trip2 = -1;
    let pair1 = -1;
    let pair2 = -1;
    for (let r = 12; r >= 0; r--) {
      const n = counts[r];
      if (n === 4) {
        quad = r;
      } else if (n === 3) {
        if (trip1 < 0) trip1 = r;
        else if (trip2 < 0) trip2 = r;
      } else if (n === 2) {
        if (pair1 < 0) pair1 = r;
        else if (pair2 < 0) pair2 = r;
      }
    }

    if (quad >= 0) {
      topRanks(rankMask & ~(1 << quad), 1, tmp);
      return makeScore(CATEGORY.QUADS, quad, tmp[0]);
    }

    if (trip1 >= 0 && (trip2 >= 0 || pair1 >= 0)) {
      return makeScore(CATEGORY.FULL_HOUSE, trip1, Math.max(trip2, pair1));
    }

    if (flushSuit >= 0) {
      topRanks(suitMasks[flushSuit], 5, tmp);
      return makeScore(CATEGORY.FLUSH, tmp[0], tmp[1], tmp[2], tmp[3], tmp[4]);
    }

    const st = straightHigh(rankMask);
    if (st >= 0) return makeScore(CATEGORY.STRAIGHT, st);

    if (trip1 >= 0) {
      topRanks(rankMask & ~(1 << trip1), 2, tmp);
      return makeScore(CATEGORY.TRIPS, trip1, tmp[0], tmp[1]);
    }

    if (pair2 >= 0) {
      topRanks(rankMask & ~(1 << pair1) & ~(1 << pair2), 1, tmp);
      return makeScore(CATEGORY.TWO_PAIR, pair1, pair2, tmp[0]);
    }

    if (pair1 >= 0) {
      topRanks(rankMask & ~(1 << pair1), 3, tmp);
      return makeScore(CATEGORY.PAIR, pair1, tmp[0], tmp[1], tmp[2]);
    }

    topRanks(rankMask, 5, tmp);
    return makeScore(CATEGORY.HIGH_CARD, tmp[0], tmp[1], tmp[2], tmp[3], tmp[4]);
  }

  function categoryOf(score) {
    return score >> 20;
  }

  /** score-un yuvalarını rank massivi kimi qaytarır. */
  function scoreRanks(score) {
    return [(score >> 16) & 15, (score >> 12) & 15, (score >> 8) & 15, (score >> 4) & 15, score & 15];
  }

  /**
   * Ən yaxşı beş kartı da tapır (vurğulamaq üçün).
   * 7 kart üçün 21 kombinasiyanı yoxlayır — UI üçün kifayət qədər sürətlidir.
   */
  function bestFive(cards) {
    const n = cards.length;
    if (n <= 5) return { score: evaluate(cards), cards: cards.slice() };
    let bestScore = -1;
    let best = null;
    const combo = [0, 0, 0, 0, 0];
    for (let a = 0; a < n - 4; a++) {
      for (let b = a + 1; b < n - 3; b++) {
        for (let c = b + 1; c < n - 2; c++) {
          for (let d = c + 1; d < n - 1; d++) {
            for (let e = d + 1; e < n; e++) {
              combo[0] = cards[a];
              combo[1] = cards[b];
              combo[2] = cards[c];
              combo[3] = cards[d];
              combo[4] = cards[e];
              const s = evaluate(combo);
              if (s > bestScore) {
                bestScore = s;
                best = combo.slice();
              }
            }
          }
        }
      }
    }
    return { score: bestScore, cards: sortForDisplay(best, bestScore) };
  }

  /** Kombinasiyanı göstərmək üçün sıralayır (məs. cütlər əvvəl). */
  function sortForDisplay(cards, score) {
    const cat = categoryOf(score);
    const cnt = {};
    cards.forEach(function (c) {
      const r = c >> 2;
      cnt[r] = (cnt[r] || 0) + 1;
    });
    const wheel = (cat === CATEGORY.STRAIGHT || cat === CATEGORY.STRAIGHT_FLUSH) && ((score >> 16) & 15) === 3;
    return cards.slice().sort(function (x, y) {
      const rx = x >> 2;
      const ry = y >> 2;
      if (cnt[rx] !== cnt[ry]) return cnt[ry] - cnt[rx];
      const vx = wheel && rx === 12 ? -1 : rx;
      const vy = wheel && ry === 12 ? -1 : ry;
      if (vx !== vy) return vy - vx;
      return (y & 3) - (x & 3);
    });
  }

  function rankLabel(r) {
    return Cards.RANK_LABELS[r];
  }

  /** Kombinasiyanın Azərbaycan dilində adı və qısa izahı. */
  function describe(score) {
    const cat = categoryOf(score);
    const r = scoreRanks(score);
    let name = CATEGORY_NAMES[cat];
    let detail = '';
    switch (cat) {
      case CATEGORY.STRAIGHT_FLUSH:
        if (r[0] === 12) {
          name = ROYAL_FLUSH_NAME;
        } else {
          detail = rankLabel(r[0] === 3 ? 12 : r[0] - 4) + '–' + rankLabel(r[0]);
        }
        break;
      case CATEGORY.QUADS:
        detail = rankLabel(r[0]);
        break;
      case CATEGORY.FULL_HOUSE:
        detail = rankLabel(r[0]) + ' və ' + rankLabel(r[1]);
        break;
      case CATEGORY.FLUSH:
        detail = rankLabel(r[0]);
        break;
      case CATEGORY.STRAIGHT:
        detail = rankLabel(r[0] === 3 ? 12 : r[0] - 4) + '–' + rankLabel(r[0]);
        break;
      case CATEGORY.TRIPS:
        detail = rankLabel(r[0]);
        break;
      case CATEGORY.TWO_PAIR:
        detail = rankLabel(r[0]) + ' və ' + rankLabel(r[1]);
        break;
      case CATEGORY.PAIR:
        detail = rankLabel(r[0]);
        break;
      default:
        detail = rankLabel(r[0]);
    }
    return {
      category: cat,
      name: name,
      detail: detail,
      text: detail ? name + ' (' + detail + ')' : name
    };
  }

  function compare(a, b) {
    return a - b;
  }

  return {
    CATEGORY,
    CATEGORY_NAMES,
    ROYAL_FLUSH_NAME,
    evaluate,
    bestFive,
    describe,
    categoryOf,
    scoreRanks,
    straightHigh,
    compare
  };
});
