import * as THREE from 'three';
import { CONFIG, STRAW_COLORS } from '../config.js';
import { setLamp } from '../scene/models.js';
import { LAYOUT } from '../scene/factory.js';

// 生産ライン： 押出機 → 冷却槽 → カッター → ベルトA → 結束機 → ベルトB → 倉庫
// 見た目の移動とシミュレーションが一致する（ストローが実際に流れて束になる）。

const STRAW_LEN = 0.9;
const strawGeo = new THREE.CylinderGeometry(0.028, 0.028, STRAW_LEN, 8).rotateZ(Math.PI / 2);
const bandGeo = new THREE.TorusGeometry(0.078, 0.014, 6, 14).rotateY(Math.PI / 2);
const bandMat = new THREE.MeshStandardMaterial({ color: 0xf6c445, roughness: 0.6 });
const strawMats = STRAW_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45 }));

// 束の断面配置
const CLUSTER = {
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => [a * 0.031, b * 0.031]),
  5: [[0, 0], ...[0, 1, 2, 3].map((i) => [Math.cos((i * Math.PI) / 2 + Math.PI / 4) * 0.058, Math.sin((i * Math.PI) / 2 + Math.PI / 4) * 0.058])],
};

// 倉庫の山（インスタンス描画で軽く）
const PILE_MAX = 60;
const pileGeo = new THREE.CylinderGeometry(0.085, 0.085, STRAW_LEN, 10).rotateZ(Math.PI / 2);
const pileMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });

export class ProductionLine {
  constructor(scene, state, machines) {
    this.scene = scene;
    this.state = state;
    this.m = machines;

    this.pool = [];
    this.straws = []; // ベルトA上のストロー
    this.bundles = []; // ベルトB上の束
    this.groups = []; // カット済み（または途中）の束グループ { size, c, cut }
    this.current = null;
    this.arrived = 0; // 結束機に入ったストロー本数
    this.cutAcc = 0;
    this.bladeT = 1;
    this.bind = null;
    this.colorCursor = Math.floor(Math.random() * STRAW_COLORS.length);
    this.status = { extruder: 'idle', cutter: 'idle', bundler: 'idle' };
    this.blockedReason = null;

    const len = LAYOUT.cutterZ - LAYOUT.extruderOutZ;
    this.tubeMat = new THREE.MeshStandardMaterial({ color: STRAW_COLORS[this.colorCursor], roughness: 0.4 });
    this.tube = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, len, 8).rotateX(Math.PI / 2), this.tubeMat);
    this.tube.position.set(0, LAYOUT.tubeY, (LAYOUT.cutterZ + LAYOUT.extruderOutZ) / 2);
    this.tube.castShadow = true;
    scene.add(this.tube);

    this.pile = new THREE.InstancedMesh(pileGeo, pileMat, PILE_MAX);
    this.pile.castShadow = true;
    this.pile.receiveShadow = true;
    const white = new THREE.Color(0xffffff);
    for (let i = 0; i < PILE_MAX; i++) this.pile.setColorAt(i, white);
    this.pile.count = 0;
    scene.add(this.pile);
    this._tmp = new THREE.Object3D();
    this._col = new THREE.Color();
    state.on('stock', () => this.refreshPile());
    this.refreshPile();
  }

  get beltSpeed() {
    return (CONFIG.beltSpeed * CONFIG.baseBundleInterval) / this.state.bundleInterval;
  }

  // ---- ストローの生成・回収 ----
  takeStraw(c) {
    const s = this.pool.pop() ?? new THREE.Mesh(strawGeo, strawMats[0]);
    s.material = strawMats[c];
    s.castShadow = true;
    s.visible = true;
    if (!s.parent) this.scene.add(s);
    return s;
  }
  release(s) {
    s.visible = false;
    this.pool.push(s);
  }

  cut(extraTime) {
    if (!this.current || this.current.cut >= this.current.size) {
      const size = CONFIG.bundleSizeMin + Math.floor(Math.random() * (CONFIG.bundleSizeMax - CONFIG.bundleSizeMin + 1));
      this.colorCursor = (this.colorCursor + 1) % STRAW_COLORS.length;
      this.current = { size, c: this.colorCursor, cut: 0 };
      this.groups.push(this.current);
      this.tubeMat.color.setHex(STRAW_COLORS[this.current.c]);
      this.m.extruder.userData.pelletMat.color.setHex(STRAW_COLORS[this.current.c]);
    }
    this.current.cut++;
    const s = this.takeStraw(this.current.c);
    s.position.set(0, LAYOUT.strawY, LAYOUT.cutterOutZ + this.beltSpeed * extraTime);
    this.straws.push(s);
    this.bladeT = 0;
  }

  makeBundleMesh(group) {
    const g = new THREE.Group();
    const offs = CLUSTER[group.size] ?? CLUSTER[5];
    for (const [y, z] of offs) {
      const s = new THREE.Mesh(strawGeo, strawMats[group.c]);
      s.position.set(0, y, z);
      s.castShadow = true;
      g.add(s);
    }
    for (const x of [-0.22, 0.22]) {
      const band = new THREE.Mesh(bandGeo, bandMat);
      band.position.x = x;
      g.add(band);
    }
    return g;
  }

  refreshPile() {
    const n = Math.min(this.state.stock.length, PILE_MAX);
    for (let i = 0; i < n; i++) {
      const layer = Math.floor(i / 12);
      const within = i % 12;
      const col = within % 6;
      const side = Math.floor(within / 6);
      this._tmp.position.set(side ? 0.47 : -0.47, 0.235 + layer * 0.17, LAYOUT.dockZ - 0.66 + col * 0.265);
      this._tmp.updateMatrix();
      this.pile.setMatrixAt(i, this._tmp.matrix);
      this.pile.setColorAt(i, this._col.setHex(STRAW_COLORS[this.state.stock[i].c] ?? 0xffffff));
    }
    this.pile.count = n;
    this.pile.instanceMatrix.needsUpdate = true;
    if (this.pile.instanceColor) this.pile.instanceColor.needsUpdate = true;
  }

  update(dt, time) {
    const interval = this.state.bundleInterval;
    const strawInterval = interval / CONFIG.avgBundleSize;
    const speed = this.beltSpeed;

    // --- カッター（結束機の手前が詰まったら止まる＝バックプレッシャー）---
    const cutterBlocked = this.arrived + this.straws.length >= CONFIG.bundlerBuffer;
    if (!cutterBlocked) {
      this.cutAcc += dt;
      while (this.cutAcc >= strawInterval) {
        this.cutAcc -= strawInterval;
        this.cut(this.cutAcc);
      }
    }

    // --- ベルトA ---
    for (let i = this.straws.length - 1; i >= 0; i--) {
      const s = this.straws[i];
      s.position.z += speed * dt;
      if (s.position.z >= LAYOUT.bundlerInZ) {
        this.release(s);
        this.straws.splice(i, 1);
        this.arrived++;
      }
    }

    // --- 結束機 ---
    const canEmit = this.state.stock.length + this.bundles.length < this.state.dockCapacity;
    let bundlerBlocked = false;
    const head = this.m.bundler.userData.head;
    if (this.bind) {
      this.bind.t += dt;
      const p = Math.min(1, this.bind.t / this.bind.dur);
      head.position.y = 1.4 - 0.32 * Math.sin(Math.PI * p);
      if (p >= 1) {
        const mesh = this.makeBundleMesh(this.bind.group);
        mesh.position.set(0, LAYOUT.strawY + 0.06, LAYOUT.bundlerOutZ);
        this.scene.add(mesh);
        this.bundles.push({ mesh, group: this.bind.group });
        this.bind = null;
      }
    } else {
      head.position.y += (1.4 - head.position.y) * Math.min(1, dt * 10);
      const g = this.groups[0];
      if (g && g.cut >= g.size && this.arrived >= g.size) {
        if (canEmit) {
          this.groups.shift();
          if (this.current === g) this.current = null;
          this.arrived -= g.size;
          this.bind = { group: g, t: 0, dur: Math.min(0.45, interval * 0.3) };
        } else {
          bundlerBlocked = true;
        }
      }
    }

    // --- ベルトB → 倉庫 ---
    for (let i = this.bundles.length - 1; i >= 0; i--) {
      const b = this.bundles[i];
      b.mesh.position.z += speed * dt;
      if (b.mesh.position.z >= LAYOUT.dockInZ) {
        this.scene.remove(b.mesh);
        this.bundles.splice(i, 1);
        this.state.addStock(b.group.size, b.group.c);
      }
    }

    // --- 演出 ---
    this.bladeT = Math.min(1, this.bladeT + dt / Math.min(0.18, strawInterval * 0.8));
    this.m.cutter.userData.blade.position.y = 1.3 - 0.4 * Math.sin(Math.PI * this.bladeT);
    const beltShift = (speed * dt) / 0.5;
    this.m.beltA.userData.texture.offset.y += beltShift;
    this.m.beltB.userData.texture.offset.y += beltShift;
    if (!cutterBlocked) this.m.extruder.position.x = Math.sin(time * 60) * 0.004;

    // --- 状態ランプ ---
    const lineState = cutterBlocked ? 'blocked' : 'running';
    this.status.extruder = lineState;
    this.status.cutter = lineState;
    this.status.bundler = bundlerBlocked ? 'blocked' : this.bind || this.arrived > 0 || this.straws.length ? 'running' : 'idle';
    this.blockedReason = bundlerBlocked ? 'dockFull' : null;
    setLamp(this.m.extruder.userData.lamp, this.status.extruder);
    setLamp(this.m.cutter.userData.lamp, this.status.cutter);
    setLamp(this.m.bundler.userData.lamp, this.status.bundler);
  }
}
