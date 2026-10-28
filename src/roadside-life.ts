import * as T from 'three';
import type { World } from './world';
import { animateCharacter, createCharacter } from './character';
import { box, cylinder, label, sphere, lineTube } from './models';
import { roadPoint, roadX, roadY, terrainHeight, STOPS } from './route';

export class RoadsideLife {
  people = new Map<
    string,
    { root: T.Group; name: string; lines: string[]; count: number; wave: number }
  >();
  seats = new Map<string, { position: T.Vector3; yaw: number }>();
  props = new Map<string, T.Group>();
  birds = new T.Group();
  deer = new T.Group();
  deerS = 1810;
  constructor(public world: World) {
    this.buildStops();
    this.buildRoadDetails();
  }
  private place(object: T.Object3D, x: number, z: number, yaw = 0) {
    return this.world.place(object, x, z, yaw);
  }
  private prop(id: string, object: T.Group, x: number, z: number) {
    object.userData.dynamic = true;
    this.place(object, x, z);
    object.userData.home = object.position.clone();
    this.props.set(id, object);
    this.world.physicsObjects.set(id, object);
    this.world.addTarget(
      `junk:${id}`,
      object.position.clone().add(new T.Vector3(0, 0.2, 0)),
      object.userData.title ?? 'Pick up a little roadside treasure',
      2.7,
      object,
      id,
    );
  }
  private mug(color: string) {
    const g = new T.Group();
    cylinder(g, 0.14, 0.27, [0, 0.15, 0], color, 0.14, 12);
    const handle = new T.Mesh(
      new T.TorusGeometry(0.1, 0.028, 6, 12),
      new T.MeshStandardMaterial({ color }),
    );
    handle.position.set(0.16, 0.17, 0);
    g.add(handle);
    g.userData.title = 'Pick up the outrageously large tea mug';
    return g;
  }
  private npc(
    id: string,
    name: string,
    s: number,
    offset: number,
    dz: number,
    color: string,
    seed: number,
    lines: string[],
  ) {
    const root = createCharacter(seed, color);
    this.place(root, roadX(s) + offset, -s + dz, Math.PI * 0.2);
    this.people.set(id, { root, name, lines, count: 0, wave: 0 });
    this.world.addTarget(
      `npc:${id}`,
      root.position.clone().add(new T.Vector3(0, 1.25, 0)),
      `Say hello to ${name}`,
      3,
      root,
      id,
    );
  }
  private bench(id: string, s: number, offset: number, dz: number, yaw = 0) {
    const g = new T.Group();
    box(g, [2.3, 0.13, 0.65], [0, 0.5, 0], '#b49162');
    box(g, [2.3, 0.57, 0.12], [0, 0.88, 0.3], '#b49162');
    for (const x of [-0.9, 0.9])
      for (const z of [-0.21, 0.21]) box(g, [0.12, 0.5, 0.12], [x, 0.25, z], '#5b7462');
    this.place(g, roadX(s) + offset, -s + dz, yaw);
    this.seats.set(id, { position: g.position.clone().add(new T.Vector3(0, 0.04, 0)), yaw });
    this.world.addTarget(
      `seat:${id}`,
      g.position.clone().add(new T.Vector3(0, 0.8, -0.1)),
      'Sit for a little while',
      3.2,
      g,
      id,
    );
  }
  private vending(s: number, offset: number, dz: number) {
    const g = new T.Group();
    box(g, [1.25, 2.15, 0.8], [0, 1.08, 0], '#b96f52', 0.13);
    box(g, [0.8, 1.22, 0.06], [-0.12, 1.35, 0.43], '#45695f');
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 3; x++)
        cylinder(
          g,
          0.073,
          0.22,
          [-0.35 + x * 0.23, 1.73 - y * 0.35, 0.48],
          ['#d4ba70', '#8bb5ad', '#d3a180'][x],
          0.073,
          8,
        );
    for (let y = 0; y < 3; y++) box(g, [0.1, 0.09, 0.06], [0.48, 1.63 - y * 0.2, 0.44], '#ead6a8');
    box(g, [0.6, 0.17, 0.1], [0, 0.4, 0.45], '#344a40');
    const text = label('TRAIL TREATS', 1.05, 0.23);
    text.position.set(0, 2.03, 0.42);
    g.add(text);
    this.place(g, roadX(s) + offset, -s + dz);
    this.world.addTarget(
      `vending:${s}`,
      g.position.clone().add(new T.Vector3(0, 1.35, 0.5)),
      'Trail treats · $3',
      3,
      g,
    );
  }
  private parked(s: number, offset: number, dz: number, color: string) {
    const g = new T.Group();
    box(g, [2.15, 0.65, 4.25], [0, 1, 0], color, 0.17);
    box(g, [1.85, 0.8, 2.3], [0, 1.7, 0.3], '#739b97', 0.15);
    box(g, [1.99, 0.12, 2.55], [0, 2.13, 0.3], '#e9d5ab');
    for (const x of [-1.05, 1.05])
      for (const z of [-1.35, 1.35]) {
        const w = cylinder(g, 0.45, 0.28, [x, 0.48, z], '#34473c', 0.45, 12);
        w.rotation.z = Math.PI / 2;
        const hub = cylinder(g, 0.23, 0.3, [x, 0.48, z], '#d6cba8', 0.23, 10);
        hub.rotation.z = Math.PI / 2;
      }
    for (const x of [-0.72, 0.72]) box(g, [0.4, 0.24, 0.07], [x, 1.03, -2.16], '#f3d99b');
    this.place(g, roadX(s) + offset, -s + dz, Math.PI * 0.85);
  }
  buildStops() {
    const roofMug = this.mug('#d7b36e');
    roofMug.userData.title = 'Rescue the travel mug from the roof';
    this.prop('prop:roof-mug', roofMug, 11, 9);
    this.bench('home', 0, 25, 17, -0.4);
    this.bench('lake', 2250, -24, 14, -Math.PI / 2);
    this.bench('camp', 4300, 21, 9, 0.4);
    this.bench('town', 5550, 18, 4, 0.2);
    this.bench('summit', 7140, -24, -7, -Math.PI / 2);
    this.vending(1100, 23, -8);
    this.vending(4300, 41, -16);
    this.parked(1100, 36, 13, '#83a29b');
    this.parked(4300, 12, -13, '#d1aa68');
    this.parked(5550, -17, 4, '#b8816e');
    this.npc('sol', 'Sol', 1100, 35, -12, '#c78f60', 45, [
      'The good snacks are on the middle shelf. The emergency snacks are also on the middle shelf.',
      'Your wagon has character. That is what we call mysterious rattles around here.',
      'If the machine eats a coin, ask it politely. It has feelings. Probably.',
    ]);
    this.npc('fern', 'Ranger Fern', 4300, 42, -12, '#8c9d70', 83, [
      'Pitch, fire, supper, stars. In that order. The stars are complimentary.',
      'The raccoon is not a ranger. Please stop asking him for directions.',
      'The fire stays in its stone ring. The stories can wander a little.',
    ]);
    this.npc('otis', 'Otis', 5550, 18, 18, '#879aad', 92, [
      'Largest teapot in the valley. Smallest washing-up team.',
      'The ridge is just up the road. Take your time. It has been there for ages.',
      'We tried a giant biscuit. The birds had other plans.',
    ]);
    let index = 0;
    for (const [s, offset, dz] of [
      [0, 24, 10],
      [1100, 43, 4],
      [2250, -21, -11],
      [4300, 32, 8],
      [5550, 27, 18],
    ] as const) {
      const mug = this.mug(index % 2 ? '#d8ad66' : '#82aaa0');
      this.prop(`prop:mug${index}`, mug, roadX(s) + offset, -s + dz);
      index++;
      const can = new T.Group();
      cylinder(can, 0.1, 0.28, [0, 0.15, 0], '#d0b36c', 0.1, 10);
      box(can, [0.12, 0.09, 0.012], [0, 0.16, -0.101], '#eeead0');
      can.userData.title = 'Pick up the last fizzy lemonade';
      this.prop(`prop:can${index}`, can, roadX(s) + offset + 1, -s + dz + 1);
    }
    const ball = new T.Group();
    sphere(ball, 0.23, [0, 0.24, 0], '#ce9461');
    ball.userData.title = 'Pick up the suspiciously round souvenir';
    this.prop('prop:souvenir', ball, roadX(5550) + 22, -5550 + 11);
    for (const s of [1100, 4300, 5550]) {
      const crate = new T.Group();
      box(crate, [0.85, 0.7, 0.7], [0, 0.35, 0], '#b79b68');
      for (const x of [-0.3, 0.3]) box(crate, [0.08, 0.73, 0.74], [x, 0.36, 0], '#d5bb83');
      this.place(crate, roadX(s) + 45, -s + 7);
      const poster = label(
        s === 4300 ? 'NO WIFI. TRY CLOUD WATCHING.' : 'PLEASE PARK MOSTLY BETWEEN THE LINES.',
        4.2,
        0.6,
        '#59745f',
        '#f2deb2',
      );
      poster.position.copy(roadPoint(s - 25, 9)).add(new T.Vector3(0, 2.3, 0));
      this.world.scene.add(poster);
    }
    // Shallow, visible steps onto both overlooks rather than an invisible elevation snap.
    for (let i = 0; i < 3; i++)
      box(
        this.world.scene,
        [0.8, 0.18 * (i + 1), 3],
        [roadX(2250) - 26.5 - i * 0.7, roadY(2250) - 0.06 + 0.09 * (i + 1), -2250],
        '#b8a47d',
      );
    box(this.world.scene, [1, 0.19, 3], [roadX(7140) - 29, roadY(7140) + 0.02, -7140], '#b8a47d');
  }
  buildRoadDetails() {
    for (let s = 80; s < 7100; s += 230) {
      const x = roadX(s) + 17;
      const g = new T.Group();
      cylinder(g, 0.13, 8, [0, 4, 0], '#8b7858', 0.1, 6);
      box(g, [2.7, 0.13, 0.14], [0, 7.2, 0], '#9c8b65');
      this.place(g, x, -s);
      if (s < 6870) {
        const end = roadPoint(s + 230, 17);
        for (const side of [-1, 1]) {
          const wire = lineTube(
            this.world.scene,
            [
              new T.Vector3(x + side, roadY(s) + 7.2, -s),
              new T.Vector3((x + end.x) / 2 + side, (roadY(s) + end.y) / 2 + 5, -s - 115),
              new T.Vector3(end.x + side, end.y + 7.2, end.z),
            ],
            0.025,
            '#697c6c',
          );
          wire.userData.noCollision = true;
        }
      }
    }
    this.birds.userData.dynamic = true;
    for (let i = 0; i < 5; i++) {
      const bird = new T.Group();
      sphere(bird, 0.15, [0, 0, 0], '#647c72', 0);
      for (const side of [-1, 1]) {
        const wing = box(bird, [0.55, 0.035, 0.2], [side * 0.28, 0, 0], '#647c72', 0.01);
        wing.name = `wing${side}`;
      }
      bird.position.set(i * 2, Math.sin(i) * 2, i * 1.3);
      this.birds.add(bird);
    }
    this.world.scene.add(this.birds);
    this.deer.userData.dynamic = true;
    const g = this.deer;
    const body = sphere(g, 0.55, [0, 0.85, 0], '#b69570');
    body.scale.set(0.6, 0.8, 1.2);
    for (const x of [-0.2, 0.2])
      for (const z of [-0.35, 0.35]) box(g, [0.12, 0.65, 0.12], [x, 0.37, z], '#9e815e');
    const neck = box(g, [0.24, 0.58, 0.25], [0, 1.25, -0.42], '#b69570');
    neck.rotation.x = -0.35;
    sphere(g, 0.25, [0, 1.62, -0.56], '#c4a482');
    for (const x of [-0.14, 0.14]) {
      const ear = sphere(g, 0.12, [x, 1.88, -0.5], '#a78662');
      ear.scale.set(0.5, 1.4, 0.4);
      sphere(g, 0.027, [x, 1.68, -0.75], '#354b3f');
    }
    this.place(g, roadX(this.deerS) - 11, -this.deerS, Math.PI / 2);
  }
  talk(id: string) {
    const p = this.people.get(id)!;
    p.wave = 3;
    return { name: p.name, text: p.lines[p.count++ % p.lines.length] };
  }
  update(time: number, dt: number, viewer: T.Vector3) {
    for (const [id, p] of this.people) {
      p.root.visible = p.root.position.distanceTo(viewer) < 220;
      if (!p.root.visible) continue;
      const target = this.world.targets.find((t) => t.id === `npc:${id}`);
      if (target) target.position.copy(p.root.position).add(new T.Vector3(0, 1.25, 0));
      p.wave = Math.max(0, p.wave - dt);
      animateCharacter(p.root, time, dt, { action: p.wave > 0 ? 0.4 : 0 });
      if (p.wave > 0)
        p.root.rotation.y = Math.atan2(p.root.position.x - viewer.x, p.root.position.z - viewer.z);
    }
    this.birds.position.copy(viewer).add(new T.Vector3(Math.sin(time * 0.08) * 75, 35, -110));
    this.birds.rotation.y = time * 0.08;
    this.birds.children.forEach((bird, i) =>
      bird.children.forEach((wing, j) => {
        if (j) wing.rotation.z = Math.sin(time * 5 + i) * (j % 2 ? 1 : -1) * 0.45;
      }),
    );
    this.deer.visible = Math.abs(viewer.z + this.deerS) < 320;
    const cycle = time % 85;
    const x = cycle < 9 ? -11 + cycle * 2.7 : 13;
    this.deer.position.set(
      roadX(this.deerS) + x,
      terrainHeight(roadX(this.deerS) + x, -this.deerS) +
        Math.abs(Math.sin(time * 5)) * (cycle < 9 ? 0.08 : 0),
      -this.deerS,
    );
  }
}
