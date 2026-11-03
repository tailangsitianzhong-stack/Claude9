import * as THREE from 'three';
import { GameState } from './state.js';
import { createStage } from './scene/setup.js';
import { buildFactory, lotById, lotBox } from './scene/factory.js';
import { createTown, TOWN } from './scene/town.js';
import { BuildButtons } from './scene/buttons.js';
import { Plant } from './sim/plant.js';
import { Truck } from './sim/truck.js';
import { Workers } from './sim/workers.js';
import { Hud } from './ui/hud.js';

import { formatYen as yen } from './economy.js';

const state = GameState.load();
const stage = createStage(document.getElementById('app'), TOWN.bounds);
const town = createTown(stage.scene);
const { truck: truckMesh } = buildFactory(stage.scene);

const plant = new Plant(stage.scene, state);
const truck = new Truck(state, truckMesh);
const workers = new Workers(stage.scene, state);
const buttons = new BuildButtons(stage.scene, state);

// ---- カメラの移動先 ----
function lotView(lotId) {
  const lot = lotById(lotId);
  // まだ持っていない空き地は土地全体を見せる
  const b = state.ownedIndices(lotId).length ? plant.boundsOf(lot) : { ...lotBox(lot), minZ: lot.z - 8.6, maxZ: lot.z + 10.9 };
  // 隣に買える区画があれば少し見えるように広げる
  return { minX: b.minX - 0.85, maxX: b.maxX + 0.85, minZ: b.minZ, maxZ: b.maxZ };
}
const townView = () => ({ minX: -70, maxX: 105, minZ: -50, maxZ: 40 });

const game = {
  state,
  plant,
  truck,
  workers,
  buttons,
  stage,
  focusLot: (lotId) => stage.focus(lotView(lotId)),
  focusTown: () => stage.focus(townView()),
  buySection: (lotId, index) => buyLand(state.buySection(lotId, index), lotId),
  buyAll: (lotId) => buyLand(state.buyAllSections(lotId), lotId),
};
const hud = new Hud(document.getElementById('hud'), game);

function buyLand(r, lotId) {
  const lot = lotById(lotId);
  if (r.ok) {
    hud.hideSheet();
    hud.toast(`<b>${lot.short}の土地を${r.count}区画購入</b>（${yen(r.cost)}）`);
    stage.focus(lotView(lotId));
  } else if (r.reason === 'money') {
    hud.toast(`お金が足りません（あと${yen(r.short)}）`);
  }
  hud.update();
}

// ---- HUD に隠れない範囲にカメラを合わせる（最初は本社）----
function fitToHud() {
  const top = document.querySelector('#hud .chips').getBoundingClientRect().bottom;
  const bottom = window.innerHeight - document.querySelector('#hud .nav').getBoundingClientRect().top;
  stage.setSafeArea(top, bottom);
}
stage.focus(lotView('home'), false);
fitToHud();
window.addEventListener('resize', fitToHud);

// ---- 地面のボタン ----
function onButton(action) {
  if (action.type === 'lot') {
    hud.showLotSheet(action.lotId, action.index);
  } else if (action.type === 'lane') {
    const r = state.buildLaneStep(action.key);
    if (r.ok) {
      hud.toast(r.completed ? `<b>新しいラインが稼働！</b> ${r.step.name}を設置しました` : `<b>${r.step.name}を設置</b>（${yen(r.cost)}）`);
    } else if (r.reason === 'money') hud.toast(`お金が足りません（あと${yen(r.short)}）`);
  }
  hud.update();
}

// ---- タップ判定（ボタン → 機械・作業員の順）----
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let down = null;
const canvas = stage.renderer.domElement;
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, t: performance.now() };
});
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const quick = performance.now() - down.t < 400;
  down = null;
  if (moved > 8 || !quick) return;
  const rect = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, stage.camera);

  const btnHit = raycaster.intersectObjects(buttons.pickables, false)[0];
  if (btnHit) {
    hud.hideInfo();
    onButton(btnHit.object.userData.button.action);
    return;
  }
  const pickables = [...plant.pickables(), truckMesh, ...workers.meshes];
  const hit = raycaster.intersectObjects(pickables, true)[0];
  let obj = hit?.object;
  while (obj && !obj.userData.info) obj = obj.parent;
  hud.hideSheet();
  hud.showInfo(obj ?? null);
});

// ---- セーブ ----
const save = () => state.save({ cargo: truck.cargo ?? [] });
setInterval(save, 5000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save();
});
window.addEventListener('pagehide', save);

// デバッグ用（コンソールから game.state.money += 10000 など）
window.game = game;
window.resetGame = () => {
  GameState.reset();
  window.removeEventListener('pagehide', save);
  location.reload();
};

// ---- メインループ ----
// 固定ステップで進める（低フレームレートでもゲーム内時間が遅れない）
const STEP = 1 / 30;
const MAX_CATCHUP = 1.0;
const clock = new THREE.Clock();
let time = 0;
let acc = 0;
let hudTimer = 0;
function step(dt) {
  time += dt;
  state.decaySales(dt);
  plant.update(dt, time);
  truck.update(dt);
  workers.update(dt);
  buttons.update(dt);
  town.update(dt);
}
game.step = step;
stage.renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  acc = Math.min(acc + dt, MAX_CATCHUP);
  while (acc >= STEP) {
    step(STEP);
    acc -= STEP;
  }
  stage.tick(dt);
  hudTimer += dt;
  if (hudTimer > 0.2) {
    hudTimer = 0;
    hud.update();
    buttons.refresh();
  }
  stage.renderer.render(stage.scene, stage.camera);
});
