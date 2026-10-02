/*
 * LocalTable — oyunçu + 4 bot üçün yerli masa.
 *
 * Mühərriki (HoldemGame) və botları idarə edir, vəziyyəti yadda saxlayır.
 * İnterfeys yalnız bu interfeysdən istifadə edir:
 *   subscribe(fn)  — fn(events) hadisə paketlərini alır (Promise qaytara bilər:
 *                    növbəti addım animasiya bitəndən sonra atılır)
 *   start()        — saxlanmış oyunu bərpa edir və ya yeni əl başladır
 *   act(action)    — oyunçunun hərəkəti
 *   nextHand()     — növbəti əl
 *   restart()      — hər şeyi sıfırla
 * Gələcəkdə onlayn rejim üçün eyni interfeysə malik "RemoteTable" (WebSocket)
 * yazmaq kifayətdir — interfeys kodu dəyişmədən qalır.
 *
 * Hadisələr HoldemGame hadisələridir (oyunçu üçün maskalanmış), üstəlik:
 *   {type:'sync'}   — tam vəziyyəti animasiyasız göstər
 *   {type:'seat', seat, name, previous} — masaya yeni bot oturdu
 *   {type:'busted'} — oyunçunun fişkası bitdi
 *   {type:'stats', stats}
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../engine/cards.js'),
      require('../engine/game.js'),
      require('../ai/bot.js'),
      require('./storage.js')
    );
  } else {
    const ns = (root.Poker = root.Poker || {});
    ns.LocalTable = factory(ns.Cards, ns.Game, ns.Bot, ns.Storage);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Cards, HoldemGame, Bot, Storage) {
  'use strict';

  const SAVE_VERSION = 1;

  const DEFAULTS = {
    seats: 5,
    humanSeat: 0,
    humanName: 'Sən',
    startingChips: 2000,
    smallBlind: 10,
    bigBlind: 20,
    botNames: ['Elvin', 'Leyla', 'Rəşad', 'Nigar', 'Tural', 'Aysel', 'Kamran', 'Günay',
      'Fərid', 'Nərmin', 'Vüqar', 'Lalə', 'Emil', 'Aytən', 'Samir', 'Səbinə'],
    // Botun "fikirləşmə" müddəti (ms): [min, max]
    thinkTime: { normal: [700, 1300], fast: [280, 560] }
  };

  function emptyStats() {
    return { handsPlayed: 0, handsWon: 0, biggestPot: 0, bestHand: null, bestScore: -1 };
  }

  class LocalTable {
    /**
     * @param options
     *   storage: Storage.createStorage(...) nəticəsi (default: localStorage)
     *   rng: kart qarışdırmaq üçün
     *   schedule(fn, ms) / cancel(id): taymerlər (testlərdə əvəz edilir)
     */
    constructor(options) {
      options = options || {};
      this.opts = Object.assign({}, DEFAULTS, options);
      this.humanSeat = this.opts.humanSeat;
      this.storage = options.storage || Storage.createStorage();
      this.rng = options.rng || Cards.defaultRng;
      this.botRng = options.botRng || Cards.seededRng(Cards.randomSeed());
      this.schedule = options.schedule || function (fn, ms) { return setTimeout(fn, ms); };
      this.cancel = options.cancel || function (id) { clearTimeout(id); };
      this.listeners = [];
      this.timer = null;
      this.pending = 0;
      this.chain = Promise.resolve();
      this.uid = 0;
      this._load();
    }

    // ------------------------------------------------------------------
    // Vəziyyət
    // ------------------------------------------------------------------

    _load() {
      const saved = this.storage.load();
      if (saved && saved.version === SAVE_VERSION && saved.game) {
        try {
          this.game = HoldemGame.restore(saved.game, this.rng);
          if (this.game.seatCount !== this.opts.seats || !this.game.player(this.humanSeat)) {
            throw new Error('seat layout');
          }
          this.bots = saved.bots || {};
          this.stats = Object.assign(emptyStats(), saved.stats);
          this.settings = Object.assign({ speed: 'normal' }, saved.settings);
          this.uid = saved.uid || 0;
          this._ensureBotProfiles();
          return;
        } catch (e) {
          /* zədələnmiş yaddaş: yeni oyun */
        }
      }
      this.settings = Object.assign({ speed: 'normal' }, saved && saved.settings);
      this._newGame();
    }

    _newGame() {
      const players = [];
      const used = [];
      this.bots = {};
      for (let seat = 0; seat < this.opts.seats; seat++) {
        if (seat === this.humanSeat) {
          players.push({ id: 'human', name: this.opts.humanName, chips: this.opts.startingChips });
        } else {
          const name = this._pickName(used);
          used.push(name);
          players.push({ id: 'bot' + ++this.uid, name: name, chips: this.opts.startingChips });
          this.bots[seat] = { profile: Bot.randomProfileKey(this.botRng) };
        }
      }
      this.game = new HoldemGame({
        players: players,
        smallBlind: this.opts.smallBlind,
        bigBlind: this.opts.bigBlind,
        rng: this.rng
      });
      this.stats = emptyStats();
    }

    _ensureBotProfiles() {
      for (let seat = 0; seat < this.opts.seats; seat++) {
        if (seat === this.humanSeat) continue;
        if (!this.bots[seat] || !Bot.PROFILES[this.bots[seat].profile]) {
          this.bots[seat] = { profile: Bot.randomProfileKey(this.botRng) };
        }
      }
    }

    _pickName(used) {
      const free = this.opts.botNames.filter(function (n) { return used.indexOf(n) < 0; });
      const list = free.length ? free : this.opts.botNames;
      return list[Math.floor(this.botRng() * list.length)];
    }

    _save() {
      this.storage.save({
        version: SAVE_VERSION,
        game: this.game.serialize(),
        bots: this.bots,
        stats: this.stats,
        settings: this.settings,
        uid: this.uid
      });
    }

    get human() {
      return this.game.player(this.humanSeat);
    }

    getView() {
      return this.game.getView(this.humanSeat);
    }

    getStats() {
      return Object.assign({ chips: this.human.chips }, this.stats);
    }

    getSettings() {
      return Object.assign({}, this.settings);
    }

    setSpeed(speed) {
      this.settings.speed = speed === 'fast' ? 'fast' : 'normal';
      this._save();
    }

    botProfile(seat) {
      return this.bots[seat] ? this.bots[seat].profile : 'solid';
    }

    // ------------------------------------------------------------------
    // Hadisələr
    // ------------------------------------------------------------------

    subscribe(fn) {
      this.listeners.push(fn);
      const self = this;
      return function () {
        self.listeners = self.listeners.filter(function (x) { return x !== fn; });
      };
    }

    _meta(type, extra) {
      return Object.assign({ type: type }, extra, { state: this.game.snapshot() });
    }

    _emit(events) {
      const last = events[events.length - 1];
      if (last && last.type === 'handEnd' && this.human.chips <= 0) events = events.concat(this._meta('busted'));
      const seat = this.humanSeat;
      const masked = events.map(function (e) { return HoldemGame.maskEvent(e, seat); });
      this._trackStats(events);
      this._save();
      const game = this.game;
      const self = this;
      this.pending++;
      this.chain = this.chain
        .then(function () {
          return Promise.all(self.listeners.map(function (fn) {
            try {
              return fn(masked);
            } catch (err) {
              console.error(err);
              return null;
            }
          }));
        })
        .catch(function (err) { console.error(err); })
        .then(function () {
          self.pending--;
          if (self.game === game) self._pump();
        });
      return this.chain;
    }

    /** Növbəti addımı planlaşdırır (botun növbəsidirsə). */
    _pump() {
      if (this.pending > 0 || this.timer) return;
      const s = this.game.state;
      if (s.phase !== 'betting' || s.toAct < 0 || s.toAct === this.humanSeat) return;
      const seat = s.toAct;
      const range = this.opts.thinkTime[this.settings.speed] || this.opts.thinkTime.normal;
      let delay = range[0] + this.botRng() * (range[1] - range[0]);
      const h = this.human;
      if (!h.inHand || h.folded || h.allIn) delay *= 0.55; // oyunçu oynamırsa, tez keç
      const game = this.game;
      const self = this;
      this.timer = this.schedule(function () {
        self.timer = null;
        if (self.game === game) self._botMove(seat);
      }, delay);
    }

    _botMove(seat) {
      const game = this.game;
      const s = game.state;
      if (s.phase !== 'betting' || s.toAct !== seat) return;
      let events;
      try {
        const action = Bot.decide(game.getView(seat), { profile: this.botProfile(seat), rng: this.botRng });
        events = game.act(seat, action);
      } catch (err) {
        console.error(err);
        events = game.act(seat, game.defaultAction(seat));
      }
      this._emit(events);
    }

    _trackStats(events) {
      for (const e of events) {
        if (e.type !== 'win') continue;
        const human = e.state.players[this.humanSeat];
        if (!human || !human.inHand) continue;
        this.stats.handsPlayed++;
        let won = 0;
        for (const pot of e.pots) {
          for (const w of pot.winners) if (w.seat === this.humanSeat) won += w.amount;
        }
        if (won > 0) {
          this.stats.handsWon++;
          this.stats.biggestPot = Math.max(this.stats.biggestPot, won);
        }
        const result = e.state.result;
        const mine = result && result.hands.find(function (hand) { return hand.seat === human.seat; });
        if (mine && won > 0 && mine.score > this.stats.bestScore) {
          this.stats.bestScore = mine.score;
          this.stats.bestHand = mine.text;
        }
      }
    }

    // ------------------------------------------------------------------
    // İdarəetmə
    // ------------------------------------------------------------------

    /** Saxlanmış oyunu göstərir; əl getmirsə, yenisini başladır. */
    start() {
      const sync = this._meta('sync');
      if (this.game.state.phase === 'betting') {
        this._emit([sync]);
      } else if (this.human.chips <= 0) {
        this._emit([sync, this._meta('busted')]);
      } else {
        this._emit([sync].concat(this._dealNext()));
      }
    }

    /** Oyunçunun hərəkəti. Qəbul olunarsa true qaytarır. */
    act(action) {
      if (this.pending > 0) return false;
      const s = this.game.state;
      if (s.phase !== 'betting' || s.toAct !== this.humanSeat) return false;
      let events;
      try {
        events = this.game.act(this.humanSeat, action);
      } catch (err) {
        return false;
      }
      this._emit(events);
      return true;
    }

    canAct() {
      const s = this.game.state;
      return this.pending === 0 && s.phase === 'betting' && s.toAct === this.humanSeat;
    }

    nextHand() {
      if (this.pending > 0 || this.game.state.phase === 'betting') return false;
      if (this.human.chips <= 0) {
        this._emit([this._meta('busted')]);
        return false;
      }
      this._emit(this._dealNext());
      return true;
    }

    _dealNext() {
      const events = this._refillBots();
      Array.prototype.push.apply(events, this.game.startHand());
      return events;
    }

    /** Fişkası bitən botların yerinə yeniləri oturur. */
    _refillBots() {
      const events = [];
      const used = this.game.state.players.filter(Boolean).map(function (p) { return p.name; });
      for (let seat = 0; seat < this.opts.seats; seat++) {
        if (seat === this.humanSeat) continue;
        const p = this.game.player(seat);
        if (p && p.chips > 0) continue;
        const previous = p ? p.name : null;
        const name = this._pickName(used);
        used.push(name);
        this.game.seatPlayer(seat, { id: 'bot' + ++this.uid, name: name, chips: this.opts.startingChips });
        this.bots[seat] = { profile: Bot.randomProfileKey(this.botRng) };
        events.push(this._meta('seat', { seat: seat, name: name, previous: previous }));
      }
      return events;
    }

    /** Hər şeyi sıfırlayır (balans başlanğıc məbləğə qayıdır). */
    restart() {
      if (this.timer) {
        this.cancel(this.timer);
        this.timer = null;
      }
      const self = this;
      const settings = this.settings;
      this._newGame();
      this.settings = settings;
      this._save();
      // Əvvəlki animasiyalar bitəndən sonra başla.
      return this.chain.then(function () { self.start(); });
    }
  }

  LocalTable.DEFAULTS = DEFAULTS;
  return LocalTable;
});
