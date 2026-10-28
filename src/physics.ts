import RAPIER from '@dimforge/rapier3d-compat';
import * as T from 'three';
import type { World } from './world';
import type { ItemId } from './state';

export class Physics {
  world!: RAPIER.World;
  bodies = new Map<ItemId, RAPIER.RigidBody>();
  accumulator = 0;
  async init(environment: World) {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const geo = environment.ground.geometry;
    const desc = RAPIER.ColliderDesc.trimesh(
      new Float32Array(geo.attributes.position.array),
      new Uint32Array(geo.index!.array),
    );
    this.world.createCollider(desc.setFriction(0.85).setRestitution(0.12));
  }
  drop(id: ItemId, object: T.Object3D, position: T.Vector3, velocity = new T.Vector3()) {
    this.remove(id);
    object.position.copy(position);
    object.rotation.set(0, 0, 0);
    object.visible = true;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y + 0.3, position.z)
        .setLinearDamping(0.5)
        .setAngularDamping(0.9)
        .setCcdEnabled(true),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.3, 0.27, 0.25).setMass(2).setFriction(0.7).setRestitution(0.25),
      body,
    );
    body.setLinvel(velocity, true);
    body.setAngvel({ x: 0.4, y: 0.7, z: 0.2 }, true);
    this.bodies.set(id, body);
  }
  remove(id: ItemId) {
    const body = this.bodies.get(id);
    if (body) {
      this.world.removeRigidBody(body);
      this.bodies.delete(id);
    }
  }
  update(dt: number, objects: Map<ItemId, T.Group>) {
    this.accumulator = Math.min(this.accumulator + dt, 0.1);
    while (this.accumulator >= 1 / 60) {
      this.world.step();
      this.accumulator -= 1 / 60;
    }
    for (const [id, body] of this.bodies) {
      const obj = objects.get(id);
      if (!obj) continue;
      const t = body.translation(),
        r = body.rotation();
      obj.position.set(t.x, t.y - 0.27, t.z);
      obj.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }
  reset() {
    for (const id of this.bodies.keys()) this.remove(id);
  }
}
