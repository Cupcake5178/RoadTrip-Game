import { describe, expect, it } from 'vitest';
import * as T from 'three';
import { CollisionIndex, type Obstacle } from '../../src/collision';
import { FollowCamera } from '../../src/follow-camera';

function box(
  id: string,
  x: number,
  y: number,
  z: number,
  hx: number,
  hy: number,
  hz: number,
  yaw = 0,
): Obstacle {
  return {
    id,
    center: new T.Vector3(x, y, z),
    half: new T.Vector3(hx, hy, hz),
    rotation: new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw),
    kind: 'box',
    surface: 'wood',
  };
}
describe('visible-world collision and camera sweeps', () => {
  it('stops a fast movement at a thin fence and allows sliding along it', () => {
    const index = new CollisionIndex();
    index.add(box('fence', 0, 1, -2, 5, 1, 0.06));
    const end = index.moveCircle(new T.Vector3(0, 1, 2), new T.Vector3(2, 1, -6), 0.3);
    expect(end.z).toBeGreaterThan(-1.65);
    expect(end.x).toBeGreaterThan(1.8);
  });
  it('resolves rotated objects and corners without a giant axis-aligned blocker', () => {
    const index = new CollisionIndex();
    index.add(box('rotated', 0, 1, 0, 2, 1, 0.1, Math.PI / 4));
    const clear = index.moveCircle(new T.Vector3(1.5, 1, 1.5), new T.Vector3(2.5, 1, 1.5), 0.25);
    expect(clear.x).toBeCloseTo(2.5);
    expect(clear.z).toBeCloseTo(1.5);
    const blocked = index.moveCircle(new T.Vector3(0, 1, 3), new T.Vector3(0, 1, -3), 0.3);
    expect(Math.hypot(blocked.x, blocked.z)).toBeGreaterThan(0.3);
  });
  it('respects vertical clearance under a canopy and over a low obstacle', () => {
    const index = new CollisionIndex();
    index.add(box('roof', 0, 4, 0, 3, 0.2, 3));
    expect(index.sweep(new T.Vector3(0, 1, 4), new T.Vector3(0, 1, -4), 0.2)).toBe(1);
    expect(index.sweep(new T.Vector3(0, 3, 0), new T.Vector3(0, 6, 0), 0.2)).toBeLessThan(0.3);
    expect(index.moveCircle(new T.Vector3(0, 1, 4), new T.Vector3(0, 1, -4), 0.3).z).toBeCloseTo(
      -4,
    );
  });
  it('includes nearby moving cars and ignores the tracked car when required', () => {
    const index = new CollisionIndex();
    index.dynamic.set('vehicle', box('vehicle', 0, 1, 0, 1, 1, 2));
    const from = new T.Vector3(0, 1, 4),
      to = new T.Vector3(0, 1, -4);
    expect(index.sweep(from, to, 0.2)).toBeLessThan(0.25);
    expect(index.sweep(from, to, 0.2, 'vehicle')).toBe(1);
  });
  it('keeps an orbit camera outside walls during zoom and corner changes', () => {
    const index = new CollisionIndex();
    index.add(box('wall', 0, 1.5, 2, 5, 1.5, 0.15));
    const camera = new T.PerspectiveCamera();
    const follow = new FollowCamera();
    const focus = new T.Vector3(0, 1.5, 0);
    follow.update(camera, focus, 0, -0.1, 0.016, index, () => 0);
    expect(follow.obstruction).toBe(true);
    expect(camera.position.z).toBeLessThan(1.65);
    for (let i = 0; i < 20; i++)
      follow.update(camera, focus, i * 0.05, -0.1, 0.016, index, () => 0);
    expect(index.sweep(focus, camera.position, 0.22)).toBeGreaterThan(0.98);
  });
});
