import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// 見せたい範囲（x は所有地に合わせて setFrame で変わる）が HUD の隙間に収まるようにカメラ距離を決める
const VIEW = { minX: -5.25, maxX: 5.25, minZ: -8.6, maxZ: 10.9, polar: 0.78, azimuth: 0.42 };
const TARGET = new THREE.Vector3(0, 0, 1.2);
const BOUNDS = { minX: -6, maxX: 6, minZ: -9, maxZ: 11 };

export function createStage(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfe3ff);
  scene.fog = new THREE.Fog(0xbfe3ff, 45, 110);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 250);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x7d8b99, 1.6));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
  sun.position.set(7, 16, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -17;
  sc.right = 17;
  sc.top = 13;
  sc.bottom = -13;
  sc.near = 1;
  sc.far = 45;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.screenSpacePanning = false;
  controls.minDistance = 7;
  controls.maxDistance = 45;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = 1.2;
  controls.target.copy(TARGET);

  // HUD に隠れない範囲（上端・下端の px）。main から setSafeArea で渡す
  const safe = { top: 0, bottom: 0 };

  // 見せたい箱の角をすべて画面（HUD の隙間）に入れられる最短距離を二分探索で求める
  const _v = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  function resetView() {
    const h = renderer.domElement.clientHeight || window.innerHeight;
    const yTop = 1 - (2 * safe.top) / h - 0.02;
    const yBottom = -1 + (2 * safe.bottom) / h + 0.02;
    const pts = [];
    for (const x of [VIEW.minX, VIEW.maxX]) for (const z of [VIEW.minZ, VIEW.maxZ]) for (const y of [0, 1.6]) pts.push(new THREE.Vector3(x, y, z));
    controls.target.copy(TARGET);
    _dir.setFromSphericalCoords(1, VIEW.polar, VIEW.azimuth);
    const fits = (d) => {
      camera.position.copy(TARGET).addScaledVector(_dir, d);
      camera.lookAt(TARGET);
      camera.updateMatrixWorld();
      return pts.every((p) => {
        _v.copy(p).project(camera);
        return _v.z < 1 && Math.abs(_v.x) <= 0.97 && _v.y <= yTop && _v.y >= yBottom;
      });
    };
    let lo = 4;
    let hi = 150;
    for (let i = 0; i < 26; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    camera.position.copy(TARGET).addScaledVector(_dir, hi);
    controls.maxDistance = Math.max(45, hi * 1.4);
    controls.update();
  }

  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / h;
    // 見える範囲の中心を HUD の隙間の中心に合わせる
    camera.setViewOffset(w, h, 0, (safe.bottom - safe.top) / 2, w, h);
    camera.updateProjectionMatrix();
  }

  function setSafeArea(top, bottom) {
    safe.top = top;
    safe.bottom = bottom;
    resize();
    resetView();
  }

  resize();
  resetView();
  window.addEventListener('resize', resize);

  // パンしすぎて工場を見失わないように注視点を制限
  function clampTarget() {
    const t = controls.target;
    const cx = THREE.MathUtils.clamp(t.x, BOUNDS.minX, BOUNDS.maxX);
    const cz = THREE.MathUtils.clamp(t.z, BOUNDS.minZ, BOUNDS.maxZ);
    if (cx !== t.x || cz !== t.z || t.y !== 0) {
      const dx = cx - t.x;
      const dz = cz - t.z;
      const dy = -t.y;
      t.set(cx, 0, cz);
      camera.position.x += dx;
      camera.position.y += dy;
      camera.position.z += dz;
    }
  }

  // 所有地の幅に合わせて見る範囲を変える（隣の空き地のボタンも少し見えるように）
  function setFrame(minX, maxX, reset = true) {
    VIEW.minX = minX - 0.85;
    VIEW.maxX = maxX + 0.85;
    TARGET.x = (minX + maxX) / 2;
    BOUNDS.minX = minX - 4;
    BOUNDS.maxX = maxX + 4;
    if (reset) resetView();
  }

  return { renderer, scene, camera, controls, resetView, clampTarget, setSafeArea, setFrame };
}
