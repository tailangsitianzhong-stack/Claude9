import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LOTS } from '../config.js';
import { lotBox } from './factory.js';

// 舞台：栃木県鹿沼市をモチーフにした町（実際の地図の再現ではなく、特徴を取り入れた架空の配置）
//  - 例幣使街道（杉並木の通り）  - 黒川  - JR日光線と鹿沼駅  - 東北自動車道と鹿沼IC
//  - 瓦屋根の家と大谷石の塀、庭のさつき（市の花）  - 西の山（前日光）と東の田んぼ
// 1単位 ≒ 2m。北が画面の奥（-z）。

// ---------- 道・川・線路の配置 ----------
export const TOWN = {
  bounds: { minX: -112, maxX: 150, minZ: -80, maxZ: 70 },
  roadsEW: [
    { z: 9.7, x0: -112, x1: 160, name: '工場前の市道' },
    { z: -14, x0: -112, x1: 160, name: '例幣使街道', sugi: true },
    { z: 34, x0: -112, x1: 160 },
    { z: -62, x0: -112, x1: 160 },
  ],
  roadsNS: [
    { x: -84, z0: -80, z1: 70 },
    { x: -24, z0: -80, z1: 70 },
    { x: 30, z0: -80, z1: 70 },
    { x: 75, z0: -80, z1: 70 },
  ],
  roadWidth: 2.8,
  river: { x: -62, width: 7 },
  rail: { z: -46 },
  highway: { x: 100, y: 5 },
  station: { x: 3, z: -38.5 },
};

const COLORS = {
  asphalt: 0x575d66,
  dash: 0xf2f2ea,
  walls: [0xf2efe6, 0xe9e2d0, 0xd9dde2, 0xcdb99c, 0xb9c6cf, 0xe6d6c3, 0xf5f1e8],
  roofs: [0x3d4651, 0x4a5a6b, 0x6b4a3a, 0x2f3640, 0x5c6670],
  oya: 0xc9c09a, // 大谷石（緑がかった淡い黄土色）
  foundation: 0x8f8a80,
  window: 0x3b4a5a,
  satsuki: [0xf28cb1, 0xe85d8f, 0xf6a6c8],
  shrub: 0x4f8f4a,
  sugi: 0x2f5d3a,
  trunk: 0x7a4f35,
  paddy: [0x8cc06a, 0x9cc96e, 0x84b86a, 0x7fb3a8],
  ridge: 0xb5a77a,
  cars: [0xffffff, 0xd9534f, 0x2f4f8f, 0x9aa3ad, 0x222222, 0xf0c419],
};

// ---------- 決まった並びの乱数（毎回同じ町になる）----------
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 頂点カラーでまとめて1つのメッシュにする ----------
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  // 切妻屋根：棟が x 方向の三角柱（頂点 y=1、底 y=-0.5、半幅 0.866）
  gable: new THREE.CylinderGeometry(1, 1, 1, 3).rotateX(-Math.PI / 2).rotateY(Math.PI / 2),
  // 寄棟屋根：四角すい（底 y=-0.5、半幅 0.707）
  hip: new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 7),
  cone: new THREE.ConeGeometry(1, 1, 7),
  bush: new THREE.SphereGeometry(1, 6, 4),
};

class Batch {
  constructor() {
    this.parts = [];
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.p = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.c = new THREE.Color();
  }
  add(geo, color, x, y, z, sx = 1, sy = 1, sz = 1, rotY = 0) {
    const g = geo.toNonIndexed();
    g.deleteAttribute('uv');
    this.q.setFromEuler(this.e.set(0, rotY, 0));
    g.applyMatrix4(this.m.compose(this.p.set(x, y, z), this.q, this.s.set(sx, sy, sz)));
    this.c.setHex(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = this.c.r;
      col[i * 3 + 1] = this.c.g;
      col[i * 3 + 2] = this.c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
  }
  // 箱：中心 (x,z)、底の高さ y0
  boxAt(color, x, y0, z, w, h, d, rotY = 0) {
    this.add(G.box, color, x, y0 + h / 2, z, w, h, d, rotY);
  }
  build() {
    const geo = mergeGeometries(this.parts);
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

// 家のローカル座標 → ワールド座標（rot は y 軸回転）
function frame(hx, hz, rot) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return (lx, lz) => [hx + lx * c + lz * s, hz - lx * s + lz * c];
}

// ---------- 家（区画 約15m×16m）----------
function addHouse(b, r, hx, hz, rot) {
  const P = frame(hx, hz, rot);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const w = 4.2 + r() * 1.4;
  const d = 3.4 + r() * 1.0;
  const two = r() < 0.72;
  const wallH = two ? 3.0 : 1.75;
  const wall = pick(COLORS.walls);
  const roof = pick(COLORS.roofs);
  const cz = -0.9; // 家は区画の奥寄り、手前が庭
  const at = (lx, lz) => P(lx, cz + lz);

  let [x, z] = at(0, 0);
  b.boxAt(COLORS.foundation, x, 0, z, w + 0.12, 0.22, d + 0.12, rot);
  b.boxAt(wall, x, 0.22, z, w, wallH, d, rot);
  // 窓（正面）
  const winY = [0.75];
  if (two) winY.push(2.2);
  for (const wy of winY) {
    for (const lx of [-w * 0.24, w * 0.18]) {
      [x, z] = at(lx, d / 2 + 0.02);
      b.boxAt(COLORS.window, x, wy, z, w * 0.24, 0.55, 0.05, rot);
    }
  }
  // 玄関ひさし
  [x, z] = at(w * 0.38, d / 2 + 0.3);
  b.boxAt(roof, x, 1.65, z, 0.9, 0.08, 0.6, rot);
  // 屋根（日本瓦の切妻 or 寄棟）
  const top = 0.22 + wallH;
  const roofH = 1.1 + r() * 0.4;
  [x, z] = at(0, 0);
  if (r() < 0.55) {
    b.add(G.gable, roof, x, top + 0.5 * (roofH / 1.5), z, w + 0.5, roofH / 1.5, (d / 2 + 0.4) / 0.866, rot);
  } else {
    b.add(G.hip, roof, x, top + roofH / 2, z, (w / 2 + 0.4) / 0.707, roofH, (d / 2 + 0.4) / 0.707, rot);
  }
  // 大谷石の塀（道路側）。駐車スペースのぶん途切れる
  if (r() < 0.55) {
    const fz = 3.65;
    for (const [lx, len] of [[-2.15, 3.0], [2.9, 1.4]]) {
      [x, z] = P(lx, fz);
      b.boxAt(COLORS.oya, x, 0, z, len, 0.6, 0.24, rot);
    }
  }
  // 車
  if (r() < 0.5) {
    [x, z] = P(1.95, 2.0);
    const car = pick(COLORS.cars);
    b.boxAt(car, x, 0.15, z, 1.0, 0.45, 1.9, rot);
    [x, z] = P(1.95, 1.9);
    b.boxAt(car, x, 0.6, z, 0.9, 0.35, 1.1, rot);
    [x, z] = P(1.95, 2.42);
    b.boxAt(COLORS.window, x, 0.62, z, 0.86, 0.3, 0.05, rot);
  }
  // 庭のさつき（鹿沼市の花）と植木
  const bushes = 1 + Math.floor(r() * 3);
  for (let i = 0; i < bushes; i++) {
    [x, z] = P(-3.2 + r() * 3.2, 1.6 + r() * 1.6);
    const s = 0.35 + r() * 0.25;
    b.add(G.bush, r() < 0.65 ? pick(COLORS.satsuki) : COLORS.shrub, x, s * 0.7, z, s, s * 0.8, s);
  }
  // ときどき大谷石の石蔵
  if (r() < 0.12) {
    [x, z] = at(-w / 2 - 1.3, -0.6);
    b.boxAt(COLORS.oya, x, 0, z, 1.8, 2.0, 2.2, rot);
    b.add(G.gable, 0x3a3f46, x, 2.0 + 0.4, z, 2.1, 0.55, 1.4, rot + Math.PI / 2);
  }
}

// ---------- 杉（例幣使街道の杉並木）----------
function addSugi(b, x, z, s = 1) {
  b.add(G.cyl, COLORS.trunk, x, 1.25 * s, z, 0.22 * s, 2.5 * s, 0.22 * s);
  b.add(G.cone, COLORS.sugi, x, (2.0 + 2.9) * s, z, 1.05 * s, 5.8 * s, 1.05 * s);
}
function addBroadleaf(b, x, z, s, color = 0x5fae5a) {
  b.add(G.cyl, COLORS.trunk, x, 0.5 * s, z, 0.14 * s, 1.0 * s, 0.14 * s);
  b.add(G.bush, color, x, 1.6 * s, z, 0.95 * s, 0.85 * s, 0.95 * s);
}

// ---------- 他社の工場（産業団地）----------
function addSawtoothFactory(b, x, z, w, d) {
  b.boxAt(0xd8dce1, x, 0, z, w, 2.6, d);
  const teeth = Math.max(2, Math.round(w / 3));
  for (let i = 0; i < teeth; i++) {
    const tx = x - w / 2 + (i + 0.5) * (w / teeth);
    b.add(G.gable, 0x9aa4ad, tx, 2.6 + 0.35, z, w / teeth, 0.9 / 1.5, d / 2 / 0.866, Math.PI / 2);
  }
  b.boxAt(0x2f80ed, x, 1.6, z + d / 2 + 0.02, w * 0.6, 0.35, 0.05);
}

// ---------- 道路・川・線路・高速 ----------
function addRoads(b) {
  const W = TOWN.roadWidth;
  for (const r of TOWN.roadsEW) {
    b.boxAt(COLORS.asphalt, (r.x0 + r.x1) / 2, -0.12, r.z, r.x1 - r.x0, 0.02, W);
    for (let x = r.x0 + 1; x < r.x1; x += 3) b.boxAt(COLORS.dash, x, -0.095, r.z, 1.4, 0.01, 0.12);
  }
  for (const r of TOWN.roadsNS) {
    b.boxAt(COLORS.asphalt, r.x, -0.121, (r.z0 + r.z1) / 2, W, 0.02, r.z1 - r.z0);
    for (let z = r.z0 + 1; z < r.z1; z += 3) {
      if (TOWN.roadsEW.some((e) => Math.abs(e.z - z) < 2)) continue;
      b.boxAt(COLORS.dash, r.x, -0.096, z, 0.12, 0.01, 1.4);
    }
  }
}

function addRiver(b) {
  const { x, width } = TOWN.river;
  const { minZ, maxZ } = TOWN.bounds;
  const len = maxZ - minZ + 60;
  const cz = (minZ + maxZ) / 2;
  // 護岸（石積み）
  for (const s of [-1, 1]) b.boxAt(0x9a958a, x + s * (width / 2 + 0.25), -0.2, cz, 0.5, 0.42, len);
  // 橋の欄干
  for (const r of TOWN.roadsEW) {
    for (const s of [-1, 1]) b.boxAt(0xc7ccd3, x, -0.1, r.z + s * 1.45, width + 1.2, 0.5, 0.12);
  }
}

function addRail(b, scene) {
  const { z } = TOWN.rail;
  const x0 = TOWN.bounds.minX - 20;
  const x1 = TOWN.bounds.maxX + 20;
  b.boxAt(0x8d8a83, (x0 + x1) / 2, -0.15, z, x1 - x0, 0.12, 3.0);
  for (let x = x0; x < x1; x += 1.2) b.boxAt(0x6b5444, x, -0.03, z, 0.25, 0.06, 2.0);
  for (const s of [-1, 1]) b.boxAt(0x9aa3ad, (x0 + x1) / 2, 0.03, z + s * 0.55, x1 - x0, 0.08, 0.1);
  // 踏切
  for (const r of TOWN.roadsNS) {
    for (const s of [-1, 1]) {
      b.boxAt(0x222222, r.x + 1.7, 0, z + s * 2.1, 0.12, 1.4, 0.12);
      b.boxAt(0xf0c419, r.x + 1.7, 1.2, z + s * 2.1, 0.16, 0.3, 0.16);
    }
  }
  // 鹿沼駅
  const st = TOWN.station;
  b.boxAt(0xf2ead8, st.x, 0, st.z, 10, 3.2, 4.6);
  b.add(G.hip, 0x4a5a6b, st.x, 3.2 + 0.6, st.z, 5.6 / 0.707, 1.2, 2.8 / 0.707);
  b.boxAt(0x3b4a5a, st.x - 2.5, 0.3, st.z + 2.31, 2.2, 2.0, 0.05);
  b.boxAt(0xd0d4d9, st.x + 2, -0.1, z + 2.1, 26, 0.75, 1.6); // ホーム
  b.boxAt(0x9aa3ad, st.x, -0.12, st.z + 4.2, 14, 0.04, 4); // 駅前広場
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.1), new THREE.MeshBasicMaterial({ map: textTexture('JR 鹿沼駅', '#1f6f43') }));
  sign.position.set(st.x, 3.6, st.z + 2.35);
  scene.add(sign);
}

function addHighway(b, scene) {
  const { x, y } = TOWN.highway;
  const z0 = TOWN.bounds.minZ - 60;
  const z1 = TOWN.bounds.maxZ + 60;
  b.boxAt(0xbfc4ca, x, y, (z0 + z1) / 2, 7, 0.6, z1 - z0);
  b.boxAt(COLORS.asphalt, x, y + 0.6, (z0 + z1) / 2, 6.4, 0.02, z1 - z0);
  for (const s of [-1, 1]) b.boxAt(0xe3e6ea, x + s * 3.3, y + 0.6, (z0 + z1) / 2, 0.25, 0.6, z1 - z0);
  for (let z = z0; z < z1; z += 12) b.boxAt(0xaeb4bb, x, -0.2, z, 1.4, y + 0.2, 1.4);
  // 鹿沼IC の案内標識
  const board = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 2), new THREE.MeshBasicMaterial({ map: textTexture('鹿沼IC ↑', '#1d7a46', '東北自動車道') }));
  board.position.set(x - 9, 4.2, 12.4);
  scene.add(board);
  b.boxAt(0x9aa3ad, x - 11, 0, 12.3, 0.25, 3.2, 0.25);
  b.boxAt(0x9aa3ad, x - 7, 0, 12.3, 0.25, 3.2, 0.25);
}

function addPaddies(b, r, x0, x1, z0, z1, avoid) {
  for (let x = x0; x + 8 <= x1; x += 8.6) {
    for (let z = z0; z + 6 <= z1; z += 6.6) {
      const cx = x + 4;
      const cz = z + 3;
      if (avoid(cx, cz, 4.5, 3.5)) continue;
      b.boxAt(COLORS.ridge, cx, -0.2, cz, 8.4, 0.12, 6.4);
      b.boxAt(COLORS.paddy[Math.floor(r() * COLORS.paddy.length)], cx, -0.08, cz, 7.6, 0.02, 5.6);
    }
  }
}

function addMountains(b, r) {
  const greens = [0x4f7f4f, 0x5d8a58, 0x6f9466, 0x587a5c];
  const place = (x, z) => {
    const rad = 18 + r() * 22;
    const h = 14 + r() * 26;
    b.add(G.cone, greens[Math.floor(r() * greens.length)], x, h / 2 - 0.3, z, rad, h, rad);
  };
  for (let z = -170; z < 110; z += 26) place(-150 - r() * 50, z + r() * 10); // 西の山（前日光）
  for (let x = -120; x < 170; x += 30) place(x + r() * 10, -150 - r() * 40); // 北の山（日光連山）
}

// ---------- 文字の看板 ----------
function textTexture(text, bg, sub) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = sub ? 186 : 112;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, c.width - 12, c.height - 12);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (sub) {
    ctx.font = 'bold 40px "Hiragino Sans", "Noto Sans JP", sans-serif';
    ctx.fillText(sub, 256, 52, 480);
    ctx.font = 'bold 64px "Hiragino Sans", "Noto Sans JP", sans-serif';
    ctx.fillText(text, 256, 124, 480);
  } else {
    ctx.font = 'bold 60px "Hiragino Sans", "Noto Sans JP", sans-serif';
    ctx.fillText(text, 256, 58, 480);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- 電車（JR日光線）----------
function createTrain() {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.5, flatShading: true });
  const stripe = new THREE.MeshStandardMaterial({ color: 0x7a2e2e, roughness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x2b3a4a, roughness: 0.2 });
  for (let i = 0; i < 4; i++) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(9.4, 1.9, 1.6), body);
    car.position.set(i * 9.8, 1.15, 0);
    car.castShadow = true;
    g.add(car);
    const st = new THREE.Mesh(new THREE.BoxGeometry(9.42, 0.22, 1.62), stripe);
    st.position.set(i * 9.8, 0.75, 0);
    g.add(st);
    const win = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.5, 1.63), glass);
    win.position.set(i * 9.8, 1.45, 0);
    g.add(win);
  }
  return g;
}

// ---------- 町を作る ----------
export function createTown(scene) {
  const r = mulberry32(20261103);
  const b = new Batch();

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x9fd18a, roughness: 1 }),
  );
  ground.position.y = -0.2;
  ground.receiveShadow = true;
  scene.add(ground);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(TOWN.river.width, TOWN.bounds.maxZ - TOWN.bounds.minZ + 60).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x3f8fc7, roughness: 0.15, metalness: 0.1 }),
  );
  water.position.set(TOWN.river.x, -0.16, (TOWN.bounds.minZ + TOWN.bounds.maxZ) / 2);
  water.receiveShadow = true;
  scene.add(water);

  addRoads(b);
  addRiver(b);
  addRail(b, scene);
  addHighway(b, scene);
  addMountains(b, r);

  // 家を建てない場所（空き地・本社・駅・道・川・線路・産業団地）
  const W = TOWN.roadWidth / 2 + 1.2;
  const avoidRects = [
    ...LOTS.map((l) => {
      const bx = lotBox(l);
      return [bx.minX - 1.2, bx.maxX + 1.2, bx.minZ - 1.2, bx.maxZ + 1.6];
    }),
    [-10, 16, -45, -32], // 駅
    [31, 74, 35, 64], // 他社の工場
    [TOWN.river.x - 6, TOWN.river.x + 6, -999, 999],
    [-999, 999, TOWN.rail.z - 3, TOWN.rail.z + 3],
    [TOWN.highway.x - 26, 999, -999, 999], // 高速の東側は田んぼ
    ...TOWN.roadsEW.map((rd) => [-999, 999, rd.z - W, rd.z + W]),
    ...TOWN.roadsNS.map((rd) => [rd.x - W, rd.x + W, -999, 999]),
  ];
  const avoid = (x, z, hw, hd) => avoidRects.some(([a, bb, c, d]) => x + hw > a && x - hw < bb && z + hd > c && z - hd < d);

  // 住宅地
  const CELL_X = 7.6;
  const CELL_Z = 8.0;
  const { minX, maxX, minZ, maxZ } = TOWN.bounds;
  for (let x = minX + 4; x < 74; x += CELL_X) {
    for (let z = minZ + 4; z < maxZ - 2; z += CELL_Z) {
      if (avoid(x, z, 3.5, 3.8)) continue;
      if (r() < 0.14) {
        // 空いた区画は庭木だけ
        addBroadleaf(b, x + (r() - 0.5) * 3, z + (r() - 0.5) * 3, 0.9 + r() * 0.5);
        continue;
      }
      // 近いほうの東西の道に正面を向ける
      const near = TOWN.roadsEW.reduce((best, rd) => (Math.abs(rd.z - z) < Math.abs(best - z) ? rd.z : best), 9999);
      const rot = near > z ? 0 : Math.PI;
      addHouse(b, r, x + (r() - 0.5) * 0.6, z + (r() - 0.5) * 0.4, rot);
    }
  }

  // 例幣使街道の杉並木
  const sugiRoad = TOWN.roadsEW.find((rd) => rd.sugi);
  for (let x = sugiRoad.x0 + 2; x < sugiRoad.x1; x += 3.2) {
    for (const s of [-1, 1]) {
      const z = sugiRoad.z + s * 2.35;
      const blocked =
        TOWN.roadsNS.some((rd) => Math.abs(rd.x - x) < 2.6) ||
        Math.abs(x - TOWN.river.x) < 5 ||
        Math.abs(x - TOWN.highway.x) < 2 ||
        LOTS.some((l) => {
          const bx = lotBox(l);
          return x > bx.minX - 1 && x < bx.maxX + 1 && z > bx.minZ - 1 && z < bx.maxZ + 1;
        });
      if (!blocked) addSugi(b, x, z, 0.9 + r() * 0.25);
    }
  }

  // 他社の工場（産業団地）
  addSawtoothFactory(b, 42, 47, 14, 10);
  addSawtoothFactory(b, 61, 45, 16, 12);
  addSawtoothFactory(b, 50, 58.5, 26, 6);
  b.add(G.cyl, 0xd8dce1, 69, 2.2, 56, 1.8, 4.4, 1.8);

  // 田んぼ（東部と高速の向こう）
  addPaddies(b, r, 77, 97, -78, 68, avoid);
  addPaddies(b, r, 104, 160, -78, 68, (x, z, hw, hd) => TOWN.roadsEW.some((rd) => Math.abs(rd.z - z) < hd + 1.6));

  // 川沿いの木
  for (let z = minZ; z < maxZ; z += 6) {
    if (TOWN.roadsEW.some((rd) => Math.abs(rd.z - z) < 3) || Math.abs(z - TOWN.rail.z) < 3) continue;
    addBroadleaf(b, TOWN.river.x + 6, z + r() * 2, 1.1 + r() * 0.4, 0x6bb35f);
  }

  const town = b.build();
  scene.add(town);

  const train = createTrain();
  train.position.set(-140, 0, TOWN.rail.z);
  scene.add(train);
  const trainState = { x: -150, dir: 1, wait: 0 };

  return {
    update(dt) {
      // 鹿沼駅に止まりながら往復する
      const st = TOWN.station.x - 14;
      if (trainState.wait > 0) {
        trainState.wait -= dt;
        return;
      }
      const prev = trainState.x;
      trainState.x += trainState.dir * 14 * dt;
      if ((prev < st && trainState.x >= st && trainState.dir > 0) || (prev > st && trainState.x <= st && trainState.dir < 0)) {
        trainState.x = st;
        trainState.wait = 4;
      }
      if (trainState.x > 200) trainState.dir = -1;
      if (trainState.x < -190) trainState.dir = 1;
      train.position.x = trainState.x;
    },
  };
}
