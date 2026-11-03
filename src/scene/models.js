import * as THREE from 'three';

// 低ポリ＆フラットシェーディング。役割は色で示す：
//   青 = 搬入口 / オレンジ = 搬出口 / 黄 = 安全・可動部 / ランプ = 稼働状態
const std = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, flatShading: true, ...extra });

export const MAT = {
  body: std(0xe8ecf1),
  bodyDark: std(0x46505e),
  steel: std(0xa7b0ba, { metalness: 0.45, roughness: 0.45 }),
  blue: std(0x2f80ed),
  orange: std(0xff8a00),
  heater: std(0xc0392b),
  yellow: std(0xf6c445),
  wood: std(0xc29462),
  red: std(0xe5533d),
  white: std(0xf7f7f2),
  floor: std(0xc9ced6, { roughness: 0.95 }),
  wall: std(0xdcd3c4),
  glass: new THREE.MeshStandardMaterial({ color: 0x9fd3ff, transparent: true, opacity: 0.35, roughness: 0.1 }),
  glassDark: std(0x2b3a4a, { roughness: 0.2, metalness: 0.3 }),
  water: new THREE.MeshStandardMaterial({ color: 0x3fa9f5, transparent: true, opacity: 0.65, roughness: 0.15 }),
  rubber: std(0x22262c),
  skin: std(0xf2c9a0),
};

function mesh(geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}
export const box = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
const cylZ = (r, len, mat, x, y, z, seg = 12) =>
  mesh(new THREE.CylinderGeometry(r, r, len, seg).rotateX(Math.PI / 2), mat, x, y, z);
const cylX = (r, len, mat, x, y, z, seg = 12) =>
  mesh(new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2), mat, x, y, z);

// ---------- 稼働ランプ ----------
export const LAMP_COLORS = { running: 0x2ecc71, idle: 0xf1c40f, blocked: 0xe74c3c };
export function createLamp(x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6), MAT.steel, 0, 0.15, 0));
  const mat = new THREE.MeshStandardMaterial({ color: LAMP_COLORS.idle, emissive: LAMP_COLORS.idle, emissiveIntensity: 1.2 });
  const bulb = mesh(new THREE.SphereGeometry(0.085, 12, 8), mat, 0, 0.34, 0, false);
  g.add(bulb);
  g.userData.bulb = bulb;
  return g;
}
export function setLamp(lamp, status) {
  if (lamp.userData.status === status) return;
  lamp.userData.status = status;
  const c = LAMP_COLORS[status];
  const m = lamp.userData.bulb.material;
  m.color.setHex(c);
  m.emissive.setHex(c);
}

// ---------- ベルトコンベア ----------
function makeBeltTexture() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#353a42';
  ctx.fillRect(0, 0, 32, 64);
  ctx.fillStyle = '#4d5560';
  ctx.fillRect(0, 0, 32, 10);
  ctx.fillStyle = '#2a2e35';
  ctx.fillRect(0, 30, 32, 3);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// z 方向に流れるコンベア。原点はベルト中央の床。
export function createConveyor(length, width = 0.9) {
  const g = new THREE.Group();
  const tex = makeBeltTexture();
  tex.repeat.set(1, length / 0.5);
  const belt = mesh(new THREE.PlaneGeometry(width, length), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), 0, 0.69, 0, false);
  belt.rotation.x = -Math.PI / 2;
  g.add(belt);
  g.add(box(width + 0.1, 0.12, length, MAT.steel, 0, 0.62, 0));
  for (const s of [-1, 1]) g.add(box(0.05, 0.08, length, MAT.yellow, s * (width / 2 + 0.05), 0.72, 0));
  const legs = Math.max(2, Math.round(length / 1.2) + 1);
  for (let i = 0; i < legs; i++) {
    const z = -length / 2 + 0.15 + (i * (length - 0.3)) / (legs - 1);
    for (const s of [-1, 1]) g.add(box(0.06, 0.56, 0.06, MAT.bodyDark, s * (width / 2 - 0.05), 0.28, z));
  }
  for (const s of [-1, 1]) g.add(cylX(0.06, width + 0.04, MAT.rubber, 0, 0.64, s * (length / 2 - 0.03)));
  g.userData.texture = tex;
  g.userData.info = { title: 'ベルトコンベア', desc: '機械と機械をつなぐ搬送ライン。生産スピードを上げるとベルトも速くなります。' };
  return g;
}

// ---------- 押出機（原料ペレット → ストローのチューブ）----------
export function createExtruder() {
  const g = new THREE.Group();
  g.add(box(1.3, 0.55, 2.2, MAT.bodyDark, 0, 0.275, 0));
  g.add(cylZ(0.2, 1.9, MAT.steel, 0, 0.85, 0.1));
  for (let i = 0; i < 4; i++) g.add(cylZ(0.24, 0.14, MAT.heater, 0, 0.85, -0.45 + i * 0.4));
  // ホッパー（原料投入口＝青）
  const hopperMat = MAT.blue.clone();
  hopperMat.side = THREE.DoubleSide;
  g.add(mesh(new THREE.CylinderGeometry(0.46, 0.12, 0.7, 8, 1, true), hopperMat, 0, 1.55, -0.6));
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.4, 8), MAT.steel, 0, 1.08, -0.6));
  const pelletMat = new THREE.MeshStandardMaterial({ color: 0xff6b6b, roughness: 0.6, flatShading: true });
  g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 8), pelletMat, 0, 1.82, -0.6, false));
  // モーター
  g.add(box(0.7, 0.7, 0.55, MAT.body, 0, 0.9, -0.95));
  g.add(cylX(0.18, 0.75, MAT.steel, 0, 0.9, -0.95));
  // 口金（搬出口＝オレンジ）
  g.add(cylZ(0.15, 0.16, MAT.orange, 0, 0.85, 1.1));
  // 操作盤
  g.add(box(0.08, 0.55, 0.45, MAT.body, 0.7, 0.85, 0.45));
  const lamp = createLamp(0.7, 1.12, 0.45);
  g.add(lamp);
  g.userData = {
    key: 'extruder',
    lamp,
    pelletMat,
    info: { title: '押出機', desc: '樹脂ペレットを溶かして細いチューブに押し出します。ラインの最初の工程。' },
  };
  return g;
}

// ---------- 冷却槽 ----------
export function createCoolingBath(length = 2.0) {
  const g = new THREE.Group();
  g.add(box(0.7, 0.62, length, MAT.steel, 0, 0.31, 0));
  g.add(box(0.6, 0.04, length - 0.1, MAT.water, 0, 0.63, 0));
  for (const z of [-length / 2 + 0.25, length / 2 - 0.25]) g.add(cylX(0.04, 0.6, MAT.rubber, 0, 0.8, z));
  g.userData = { key: 'bath', info: { title: '冷却槽', desc: '押し出したチューブを水で冷やして固めます。' } };
  return g;
}

// ---------- カッター ----------
export function createCutter() {
  const g = new THREE.Group();
  g.add(box(0.9, 0.55, 0.7, MAT.bodyDark, 0, 0.275, 0));
  for (const s of [-1, 1]) g.add(box(0.1, 1.2, 0.12, MAT.yellow, s * 0.45, 1.15, 0));
  g.add(box(1.02, 0.14, 0.22, MAT.yellow, 0, 1.78, 0));
  const blade = new THREE.Group();
  blade.add(box(0.75, 0.06, 0.18, MAT.steel, 0, 0, 0));
  blade.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8), MAT.steel, 0, 0.22, 0));
  blade.position.y = 1.3;
  g.add(blade);
  g.add(box(0.92, 0.42, 0.03, MAT.glass, 0, 1.0, 0.36));
  g.add(box(0.5, 0.06, 0.02, MAT.orange, 0, 0.45, 0.36));
  const lamp = createLamp(0.38, 1.85, 0);
  g.add(lamp);
  g.userData = {
    key: 'cutter',
    lamp,
    blade,
    info: { title: 'カッター', desc: 'チューブを一定の長さに切ってストローにします。' },
  };
  return g;
}

// ---------- 結束機（4〜5本を1束にまとめる）----------
export function createBundler() {
  const g = new THREE.Group();
  g.add(box(1.5, 0.9, 1.3, MAT.body, 0, 0.45, 0));
  g.add(box(1.52, 0.12, 1.32, MAT.blue, 0, 0.85, 0)); // 本体の上面(0.9)と重ねない（ちらつき防止）
  g.add(box(0.02, 0.4, 0.9, MAT.glassDark, 0.76, 0.45, 0));
  g.add(box(0.9, 0.1, 0.02, MAT.blue, 0, 0.6, -0.66)); // 搬入
  g.add(box(0.9, 0.1, 0.02, MAT.orange, 0, 0.6, 0.66)); // 搬出
  for (const s of [-1, 1]) g.add(box(0.1, 0.9, 0.1, MAT.yellow, s * 0.55, 1.35, 0));
  g.add(box(1.2, 0.12, 0.3, MAT.yellow, 0, 1.82, 0));
  const head = new THREE.Group();
  head.add(box(0.8, 0.18, 0.5, MAT.bodyDark, 0, 0, 0));
  head.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), MAT.steel, 0, 0.3, 0));
  head.position.y = 1.4;
  g.add(head);
  const lamp = createLamp(0.62, 1.88, 0.45);
  g.add(lamp);
  g.userData = {
    key: 'bundler',
    lamp,
    head,
    info: { title: '結束機', desc: 'ストローを4〜5本ずつ束ねてバンドで留めます。倉庫が満杯になると止まります。' },
  };
  return g;
}

// ---------- 出荷場（パレット）----------
export function createDock() {
  const g = new THREE.Group();
  g.add(box(2.1, 0.14, 1.8, MAT.wood, 0, 0.07, 0));
  for (const x of [-0.9, 0, 0.9]) g.add(box(0.12, 0.06, 1.8, MAT.bodyDark, x, 0.02, 0));
  const lineMat = MAT.yellow;
  g.add(box(2.6, 0.012, 0.06, lineMat, 0, 0.006, -1.1));
  g.add(box(2.6, 0.012, 0.06, lineMat, 0, 0.006, 1.1));
  g.add(box(0.06, 0.012, 2.2, lineMat, -1.3, 0.006, 0));
  g.add(box(0.06, 0.012, 2.2, lineMat, 1.3, 0.006, 0));
  g.userData = { key: 'dock', info: { title: '出荷倉庫', desc: '束になったストローをここに積み、トラックでおろし先へ運びます。' } };
  return g;
}

// ---------- トラック（+x 向き）----------
export function createTruck() {
  const g = new THREE.Group();
  g.add(box(3.4, 0.2, 1.3, MAT.bodyDark, 0.15, 0.4, 0));
  g.add(box(1.0, 1.0, 1.4, MAT.red, 1.35, 0.95, 0));
  g.add(box(0.03, 0.42, 1.2, MAT.glassDark, 1.86, 1.15, 0));
  g.add(box(2.3, 1.35, 1.5, MAT.white, -0.35, 1.18, 0));
  g.add(box(2.32, 0.16, 1.52, MAT.blue, -0.35, 0.72, 0));
  const wheels = [];
  for (const x of [1.3, -0.4, -1.1]) {
    for (const s of [-1, 1]) {
      const w = cylZ(0.26, 0.2, MAT.rubber, x, 0.26, s * 0.62, 10);
      wheels.push(w);
      g.add(w);
    }
  }
  g.userData = { key: 'truck', wheels, info: { title: '配送トラック', desc: '倉庫の束を積んでおろし先へ。おろした時点で利益が入ります。' } };
  return g;
}

// ---------- 作業員 ----------
export function createWorker(color) {
  const g = new THREE.Group();
  const body = std(color);
  g.add(mesh(new THREE.CapsuleGeometry(0.15, 0.32, 4, 8), body, 0, 0.42, 0));
  g.add(mesh(new THREE.SphereGeometry(0.13, 10, 8), MAT.skin, 0, 0.86, 0));
  g.add(mesh(new THREE.SphereGeometry(0.145, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), MAT.yellow, 0, 0.9, 0));
  g.add(box(0.12, 0.05, 0.06, MAT.yellow, 0, 0.9, 0.13)); // ヘルメットのつば（正面 +z）
  return g;
}

// ---------- 建屋・地面・道路 ----------
function makeSignTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2f80ed';
  ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 54px "Hiragino Sans", "Noto Sans JP", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 50, 480);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 建屋（床・壁・ゲート・看板）。所有地の範囲 [minX, maxX] に合わせて作り直す。
export function createShell(signText, minX, maxX, plotEdges, gateX = 0) {
  const g = new THREE.Group();
  const W = maxX - minX;
  const cx = (minX + maxX) / 2;
  const D = 16.8;
  g.add(mesh(new THREE.BoxGeometry(W - 0.2, 0.1, D - 0.2), MAT.floor, cx, -0.05, 0, false));
  // 各区画の通路ライン
  for (const [a, b] of plotEdges) {
    const lx = (a + b) / 2;
    const half = Math.min(2.1, (b - a) / 2 - 0.35);
    for (const s of [-1, 1]) g.add(box(0.06, 0.012, D - 1.2, MAT.yellow, lx + s * half, 0.006, 0));
  }
  // 区画の継ぎ目（増築したことが分かるように）
  for (const [a] of plotEdges.slice(1)) g.add(box(0.08, 0.014, D - 0.4, MAT.bodyDark, a, 0.007, 0));
  // 壁（中が見えるよう低めの断面表示）
  g.add(box(W, 1.6, 0.2, MAT.wall, cx, 0.8, -D / 2));
  g.add(box(0.2, 0.8, D, MAT.wall, minX, 0.4, 0));
  g.add(box(0.2, 0.8, D, MAT.wall, maxX, 0.4, 0));
  const door = 2.8;
  const leftW = gateX - door / 2 - minX;
  const rightW = maxX - (gateX + door / 2);
  if (leftW > 0.05) g.add(box(leftW, 0.8, 0.2, MAT.wall, minX + leftW / 2, 0.4, D / 2));
  if (rightW > 0.05) g.add(box(rightW, 0.8, 0.2, MAT.wall, maxX - rightW / 2, 0.4, D / 2));
  // 搬出口ゲート
  for (const s of [-1, 1]) g.add(box(0.18, 2.1, 0.24, MAT.orange, gateX + s * (door / 2), 1.05, D / 2));
  g.add(box(door + 0.18, 0.2, 0.24, MAT.orange, gateX, 2.1, D / 2));
  // 柱（区画の境目ごと）
  const xs = [minX, ...plotEdges.slice(1).map(([a]) => a), maxX];
  for (const x of xs) for (const sz of [-1, 1]) g.add(box(0.35, 2.4, 0.35, MAT.bodyDark, x, 1.2, sz * (D / 2)));
  // 看板（奥の壁の中央）
  g.add(mesh(new THREE.PlaneGeometry(4.2, 0.8), new THREE.MeshBasicMaterial({ map: makeSignTexture(signText) }), cx, 2.15, -D / 2 + 0.11, false));
  g.add(box(4.4, 1.0, 0.1, MAT.bodyDark, cx, 2.15, -D / 2 + 0.03));
  for (const s of [-1, 1]) g.add(box(0.1, 0.8, 0.1, MAT.bodyDark, cx + s * 1.8, 1.4, -D / 2));
  return g;
}

export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material?.map) o.material.map.dispose();
  });
}
