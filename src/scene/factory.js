import {
  createBuilding,
  createExtruder,
  createCoolingBath,
  createCutter,
  createConveyor,
  createBundler,
  createDock,
  createTruck,
} from './models.js';

// 工場内のレイアウト（z が小さいほど画面の上）。ラインは上から下へ流れる。
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
  // 作業員の持ち場（巡回ポイント）
  workerSpots: [
    [[1.5, -6.6], [1.5, -5.0], [1.7, -3.9]],
    [[-1.3, -2.7], [-1.3, -0.6], [-1.4, 0.9]],
    [[1.3, 3.9], [1.6, 5.3], [1.5, 6.9]],
  ],
};

export function buildFactory(scene, companyName) {
  scene.add(createBuilding(companyName));

  const extruder = createExtruder();
  extruder.position.set(0, 0, LAYOUT.extruderZ);
  const bath = createCoolingBath(2.0);
  bath.position.set(0, 0, LAYOUT.bathZ);
  const cutter = createCutter();
  cutter.position.set(0, 0, LAYOUT.cutterZ);

  const lenA = LAYOUT.bundlerInZ - LAYOUT.cutterOutZ;
  const beltA = createConveyor(lenA);
  beltA.position.set(0, 0, (LAYOUT.bundlerInZ + LAYOUT.cutterOutZ) / 2);

  const bundler = createBundler();
  bundler.position.set(0, 0, LAYOUT.bundlerZ);

  const lenB = LAYOUT.dockInZ - LAYOUT.bundlerOutZ;
  const beltB = createConveyor(lenB);
  beltB.position.set(0, 0, (LAYOUT.dockInZ + LAYOUT.bundlerOutZ) / 2);

  const dock = createDock();
  dock.position.set(0, 0, LAYOUT.dockZ);

  const truck = createTruck();
  truck.position.set(0, 0, LAYOUT.truckZ);

  const machines = { extruder, bath, cutter, beltA, bundler, beltB, dock, truck };
  Object.values(machines).forEach((m) => scene.add(m));

  // タップで情報を出せる対象
  const selectable = Object.values(machines);
  return { machines, selectable };
}
