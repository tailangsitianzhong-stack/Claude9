import * as THREE from 'three';
import { createWorker } from '../scene/models.js';
import { LAYOUT } from '../scene/factory.js';

// 作業員は持ち場のポイントを巡回するだけ（雇用・給料・効率は今後追加）
export class Workers {
  constructor(scene, state) {
    this.list = state.employees.map((emp, i) => {
      const mesh = createWorker(emp.color);
      const spots = LAYOUT.workerSpots[emp.station % LAYOUT.workerSpots.length].map(([x, z]) => new THREE.Vector3(x, 0, z));
      mesh.position.copy(spots[0]);
      mesh.userData.info = { title: `${emp.name}さん`, desc: `担当：${emp.role}` };
      scene.add(mesh);
      return { emp, mesh, spots, target: 1, idle: 0.5 + i * 0.7, phase: Math.random() * 10 };
    });
  }

  get meshes() {
    return this.list.map((w) => w.mesh);
  }

  update(dt) {
    for (const w of this.list) {
      w.phase += dt;
      if (w.idle > 0) {
        w.idle -= dt;
        w.mesh.position.y = 0;
        continue;
      }
      const tgt = w.spots[w.target];
      const dx = tgt.x - w.mesh.position.x;
      const dz = tgt.z - w.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      const step = 0.9 * dt;
      if (dist <= step) {
        w.mesh.position.x = tgt.x;
        w.mesh.position.z = tgt.z;
        w.target = (w.target + 1 + Math.floor(Math.random() * (w.spots.length - 1))) % w.spots.length;
        w.idle = 1.2 + Math.random() * 2.5;
      } else {
        w.mesh.position.x += (dx / dist) * step;
        w.mesh.position.z += (dz / dist) * step;
        w.mesh.rotation.y = Math.atan2(dx, dz);
        w.mesh.position.y = Math.abs(Math.sin(w.phase * 9)) * 0.05;
      }
    }
  }
}
