import * as THREE from 'three';
import { COMPANY_NAME, STRAW_COLORS, LOTS } from '../config.js';
import { createShell, disposeTree } from '../scene/models.js';
import { LAYOUT, ownedBounds, sectionCenter } from '../scene/factory.js';
import { Lane } from './lane.js';

// 倉庫の山（パレットごとにインスタンス描画）
const PILE_MAX = 60;
const pileGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.9, 10).rotateZ(Math.PI / 2);
const pileMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });

// 会社全体の工場：土地ごとの建屋（持っている区画に合わせて伸びる）＋区画ごとのライン＋出荷パレットの在庫表示
export class Plant {
  constructor(scene, state) {
    this.scene = scene;
    this.state = state;
    this.lanes = new Map(); // key → Lane
    this.piles = new Map(); // key → InstancedMesh
    this.shells = new Map(); // lotId → Group
    this._tmp = new THREE.Object3D();
    this._col = new THREE.Color();

    for (const lot of state.ownedLots()) this.rebuildShell(lot);
    this.syncLanes(false);
    state.on('land', (lotId) => {
      this.rebuildShell(LOTS.find((l) => l.id === lotId));
      this.syncLanes(true);
    });
    state.on('lanes', () => this.syncLanes(true));
    state.on('stock', () => this.refreshPiles());
  }

  // 土地の中で持っている範囲（カメラ用）
  boundsOf(lot) {
    const b = ownedBounds(lot, this.state.ownedIndices(lot.id));
    return { ...b, minZ: lot.z - 8.6, maxZ: lot.z + 10.9 };
  }

  rebuildShell(lot) {
    const old = this.shells.get(lot.id);
    if (old) {
      this.scene.remove(old);
      disposeTree(old);
    }
    const indices = this.state.ownedIndices(lot.id);
    if (!indices.length) return;
    const { minX, maxX, edges } = ownedBounds(lot, indices);
    // ゲート：本社は中央（トラックの位置）、ほかは最初に買った区画の前
    const gateX = lot.home ? 0 : sectionCenter(lot, Math.min(...indices)).x;
    const sign = lot.home ? COMPANY_NAME : `${lot.short}工場`;
    const shell = createShell(sign, minX, maxX, edges, gateX);
    shell.position.z = lot.z;
    this.scene.add(shell);
    this.shells.set(lot.id, shell);
  }

  syncLanes(animate) {
    let changed = false;
    for (const key of this.state.owned) {
      let lane = this.lanes.get(key);
      if (!lane) {
        lane = new Lane(this.scene, this.state, this, key);
        this.lanes.set(key, lane);
      }
      const wasActive = lane.active;
      lane.setStage(this.state.laneStage(key), animate);
      if (lane.active && !this.piles.has(key)) this.addPile(key, lane);
      if (lane.active !== wasActive) changed = true;
    }
    if (changed) this.refreshPiles();
  }

  addPile(key, lane) {
    const pile = new THREE.InstancedMesh(pileGeo, pileMat, PILE_MAX);
    pile.castShadow = true;
    pile.receiveShadow = true;
    const white = new THREE.Color(0xffffff);
    for (let i = 0; i < PILE_MAX; i++) pile.setColorAt(i, white);
    pile.count = 0;
    pile.userData.x = lane.x;
    pile.userData.z = lane.z0 + LAYOUT.dockZ;
    this.scene.add(pile);
    this.piles.set(key, pile);
  }

  get activeLanes() {
    return [...this.lanes.values()].filter((l) => l.active);
  }

  // ベルト上を移動中の束（倉庫の空きを計算するため）
  inTransit() {
    let n = 0;
    for (const l of this.lanes.values()) n += l.bundles.length + (l.bind ? 1 : 0);
    return n;
  }

  // 在庫は会社全体で1つ。見た目は稼働中のパレットに順番に振り分ける
  refreshPiles() {
    const keys = this.activeLanes.map((l) => l.key);
    const n = keys.length;
    const counts = new Map(keys.map((k) => [k, 0]));
    const stock = this.state.stock;
    for (let i = 0; i < stock.length && n; i++) {
      const key = keys[i % n];
      const pile = this.piles.get(key);
      const slot = counts.get(key);
      if (!pile || slot >= PILE_MAX) continue;
      const layer = Math.floor(slot / 12);
      const within = slot % 12;
      const col = within % 6;
      const side = Math.floor(within / 6);
      this._tmp.position.set(pile.userData.x + (side ? 0.47 : -0.47), 0.235 + layer * 0.17, pile.userData.z - 0.66 + col * 0.265);
      this._tmp.updateMatrix();
      pile.setMatrixAt(slot, this._tmp.matrix);
      pile.setColorAt(slot, this._col.setHex(STRAW_COLORS[stock[i].c] ?? 0xffffff));
      counts.set(key, slot + 1);
    }
    for (const [key, pile] of this.piles) {
      pile.count = counts.get(key) ?? 0;
      pile.instanceMatrix.needsUpdate = true;
      if (pile.instanceColor) pile.instanceColor.needsUpdate = true;
    }
  }

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
