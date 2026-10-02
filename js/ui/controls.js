/*
 * Aşağı panel: Pas / Çek–Bərabərləş / Artır düymələri və artırma paneli.
 */
(function (root) {
  'use strict';

  const ns = root.Poker;
  const T = ns.I18n.T;
  const fmt = ns.I18n.formatChips;

  function $(id) {
    return document.getElementById(id);
  }

  function clamp(x, lo, hi) {
    return x < lo ? lo : x > hi ? hi : x;
  }

  class Controls {
    /**
     * @param opts.onAction(action) — oyunçunun hərəkəti
     * @param opts.onNext() — "Növbəti əl"
     */
    constructor(opts) {
      this.onAction = opts.onAction;
      this.onNext = opts.onNext;
      this.legal = null;
      this.state = null;
      this.raise = null;

      this.statusLine = $('statusLine');
      this.actionRow = $('actionRow');
      this.nextRow = $('nextRow');
      this.btnFold = $('btnFold');
      this.btnCall = $('btnCall');
      this.btnRaise = $('btnRaise');
      this.btnNext = $('btnNext');
      this.nextProgress = $('nextProgress');
      this.sheet = $('raiseSheet');
      this.raiseTitle = $('raiseTitle');
      this.raiseCaption = $('raiseCaption');
      this.raiseValue = $('raiseValue');
      this.slider = $('raiseSlider');
      this.fill = $('raiseFill');
      this.thumb = $('raiseThumb');
      this.presets = $('raisePresets');
      this.confirm = $('raiseConfirm');

      this.btnFold.querySelector('.btn-label').textContent = T.fold;
      this.btnNext.querySelector('.btn-label').textContent = T.nextHand;
      this.raiseCaption.textContent = T.betTotal;

      const self = this;
      this.btnFold.addEventListener('click', function () { self._send({ type: 'fold' }); });
      this.btnCall.addEventListener('click', function () {
        if (!self.legal) return;
        self._send(self.legal.canCheck ? { type: 'check' } : { type: 'call' });
      });
      this.btnRaise.addEventListener('click', function () { self.openRaise(); });
      this.btnNext.addEventListener('click', function () { self.onNext(true); });
      $('raiseClose').addEventListener('click', function () { self.closeRaise(); });
      $('raiseMinus').addEventListener('click', function () { self._step(-1); });
      $('raisePlus').addEventListener('click', function () { self._step(1); });
      this.confirm.addEventListener('click', function () {
        if (!self.raise || !self.legal) return;
        self._send({ type: self.legal.canBet ? 'bet' : 'raise', amount: self.raise.value });
      });
      this._bindSlider();
    }

    // ------------------------------------------------------------------
    // Vəziyyətlər
    // ------------------------------------------------------------------

    setStatus(text, highlight) {
      this.statusLine.textContent = text || ' ';
      this.statusLine.classList.toggle('highlight', !!highlight);
    }

    /** Oyunçunun növbəsi: düymələri aktivləşdir. */
    showActions(state) {
      const legal = state.legal;
      if (!legal) return this.waiting();
      this.state = state;
      this.legal = legal;
      this.nextRow.hidden = true;
      this.actionRow.hidden = false;

      this.btnFold.disabled = legal.canCheck;
      this._label(this.btnCall,
        legal.canCheck ? T.check : legal.callIsAllIn ? T.allIn : T.call,
        legal.canCheck ? '' : fmt(legal.toCall));
      this.btnCall.disabled = false;

      if (legal.canBet || legal.canRaise) {
        const onlyAllIn = legal.minTo >= legal.maxTo;
        this._label(this.btnRaise,
          onlyAllIn ? T.allIn : legal.canBet ? T.bet : T.raise,
          onlyAllIn ? fmt(legal.maxTo) : '');
        this.btnRaise.disabled = false;
      } else {
        this._label(this.btnRaise, T.raise, '');
        this.btnRaise.disabled = true;
      }
      const toCallText = legal.toCall > 0 ? ' · ' + T.toCall(legal.toCall) : '';
      this.setStatus(T.yourTurn + toCallText, true);
    }

    /** Başqasının növbəsi: düymələr görünür, amma sönükdür. */
    waiting() {
      this.legal = null;
      this.closeRaise();
      this.nextRow.hidden = true;
      this.actionRow.hidden = false;
      this.btnFold.disabled = true;
      this.btnCall.disabled = true;
      this.btnRaise.disabled = true;
      this._label(this.btnCall, T.check, '');
      this._label(this.btnRaise, T.raise, '');
    }

    showNext(autoMs) {
      this.legal = null;
      this.closeRaise();
      this.actionRow.hidden = true;
      this.nextRow.hidden = false;
      this.nextProgress.classList.remove('run');
      void this.nextProgress.offsetWidth;
      if (autoMs) {
        this.nextProgress.style.setProperty('--dur', autoMs + 'ms');
        this.nextProgress.classList.add('run');
      }
    }

    hideAll() {
      this.legal = null;
      this.closeRaise();
      this.actionRow.hidden = true;
      this.nextRow.hidden = true;
    }

    _label(btn, label, amount) {
      btn.querySelector('.btn-label').textContent = label;
      const a = btn.querySelector('.btn-amount');
      if (a) a.textContent = amount || '';
    }

    _send(action) {
      if (!this.legal) return;
      const legal = this.legal;
      if (action.type === 'fold' && legal.canCheck) return;
      this.closeRaise();
      const accepted = this.onAction(action);
      if (accepted !== false) this.waiting();
    }

    // ------------------------------------------------------------------
    // Artırma paneli
    // ------------------------------------------------------------------

    openRaise() {
      const legal = this.legal;
      if (!legal || !(legal.canBet || legal.canRaise)) return;
      const min = legal.minTo;
      const max = legal.maxTo;
      const bb = legal.bigBlind;
      const snap = Math.max(1, Math.round(bb / 2));
      this.raise = { min: min, max: max, value: min, step: bb, snap: snap };
      this.raiseTitle.textContent = legal.canBet ? T.bet : T.raise;

      const potBase = legal.pot + legal.toCall;
      const self = this;
      const presets = [
        { label: T.min, value: min },
        { label: T.halfPot, value: legal.currentBet + potBase * 0.5 },
        { label: T.threeQuarterPot, value: legal.currentBet + potBase * 0.75 },
        { label: T.fullPot, value: legal.currentBet + potBase },
        { label: T.allIn, value: max }
      ];
      this.presets.textContent = '';
      this.presetButtons = presets.map(function (p, i) {
        let v = Math.round(p.value / snap) * snap;
        v = clamp(v, min, max);
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = p.label;
        const redundant = i > 0 && i < 4 && (v <= min || v >= max);
        b.disabled = redundant || (i === 0 && min >= max);
        b.dataset.value = String(v);
        b.addEventListener('click', function () { self._setValue(v); });
        self.presets.appendChild(b);
        return b;
      });

      // Panel öz kartlarını örtməsin deyə, onların kiçik surəti başlıqda göstərilir.
      const cardsBox = $('raiseCards');
      cardsBox.textContent = '';
      const me = this.state && this.state.players[this.state.viewer];
      if (me && me.hole) {
        me.hole.forEach(function (c) { cardsBox.appendChild(ns.TableView.createCard(c, 'mini')); });
      }

      const onlyAllIn = min >= max;
      this.slider.parentElement.hidden = onlyAllIn;
      this.presets.hidden = onlyAllIn;
      this.sheet.hidden = false;
      this._setValue(min);
    }

    closeRaise() {
      this.sheet.hidden = true;
      this.raise = null;
    }

    _setValue(v) {
      const r = this.raise;
      if (!r) return;
      v = clamp(Math.round(v), r.min, r.max);
      if (v !== r.min && v !== r.max) v = clamp(Math.round(v / r.snap) * r.snap, r.min, r.max);
      r.value = v;
      const t = r.max > r.min ? Math.sqrt((v - r.min) / (r.max - r.min)) : 1;
      this.fill.style.width = t * 100 + '%';
      this.thumb.style.left = t * 100 + '%';
      this.raiseValue.textContent = fmt(v);
      const allIn = v >= r.max;
      this._label(this.confirm, allIn ? T.allIn : this.legal.canBet ? T.bet : T.raise, fmt(v));
      this.presetButtons.forEach(function (b) {
        b.classList.toggle('active', Number(b.dataset.value) === v && !b.disabled);
      });
    }

    _step(dir) {
      const r = this.raise;
      if (!r) return;
      let v = r.value + dir * r.step;
      if (dir > 0 && v > r.max) v = r.max;
      if (dir < 0 && r.value === r.max) v = Math.floor((r.max - r.step) / r.step) * r.step;
      this._setValue(v);
    }

    _bindSlider() {
      const self = this;
      let dragging = false;
      function setFromX(clientX) {
        const r = self.raise;
        if (!r) return;
        const rect = self.slider.getBoundingClientRect();
        const t = clamp((clientX - rect.left) / rect.width, 0, 1);
        self._setValue(t >= 0.999 ? r.max : r.min + (r.max - r.min) * t * t);
      }
      this.slider.addEventListener('pointerdown', function (e) {
        dragging = true;
        try { self.slider.setPointerCapture(e.pointerId); } catch (err) { /* yox say */ }
        setFromX(e.clientX);
        e.preventDefault();
      });
      this.slider.addEventListener('pointermove', function (e) {
        if (dragging) setFromX(e.clientX);
      });
      const stop = function () { dragging = false; };
      this.slider.addEventListener('pointerup', stop);
      this.slider.addEventListener('pointercancel', stop);
    }
  }

  ns.Controls = Controls;
})(typeof globalThis !== 'undefined' ? globalThis : this);
