import RAPIER from '@dimforge/rapier3d-compat';
import * as T from 'three';
import type { World } from './world';
import type { Obstacle } from './collision';

export class Physics {
  world!: RAPIER.World;
  bodies = new Map<string, RAPIER.RigidBody>();
  offsets = new Map<string, T.Vector3>();
  player!: RAPIER.RigidBody;
  playerCollider!: RAPIER.Collider;
  controller!: RAPIER.KinematicCharacterController;
  car!: RAPIER.RigidBody;
  npcBodies = new Map<string, RAPIER.RigidBody>();
  grounded = true;
  tent: RAPIER.Collider[] = [];
  onImpact?: (id: string, strength: number) => void;
  private velocities = new Map<string, T.Vector3>();
  private time = 0;
  private lastImpact = 0;
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
    for (const obstacle of environment.collision.obstacles) this.addObstacle(obstacle);
    this.player = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    this.playerCollider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(0.5, 0.3).setFriction(0),
      this.player,
    );
    this.controller = this.world.createCharacterController(0.025);
    this.controller.enableAutostep(0.32, 0.2, false);
    this.controller.enableSnapToGround(0.22);
    this.controller.setMaxSlopeClimbAngle(Math.PI / 3);
    this.controller.setMinSlopeSlideAngle(Math.PI / 2.8);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setCharacterMass(55);
    this.car = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(1.16, 0.76, 2.4).setTranslation(0, 1.15, 0),
      this.car,
    );
    this.world.step();
  }
  addObstacle(o: Obstacle) {
    const shape =
      o.kind === 'ball'
        ? RAPIER.ColliderDesc.ball(Math.max(o.half.x, o.half.y, o.half.z))
        : o.kind === 'cylinder'
          ? RAPIER.ColliderDesc.cylinder(o.half.y, Math.max(o.half.x, o.half.z))
          : RAPIER.ColliderDesc.cuboid(o.half.x, o.half.y, o.half.z);
    return this.world.createCollider(
      shape
        .setTranslation(o.center.x, o.center.y, o.center.z)
        .setRotation(o.rotation)
        .setFriction(0.8),
    );
  }
  syncVehicle(object: T.Object3D) {
    const previous = this.car.translation();
    if (Math.hypot(previous.x - object.position.x, previous.z - object.position.z) > 6) {
      this.car.setTranslation(object.position, true);
      this.car.setRotation(object.quaternion, true);
    }
    this.car.setNextKinematicTranslation(object.position);
    this.car.setNextKinematicRotation(object.quaternion);
  }
  syncTent(root: T.Group, enabled: boolean) {
    if (enabled && !this.tent.length) {
      root.updateMatrixWorld(true);
      root.traverse((object) => {
        if (!(object instanceof T.Mesh)) return;
        const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
        const vertices = new Float32Array(geometry.attributes.position.array);
        const indices = geometry.index
          ? new Uint32Array(geometry.index.array)
          : new Uint32Array(Array.from({ length: vertices.length / 3 }, (_, i) => i));
        this.tent.push(
          this.world.createCollider(
            RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(0.9),
          ),
        );
        geometry.dispose();
      });
    }
    for (const collider of this.tent) collider.setEnabled(enabled);
  }
  syncNPC(id: string, position: T.Vector3, enabled = true) {
    if (!this.npcBodies.has(id)) {
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
      this.world.createCollider(RAPIER.ColliderDesc.capsule(0.38, 0.29), body);
      this.npcBodies.set(id, body);
    }
    const body = this.npcBodies.get(id)!;
    body.setEnabled(enabled);
    if (enabled) body.setTranslation({ x: position.x, y: position.y + 0.7, z: position.z }, true);
  }
  movePlayer(position: T.Vector3, delta: T.Vector3) {
    this.player.setEnabled(true);
    this.player.setTranslation({ x: position.x, y: position.y + 0.825, z: position.z }, true);
    this.world.propagateModifiedBodyPositionsToColliders();
    this.controller.computeColliderMovement(this.playerCollider, delta);
    const actual = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();
    const result = position.clone().add(new T.Vector3(actual.x, actual.y, actual.z));
    this.player.setNextKinematicTranslation({ x: result.x, y: result.y + 0.825, z: result.z });
    return {
      position: result,
      grounded: this.grounded,
      collisions: this.controller.numComputedCollisions(),
    };
  }
  canStandAt(position: T.Vector3) {
    this.world.propagateModifiedBodyPositionsToColliders();
    return !this.world.intersectionWithShape(
      { x: position.x, y: position.y + 0.825, z: position.z },
      { x: 0, y: 0, z: 0, w: 1 },
      new RAPIER.Capsule(0.5, 0.32),
      undefined,
      undefined,
      this.playerCollider,
      this.car,
    );
  }
  drop(id: string, object: T.Object3D, position: T.Vector3, velocity = new T.Vector3()) {
    this.remove(id);
    object.position.copy(position);
    object.rotation.set(0, 0, 0);
    object.visible = true;
    object.updateMatrixWorld(true);
    const bounds = new T.Box3().setFromObject(object);
    const half = bounds.getSize(new T.Vector3()).multiplyScalar(0.5).clampScalar(0.07, 0.65);
    const center = bounds.getCenter(new T.Vector3());
    this.offsets.set(id, center.clone().sub(position));
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(center.x, center.y + 0.04, center.z)
        .setLinearDamping(0.5)
        .setAngularDamping(0.9)
        .setCcdEnabled(true),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
        .setMass(id.startsWith('prop:') ? 0.4 : 2)
        .setFriction(0.6)
        .setRestitution(0.3),
      body,
    );
    body.setLinvel(velocity, true);
    this.velocities.set(id, velocity.clone());
    body.setAngvel({ x: 0.4, y: 0.7, z: 0.2 }, true);
    this.bodies.set(id, body);
  }
  remove(id: string) {
    const body = this.bodies.get(id);
    if (body) {
      this.world.removeRigidBody(body);
      this.bodies.delete(id);
      this.offsets.delete(id);
      this.velocities.delete(id);
    }
  }
  update(dt: number, objects: Map<string, T.Group>) {
    this.time += dt;
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
      const velocity = body.linvel(),
        current = new T.Vector3(velocity.x, velocity.y, velocity.z),
        previous = this.velocities.get(id);
      if (
        previous &&
        previous.length() > 1.2 &&
        previous.distanceTo(current) > 2 &&
        this.time - this.lastImpact > 0.14
      ) {
        this.lastImpact = this.time;
        this.onImpact?.(id, previous.distanceTo(current));
      }
      this.velocities.set(id, current);
      obj.quaternion.set(r.x, r.y, r.z, r.w);
      const offset = (this.offsets.get(id) ?? new T.Vector3())
        .clone()
        .applyQuaternion(obj.quaternion);
      obj.position.set(t.x - offset.x, t.y - offset.y, t.z - offset.z);
    }
  }
  reset() {
    for (const id of this.bodies.keys()) this.remove(id);
  }
}
