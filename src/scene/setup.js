import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// 工場全体（幅 x ≒ 10、奥行 z ≒ 20）が縦画面に収まるようにカメラ距離を決める
const VIEW = { width: 10.5, depth: 19.5, polar: 0.78, azimuth: 0.42 };
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
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -11;
  sc.right = 11;
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

  function fitDistance() {
    const h = renderer.domElement.clientHeight || window.innerHeight;
    const w = renderer.domElement.clientWidth || window.innerWidth;
    const usable = Math.max(0.3, (h - safe.top - safe.bottom) / h);
    const vfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * usable);
    const aspect = w / (h * usable);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    // 斜め上から見ると奥行きは cos(polar) 程度に縮んで見える
    const projectedDepth = VIEW.depth * Math.cos(VIEW.polar) + 2.5 * Math.sin(VIEW.polar);
    const dDepth = projectedDepth / 2 / Math.tan(vfov / 2);
    const dWidth = VIEW.width / 2 / Math.tan(hfov / 2);
    return Math.max(dDepth, dWidth) * 1.02;
  }

  function resetView() {
    const d = fitDistance();
    const off = new THREE.Vector3().setFromSphericalCoords(d, VIEW.polar, VIEW.azimuth);
    controls.target.copy(TARGET);
    camera.position.copy(TARGET).add(off);
    controls.maxDistance = Math.max(45, d * 1.4);
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

  return { renderer, scene, camera, controls, resetView, clampTarget, setSafeArea };
}
