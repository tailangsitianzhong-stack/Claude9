import * as THREE from 'three';
import { COMPANY_NAME } from './config.js';
import { GameState } from './state.js';
import { createStage } from './scene/setup.js';
import { buildFactory } from './scene/factory.js';
import { ProductionLine } from './sim/production.js';
import { Truck } from './sim/truck.js';
import { Workers } from './sim/workers.js';
import { Hud } from './ui/hud.js';

const state = GameState.load();
const stage = createStage(document.getElementById('app'));
const { machines, selectable } = buildFactory(stage.scene, COMPANY_NAME);

const production = new ProductionLine(stage.scene, state, machines);
const truck = new Truck(state, machines.truck);
const workers = new Workers(stage.scene, state);

const game = { state, production, truck, workers, stage };
const hud = new Hud(document.getElementById('hud'), game);

// ---- HUD に隠れない範囲にカメラを合わせる ----
function fitToHud() {
  const top = document.querySelector('#hud .chips').getBoundingClientRect().bottom;
  const bottom = window.innerHeight - document.querySelector('#hud .panel').getBoundingClientRect().top;
  stage.setSafeArea(top, bottom);
}
fitToHud();
window.addEventListener('resize', fitToHud);

// ---- タップで機械の情報 ----
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const pickables = [...selectable, ...workers.meshes];
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
  const hit = raycaster.intersectObjects(pickables, true)[0];
  let obj = hit?.object;
  while (obj && !obj.userData.info) obj = obj.parent;
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
const MAX_CATCHUP = 1.0; // これ以上の遅れ（タブ非表示など）は切り捨て
const clock = new THREE.Clock();
let time = 0;
let acc = 0;
let hudTimer = 0;
function step(dt) {
  time += dt;
  production.update(dt, time);
  truck.update(dt);
  workers.update(dt);
}
game.step = step;
stage.renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  acc = Math.min(acc + dt, MAX_CATCHUP);
  while (acc >= STEP) {
    step(STEP);
    acc -= STEP;
  }
  stage.controls.update();
  stage.clampTarget();
  hudTimer += dt;
  if (hudTimer > 0.2) {
    hudTimer = 0;
    hud.update();
  }
  stage.renderer.render(stage.scene, stage.camera);
});
