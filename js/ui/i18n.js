/*
 * İnterfeys mətnləri (Azərbaycan dili) və rəqəmlərin formatı.
 */
(function (root) {
  'use strict';

  function formatChips(n) {
    const value = Math.round(Number(n) || 0);
    const sign = value < 0 ? '-' : '';
    return sign + String(Math.abs(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  const T = {
    appTitle: 'Texas Hold\'em',
    you: 'Sən',
    hand: function (n) { return 'Əl #' + n; },
    blinds: function (sb, bb) { return 'Blaynd ' + formatChips(sb) + '/' + formatChips(bb); },
    pot: 'Bank',
    mainPot: 'Əsas bank',
    sidePot: function (i) { return 'Yan bank' + (i > 1 ? ' ' + i : ''); },
    streets: { preflop: 'Preflop', flop: 'Flop', turn: 'Tern', river: 'River', showdown: 'Açılış' },

    // Düymələr
    fold: 'Pas',
    check: 'Çek',
    call: 'Bərabərləş',
    bet: 'Mərc',
    raise: 'Artır',
    allIn: 'Va-bank',
    nextHand: 'Növbəti əl',
    min: 'Min',
    halfPot: '½ Bank',
    threeQuarterPot: '¾ Bank',
    fullPot: 'Bank',
    cancel: 'Ləğv et',
    close: 'Bağla',
    restart: 'Yenidən başla',
    newGame: 'Yeni oyun',
    start: 'Başla',

    // Hərəkət etiketləri (oyunçunun üstündə)
    actions: {
      fold: 'Pas',
      check: 'Çek',
      call: 'Bərabərləşdi',
      bet: 'Mərc',
      raise: 'Artırdı',
      allin: 'Va-bank',
      sb: 'Kiçik blaynd',
      bb: 'Böyük blaynd'
    },

    yourTurn: 'Sənin növbən',
    toCall: function (amount) { return 'Bərabərləşmək üçün: ' + formatChips(amount); },
    waitingFor: function (name) { return name + ' düşünür…'; },
    thinking: 'düşünür…',
    youFolded: 'Pas dedin — əl davam edir',
    runout: 'Mərclər bitdi — kartlar açılır',
    showdown: 'Açılış: kartlar müqayisə olunur',
    youAllIn: 'Va-bank getdin!',
    betTotal: 'Ümumi mərcin',

    // Nəticələr
    youWon: 'Sən qazandın!',
    wins: function (name) { return name + ' qazandı'; },
    splitPot: 'Bank bölündü',
    everyoneFolded: 'Hamı pas dedi',
    potLine: function (label, names, amount) { return label + ': ' + names + ' +' + formatChips(amount); },

    // Masa
    joined: function (name) { return name + ' masaya oturdu'; },
    replaced: function (prev, name) { return prev + ' masadan getdi · ' + name + ' oturdu'; },

    // Fişka bitdi
    bustedTitle: 'Fişkaların bitdi',
    bustedText: function (chips) {
      return 'Bu dəfə şans səndən üz döndərdi. Yenidən başla — balansın ' + formatChips(chips) + ' fişka olacaq.';
    },

    // Menyu
    menu: 'Menyu',
    balance: 'Balans',
    handsPlayed: 'Oynanılan əllər',
    handsWon: 'Qazanılan əllər',
    biggestPot: 'Ən böyük uduş',
    bestHand: 'Ən yaxşı kombinasiya',
    speed: 'Oyun sürəti',
    speedNormal: 'Normal',
    speedFast: 'Sürətli',
    rulesButton: 'Kombinasiyalar və qaydalar',
    newGameConfirm: function (chips) {
      return 'Yeni oyun başlasın? Balansın və statistika sıfırlanacaq, ' + formatChips(chips) + ' fişka ilə başlayacaqsan.';
    },
    chipsVirtual: 'Fişkalar virtualdır — real pul yoxdur.',

    // Qaydalar
    rulesTitle: 'Kombinasiyalar',
    rulesSubtitle: 'Güclüdən zəifə doğru',
    rankings: [
      { name: 'Royal-flaş', desc: 'Eyni mastdan 10, J, Q, K, A', cards: 'As Ks Qs Js Ts' },
      { name: 'Strit-flaş', desc: 'Eyni mastdan ardıcıl beş kart', cards: '9h 8h 7h 6h 5h' },
      { name: 'Kare', desc: 'Eyni dəyərdə dörd kart', cards: 'Qs Qh Qd Qc 7s' },
      { name: 'Full-haus', desc: 'Üçlük və cüt', cards: 'Kh Kd Kc 4s 4h' },
      { name: 'Flaş', desc: 'Eyni mastdan istənilən beş kart', cards: 'Ad Jd 8d 6d 2d' },
      { name: 'Strit', desc: 'Ardıcıl beş kart (A–5 də sayılır)', cards: 'Tc 9d 8s 7h 6c' },
      { name: 'Üçlük', desc: 'Eyni dəyərdə üç kart', cards: '7s 7h 7d Kc 2s' },
      { name: 'İki cüt', desc: 'İki fərqli cüt', cards: 'Jh Jc 5s 5d Ah' },
      { name: 'Cüt', desc: 'Eyni dəyərdə iki kart', cards: 'Th Ts Ks 8d 3c' },
      { name: 'Yüksək kart', desc: 'Kombinasiya yoxdursa, ən böyük kart', cards: 'Ah Qd 9c 6s 3h' }
    ],
    rulesHowTitle: 'Necə oynanılır',
    rulesHow: [
      'Hər oyunçuya 2 kart paylanır, masanın ortasına isə 5 ümumi kart açılır: əvvəl 3 (flop), sonra 1 (tern) və 1 (river).',
      'Ən yaxşı 5 kartlıq kombinasiyanı öz 2 kartın və ümumi kartlarla qurursan.',
      'Dilerdən soldakı iki oyunçu məcburi mərc — kiçik və böyük blaynd qoyur.',
      'Hər mərc dövründə: Pas — kartları atıb əldən çıxırsan; Çek — mərc qoymadan növbəni ötürürsən; Bərabərləş — cari mərcə bərabər fişka qoyursan; Mərc / Artır — mərc qoyur və ya onu artırırsan; Va-bank — bütün fişkalarını qoyursan.',
      'Va-bank gedən oyunçu yalnız qoyduğu məbləğ qədər bankı qazana bilər — artıq hissə yan bankda digərləri arasında oynanılır.',
      'Axırda qalan oyunçular kartlarını açır, ən güclü kombinasiya bankı aparır. Bərabər əllərdə bank bölünür.'
    ],

    rotate: 'Telefonu şaquli vəziyyətə çevir',
    storageOff: 'Brauzer yaddaşı əlçatan deyil — irəliləyiş saxlanılmayacaq.'
  };

  const ns = (root.Poker = root.Poker || {});
  ns.I18n = { T: T, formatChips: formatChips };
})(typeof globalThis !== 'undefined' ? globalThis : this);
