import { createTruck } from './models.js';
import { LOTS, LAND } from '../config.js';

// 工場内のレイアウト（z が小さいほど画面の上）。ラインは上から下へ流れる。
// x は区画ごとのライン中心からの相対位置ではなく、z と高さだけを共通で持つ。
export const LAYOUT = {
  extruderZ: -6.0,
  extruderOutZ: -4.82,
  tubeY: 0.85,
  bathZ: -3.6,
  cutterZ: -1.9,
  cutterOutZ: -1.45,
  bundlerZ: 2.4,
  bundlerInZ: 1.75,
  bundlerOutZ: 3.05,
  dockInZ: 5.75,
  dockZ: 6.8,
  truckZ: 9.7,
  strawY: 0.74,
  // 作業員の持ち場（中央ラインの巡回ポイント）
  workerSpots: [
    [[1.5, -6.6], [1.5, -5.0], [1.7, -3.9]],
    [[-1.3, -2.7], [-1.3, -0.6], [-1.4, 0.9]],
    [[1.3, 3.9], [1.6, 5.3], [1.5, 6.9]],
  ],
};

// 本社の区画：中央(2番)は幅 8.8、左右に幅 5.0 の区画が2つずつ
export const PLOT = { baseHalf: 4.4, width: LAND.sectionWidth, depth: LAND.depth };

function homePlotRange(plot) {
  if (plot === 0) return [-PLOT.baseHalf, PLOT.baseHalf];
  const k = Math.abs(plot);
  const a = PLOT.baseHalf + PLOT.width * (k - 1);
  const b = a + PLOT.width;
  return plot > 0 ? [a, b] : [-b, -a];
}

export const lotById = (id) => LOTS.find((l) => l.id === id);
export const sectionKey = (lotId, i) => `${lotId}:${i}`;
export function parseKey(key) {
  const [lotId, i] = key.split(':');
  return { lotId, index: Number(i) };
}

// 区画の x 範囲 [左, 右]
export function sectionRange(lot, i) {
  if (lot.home) return homePlotRange(i - 2);
  return [lot.x + i * PLOT.width, lot.x + (i + 1) * PLOT.width];
}
export function sectionCount(lot) {
  return lot.home ? 5 : lot.sections;
}
export function sectionCenter(lot, i) {
  const [a, b] = sectionRange(lot, i);
  return { x: (a + b) / 2, z: lot.z };
}

// 持っている区画の範囲（建屋の大きさ）
export function ownedBounds(lot, indices) {
  const ranges = [...indices].sort((a, b) => a - b).map((i) => sectionRange(lot, i));
  return { minX: ranges[0][0], maxX: ranges[ranges.length - 1][1], edges: ranges };
}

export function lotBox(lot) {
  const n = sectionCount(lot);
  const [a] = sectionRange(lot, 0);
  const [, b] = sectionRange(lot, n - 1);
  return { minX: a, maxX: b, minZ: lot.z - PLOT.depth / 2, maxZ: lot.z + PLOT.depth / 2 };
}

export function buildFactory(scene) {
  const truck = createTruck();
  truck.position.set(0, 0, LAYOUT.truckZ);
  scene.add(truck);
  return { truck };
}
