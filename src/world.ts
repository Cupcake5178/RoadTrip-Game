import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  assetRegistry,
  loadAsset,
  box,
  cylinder,
  label,
  material,
  mesh,
  picnic,
  broadTree,
  pumpModel,
  sign,
  sphere,
  teapot,
  tentModel,
  itemModel,
} from './models';
import {
  roadPoint,
  roadX,
  roadY,
  terrainHeight,
  seeded,
  smooth,
  STOPS,
  ROUTE_LENGTH,
  clamp,
} from './route';
import { type ItemId, type Save, type Weather } from './state';

export interface Target {
  id: string;
  position: T.Vector3;
  radius: number;
  object?: T.Object3D;
  title: string;
  hint?: string;
  data?: string;
}
export interface Solid {
  x: number;
  z: number;
  hx: number;
  hz: number;
}
export class World {
  scene = new T.Scene();
  targets: Target[] = [];
  solids: Solid[] = [];
  ground!: T.Mesh<T.BufferGeometry>;
  itemObjects = new Map<ItemId, T.Group>();
  sun = new T.DirectionalLight('#ffe2b1', 2.7);
  ambient = new T.HemisphereLight('#cbe3de', '#8c9471', 2.4);
  sky!: T.Mesh<T.SphereGeometry, T.ShaderMaterial>;
  lake!: T.Mesh<T.CircleGeometry, T.ShaderMaterial>;
  fire = new T.Group();
  fireLight = new T.PointLight('#ffb95f', 0, 22, 1.2);
  campTent = tentModel();
  stars!: T.Points;
  rain!: T.Points<T.BufferGeometry, T.PointsMaterial>;
  rainPositions = new Float32Array(1100 * 3);
  raccoon = new T.Group();
  clock = 0;
  weatherMix = 0;
  constructor() {
    this.scene.background = new T.Color('#c9dacf');
    this.scene.fog = new T.Fog('#c9dacf', 110, 760);
    this.scene.add(this.ambient, this.sun);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -45,
      right: 45,
      top: 45,
      bottom: -45,
      near: 1,
      far: 220,
    });
    this.sun.shadow.normalBias = 0.045;
    this.sun.shadow.bias = -0.0002;
    this.scene.add(this.sun.target);
    this.buildSky();
    this.buildTerrain();
    this.buildRoad();
    this.buildNature();
    this.buildStops();
    this.buildRain();
  }
  addTarget(
    id: string,
    position: T.Vector3,
    title: string,
    radius = 3,
    object?: T.Object3D,
    data?: string,
  ) {
    const target = { id, position, title, radius, object, data };
    this.targets.push(target);
    return target;
  }
  place(object: T.Object3D, x: number, z: number, yaw = 0) {
    object.position.set(x, terrainHeight(x, z), z);
    object.rotation.y = yaw;
    this.scene.add(object);
    return object;
  }
  solid(x: number, z: number, hx: number, hz: number) {
    this.solids.push({ x, z, hx, hz });
  }
  buildSky() {
    this.sky = new T.Mesh(
      new T.SphereGeometry(1000, 32, 20),
      new T.ShaderMaterial({
        side: T.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new T.Color('#84b9be') },
          bottom: { value: new T.Color('#f5dfb7') },
        },
        vertexShader:
          'varying vec3 vP; void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:
          'varying vec3 vP;uniform vec3 top;uniform vec3 bottom;void main(){float h=clamp(normalize(vP).y*1.6,0.,1.);gl_FragColor=vec4(mix(bottom,top,pow(h,.65)),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
      }),
    );
    this.scene.add(this.sky);
    const rand = seeded(514);
    const verts = [];
    for (let i = 0; i < 600; i++) {
      const v = new T.Vector3(rand() - 0.5, rand() * 0.65 + 0.15, rand() - 0.5)
        .normalize()
        .multiplyScalar(1200);
      verts.push(v.x, v.y, v.z);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
    this.stars = new T.Points(
      geo,
      new T.PointsMaterial({
        color: '#fff3d6',
        size: 2.2,
        transparent: true,
        opacity: 0,
        fog: false,
      }),
    );
    this.scene.add(this.stars);
    const cloudMat = new T.MeshStandardMaterial({
      color: '#ffefd5',
      roughness: 1,
      flatShading: true,
    });
    const clouds = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), cloudMat, 135);
    const d = new T.Object3D();
    for (let i = 0; i < 135; i++) {
      d.position.set((rand() - 0.5) * 1800, 180 + rand() * 70, -rand() * 7800);
      d.scale.set(25 + rand() * 40, 7 + rand() * 8, 16 + rand() * 18);
      d.updateMatrix();
      clouds.setMatrixAt(i, d.matrix);
    }
    this.scene.add(clouds);
  }
  buildTerrain() {
    const nx = 48,
      nz = 390,
      width = 960,
      length = 7800;
    const geo = new T.PlaneGeometry(width, length, nx, nz);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -3600);
    const pos = geo.attributes.position;
    const colors: number[] = [];
    const green = new T.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        z = pos.getZ(i),
        s = -z;
      pos.setY(i, terrainHeight(x, z));
      const n = Math.sin(x * 0.03 + z * 0.017) * 0.025 + Math.cos(z * 0.031) * 0.025;
      green.set(s < 750 ? '#b3b17b' : s > 6000 ? '#96a088' : '#95a87a');
      green.offsetHSL(n, n * 0.5, n);
      colors.push(green.r, green.g, green.b);
    }
    geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    this.ground = new T.Mesh(
      geo,
      new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }),
    );
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
  }
  ribbon(
    start: number,
    end: number,
    width: number,
    offset: number,
    color: string,
    y = 0.04,
    dash = false,
    shortcut = false,
  ) {
    const vertices: number[] = [];
    for (let s = start; s < end; s += dash ? 14 : 5) {
      const s1 = Math.min(s + (dash ? 5 : 5), end);
      const extra = (v: number) =>
        shortcut ? Math.sin(clamp((v - 3060) / 1080, 0, 1) * Math.PI) * 24 : 0;
      for (const [v, side] of [
        [s, -1],
        [s1, 1],
        [s1, -1],
        [s, -1],
        [s, 1],
        [s1, 1],
      ]) {
        vertices.push(roadX(v) + offset + (side * width) / 2 + extra(v), roadY(v) + y, -v);
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    geo.computeVertexNormals();
    const m = mesh(geo, color);
    m.receiveShadow = true;
    m.castShadow = false;
    this.scene.add(m);
    return m;
  }
  buildRoad() {
    this.ribbon(-120, ROUTE_LENGTH + 130, 12.8, 0, '#c8ba98', -0.015);
    this.ribbon(-120, ROUTE_LENGTH + 130, 9.8, 0, '#66706a', 0.01);
    this.ribbon(-100, ROUTE_LENGTH + 100, 0.12, -4.35, '#e9e2c5', 0.025);
    this.ribbon(-100, ROUTE_LENGTH + 100, 0.12, 4.35, '#e9e2c5', 0.025);
    this.ribbon(-100, ROUTE_LENGTH + 100, 0.14, 0, '#e6c987', 0.025, true);
    this.ribbon(3060, 4140, 5.2, 0, '#ac9572', 0.045, false, true);
    for (let s = 2800; s < ROUTE_LENGTH; s += 18) {
      if (STOPS.some((stop) => Math.abs(stop.s - s) < 80)) continue;
      for (const side of [-1, 1]) {
        if (side === 1 && s > 3030 && s < 4170) continue;
        const p = roadPoint(s, side * 6.8);
        box(this.scene, [0.12, 1.05, 0.12], [p.x, p.y + 0.5, p.z], '#b5bcaa', 0.015).castShadow =
          false;
        const next = roadPoint(s + 18, side * 6.8);
        const rail = box(
          this.scene,
          [0.1, 0.19, p.distanceTo(next)],
          [p.x, p.y + 0.8, p.z - 9],
          '#e0d8bb',
          0.015,
        );
        rail.rotation.y = -Math.atan2(next.x - p.x, 18);
        rail.castShadow = false;
      }
    }
    for (let s = 160; s < ROUTE_LENGTH; s += 260) {
      const marker = sign(`${(s / 1000).toFixed(1)} km  ·  SUNRISE RIDGE ↑`, 3.8);
      this.place(marker, roadX(s) + 8, -s, -0.2);
    }
  }
  buildNature() {
    const rand = seeded(7152);
    const d = new T.Object3D();
    const count = 2100;
    const trunks = new T.InstancedMesh(
      new T.CylinderGeometry(0.2, 0.3, 2.7, 5),
      material('#89725b'),
      count,
    );
    const leaves = new T.InstancedMesh(
      new T.ConeGeometry(1.7, 4, 7),
      material('#4c7760'),
      count * 2,
    );
    const rocks = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), material('#acb2a0'), 550);
    for (const obj of [trunks, leaves, rocks]) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      this.scene.add(obj);
    }
    for (let i = 0; i < count; i++) {
      const s = rand() * 7700 - 170,
        side = rand() < 0.5 ? -1 : 1;
      const x = roadX(s) + side * (17 + rand() ** 0.8 * 240),
        z = -s;
      const reserved = STOPS.some(
        (stop) =>
          Math.abs(stop.s - s) < (stop.id === 'lake' ? 110 : 65) &&
          (side === stop.side || stop.id === 'home'),
      );
      const scale = reserved ? 0.001 : (1.2 + rand() * 2.4) * (s < 500 ? 0.75 : 1);
      const y = terrainHeight(x, z);
      d.position.set(x, y + scale * 1.35, z);
      d.rotation.set(0, rand() * 6.3, 0);
      d.scale.setScalar(scale);
      d.updateMatrix();
      trunks.setMatrixAt(i, d.matrix);
      for (let j = 0; j < 2; j++) {
        d.position.y = y + scale * (j === 0 ? 3.2 : 4.6);
        d.scale.set(scale * (j ? 0.76 : 1), scale, scale * (j ? 0.76 : 1));
        d.updateMatrix();
        leaves.setMatrixAt(i * 2 + j, d.matrix);
        const c = new T.Color().setHSL(
          0.29 + rand() * 0.065,
          0.18 + rand() * 0.12,
          0.29 + rand() * 0.12,
        );
        leaves.setColorAt(i * 2 + j, c);
      }
      if (!reserved && Math.abs(x - roadX(s)) < 42) this.solid(x, z, 0.4 * scale, 0.4 * scale);
    }
    for (let i = 0; i < 550; i++) {
      const s = rand() * 7600 - 100,
        x = roadX(s) + (rand() < 0.5 ? -1 : 1) * (20 + rand() * 230);
      const reserved = STOPS.some(
        (stop) => Math.abs(stop.s - s) < 90 && Math.sign(x - roadX(s)) === stop.side,
      );
      d.position.set(x, terrainHeight(x, -s), -s);
      d.scale.setScalar(reserved ? 0.001 : 1 + rand() * 5);
      d.rotation.set(rand(), rand() * 6, rand());
      d.updateMatrix();
      rocks.setMatrixAt(i, d.matrix);
    }
    // Angular mountain silhouettes continue along the entire journey.
    const mountains = new T.InstancedMesh(new T.ConeGeometry(1, 1, 5, 1), material('#8baba5'), 110);
    const caps = new T.InstancedMesh(new T.ConeGeometry(1, 1, 5, 1), material('#e1e4d6'), 110);
    this.scene.add(caps);
    mountains.receiveShadow = true;
    this.scene.add(mountains);
    for (let i = 0; i < 110; i++) {
      const s = rand() * 8100 - 100,
        x = (rand() < 0.5 ? -1 : 1) * (220 + rand() * 350);
      const h = 95 + rand() * 170;
      d.position.set(x, roadY(s) + h / 2 - 20, -s);
      d.scale.set(110 + rand() * 120, h, 140 + rand() * 140);
      d.rotation.set(0, rand() * 6, 0);
      d.updateMatrix();
      mountains.setMatrixAt(i, d.matrix);
      mountains.setColorAt(
        i,
        new T.Color().setHSL(0.43 + rand() * 0.04, 0.1 + rand() * 0.07, 0.55 + rand() * 0.16),
      );
      d.position.y += h * 0.37 + 0.12;
      d.scale.multiplyScalar(0.26);
      d.scale.x *= 1.012;
      d.scale.z *= 1.012;
      d.updateMatrix();
      caps.setMatrixAt(i, d.matrix);
    }
    const flowers = new T.InstancedMesh(
      new T.IcosahedronGeometry(0.17, 0),
      material('#ebd7a0'),
      1800,
    );
    this.scene.add(flowers);
    for (let i = 0; i < 1800; i++) {
      const s = rand() * 7400,
        x = roadX(s) + (rand() < 0.5 ? -1 : 1) * (7 + rand() * 7);
      d.position.set(x, terrainHeight(x, -s) + 0.25, -s);
      d.scale.setScalar(0.5 + rand());
      d.updateMatrix();
      flowers.setMatrixAt(i, d.matrix);
    }
    const blades = new T.BufferGeometry();
    blades.setAttribute(
      'position',
      new T.Float32BufferAttribute(
        [-0.18, 0, 0, 0.04, 0.62, 0, 0.1, 0, 0, 0, 0, -0.17, 0, 0.47, -0.02, 0, 0, 0.16],
        3,
      ),
    );
    blades.computeVertexNormals();
    const grassMaterial = new T.MeshStandardMaterial({
      color: '#8f9b65',
      side: T.DoubleSide,
      roughness: 1,
    });
    const tufts = new T.InstancedMesh(blades, grassMaterial, 6500);
    this.scene.add(tufts);
    for (let i = 0; i < 6500; i++) {
      const s = rand() * 7500 - 80,
        offset = (rand() < 0.5 ? -1 : 1) * (7 + rand() * 32),
        x = roadX(s) + offset;
      const clear = STOPS.some(
        (stop) => Math.abs(stop.s - s) < 40 && Math.sign(offset) === stop.side,
      );
      d.position.set(x, terrainHeight(x, -s), -s);
      d.scale.setScalar(clear ? 0.001 : 0.5 + rand() * 1.1);
      d.rotation.set(0, rand() * 6, 0);
      d.updateMatrix();
      tufts.setMatrixAt(i, d.matrix);
    }
  }
  pad(x: number, z: number, width: number, depth: number) {
    const m = box(this.scene, [width, 0.08, depth], [x, terrainHeight(x, z), z], '#c6bb99', 0.015);
    m.castShadow = false;
  }
  building(
    x: number,
    z: number,
    width: number,
    depth: number,
    color: string,
    title: string,
    enterable = false,
  ) {
    const g = new T.Group();
    const h = 3.8;
    box(g, [width + 0.5, 0.25, depth + 0.5], [0, 0.04, 0], '#c5bda3');
    box(g, [width, h, 0.22], [0, h / 2, -depth / 2], color);
    for (const side of [-1, 1]) box(g, [0.22, h, depth], [(side * width) / 2, h / 2, 0], color);
    if (enterable) {
      for (const side of [-1, 1]) {
        box(g, [width / 2 - 1.05, h, 0.22], [side * (width / 4 + 0.55), h / 2, depth / 2], color);
        const glass = box(
          g,
          [width / 2 - 1.5, 1.5, 0.05],
          [side * (width / 4 + 0.55), 2.1, depth / 2 + 0.14],
          '#85aca6',
        );
        glass.material = new T.MeshStandardMaterial({ color: '#85aca6', roughness: 0.4 });
      }
      const l = label('OPEN', 1.4, 0.5, '#e4cf99', '#365347');
      l.position.set(0, 3.1, depth / 2 + 0.16);
      g.add(l);
    } else {
      box(g, [width, h, 0.22], [0, h / 2, depth / 2], color);
      box(g, [1.3, 2.6, 0.13], [0, 1.4, depth / 2 + 0.15], '#617b6a');
    }
    box(g, [width + 1, 0.3, depth + 1], [0, h + 0.1, 0], '#526958');
    const roof = mesh(
      new T.CylinderGeometry(width * 0.76, width * 0.76, depth + 0.8, 3),
      '#b97650',
      g,
      [0, h + 0.7, 0],
    );
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    // Gabled roof made from an extruded triangular profile.
    roof.visible = false;
    const shape = new T.Shape();
    shape.moveTo(-width / 2 - 0.7, 0);
    shape.lineTo(0, 1.9);
    shape.lineTo(width / 2 + 0.7, 0);
    shape.closePath();
    const roofMesh = mesh(
      new T.ExtrudeGeometry(shape, { depth: depth + 1, bevelEnabled: false }),
      '#a76e50',
      g,
      [0, h + 0.25, -depth / 2 - 0.5],
    );
    roofMesh.receiveShadow = true;
    const l = label(title, width * 0.84, 0.75, '#36584a', '#f5e4b9');
    l.position.set(0, h - 0.15, depth / 2 + 0.2);
    g.add(l);
    this.place(g, x, z);
    this.solid(x - width / 2, z, 0.2, depth / 2);
    this.solid(x + width / 2, z, 0.2, depth / 2);
    this.solid(x, z - depth / 2, width / 2, 0.2);
    if (!enterable) this.solid(x, z, width / 2, depth / 2);
    else
      for (const side of [-1, 1])
        this.solid(x + side * (width / 4 + 0.55), z + depth / 2, width / 4 - 0.5, 0.2);
    return g;
  }
  buildStops() {
    // Starting driveway: everything needed for a trip, but not room for everything.
    this.pad(15, 1, 24, 36);
    this.building(35, -12, 14, 10, '#e6d7ae', 'MAPLE HOLLOW');
    this.place(sign('THE MOUNTAIN WEEKEND  ↑', 5), -8, -10, 0.15);
    for (const [x, z] of [
      [-16, 6],
      [38, 9],
      [-23, -12],
      [45, -30],
    ])
      this.place(broadTree(), x, z).scale.setScalar(2.1);
    const ids: ItemId[] = ['tent', 'cooler', 'water', 'tools', 'spare', 'camera', 'fuel', 'bag'];
    ids.forEach((id, i) => {
      const x = 16 + (i % 4) * 1.6,
        z = 3 + Math.floor(i / 4) * 2.3;
      const model = itemModel(id);
      this.place(model, x, z);
      this.itemObjects.set(id, model);
      this.addTarget(
        `item:${id}`,
        model.position.clone().add(new T.Vector3(0, 0.35, 0)),
        '',
        2.6,
        model,
        id,
      );
    });
    const table = picnic();
    this.place(table, 22, 11);
    this.place(sign('PACK LIGHT. MAKE MEMORIES.', 4), 22, -4);
    // A lived-in starting place: fencing, a letterbox, shrubs and a little flower bed.
    for (const z of [-32, -28, -24, -20, -16]) {
      box(this.scene, [0.12, 1.2, 0.12], [24, terrainHeight(24, z) + 0.6, z], '#e5d5ad');
      for (const y of [0.45, 0.95])
        box(this.scene, [0.1, 0.12, 4], [24, terrainHeight(24, z) + y, z + 2], '#e5d5ad');
    }
    const mailbox = new T.Group();
    cylinder(mailbox, 0.07, 1.2, [0, 0.6, 0], '#8e7954');
    box(mailbox, [0.43, 0.4, 0.65], [0, 1.35, 0], '#a9694c', 0.15);
    box(mailbox, [0.05, 0.36, 0.05], [0.25, 1.6, 0], '#dcb967');
    this.place(mailbox, 7, -22);
    for (let i = 0; i < 24; i++) {
      const x = -9 - (i % 6) * 1.15,
        z = -8 + Math.floor(i / 6) * 1.4;
      const shrub = sphere(
        this.scene,
        0.55,
        [x, terrainHeight(x, z) + 0.38, z],
        i % 3 === 0 ? '#c5b476' : '#829773',
      );
      shrub.scale.y = 0.7;
      for (let j = 0; j < 3; j++)
        sphere(
          this.scene,
          0.12,
          [x + Math.sin(j * 3) * 0.3, terrainHeight(x, z) + 0.75, z + Math.cos(j * 3) * 0.25],
          '#f5db9b',
          0,
        );
    }
    // Last Chance: walk-through convenience store, canopy, two pumps and small details.
    const fuel = STOPS.find((s) => s.id === 'fuel')!;
    const fx = roadX(fuel.s),
      fz = -fuel.s;
    this.pad(fx + 25, fz, 40, 45);
    this.building(fx + 31, fz - 14, 16, 10, '#e8d9b9', 'LAST CHANCE · GOODS & GAS', true);
    for (const x of [fx + 13, fx + 23]) {
      const p = pumpModel();
      this.place(p, x, fz + 7);
      this.addTarget('pump', p.position.clone().add(new T.Vector3(0, 1.7, 0)), 'Fill up', 3.3, p);
      this.solid(x, fz + 7, 0.65, 0.5);
    }
    for (const x of [fx + 9, fx + 28])
      for (const z of [fz + 1, fz + 13])
        box(this.scene, [0.2, 4, 0.2], [x, terrainHeight(x, z) + 2, z], '#b56e4f');
    box(this.scene, [21, 0.35, 16], [fx + 18.5, roadY(fuel.s) + 4, fz + 7], '#f0dfbd');
    box(this.scene, [21, 0.35, 16], [fx + 18.5, roadY(fuel.s) + 4.3, fz + 7], '#bf7650');
    const store = this.addTarget(
      'store',
      roadPoint(fuel.s + 15, 31).add(new T.Vector3(0, 1.3, 1.5)),
      'Browse the provisions',
      3.2,
    );
    const shelf = new T.Group();
    for (const level of [0.6, 1.3, 2]) {
      box(shelf, [6, 0.12, 0.65], [0, level, 0], '#ac885c');
      for (let i = 0; i < 9; i++)
        box(
          shelf,
          [0.36, 0.38, 0.29],
          [-2.5 + i * 0.63, level + 0.24, 0],
          ['#e1bd69', '#7baca4', '#cb8158'][i % 3],
        );
    }
    this.place(shelf, fx + 31, fz - 17);
    const storeSign = label('SNACKS · SPARES · GOOD ADVICE', 5, 0.6);
    storeSign.position.copy(store.position).add(new T.Vector3(0, 1.3, -2));
    this.scene.add(storeSign);
    this.place(picnic(), fx + 43, fz + 4);
    const bin = new T.Group();
    cylinder(bin, 0.4, 1, [0, 0.5, 0], '#647768');
    cylinder(bin, 0.45, 0.1, [0, 1.04, 0], '#d1c7a7');
    this.place(bin, fx + 21, fz - 6);
    const bathroom = this.building(fx + 45, fz - 14, 5, 5, '#98a18a', 'WC');
    this.addTarget(
      'bathroom',
      bathroom.position.clone().add(new T.Vector3(0, 1.2, 3)),
      'A little comfort break',
      3,
    );
    this.place(sign('LAST CHANCE GAS  →', 4.5), fx + 8, fz + 27);
    // Lake: a reflective inlet and a timber deck.
    const lake = STOPS.find((s) => s.id === 'lake')!;
    const lx = roadX(lake.s),
      lz = -lake.s;
    this.pad(lx - 17, lz, 23, 32);
    this.lake = new T.Mesh(
      new T.CircleGeometry(125, 80),
      new T.ShaderMaterial({
        uniforms: { time: { value: 0 }, tint: { value: new T.Color('#83b8ae') } },
        vertexShader:
          'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:
          'uniform float time;uniform vec3 tint;varying vec3 vP;void main(){float w=sin(vP.x*.8+time)*sin(vP.y*.9-time*.5);float r=pow(max(0.,sin(vP.y*2.+vP.x*.2+time)),18.);gl_FragColor=vec4(tint+w*.025+r*.09,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
        side: T.DoubleSide,
      }),
    );
    this.lake.rotation.x = -Math.PI / 2;
    this.lake.position.set(lx - 155, roadY(lake.s) + 0.03, lz);
    this.scene.add(this.lake);
    for (let i = 0; i < 15; i++)
      box(
        this.scene,
        [13, 0.15, 0.9],
        [lx - 35, roadY(lake.s) + 0.38, lz - 6.3 + i * 0.9],
        '#b8a47d',
        0.02,
      );
    for (const z of [lz - 6.5, lz + 6.5])
      box(this.scene, [13, 0.14, 0.14], [lx - 35, roadY(lake.s) + 1.3, z], '#8d7a5c');
    for (const x of [lx - 41.4, lx - 35, lx - 28.6])
      for (const z of [lz - 6.5, lz + 6.5])
        box(this.scene, [0.16, 1.2, 0.16], [x, roadY(lake.s) + 0.8, z], '#8d7a5c');
    this.place(sign('MIRROR LAKE', 4), lx - 15, lz + 10);
    this.place(picnic(), lx - 20, lz - 12);
    this.addTarget(
      'view:lake',
      roadPoint(lake.s, -35).add(new T.Vector3(0, 1.2, 0)),
      'Take in Mirror Lake',
      5,
    );
    // Fork and advance warning ensure the decision never depends on noticing a tiny sign.
    const fork = STOPS.find((s) => s.id === 'fork')!;
    this.place(sign('← HIGHWAY  /  PINECONE TRAIL →', 6), roadX(fork.s) + 12, -fork.s);
    this.addTarget(
      'route',
      roadPoint(fork.s, 12).add(new T.Vector3(0, 1.7, 0)),
      'Choose the road ahead',
      4,
    );
    // Campground with a real pitch, a contained fire, benches and a sleepy ranger hut.
    const camp = STOPS.find((s) => s.id === 'camp')!;
    const cx = roadX(camp.s),
      cz = -camp.s;
    this.pad(cx + 22, cz, 34, 35);
    this.place(sign('PINECONE CAMP  →', 4.5), cx + 8, cz + 18);
    this.campTent.position.copy(roadPoint(camp.s + 5, 33));
    this.campTent.visible = false;
    this.scene.add(this.campTent);
    const pitch = new T.Group();
    for (const x of [-2, 2])
      for (const z of [-2.5, 2.5]) cylinder(pitch, 0.08, 0.4, [x, 0.2, z], '#9c8057');
    this.place(pitch, cx + 33, cz - 5);
    this.addTarget(
      'camp',
      roadPoint(camp.s + 5, 33).add(new T.Vector3(0, 1, 0)),
      'Make yourself at home',
      4.2,
    );
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      sphere(this.fire, 0.3, [Math.sin(a) * 1.1, 0.17, Math.cos(a) * 1.1], '#8c9281', 0);
    }
    for (const a of [-0.5, 0.5]) {
      const log = cylinder(this.fire, 0.16, 1.8, [0, 0.25, 0], '#795d41');
      log.rotation.z = Math.PI / 2;
      log.rotation.y = a;
    }
    const flames = new T.Group();
    flames.name = 'flames';
    for (let i = 0; i < 5; i++) {
      const f = mesh(
        new T.ConeGeometry(0.36 - i * 0.035, 1 + i * 0.09, 5),
        ['#efa64f', '#ffcd79', '#e77f3f'][i % 3],
        flames,
        [Math.sin(i * 2) * 0.27, 0.55 + i * 0.08, Math.cos(i * 2) * 0.27],
      );
      const mat = (f.material as T.MeshStandardMaterial).clone();
      mat.emissive.copy(mat.color);
      mat.emissiveIntensity = 0.7;
      f.material = mat;
    }
    flames.visible = false;
    this.fire.add(flames, this.fireLight);
    this.fireLight.position.y = 1.2;
    this.place(this.fire, cx + 25, cz + 4);
    this.addTarget(
      'fire',
      this.fire.position.clone().add(new T.Vector3(0, 0.8, 0)),
      'The campfire circle',
      3.7,
    );
    this.place(picnic(), cx + 32, cz + 8);
    sphere(this.raccoon, 0.37, [0, 0.36, 0], '#92988a');
    sphere(this.raccoon, 0.28, [0, 0.61, -0.3], '#bdc0ab');
    box(this.raccoon, [0.5, 0.13, 0.09], [0, 0.65, -0.53], '#4d5b51', 0.06);
    for (const x of [-0.14, 0.14]) {
      sphere(this.raccoon, 0.095, [x, 0.89, -0.3], '#647266');
      sphere(this.raccoon, 0.035, [x, 0.66, -0.585], '#f2e7c5');
    }
    sphere(this.raccoon, 0.065, [0, 0.54, -0.59], '#34493d');
    for (let i = 0; i < 5; i++)
      sphere(
        this.raccoon,
        0.13,
        [0, 0.3 + i * 0.025, 0.27 + i * 0.16],
        i % 2 ? '#526255' : '#abb09a',
      );
    this.place(this.raccoon, cx + 30, cz + 11, 0.7);
    this.addTarget(
      'raccoon',
      this.raccoon.position.clone().add(new T.Vector3(0, 0.6, 0)),
      'The tiny campsite supervisor',
      3.2,
    );
    const extra = tentModel();
    this.place(extra, cx + 50, cz + 12, 0.7);
    extra.scale.setScalar(0.9);
    this.building(cx + 47, cz - 22, 6, 5, '#80907b', 'RANGER');
    // Little Spruce and the world's second-most ambitious teapot.
    const town = STOPS.find((s) => s.id === 'town')!;
    const tx = roadX(town.s),
      tz = -town.s;
    this.pad(tx + 28, tz, 43, 52);
    this.building(tx + 33, tz - 16, 12, 9, '#d3b36d', 'LITTLE SPRUCE · DINER', true);
    this.addTarget(
      'diner',
      roadPoint(town.s + 15, 33).add(new T.Vector3(0, 1.5, 0)),
      'Today’s pie & provisions',
      3.5,
    );
    this.building(tx - 24, tz - 22, 16, 7, '#a4b6a0', 'SLOW DAYS MOTEL');
    this.addTarget(
      'motel',
      roadPoint(town.s + 17, -24).add(new T.Vector3(0, 1.5, 0)),
      'A bed with extremely floral sheets',
      4,
    );
    this.place(teapot(), tx + 27, tz + 11);
    this.place(sign('THE BIG LITTLE TEAPOT', 5), tx + 27, tz + 18);
    this.addTarget(
      'teapot',
      roadPoint(town.s - 15, 27).add(new T.Vector3(0, 1.4, 0)),
      'The big little teapot',
      5,
    );
    this.place(sign('WELCOME TO LITTLE SPRUCE', 5), tx + 9, tz + 40);
    // Destination: a broad timber overlook, banners and the whole valley beyond.
    const summit = STOPS.find((s) => s.id === 'summit')!;
    const sx = roadX(summit.s),
      sz = -summit.s;
    this.pad(sx - 20, sz, 29, 43);
    for (let i = 0; i < 24; i++)
      box(
        this.scene,
        [17, 0.18, 0.85],
        [sx - 38, roadY(summit.s) + 0.2, sz - 10 + i * 0.85],
        '#bba786',
        0.02,
      );
    this.place(sign('SUNRISE RIDGE · YOU MADE IT', 7), sx - 24, sz + 13);
    this.addTarget(
      'finish',
      roadPoint(summit.s, -37).add(new T.Vector3(0, 1.4, 0)),
      'Finish the Mountain Weekend',
      6,
    );
    this.place(picnic(), sx - 20, sz - 16);
    for (const stop of STOPS.filter((s) => !['home', 'fork', 'summit'].includes(s.id))) {
      const p = roadPoint(stop.s - 65, stop.side * 8.5);
      this.place(sign(`${stop.name.toUpperCase()}  ${stop.side > 0 ? '→' : '←'}`, 5), p.x, p.z);
    }
  }
  buildRain() {
    const rand = seeded(90);
    for (let i = 0; i < this.rainPositions.length; i += 3) {
      this.rainPositions[i] = (rand() - 0.5) * 70;
      this.rainPositions[i + 1] = rand() * 35;
      this.rainPositions[i + 2] = (rand() - 0.5) * 70;
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(this.rainPositions, 3));
    this.rain = new T.Points(
      geo,
      new T.PointsMaterial({
        color: '#d6e1d9',
        size: 0.11,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    );
    this.rain.visible = false;
    this.scene.add(this.rain);
  }
  batchStatic() {
    // Spatial batches keep hand-built roadside detail without thousands of draw calls.
    const excluded = new Set<T.Object3D>([
      this.sky,
      this.lake,
      this.stars,
      this.rain,
      this.fire,
      this.campTent,
      this.raccoon,
      this.ground,
      ...this.itemObjects.values(),
    ]);
    const batches = new Map<
      string,
      { material: T.Material; geometries: T.BufferGeometry[]; meshes: T.Mesh[]; shadow: boolean }
    >();
    this.scene.updateMatrixWorld(true);
    const visit = (obj: T.Object3D) => {
      if (excluded.has(obj) || obj instanceof T.Camera || obj.userData.dynamic) return;
      if (
        obj instanceof T.Mesh &&
        !(obj instanceof T.InstancedMesh) &&
        obj.material instanceof T.MeshStandardMaterial &&
        !obj.material.map &&
        obj.visible
      ) {
        const center = obj.getWorldPosition(new T.Vector3());
        const key = `${obj.material.uuid}:${Math.floor(center.z / 180)}:${obj.castShadow}`;
        if (!batches.has(key))
          batches.set(key, {
            material: obj.material,
            geometries: [],
            meshes: [],
            shadow: obj.castShadow,
          });
        const b = batches.get(key)!,
          geo = obj.geometry.index ? obj.geometry.toNonIndexed() : obj.geometry.clone();
        for (const attr of Object.keys(geo.attributes))
          if (!['position', 'normal'].includes(attr)) geo.deleteAttribute(attr);
        geo.applyMatrix4(obj.matrixWorld);
        b.geometries.push(geo);
        b.meshes.push(obj);
      }
      obj.children.forEach(visit);
    };
    this.scene.children.forEach(visit);
    for (const b of batches.values()) {
      if (b.meshes.length < 2) {
        b.geometries.forEach((g) => g.dispose());
        continue;
      }
      const geometry = mergeGeometries(b.geometries);
      if (!geometry) continue;
      const batch = new T.Mesh(geometry, b.material);
      batch.castShadow = b.shadow;
      batch.receiveShadow = true;
      this.scene.add(batch);
      b.meshes.forEach((m) => m.removeFromParent());
      b.geometries.forEach((g) => g.dispose());
    }
  }
  async prepareAssets() {
    const replacements: { root: T.Object3D; id: string }[] = [];
    this.scene.traverse((root) => {
      const id = root.userData.assetId as string | undefined;
      if (id && assetRegistry[id] && typeof assetRegistry[id] !== 'function')
        replacements.push({ root, id });
    });
    // Preserve the interaction/physics root when replacing visuals with a local GLB.
    for (const { root, id } of replacements) {
      const visual = await loadAsset(id);
      root.clear();
      root.add(visual);
    }
    this.batchStatic();
  }
  update(dt: number, position: T.Vector3, save: Save) {
    this.clock += dt;
    const cycle = (save.trip.elapsed / 65 + (save.trip.seed % 2 ? 15 : 10)) % 24;
    const daylight = clamp(Math.sin(((cycle - 6) / 24) * Math.PI * 2) * 2 + 0.15, 0, 1);
    const sunset = (1 - Math.abs(daylight - 0.45) * 2) * Number(cycle > 16 || cycle < 8);
    const wet = save.trip.weather === 'rain' || save.trip.weather === 'fog';
    this.weatherMix = T.MathUtils.damp(
      this.weatherMix,
      wet ? 1 : save.trip.weather === 'cloudy' ? 0.5 : 0,
      1,
      dt,
    );
    const skyTop = new T.Color('#8dbdc2')
      .lerp(new T.Color('#182b3c'), 1 - daylight)
      .lerp(new T.Color('#92a5a3'), this.weatherMix * 0.6);
    const skyBottom = new T.Color('#f3dfb9')
      .lerp(new T.Color('#d99b78'), Math.max(0, sunset) * 0.65)
      .lerp(new T.Color('#394c58'), 1 - daylight)
      .lerp(new T.Color('#b0bdb2'), this.weatherMix * 0.6);
    this.sky.material.uniforms.top.value.copy(skyTop);
    this.sky.material.uniforms.bottom.value.copy(skyBottom);
    this.sky.position.copy(position);
    this.stars.position.copy(position);
    (this.stars.material as T.PointsMaterial).opacity = (1 - daylight) * (1 - this.weatherMix);
    this.sun.intensity = (0.25 + daylight * 2.5) * (1 - this.weatherMix * 0.55);
    this.ambient.intensity = 0.7 + daylight * 1.8;
    this.sun.color.set('#ffe6bf').lerp(new T.Color('#ffb478'), Math.max(0, sunset) * 0.6);
    this.sun.position.copy(position).add(new T.Vector3(-55, 70, -40));
    this.sun.target.position.copy(position);
    const fog = this.scene.fog as T.Fog;
    fog.color.copy(skyBottom);
    fog.near = 80 - this.weatherMix * 60;
    fog.far = save.trip.weather === 'fog' ? 170 : save.trip.weather === 'rain' ? 440 : 790;
    this.rain.visible = save.trip.weather === 'rain';
    if (this.rain.visible) {
      this.rain.position.copy(position);
      const p = this.rain.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) - dt * 22;
        if (y < -5) y = 30;
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }
    this.lake.material.uniforms.time.value = this.clock;
    this.raccoon.rotation.y = 0.7 + Math.sin(this.clock * 0.6) * 0.25;
    const fireOn = save.trip.campStage >= 2;
    this.fire.getObjectByName('flames')!.visible = fireOn;
    if (fireOn) {
      this.fireLight.intensity = 18 + Math.sin(this.clock * 9) * 3;
      this.fire.getObjectByName('flames')!.scale.y = 1 + Math.sin(this.clock * 6) * 0.09;
    }
    this.campTent.visible = save.trip.campStage >= 1;
    for (const [id, obj] of this.itemObjects) {
      if (save.trip.packed.includes(id)) obj.visible = false;
    }
  }
  collide(x: number, z: number, radius: number) {
    for (const s of this.solids) {
      const dx = x - s.x,
        dz = z - s.z;
      if (Math.abs(dx) >= s.hx + radius || Math.abs(dz) >= s.hz + radius) continue;
      const px = s.hx + radius - Math.abs(dx),
        pz = s.hz + radius - Math.abs(dz);
      if (px < pz) x += Math.sign(dx || 1) * px;
      else z += Math.sign(dz || 1) * pz;
    }
    return { x, z };
  }
  walkingHeight(x: number, z: number) {
    let y = terrainHeight(x, z);
    if (Math.abs(x - (roadX(2250) - 35)) < 6.8 && Math.abs(z + 2250) < 6.9)
      y = Math.max(y, roadY(2250) + 0.46);
    if (Math.abs(x - (roadX(7140) - 38)) < 8.7 && Math.abs(z + 7140) < 11)
      y = Math.max(y, roadY(7140) + 0.3);
    return y;
  }
}
