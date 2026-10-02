/*
 * Texas Hold'em (No-Limit) raund idarəsi.
 *
 * HoldemGame interfeysdən tam asılı deyil: heç bir DOM, taymer və ya
 * localStorage istifadə etmir. Bütün vəziyyət `state` obyektində saxlanır
 * və JSON kimi seriallaşdırıla bilər. Hər əməliyyat (startHand, act)
 * baş verənləri təsvir edən hadisələr (events) massivi qaytarır; hər
 * hadisənin `state` sahəsində həmin anın tam görüntüsü var.
 *
 * Onlayn multiplayer üçün: bu sinif serverdə işləyə bilər, hər oyunçuya
 * isə HoldemGame.maskEvent(event, seat) ilə yalnız onun görməli olduğu
 * məlumat (öz kartları + açılmış kartlar) göndərilir.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./cards.js'), require('./evaluator.js'), require('./pots.js'));
  } else {
    const ns = (root.Poker = root.Poker || {});
    ns.Game = factory(ns.Cards, ns.Evaluator, ns.Pots);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Cards, Evaluator, Pots) {
  'use strict';

  const STREETS = ['preflop', 'flop', 'turn', 'river'];
  const STATE_VERSION = 1;

  class PokerError extends Error {
    constructor(code, message) {
      super(message || code);
      this.name = 'PokerError';
      this.code = code;
    }
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function createPlayer(seat, info) {
    return {
      seat: seat,
      id: info.id != null ? String(info.id) : 'seat' + seat,
      name: info.name || 'Oyunçu ' + (seat + 1),
      chips: Math.max(0, Math.floor(info.chips || 0)),
      hole: [],
      bet: 0, // bu küçədə (street) qoyulan
      totalBet: 0, // bu əldə ümumi qoyulan
      folded: false,
      allIn: false,
      acted: false,
      lastLevel: -1, // bu küçədə son hərəkət etdiyi andakı mərc səviyyəsi (-1 = hələ danışmayıb)
      inHand: false,
      revealed: false,
      lastAction: null
    };
  }

  class HoldemGame {
    /**
     * @param {object} options
     *   players: [{id, name, chips} | null] — oturacaqlar (sıra saat əqrəbi istiqamətindədir)
     *   smallBlind, bigBlind
     *   rng: () => [0,1) (default: kriptoqrafik)
     *   state: əvvəl saxlanmış vəziyyət (serialize() nəticəsi)
     */
    constructor(options) {
      options = options || {};
      this.rng = options.rng || Cards.defaultRng;
      if (options.state) {
        HoldemGame.validateState(options.state);
        this.state = clone(options.state);
        return;
      }
      const bigBlind = Math.floor(options.bigBlind || 20);
      const smallBlind = Math.floor(options.smallBlind || Math.max(1, Math.floor(bigBlind / 2)));
      this.state = {
        version: STATE_VERSION,
        smallBlind: smallBlind,
        bigBlind: bigBlind,
        handNumber: 0,
        dealer: -1,
        sbSeat: -1,
        bbSeat: -1,
        phase: 'waiting', // 'waiting' | 'betting' | 'complete'
        street: null, // 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'
        board: [],
        deck: [],
        currentBet: 0,
        minRaise: bigBlind,
        toAct: -1,
        pots: [],
        players: (options.players || []).map(function (p, i) {
          return p ? createPlayer(i, p) : null;
        }),
        log: [],
        result: null
      };
    }

    static validateState(state) {
      if (!state || state.version !== STATE_VERSION || !Array.isArray(state.players)) {
        throw new PokerError('BAD_STATE', 'Unsupported game state');
      }
    }

    // ------------------------------------------------------------------
    // Oturacaqlar (yalnız əllər arasında dəyişdirilə bilər)
    // ------------------------------------------------------------------

    get inProgress() {
      return this.state.phase === 'betting';
    }

    get seatCount() {
      return this.state.players.length;
    }

    player(seat) {
      return this.state.players[seat] || null;
    }

    seatPlayer(seat, info) {
      this._assertBetweenHands();
      if (seat < 0 || seat > this.state.players.length) throw new PokerError('BAD_SEAT');
      this.state.players[seat] = createPlayer(seat, info);
      return this.state.players[seat];
    }

    removePlayer(seat) {
      this._assertBetweenHands();
      this.state.players[seat] = null;
    }

    setChips(seat, chips) {
      this._assertBetweenHands();
      const p = this.player(seat);
      if (!p) throw new PokerError('BAD_SEAT');
      p.chips = Math.max(0, Math.floor(chips));
    }

    setBlinds(smallBlind, bigBlind) {
      this._assertBetweenHands();
      this.state.smallBlind = Math.floor(smallBlind);
      this.state.bigBlind = Math.floor(bigBlind);
    }

    canStartHand() {
      return this.state.phase !== 'betting' && this._fundedSeats().length >= 2;
    }

    _assertBetweenHands() {
      if (this.state.phase === 'betting') throw new PokerError('HAND_IN_PROGRESS');
    }

    _fundedSeats() {
      const seats = [];
      this.state.players.forEach(function (p, i) {
        if (p && p.chips > 0) seats.push(i);
      });
      return seats;
    }

    // ------------------------------------------------------------------
    // Əlin başlanması
    // ------------------------------------------------------------------

    /**
     * Yeni əl: diler düyməsi, blaydlar, kartların paylanması.
     * options.dealer — diler oturacağını məcburi təyin etmək (testlər üçün)
     * options.deck — paylanma sırası ilə kartlar (testlər/təkrar üçün)
     */
    startHand(options) {
      options = options || {};
      const s = this.state;
      if (s.phase === 'betting') throw new PokerError('HAND_IN_PROGRESS');
      const seats = this._fundedSeats();
      if (seats.length < 2) throw new PokerError('NOT_ENOUGH_PLAYERS');

      s.handNumber += 1;
      s.players.forEach(function (p) {
        if (!p) return;
        p.hole = [];
        p.bet = 0;
        p.totalBet = 0;
        p.folded = false;
        p.allIn = false;
        p.acted = false;
        p.lastLevel = -1;
        p.revealed = false;
        p.lastAction = null;
        p.inHand = p.chips > 0;
      });
      s.board = [];
      s.pots = [];
      s.log = [];
      s.result = null;
      s.currentBet = 0;
      s.minRaise = s.bigBlind;
      s.toAct = -1;

      if (options.dealer != null) {
        if (seats.indexOf(options.dealer) < 0) throw new PokerError('BAD_SEAT');
        s.dealer = options.dealer;
      } else if (s.dealer < 0) {
        s.dealer = seats[Math.floor(this.rng() * seats.length)];
      } else {
        s.dealer = this._nextInHand(s.dealer);
      }

      if (seats.length === 2) {
        // Təkbətək: diler kiçik blaydı qoyur və preflopda birinci danışır.
        s.sbSeat = s.dealer;
        s.bbSeat = this._nextInHand(s.dealer);
      } else {
        s.sbSeat = this._nextInHand(s.dealer);
        s.bbSeat = this._nextInHand(s.sbSeat);
      }

      s.deck = this._buildDeck(options.deck);
      s.phase = 'betting';
      s.street = 'preflop';

      const events = [];
      this._emit(events, {
        type: 'handStart',
        handNumber: s.handNumber,
        dealer: s.dealer,
        sbSeat: s.sbSeat,
        bbSeat: s.bbSeat,
        seats: seats
      });

      this._postBlind(s.sbSeat, s.smallBlind, 'sb', events);
      this._postBlind(s.bbSeat, s.bigBlind, 'bb', events);
      // Böyük blayd tam qoyula bilməsə belə, digərləri tam blaydı bərabərləşdirməlidir.
      s.currentBet = s.bigBlind;
      s.minRaise = s.bigBlind;

      const order = [];
      let seat = s.dealer;
      for (let i = 0; i < seats.length; i++) {
        seat = this._nextInHand(seat);
        order.push(seat);
      }
      for (let round = 0; round < 2; round++) {
        for (const st of order) s.players[st].hole.push(s.deck.pop());
      }
      const hole = {};
      for (const st of order) hole[st] = s.players[st].hole.slice();
      this._emit(events, { type: 'deal', order: order, hole: hole });

      this._advance(events, s.bbSeat);
      return events;
    }

    _buildDeck(given) {
      if (!given) return Cards.shuffle(Cards.freshDeck(), this.rng);
      const seen = new Set();
      for (const c of given) {
        if (!(c >= 0 && c < 52) || seen.has(c)) throw new PokerError('BAD_DECK');
        seen.add(c);
      }
      const rest = Cards.shuffle(Cards.freshDeck().filter(function (c) { return !seen.has(c); }), this.rng);
      // pop() ilə paylanır, ona görə tərsinə saxlanılır.
      return given.concat(rest).reverse();
    }

    _postBlind(seat, amount, kind, events) {
      const p = this.state.players[seat];
      const paid = this._commit(p, amount);
      p.lastAction = { type: kind, amount: paid };
      if (p.allIn) p.lastAction.allIn = true;
      this.state.log.push({ street: 'preflop', seat: seat, type: kind, amount: paid, to: p.bet, allIn: p.allIn });
      this._emit(events, { type: 'blind', seat: seat, blind: kind, amount: paid, allIn: p.allIn });
    }

    // ------------------------------------------------------------------
    // Hərəkətlər
    // ------------------------------------------------------------------

    /** Növbəsi olan oyunçunun mümkün hərəkətləri (məbləğlər "cəmi ... qədər" mənasındadır). */
    legalActions(seat) {
      const s = this.state;
      if (s.phase !== 'betting' || seat !== s.toAct) return null;
      const p = s.players[seat];
      const toCall = Math.max(0, Math.min(s.currentBet - p.bet, p.chips));
      const maxTo = p.bet + p.chips;
      const othersCanAct = s.players.some(function (o) {
        return o && o !== p && o.inHand && !o.folded && !o.allIn;
      });
      // Tam artırma olmayan va-bank, artıq danışmış oyunçu üçün mərcləri yenidən açmır
      // (bir neçə qısa va-bankın cəmi tam artırmaya çatarsa — açır).
      const reopened = p.lastLevel < 0 || s.currentBet - p.lastLevel >= s.minRaise;
      const legal = {
        seat: seat,
        toCall: toCall,
        canFold: true,
        canCheck: toCall === 0,
        canCall: toCall > 0,
        callIsAllIn: toCall > 0 && toCall >= p.chips,
        canBet: false,
        canRaise: false,
        minTo: 0,
        maxTo: maxTo,
        currentBet: s.currentBet,
        minRaise: s.minRaise,
        bigBlind: s.bigBlind,
        pot: this.potTotal()
      };
      if (othersCanAct && p.chips > toCall && reopened) {
        if (s.currentBet === 0) {
          legal.canBet = true;
          legal.minTo = Math.min(s.bigBlind, maxTo);
        } else {
          legal.canRaise = true;
          legal.minTo = Math.min(s.currentBet + s.minRaise, maxTo);
        }
      }
      return legal;
    }

    /**
     * @param {number} seat
     * @param {{type: 'fold'|'check'|'call'|'bet'|'raise'|'allin', amount?: number}} action
     *   bet/raise üçün amount — bu küçədə oyunçunun ümumi mərci ("raise to").
     */
    act(seat, action) {
      const s = this.state;
      if (s.phase !== 'betting') throw new PokerError('NO_HAND', 'No hand in progress');
      if (seat !== s.toAct) throw new PokerError('NOT_YOUR_TURN', 'Not this seat\'s turn');
      const legal = this.legalActions(seat);
      const p = s.players[seat];
      let type = action && action.type;
      let to = action && action.amount != null ? Math.floor(Number(action.amount)) : NaN;

      if (type === 'allin') {
        if (legal.canBet || legal.canRaise) {
          type = 'raise';
          to = legal.maxTo;
        } else {
          type = legal.toCall > 0 ? 'call' : 'check';
        }
      }
      if (type === 'bet' || type === 'raise') type = s.currentBet === 0 ? 'bet' : 'raise';
      if (type === 'call' && legal.toCall === 0) type = 'check';

      const events = [];
      let added = 0;
      switch (type) {
        case 'fold':
          p.folded = true;
          p.acted = true;
          break;
        case 'check':
          if (!legal.canCheck) throw new PokerError('ILLEGAL_ACTION', 'Cannot check');
          p.acted = true;
          p.lastLevel = s.currentBet;
          break;
        case 'call':
          added = this._commit(p, legal.toCall);
          p.acted = true;
          p.lastLevel = s.currentBet;
          break;
        case 'bet':
        case 'raise': {
          if (!(type === 'bet' ? legal.canBet : legal.canRaise)) {
            throw new PokerError('ILLEGAL_ACTION', 'Cannot ' + type);
          }
          if (!Number.isFinite(to) || to < legal.minTo || to > legal.maxTo) {
            throw new PokerError('BAD_AMOUNT', 'Amount must be between ' + legal.minTo + ' and ' + legal.maxTo);
          }
          const raiseBy = to - s.currentBet;
          added = this._commit(p, to - p.bet);
          if (raiseBy >= s.minRaise) s.minRaise = raiseBy; // tam artırma
          s.currentBet = to;
          for (const o of s.players) {
            if (o && o !== p && o.inHand && !o.folded && !o.allIn) o.acted = false;
          }
          p.acted = true;
          p.lastLevel = s.currentBet;
          break;
        }
        default:
          throw new PokerError('ILLEGAL_ACTION', 'Unknown action: ' + type);
      }

      p.lastAction = { type: type, amount: added, to: p.bet };
      if (p.allIn) p.lastAction.allIn = true;
      s.log.push({ street: s.street, seat: seat, type: type, amount: added, to: p.bet, allIn: p.allIn });
      this._emit(events, { type: 'action', seat: seat, action: type, amount: added, to: p.bet, allIn: p.allIn });
      this._advance(events, seat);
      return events;
    }

    /** Vaxt bitəndə və s. üçün: mümkünsə çek, deyilsə pas. */
    defaultAction(seat) {
      const legal = this.legalActions(seat);
      if (!legal) return null;
      return legal.canCheck ? { type: 'check' } : { type: 'fold' };
    }

    _commit(p, amount) {
      const paid = Math.max(0, Math.min(Math.floor(amount), p.chips));
      p.chips -= paid;
      p.bet += paid;
      p.totalBet += paid;
      if (p.chips === 0) p.allIn = true;
      return paid;
    }

    // ------------------------------------------------------------------
    // Raundun irəliləməsi
    // ------------------------------------------------------------------

    _contenders() {
      return this.state.players.filter(function (p) {
        return p && p.inHand && !p.folded;
      });
    }

    _advance(events, fromSeat) {
      const s = this.state;
      const contenders = this._contenders();
      if (contenders.length === 1) {
        this._endRound(events);
        this._winUncontested(contenders[0], events);
        return;
      }
      if (!this._roundComplete()) {
        const next = this._nextToAct(fromSeat);
        if (next >= 0) {
          s.toAct = next;
          this._emit(events, { type: 'turn', seat: next });
          return;
        }
      }
      s.toAct = -1;
      this._endRound(events);
      this._nextStreet(events);
    }

    _roundComplete() {
      const s = this.state;
      const contenders = this._contenders();
      if (contenders.length <= 1) return true;
      const actors = contenders.filter(function (p) { return !p.allIn; });
      if (actors.length === 0) return true;
      if (actors.length === 1) {
        // Qarşıda cavab verə biləcək heç kim yoxdur: yalnız ən yüksək mərci bərabərləşdirmək lazımdır.
        let maxBet = 0;
        for (const p of contenders) maxBet = Math.max(maxBet, p.bet);
        return actors[0].bet >= maxBet;
      }
      return actors.every(function (p) { return p.acted && p.bet >= s.currentBet; });
    }

    _nextToAct(fromSeat) {
      const s = this.state;
      const n = s.players.length;
      for (let i = 1; i <= n; i++) {
        const seat = (fromSeat + i) % n;
        const p = s.players[seat];
        if (p && p.inHand && !p.folded && !p.allIn && (!p.acted || p.bet < s.currentBet)) return seat;
      }
      return -1;
    }

    _nextInHand(fromSeat) {
      const s = this.state;
      const n = s.players.length;
      for (let i = 1; i <= n; i++) {
        const seat = (((fromSeat + i) % n) + n) % n;
        const p = s.players[seat];
        if (p && p.inHand) return seat;
      }
      return -1;
    }

    /** Dilerin solundan başlayaraq əldə olan oturacaqlar. */
    _orderFromDealer() {
      const s = this.state;
      const n = s.players.length;
      const order = [];
      for (let i = 1; i <= n; i++) {
        const seat = (s.dealer + i) % n;
        const p = s.players[seat];
        if (p && p.inHand) order.push(seat);
      }
      return order;
    }

    _endRound(events) {
      this._returnUncalled(events);
      this._collect(events);
    }

    /** Heç kimin bərabərləşdirmədiyi artıq mərc sahibinə qaytarılır. */
    _returnUncalled(events) {
      let top = null;
      let topAmount = -1;
      let second = 0;
      for (const p of this.state.players) {
        if (!p || !p.inHand) continue;
        if (p.totalBet > topAmount) {
          second = Math.max(second, topAmount);
          topAmount = p.totalBet;
          top = p;
        } else if (p.totalBet > second) {
          second = p.totalBet;
        }
      }
      if (!top) return;
      const excess = Math.min(topAmount - second, top.bet);
      if (excess > 0) {
        top.chips += excess;
        top.bet -= excess;
        top.totalBet -= excess;
        if (top.chips > 0) top.allIn = false;
        this._emit(events, { type: 'return', seat: top.seat, amount: excess });
      }
    }

    _collect(events) {
      const s = this.state;
      let amount = 0;
      for (const p of s.players) {
        if (!p) continue;
        amount += p.bet;
        p.bet = 0;
      }
      s.pots = this._buildPots();
      this._emit(events, { type: 'collect', amount: amount, pots: clone(s.pots) });
    }

    _buildPots() {
      return Pots.buildPots(this.state.players.filter(function (p) {
        return p && p.inHand;
      }).map(function (p) {
        return { seat: p.seat, amount: p.totalBet - p.bet, folded: p.folded };
      }));
    }

    _nextStreet(events) {
      const s = this.state;
      for (;;) {
        const contenders = this._contenders();
        const actors = contenders.filter(function (p) { return !p.allIn; });
        const bettingOver = actors.length < 2;

        // Mərc bitib, lakin hələ kartlar açılacaq: hamının kartları üzü yuxarı çevrilir.
        if (bettingOver && s.board.length < 5 && contenders.some(function (p) { return !p.revealed; })) {
          contenders.forEach(function (p) { p.revealed = true; });
          this._emit(events, {
            type: 'reveal',
            hands: contenders.map(function (p) { return { seat: p.seat, hole: p.hole.slice() }; })
          });
        }

        if (s.street === 'river') {
          this._showdown(events);
          return;
        }

        s.street = STREETS[STREETS.indexOf(s.street) + 1];
        s.deck.pop(); // yandırılan kart
        const count = s.street === 'flop' ? 3 : 1;
        const cards = [];
        for (let i = 0; i < count; i++) cards.push(s.deck.pop());
        Array.prototype.push.apply(s.board, cards);
        s.currentBet = 0;
        s.minRaise = s.bigBlind;
        for (const p of s.players) {
          if (!p || !p.inHand) continue;
          p.acted = false;
          p.lastLevel = -1;
          if (!p.folded && !p.allIn) p.lastAction = null;
        }
        this._emit(events, { type: 'board', street: s.street, cards: cards, board: s.board.slice() });

        if (!bettingOver) {
          s.toAct = this._nextToAct(s.dealer);
          this._emit(events, { type: 'turn', seat: s.toAct });
          return;
        }
      }
    }

    _showdown(events) {
      const s = this.state;
      s.street = 'showdown';
      s.toAct = -1;
      const board = s.board;
      const hands = this._contenders().map(function (p) {
        const best = Evaluator.bestFive(p.hole.concat(board));
        const d = Evaluator.describe(best.score);
        p.revealed = true;
        return {
          seat: p.seat,
          hole: p.hole.slice(),
          score: best.score,
          best: best.cards,
          category: d.category,
          name: d.name,
          text: d.text
        };
      });
      this._emit(events, { type: 'showdown', hands: hands });

      const scores = {};
      hands.forEach(function (h) { scores[h.seat] = h.score; });
      const awards = Pots.awardPots(this._buildPots(), scores, this._orderFromDealer());
      for (const award of awards) {
        for (const w of award.winners) s.players[w.seat].chips += w.amount;
        award.hand = award.score != null ? Evaluator.describe(award.score).text : null;
      }
      s.pots = [];
      s.phase = 'complete';
      s.result = { uncontested: false, hands: hands, pots: awards };
      this._emit(events, { type: 'win', uncontested: false, pots: clone(awards) });
      this._finish(events);
    }

    _winUncontested(winner, events) {
      const s = this.state;
      let total = 0;
      for (const p of s.players) if (p && p.inHand) total += p.totalBet;
      winner.chips += total;
      s.toAct = -1;
      s.pots = [];
      s.phase = 'complete';
      const awards = [{ amount: total, eligible: [winner.seat], winners: [{ seat: winner.seat, amount: total }], score: null, hand: null }];
      s.result = { uncontested: true, hands: [], pots: awards };
      this._emit(events, { type: 'win', uncontested: true, pots: clone(awards) });
      this._finish(events);
    }

    _finish(events) {
      const s = this.state;
      s.phase = 'complete';
      s.toAct = -1;
      const busted = [];
      const chips = {};
      for (const p of s.players) {
        if (!p) continue;
        chips[p.seat] = p.chips;
        if (p.inHand && p.chips === 0) busted.push(p.seat);
      }
      this._emit(events, { type: 'handEnd', handNumber: s.handNumber, busted: busted, chips: chips });
    }

    // ------------------------------------------------------------------
    // Görüntülər və seriallaşdırma
    // ------------------------------------------------------------------

    potTotal() {
      let total = 0;
      for (const p of this.state.players) if (p) total += p.totalBet;
      return total;
    }

    /** Tam görüntü (bütün kartlarla, dəstə xaric). Oyunçuya göndərməzdən əvvəl maskalanmalıdır. */
    snapshot() {
      const s = this.state;
      return {
        handNumber: s.handNumber,
        phase: s.phase,
        street: s.street,
        dealer: s.dealer,
        sbSeat: s.sbSeat,
        bbSeat: s.bbSeat,
        smallBlind: s.smallBlind,
        bigBlind: s.bigBlind,
        board: s.board.slice(),
        currentBet: s.currentBet,
        minRaise: s.minRaise,
        toAct: s.toAct,
        pot: this.potTotal(),
        pots: clone(s.pots),
        players: s.players.map(function (p) {
          if (!p) return null;
          return {
            seat: p.seat,
            id: p.id,
            name: p.name,
            chips: p.chips,
            hole: p.hole.slice(),
            bet: p.bet,
            totalBet: p.totalBet,
            folded: p.folded,
            allIn: p.allIn,
            inHand: p.inHand,
            revealed: p.revealed,
            lastAction: p.lastAction ? Object.assign({}, p.lastAction) : null
          };
        }),
        legal: s.toAct >= 0 ? this.legalActions(s.toAct) : null,
        result: clone(s.result),
        log: clone(s.log)
      };
    }

    /** Konkret oyunçunun görə biləcəyi vəziyyət. */
    getView(seat) {
      return HoldemGame.maskSnapshot(this.snapshot(), seat);
    }

    serialize() {
      return clone(this.state);
    }

    static restore(state, rng) {
      return new HoldemGame({ state: state, rng: rng });
    }

    /** Başqa oyunçuların gizli kartlarını gizlədir. viewer = -1 → tamaşaçı. */
    static maskSnapshot(snap, viewer) {
      const view = Object.assign({}, snap);
      view.viewer = viewer;
      view.players = snap.players.map(function (p) {
        if (!p) return null;
        const visible = p.seat === viewer || p.revealed;
        return Object.assign({}, p, {
          hole: visible ? p.hole.slice() : null,
          cardCount: p.hole.length
        });
      });
      view.legal = snap.legal && snap.toAct === viewer ? Object.assign({}, snap.legal) : null;
      return view;
    }

    static maskEvent(event, viewer) {
      const out = Object.assign({}, event);
      if (event.state) out.state = HoldemGame.maskSnapshot(event.state, viewer);
      if (event.type === 'deal') {
        out.hole = {};
        if (event.hole[viewer]) out.hole[viewer] = event.hole[viewer].slice();
      }
      return out;
    }

    _emit(events, event) {
      event.state = this.snapshot();
      events.push(event);
    }
  }

  HoldemGame.STREETS = STREETS;
  HoldemGame.PokerError = PokerError;
  HoldemGame.STATE_VERSION = STATE_VERSION;

  return HoldemGame;
});
