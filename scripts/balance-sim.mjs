// バランス調整用シミュレーター
//   node scripts/balance-sim.mjs          … いまの LEVEL_CURVE で bot を走らせて到達時間を表示
//   node scripts/balance-sim.mjs --fit    … 目標ペースに合う LEVEL_CURVE を探して表示
//
// bot は「1円あたり一番収入が増える買い物」を順に買い（強化・ライン完成・土地＋機械）、
// 製品は毎回おまかせ配分（需要の空きと単価で割り当て）する。
// 参考：Kongregate "The Math of Idle Games"（最適購入＝収入/コスト比が最大のもの）
import { GameState } from '../src/state.js';
import { UPGRADES, LOTS, LANE_STEPS, LANE_COST_GROWTH } from '../src/config.js';
import { MAX_LEVEL } from '../src/data/products.js';
import { incomeModel, autoAssign, setNeedTable, setLevelCurve, xpToNext, cumulativeXp, levelFromXp, LEVEL_CURVE } from '../src/economy.js';

// 目標：Lv.L → L+1 にかかる秒数
export const targetSeconds = (L) => 6 * (1 + L / 120);

function income(s) {
  const a = autoAssign(s, s.level);
  return incomeModel(s, a).perMin / 60;
}

function laneRestCost(s, key, extraAfter) {
  const extra = extraAfter ?? s.laneKeys.filter((k) => k !== 'home:2' && s.isLaneActive(k)).length;
  let c = 0;
  for (let i = s.laneStage(key); i < LANE_STEPS.length; i++) c += LANE_STEPS[i].cost * Math.pow(LANE_COST_GROWTH, extra);
  return c;
}

function candidates(s) {
  const base = income(s);
  const out = [];
  const consider = (cost, mutate, undo, buy) => {
    mutate();
    const gain = income(s) - base;
    undo();
    if (gain > 0 && Number.isFinite(cost)) out.push({ cost, roi: gain / cost, buy });
  };
  for (const id of Object.keys(UPGRADES)) {
    if (s.isMaxed(id)) continue;
    consider(s.upgradeCost(id), () => s.upgrades[id]++, () => s.upgrades[id]--, () => s.buyUpgrade(id));
  }
  for (const key of s.laneKeys) {
    if (s.isLaneActive(key)) continue;
    const prev = s.lanes[key];
    consider(laneRestCost(s, key), () => (s.lanes[key] = 3), () => (s.lanes[key] = prev), () => {
      while (!s.isLaneActive(key)) if (!s.buildLaneStep(key).ok) return false;
      return true;
    });
  }
  // 土地＋機械をまとめて1つの買い物として扱う（一番安い区画だけ）
  let bestLand = null;
  for (const lot of LOTS) {
    for (const i of s.buyableIndices(lot.id)) {
      const c = s.sectionCost(lot.id);
      if (!bestLand || c < bestLand.c) bestLand = { lot, i, c };
    }
  }
  if (bestLand && s.laneKeys.every((k) => s.isLaneActive(k))) {
    const key = `${bestLand.lot.id}:${bestLand.i}`;
    const total = bestLand.c + laneRestCost(s, key);
    consider(
      total,
      () => {
        s.owned.push(key);
        s.lanes[key] = 3;
      },
      () => {
        s.owned.pop();
        delete s.lanes[key];
      },
      () => {
        if (!s.buySection(bestLand.lot.id, bestLand.i).ok) return false;
        while (!s.isLaneActive(key)) if (!s.buildLaneStep(key).ok) return false;
        return true;
      },
    );
  }
  out.sort((a, b) => b.roi - a.roi);
  return out;
}

export function simulate({ maxSeconds = 4e7, log = false } = {}) {
  const s = new GameState();
  let t = 0;
  const reachedAt = new Float64Array(MAX_LEVEL + 1);
  const incomeAt = new Float64Array(MAX_LEVEL + 1);
  const lanesAt = new Int32Array(MAX_LEVEL + 1);
  let L = 1;
  incomeAt[1] = income(s);
  let rate = incomeAt[1];
  let plan = null;
  while (L < MAX_LEVEL && t < maxSeconds) {
    // 買えるものは買う（ROI 最大のものが買えるまで待つ）
    for (let guard = 0; guard < 50; guard++) {
      plan = candidates(s)[0];
      if (!plan || s.money < plan.cost) break;
      const money = s.money;
      if (plan.buy() === false) {
        s.money = money;
        break;
      }
      rate = income(s);
    }
    const toLevel = (cumulativeXp(L + 1) - s.totalEarned) / rate;
    const toBuy = plan ? Math.max(0, (plan.cost - s.money) / rate) : Infinity;
    const dt = Math.max(1e-3, Math.min(toLevel, toBuy, 3600));
    t += dt;
    s.money += rate * dt;
    s.totalEarned += rate * dt;
    const nl = levelFromXp(s.totalEarned + 1e-9);
    if (nl > L) {
      const newRate = income(s);
      for (let l = L + 1; l <= nl; l++) {
        reachedAt[l] = t;
        incomeAt[l] = newRate;
        lanesAt[l] = s.activeLaneCount;
      }
      L = nl;
      rate = newRate;
    }
  }
  if (log) {
    const h = (x) => (x / 3600).toFixed(x < 36000 ? 2 : 0);
    console.log('   Lv  到達時間(h)  目標(h)   収入/秒  稼働ライン');
    let target = 0;
    const tgt = [0];
    for (let l = 1; l < MAX_LEVEL; l++) tgt[l + 1] = (tgt[l] ?? 0) + targetSeconds(l);
    for (const l of [2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 3000, 5000, 7500, 10000]) {
      if (!reachedAt[l] && l > 1) {
        console.log(`${l}: 未到達`);
        continue;
      }
      console.log(`${String(l).padStart(5)}  ${h(reachedAt[l]).padStart(9)}  ${h(tgt[l]).padStart(8)}  ${incomeAt[l].toExponential(2).padStart(9)}  ${lanesAt[l]}`);
    }
  }
  return { reachedAt, incomeAt, finalLevel: L, t };
}

// ---- 最小二乗で ln(need) = a + bL + c√L + d lnL を当てはめる ----
function fitCurve(need) {
  const rows = [];
  for (let L = 1; L < MAX_LEVEL; L++) rows.push([[1, L, Math.sqrt(L), Math.log(L)], Math.log(need[L])]);
  const n = 4;
  const A = Array.from({ length: n }, () => new Float64Array(n));
  const y = new Float64Array(n);
  for (const [x, v] of rows) for (let i = 0; i < n; i++) {
    y[i] += x[i] * v;
    for (let j = 0; j < n; j++) A[i][j] += x[i] * x[j];
  }
  // ガウスの消去法
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    [y[i], y[p]] = [y[p], y[i]];
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      y[r] -= f * y[i];
    }
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let v = y[i];
    for (let c = i + 1; c < n; c++) v -= A[i][c] * x[c];
    x[i] = v / A[i][i];
  }
  return { a: x[0], b: x[1], c: x[2], d: x[3] };
}

if (process.argv.includes('--fit')) {
  let need = new Float64Array(MAX_LEVEL + 1);
  for (let L = 1; L < MAX_LEVEL; L++) need[L] = xpToNext(L);
  for (let iter = 0; iter < 6; iter++) {
    setNeedTable(need);
    const r = simulate();
    const next = new Float64Array(MAX_LEVEL + 1);
    let last = r.incomeAt[1];
    for (let L = 1; L < MAX_LEVEL; L++) {
      const inc = r.incomeAt[L] > 0 ? r.incomeAt[L] : last;
      last = inc;
      // 前回との中間を取りながら近づける
      next[L] = Math.sqrt(need[L] * inc * targetSeconds(L));
    }
    need = next;
    console.log(`iter ${iter}: 最終Lv ${r.finalLevel} / ${(r.t / 3600).toFixed(0)}h`);
  }
  const k = fitCurve(need);
  console.log('LEVEL_CURVE =', JSON.stringify(k));
  setLevelCurve(k);
  simulate({ log: true });
} else {
  console.log('LEVEL_CURVE =', JSON.stringify(LEVEL_CURVE));
  simulate({ log: true });
}
