# Texas Hold'em Poker — iPhone üçün

Yalnız HTML, CSS və JavaScript ilə yazılmış Texas Hold'em (No-Limit) poker oyunu.
Oyunçu 4 kompüter botuna qarşı **virtual fişkalarla** oynayır (real pul yoxdur).
Heç bir kitabxana, quraşdırma və ya server lazım deyil: `index.html` açılanda oyun başlayır.

## İşə salmaq

**Kompüterdə:** `index.html` faylını brauzerdə açın (birbaşa `file://` ilə də işləyir).

**iPhone-da:** faylları istənilən statik hostinqə qoyun, məsələn GitHub Pages:

1. GitHub-da repozitoriya → **Settings → Pages** → *Branch:* `main`, qovluq `/ (root)` → **Save**.
2. Bir neçə dəqiqədən sonra oyun `https://chocho7777.github.io/sixdi/` ünvanında açılacaq.
3. iPhone-da Safari ilə bu ünvanı açın → **Paylaş** düyməsi → **Ana ekrana əlavə et**.
   Oyun ikonu ilə ayrıca tətbiq kimi, tam ekranda açılacaq.

**Lokal server (istəyə görə):** `npm start` və ya `python3 -m http.server 8080`.

## Oyun

- Tam qaydalar: kiçik/böyük blaynd (10/20), preflop, flop, tern, river; pas, çek, bərabərləş,
  mərc, artır, va-bank.
- Minimum artırma qaydası; tam artırma olmayan va-bank artıq danışmış oyunçu üçün mərcləri
  yenidən açmır (bir neçə qısa va-bankın cəmi tam artırmaya çatanda açır).
- Əsas bank və istənilən sayda yan bank; heç kimin bərabərləşdirmədiyi artıq mərc geri qaytarılır;
  bərabər əllərdə bank bölünür, tək qalan fişka dilerin solundakı qalibə verilir.
- Təkbətək (2 nəfər qalanda) qaydaları: diler kiçik blaydı qoyur və preflopda birinci danışır.
- Mərclər bitəndə (hamı va-bankdırsa) kartlar üzü yuxarı açılır və qalan kartlar paylanır.
- Kombinasiyalar düzgün müqayisə olunur, o cümlədən A–5 strit, kikerlər, iki üçlükdən full-haus və s.
- Başlanğıc balans 2.000 fişka. Balans və bütün oyun vəziyyəti (hətta əlin ortası) brauzerdə
  yadda saxlanır. Fişkan bitəndə **"Yenidən başla"** düyməsi çıxır.
- Fişkası bitən botun yerinə masaya yeni bot oturur.
- Menyuda statistika, oyun sürəti (Normal/Sürətli) və "Yeni oyun"; **?** düyməsində kombinasiyalar və qaydalar.

### Botlar

Botlar yalnız öz kartlarını və ümumi məlumatı görür (başqalarının kartlarını bilmir).

- **Preflop:** 169 başlanğıc əlin sıralaması (`tools/preflop-ranking.js` ilə hesablanıb), mövqe,
  qarşıdakı artırmanın ölçüsü və yığının dərinliyi (az fişkada "va-bank və ya pas").
- **Flop/tern/river:** Monte Carlo ilə qələbə ehtimalı. Rəqiblərin əl diapazonu onların
  hərəkətlərindən təxmin edilir (preflopda artıran daha güclü, postflopda aqressiv oynayan adətən
  "nəsə tutub"). Ehtimal bank əmsalı (pot odds) ilə müqayisə olunur; mərcin ölçüsü əlin gücünə görə seçilir.
- Dörd xarakter: balanslı, ehtiyatlı, aqressiv və "hər şeyi bərabərləşdirən". Arabir blef edirlər.

### iPhone üçün

- Şaquli (portrait) yaşıl masa, böyük toxunuş düymələri, artırma üçün böyük sürgü və hazır məbləğlər.
- Kartların paylanması, çevrilməsi, fişkaların banka və qalibə uçması animasiyaları.
- `safe-area` (çentik/Dynamic Island və ev indikatoru) nəzərə alınır.
- Böyütmə (zoom) və sürüşmə söndürülüb; üfüqi vəziyyətdə "telefonu çevir" ekranı.
- Ana ekran üçün `manifest.webmanifest`, `apple-touch-icon` və digər ikonlar.

## Arxitektura

Oyun məntiqi interfeysdən tam ayrıdır — `js/engine` və `js/ai` heç bir DOM, taymer və ya
`localStorage` istifadə etmir və həm brauzerdə, həm də Node.js-də işləyir.

```
index.html               səhifə (skriptlər adi <script> kimi yüklənir — file:// ilə də işləyir)
manifest.webmanifest     ana ekran üçün
css/style.css            dizayn
js/engine/cards.js       kartlar, dəstə, qarışdırma (kriptoqrafik təsadüf)
js/engine/evaluator.js   5–7 kartlıq əlin qiymətləndirilməsi, adları
js/engine/pots.js        əsas/yan banklar və uduşun bölünməsi
js/engine/game.js        HoldemGame — raund idarəsi (vəziyyət maşını)
js/ai/bot.js             bot qərarları
js/app/storage.js        yaddaş (localStorage)
js/app/local-table.js    LocalTable — mühərrik + botlar + yaddaş (interfeysin danışdığı "masa")
js/ui/i18n.js            Azərbaycan dilində mətnlər
js/ui/table-view.js      masanın çəkilməsi və animasiyalar
js/ui/controls.js        düymələr və artırma paneli
js/ui/main.js            hər şeyin birləşdirilməsi
tests/                   Node.js testləri
tools/                   preflop sıralaması və ikonların yaradılması
```

### Mühərrik (`HoldemGame`)

```js
const game = new HoldemGame({ players: [{ id, name, chips }, ...], smallBlind: 10, bigBlind: 20 });
let events = game.startHand();          // [{type:'handStart'}, {type:'blind'}, {type:'deal'}, {type:'turn'}]
game.legalActions(seat);                // {toCall, canCheck, canBet, canRaise, minTo, maxTo, ...}
events = game.act(seat, { type: 'raise', amount: 60 });   // amount = bu küçədə cəmi mərc
game.getView(seat);                     // yalnız həmin oyunçunun görə biləcəyi vəziyyət
game.serialize();                       // JSON — saxlamaq/göndərmək üçün
HoldemGame.restore(json);
```

Hər hərəkət hadisələr massivi qaytarır: `handStart`, `blind`, `deal`, `turn`, `action`, `return`
(geri qaytarılan artıq mərc), `collect`, `board`, `reveal`, `showdown`, `win`, `handEnd`.
Hər hadisədə `state` — həmin anın tam görüntüsü var. `HoldemGame.maskEvent(event, seat)` başqa
oyunçuların gizli kartlarını silir.

### İnterfeys ↔ masa

İnterfeys yalnız `LocalTable`-ın bu metodlarını istifadə edir:

| Metod | Mənası |
|---|---|
| `subscribe(fn)` | `fn(events)` hadisə paketlərini alır; Promise qaytarsa, masa animasiyanın bitməsini gözləyir |
| `start()` | saxlanmış oyunu bərpa edir və ya yeni əl başladır |
| `act(action)` | oyunçunun hərəkəti |
| `nextHand()` | növbəti əl |
| `restart()` | hər şeyi sıfırla |

## Onlayn multiplayer üçün yol xəritəsi

1. **Server** (Node.js + WebSocket): hər masa üçün `new HoldemGame(...)`
   (`require('./js/engine/game.js')` birbaşa işləyir). Oyunçudan gələn hərəkət `game.act(seat, action)`
   ilə yoxlanır — qanunsuz hərəkət xəta atır. Nəticə hadisələri hər oyunçuya
   `HoldemGame.maskEvent(event, oyunçununSeat)` ilə ayrıca göndərilir, beləliklə heç kim başqasının
   kartlarını ala bilməz.
2. **Vaxt limiti:** oyunçu gecikəndə `game.defaultAction(seat)` (çek, mümkün deyilsə pas).
3. **Oturacaqlar:** əllər arasında `seatPlayer` / `removePlayer` / `setChips`; boş oturacaq `null`-dır.
4. **Klient:** `LocalTable` ilə eyni interfeysə malik `RemoteTable` yazmaq kifayətdir
   (`subscribe`, `act`, `nextHand` → WebSocket mesajları). `js/ui/*` dəyişmir.
5. Yenidən qoşulan oyunçuya `{type: 'sync', state: game.getView(seat)}` göndərilir — interfeys
   artıq bu hadisəni animasiyasız göstərməyi bacarır.

## Testlər

Node.js 18+ lazımdır (asılılıq yoxdur):

```
npm test
```

- bütün 2.598.960 beşkartlıq əl: kateqoriya sayları və 7462 fərqli dəyər; müstəqil qiymətləndirici ilə
  200.000 müqayisə; 7 kart = 21 kombinasiyanın ən yaxşısı;
- blaydlar, təkbətək sırası, BB seçimi, minimum artırma, qısa va-bank qaydası, geri qaytarılan mərc,
  yan banklar, bölünmə və tək fişka, seriallaşdırma, kartların gizlədilməsi;
- 6000 təsadüfi əllik stress testi (fişkalar itmir, növbə qaydası pozulmur);
- botların ağlabatan qərarları və yalnız botlarla 1500 əl;
- `LocalTable`: bərpa (əlin ortasında da), botların dəyişməsi, iflas və yenidən başlama.

## Alətlər

- `node tools/preflop-ranking.js` — başlanğıc əllərin sıralamasını yenidən hesablayır.
- `node tools/make-icons.js` — `icons/icon.svg`-dən PNG ikonları yaradır (Playwright lazımdır).
