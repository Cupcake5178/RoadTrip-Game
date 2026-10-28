import * as T from 'three';
import { type Wagon, wagon, itemModel, box, sphere } from './models';
import { roadX, roadY, roadHeading, terrainHeight, clamp } from './route';
import type { Save } from './state';
import type { World } from './world';
import type { Input } from './input';

export class Vehicle {
  model: Wagon;
  steam = new T.Group();
  speed = 0;
  steer = 0;
  wheelSpin = 0;
  headlights = false;
  doorOpen = false;
  hoodOpen = false;
  trunkOpen = true;
  bodyRoll = 0;
  packedKey = '';
  impactCooldown = 0;
  onImpact?: (force: number) => void;
  constructor(
    public world: World,
    save: Save,
  ) {
    this.model = wagon(save.vehicle.paint);
    this.model.root.userData.dynamic = true;
    world.scene.add(this.model.root);
    this.sync(save);
    const paint = new T.Color(save.vehicle.paint);
    this.model.root.traverse((o) => {
      if (
        o instanceof T.Mesh &&
        o.material instanceof T.MeshStandardMaterial &&
        o.material.color.equals(paint)
      ) {
        o.material = o.material.clone();
        o.userData.vehiclePaint = true;
      }
    });
    for (let i = 0; i < 6; i++) {
      const puff = sphere(this.steam, 0.16, [0, 0, 0], '#e8e5d3');
      puff.castShadow = false;
      puff.material = new T.MeshStandardMaterial({
        color: '#e8e5d3',
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      });
    }
    this.model.root.add(this.steam);
  }
  paint(color: string) {
    this.model.root.traverse((o) => {
      if (o instanceof T.Mesh && o.userData.vehiclePaint)
        (o.material as T.MeshStandardMaterial).color.set(color);
    });
  }
  sync(save: Save) {
    const v = save.vehicle;
    this.model.root.position.set(v.x, terrainHeight(v.x, v.z), v.z);
    this.model.root.rotation.y = v.yaw;
    this.speed = 0;
    this.trunkOpen = save.mode === 'walking' && !save.trip.departed;
    this.packedKey = '';
    this.updateCargo(save);
  }
  updateCargo(save: Save) {
    const key = save.trip.packed.join() + save.trip.roofSecured;
    if (key === this.packedKey) return;
    this.packedKey = key;
    this.model.cargo.clear();
    save.trip.packed.forEach((id, i) => {
      const obj = itemModel(id);
      obj.scale.setScalar(0.7);
      obj.position.set(
        (i % 2 ? 1 : -1) * 0.44,
        Math.floor(i / 4) * 0.38,
        (Math.floor(i / 2) % 2) * 0.8 - 0.4,
      );
      this.model.cargo.add(obj);
    });
    if (save.trip.roofSecured && save.trip.packed.length)
      for (const z of [-0.6, 0.6])
        box(this.model.cargo, [1.9, 0.055, 0.065], [0, 0.87, z], '#e9bf67', 0.015);
  }
  update(dt: number, save: Save, input: Input, driving: boolean) {
    const v = save.vehicle;
    this.impactCooldown = Math.max(0, this.impactCooldown - dt);
    const s = -v.z,
      offset = Math.abs(v.x - roadX(s));
    const dirt = offset > 5.2,
      shortcut = save.trip.route === 'shortcut' && s > 3100 && s < 4140;
    const rain = save.trip.weather === 'rain';
    const throttle = driving
      ? Number(input.down('KeyW', 'ArrowUp')) - Number(input.down('KeyS', 'ArrowDown'))
      : 0;
    const maxSpeed =
      save.trip.problem === 'flat'
        ? 5.4
        : save.trip.problem === 'heat'
          ? 8
          : save.upgrades.includes('tires')
            ? 25
            : 23;
    let acceleration = throttle * (save.upgrades.includes('tune') ? 7.8 : 6.5);
    if (v.fuel <= 0.01 || v.condition <= 1) acceleration = 0;
    if (throttle * this.speed < 0) acceleration *= 2.5;
    const brake = input.down('Space') && driving;
    const drag =
      (dirt && !shortcut ? 0.9 : 0.22) * this.speed + this.speed * Math.abs(this.speed) * 0.002;
    this.speed +=
      (acceleration - drag - Math.sign(this.speed) * (brake ? 19 : throttle === 0 ? 1 : 0)) * dt;
    if (!throttle && Math.abs(this.speed) < 0.12) this.speed = 0;
    this.speed = clamp(this.speed, -5.5, maxSpeed * (dirt && !shortcut ? 0.62 : rain ? 0.9 : 1));
    const steerInput = driving
      ? Number(input.down('KeyA', 'ArrowLeft')) - Number(input.down('KeyD', 'ArrowRight'))
      : 0;
    this.steer = T.MathUtils.damp(this.steer, steerInput, rain ? 3.5 : 5.5, dt);
    v.yaw += (this.steer * this.speed * 0.047 * dt) / (1 + Math.abs(this.speed) * 0.018);
    const nx = v.x - Math.sin(v.yaw) * this.speed * dt,
      nz = v.z - Math.cos(v.yaw) * this.speed * dt;
    const start = new T.Vector3(v.x, terrainHeight(v.x, v.z) + 1.1, v.z);
    const target = new T.Vector3(nx, terrainHeight(nx, nz) + 1.1, nz);
    for (let pass = 0; pass < 2; pass++)
      for (const side of [-1, 1]) {
        const offset = new T.Vector3(Math.sin(v.yaw) * 1.3 * side, 0, Math.cos(v.yaw) * 1.3 * side);
        const end = this.world.collision.moveCircle(
          start.clone().add(offset),
          target.clone().add(offset),
          1.05,
          0.75,
          'vehicle',
        );
        target.x = end.x - offset.x;
        target.z = end.z - offset.z;
      }
    const corrected = { x: target.x, z: target.z };
    if (
      Math.hypot(corrected.x - nx, corrected.z - nz) > 0.05 &&
      Math.abs(this.speed) > 2 &&
      !this.impactCooldown
    ) {
      const force = Math.abs(this.speed);
      v.condition = Math.max(15, v.condition - force * 0.55);
      this.speed *= -0.18;
      this.impactCooldown = 2;
      this.onImpact?.(force);
    }
    v.x = clamp(corrected.x, -380, 380);
    v.z = clamp(corrected.z, -7320, 110);
    if ((v.x !== corrected.x || v.z !== corrected.z) && Math.abs(this.speed) > 1)
      this.speed *= -0.2;
    const moved = Math.abs(this.speed) * dt;
    save.trip.distance += moved;
    const fuel = driving
      ? moved * (save.upgrades.includes('tune') ? 0.009 : 0.011) + 0.001 * dt
      : 0;
    v.fuel = Math.max(0, v.fuel - fuel);
    save.trip.fuelUsed += fuel;
    if (save.trip.problem === 'heat' && this.speed > 6)
      v.condition = Math.max(15, v.condition - dt * 0.3);
    const y =
      terrainHeight(v.x, v.z) +
      0.12 +
      (save.trip.problem === 'flat' && save.trip.repairStep >= 2 ? 0.24 : 0);
    this.model.root.position.set(v.x, y, v.z);
    this.model.root.rotation.y = v.yaw;
    const frontH = terrainHeight(v.x - Math.sin(v.yaw) * 2, v.z - Math.cos(v.yaw) * 2);
    const backH = terrainHeight(v.x + Math.sin(v.yaw) * 2, v.z + Math.cos(v.yaw) * 2);
    this.model.root.rotation.x = T.MathUtils.damp(
      this.model.root.rotation.x,
      (frontH - backH) / 4,
      4,
      dt,
    );
    this.bodyRoll = T.MathUtils.damp(
      this.bodyRoll,
      -this.steer * this.speed * 0.003 +
        (dirt ? Math.sin(s * 1.5) * Math.min(0.025, Math.abs(this.speed) * 0.003) : 0),
      5,
      dt,
    );
    this.model.root.rotation.z = this.bodyRoll;
    this.model.door.rotation.y = T.MathUtils.damp(
      this.model.door.rotation.y,
      this.doorOpen ? -1.1 : 0,
      7,
      dt,
    );
    this.model.hood.rotation.x = T.MathUtils.damp(
      this.model.hood.rotation.x,
      this.hoodOpen ? -1 : 0,
      7,
      dt,
    );
    this.model.trunk.rotation.x = T.MathUtils.damp(
      this.model.trunk.rotation.x,
      this.trunkOpen ? -1.6 : 0,
      7,
      dt,
    );
    this.wheelSpin += (this.speed * dt) / 0.49;
    this.model.wheels.forEach((wheel, i) => {
      wheel.rotation.x = this.wheelSpin;
      wheel.rotation.y = i % 2 === 0 ? this.steer * 0.3 : 0;
      wheel.scale.y = i === 0 && save.trip.problem === 'flat' ? 0.62 : 1;
    });
    this.steam.visible = save.trip.problem === 'heat';
    this.steam.children.forEach((p, i) => {
      const t = (save.trip.elapsed * 0.6 + i / 6) % 1;
      p.position.set(Math.sin(i * 3 + t * 3) * 0.3, 1.6 + t * 1.7, -1.6);
      p.scale.setScalar(0.3 + t * 1.8);
      ((p as T.Mesh).material as T.MeshStandardMaterial).opacity = (1 - t) * 0.4;
    });
    this.model.steering.rotation.z = this.steer * -0.7;
    this.model.headlights.forEach((l) => (l.intensity = this.headlights ? 45 : 0));
    this.model.cargo.rotation.z =
      !save.trip.roofSecured && this.speed > 5 ? Math.sin(s * 0.7) * 0.07 : 0;
    this.model.passengers.forEach((p, i) => {
      p.rotation.z = Math.sin(save.trip.elapsed * 2 + i) * 0.025 - this.bodyRoll;
    });
    this.updateCargo(save);
  }
  local(x: number, y: number, z: number) {
    return this.model.root.localToWorld(new T.Vector3(x, y, z));
  }
  recover(save: Save) {
    const s = clamp(-save.vehicle.z, 0, 7150);
    save.vehicle.x = roadX(s) + 7.4;
    save.vehicle.z = -s;
    save.vehicle.yaw = roadHeading(s);
    this.sync(save);
  }
}
