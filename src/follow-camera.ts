import * as T from 'three';
import type { CollisionIndex } from './collision';

export class FollowCamera {
  distance = 4.3;
  initialized = false;
  eye = new T.Vector3();
  target = new T.Vector3();
  obstruction = false;
  reset() {
    this.initialized = false;
  }
  update(
    camera: T.PerspectiveCamera,
    focus: T.Vector3,
    yaw: number,
    pitch: number,
    dt: number,
    collisions: CollisionIndex,
    floor: (x: number, z: number) => number,
    distance = this.distance,
    ignore?: string,
  ) {
    const direction = new T.Vector3(
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    );
    const right = new T.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const desired = focus
      .clone()
      .addScaledVector(direction, -distance)
      .addScaledVector(right, 0.35);
    desired.y += 0.28;
    let fraction = collisions.sweep(focus, desired, 0.23, ignore);
    const difference = desired.clone().sub(focus);
    for (let t = 0.05; t <= fraction; t += 0.05) {
      const point = focus.clone().addScaledVector(difference, t);
      if (point.y < floor(point.x, point.z) + 0.24) {
        fraction = Math.max(0.04, t - 0.05);
        break;
      }
    }
    this.obstruction = fraction < 0.99;
    const safe = focus.clone().addScaledVector(difference, fraction);
    if (!this.initialized || this.obstruction) this.eye.copy(safe);
    else this.eye.lerp(safe, 1 - Math.exp(-dt * 12));
    // Sweep the smoothed position as well: moving round a corner must never cut through it.
    const smoothFraction = collisions.sweep(focus, this.eye, 0.23, ignore);
    const resolved = this.eye.clone();
    this.eye.copy(focus).lerp(resolved, smoothFraction);
    camera.position.copy(this.eye);
    this.target.copy(focus).addScaledVector(direction, 3.5);
    camera.lookAt(this.target);
    this.initialized = true;
  }
}
