/*
 * Masanın görüntüsü: vəziyyətin (state) çəkilməsi və animasiyalar.
 * Yalnız maskalanmış görüntü ilə işləyir — oyun məntiqini bilmir.
 */
(function (root) {
  'use strict';

  const ns = root.Poker;
  const Cards = ns.Cards;
  const Evaluator = ns.Evaluator;
  const T = ns.I18n.T;
  const fmt = ns.I18n.formatChips;

  // ︎ — iOS-da mast simvollarının emoji kimi deyil, mətn kimi çəkilməsi üçün.
  const SUITS = Cards.SUIT_SYMBOLS.map(function (s) { return s + '︎'; });

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, Math.max(0, ms)); });
  }

  function setCardFace(node, card) {
    if (card == null) {
      if (!node.classList.contains('back')) {
        node.classList.add('back');
        node.classList.remove('red');
        node.textContent = '';
      }
      node.dataset.card = '';
      return;
    }
    const key = String(card);
    if (node.dataset.card === key && !node.classList.contains('back')) return;
    node.dataset.card = key;
    node.classList.remove('back');
    node.classList.toggle('red', Cards.isRed(card));
    const suit = SUITS[Cards.suitOf(card)];
    node.innerHTML = '<span class="rank">' + Cards.RANK_LABELS[Cards.rankOf(card)] + '</span>' +
      '<span class="suit">' + suit + '</span><span class="pip">' + suit + '</span>';
  }

  function createCard(card, sizeClass) {
    const node = el('div', 'card' + (sizeClass ? ' ' + sizeClass : ''));
    setCardFace(node, card);
    return node;
  }

  function hueFor(text) {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
    return h;
  }

  function chipColor(amount, bb) {
    const x = amount / (bb || 20);
    if (x < 5) return 'red';
    if (x < 25) return 'blue';
    if (x < 100) return 'green';
    if (x < 500) return 'black';
    return 'gold';
  }

  class TableView {
    /**
     * @param opts {humanSeat, seatCount}
     */
    constructor(opts) {
      this.humanSeat = opts.humanSeat;
      this.seatCount = opts.seatCount;
      this.app = document.getElementById('app');
      this.stage = document.getElementById('stage');
      this.fx = document.getElementById('fx');
      this.boardEl = document.getElementById('board');
      this.seatsEl = document.getElementById('seats');
      this.dealerBtn = document.getElementById('dealerBtn');
      this.deckSpot = document.getElementById('deckSpot');
      this.potEl = document.getElementById('pot');
      this.potAmount = document.getElementById('potAmount');
      this.potLabel = document.getElementById('potLabel');
      this.sidePots = document.getElementById('sidePots');
      this.streetLabel = document.getElementById('streetLabel');
      this.resultEl = document.getElementById('result');
      this.handNo = document.getElementById('handNo');
      this.blindsInfo = document.getElementById('blindsInfo');
      this.toastEl = document.getElementById('toast');
      this.speed = 1;
      this.reducedMotion = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
      this.state = null;
      this.lastPot = 0;
      this.potLabel.textContent = T.pot;
      this._buildBoard();
      this._buildSeats();
    }

    // ------------------------------------------------------------------
    // DOM qurulması
    // ------------------------------------------------------------------

    _buildBoard() {
      this.boardCards = [];
      for (let i = 0; i < 5; i++) {
        const slot = el('div', 'board-slot');
        const card = createCard(null);
        card.hidden = true;
        slot.appendChild(card);
        this.boardEl.appendChild(slot);
        this.boardCards.push(card);
      }
    }

    _buildSeats() {
      this.seats = [];
      for (let i = 0; i < this.seatCount; i++) {
        const hero = i === this.humanSeat;
        const root = el('div', 'seat pos-' + i + (hero ? ' hero' : ''));
        const cardsBox = el('div', 'seat-cards');
        const cards = [createCard(null, hero ? 'hero-card' : 'mini'), createCard(null, hero ? 'hero-card' : 'mini')];
        cards.forEach(function (c) { c.hidden = true; cardsBox.appendChild(c); });
        const avatar = el('div', 'avatar');
        const avatarText = el('span');
        avatar.appendChild(avatarText);
        const plate = el('div', 'plate');
        const name = el('div', 'name');
        const stack = el('div', 'stack');
        let strength = null;
        if (hero) {
          // Sənin yerində ad və hazırkı kombinasiya yan-yana sütunda
          const col = el('div', 'name-col');
          strength = el('div', 'hand-strength');
          strength.hidden = true;
          col.appendChild(name);
          col.appendChild(strength);
          plate.appendChild(col);
        } else {
          plate.appendChild(name);
        }
        plate.appendChild(stack);
        const bubble = el('div', 'bubble');
        bubble.hidden = true;
        root.appendChild(cardsBox);
        root.appendChild(avatar);
        root.appendChild(plate);
        root.appendChild(bubble);
        const bet = el('div', 'bet b-' + i);
        const betChip = el('span', 'chip');
        const betAmount = el('span');
        bet.appendChild(betChip);
        bet.appendChild(betAmount);
        bet.hidden = true;
        this.seatsEl.appendChild(root);
        this.seatsEl.appendChild(bet);
        this.seats.push({
          root: root, cardsBox: cardsBox, cards: cards, avatar: avatar, avatarText: avatarText,
          plate: plate, name: name, stack: stack, bubble: bubble, strength: strength,
          bet: bet, betChip: betChip, betAmount: betAmount, hero: hero
        });
      }
    }

    /** Ekran ölçüsünə görə miqyas. */
    layout() {
      const r = this.stage.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const u = Math.max(0.6, Math.min(r.width / 390, r.height / 600));
      this.app.style.setProperty('--u', u.toFixed(4));
    }

    setSpeed(speed) {
      this.speed = speed === 'fast' ? 0.55 : 1;
    }

    // ------------------------------------------------------------------
    // Çəkmə (animasiyasız)
    // ------------------------------------------------------------------

    /**
     * @param state maskalanmış görüntü
     * @param opts.hiddenHole Set('seat:index') — hələ "uçmaqda" olan kartlar
     * @param opts.hideBoardFrom — bu indeksdən sonrakı ümumi kartlar gizli
     * @param opts.hiddenBets Set(seat)
     */
    render(state, opts) {
      opts = opts || {};
      this.state = state;
      this.handNo.textContent = state.handNumber > 0 ? T.hand(state.handNumber) : T.appTitle;
      this.blindsInfo.textContent = T.blinds(state.smallBlind, state.bigBlind);

      const live = state.phase === 'betting';
      this.streetLabel.textContent = live ? (T.streets[state.street] || '') : '';

      // Bank (əl bitəndə fişkalar artıq qaliblərə paylanıb)
      if (live && state.pot > 0) {
        this.potEl.hidden = false;
        this.potAmount.textContent = fmt(state.pot);
      } else {
        this.potEl.hidden = true;
      }
      this._renderSidePots(state);

      // Ümumi kartlar
      const hideFrom = opts.hideBoardFrom != null ? opts.hideBoardFrom : 99;
      for (let i = 0; i < 5; i++) {
        const node = this.boardCards[i];
        const card = state.board[i];
        if (card == null) {
          node.hidden = true;
          node.classList.remove('win', 'dim', 'ghost');
          continue;
        }
        node.hidden = false;
        if (i >= hideFrom) {
          node.classList.add('ghost');
        } else {
          node.classList.remove('ghost');
          setCardFace(node, card);
        }
      }

      const winners = this._winnerSeats(state);
      for (let i = 0; i < this.seatCount; i++) this._renderSeat(i, state.players[i], state, opts, winners);

      // Diler düyməsi
      if (state.dealer >= 0 && state.handNumber > 0) {
        this.dealerBtn.hidden = false;
        this.dealerBtn.dataset.seat = String(state.dealer);
      } else {
        this.dealerBtn.hidden = true;
      }

      this._renderHighlights(state);
    }

    _renderSidePots(state) {
      const pots = state.pots || [];
      this.sidePots.textContent = '';
      if (pots.length < 2 || state.phase !== 'betting') return;
      pots.forEach(function (pot, i) {
        const label = i === 0 ? T.mainPot : T.sidePot(i);
        this.sidePots.appendChild(el('span', null, label + ': ' + fmt(pot.amount)));
      }, this);
    }

    _winnerSeats(state) {
      const set = new Set();
      if (state.phase === 'complete' && state.result) {
        state.result.pots.forEach(function (pot) {
          pot.winners.forEach(function (w) { set.add(w.seat); });
        });
      }
      return set;
    }

    _renderSeat(i, p, state, opts, winners) {
      const s = this.seats[i];
      const root = s.root;
      if (!p) {
        root.classList.add('empty');
        s.name.textContent = '';
        s.stack.textContent = '';
        s.cards.forEach(function (c) { c.hidden = true; });
        s.bubble.hidden = true;
        s.bet.hidden = true;
        return;
      }
      const hero = i === this.humanSeat;
      root.classList.remove('empty');
      s.name.textContent = hero ? T.you : p.name;
      s.avatarText.textContent = (hero ? T.you : p.name).charAt(0).toUpperCase();
      s.avatar.style.setProperty('--hue', hero ? 145 : hueFor(p.id + p.name));
      const live = state.phase === 'betting';
      s.stack.textContent = live && p.allIn && p.chips === 0 ? T.allIn : fmt(p.chips);

      root.classList.toggle('out', state.handNumber > 0 && !p.inHand);
      root.classList.toggle('folded', !!p.folded);
      root.classList.toggle('allin', live && !!p.allIn);
      root.classList.toggle('turn', live && state.toAct === i);
      if (!(live && state.toAct === i)) root.classList.remove('thinking');
      root.classList.toggle('winner', winners.has(i));

      // Kartlar
      const count = p.inHand ? (p.cardCount != null ? p.cardCount : (p.hole ? p.hole.length : 0)) : 0;
      const showCards = count > 0 && (!p.folded || hero);
      const faceUp = !!p.hole;
      s.cardsBox.classList.toggle('revealed', faceUp && !hero);
      for (let k = 0; k < 2; k++) {
        const node = s.cards[k];
        if (!showCards || k >= count) {
          node.hidden = true;
          node.classList.remove('win', 'dim', 'ghost');
          continue;
        }
        node.hidden = false;
        if (opts.hiddenHole && opts.hiddenHole.has(i + ':' + k)) {
          node.classList.add('ghost');
        } else {
          node.classList.remove('ghost');
          setCardFace(node, faceUp ? p.hole[k] : null);
        }
        node.classList.toggle('dim', hero && !!p.folded);
      }

      // Hərəkət etiketi və ya kombinasiyanın adı
      const result = state.result && !state.result.uncontested ? state.result : null;
      const shown = result && result.hands.find(function (h) { return h.seat === i; });
      if (shown) {
        this._setBubble(s, shown.text, 'a-hand');
      } else if (p.lastAction && p.inHand && state.phase !== 'complete') {
        const type = p.lastAction.allIn && p.lastAction.type !== 'fold' ? 'allin' : p.lastAction.type;
        this._setBubble(s, T.actions[type] || '', 'a-' + type);
      } else {
        s.bubble.hidden = true;
      }

      // Mərc
      if (p.bet > 0 && live) {
        s.bet.hidden = false;
        s.betAmount.textContent = fmt(p.bet);
        s.betChip.className = 'chip ' + chipColor(p.bet, state.bigBlind);
        // Fişka uçub çatana qədər mərc görünməz qalır.
        s.bet.style.opacity = opts.hiddenBets && opts.hiddenBets.has(i) ? '0' : '';
      } else {
        s.bet.hidden = true;
      }

      // Sənin kombinasiyan
      if (s.strength) {
        if (p.hole && p.hole.length === 2 && p.inHand && !p.folded && !(opts.hiddenHole && opts.hiddenHole.size)) {
          s.strength.hidden = false;
          s.strength.textContent = Evaluator.describe(Evaluator.evaluate(p.hole.concat(state.board))).text;
        } else {
          s.strength.hidden = true;
        }
      }
    }

    _setBubble(s, text, cls) {
      if (!text) {
        s.bubble.hidden = true;
        return;
      }
      s.bubble.hidden = false;
      if (s.bubble.textContent !== text) s.bubble.textContent = text;
      s.bubble.className = 'bubble ' + cls;
    }

    popBubble(seat) {
      const b = this.seats[seat].bubble;
      if (b.hidden) return;
      b.classList.remove('pop');
      void b.offsetWidth;
      b.classList.add('pop');
    }

    /** Qalib kartları vurğula, qalanlarını solğunlaşdır. */
    _renderHighlights(state) {
      const all = this.boardCards.slice();
      this.seats.forEach(function (s) { all.push(s.cards[0], s.cards[1]); });
      all.forEach(function (c) { c.classList.remove('win'); });
      this.boardCards.forEach(function (c) { c.classList.remove('dim'); });
      const result = state.phase === 'complete' && state.result;
      if (!result || result.uncontested || !result.hands.length) return;
      const mainWinners = result.pots[0] ? result.pots[0].winners.map(function (w) { return w.seat; }) : [];
      const best = new Set();
      result.hands.forEach(function (h) {
        if (mainWinners.indexOf(h.seat) >= 0) h.best.forEach(function (c) { best.add(c); });
      });
      this.boardCards.forEach(function (node, i) {
        if (state.board[i] == null) return;
        if (best.has(state.board[i])) node.classList.add('win');
        else node.classList.add('dim');
      });
      mainWinners.forEach(function (seat) {
        const p = state.players[seat];
        const s = this.seats[seat];
        if (!p || !p.hole) return;
        p.hole.forEach(function (card, k) {
          if (best.has(card)) s.cards[k].classList.add('win');
        });
      }, this);
    }

    // ------------------------------------------------------------------
    // Nəticə və bildirişlər
    // ------------------------------------------------------------------

    showResult(state) {
      const result = state.result;
      if (!result) return;
      const name = function (seat) {
        const p = state.players[seat];
        return seat === this.humanSeat ? T.you : (p ? p.name : '?');
      }.bind(this);
      const box = this.resultEl;
      box.textContent = '';
      const main = result.pots[0];
      const mainSeats = main.winners.map(function (w) { return w.seat; });
      let title;
      if (mainSeats.length > 1) title = T.splitPot;
      else if (mainSeats[0] === this.humanSeat) title = T.youWon;
      else title = T.wins(name(mainSeats[0]));
      box.appendChild(el('div', 'result-title', title));

      if (result.uncontested) {
        box.appendChild(el('div', 'result-hand', T.everyoneFolded));
        box.appendChild(el('div', 'result-line', '+' + fmt(main.amount)));
      } else if (result.pots.length === 1) {
        box.appendChild(el('div', 'result-hand', main.hand || ''));
        const names = mainSeats.map(name).join(', ');
        box.appendChild(el('div', 'result-line', (mainSeats.length > 1 ? names + ' · ' : '') + '+' + fmt(main.amount)));
      } else {
        box.appendChild(el('div', 'result-hand', main.hand || ''));
        result.pots.forEach(function (pot, i) {
          const label = i === 0 ? T.mainPot : T.sidePot(i);
          const names = pot.winners.map(function (w) { return name(w.seat); }).join(', ');
          box.appendChild(el('div', 'result-line', T.potLine(label, names, pot.amount)));
        });
      }
      box.classList.toggle('compact', result.pots.length > 1);
      box.hidden = false;
      box.style.animation = 'none';
      void box.offsetWidth;
      box.style.animation = '';
    }

    hideResult() {
      this.resultEl.hidden = true;
    }

    toast(text, ms) {
      const t = this.toastEl;
      t.textContent = text;
      t.hidden = false;
      t.style.animation = 'none';
      void t.offsetWidth;
      t.style.animation = '';
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(function () { t.hidden = true; }, ms || 2600);
    }

    setThinking(seat, on) {
      if (seat == null || seat < 0) return;
      this.seats[seat].root.classList.toggle('thinking', !!on);
    }

    clearThinking() {
      this.seats.forEach(function (s) { s.root.classList.remove('thinking'); });
    }

    bumpPot() {
      this.potEl.classList.remove('bump');
      void this.potEl.offsetWidth;
      this.potEl.classList.add('bump');
    }

    // ------------------------------------------------------------------
    // Animasiya köməkçiləri
    // ------------------------------------------------------------------

    rectOf(node) {
      const r = node.getBoundingClientRect();
      const s = this.stage.getBoundingClientRect();
      return {
        x: r.left - s.left,
        y: r.top - s.top,
        w: r.width,
        h: r.height,
        cx: r.left - s.left + r.width / 2,
        cy: r.top - s.top + r.height / 2
      };
    }

    animate(node, keyframes, options) {
      const duration = Math.round((options.duration || 300) * this.speed);
      const delay = Math.round((options.delay || 0) * this.speed);
      if (this.reducedMotion || typeof node.animate !== 'function') return wait(Math.min(delay, 60));
      let anim;
      try {
        anim = node.animate(keyframes, {
          duration: duration,
          delay: delay,
          easing: options.easing || 'cubic-bezier(.2,.8,.25,1)',
          fill: 'both'
        });
      } catch (e) {
        return wait(duration + delay);
      }
      const finished = anim.finished ? anim.finished.catch(function () {}) : wait(duration + delay);
      return Promise.race([finished, wait(duration + delay + 400)]);
    }

    pause(ms) {
      return wait(ms * this.speed);
    }

    /** Kartı (arxası üstə) bir nöqtədən hədəf elementin yerinə uçurur. */
    flyCard(from, target, options) {
      options = options || {};
      const w = target.offsetWidth;
      const h = target.offsetHeight;
      const to = this.rectOf(target);
      const card = createCard(options.card != null ? options.card : null);
      card.style.setProperty('--cw', w + 'px');
      card.style.width = w + 'px';
      card.style.height = h + 'px';
      card.style.left = to.cx - w / 2 + 'px';
      card.style.top = to.cy - h / 2 + 'px';
      this.fx.appendChild(card);
      const rot = options.rotate || 0;
      const scale = from.w && w ? from.w / w : 0.7;
      const kf = [
        { transform: 'translate(' + (from.cx - to.cx) + 'px,' + (from.cy - to.cy) + 'px) rotate(' + (rot - 160) + 'deg) scale(' + scale + ')', opacity: 0 },
        { opacity: 1, offset: 0.2 },
        { transform: 'translate(0px,0px) rotate(' + rot + 'deg) scale(1)', opacity: 1 }
      ];
      return this.animate(card, kf, { duration: options.duration || 320, delay: options.delay || 0 })
        .then(function () { card.remove(); });
    }

    /** Kartı çevirir (üzü yuxarı/aşağı). */
    flipCard(node, card, delay) {
      const self = this;
      let base = '';
      return this.pause(delay || 0)
        .then(function () {
          // Kartın öz fırlanmasını (CSS transform) saxla.
          const t = getComputedStyle(node).transform;
          base = t && t !== 'none' ? t + ' ' : '';
          return self.animate(node, [{ transform: base + 'scaleX(1)' }, { transform: base + 'scaleX(0)' }], { duration: 130, easing: 'ease-in' });
        })
        .then(function () {
          setCardFace(node, card);
          return self.animate(node, [{ transform: base + 'scaleX(0)' }, { transform: base + 'scaleX(1)' }], { duration: 150, easing: 'ease-out' });
        })
        .then(function () {
          if (node.getAnimations) node.getAnimations().forEach(function (a) { a.cancel(); });
        });
    }

    /** Fişkaları bir nöqtədən digərinə uçurur. */
    flyChips(from, to, options) {
      options = options || {};
      const count = options.count || 1;
      const size = Math.max(12, Math.round(18 * parseFloat(getComputedStyle(this.app).getPropertyValue('--u') || '1')));
      const tasks = [];
      for (let i = 0; i < count; i++) {
        const chip = el('span', 'chip ' + (options.color || ''));
        chip.style.setProperty('--chip', size + 'px');
        chip.style.left = to.cx - size / 2 + 'px';
        chip.style.top = to.cy - size / 2 + 'px';
        this.fx.appendChild(chip);
        const jx = (i - (count - 1) / 2) * 5;
        const kf = [
          { transform: 'translate(' + (from.cx - to.cx + jx) + 'px,' + (from.cy - to.cy) + 'px) scale(.9)', opacity: 0.2 },
          { opacity: 1, offset: 0.15 },
          { transform: 'translate(0px,0px) scale(1)', opacity: 1 }
        ];
        tasks.push(this.animate(chip, kf, {
          duration: options.duration || 380,
          delay: (options.delay || 0) + i * 70,
          easing: 'cubic-bezier(.3,.7,.3,1)'
        }).then(function () { chip.remove(); }));
      }
      return Promise.all(tasks);
    }

    clearFx() {
      this.fx.textContent = '';
    }

    // ------------------------------------------------------------------
    // Hadisə animasiyaları
    // ------------------------------------------------------------------

    async dealHoleCards(order, state) {
      const hidden = new Set();
      order.forEach(function (seat) { hidden.add(seat + ':0'); hidden.add(seat + ':1'); });
      this.render(state, { hiddenHole: hidden });
      const from = this.rectOf(this.deckSpot);
      const tasks = [];
      let n = 0;
      const hero = this.humanSeat;
      for (let round = 0; round < 2; round++) {
        for (const seat of order) {
          const s = this.seats[seat];
          const target = s.cards[round];
          if (target.hidden) continue;
          const isHero = seat === hero;
          const rotate = isHero ? (round === 0 ? -5 : 5) : (round === 0 ? -7 : 7);
          const delay = n * 85;
          n++;
          setCardFace(target, null);
          tasks.push(this.flyCard(from, target, { delay: delay, rotate: rotate }).then(function () {
            target.classList.remove('ghost');
          }));
        }
      }
      await Promise.all(tasks);
      // Öz kartlarını çevir
      const me = state.players[hero];
      if (me && me.hole) {
        const s = this.seats[hero];
        await Promise.all([this.flipCard(s.cards[0], me.hole[0], 0), this.flipCard(s.cards[1], me.hole[1], 90)]);
      }
      this.render(state);
    }

    async dealBoard(state, count) {
      const start = state.board.length - count;
      this.render(state, { hideBoardFrom: start });
      const from = this.rectOf(this.deckSpot);
      const tasks = [];
      for (let i = start; i < state.board.length; i++) {
        const target = this.boardCards[i];
        setCardFace(target, null);
        tasks.push(this.flyCard(from, target, { delay: (i - start) * 110, duration: 300 }).then(function () {
          target.classList.remove('ghost');
        }));
      }
      await Promise.all(tasks);
      const flips = [];
      for (let i = start; i < state.board.length; i++) {
        flips.push(this.flipCard(this.boardCards[i], state.board[i], (i - start) * 90));
      }
      await Promise.all(flips);
      this.render(state);
    }

    async revealHands(hands, state) {
      const tasks = [];
      let idx = 0;
      for (const h of hands) {
        if (h.seat === this.humanSeat || !h.hole) continue;
        const s = this.seats[h.seat];
        if (s.cards[0].hidden) continue;
        s.cardsBox.classList.add('revealed');
        tasks.push(this.flipCard(s.cards[0], h.hole[0], idx * 140));
        tasks.push(this.flipCard(s.cards[1], h.hole[1], idx * 140 + 70));
        idx++;
      }
      await Promise.all(tasks);
      this.render(state);
    }

    async betChips(seat, state) {
      const s = this.seats[seat];
      this.render(state, { hiddenBets: new Set([seat]) });
      if (s.bet.hidden) return;
      const from = this.rectOf(s.avatar);
      const to = this.rectOf(s.betChip);
      const p = state.players[seat];
      await this.flyChips(from, to, { color: chipColor(p.bet, state.bigBlind), duration: 320 });
      s.bet.style.opacity = '';
    }

    async returnChips(seat, state) {
      const s = this.seats[seat];
      if (!s.bet.hidden) {
        const from = this.rectOf(s.betChip);
        const to = this.rectOf(s.avatar);
        await this.flyChips(from, to, { duration: 320 });
      }
      this.render(state);
    }

    async collectBets(state) {
      const tasks = [];
      const potChip = this.potEl.hidden ? null : this.potEl.querySelector('.chip');
      const to = potChip ? this.rectOf(potChip) : this.rectOf(this.deckSpot);
      for (const s of this.seats) {
        if (s.bet.hidden) continue;
        const from = this.rectOf(s.betChip);
        const color = s.betChip.className.replace('chip', '').trim();
        s.bet.hidden = true;
        tasks.push(this.flyChips(from, to, { color: color, duration: 360 }));
      }
      if (tasks.length) {
        await Promise.all(tasks);
        this.bumpPot();
      }
      this.render(state);
    }

    async muck(seat, state) {
      const s = this.seats[seat];
      if (seat !== this.humanSeat) {
        const to = this.rectOf(this.deckSpot);
        const tasks = [];
        s.cards.forEach(function (node, k) {
          if (node.hidden) return;
          const from = this.rectOf(node);
          const w = node.offsetWidth;
          const h = node.offsetHeight;
          const ghost = createCard(null, 'mini');
          ghost.style.setProperty('--cw', w + 'px');
          ghost.style.width = w + 'px';
          ghost.style.height = h + 'px';
          ghost.style.left = from.cx - w / 2 + 'px';
          ghost.style.top = from.cy - h / 2 + 'px';
          this.fx.appendChild(ghost);
          node.hidden = true;
          tasks.push(this.animate(ghost, [
            { transform: 'translate(0px,0px) rotate(0deg)', opacity: 1 },
            { transform: 'translate(' + (to.cx - from.cx) + 'px,' + (to.cy - from.cy) + 'px) rotate(' + (k ? 120 : -120) + 'deg) scale(.6)', opacity: 0 }
          ], { duration: 340, easing: 'cubic-bezier(.4,0,.6,1)' }).then(function () { ghost.remove(); }));
        }, this);
        await Promise.all(tasks);
      }
      this.render(state);
    }

    async awardPots(pots, state) {
      const potChip = this.potEl.querySelector('.chip');
      const from = this.rectOf(this.potEl.hidden ? this.deckSpot : potChip);
      const tasks = [];
      pots.forEach(function (pot, i) {
        pot.winners.forEach(function (w, j) {
          const s = this.seats[w.seat];
          tasks.push(this.flyChips(from, this.rectOf(s.avatar), {
            count: 4,
            color: 'gold',
            duration: 520,
            delay: i * 260 + j * 120
          }));
        }, this);
      }, this);
      this.potEl.hidden = true;
      await Promise.all(tasks);
      this.render(state);
      this.showResult(state);
    }
  }

  TableView.createCard = createCard;
  TableView.setCardFace = setCardFace;
  TableView.wait = wait;
  ns.TableView = TableView;
})(typeof globalThis !== 'undefined' ? globalThis : this);
