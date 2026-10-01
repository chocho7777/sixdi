/*
 * Tətbiqin başladılması: masa (LocalTable) ↔ görüntü (TableView) ↔ panel (Controls).
 * Hadisələr ardıcıl, animasiyalarla göstərilir; animasiya bitəndən sonra
 * masa növbəti addımı atır.
 */
(function (root) {
  'use strict';

  const ns = root.Poker;
  const T = ns.I18n.T;
  const fmt = ns.I18n.formatChips;

  function $(id) {
    return document.getElementById(id);
  }

  // ------------------------------------------------------------------
  // Böyütmə və sürüşmənin qarşısını almaq (iOS Safari)
  // ------------------------------------------------------------------

  function lockGestures() {
    const prevent = function (e) { e.preventDefault(); };
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (type) {
      document.addEventListener(type, prevent, { passive: false });
    });
    document.addEventListener('touchmove', function (e) {
      if (e.touches && e.touches.length > 1) {
        e.preventDefault();
        return;
      }
      const scroller = e.target.closest && e.target.closest('.scrollable');
      if (!scroller || scroller.scrollHeight <= scroller.clientHeight) e.preventDefault();
    }, { passive: false });
    document.addEventListener('dblclick', prevent, { passive: false });
    document.addEventListener('contextmenu', prevent);
    document.addEventListener('selectstart', prevent);
  }

  // ------------------------------------------------------------------

  function App() {
    const storage = ns.Storage.createStorage();
    this.table = new ns.LocalTable({ storage: storage });
    this.humanSeat = this.table.humanSeat;
    this.view = new ns.TableView({ humanSeat: this.humanSeat, seatCount: this.table.opts.seats });
    const self = this;
    this.controls = new ns.Controls({
      onAction: function (action) { return self.table.act(action); },
      onNext: function () { self.nextHand(); }
    });
    this.nextTimer = null;
    this.storageOk = storage.available;
    this.view.setSpeed(this.table.getSettings().speed);
  }

  App.prototype.start = function () {
    const self = this;
    this._texts();
    this._bindOverlays();
    this.view.layout();
    const relayout = function () { self.view.layout(); };
    root.addEventListener('resize', relayout);
    root.addEventListener('orientationchange', function () { setTimeout(relayout, 300); });
    if (root.visualViewport) root.visualViewport.addEventListener('resize', relayout);
    this.controls.waiting();
    this.table.subscribe(function (events) { return self.present(events); });
    this.table.start();
    if (!this.storageOk) setTimeout(function () { self.view.toast(T.storageOff, 4000); }, 1500);
  };

  App.prototype._texts = function () {
    document.title = 'Texas Hold\'em Poker';
    $('rotateText').textContent = T.rotate;
    $('bustedTitle').textContent = T.bustedTitle;
    $('restartBtn').textContent = T.restart;
    $('openRules').textContent = T.rulesButton;
    $('newGameBtn').textContent = T.newGame;
    $('virtualNote').textContent = T.chipsVirtual;
    $('confirmNo').textContent = T.cancel;
    $('confirmYes').textContent = T.start;
    $('rulesHowTitle').textContent = T.rulesHowTitle;
    document.querySelectorAll('[data-t]').forEach(function (node) {
      const key = node.getAttribute('data-t');
      if (typeof T[key] === 'string') node.textContent = T[key];
    });
    const seg = $('speedSeg').querySelectorAll('button');
    seg[0].textContent = T.speedNormal;
    seg[1].textContent = T.speedFast;
    this._buildRules();
  };

  App.prototype._buildRules = function () {
    const box = $('rankings');
    box.textContent = '';
    T.rankings.forEach(function (r, i) {
      const row = document.createElement('div');
      row.className = 'ranking';
      const no = document.createElement('div');
      no.className = 'ranking-no';
      no.textContent = String(i + 1);
      const text = document.createElement('div');
      text.className = 'ranking-text';
      text.innerHTML = '<div class="ranking-name"></div><div class="ranking-desc"></div>';
      text.firstChild.textContent = r.name;
      text.lastChild.textContent = r.desc;
      const cards = document.createElement('div');
      cards.className = 'ranking-cards';
      ns.Cards.parseCards(r.cards).forEach(function (c) { cards.appendChild(ns.TableView.createCard(c)); });
      row.appendChild(no);
      row.appendChild(text);
      row.appendChild(cards);
      box.appendChild(row);
    });
    const how = $('rulesHow');
    how.textContent = '';
    T.rulesHow.forEach(function (line) {
      const li = document.createElement('li');
      li.textContent = line;
      how.appendChild(li);
    });
  };

  // ------------------------------------------------------------------
  // Pəncərələr
  // ------------------------------------------------------------------

  App.prototype._bindOverlays = function () {
    const self = this;
    $('menuBtn').addEventListener('click', function () { self.openMenu(); });
    $('helpBtn').addEventListener('click', function () { self.open('rulesOverlay'); });
    $('openRules').addEventListener('click', function () {
      self.close('menuOverlay');
      self.open('rulesOverlay');
    });
    document.querySelectorAll('.overlay').forEach(function (ov) {
      ov.addEventListener('click', function (e) {
        if (e.target === ov && ov.id !== 'bustedOverlay') self.close(ov.id);
      });
      ov.querySelectorAll('[data-close]').forEach(function (b) {
        b.addEventListener('click', function () { self.close(ov.id); });
      });
    });
    $('speedSeg').addEventListener('click', function (e) {
      const speed = e.target && e.target.getAttribute('data-speed');
      if (!speed) return;
      self.table.setSpeed(speed);
      self.view.setSpeed(speed);
      self._renderSpeed();
    });
    $('newGameBtn').addEventListener('click', function () {
      $('confirmText').textContent = T.newGameConfirm(self.table.opts.startingChips);
      self.open('confirmOverlay');
    });
    $('confirmNo').addEventListener('click', function () { self.close('confirmOverlay'); });
    $('confirmYes').addEventListener('click', function () {
      self.close('confirmOverlay');
      self.close('menuOverlay');
      self.restart();
    });
    $('restartBtn').addEventListener('click', function () {
      self.close('bustedOverlay');
      self.restart();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        self.controls.closeRaise();
        ['rulesOverlay', 'menuOverlay', 'confirmOverlay'].forEach(function (id) { self.close(id); });
      }
    });
  };

  App.prototype.open = function (id) {
    $(id).hidden = false;
  };

  App.prototype.close = function (id) {
    $(id).hidden = true;
  };

  App.prototype.anyOverlayOpen = function () {
    return Array.prototype.some.call(document.querySelectorAll('.overlay'), function (o) { return !o.hidden; });
  };

  App.prototype.openMenu = function () {
    const st = this.table.getStats();
    const box = $('statsBox');
    box.textContent = '';
    const add = function (label, value, cls) {
      const d = document.createElement('div');
      d.className = 'stat' + (cls ? ' ' + cls : '');
      d.innerHTML = '<div class="stat-label"></div><div class="stat-value"></div>';
      d.firstChild.textContent = label;
      d.lastChild.textContent = value;
      if (cls && cls.indexOf('balance') >= 0) d.lastChild.classList.add('gold');
      box.appendChild(d);
    };
    add(T.balance, fmt(st.chips + this._committed()) + ' ♣︎', 'wide balance');
    add(T.handsPlayed, fmt(st.handsPlayed));
    const pct = st.handsPlayed ? ' (' + Math.round((st.handsWon / st.handsPlayed) * 100) + '%)' : '';
    add(T.handsWon, fmt(st.handsWon) + pct);
    add(T.biggestPot, st.biggestPot ? fmt(st.biggestPot) : '—');
    add(T.bestHand, st.bestHand || '—');
    this._renderSpeed();
    this.open('menuOverlay');
  };

  /** Hazırkı əldə qoyulmuş fişkalar (balansa daxil göstərmək üçün). */
  App.prototype._committed = function () {
    const p = this.table.game.player(this.humanSeat);
    return this.table.game.inProgress && p ? p.totalBet : 0;
  };

  App.prototype._renderSpeed = function () {
    const speed = this.table.getSettings().speed;
    $('speedSeg').querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-speed') === speed);
    });
  };

  App.prototype.restart = function () {
    this._clearNext();
    this.controls.hideAll();
    this.view.hideResult();
    this.view.clearFx();
    this.table.restart();
  };

  // ------------------------------------------------------------------
  // Növbəti əl
  // ------------------------------------------------------------------

  App.prototype._clearNext = function () {
    if (this.nextTimer) clearTimeout(this.nextTimer);
    this.nextTimer = null;
  };

  App.prototype.scheduleNext = function (humanInvolved) {
    this._clearNext();
    const fast = this.table.getSettings().speed === 'fast';
    const ms = (fast ? 2600 : 4200) + (humanInvolved ? 800 : 0);
    this.controls.showNext(ms);
    const self = this;
    this.nextTimer = setTimeout(function tick() {
      if (self.anyOverlayOpen()) {
        self.nextTimer = setTimeout(tick, 800);
        return;
      }
      self.nextTimer = null;
      self.nextHand();
    }, ms);
  };

  App.prototype.nextHand = function () {
    this._clearNext();
    if (this.table.nextHand()) {
      this.controls.waiting();
      this.controls.setStatus('');
    }
  };

  // ------------------------------------------------------------------
  // Hadisələrin göstərilməsi
  // ------------------------------------------------------------------

  App.prototype.present = async function (events) {
    for (const e of events) {
      try {
        await this.handle(e);
      } catch (err) {
        console.error(err);
        if (e.state) this.view.render(e.state);
      }
    }
  };

  App.prototype.handle = async function (e) {
    const view = this.view;
    const controls = this.controls;
    const st = e.state;
    const human = this.humanSeat;
    const nameOf = function (seat) {
      const p = st.players[seat];
      return seat === human ? T.you : p ? p.name : '';
    };

    switch (e.type) {
      case 'sync':
        view.clearFx();
        view.hideResult();
        view.render(st);
        if (st.phase === 'betting') {
          if (st.toAct === human) controls.showActions(st);
          else {
            controls.waiting();
            view.setThinking(st.toAct, true);
            if (st.toAct >= 0) controls.setStatus(T.waitingFor(nameOf(st.toAct)));
          }
        }
        break;

      case 'seat':
        view.render(st);
        view.toast(e.previous ? T.replaced(e.previous, e.name) : T.joined(e.name));
        break;

      case 'handStart':
        this._clearNext();
        controls.waiting();
        controls.setStatus('');
        view.hideResult();
        view.clearThinking();
        view.clearFx();
        view.render(st);
        await view.pause(260);
        break;

      case 'blind':
        await view.betChips(e.seat, st);
        view.popBubble(e.seat);
        break;

      case 'deal':
        await view.dealHoleCards(e.order, st);
        break;

      case 'turn':
        view.clearThinking();
        view.render(st);
        if (e.seat === human) {
          controls.showActions(st);
        } else {
          controls.waiting();
          view.setThinking(e.seat, true);
          const me = st.players[human];
          if (me && me.inHand && me.folded) controls.setStatus(T.youFolded);
          else controls.setStatus(T.waitingFor(nameOf(e.seat)));
        }
        break;

      case 'action':
        view.setThinking(e.seat, false);
        if (e.seat === human) controls.waiting();
        if (e.action === 'fold') {
          await view.muck(e.seat, st);
          if (e.seat === human) controls.setStatus(T.youFolded);
        } else if (e.amount > 0) {
          await view.betChips(e.seat, st);
          if (e.seat === human && e.allIn) controls.setStatus(T.youAllIn, true);
        } else {
          view.render(st);
        }
        view.popBubble(e.seat);
        await view.pause(e.seat === human ? 120 : 280);
        break;

      case 'return':
        await view.returnChips(e.seat, st);
        break;

      case 'collect':
        await view.collectBets(st);
        break;

      case 'reveal':
        view.clearThinking();
        controls.waiting();
        controls.setStatus(T.runout, true);
        await view.pause(300);
        await view.revealHands(e.hands, st);
        await view.pause(500);
        break;

      case 'board': {
        const runout = st.toAct < 0;
        await view.pause(runout ? 750 : 260);
        await view.dealBoard(st, e.cards.length);
        await view.pause(runout ? 300 : 120);
        break;
      }

      case 'showdown':
        view.clearThinking();
        controls.waiting();
        controls.setStatus(T.showdown);
        await view.revealHands(e.hands, st);
        e.hands.forEach(function (h) {
          const s = view.seats[h.seat];
          s.bubble.hidden = false;
          s.bubble.className = 'bubble a-hand';
          s.bubble.textContent = h.text;
          view.popBubble(h.seat);
        });
        await view.pause(800);
        break;

      case 'win': {
        view.clearThinking();
        await view.awardPots(e.pots, st);
        const won = e.pots.reduce(function (sum, pot) {
          return sum + pot.winners.filter(function (w) { return w.seat === human; })
            .reduce(function (s, w) { return s + w.amount; }, 0);
        }, 0);
        controls.setStatus(won > 0 ? T.youWon + ' +' + fmt(won) : '', won > 0);
        await view.pause(450);
        break;
      }

      case 'handEnd': {
        view.render(st);
        view.showResult(st);
        const me = st.players[human];
        if (me && me.chips > 0) this.scheduleNext(!!(me.inHand && !me.folded));
        else controls.hideAll();
        break;
      }

      case 'busted':
        this._clearNext();
        controls.hideAll();
        controls.setStatus('');
        $('bustedText').textContent = T.bustedText(this.table.opts.startingChips);
        await view.pause(600);
        this.open('bustedOverlay');
        break;

      default:
        if (st) view.render(st);
    }
  };

  function boot() {
    lockGestures();
    const app = new App();
    root.pokerApp = app;
    app.start();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
