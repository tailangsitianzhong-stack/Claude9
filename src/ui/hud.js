import { UPGRADES, COMPANY_NAME, LOTS, LAND } from '../config.js';
import { PRODUCTS, MAX_LEVEL } from '../data/products.js';
import { formatYen, formatNum, bundlesPerMinPerLane } from '../economy.js';
import { laneLabel } from '../scene/factory.js';

const yen = formatYen;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
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
    this.state.on('levelup', (e) => this.onLevelUp(e));
    this.state.on('products', () => this.sheet?.type !== 'lot' && this.renderSheet());
  }

  build() {
    const s = this.state;
    this.root.innerHTML = `
      <header class="top">
        <div class="company">
          <div class="logo">🥤</div>
          <div>
            <div class="name">${COMPANY_NAME}</div>
            <div class="lvrow">
              <span class="lv-badge" id="h-lv"></span>
              <div class="xpbar" role="progressbar" aria-label="次のレベルまで"><i id="h-xp"></i></div>
            </div>
            <div class="sub" id="h-sub"></div>
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
        <div class="info-product" id="info-product"></div>
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
      lv: this.$('h-lv'),
      xp: this.$('h-xp'),
      sub: this.$('h-sub'),
      infoProduct: this.$('info-product'),
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
    const li = s.levelInfo;
    this.el.lv.textContent = `Lv.${li.level.toLocaleString('ja-JP')}`;
    this.el.xp.style.width = `${(li.ratio * 100).toFixed(1)}%`;
    this.el.sub.textContent =
      li.level >= MAX_LEVEL ? '最高レベル到達！' : `次のLvまで ${yen(li.need - li.into)} ・ 取引先 ${s.totalBuyers.toLocaleString('ja-JP')}社`;

    this.el.prod.textContent = `⚙️ ${s.activeLaneCount}ライン・${s.bundleInterval.toFixed(1)}秒`;
    const full = s.stock.length >= s.dockCapacity;
    this.el.stock.textContent = `📦 ${formatNum(s.stock.length)}/${formatNum(s.dockCapacity)}束`;
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
      ship.textContent = `いますぐ出荷（${formatNum(Math.min(s.stock.length, s.truckCapacity))}束）`;
    } else {
      ship.disabled = true;
      ship.textContent = truck.mode === 'docked' ? '在庫なし' : 'トラック配送中…';
    }
    ship.classList.toggle('alert', full && truck.canShip);

    for (const [id, c] of Object.entries(this.cards)) {
      const u = UPGRADES[id];
      const lv = s.upgradeLevel(id);
      const maxed = s.isMaxed(id);
      c.lv.textContent = maxed ? 'MAX' : `Lv.${lv}`;
      c.effect.textContent = maxed ? u.format(s.value(id)) : `${u.format(s.value(id))} → ${u.format(s.value(id, lv + 1))}`;
      c.cost.textContent = maxed ? '—' : yen(s.upgradeCost(id));
      c.root.disabled = !s.canUpgrade(id);
      c.root.classList.toggle('maxed', maxed);
    }

    if (this.infoTarget) this.renderInfoStatus();
    if (this.sheet?.type === 'lot') {
      const key = `${this.state.money >= this.state.sectionCost(this.sheet.lotId)}|${this.state.money >= this.state.bulkCost(this.sheet.lotId)}|${this.state.remainingIndices(this.sheet.lotId).length}`;
      if (key !== this.sheetKey) {
        this.sheetKey = key;
        this.renderSheet();
      }
    }
  }

  onDelivery(r) {
    const what = r.kinds > 1 ? `${esc(r.product.name)}ほか${r.kinds - 1}品` : esc(r.product.name);
    const drop = r.saturation < 0.995 ? ` <span class="warn">需要オーバーで値崩れ ×${r.saturation.toFixed(2)}</span>` : '';
    this.toast(`<b>+${yen(r.net)}</b> ${what} ${formatNum(r.bundles)}束をおろしました${drop}`);
    this.el.money.classList.remove('bump');
    void this.el.money.offsetWidth;
    this.el.money.classList.add('bump');
  }

  toast(html, cls = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + cls;
    t.innerHTML = html;
    this.el.toasts.prepend(t);
    while (this.el.toasts.children.length > 2) this.el.toasts.lastChild.remove();
    const life = cls.includes('big') ? 5000 : 2600;
    setTimeout(() => t.classList.add('out'), life);
    setTimeout(() => t.remove(), life + 500);
  }

  onLevelUp(e) {
    const names = e.unlocked.map((p) => esc(p.name));
    this.toast(
      `<b>Lv.${e.to.toLocaleString('ja-JP')}にアップ！</b>` + (names.length ? ` 新製品「${names.join('」「')}」が作れるようになりました` : ''),
      names.length ? 'level big' : 'level',
    );
    this.renderNav();
  }

  showInfo(obj) {
    if (!obj) return this.hideInfo();
    this.hideSheet();
    this.infoTarget = obj;
    const info = obj.userData.info;
    this.el.infoTitle.textContent = info.title;
    this.el.infoDesc.textContent = info.desc;
    this.renderInfoStatus();
    // ラインの機械なら「作っている製品」と変更ボタン
    const lane = obj.userData.lane;
    const box = this.el.infoProduct;
    if (lane) {
      const p = this.state.productOf(lane.key);
      box.innerHTML = `
        <div class="ip-label">このラインの製品</div>
        <div class="ip-row">
          <div><b>${esc(p.name)}</b><span>${yen(p.price)}/本・取引先${p.buyers}社</span></div>
          <button type="button" class="ip-btn" id="ip-change">製品を変える</button>
        </div>`;
      this.$('ip-change').addEventListener('click', () => this.showProductPicker(lane.key));
      box.hidden = false;
    } else {
      box.hidden = true;
    }
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
    const n = this.state.unlocked.length;
    add(`📦 製品 ${n}/${PRODUCTS.length}`, () => this.showCatalog(), 'products');
    for (const lot of this.state.ownedLots()) add(`🏭 ${lot.short}`, () => this.game.focusLot(lot.id));
    add('🗺 鹿沼市', () => this.game.focusTown(), 'map');
  }

  // ---- 空き地の購入シート（1区画 or まとめて）----
  showLotSheet(lotId, index) {
    this.hideInfo();
    this.sheet = { type: 'lot', lotId, index };
    this.renderSheet();
    this.el.sheet.classList.remove('hidden');
  }

  hideSheet() {
    this.sheet = null;
    this.el.sheet.classList.add('hidden');
  }

  renderSheet() {
    if (!this.sheet) return;
    if (this.sheet.type === 'picker') return this.renderPicker();
    if (this.sheet.type === 'catalog') return this.renderCatalog();
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

  // ---- 製品：いまの生産量（束/分）----
  productionByProduct() {
    const s = this.state;
    const per = bundlesPerMinPerLane(s);
    const m = new Map();
    for (const k of s.laneKeys) if (s.isLaneActive(k)) m.set(s.productOf(k).id, (m.get(s.productOf(k).id) ?? 0) + per);
    return m;
  }

  productRow(p, { current, made, button }) {
    const locked = p.unlock > this.state.level;
    const demandText = made ? `需要 ${formatNum(p.demand)}束/分・生産 ${formatNum(made)}束/分` : `需要 ${formatNum(p.demand)}束/分`;
    const over = made > p.demand;
    return `
      <li class="prod ${locked ? 'locked' : ''} ${current ? 'current' : ''}">
        <span class="swatch" style="background:linear-gradient(${p.colors.map((c) => '#' + c.toString(16).padStart(6, '0')).join(',')})"></span>
        <div class="prod-main">
          <div class="prod-name">${esc(p.name)}${p.niche ? '<em>こだわり品</em>' : ''}</div>
          <div class="prod-meta">${locked ? `Lv.${p.unlock.toLocaleString('ja-JP')}で解放` : `${yen(p.price)}/本 ・ 取引先 ${p.buyers}社 ・ <span class="${over ? 'warn' : ''}">${demandText}</span>`}</div>
        </div>
        ${button ?? ''}
      </li>`;
  }

  // 1つのラインの製品を選ぶ
  showProductPicker(key) {
    this.hideInfo();
    this.sheet = { type: 'picker', key };
    this.renderPicker();
    this.el.sheet.classList.remove('hidden');
  }

  renderPicker() {
    const s = this.state;
    const key = this.sheet.key;
    const cur = s.productOf(key).id;
    const made = this.productionByProduct();
    const list = [...s.unlocked].sort((a, b) => b.price - a.price);
    const next = PRODUCTS.find((p) => p.unlock > s.level);
    this.el.sheet.innerHTML = `
      <div class="sheet-head">
        <div>
          <div class="sheet-kind">${esc(laneLabel(key))}</div>
          <div class="sheet-title">作る製品を選ぶ</div>
          <div class="sheet-town">需要（取引先×10束/分）を超えて作ると、超えた分だけ値崩れします</div>
        </div>
        <button type="button" class="sheet-close" id="sheet-close" aria-label="閉じる">✕</button>
      </div>
      <button type="button" class="buy one" id="auto-assign"><span>おまかせ配分<small>全ラインを需要と単価で自動で割り当て</small></span><b>⚡</b></button>
      <ul class="prod-list">
        ${list
          .map((p) =>
            this.productRow(p, {
              current: p.id === cur,
              made: made.get(p.id),
              button: p.id === cur ? '<span class="prod-cur">生産中</span>' : `<button type="button" class="prod-pick" data-pid="${p.id}">これにする</button>`,
            }),
          )
          .join('')}
      </ul>
      ${next ? `<p class="sheet-note">次の新製品：Lv.${next.unlock.toLocaleString('ja-JP')}「${esc(next.name)}」（${yen(next.price)}/本）</p>` : ''}
    `;
    this.$('sheet-close').addEventListener('click', () => this.hideSheet());
    this.$('auto-assign').addEventListener('click', () => {
      s.autoAssignAll();
      this.toast('<b>おまかせ配分</b> 全ラインの製品を割り当てました');
    });
    this.el.sheet.querySelectorAll('.prod-pick').forEach((b) =>
      b.addEventListener('click', () => {
        const p = PRODUCTS[Number(b.dataset.pid)];
        if (s.setLaneProduct(key, p.id)) this.toast(`<b>${esc(p.name)}</b>の生産に切り替えました`);
      }),
    );
  }

  // 100種類の製品カタログ
  showCatalog() {
    this.hideInfo();
    this.sheet = { type: 'catalog' };
    this.renderCatalog();
    this.el.sheet.classList.remove('hidden');
  }

  renderCatalog() {
    const s = this.state;
    const made = this.productionByProduct();
    const series = [...new Set(PRODUCTS.map((p) => p.series))];
    this.el.sheet.innerHTML = `
      <div class="sheet-head">
        <div>
          <div class="sheet-kind">Lv.${s.level.toLocaleString('ja-JP')} ・ ${s.unlocked.length}/${PRODUCTS.length}種類</div>
          <div class="sheet-title">製品カタログ</div>
          <div class="sheet-town">稼いでレベルを上げると新しい製品が作れます。製品は機械をタップして切り替え</div>
        </div>
        <button type="button" class="sheet-close" id="sheet-close" aria-label="閉じる">✕</button>
      </div>
      <button type="button" class="buy one" id="auto-assign"><span>おまかせ配分<small>全ラインを需要と単価で自動で割り当て</small></span><b>⚡</b></button>
      <div class="catalog">
        ${series
          .map(
            (name) => `
          <h3>${esc(name)}</h3>
          <ul class="prod-list">${PRODUCTS.filter((p) => p.series === name)
            .map((p) => this.productRow(p, { made: made.get(p.id), current: made.has(p.id) }))
            .join('')}</ul>`,
          )
          .join('')}
      </div>
    `;
    this.$('sheet-close').addEventListener('click', () => this.hideSheet());
    this.$('auto-assign').addEventListener('click', () => {
      s.autoAssignAll();
      this.toast('<b>おまかせ配分</b> 全ラインの製品を割り当てました');
    });
  }
}
