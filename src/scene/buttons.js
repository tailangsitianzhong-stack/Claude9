import * as THREE from 'three';
import { LANE_STEPS } from '../config.js';
import { LAYOUT, PLOT, plotRange, laneX } from './factory.js';

const yen = (n) => '¥' + Math.floor(n).toLocaleString('ja-JP');
const STEP_Z = [LAYOUT.extruderZ, LAYOUT.cutterZ, LAYOUT.bundlerZ];

// 地面に置く「タップして購入」ボタン。看板（常にカメラを向く）＋足元の光る輪。
class GroundButton {
  constructor(action) {
    this.action = action;
    this.group = new THREE.Group();
    this.canvas = document.createElement('canvas');
    this.canvas.width = 320;
    this.canvas.height = 220;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, depthTest: false, transparent: true }));
    this.sprite.scale.set(2.9, 2.0, 1);
    this.sprite.position.y = 1.9;
    this.sprite.renderOrder = 10;
    this.sprite.userData.button = this;
    this.group.add(this.sprite);

    this.ringMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.8, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32).rotateX(-Math.PI / 2), this.ringMat);
    this.ring.position.y = 0.03;
    this.group.add(this.ring);
    this.key = '';
    this.phase = Math.random() * 6;
  }

  draw({ icon, title, price, affordable }) {
    const key = `${icon}|${title}|${price}|${affordable}`;
    if (key === this.key) return;
    this.key = key;
    const c = this.canvas.getContext('2d');
    const W = this.canvas.width;
    const H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    const fill = affordable ? '#1e9e5a' : '#5b6577';
    // 吹き出し
    c.fillStyle = fill;
    c.strokeStyle = '#ffffff';
    c.lineWidth = 8;
    c.beginPath();
    c.roundRect(8, 8, W - 16, H - 52, 28);
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(W / 2 - 22, H - 46);
    c.lineTo(W / 2, H - 12);
    c.lineTo(W / 2 + 22, H - 46);
    c.closePath();
    c.fill();
    c.fillStyle = '#ffffff';
    c.textBaseline = 'middle';
    c.font = '56px sans-serif';
    c.textAlign = 'left';
    c.fillText(icon, 26, 62);
    c.font = 'bold 40px "Hiragino Sans", "Noto Sans JP", sans-serif';
    c.fillText(title, 98, 64, W - 120);
    c.font = '900 48px "Hiragino Sans", "Noto Sans JP", sans-serif';
    c.textAlign = 'center';
    c.fillText(price, W / 2, 128, W - 40);
    this.texture.needsUpdate = true;
    this.ringMat.color.set(affordable ? 0x2ecc71 : 0x8a95a5);
  }

  update(dt) {
    this.phase += dt;
    const s = 1 + Math.sin(this.phase * 3) * 0.08;
    this.ring.scale.set(s, 1, s);
    this.sprite.position.y = 1.9 + Math.sin(this.phase * 2) * 0.06;
  }

  dispose() {
    this.texture.dispose();
    this.sprite.material.dispose();
    this.ring.geometry.dispose();
    this.ringMat.dispose();
  }
}

// 買える土地の輪郭（芝生の上に点線の区画）
function createPlotOutline(plot) {
  const [a, b] = plotRange(plot);
  const g = new THREE.Group();
  const w = b - a;
  const d = PLOT.depth;
  const cx = (a + b) / 2;
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 0.2, d - 0.2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false }),
  );
  fill.position.set(cx, -0.08, 0);
  g.add(fill);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const dash = 0.6;
  for (let z = -d / 2; z < d / 2; z += dash * 2) {
    for (const x of [a + 0.1, b - 0.1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, dash), dashMat);
      m.position.set(x, -0.07, z + dash / 2);
      g.add(m);
    }
  }
  for (let x = a; x < b - 0.1; x += dash * 2) {
    for (const z of [-d / 2 + 0.1, d / 2 - 0.1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(Math.min(dash, b - x), 0.02, 0.08), dashMat);
      m.position.set(x + dash / 2, -0.07, z);
      g.add(m);
    }
  }
  return g;
}

// 状態に合わせてボタンを並べ直す
export class BuildButtons {
  constructor(scene, state) {
    this.scene = scene;
    this.state = state;
    this.buttons = [];
    this.outlines = [];
    this.sync();
    state.on('land', () => this.sync());
    state.on('lanes', () => this.sync());
  }

  clear() {
    for (const b of this.buttons) {
      this.scene.remove(b.group);
      b.dispose();
    }
    for (const o of this.outlines) {
      this.scene.remove(o);
      o.traverse((m) => m.geometry?.dispose());
    }
    this.buttons = [];
    this.outlines = [];
  }

  sync() {
    this.clear();
    const s = this.state;
    // 土地：所有地のすぐ外側（手前寄り）に置く
    for (const plot of s.buyablePlots()) {
      const [a, b] = plotRange(plot);
      const outline = createPlotOutline(plot);
      this.scene.add(outline);
      this.outlines.push(outline);
      const btn = new GroundButton({ type: 'land', plot });
      const x = plot > 0 ? a + 1.6 : b - 1.6;
      btn.group.position.set(x, 0, 1.5);
      this.add(btn);
    }
    // 機械：所有地で、次に置く機械の場所に置く
    for (const plot of s.land) {
      const step = s.laneStage(plot);
      if (step >= LANE_STEPS.length) continue;
      const btn = new GroundButton({ type: 'lane', plot });
      btn.group.position.set(laneX(plot), 0, STEP_Z[step]);
      this.add(btn);
    }
    this.refresh();
  }

  add(btn) {
    this.scene.add(btn.group);
    this.buttons.push(btn);
  }

  // お金の増減に合わせて色と値段を描き直す（変化があったときだけ）
  refresh() {
    const s = this.state;
    for (const b of this.buttons) {
      const { type, plot } = b.action;
      if (type === 'land') {
        const cost = s.landCost();
        b.draw({ icon: '🚧', title: '土地を買う', price: yen(cost), affordable: s.money >= cost });
      } else {
        const step = s.nextLaneStep(plot);
        const cost = s.laneStepCost(plot);
        b.draw({ icon: step.icon, title: `${step.name}を置く`, price: yen(cost), affordable: s.money >= cost });
      }
    }
  }

  get pickables() {
    return this.buttons.map((b) => b.sprite);
  }

  update(dt) {
    for (const b of this.buttons) b.update(dt);
  }
}
