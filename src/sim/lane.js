import * as THREE from 'three';
import { CONFIG } from '../config.js';
import {
  setLamp,
  createExtruder,
  createCoolingBath,
  createCutter,
  createConveyor,
  createBundler,
  createDock,
} from '../scene/models.js';
import { LAYOUT, lotById, laneCenter } from '../scene/factory.js';

// 1区画ぶんの生産ライン： 押出機 → 冷却槽 → カッター → ベルトA → 結束機 → ベルトB → パレット
// 機械は段階的に設置され、3段階（押出機・カッター・結束機）そろうと稼働する。
// 見た目の移動とシミュレーションが一致する（ストローが実際に流れて束になる）。

const STRAW_LEN = 0.9;
const strawGeo = new THREE.CylinderGeometry(0.028, 0.028, STRAW_LEN, 8).rotateZ(Math.PI / 2);
const bandGeo = new THREE.TorusGeometry(0.078, 0.014, 6, 14).rotateY(Math.PI / 2);
const bandMat = new THREE.MeshStandardMaterial({ color: 0xf6c445, roughness: 0.6 });
// 色ごとのマテリアルを使い回す（製品ごとに色が違う）
const strawMats = new Map();
const strawMat = (hex) => {
  if (!strawMats.has(hex)) strawMats.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.45 }));
  return strawMats.get(hex);
};

// 束の断面配置
const CLUSTER = {
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => [a * 0.031, b * 0.031]),
  5: [[0, 0], ...[0, 1, 2, 3].map((i) => [Math.cos((i * Math.PI) / 2 + Math.PI / 4) * 0.058, Math.sin((i * Math.PI) / 2 + Math.PI / 4) * 0.058])],
};

const POP_TIME = 0.45;

export class Lane {
  constructor(scene, state, plant, key) {
    this.scene = scene;
    this.state = state;
    this.plant = plant;
    this.key = key;
    this.lot = lotById(key.split(':')[0]);
    const c = laneCenter(key);
    this.x = c.x;
    this.z0 = c.z;
    // この区画用にずらしたレイアウト（z の値だけ区画の中心からの位置にする）
    this.L = Object.fromEntries(Object.entries(LAYOUT).map(([k, v]) => [k, k.endsWith('Z') ? v + c.z : v]));
    this.stage = 0;
    this.m = {};
    this.pops = []; // 設置アニメーション

    this.pool = [];
    this.straws = []; // ベルトA上のストロー
    this.bundles = []; // ベルトB上の束
    this.groups = []; // カット済み（または途中）の束グループ { size, c, cut }
    this.current = null;
    this.arrived = 0; // 結束機に入ったストロー本数
    this.cutAcc = 0;
    this.bladeT = 1;
    this.bind = null;
    this.colorCursor = 0;
    this.status = { extruder: 'idle', cutter: 'idle', bundler: 'idle' };
    this.blockedReason = null;

    this.tubeMat = new THREE.MeshStandardMaterial({ color: this.product.colors[0], roughness: 0.4 });
  }

  get product() {
    return this.state.productOf(this.key);
  }

  get active() {
    return this.stage >= 3;
  }

  get machines() {
    return Object.values(this.m);
  }

  // 置いた機械の数まで建てる（ロード時は一気に、購入時は1段階ずつ）
  setStage(stage, animate = false) {
    while (this.stage < stage) {
      this.stage++;
      this.buildStep(this.stage, animate);
    }
  }

  place(key, obj, z, animate) {
    obj.position.set(this.x, 0, z);
    obj.userData.lane = this;
    this.scene.add(obj);
    this.m[key] = obj;
    if (animate) {
      obj.scale.setScalar(0.01);
      this.pops.push({ obj, t: 0 });
    }
  }

  buildStep(step, animate) {
    if (step === 1) {
      this.place('extruder', createExtruder(), this.L.extruderZ, animate);
      this.place('bath', createCoolingBath(2.0), this.L.bathZ, animate);
      this.m.extruder.userData.pelletMat.color.setHex(this.product.colors[0]);
    } else if (step === 2) {
      this.place('cutter', createCutter(), this.L.cutterZ, animate);
      const lenA = this.L.bundlerInZ - this.L.cutterOutZ;
      this.place('beltA', createConveyor(lenA), (this.L.bundlerInZ + this.L.cutterOutZ) / 2, animate);
      const len = this.L.cutterZ - this.L.extruderOutZ;
      this.tube = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, len, 8).rotateX(Math.PI / 2), this.tubeMat);
      this.tube.position.set(this.x, this.L.tubeY, (this.L.cutterZ + this.L.extruderOutZ) / 2);
      this.tube.castShadow = true;
      this.scene.add(this.tube);
    } else if (step === 3) {
      this.place('bundler', createBundler(), this.L.bundlerZ, animate);
      const lenB = this.L.dockInZ - this.L.bundlerOutZ;
      this.place('beltB', createConveyor(lenB), (this.L.dockInZ + this.L.bundlerOutZ) / 2, animate);
      this.place('dock', createDock(), this.L.dockZ, animate);
    }
  }

  get beltSpeed() {
    return (CONFIG.beltSpeed * CONFIG.baseBundleInterval) / this.state.bundleInterval;
  }

  // ---- ストローの生成・回収 ----
  takeStraw(c) {
    const s = this.pool.pop() ?? new THREE.Mesh(strawGeo, strawMat(c));
    s.material = strawMat(c);
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
      // 製品の色を1束ごとに順番に使う。製品はこの束を切り始めた時点のもの
      const product = this.product;
      this.colorCursor = (this.colorCursor + 1) % product.colors.length;
      this.current = { size, c: product.colors[this.colorCursor], p: product.id, cut: 0 };
      this.groups.push(this.current);
      this.tubeMat.color.setHex(this.current.c);
      this.m.extruder.userData.pelletMat.color.setHex(this.current.c);
    }
    this.current.cut++;
    const s = this.takeStraw(this.current.c);
    s.position.set(this.x, this.L.strawY, this.L.cutterOutZ + this.beltSpeed * extraTime);
    this.straws.push(s);
    this.bladeT = 0;
  }

  makeBundleMesh(group) {
    const g = new THREE.Group();
    const offs = CLUSTER[group.size] ?? CLUSTER[5];
    for (const [y, z] of offs) {
      const s = new THREE.Mesh(strawGeo, strawMat(group.c));
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

  update(dt, time) {
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t += dt;
      const k = Math.min(1, p.t / POP_TIME);
      // easeOutBack：少し行き過ぎて戻る（ポンと置かれる感じ）
      const c1 = 1.70158;
      p.obj.scale.setScalar(Math.max(0.01, 1 + (c1 + 1) * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2)));
      if (k >= 1) {
        p.obj.scale.setScalar(1);
        this.pops.splice(i, 1);
      }
    }
    if (!this.active) {
      for (const key of ['extruder', 'cutter', 'bundler']) if (this.m[key]) setLamp(this.m[key].userData.lamp, 'idle');
      return;
    }
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
      if (s.position.z >= this.L.bundlerInZ) {
        this.release(s);
        this.straws.splice(i, 1);
        this.arrived++;
      }
    }

    // --- 結束機 ---
    const canEmit = this.state.stock.length + this.plant.inTransit() < this.state.dockCapacity;
    let bundlerBlocked = false;
    const head = this.m.bundler.userData.head;
    if (this.bind) {
      this.bind.t += dt;
      const p = Math.min(1, this.bind.t / this.bind.dur);
      head.position.y = 1.4 - 0.32 * Math.sin(Math.PI * p);
      if (p >= 1) {
        const mesh = this.makeBundleMesh(this.bind.group);
        mesh.position.set(this.x, this.L.strawY + 0.06, this.L.bundlerOutZ);
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
      if (b.mesh.position.z >= this.L.dockInZ) {
        this.scene.remove(b.mesh);
        this.bundles.splice(i, 1);
        this.state.addStock(b.group.size, b.group.c, b.group.p);
      }
    }

    // --- 演出 ---
    this.bladeT = Math.min(1, this.bladeT + dt / Math.min(0.18, strawInterval * 0.8));
    this.m.cutter.userData.blade.position.y = 1.3 - 0.4 * Math.sin(Math.PI * this.bladeT);
    const beltShift = (speed * dt) / 0.5;
    this.m.beltA.userData.texture.offset.y += beltShift;
    this.m.beltB.userData.texture.offset.y += beltShift;
    if (!cutterBlocked) this.m.extruder.position.x = this.x + Math.sin(time * 60) * 0.004;

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
