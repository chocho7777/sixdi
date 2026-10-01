/*
 * Kompüter oyunçusu (bot) qərarları.
 *
 * Bot yalnız öz görüntüsünü (HoldemGame.getView(seat)) görür — başqalarının
 * kartlarını bilmir. Qərar:
 *   - preflop: əlin gücü (169 başlanğıc əlin sıralaması), mövqe, artırmanın ölçüsü;
 *   - flop/tern/river: Monte Carlo ilə qələbə ehtimalı (equity) rəqiblərin
 *     ehtimal olunan əllərinə qarşı; rəqiblərin mərcləri onların əl
 *     diapazonunu daraldır. Sonra bank əmsalı (pot odds) ilə müqayisə.
 * Xarakter (profil) botların fərqli oynamasını təmin edir.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../engine/cards.js'), require('../engine/evaluator.js'));
  } else {
    const ns = (root.Poker = root.Poker || {});
    ns.Bot = factory(ns.Cards, ns.Evaluator);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Cards, Evaluator) {
  'use strict';

  // tools/preflop-ranking.js ilə hesablanıb (təkbətək + 3 rəqibə qarşı qarışıq sıralama).
  const PREFLOP_ORDER = (
    'AA KK QQ JJ TT 99 AKs AQs 88 AJs AKo ATs AQo KQs 77 AJo KJs KTs A9s KQo ATo QJs A8s 66 KJo A7s ' +
    'QTs KTo A9o K9s A5s A6s QJo JTs Q9s K8s A8o A4s 55 A3s K7s QTo A7o K9o A2s J9s JTo Q8s T9s K6s A5o ' +
    'A6o K8o K5s A4o Q9o J8s 44 Q7s A3o K4s T8s J9o K7o Q6s 98s K3s J7s A2o T9o K6o Q8o Q5s K2s T7s J8o ' +
    '33 Q4s K5o 97s 87s T8o Q3s J6s K4o Q7o J5s T6s Q2s 98o J4s Q6o J7o 96s K3o J3s K2o Q5o 86s 22 76s ' +
    'T7o T5s J2s 97o T4s 95s 87o Q4o J6o 75s 65s T3s 85s Q3o Q2o J5o T2s T6o 94s 96o 54s 86o 84s J4o ' +
    '76o 74s 64s 93s J3o 92s J2o T5o 53s T4o 95o 83s 73s 85o 65o 63s 82s 75o 43s T3o T2o 52s 94o 54o ' +
    '93o 84o 72s 42s 62s 74o 64o 92o 32s 53o 83o 73o 63o 43o 82o 52o 72o 62o 42o 32o'
  ).split(' ');

  const PERCENTILE = new Float64Array(169);
  (function buildPercentiles() {
    let cumulative = 0;
    for (const name of PREFLOP_ORDER) {
      const hi = Cards.RANKS.indexOf(name[0]);
      const lo = Cards.RANKS.indexOf(name[1]);
      const suited = name[2] === 's';
      cumulative += hi === lo ? 6 : suited ? 4 : 12;
      PERCENTILE[classIndex(hi, lo, suited)] = cumulative / 1326;
    }
  })();

  function classIndex(hi, lo, suited) {
    return suited ? hi * 13 + lo : lo * 13 + hi;
  }

  /** Başlanğıc əlin faizi: 0.005 = ən güclü 0.5% (AA), 1 = ən zəif (32o). */
  function handPercentile(c1, c2) {
    let r1 = c1 >> 2;
    let r2 = c2 >> 2;
    if (r1 < r2) {
      const t = r1;
      r1 = r2;
      r2 = t;
    }
    const suited = r1 !== r2 && (c1 & 3) === (c2 & 3);
    return PERCENTILE[classIndex(r1, r2, suited)];
  }

  /**
   * Xarakterlər:
   *  looseness — nə qədər çox əl oynayır, aggression — mərc/artırma meyli,
   *  bluff — blef tezliyi, callDown — şübhəli vəziyyətdə bərabərləşmə meyli.
   */
  const PROFILES = {
    solid: { key: 'solid', looseness: 1.0, aggression: 0.6, bluff: 0.07, callDown: 0.5 },
    rock: { key: 'rock', looseness: 0.72, aggression: 0.4, bluff: 0.03, callDown: 0.35 },
    aggressive: { key: 'aggressive', looseness: 1.35, aggression: 0.85, bluff: 0.14, callDown: 0.5 },
    station: { key: 'station', looseness: 1.3, aggression: 0.25, bluff: 0.04, callDown: 0.85 }
  };
  const PROFILE_KEYS = Object.keys(PROFILES);

  function randomProfileKey(rng) {
    return PROFILE_KEYS[Math.floor((rng || Math.random)() * PROFILE_KEYS.length)];
  }

  function clamp(x, lo, hi) {
    return x < lo ? lo : x > hi ? hi : x;
  }

  // ------------------------------------------------------------------
  // Vəziyyətin təhlili
  // ------------------------------------------------------------------

  function buildContext(view, seat) {
    const me = view.players[seat];
    const opponents = view.players.filter(function (p) {
      return p && p.inHand && !p.folded && p.seat !== seat;
    });
    let maxOppStack = 0;
    for (const p of opponents) maxOppStack = Math.max(maxOppStack, p.chips + p.bet);
    const preflop = view.log.filter(function (e) { return e.street === 'preflop'; });
    let raises = 0;
    let limpers = 0;
    for (const e of preflop) {
      if (e.type === 'raise' || e.type === 'bet') raises++;
      else if (e.type === 'call' && raises === 0) limpers++;
    }
    return {
      view: view,
      seat: seat,
      me: me,
      legal: view.legal,
      opponents: opponents,
      bb: view.bigBlind,
      pot: view.pot,
      effStack: Math.min(me.chips + me.bet, maxOppStack),
      preflopRaises: raises,
      limpers: limpers,
      behind: playersBehind(view, seat)
    };
  }

  /** Preflopda məndən sonra (böyük blayd daxil) danışacaq oyunçuların sayı. */
  function playersBehind(view, seat) {
    if (seat === view.bbSeat) return 0;
    const n = view.players.length;
    let count = 0;
    for (let i = 1; i < n; i++) {
      const s = (seat + i) % n;
      const p = view.players[s];
      if (p && p.inHand && !p.folded && !p.allIn) count++;
      if (s === view.bbSeat) break;
    }
    return count;
  }

  /** Rəqibin hərəkətlərinə görə onun əl diapazonu (faiz) və aqressivliyi. */
  function opponentModel(view, seat) {
    let range = 1;
    let aggr = 0;
    let raises = 0;
    const bb = view.bigBlind;
    for (const e of view.log) {
      if (e.street === 'preflop') {
        if (e.type === 'sb' || e.type === 'bb') continue;
        if (e.seat === seat) {
          if (e.type === 'raise' || e.type === 'bet') {
            let r = raises === 0 ? 0.22 : raises === 1 ? 0.08 : 0.035;
            if (e.allIn && e.to > 25 * bb) r = Math.min(r, 0.06);
            range = Math.min(range, r);
          } else if (e.type === 'call') {
            range = Math.min(range, raises === 0 ? 0.6 : raises === 1 ? 0.26 : 0.08);
          }
        }
        if (e.type === 'raise' || e.type === 'bet') raises++;
      } else if (e.seat === seat) {
        if (e.type === 'bet') aggr += 0.3;
        else if (e.type === 'raise') aggr += 0.45;
        else if (e.type === 'call') aggr += 0.1;
        if (e.street === view.street && (e.type === 'bet' || e.type === 'raise')) aggr += 0.1;
      }
    }
    return { range: range, aggr: clamp(aggr, 0, 0.85) };
  }

  // ------------------------------------------------------------------
  // Monte Carlo qələbə ehtimalı
  // ------------------------------------------------------------------

  /**
   * Rəqibin mümkün əllərinin çəkili cədvəli: diapazondan kənar əllər çıxarılır,
   * aqressiv rəqib üçün "heç nəyi olmayan" əllərin çəkisi azalır.
   */
  function buildRangeTable(model, pool, board) {
    if (model.range >= 1 && (model.aggr <= 0 || board.length < 3)) return null; // məhdudiyyət yoxdur
    const boardCat = board.length >= 3 ? Evaluator.categoryOf(Evaluator.evaluate(board)) : 0;
    const partial = [0, 0].concat(board);
    const combos = [];
    const cumulative = [];
    let total = 0;
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const c1 = pool[i];
        const c2 = pool[j];
        if (model.range < 1 && handPercentile(c1, c2) > model.range) continue;
        let weight = 1;
        if (model.aggr > 0 && board.length >= 3) {
          partial[0] = c1;
          partial[1] = c2;
          const connects = Evaluator.categoryOf(Evaluator.evaluate(partial)) > boardCat ||
            (board.length < 5 && hasFlushDraw(c1, c2, board));
          if (!connects) weight = 1 - model.aggr;
        }
        total += weight;
        combos.push(c1, c2);
        cumulative.push(total);
      }
    }
    if (!combos.length) return null;
    return { combos: combos, cumulative: cumulative, total: total };
  }

  function sampleCombo(table, rng) {
    const x = rng() * table.total;
    let lo = 0;
    let hi = table.cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (table.cumulative[mid] > x) hi = mid;
      else lo = mid + 1;
    }
    return lo * 2;
  }

  /**
   * Monte Carlo ilə qələbə ehtimalı (bərabərlik payı daxil).
   * @param hole botun kartları, board ümumi kartlar
   * @param opponents [{range, aggr}] — hər rəqibin modeli (opponentModel)
   */
  function estimateEquity(hole, board, opponents, iterations, rng) {
    rng = rng || Math.random;
    const nOpp = opponents.length;
    if (nOpp === 0) return 1;
    const known = hole.concat(board);
    const pool = Cards.freshDeck().filter(function (c) { return known.indexOf(c) < 0; });
    const posOf = new Int32Array(52).fill(-1);
    pool.forEach(function (c, i) { posOf[c] = i; });
    const tables = opponents.map(function (m) { return buildRangeTable(m, pool, board); });

    const mine = [hole[0], hole[1], 0, 0, 0, 0, 0];
    const theirs = new Array(7);
    const fullBoard = board.slice();
    const oppHoles = new Array(nOpp * 2);
    let n;

    function take(card) {
      const i = posOf[card];
      const last = pool[n - 1];
      pool[i] = last;
      posOf[last] = i;
      pool[n - 1] = card;
      posOf[card] = n - 1;
      n--;
    }
    function takeRandom() {
      const card = pool[Math.floor(rng() * n)];
      take(card);
      return card;
    }

    let total = 0;
    for (let it = 0; it < iterations; it++) {
      n = pool.length;
      for (let k = 0; k < nOpp; k++) {
        const table = tables[k];
        let c1 = -1;
        let c2 = -1;
        if (table) {
          for (let tries = 0; tries < 20; tries++) {
            const idx = sampleCombo(table, rng);
            const a = table.combos[idx];
            const b = table.combos[idx + 1];
            if (posOf[a] < n && posOf[b] < n) {
              c1 = a;
              c2 = b;
              break;
            }
          }
        }
        if (c1 >= 0) {
          take(c1);
          take(c2);
        } else {
          c1 = takeRandom();
          c2 = takeRandom();
        }
        oppHoles[k * 2] = c1;
        oppHoles[k * 2 + 1] = c2;
      }
      for (let b = board.length; b < 5; b++) fullBoard[b] = takeRandom();
      for (let b = 0; b < 5; b++) {
        mine[2 + b] = fullBoard[b];
        theirs[2 + b] = fullBoard[b];
      }
      const my = Evaluator.evaluate(mine);
      let best = -1;
      let ties = 0;
      for (let k = 0; k < nOpp; k++) {
        theirs[0] = oppHoles[k * 2];
        theirs[1] = oppHoles[k * 2 + 1];
        const sc = Evaluator.evaluate(theirs);
        if (sc > best) {
          best = sc;
          ties = 1;
        } else if (sc === best) {
          ties++;
        }
      }
      if (my > best) total += 1;
      else if (my === best) total += 1 / (ties + 1);
    }
    return total / iterations;
  }

  /** Ən azı bir kartı əlində olan dörd eyni mastlı kart. */
  function hasFlushDraw(c1, c2, board) {
    const suits = [0, 0, 0, 0];
    suits[c1 & 3]++;
    suits[c2 & 3]++;
    for (const c of board) suits[c & 3]++;
    return suits[c1 & 3] >= 4 || suits[c2 & 3] >= 4;
  }

  // ------------------------------------------------------------------
  // Qərarlar
  // ------------------------------------------------------------------

  function preflopDecision(ctx, profile, rng) {
    const legal = ctx.legal;
    const me = ctx.me;
    const bb = ctx.bb;
    const pct = handPercentile(me.hole[0], me.hole[1]);
    const loose = profile.looseness;
    // Hədləri ±20% təsadüfi dəyişdir ki, botlar eyni vəziyyətdə həmişə eyni oynamasın.
    const jitter = 0.8 + rng() * 0.4;
    const effBB = ctx.effStack / bb;

    // Az fişka: ya va-bank, ya pas.
    if (effBB <= 12) {
      const pushRange = clamp((0.1 + (12 - effBB) * 0.02) * loose, 0.06, 0.5);
      if (ctx.preflopRaises === 0) {
        if (pct <= pushRange * jitter) return { type: 'allin' };
        return legal.canCheck ? { type: 'check' } : { type: 'fold' };
      }
      const price = legal.toCall / (ctx.pot + legal.toCall);
      const callRange = clamp(pushRange * (0.45 + Math.max(0, 0.45 - price)), 0.03, 0.4);
      if (pct <= callRange * jitter) return { type: 'allin' };
      return legal.canCheck ? { type: 'check' } : { type: 'fold' };
    }

    if (ctx.preflopRaises === 0) {
      const openByBehind = [0.12, 0.45, 0.33, 0.24, 0.18, 0.15, 0.13, 0.12, 0.11];
      let openRange = openByBehind[Math.min(ctx.behind, openByBehind.length - 1)] * loose;
      openRange -= ctx.limpers * 0.025;
      const premium = pct <= 0.03;
      if (pct <= openRange * jitter || premium) {
        if (premium || rng() < 0.55 + 0.45 * profile.aggression) {
          const size = (2.3 + rng() * 0.9 + ctx.limpers) * bb;
          return { type: 'raise', to: size };
        }
        return legal.canCheck ? { type: 'check' } : { type: 'call' };
      }
      if (legal.canCheck) return { type: 'check' };
      const limpRange = openRange * (1.1 + (1 - profile.aggression) * 0.5);
      if (pct <= limpRange * jitter) return { type: 'call' };
      // Kiçik blayd ucuz qiymətə tamamlaya bilər.
      if (ctx.seat === ctx.view.sbSeat && legal.toCall <= bb / 2 && pct <= 0.35 * loose) return { type: 'call' };
      return { type: 'fold' };
    }

    // Artırmaya cavab
    const toCall = legal.toCall;
    const price = toCall / (ctx.pot + toCall);
    const facingBB = legal.currentBet / bb;
    let continueRange = (0.15 * loose) / Math.pow(Math.max(1, facingBB / 3), 0.75);
    if (ctx.preflopRaises >= 2) continueRange *= 0.55;
    continueRange *= 1 + Math.max(0, 0.36 - price) * 1.6;
    continueRange = clamp(continueRange, 0.012, 0.45);
    const reraiseRange = Math.max(0.012, continueRange * (0.25 + 0.2 * profile.aggression));

    if (legal.canRaise && pct <= reraiseRange * jitter) {
      const to = ctx.preflopRaises >= 2 ? legal.currentBet * 2.3 : legal.currentBet * (2.8 + rng() * 0.6);
      return { type: 'raise', to: to };
    }
    if (pct <= continueRange * jitter || pct <= 0.0046) return { type: 'call' };
    if (legal.canRaise && ctx.preflopRaises === 1 && pct <= 0.5 && rng() < profile.bluff * 0.5) {
      return { type: 'raise', to: legal.currentBet * 3 };
    }
    return legal.canCheck ? { type: 'check' } : { type: 'fold' };
  }

  function postflopDecision(ctx, profile, rng, iterations) {
    const legal = ctx.legal;
    const view = ctx.view;
    const models = ctx.opponents.map(function (p) { return opponentModel(view, p.seat); });
    const n = models.length;
    const iters = iterations || (n === 1 ? 700 : n === 2 ? 550 : 420);
    const eq = estimateEquity(ctx.me.hole, view.board, models, iters, rng);
    const fair = 1 / (n + 1);
    const rel = (eq - fair) / (1 - fair);
    const pot = ctx.pot;
    const street = view.street;
    const aggr = profile.aggression;
    const potFraction = function (f) {
      return legal.currentBet + f * (pot + legal.toCall);
    };

    if (legal.toCall === 0) {
      if (rel >= 0.5 - aggr * 0.15) {
        if (rel > 0.85 && street !== 'river' && rng() < 0.2 * (1 - aggr)) return { type: 'check', eq: eq };
        return { type: 'bet', to: potFraction(0.5 + rng() * 0.3 + (rel > 0.8 ? 0.15 : 0)), eq: eq };
      }
      if (rel >= 0.2 && rng() < 0.3 + 0.5 * aggr) {
        return { type: 'bet', to: potFraction(0.35 + rng() * 0.25), eq: eq };
      }
      const bluffChance = profile.bluff * (n === 1 ? 1.3 : n === 2 ? 0.8 : 0.4) * (street === 'river' ? 0.8 : 1);
      if (rng() < bluffChance) return { type: 'bet', to: potFraction(0.45 + rng() * 0.25), eq: eq };
      if (street !== 'river' && rel > -0.05 && rng() < 0.15 * aggr) {
        return { type: 'bet', to: potFraction(0.5), eq: eq };
      }
      return { type: 'check', eq: eq };
    }

    const toCall = legal.toCall;
    const potOdds = toCall / (pot + toCall);
    const betRatio = toCall / Math.max(1, pot - toCall);
    const margin = 0.02 + (1 - profile.callDown) * 0.06 + Math.min(betRatio, 2) * 0.03;
    if (eq >= potOdds + margin) {
      if (legal.canRaise && rel >= 0.55 && rng() < 0.3 + 0.5 * aggr) {
        return { type: 'raise', to: potFraction(0.65 + rng() * 0.35), eq: eq };
      }
      return { type: 'call', eq: eq };
    }
    if (legal.canRaise && n === 1 && street !== 'river' && rng() < profile.bluff * 0.4) {
      return { type: 'raise', to: potFraction(0.7), eq: eq };
    }
    return { type: 'fold', eq: eq };
  }

  /** Qərarı qanuni hərəkətə çevirir: məbləğləri yuvarlaqlaşdırır, sərhədlərə salır. */
  function finalize(decision, legal, view) {
    const type = decision.type;
    if (type === 'fold') return legal.canCheck ? { type: 'check' } : { type: 'fold' };
    if (type === 'check') return legal.canCheck ? { type: 'check' } : { type: 'fold' };
    if (type === 'call') return legal.canCheck ? { type: 'check' } : { type: 'call' };

    const canAggress = legal.canBet || legal.canRaise;
    if (type === 'allin') {
      if (canAggress) return { type: legal.canBet ? 'bet' : 'raise', amount: legal.maxTo };
      return legal.canCheck ? { type: 'check' } : { type: 'call' };
    }
    // bet / raise
    if (!canAggress) return legal.canCheck ? { type: 'check' } : { type: 'call' };
    const step = Math.max(1, view.smallBlind || 1);
    let to = Math.round(decision.to / step) * step;
    to = clamp(to, legal.minTo, legal.maxTo);
    // Yığının çox hissəsi gedirsə, hamısını qoy (kiçik qalıq saxlamamaq üçün).
    if (to >= legal.maxTo * 0.7 || legal.maxTo - to < legal.bigBlind * 2) to = legal.maxTo;
    return { type: legal.canBet ? 'bet' : 'raise', amount: to };
  }

  /**
   * Əsas funksiya.
   * @param view HoldemGame.getView(seat) — botun öz görüntüsü (view.legal mövcud olmalıdır)
   * @param options {profile: 'solid'|'rock'|'aggressive'|'station'|object, rng, iterations}
   * @returns {{type: string, amount?: number}}
   */
  function decide(view, options) {
    options = options || {};
    const rng = options.rng || Math.random;
    let profile = options.profile || PROFILES.solid;
    if (typeof profile === 'string') profile = PROFILES[profile] || PROFILES.solid;
    const legal = view.legal;
    if (!legal) return null;
    const seat = legal.seat;
    const me = view.players[seat];
    if (!me || !me.hole || me.hole.length !== 2) return legal.canCheck ? { type: 'check' } : { type: 'fold' };
    const ctx = buildContext(view, seat);
    const raw = view.street === 'preflop'
      ? preflopDecision(ctx, profile, rng)
      : postflopDecision(ctx, profile, rng, options.iterations);
    return finalize(raw, legal, view);
  }

  return {
    PROFILES,
    PROFILE_KEYS,
    randomProfileKey,
    decide,
    handPercentile,
    estimateEquity,
    opponentModel
  };
});
