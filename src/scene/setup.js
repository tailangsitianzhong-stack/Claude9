import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// カメラは「見せたい箱」（工場や町全体）が HUD の隙間に収まる距離に自動で合わせる。
// 1本指ドラッグで地図のように移動、2本指でズーム・回転。
const ANGLE = { polar: 0.78, azimuth: 0.42 };
const SHADOW_HALF = 26;

export function createStage(container, bounds) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfe3ff);
  scene.fog = new THREE.Fog(0xbfe3ff, 140, 420);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.3, 700);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x7d8b99, 1.6));
  // 影はカメラの注視点のまわりだけ描く（町全体だと影が粗くなるため）
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
  const SUN_OFFSET = new THREE.Vector3(14, 32, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -SHADOW_HALF;
  sc.right = SHADOW_HALF;
  sc.top = SHADOW_HALF;
  sc.bottom = -SHADOW_HALF;
  sc.near = 1;
  sc.far = 90;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.screenSpacePanning = false;
  controls.minDistance = 7;
  controls.maxDistance = 260;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = 1.2;
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };

  // HUD に隠れない範囲（上端・下端の px）
  const safe = { top: 0, bottom: 0 };
  let view = { minX: -5.25, maxX: 5.25, minZ: -8.6, maxZ: 10.9 };

  // 箱の角をすべて HUD の隙間に入れられる最短距離（二分探索）
  const _v = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _probe = camera.clone();
  function fitFor(box) {
    const h = renderer.domElement.clientHeight || window.innerHeight;
    const yTop = 1 - (2 * safe.top) / h - 0.02;
    const yBottom = -1 + (2 * safe.bottom) / h + 0.02;
    const target = new THREE.Vector3((box.minX + box.maxX) / 2, 0, (box.minZ + box.maxZ) / 2);
    const pts = [];
    for (const x of [box.minX, box.maxX]) for (const z of [box.minZ, box.maxZ]) for (const y of [0, 1.6]) pts.push(new THREE.Vector3(x, y, z));
    _dir.setFromSphericalCoords(1, ANGLE.polar, ANGLE.azimuth);
    _probe.copy(camera);
    const fits = (d) => {
      _probe.position.copy(target).addScaledVector(_dir, d);
      _probe.lookAt(target);
      _probe.updateMatrixWorld();
      return pts.every((p) => {
        _v.copy(p).project(_probe);
        return _v.z < 1 && Math.abs(_v.x) <= 0.97 && _v.y <= yTop && _v.y >= yBottom;
      });
    };
    let lo = 4;
    let hi = 400;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    return { target, position: target.clone().addScaledVector(_dir, hi), distance: hi };
  }

  // 見せたい箱へカメラを移動（animate なら 0.7 秒かけて）
  let flight = null;
  function focus(box, animate = true) {
    view = box;
    const f = fitFor(box);
    controls.maxDistance = Math.max(260, f.distance * 1.3);
    if (!animate) {
      controls.target.copy(f.target);
      camera.position.copy(f.position);
      controls.update();
      flight = null;
      return;
    }
    flight = { t: 0, dur: 0.7, fromT: controls.target.clone(), fromP: camera.position.clone(), toT: f.target, toP: f.position };
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
    focus(view, false);
  }

  resize();
  window.addEventListener('resize', resize);

  // 町の外に出ないように注視点を制限し、影の範囲を注視点に追従させる
  function tick(dt) {
    if (flight) {
      flight.t += dt;
      const k = Math.min(1, flight.t / flight.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      controls.target.lerpVectors(flight.fromT, flight.toT, e);
      camera.position.lerpVectors(flight.fromP, flight.toP, e);
      if (k >= 1) flight = null;
    }
    const prevFar = camera.far;
    controls.update();
    const t = controls.target;
    const cx = THREE.MathUtils.clamp(t.x, bounds.minX, bounds.maxX);
    const cz = THREE.MathUtils.clamp(t.z, bounds.minZ, bounds.maxZ);
    if (cx !== t.x || cz !== t.z || t.y !== 0) {
      camera.position.x += cx - t.x;
      camera.position.y -= t.y;
      camera.position.z += cz - t.z;
      t.set(cx, 0, cz);
    }
    // 霧はカメラの距離に合わせる（遠くから町全体を見ても白くならないように）
    const dist = camera.position.distanceTo(t);
    scene.fog.near = Math.max(80, dist * 1.1);
    scene.fog.far = Math.max(300, dist * 2.6);
    camera.far = Math.max(700, dist * 3);
    // 遠くから見下ろすと奥行きの精度が足りずに地面がちらつくので、near も距離に合わせて広げる
    const near = THREE.MathUtils.clamp(dist * 0.03, 0.3, 12);
    if (Math.abs(camera.near - near) > 0.05) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }
    if (camera.far !== prevFar) camera.updateProjectionMatrix();
    // 影：注視点の近くだけ
    sun.target.position.set(Math.round(t.x), 0, Math.round(t.z));
    sun.position.copy(sun.target.position).add(SUN_OFFSET);
  }

  return { renderer, scene, camera, controls, focus, setSafeArea, tick };
}
