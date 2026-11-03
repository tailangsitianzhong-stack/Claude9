import { CONFIG } from '../config.js';
import { LAYOUT } from '../scene/factory.js';

const OUT_X = 20;
const easeIn = (p) => p * p;
const easeOut = (p) => 1 - (1 - p) * (1 - p);

// 配送トラック。倉庫から積んで出発 → おろし先に着いた時点で利益計上 → 戻る
export class Truck {
  constructor(state, mesh) {
    this.state = state;
    this.mesh = mesh;
    this.mode = 'docked'; // docked | leaving | away | returning
    this.t = 0;
    this.wait = 0;
    this.cargo = null;
    this.buyer = null;
    mesh.position.set(0, 0, LAYOUT.truckZ);
  }

  get canShip() {
    return this.mode === 'docked' && this.state.stock.length > 0;
  }

  requestShip() {
    if (this.canShip) this.depart();
  }

  depart() {
    this.cargo = this.state.takeStock(this.state.truckCapacity);
    this.buyer = this.state.nextBuyer();
    this.mode = 'leaving';
    this.t = 0;
    this.wait = 0;
    this.state.emit('truck');
  }

  update(dt) {
    const T = CONFIG.truck;
    const prevX = this.mesh.position.x;
    switch (this.mode) {
      case 'docked': {
        if (this.state.stock.length > 0) {
          this.wait += dt;
          if (this.state.stock.length >= this.state.truckCapacity || this.wait >= T.maxWait) this.depart();
        } else {
          this.wait = 0;
        }
        break;
      }
      case 'leaving': {
        this.t += dt;
        const p = Math.min(1, this.t / T.leaveTime);
        this.mesh.position.x = easeIn(p) * OUT_X;
        if (p >= 1) {
          this.mode = 'away';
          this.t = 0;
          this.mesh.visible = false;
        }
        break;
      }
      case 'away': {
        this.t += dt;
        if (this.t >= T.travelTime) {
          this.state.deliver(this.cargo, this.buyer);
          this.cargo = null;
          this.mode = 'returning';
          this.t = 0;
          this.mesh.visible = true;
          this.mesh.position.x = -OUT_X;
        }
        break;
      }
      case 'returning': {
        this.t += dt;
        const p = Math.min(1, this.t / T.returnTime);
        this.mesh.position.x = -OUT_X * (1 - easeOut(p));
        if (p >= 1) {
          this.mode = 'docked';
          this.t = 0;
          this.buyer = null;
          this.mesh.position.x = 0;
          this.state.emit('truck');
        }
        break;
      }
    }
    const dx = this.mesh.position.x - prevX;
    if (dx) for (const w of this.mesh.userData.wheels) w.rotation.z -= dx / 0.26;
  }

  // 発車までの残り秒（HUD 表示用）
  get secondsToDepart() {
    if (this.mode !== 'docked' || this.state.stock.length === 0) return null;
    return Math.max(0, CONFIG.truck.maxWait - this.wait);
  }
}
