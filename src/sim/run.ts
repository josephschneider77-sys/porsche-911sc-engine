/**
 * Throttle and crank integration. Holding the pedal aims at redline; releasing it
 * aims at idle. A stop snaps back to the assembled crank so teardown matches the static mesh.
 */
import { IDLE_RPM, REDLINE_RPM } from './drive';

const TAU_UP = 0.7;
const TAU_DOWN = 1.15;

export class EngineRun {
  rpm = 0;
  /** Accumulated model crank angle, degrees. Zero is the assembled pose (cylinder 1 firing TDC). */
  crankDeg = 0;
  running = false;
  pedal = false;
  /** Freeze rpm (screenshot). The crank still turns unless `freezeAngle` is set. */
  hold = false;
  freezeAngle = false;
  private dirty = false;

  start() {
    this.running = true;
    this.dirty = true;
  }

  stop() {
    this.running = false;
    this.pedal = false;
    this.hold = false;
    this.freezeAngle = false;
    this.rpm = 0;
    this.crankDeg = 0;
    this.dirty = true;
  }

  /** One still frame at a chosen rpm and crank angle. */
  snapshot(rpm: number, crankDeg: number) {
    this.running = true;
    this.hold = true;
    this.freezeAngle = true;
    this.rpm = rpm;
    this.crankDeg = crankDeg;
    this.dirty = true;
  }

  /**
   * Advance. Teardown and explode force a stop so the static mesh is what gets pulled apart.
   * Returns true while the pose must be redrawn.
   */
  tick(dt: number, step: number, explode: number): boolean {
    if (this.running && (step !== 0 || explode > 0.001)) this.stop();
    if (!this.running) {
      const drew = this.dirty;
      this.dirty = false;
      return drew;
    }
    if (!this.hold) {
      const target = this.pedal ? REDLINE_RPM : IDLE_RPM;
      const tau = target >= this.rpm ? TAU_UP : TAU_DOWN;
      this.rpm += (target - this.rpm) * (1 - Math.exp(-dt / tau));
    }
    if (!this.freezeAngle) this.crankDeg += this.rpm * 6 * dt;
    return true;
  }
}
