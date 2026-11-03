import { CONFIG, UPGRADES, EMPLOYEES, BUYERS, LAND, LANE_STEPS, LANE_COST_GROWTH } from './config.js';

const SAVE_KEY = 'straw-factory-save-v1'; // キーは据え置き、中身の v で移行する

// ゲームの状態（お金・在庫・強化レベル）と経済ルール。描画には依存しない。
export class GameState {
  constructor() {
    this.money = CONFIG.startMoney;
    this.totalEarned = 0;
    this.totalBundlesSold = 0;
    this.upgrades = Object.fromEntries(Object.keys(UPGRADES).map((k) => [k, 0]));
    this.stock = []; // 倉庫の束: { n: 本数, c: 色番号 }
    this.employees = EMPLOYEES.map((e) => ({ ...e }));
    this.buyers = BUYERS.map((b) => ({ ...b, delivered: 0 }));
    this.buyerIndex = 0;
    this.land = [0]; // 所有している区画
    this.lanes = { 0: LANE_STEPS.length }; // 区画ごとに置いた機械の数（3 で稼働）
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
  level(id) {
    return this.upgrades[id] ?? 0;
  }
  value(id, lv = this.level(id)) {
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
    return Math.round(u.baseCost * Math.pow(u.growth, this.level(id)));
  }
  isMaxed(id) {
    return this.level(id) >= UPGRADES[id].max;
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

  // --- 土地 ---
  get landMin() {
    return Math.min(...this.land);
  }
  get landMax() {
    return Math.max(...this.land);
  }
  ownsPlot(plot) {
    return this.land.includes(plot);
  }
  // 買える区画（所有地の両隣で範囲内のもの）
  buyablePlots() {
    return [this.landMin - 1, this.landMax + 1].filter((p) => p >= LAND.minPlot && p <= LAND.maxPlot);
  }
  landCost() {
    return LAND.costs[this.land.length - 1] ?? Infinity;
  }
  buyLand(plot) {
    if (!this.buyablePlots().includes(plot)) return { ok: false, reason: 'unavailable' };
    const cost = this.landCost();
    if (this.money < cost) return { ok: false, reason: 'money', short: cost - this.money };
    this.money -= cost;
    this.land.push(plot);
    this.lanes[plot] = 0;
    this.emit('land', plot);
    this.emit('change');
    return { ok: true, cost };
  }

  // --- 機械の設置（ライン増設）---
  laneStage(plot) {
    return this.lanes[plot] ?? 0;
  }
  isLaneActive(plot) {
    return this.laneStage(plot) >= LANE_STEPS.length;
  }
  get activeLaneCount() {
    return this.land.filter((p) => this.isLaneActive(p)).length;
  }
  nextLaneStep(plot) {
    if (!this.ownsPlot(plot)) return null;
    return LANE_STEPS[this.laneStage(plot)] ?? null;
  }
  laneStepCost(plot) {
    const step = this.nextLaneStep(plot);
    if (!step) return Infinity;
    const extra = this.land.filter((p) => p !== 0 && this.isLaneActive(p)).length;
    return Math.round(step.cost * Math.pow(LANE_COST_GROWTH, extra));
  }
  buildLaneStep(plot) {
    const step = this.nextLaneStep(plot);
    if (!step) return { ok: false, reason: 'unavailable' };
    const cost = this.laneStepCost(plot);
    if (this.money < cost) return { ok: false, reason: 'money', short: cost - this.money };
    this.money -= cost;
    this.lanes[plot] = this.laneStage(plot) + 1;
    this.emit('lanes', plot);
    this.emit('change');
    return { ok: true, cost, step, completed: this.isLaneActive(plot) };
  }

  // --- 在庫 ---
  addStock(n, c) {
    this.stock.push({ n, c });
    this.emit('stock');
  }
  takeStock(max) {
    const taken = this.stock.splice(0, max);
    this.emit('stock');
    return taken;
  }

  // --- 販売 ---
  nextBuyer() {
    const b = this.buyers[this.buyerIndex % this.buyers.length];
    this.buyerIndex = (this.buyerIndex + 1) % this.buyers.length;
    return b;
  }

  // おろした時点で利益を計上する
  deliver(cargo, buyer) {
    const straws = cargo.reduce((s, b) => s + b.n, 0);
    const revenue = Math.round(straws * CONFIG.pricePerStraw * this.qualityMul * buyer.priceMul);
    const cost = straws * CONFIG.materialCostPerStraw;
    const net = revenue - cost;
    this.money += net;
    this.totalEarned += net;
    this.totalBundlesSold += cargo.length;
    buyer.delivered += cargo.length;
    const result = { buyer, bundles: cargo.length, straws, revenue, cost, net };
    this.emit('delivery', result);
    this.emit('change');
    return result;
  }

  // 1分あたりの見込み利益（生産とトラックの遅いほうで決まる）
  expectedPerMinute() {
    const t = CONFIG.truck;
    const prodPerMin = (60 / this.bundleInterval) * this.activeLaneCount;
    const truckPerMin = (this.truckCapacity * 60) / (t.leaveTime + t.travelTime + t.returnTime);
    const bundlesPerMin = Math.min(prodPerMin, truckPerMin);
    const avgMul = this.buyers.reduce((s, b) => s + b.priceMul, 0) / this.buyers.length;
    const netPerStraw = CONFIG.pricePerStraw * this.qualityMul * avgMul - CONFIG.materialCostPerStraw;
    return { value: bundlesPerMin * CONFIG.avgBundleSize * netPerStraw, truckLimited: truckPerMin < prodPerMin };
  }

  // --- セーブ / ロード（localStorage は使えない環境もあるので try/catch）---
  save(extra = {}) {
    const data = {
      v: 2,
      money: this.money,
      totalEarned: this.totalEarned,
      totalBundlesSold: this.totalBundlesSold,
      upgrades: this.upgrades,
      // 配送中の荷物は倉庫に戻した扱いで保存する
      stock: [...(extra.cargo ?? []), ...this.stock],
      buyerIndex: this.buyerIndex,
      land: this.land,
      lanes: this.lanes,
      buyers: this.buyers.map((b) => ({ id: b.id, delivered: b.delivered })),
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
      if (d.v !== 1 && d.v !== 2) return s;
      s.money = Number(d.money) || 0;
      s.totalEarned = Number(d.totalEarned) || 0;
      s.totalBundlesSold = Number(d.totalBundlesSold) || 0;
      for (const k of Object.keys(s.upgrades)) {
        s.upgrades[k] = Math.min(Math.max(0, d.upgrades?.[k] | 0), UPGRADES[k].max);
      }
      s.stock = Array.isArray(d.stock) ? d.stock.slice(0, s.dockCapacity) : [];
      s.buyerIndex = d.buyerIndex | 0;
      if (Array.isArray(d.land)) {
        const land = [...new Set(d.land.map((p) => p | 0))].filter((p) => p >= LAND.minPlot && p <= LAND.maxPlot);
        if (!land.includes(0)) land.push(0);
        s.land = land.sort((a, b) => a - b);
        s.lanes = { 0: LANE_STEPS.length };
        for (const p of s.land) {
          if (p !== 0) s.lanes[p] = Math.min(Math.max(0, d.lanes?.[p] | 0), LANE_STEPS.length);
        }
      }
      for (const b of d.buyers ?? []) {
        const t = s.buyers.find((x) => x.id === b.id);
        if (t) t.delivered = b.delivered | 0;
      }
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
