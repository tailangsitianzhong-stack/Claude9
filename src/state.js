import { CONFIG, UPGRADES, EMPLOYEES, LAND, LOTS, LANE_STEPS, LANE_COST_GROWTH, STRAW_COLORS } from './config.js';
import { PRODUCTS, MATERIAL_RATIO } from './data/products.js';
import { levelFromXp, levelProgress, incomeModel, autoAssign, saturationFactor, unlockedProducts } from './economy.js';

const HOME_KEY = 'home:2';
const lotOf = (id) => LOTS.find((l) => l.id === id);
const countOf = (lot) => (lot.home ? 5 : lot.sections);

const SAVE_KEY = 'straw-factory-save-v1'; // キーは据え置き、中身の v で移行する

// ゲームの状態（お金・在庫・強化レベル）と経済ルール。描画には依存しない。
export class GameState {
  constructor() {
    this.money = CONFIG.startMoney;
    this.totalEarned = 0;
    this.totalBundlesSold = 0;
    this.upgrades = Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, 0]));
    this.stock = []; // 倉庫の束: { n: 本数, c: 色番号, p: 製品ID }
    this.employees = EMPLOYEES.map((e) => ({ ...e }));
    this.laneProducts = { [HOME_KEY]: 0 }; // ラインごとに作る製品
    this.defaultProduct = 0; // 新しいラインが最初に作る製品（最後に選んだもの）
    this.sales = {}; // 製品ごとの「直近1分くらい」に売れた束の数（値崩れの計算用）
    this._level = 1;
    this.owned = [HOME_KEY]; // 所有している区画（"土地ID:番号"）
    this.lanes = { [HOME_KEY]: LANE_STEPS.length }; // 区画ごとに置いた機械の数（3 で稼働）
    this._listeners = new Map();
  }

  // --- イベント ---
  on(evt, fn) {
    if (!this._listeners.has(evt)) this._listeners.set(evt, new Set());
    this._listeners.get(evt).add(fn);
    return () => this._listeners.get(evt).delete(fn);
  }
  emit(evt, payload) {
    this._listeners.get(evt)?.forEach((fn) => fn(payload));
  }

  // --- 強化による値 ---
  upgradeLevel(id) {
    return this.upgrades[id] ?? 0;
  }
  value(id, lv = this.upgradeLevel(id)) {
    return UPGRADES[id].effect(lv);
  }
  get bundleInterval() {
    return this.value('speed');
  }
  get truckCapacity() {
    return this.value('truck');
  }
  get qualityMul() {
    return this.value('quality');
  }
  get dockCapacity() {
    return this.value('dock');
  }

  upgradeCost(id) {
    const u = UPGRADES[id];
    return Math.round(u.baseCost * Math.pow(u.growth, this.upgradeLevel(id)));
  }
  isMaxed(id) {
    return this.upgradeLevel(id) >= UPGRADES[id].max;
  }
  canUpgrade(id) {
    return !this.isMaxed(id) && this.money >= this.upgradeCost(id);
  }
  buyUpgrade(id) {
    if (!this.canUpgrade(id)) return false;
    this.money -= this.upgradeCost(id);
    this.upgrades[id] += 1;
    this.emit('change');
    return true;
  }

  // --- 土地（空き地の区画）---
  owns(key) {
    return this.owned.includes(key);
  }
  ownedIndices(lotId) {
    return this.owned.filter((k) => k.startsWith(lotId + ':')).map((k) => Number(k.split(':')[1]));
  }
  ownedLots() {
    return LOTS.filter((l) => this.ownedIndices(l.id).length > 0);
  }
  remainingIndices(lotId) {
    const lot = lotOf(lotId);
    const own = new Set(this.ownedIndices(lotId));
    return [...Array(countOf(lot)).keys()].filter((i) => !own.has(i));
  }
  // 1区画ずつ買うときに買える区画：持っている区画の隣。まだ持っていなければ入口の区画
  buyableIndices(lotId) {
    const lot = lotOf(lotId);
    const own = this.ownedIndices(lotId);
    if (own.length === 0) return [lot.startSection ?? 0];
    const n = countOf(lot);
    const set = new Set(own);
    return [Math.min(...own) - 1, Math.max(...own) + 1].filter((i) => i >= 0 && i < n && !set.has(i));
  }
  // k 区画先に買うときの値段（持つほど高くなる）
  sectionCost(lotId, k = 0) {
    const lot = lotOf(lotId);
    const base = LAND.sectionArea * lot.unitPrice * LAND.yenScale;
    return Math.round(base * Math.pow(LAND.growth, this.owned.length - 1 + k));
  }
  bulkCost(lotId) {
    const n = this.remainingIndices(lotId).length;
    let sum = 0;
    for (let k = 0; k < n; k++) sum += this.sectionCost(lotId, k);
    return Math.round(sum * (n > 1 ? LAND.bulkDiscount : 1));
  }
  _addSections(lotId, indices, cost) {
    if (this.money < cost) return { ok: false, reason: 'money', short: cost - this.money };
    this.money -= cost;
    for (const i of indices) {
      const key = `${lotId}:${i}`;
      this.owned.push(key);
      this.lanes[key] = 0;
    }
    this.emit('land', lotId);
    this.emit('change');
    return { ok: true, cost, count: indices.length };
  }
  buySection(lotId, index) {
    if (!this.buyableIndices(lotId).includes(index)) return { ok: false, reason: 'unavailable' };
    return this._addSections(lotId, [index], this.sectionCost(lotId));
  }
  buyAllSections(lotId) {
    const rest = this.remainingIndices(lotId);
    if (!rest.length) return { ok: false, reason: 'unavailable' };
    return this._addSections(lotId, rest, this.bulkCost(lotId));
  }

  // --- 機械の設置（ライン増設）---
  laneStage(key) {
    return this.lanes[key] ?? 0;
  }
  isLaneActive(key) {
    return this.laneStage(key) >= LANE_STEPS.length;
  }
  get activeLaneCount() {
    return this.owned.filter((k) => this.isLaneActive(k)).length;
  }
  nextLaneStep(key) {
    if (!this.owns(key)) return null;
    return LANE_STEPS[this.laneStage(key)] ?? null;
  }
  laneStepCost(key) {
    const step = this.nextLaneStep(key);
    if (!step) return Infinity;
    const extra = this.owned.filter((k) => k !== HOME_KEY && this.isLaneActive(k)).length;
    return Math.round(step.cost * Math.pow(LANE_COST_GROWTH, extra));
  }
  buildLaneStep(key) {
    const step = this.nextLaneStep(key);
    if (!step) return { ok: false, reason: 'unavailable' };
    const cost = this.laneStepCost(key);
    if (this.money < cost) return { ok: false, reason: 'money', short: cost - this.money };
    this.money -= cost;
    this.lanes[key] = this.laneStage(key) + 1;
    this.emit('lanes', key);
    this.emit('change');
    return { ok: true, cost, step, completed: this.isLaneActive(key) };
  }

  // --- プレイヤーレベル（稼いだ純利益の合計で上がる）---
  get level() {
    return levelFromXp(this.totalEarned);
  }
  get levelInfo() {
    return levelProgress(this.totalEarned);
  }
  get unlocked() {
    return unlockedProducts(this.level);
  }

  // --- 製品 ---
  productOf(key) {
    return PRODUCTS[this.laneProducts[key] ?? this.defaultProduct] ?? PRODUCTS[0];
  }
  setLaneProduct(key, pid) {
    const p = PRODUCTS[pid];
    if (!p || p.unlock > this.level || !this.owns(key)) return false;
    this.laneProducts[key] = pid;
    this.defaultProduct = pid;
    this.emit('products', key);
    this.emit('change');
    return true;
  }
  autoAssignAll() {
    const a = autoAssign(this, this.level);
    for (const [k, pid] of Object.entries(a)) this.laneProducts[k] = pid;
    this.emit('products');
    this.emit('change');
    return a;
  }
  resolvedAssignment() {
    const a = {};
    for (const k of this.owned) a[k] = this.productOf(k).id;
    return a;
  }
  // いま作っている製品の取引先の合計
  get totalBuyers() {
    const ids = new Set(this.owned.filter((k) => this.isLaneActive(k)).map((k) => this.productOf(k).id));
    let n = 0;
    for (const id of ids) n += PRODUCTS[id].buyers;
    return n;
  }

  // --- 在庫 ---
  addStock(n, c, p) {
    this.stock.push({ n, c, p });
    this.emit('stock');
  }
  takeStock(max) {
    const taken = this.stock.splice(0, max);
    this.emit('stock');
    return taken;
  }

  // --- 販売 ---
  nextBuyer() {
    return null; // 取引先は製品ごと（deliver で集計）
  }

  // 売れた量の記録は約1分で消えていく
  decaySales(dt) {
    const k = Math.exp(-dt / 60);
    for (const id of Object.keys(this.sales)) {
      this.sales[id] *= k;
      if (this.sales[id] < 0.01) delete this.sales[id];
    }
  }

  // おろした時点で利益を計上する（製品ごとに需要を超えた分は値崩れ）
  deliver(cargo) {
    const before = this.level;
    const byProduct = new Map();
    for (const b of cargo) {
      const pid = b.p ?? 0;
      const e = byProduct.get(pid) ?? { bundles: 0, straws: 0 };
      e.bundles++;
      e.straws += b.n;
      byProduct.set(pid, e);
    }
    let revenue = 0;
    let cost = 0;
    let straws = 0;
    let top = null;
    let worst = 1;
    for (const [pid, e] of byProduct) {
      const p = PRODUCTS[pid] ?? PRODUCTS[0];
      this.sales[pid] = (this.sales[pid] ?? 0) + e.bundles;
      const f = saturationFactor(this.sales[pid], p.demand);
      worst = Math.min(worst, f);
      const r = e.straws * p.price * this.qualityMul * f;
      revenue += r;
      cost += e.straws * p.price * MATERIAL_RATIO;
      straws += e.straws;
      if (!top || r > top.r) top = { p, r };
    }
    const net = revenue - cost;
    this.money += net;
    this.totalEarned += Math.max(0, net);
    this.totalBundlesSold += cargo.length;
    const result = { product: top?.p, kinds: byProduct.size, bundles: cargo.length, straws, revenue, cost, net, saturation: worst };
    this.emit('delivery', result);
    const after = this.level;
    if (after > before) {
      const unlocked = PRODUCTS.filter((p) => p.unlock > before && p.unlock <= after);
      this.emit('levelup', { from: before, to: after, unlocked });
    }
    this.emit('change');
    return result;
  }

  // 1分あたりの見込み利益（生産・トラック・需要で決まる）
  expectedPerMinute() {
    const m = incomeModel(this, this.resolvedAssignment());
    return { value: m.perMin, truckLimited: m.truckLimited, saturated: m.saturated };
  }

  // --- セーブ / ロード（localStorage は使えない環境もあるので try/catch）---
  save(extra = {}) {
    const data = {
      v: 4,
      money: this.money,
      totalEarned: this.totalEarned,
      totalBundlesSold: this.totalBundlesSold,
      upgrades: this.upgrades,
      // 配送中の荷物は倉庫に戻した扱いで保存する
      stock: [...(extra.cargo ?? []), ...this.stock],
      owned: this.owned,
      lanes: this.lanes,
      laneProducts: this.laneProducts,
      defaultProduct: this.defaultProduct,
      sales: this.sales,
      savedAt: Date.now(),
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      /* 保存できない環境では何もしない */
    }
  }

  static load() {
    const s = new GameState();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return s;
      const d = JSON.parse(raw);
      if (![1, 2, 3, 4].includes(d.v)) return s;
      s.money = Number(d.money) || 0;
      s.totalEarned = Number(d.totalEarned) || 0;
      s.totalBundlesSold = Number(d.totalBundlesSold) || 0;
      for (const k of Object.keys(s.upgrades)) {
        s.upgrades[k] = Math.min(Math.max(0, d.upgrades?.[k] | 0), UPGRADES[k].max);
      }
      s.stock = Array.isArray(d.stock) ? d.stock.slice(0, s.dockCapacity) : [];
      // v2 までは本社の区画番号(-2..2)だけを持っていた → "home:番号" に変換
      let owned = null;
      let lanes = {};
      if (Array.isArray(d.owned)) {
        owned = d.owned;
        lanes = d.lanes ?? {};
      } else if (Array.isArray(d.land)) {
        owned = d.land.map((p) => `home:${(p | 0) + 2}`);
        for (const p of d.land) lanes[`home:${(p | 0) + 2}`] = d.lanes?.[p];
      }
      if (owned) {
        const valid = new Set();
        for (const key of owned) {
          const [id, idx] = String(key).split(':');
          const lot = lotOf(id);
          const i = Number(idx);
          if (lot && Number.isInteger(i) && i >= 0 && i < countOf(lot)) valid.add(`${id}:${i}`);
        }
        valid.add(HOME_KEY);
        s.owned = [...valid];
        s.lanes = {};
        for (const k of s.owned) s.lanes[k] = Math.min(Math.max(0, lanes[k] | 0), LANE_STEPS.length);
        s.lanes[HOME_KEY] = LANE_STEPS.length;
      }
      // 製品（v3 以前はすべてストレートストロー）
      const lvl = s.level;
      const okProduct = (pid) => Number.isInteger(pid) && PRODUCTS[pid] && PRODUCTS[pid].unlock <= lvl;
      if (okProduct(d.defaultProduct)) s.defaultProduct = d.defaultProduct;
      s.laneProducts = {};
      for (const k of s.owned) {
        const pid = d.laneProducts?.[k];
        if (okProduct(pid)) s.laneProducts[k] = pid;
      }
      for (const [id, v] of Object.entries(d.sales ?? {})) {
        if (PRODUCTS[id] && Number.isFinite(v)) s.sales[id] = v;
      }
      // 色は v3 までは色番号、v4 からは色そのもの
      s.stock = s.stock.map((b) => ({ n: b.n | 0 || 4, c: d.v < 4 ? (STRAW_COLORS[b.c | 0] ?? 0xffffff) : b.c | 0, p: okProduct(b.p) ? b.p : 0 }));
    } catch {
      /* 壊れたセーブは無視して新規開始 */
    }
    return s;
  }

  static reset() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* noop */
    }
  }
}
