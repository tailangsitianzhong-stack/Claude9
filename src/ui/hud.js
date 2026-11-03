import { UPGRADES, COMPANY_NAME, LOTS, LAND } from '../config.js';

const yen = (n) => '¥' + Math.floor(n).toLocaleString('ja-JP');
const STATUS_LABEL = { running: '稼働中', idle: '待機中', blocked: '停止中' };

// 縦画面用 HUD（DOM オーバーレイ）。毎フレームではなく一定間隔で更新する。
export class Hud {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.state = game.state;
    this.build();
    this.state.on('delivery', (r) => this.onDelivery(r));
    this.state.on('change', () => this.update());
    this.state.on('land', () => this.renderNav());
  }

  build() {
    const s = this.state;
    this.root.innerHTML = `
      <header class="top">
        <div class="company">
          <div class="logo">🥤</div>
          <div>
            <div class="name">${COMPANY_NAME}</div>
            <div class="sub">従業員 ${s.employees.length}人 ・ おろし先 ${s.buyers.length}社</div>
          </div>
        </div>
        <div class="money-box">
          <div class="money" id="h-money"></div>
          <div class="rate" id="h-rate"></div>
        </div>
      </header>
      <div class="chips">
        <div class="chip" id="c-prod"></div>
        <div class="chip" id="c-stock"></div>
        <div class="chip" id="c-truck"></div>
      </div>
      <div class="toasts" id="toasts"></div>
      <div class="spacer"></div>
      <nav class="nav" id="nav" aria-label="工場の切り替え"></nav>
      <div class="sheet hidden" id="sheet" role="dialog" aria-modal="true"></div>
      <div class="info hidden" id="info" role="dialog">
        <div class="info-title" id="info-title"></div>
        <div class="info-status" id="info-status"></div>
        <div class="info-desc" id="info-desc"></div>
      </div>
      <footer class="panel">
        <button class="ship" id="ship" type="button"></button>
        <div class="upgrades" id="upgrades"></div>
      </footer>
    `;
    this.$ = (id) => this.root.querySelector('#' + id);
    this.el = {
      money: this.$('h-money'),
      rate: this.$('h-rate'),
      prod: this.$('c-prod'),
      stock: this.$('c-stock'),
      truck: this.$('c-truck'),
      ship: this.$('ship'),
      toasts: this.$('toasts'),
      info: this.$('info'),
      infoTitle: this.$('info-title'),
      infoStatus: this.$('info-status'),
      infoDesc: this.$('info-desc'),
      nav: this.$('nav'),
      sheet: this.$('sheet'),
    };
    this.renderNav();
    this.el.ship.addEventListener('click', () => {
      this.game.truck.requestShip();
      this.update();
    });

    const wrap = this.$('upgrades');
    this.cards = {};
    for (const [id, u] of Object.entries(UPGRADES)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'card';
      b.innerHTML = `
        <div class="card-head"><span class="icon">${u.icon}</span><span class="lv"></span></div>
        <div class="card-name">${u.name}</div>
        <div class="card-effect"></div>
        <div class="card-cost"></div>`;
      b.addEventListener('click', () => {
        if (this.state.buyUpgrade(id)) {
          b.classList.remove('pop');
          void b.offsetWidth;
          b.classList.add('pop');
        }
      });
      wrap.appendChild(b);
      this.cards[id] = {
        root: b,
        lv: b.querySelector('.lv'),
        effect: b.querySelector('.card-effect'),
        cost: b.querySelector('.card-cost'),
      };
    }
    this.update();
  }

  update() {
    const s = this.state;
    const { truck, plant } = this.game;
    this.el.money.textContent = yen(s.money);
    const exp = s.expectedPerMinute();
    this.el.rate.textContent = `見込み +${yen(exp.value)}/分`;

    this.el.prod.textContent = `⚙️ ${s.activeLaneCount}ライン・${s.bundleInterval.toFixed(1)}秒`;
    const full = s.stock.length >= s.dockCapacity;
    this.el.stock.textContent = `📦 ${s.stock.length}/${s.dockCapacity}束`;
    this.el.stock.classList.toggle('bad', full);
    this.el.prod.classList.toggle('bad', plant.blockedReason === 'dockFull');

    let truckText;
    switch (truck.mode) {
      case 'docked': {
        const sec = truck.secondsToDepart;
        truckText = sec == null ? '🚚 待機中' : `🚚 発車まで${Math.ceil(sec)}秒`;
        break;
      }
      case 'leaving':
      case 'away':
        truckText = '🚚 配送中';
        break;
      default:
        truckText = '🚚 帰り道';
    }
    this.el.truck.textContent = truckText;

    const ship = this.el.ship;
    if (truck.canShip) {
      ship.disabled = false;
      ship.textContent = `いますぐ出荷（${Math.min(s.stock.length, s.truckCapacity)}束）`;
    } else {
      ship.disabled = true;
      ship.textContent = truck.mode === 'docked' ? '在庫なし' : 'トラック配送中…';
    }
    ship.classList.toggle('alert', full && truck.canShip);

    for (const [id, c] of Object.entries(this.cards)) {
      const u = UPGRADES[id];
      const lv = s.level(id);
      const maxed = s.isMaxed(id);
      c.lv.textContent = maxed ? 'MAX' : `Lv.${lv}`;
      c.effect.textContent = maxed ? u.format(s.value(id)) : `${u.format(s.value(id))} → ${u.format(s.value(id, lv + 1))}`;
      c.cost.textContent = maxed ? '—' : yen(s.upgradeCost(id));
      c.root.disabled = !s.canUpgrade(id);
      c.root.classList.toggle('maxed', maxed);
    }

    if (this.infoTarget) this.renderInfoStatus();
    if (this.sheet) {
      const key = `${this.state.money >= this.state.sectionCost(this.sheet.lotId)}|${this.state.money >= this.state.bulkCost(this.sheet.lotId)}|${this.state.remainingIndices(this.sheet.lotId).length}`;
      if (key !== this.sheetKey) {
        this.sheetKey = key;
        this.renderSheet();
      }
    }
  }

  onDelivery(r) {
    this.toast(`<b>+${yen(r.net)}</b> ${r.buyer.name}に${r.bundles}束（${r.straws}本）おろしました`);
    this.el.money.classList.remove('bump');
    void this.el.money.offsetWidth;
    this.el.money.classList.add('bump');
  }

  toast(html) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = html;
    this.el.toasts.prepend(t);
    while (this.el.toasts.children.length > 2) this.el.toasts.lastChild.remove();
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
  }

  showInfo(obj) {
    if (!obj) return this.hideInfo();
    this.hideSheet();
    this.infoTarget = obj;
    const info = obj.userData.info;
    this.el.infoTitle.textContent = info.title;
    this.el.infoDesc.textContent = info.desc;
    this.renderInfoStatus();
    this.el.info.classList.remove('hidden');
  }

  renderInfoStatus() {
    const key = this.infoTarget.userData.key;
    const lane = this.infoTarget.userData.lane;
    const st = lane?.active ? lane.status[key] : null;
    const el = this.el.infoStatus;
    if (st) {
      el.textContent = STATUS_LABEL[st] + (st === 'blocked' ? '（倉庫が満杯／出荷待ち）' : '');
      el.className = 'info-status ' + st;
    } else if (lane && !lane.active) {
      el.textContent = '準備中（機械がそろうと動き出します）';
      el.className = 'info-status idle';
    } else if (key === 'dock') {
      el.textContent = `在庫 ${this.state.stock.length}/${this.state.dockCapacity}束`;
      el.className = 'info-status';
    } else if (key === 'truck') {
      el.textContent = `積載 ${this.state.truckCapacity}束/便`;
      el.className = 'info-status';
    } else {
      el.textContent = '';
      el.className = 'info-status';
    }
  }

  hideInfo() {
    this.infoTarget = null;
    this.el.info.classList.add('hidden');
  }

  // ---- 工場の切り替え（カメラ移動）----
  renderNav() {
    const nav = this.el.nav;
    nav.innerHTML = '';
    const add = (label, onClick, cls = '') => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'nav-btn ' + cls;
      b.textContent = label;
      b.addEventListener('click', onClick);
      nav.appendChild(b);
    };
    for (const lot of this.state.ownedLots()) add(`🏭 ${lot.short}`, () => this.game.focusLot(lot.id));
    add('🗺 鹿沼市', () => this.game.focusTown(), 'map');
  }

  // ---- 空き地の購入シート（1区画 or まとめて）----
  showLotSheet(lotId, index) {
    this.hideInfo();
    this.sheet = { lotId, index };
    this.renderSheet();
    this.el.sheet.classList.remove('hidden');
  }

  hideSheet() {
    this.sheet = null;
    this.el.sheet.classList.add('hidden');
  }

  renderSheet() {
    if (!this.sheet) return;
    const s = this.state;
    const lot = LOTS.find((l) => l.id === this.sheet.lotId);
    const rest = s.remainingIndices(lot.id).length;
    if (!rest) return this.hideSheet();
    const one = s.sectionCost(lot.id);
    const all = s.bulkCost(lot.id);
    const area = LAND.sectionArea;
    const owned = s.ownedIndices(lot.id).length;
    const realOne = Math.round((area * lot.unitPrice) / 10000);
    this.el.sheet.innerHTML = `
      <div class="sheet-head">
        <div>
          <div class="sheet-kind">${lot.kind}</div>
          <div class="sheet-title">${lot.home ? '本社工場の隣の土地' : lot.name}</div>
          <div class="sheet-town">${lot.town}</div>
        </div>
        <button type="button" class="sheet-close" id="sheet-close" aria-label="閉じる">✕</button>
      </div>
      <dl class="sheet-facts">
        <div><dt>残り</dt><dd>${rest}区画</dd></div>
        <div><dt>面積</dt><dd>${(rest * area).toLocaleString('ja-JP')}㎡</dd></div>
        <div><dt>参考地価</dt><dd>${(lot.unitPrice / 10000).toFixed(1)}万円/㎡</dd></div>
      </dl>
      <p class="sheet-note">${lot.note}をもとにしたゲーム内の値段です（現実なら1区画 約${realOne.toLocaleString('ja-JP')}万円）。1区画に1本の生産ラインを置けます。${owned ? `いま${owned}区画を持っています。` : ''}</p>
      <div class="sheet-actions">
        <button type="button" class="buy one" id="buy-one" ${s.money < one ? 'disabled' : ''}>
          <span>1区画だけ買う</span><b>${yen(one)}</b>
        </button>
        ${
          rest > 1
            ? `<button type="button" class="buy all" id="buy-all" ${s.money < all ? 'disabled' : ''}>
                <span>${rest}区画すべて買う<small>まとめ買いで1割引き</small></span><b>${yen(all)}</b>
              </button>`
            : ''
        }
      </div>
      <div class="sheet-money">所持金 ${yen(s.money)}</div>
    `;
    this.$('sheet-close').addEventListener('click', () => this.hideSheet());
    this.$('buy-one').addEventListener('click', () => this.game.buySection(lot.id, this.sheet.index));
    this.$('buy-all')?.addEventListener('click', () => this.game.buyAll(lot.id));
  }
}
