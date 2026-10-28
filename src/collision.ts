import * as T from 'three';

export type Surface = 'grass' | 'road' | 'gravel' | 'wood' | 'metal';
export interface Obstacle {
  id: string;
  center: T.Vector3;
  half: T.Vector3;
  rotation: T.Quaternion;
  kind: 'box' | 'ball' | 'cylinder';
  surface: Surface;
}

/** A shared, spatially indexed description of visible solid geometry. */
export class CollisionIndex {
  obstacles: Obstacle[] = [];
  private cells = new Map<string, Obstacle[]>();
  private size = 18;
  dynamic = new Map<string, Obstacle>();
  add(obstacle: Obstacle) {
    this.obstacles.push(obstacle);
    const bounds = new T.Box3().setFromCenterAndSize(
      obstacle.center,
      obstacle.half.clone().multiplyScalar(2),
    );
    const matrix = new T.Matrix4().compose(
      obstacle.center,
      obstacle.rotation,
      new T.Vector3(1, 1, 1),
    );
    const local = new T.Box3(obstacle.half.clone().negate(), obstacle.half.clone()).applyMatrix4(
      matrix,
    );
    bounds.copy(local);
    for (
      let x = Math.floor(bounds.min.x / this.size);
      x <= Math.floor(bounds.max.x / this.size);
      x++
    )
      for (
        let z = Math.floor(bounds.min.z / this.size);
        z <= Math.floor(bounds.max.z / this.size);
        z++
      ) {
        const key = `${x}:${z}`;
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key)!.push(obstacle);
      }
  }
  query(x: number, z: number, radius: number) {
    const found = new Set<Obstacle>();
    for (
      let ix = Math.floor((x - radius) / this.size);
      ix <= Math.floor((x + radius) / this.size);
      ix++
    )
      for (
        let iz = Math.floor((z - radius) / this.size);
        iz <= Math.floor((z + radius) / this.size);
        iz++
      )
        for (const obstacle of this.cells.get(`${ix}:${iz}`) ?? []) found.add(obstacle);
    for (const obstacle of this.dynamic.values())
      if (
        Math.hypot(obstacle.center.x - x, obstacle.center.z - z) <
        obstacle.half.length() + radius
      )
        found.add(obstacle);
    return found;
  }
  /** Fraction of an unobstructed camera/interaction sweep, including the camera's radius. */
  sweep(from: T.Vector3, to: T.Vector3, radius: number, ignore?: string) {
    const delta = to.clone().sub(from);
    let fraction = 1;
    const candidates = this.query(
      (from.x + to.x) / 2,
      (from.z + to.z) / 2,
      delta.length() / 2 + radius,
    );
    for (const obstacle of candidates) {
      if (obstacle.id === ignore) continue;
      const inverse = obstacle.rotation.clone().invert();
      const origin = from.clone().sub(obstacle.center).applyQuaternion(inverse);
      const direction = delta.clone().applyQuaternion(inverse);
      const half = obstacle.half.clone().addScalar(radius);
      let near = 0,
        far = fraction;
      for (const axis of ['x', 'y', 'z'] as const) {
        if (Math.abs(direction[axis]) < 1e-7) {
          if (Math.abs(origin[axis]) > half[axis]) {
            far = -1;
            break;
          }
        } else {
          let a = (-half[axis] - origin[axis]) / direction[axis];
          let b = (half[axis] - origin[axis]) / direction[axis];
          if (a > b) [a, b] = [b, a];
          near = Math.max(near, a);
          far = Math.min(far, b);
        }
      }
      if (near <= far && far >= 0 && near < fraction) fraction = Math.max(0, near - 0.025);
    }
    return fraction;
  }
  moveCircle(from: T.Vector3, to: T.Vector3, radius: number, halfHeight = 0.8, ignore?: string) {
    const result = from.clone();
    const delta = to.clone().sub(from);
    const steps = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.z) / 0.22));
    for (let step = 0; step < steps; step++) {
      result.x += delta.x / steps;
      result.z += delta.z / steps;
      for (let pass = 0; pass < 3; pass++)
        for (const o of this.query(result.x, result.z, radius + 0.1)) {
          if (o.id === ignore) continue;
          if (Math.abs(result.y - o.center.y) > o.half.y + halfHeight) continue;
          const yaw = new T.Euler().setFromQuaternion(o.rotation, 'YXZ').y;
          const cosine = Math.cos(yaw),
            sine = Math.sin(yaw);
          const dx = result.x - o.center.x,
            dz = result.z - o.center.z;
          let lx = dx * cosine - dz * sine,
            lz = dx * sine + dz * cosine;
          const hx = o.half.x,
            hz = o.half.z;
          if (o.kind === 'ball' || o.kind === 'cylinder') {
            const distance = Math.hypot(lx, lz),
              limit = Math.max(hx, hz) + radius;
            if (distance >= limit) continue;
            const scale = limit / Math.max(distance, 0.0001);
            lx = distance ? lx * scale : limit;
            lz *= scale;
          } else {
            const qx = Math.max(-hx, Math.min(hx, lx)),
              qz = Math.max(-hz, Math.min(hz, lz));
            const ax = lx - qx,
              az = lz - qz,
              distance = Math.hypot(ax, az);
            if (distance >= radius) continue;
            if (distance > 0.0001) {
              lx = qx + (ax * radius) / distance;
              lz = qz + (az * radius) / distance;
            } else if (hx - Math.abs(lx) < hz - Math.abs(lz))
              lx = Math.sign(lx || 1) * (hx + radius);
            else lz = Math.sign(lz || 1) * (hz + radius);
          }
          result.x = o.center.x + lx * cosine + lz * sine;
          result.z = o.center.z - lx * sine + lz * cosine;
        }
    }
    return result;
  }
}

export function obstacleFromMesh(
  mesh: T.Mesh,
  matrix = mesh.matrixWorld,
  id = mesh.uuid,
): Obstacle | null {
  mesh.geometry.computeBoundingBox();
  const bounds = mesh.geometry.boundingBox;
  if (!bounds) return null;
  const position = new T.Vector3(),
    rotation = new T.Quaternion(),
    scale = new T.Vector3();
  matrix.decompose(position, rotation, scale);
  const center = bounds.getCenter(new T.Vector3()).applyMatrix4(matrix);
  const half = bounds.getSize(new T.Vector3()).multiply(scale).multiplyScalar(0.5);
  half.set(Math.abs(half.x), Math.max(0.025, Math.abs(half.y)), Math.max(0.025, Math.abs(half.z)));
  if (Math.max(half.x, half.y, half.z) < 0.035) return null;
  const type = mesh.geometry.type;
  return {
    id,
    center,
    half,
    rotation,
    kind:
      type === 'CylinderGeometry'
        ? 'cylinder'
        : type === 'SphereGeometry' || type === 'IcosahedronGeometry'
          ? 'ball'
          : 'box',
    surface: mesh.userData.surface ?? 'wood',
  };
}
