import { UPGRADES, COMPANY_NAME } from '../config.js';

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
    };
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
    const { truck, production } = this.game;
    this.el.money.textContent = yen(s.money);
    const exp = s.expectedPerMinute();
    this.el.rate.textContent = `見込み +${yen(exp.value)}/分`;

    this.el.prod.textContent = `⚙️ 1束/${s.bundleInterval.toFixed(1)}秒`;
    const full = s.stock.length >= s.dockCapacity;
    this.el.stock.textContent = `📦 在庫 ${s.stock.length}/${s.dockCapacity}束`;
    this.el.stock.classList.toggle('bad', full);
    this.el.prod.classList.toggle('bad', production.blockedReason === 'dockFull');

    let truckText;
    switch (truck.mode) {
      case 'docked': {
        const sec = truck.secondsToDepart;
        truckText = sec == null ? '🚚 待機中' : `🚚 ${Math.ceil(sec)}秒後に発車`;
        break;
      }
      case 'leaving':
      case 'away':
        truckText = `🚚 ${truck.buyer?.name ?? ''}へ配送中`;
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
    while (this.el.toasts.children.length > 3) this.el.toasts.lastChild.remove();
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
  }

  showInfo(obj) {
    if (!obj) return this.hideInfo();
    this.infoTarget = obj;
    const info = obj.userData.info;
    this.el.infoTitle.textContent = info.title;
    this.el.infoDesc.textContent = info.desc;
    this.renderInfoStatus();
    this.el.info.classList.remove('hidden');
  }

  renderInfoStatus() {
    const key = this.infoTarget.userData.key;
    const st = this.game.production.status[key];
    const el = this.el.infoStatus;
    if (st) {
      el.textContent = STATUS_LABEL[st] + (st === 'blocked' ? '（倉庫が満杯／出荷待ち）' : '');
      el.className = 'info-status ' + st;
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
}
