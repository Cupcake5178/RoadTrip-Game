import { describe, expect, it } from 'vitest';
import * as T from 'three';
import { Physics } from '../../src/physics';
import { CollisionIndex } from '../../src/collision';
import type { World } from '../../src/world';

async function setup() {
  const ground = new T.Mesh(new T.PlaneGeometry(40, 40, 1, 1).rotateX(-Math.PI / 2));
  const collision = new CollisionIndex();
  collision.add({
    id: 'wall',
    center: new T.Vector3(0, 1, -3),
    half: new T.Vector3(5, 1, 0.2),
    rotation: new T.Quaternion(),
    kind: 'box',
    surface: 'wood',
  });
  const physics = new Physics();
  await physics.init({ ground, collision } as unknown as World);
  const car = new T.Group();
  car.position.set(30, 0, 30);
  physics.syncVehicle(car);
  physics.world.step();
  return physics;
}
describe('capsule controller and physical cargo', () => {
  it('rejects exit positions inside walls or people while allowing clear ground', async () => {
    const physics = await setup();
    physics.syncNPC('traveler', new T.Vector3(4, 0, 0));
    physics.world.step();
    expect(physics.canStandAt(new T.Vector3(0, 0.06, 0))).toBe(true);
    expect(physics.canStandAt(new T.Vector3(0, 0.06, -3))).toBe(false);
    expect(physics.canStandAt(new T.Vector3(4, 0.06, 0))).toBe(false);
    physics.world.free();
  });
  it('keeps walking and jumping outside a solid wall and above terrain', async () => {
    const physics = await setup();
    let position = new T.Vector3(0, 0.15, 0);
    for (let i = 0; i < 110; i++) {
      const delta = new T.Vector3(0, i > 50 && i < 60 ? 0.09 : -0.09, -0.08);
      position = physics.movePlayer(position, delta).position;
      physics.update(1 / 60, new Map());
    }
    expect(position.z).toBeGreaterThan(-2.51);
    expect(position.y).toBeGreaterThan(-0.05);
    expect(physics.grounded).toBe(true);
    physics.world.free();
  });
  it('makes a thrown object hit a wall and settle on terrain', async () => {
    const physics = await setup();
    physics.player.setEnabled(false);
    const object = new T.Group();
    const cube = new T.Mesh(new T.BoxGeometry(0.4, 0.4, 0.4));
    cube.position.y = 0.2;
    object.add(cube);
    physics.drop('test', object, new T.Vector3(0, 1, 0), new T.Vector3(0, 0, -8));
    for (let i = 0; i < 240; i++) physics.update(1 / 60, new Map([['test', object]]));
    expect(object.position.z).toBeGreaterThan(-2.65);
    const bottom = new T.Box3().setFromObject(object).min.y;
    expect(bottom).toBeGreaterThan(-0.03);
    expect(bottom).toBeLessThan(0.03);
    physics.world.free();
  });
});
