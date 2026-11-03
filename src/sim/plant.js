import * as THREE from 'three';
import { COMPANY_NAME, STRAW_COLORS } from '../config.js';
import { createShell, disposeTree } from '../scene/models.js';
import { LAYOUT, landBounds } from '../scene/factory.js';
import { Lane } from './lane.js';

// 倉庫の山（パレットごとにインスタンス描画）
const PILE_MAX = 60;
const pileGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.9, 10).rotateZ(Math.PI / 2);
const pileMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });

// 工場全体：建屋（所有地に合わせて伸びる）＋区画ごとのライン＋出荷パレットの在庫表示
export class Plant {
  constructor(scene, state) {
    this.scene = scene;
    this.state = state;
    this.lanes = new Map();
    this.piles = new Map();
    this.shell = null;
    this._tmp = new THREE.Object3D();
    this._col = new THREE.Color();

    this.rebuildShell();
    this.syncLanes(false);
    state.on('land', () => {
      this.rebuildShell();
      this.syncLanes(true);
    });
    state.on('lanes', () => this.syncLanes(true));
    state.on('stock', () => this.refreshPiles());
  }

  get bounds() {
    return landBounds(this.state.land);
  }

  rebuildShell() {
    if (this.shell) {
      this.scene.remove(this.shell);
      disposeTree(this.shell);
    }
    const { minX, maxX, edges } = this.bounds;
    this.shell = createShell(COMPANY_NAME, minX, maxX, edges);
    this.scene.add(this.shell);
  }

  syncLanes(animate) {
    for (const plot of this.state.land) {
      let lane = this.lanes.get(plot);
      if (!lane) {
        lane = new Lane(this.scene, this.state, this, plot);
        this.lanes.set(plot, lane);
      }
      const wasActive = lane.active;
      lane.setStage(this.state.laneStage(plot), animate);
      if (lane.active && !this.piles.has(plot)) this.addPile(plot, lane.x);
      if (lane.active !== wasActive) this.refreshPiles();
    }
  }

  addPile(plot, x) {
    const pile = new THREE.InstancedMesh(pileGeo, pileMat, PILE_MAX);
    pile.castShadow = true;
    pile.receiveShadow = true;
    const white = new THREE.Color(0xffffff);
    for (let i = 0; i < PILE_MAX; i++) pile.setColorAt(i, white);
    pile.count = 0;
    pile.userData.x = x;
    this.scene.add(pile);
    this.piles.set(plot, pile);
  }

  get activeLanes() {
    return [...this.lanes.values()].filter((l) => l.active).sort((a, b) => a.plot - b.plot);
  }

  // ベルト上を移動中の束（倉庫の空きを計算するため）
  inTransit() {
    let n = 0;
    for (const l of this.lanes.values()) n += l.bundles.length + (l.bind ? 1 : 0);
    return n;
  }

  // 在庫は全体で1つ。見た目は稼働中のパレットに順番に振り分ける
  refreshPiles() {
    const plots = this.activeLanes.map((l) => l.plot);
    const n = plots.length;
    const counts = new Map(plots.map((p) => [p, 0]));
    const stock = this.state.stock;
    for (let i = 0; i < stock.length; i++) {
      const plot = plots[i % n];
      const pile = this.piles.get(plot);
      const slot = counts.get(plot);
      if (!pile || slot >= PILE_MAX) continue;
      const layer = Math.floor(slot / 12);
      const within = slot % 12;
      const col = within % 6;
      const side = Math.floor(within / 6);
      this._tmp.position.set(pile.userData.x + (side ? 0.47 : -0.47), 0.235 + layer * 0.17, LAYOUT.dockZ - 0.66 + col * 0.265);
      this._tmp.updateMatrix();
      pile.setMatrixAt(slot, this._tmp.matrix);
      pile.setColorAt(slot, this._col.setHex(STRAW_COLORS[stock[i].c] ?? 0xffffff));
      counts.set(plot, slot + 1);
    }
    for (const [plot, pile] of this.piles) {
      pile.count = counts.get(plot) ?? 0;
      pile.instanceMatrix.needsUpdate = true;
      if (pile.instanceColor) pile.instanceColor.needsUpdate = true;
    }
  }

  // 稼働状態のまとめ（HUD 用）
  get blockedReason() {
    return this.activeLanes.some((l) => l.blockedReason === 'dockFull') ? 'dockFull' : null;
  }

  pickables() {
    return [...this.lanes.values()].flatMap((l) => l.machines);
  }

  update(dt, time) {
    for (const l of this.lanes.values()) l.update(dt, time);
  }
}
