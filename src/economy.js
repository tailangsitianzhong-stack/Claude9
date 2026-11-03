// 経済のルール（描画に依存しない純粋な関数）。ゲーム本体とバランス調整用シミュレーターの両方が使う。
import { CONFIG } from './config.js';
import { PRODUCTS, MATERIAL_RATIO, MAX_LEVEL } from './data/products.js';

// ---------- プレイヤーレベル ----------
// 経験値 = これまでに稼いだ純利益の合計（お金を使っても減らない）。
// 次のレベルまでに必要な経験値：exp(a + b·L + c·√L + d·ln L) ＋ 序盤の下限 (80 + 6L)
// 係数は scripts/balance-sim.mjs --fit で「収入/コスト比が最大の買い物を続ける bot」を走らせて決めた。
// 目標：1レベルあたり 6×(1+L/120) 秒（Lv.100 ≒ 15分、Lv.1000 ≒ 9時間、Lv.10000 ≒ 700時間。最適に遊んだ場合）
export const LEVEL_CURVE = { a: -1.3092740622789076, b: 0.0003536359007649767, c: 0.0946558825583739, d: 2.137280737101728 };

export function xpToNext(L, k = LEVEL_CURVE) {
  return Math.exp(k.a + k.b * L + k.c * Math.sqrt(L) + k.d * Math.log(L)) + 80 + 6 * L;
}

// CUM[L] = Lv.L に到達するのに必要な累計経験値（CUM[1] = 0）
export function buildCumulative(k = LEVEL_CURVE) {
  const cum = new Float64Array(MAX_LEVEL + 1);
  for (let L = 1; L < MAX_LEVEL; L++) cum[L + 1] = cum[L] + xpToNext(L, k);
  return cum;
}
let CUM = buildCumulative();
export function setLevelCurve(k) {
  Object.assign(LEVEL_CURVE, k);
  CUM = buildCumulative(LEVEL_CURVE);
}
// シミュレーター用：必要経験値を表で与える（need[L] = Lv.L → L+1）
export function setNeedTable(need) {
  CUM = new Float64Array(MAX_LEVEL + 1);
  for (let L = 1; L < MAX_LEVEL; L++) CUM[L + 1] = CUM[L] + need[L];
}
export const cumulativeXp = (L) => CUM[L];
export function levelFromXp(xp) {
  let lo = 1;
  let hi = MAX_LEVEL;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (CUM[mid] <= xp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
export function levelProgress(xp) {
  const L = levelFromXp(xp);
  if (L >= MAX_LEVEL) return { level: L, into: 0, need: 0, ratio: 1 };
  const into = xp - CUM[L];
  const need = CUM[L + 1] - CUM[L];
  return { level: L, into, need, ratio: into / need };
}
export const unlockedProducts = (level) => PRODUCTS.filter((p) => p.unlock <= level);

// ---------- 収入のモデル ----------
export const bundlesPerMinPerLane = (s) => 60 / s.bundleInterval;
export function truckBundlesPerMin(s) {
  const T = CONFIG.truck;
  const cap = Math.min(s.truckCapacity, s.dockCapacity);
  return (cap * 60) / (T.leaveTime + T.travelTime + T.returnTime);
}
export const netPerStraw = (p, s) => p.price * (s.qualityMul - MATERIAL_RATIO);

// 需要を超えて売ると値崩れする：売れた量 sold、需要 demand のとき、受け取る売上は定価 × min(sold, demand)
export function saturationFactor(sold, demand) {
  return sold <= demand ? 1 : demand / sold;
}

// 1分あたりの見込み純利益
export function incomeModel(s, assignment = s.laneProducts) {
  const per = bundlesPerMinPerLane(s);
  const prod = new Map();
  for (const key of s.owned) {
    if (!s.isLaneActive(key)) continue;
    const pid = assignment[key] ?? 0;
    prod.set(pid, (prod.get(pid) ?? 0) + per);
  }
  let total = 0;
  for (const v of prod.values()) total += v;
  const truck = truckBundlesPerMin(s);
  const scale = total > 0 ? Math.min(1, truck / total) : 1;
  let perMin = 0;
  const saturated = [];
  for (const [pid, rate] of prod) {
    const p = PRODUCTS[pid];
    const shipped = rate * scale;
    if (shipped > p.demand) saturated.push(pid);
    perMin += Math.min(shipped, p.demand) * CONFIG.avgBundleSize * netPerStraw(p, s);
  }
  return { perMin, bundlesPerMin: total, truckLimited: truck < total, saturated };
}

// おまかせ配分：稼働中のラインを、需要の空きと単価を見て1本ずつ一番もうかる製品に割り当てる
export function autoAssign(s, level = s.level) {
  const options = unlockedProducts(level);
  const per = bundlesPerMinPerLane(s);
  const rate = new Map();
  const result = {};
  const keys = s.owned.filter((k) => s.isLaneActive(k));
  for (const key of keys) {
    let best = options[0];
    let bestGain = -1;
    for (const p of options) {
      const r = rate.get(p.id) ?? 0;
      const gain = (Math.min(r + per, p.demand) - Math.min(r, p.demand)) * netPerStraw(p, s);
      if (gain > bestGain + 1e-9 || (Math.abs(gain - bestGain) < 1e-9 && p.price > best.price)) {
        best = p;
        bestGain = gain;
      }
    }
    result[key] = best.id;
    rate.set(best.id, (rate.get(best.id) ?? 0) + per);
  }
  return result;
}

// ---------- 大きな金額の表示（万・億・兆・京・垓）----------
const UNITS = [
  [1e20, '垓'],
  [1e16, '京'],
  [1e12, '兆'],
  [1e8, '億'],
  [1e4, '万'],
];
export function formatYen(n) {
  const sign = n < 0 ? '-' : '';
  const v = Math.abs(n);
  for (const [base, u] of UNITS) {
    if (v >= base) {
      const x = v / base;
      const digits = x >= 1000 ? 0 : x >= 100 ? 1 : 2;
      return `${sign}¥${x.toFixed(digits)}${u}`;
    }
  }
  return `${sign}¥${Math.floor(v).toLocaleString('ja-JP')}`;
}
export function formatNum(n) {
  return formatYen(n).replace('¥', '');
}
