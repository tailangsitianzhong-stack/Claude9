import { createEnvironment, createTruck } from './models.js';

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

// 区画：0 は最初の工場（幅 8.8）、左右に幅 5.0 の区画を足していく
export const PLOT = { baseHalf: 4.4, width: 5.0, depth: 16.8 };

export function plotRange(plot) {
  if (plot === 0) return [-PLOT.baseHalf, PLOT.baseHalf];
  const k = Math.abs(plot);
  const a = PLOT.baseHalf + PLOT.width * (k - 1);
  const b = a + PLOT.width;
  return plot > 0 ? [a, b] : [-b, -a];
}

export function laneX(plot) {
  const [a, b] = plotRange(plot);
  return (a + b) / 2;
}

export function landBounds(plots) {
  const ranges = [...plots].sort((a, b) => a - b).map(plotRange);
  return { minX: ranges[0][0], maxX: ranges[ranges.length - 1][1], edges: ranges };
}

export function buildFactory(scene) {
  scene.add(createEnvironment());
  const truck = createTruck();
  truck.position.set(0, 0, LAYOUT.truckZ);
  scene.add(truck);
  return { truck };
}
