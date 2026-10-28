import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ItemId } from './state';
import { createCharacter } from './character';

const mats = new Map<string, T.MeshStandardMaterial>();
export function material(color: T.ColorRepresentation, roughness = 0.86) {
  const key = `${color}-${roughness}`;
  if (!mats.has(key))
    mats.set(key, new T.MeshStandardMaterial({ color, roughness, flatShading: true }));
  return mats.get(key)!;
}
export function mesh(
  geometry: T.BufferGeometry,
  color: T.ColorRepresentation,
  parent?: T.Object3D,
  position?: [number, number, number],
) {
  const m = new T.Mesh(geometry, material(color));
  m.castShadow = true;
  m.receiveShadow = true;
  if (position) m.position.set(...position);
  parent?.add(m);
  return m;
}
export function box(
  parent: T.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  color: T.ColorRepresentation,
  round = 0.06,
) {
  return mesh(
    round ? new RoundedBoxGeometry(...size, 1, round) : new T.BoxGeometry(...size),
    color,
    parent,
    position,
  );
}
export function cylinder(
  parent: T.Object3D,
  r: number,
  h: number,
  position: [number, number, number],
  color: T.ColorRepresentation,
  top = r,
  segments = 10,
) {
  return mesh(new T.CylinderGeometry(top, r, h, segments), color, parent, position);
}
export function sphere(
  parent: T.Object3D,
  radius: number,
  position: [number, number, number],
  color: T.ColorRepresentation,
  detail = 1,
) {
  return mesh(new T.IcosahedronGeometry(radius, detail), color, parent, position);
}
export function lineTube(
  parent: T.Object3D,
  points: T.Vector3[],
  radius: number,
  color: T.ColorRepresentation,
) {
  return mesh(
    new T.TubeGeometry(new T.CatmullRomCurve3(points), 14, radius, 6, false),
    color,
    parent,
  );
}
export function label(
  text: string,
  width = 4,
  height = 1.2,
  background = '#294b41',
  foreground = '#fff4d9',
) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = Math.round((1024 * height) / width);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = foreground;
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, c.width - 24, c.height - 24);
  ctx.fillStyle = foreground;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.min(c.height * 0.55, c.width / (text.length * 0.62))}px sans-serif`;
  ctx.fillText(text, c.width / 2, c.height / 2, c.width - 55);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new T.Mesh(
    new T.PlaneGeometry(width, height),
    new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide }),
  );
  return m;
}
export function sign(text: string, width = 4) {
  const g = new T.Group();
  box(g, [0.13, 2.6, 0.13], [-width * 0.32, 1.3, 0], '#8b7656');
  box(g, [0.13, 2.6, 0.13], [width * 0.32, 1.3, 0], '#8b7656');
  const l = label(text, width, 0.85);
  l.position.set(0, 2.3, 0.02);
  g.add(l);
  return g;
}
export function pine(color = '#4d7661') {
  const g = new T.Group();
  cylinder(g, 0.2, 1.7, [0, 0.85, 0], '#83684c', 0.15, 6);
  for (let i = 0; i < 3; i++)
    mesh(new T.ConeGeometry(1.45 - i * 0.31, 2.2, 7), color, g, [0, 2.0 + i * 0.9, 0]);
  g.userData.assetId = 'pine';
  return g;
}
export function broadTree() {
  const g = new T.Group();
  cylinder(g, 0.28, 2.6, [0, 1.3, 0], '#897155', 0.16, 6);
  sphere(g, 1.8, [0, 3.3, 0], '#91a266').userData.noCollision = true;
  sphere(g, 1.2, [1.15, 3, 0], '#b3b573').userData.noCollision = true;
  sphere(g, 1.4, [-0.8, 3.2, 0.4], '#80965c').userData.noCollision = true;
  g.userData.assetId = 'tree';
  return g;
}
export function person(identity = 0, seed = 1) {
  const g = createCharacter(seed, identity);
  g.userData.assetId = 'person';
  return g;
}
export interface Wagon {
  root: T.Group;
  body: T.Mesh;
  door: T.Group;
  hood: T.Group;
  trunk: T.Group;
  wheels: T.Group[];
  steering: T.Group;
  cargo: T.Group;
  headlights: T.SpotLight[];
  passengers: T.Group[];
}
export function wagon(paint: string): Wagon {
  const root = new T.Group();
  box(root, [2.18, 0.32, 4.7], [0, 0.62, 0], '#374942', 0.13);
  const body = box(root, [2.17, 0.73, 4.58], [0, 1.05, 0], paint, 0.17);
  body.material = material(paint).clone();
  box(root, [2.05, 0.12, 4.4], [0, 1.4, 0], '#efd5ad');
  box(root, [1.97, 0.11, 2.8], [0, 2.29, 0.46], paint, 0.09);
  box(root, [1.97, 0.07, 2.65], [0, 2.37, 0.46], '#f0d9b7');
  const glass = new T.MeshStandardMaterial({
    color: '#8aafb0',
    transparent: true,
    opacity: 0.12,
    roughness: 0.18,
    metalness: 0.05,
    side: T.DoubleSide,
    depthWrite: false,
  });
  const windshield = new T.Mesh(new T.PlaneGeometry(1.85, 0.79), glass);
  windshield.position.set(0, 1.88, -0.99);
  windshield.rotation.x = -0.16;
  root.add(windshield);
  const rearGlass = new T.Mesh(new T.PlaneGeometry(1.83, 0.77), glass);
  rearGlass.position.set(0, 1.87, 1.88);
  root.add(rearGlass);
  for (const x of [-1.01, 1.01]) {
    for (const z of [-0.95, 0.35, 1.8])
      box(root, [0.09, 0.85, 0.1], [x, 1.87, z], '#e8ccab', 0.015);
    for (const z of [-0.29, 1.07]) {
      const window = new T.Mesh(new T.PlaneGeometry(1.15, 0.73), glass);
      window.position.set(x, 1.88, z);
      window.rotation.y = Math.PI / 2;
      root.add(window);
    }
    box(root, [0.11, 0.07, 0.25], [x * 1.08, 1.4, 0.18], '#f4ddbb');
    box(root, [0.25, 0.2, 0.38], [x * 1.17, 1.65, -0.8], '#f2dbb7');
    box(root, [0.07, 0.18, 4.1], [x * 1.08, 0.94, 0], '#a16a4c', 0.01);
  }
  const door = new T.Group();
  door.position.set(-1.11, 1.15, -0.85);
  box(door, [0.1, 0.53, 1.2], [0, 0, 0.6], paint);
  root.add(door);
  const hood = new T.Group();
  hood.position.set(0, 1.42, -0.99);
  box(hood, [2.02, 0.1, 1.22], [0, 0, -0.65], paint);
  root.add(hood);
  const trunk = new T.Group();
  trunk.position.set(0, 2.25, 1.99);
  box(trunk, [1.95, 0.65, 0.12], [0, -0.55, 0], paint);
  root.add(trunk);
  for (const z of [-2.3, 2.3]) box(root, [2.28, 0.16, 0.21], [0, 0.73, z], '#d8d6c3');
  box(root, [0.67, 0.3, 0.07], [0, 1.05, -2.32], '#435047');
  for (let i = -2; i <= 2; i++)
    box(root, [0.035, 0.21, 0.08], [i * 0.1, 1.05, -2.36], '#c7c7ad', 0.01);
  for (const x of [-0.78, 0.78]) {
    box(root, [0.47, 0.3, 0.1], [x, 1.12, -2.31], '#fff2b8', 0.07);
    box(root, [0.23, 0.3, 0.1], [x * 1.15, 1.13, 2.3], '#b54837');
  }
  const plate = label('SLOW DAYS', 0.75, 0.19, '#eee3c8', '#40584d');
  plate.position.set(0, 0.76, 2.43);
  root.add(plate);
  const wheels: T.Group[] = [];
  for (const x of [-1.02, 1.02])
    for (const z of [-1.43, 1.43]) {
      const wheel = new T.Group();
      wheel.position.set(x, 0.52, z);
      const tire = cylinder(wheel, 0.49, 0.31, [0, 0, 0], '#303c36', 0.49, 16);
      tire.rotation.z = Math.PI / 2;
      const hub = cylinder(wheel, 0.27, 0.33, [0, 0, 0], '#ede2c5', 0.27, 12);
      hub.rotation.z = Math.PI / 2;
      const cap = cylinder(wheel, 0.12, 0.35, [0, 0, 0], '#8b9d91', 0.12, 12);
      cap.rotation.z = Math.PI / 2;
      root.add(wheel);
      wheels.push(wheel);
    }
  box(root, [1.85, 0.22, 0.4], [0, 1.47, -0.99], '#42544c');
  const dash = label('FUEL     ◉     SLOW DAYS', 0.8, 0.17, '#263e36', '#f2ce8f');
  dash.position.set(-0.46, 1.61, -0.775);
  root.add(dash);
  const steering = new T.Group();
  steering.position.set(-0.5, 1.58, -0.74);
  steering.rotation.x = -0.25;
  mesh(new T.TorusGeometry(0.205, 0.028, 6, 16), '#35453d', steering);
  box(steering, [0.34, 0.025, 0.035], [0, 0, 0], '#d5c8a5');
  root.add(steering);
  for (const x of [-0.5, 0.5])
    for (const z of [0, 1.1]) {
      box(root, [0.72, 0.17, 0.73], [x, 1.18, z], '#b4aa83', 0.12);
      box(root, [0.72, 0.69, 0.16], [x, 1.54, z + 0.34], '#c7bc91', 0.12);
    }
  const passengers: T.Group[] = [];
  for (const [x, z, identity] of [
    [0.5, 0, 1],
    [-0.5, 1.1, 2],
    [0.5, 1.1, 3],
  ] as const) {
    const p = person(identity, passengers.length * 17 + 8);
    p.position.set(x, 0.83, z);
    p.scale.setScalar(0.78);
    root.add(p);
    passengers.push(p);
  }
  for (const x of [-0.75, 0.75]) box(root, [0.08, 0.12, 2.55], [x, 2.48, 0.5], '#4b5c51');
  for (const z of [-0.5, 0.5, 1.5]) box(root, [1.68, 0.08, 0.08], [0, 2.5, z], '#4b5c51');
  const cargo = new T.Group();
  cargo.position.set(0, 2.55, 0.5);
  root.add(cargo);
  const headlights: T.SpotLight[] = [];
  for (const x of [-0.8, 0.8]) {
    const light = new T.SpotLight('#fff0bd', 0, 80, 0.43, 0.65, 1);
    light.position.set(x, 1.15, -2.3);
    light.target.position.set(x, 0, -55);
    root.add(light, light.target);
    headlights.push(light);
  }
  return { root, body, door, hood, trunk, wheels, steering, cargo, headlights, passengers };
}
export function itemModel(id: ItemId) {
  const g = new T.Group();
  if (id === 'spare') {
    const tire = cylinder(g, 0.44, 0.25, [0, 0.45, 0], '#344239', 0.44, 16);
    tire.rotation.z = Math.PI / 2;
    const hub = cylinder(g, 0.23, 0.28, [0, 0.45, 0], '#d1c9af', 0.23, 10);
    hub.rotation.z = Math.PI / 2;
    box(g, [0.3, 0.2, 0.4], [0.35, 0.15, 0.15], '#bf7550');
  } else if (id === 'tent') {
    const body = cylinder(g, 0.23, 0.95, [0, 0.28, 0], '#d4a156', 0.23, 10);
    body.rotation.z = Math.PI / 2;
    for (const x of [-0.3, 0.3]) box(g, [0.07, 0.49, 0.49], [x, 0.28, 0], '#5f6f4b', 0.03);
    lineTube(
      g,
      [new T.Vector3(-0.15, 0.52, 0), new T.Vector3(0, 0.68, 0), new T.Vector3(0.15, 0.52, 0)],
      0.025,
      '#5c644c',
    );
  } else if (id === 'camera') {
    box(g, [0.44, 0.29, 0.21], [0, 0.19, 0], '#d5b46d');
    box(g, [0.14, 0.06, 0.16], [-0.09, 0.36, 0], '#4d5e53');
    const lens = cylinder(g, 0.105, 0.12, [0, 0.2, -0.14], '#394e47', 0.105, 16);
    lens.rotation.x = Math.PI / 2;
    sphere(g, 0.065, [0, 0.2, -0.21], '#7eabb3');
  } else if (id === 'water' || id === 'fuel') {
    box(g, [0.5, 0.67, 0.3], [0, 0.38, 0], id === 'water' ? '#a5c6ba' : '#9ba964', 0.1);
    box(g, [0.31, 0.12, 0.24], [0, 0.79, 0], '#4b6b58');
    box(g, [0.12, 0.08, 0.16], [0.16, 0.76, 0], '#ebd8b0');
    const l = label(id === 'water' ? 'H₂O' : 'FUEL', 0.32, 0.18);
    l.position.set(0, 0.42, -0.156);
    g.add(l);
  } else {
    const color = id === 'cooler' ? '#76afb2' : id === 'tools' ? '#c47854' : '#bd8e6e';
    const size: [number, number, number] = id === 'cooler' ? [0.86, 0.52, 0.53] : [0.7, 0.4, 0.42];
    box(g, size, [0, size[1] / 2 + 0.03, 0], color, 0.09);
    box(g, [size[0] + 0.05, 0.1, size[2] + 0.04], [0, size[1] + 0.05, 0], '#e7dcbc');
    lineTube(
      g,
      [
        new T.Vector3(-0.13, size[1] + 0.1, 0),
        new T.Vector3(0, size[1] + 0.25, 0),
        new T.Vector3(0.13, size[1] + 0.1, 0),
      ],
      0.025,
      '#526052',
    );
    for (const x of [-size[0] * 0.25, size[0] * 0.25])
      box(g, [0.06, size[1], 0.035], [x, size[1] / 2, -size[2] / 2 - 0.02], '#e5c997', 0.015);
  }
  g.userData.assetId = `item:${id}`;
  return g;
}
export function tentModel() {
  const g = new T.Group();
  const geo = new T.BufferGeometry();
  geo.setAttribute(
    'position',
    new T.Float32BufferAttribute(
      [
        -1.6, 0, 1.9, 1.6, 0, 1.9, 0, 2, 1.9, -1.6, 0, -1.9, 0, 2, -1.9, 1.6, 0, -1.9, -1.6, 0,
        -1.9, -1.6, 0, 1.9, 0, 2, 1.9, -1.6, 0, -1.9, 0, 2, 1.9, 0, 2, -1.9, 1.6, 0, 1.9, 1.6, 0,
        -1.9, 0, 2, -1.9, 1.6, 0, 1.9, 0, 2, -1.9, 0, 2, 1.9,
      ],
      3,
    ),
  );
  geo.computeVertexNormals();
  mesh(geo, '#daa04e', g);
  mesh(new T.ConeGeometry(1, 1.65, 3), '#354d43', g, [0, 0.66, 1.92]).rotation.z = Math.PI;
  for (const z of [-1.96, 1.96])
    lineTube(
      g,
      [new T.Vector3(-1.65, 0, z), new T.Vector3(0, 2.08, z), new T.Vector3(1.65, 0, z)],
      0.045,
      '#e9d6ad',
    );
  box(g, [3.5, 0.07, 4.1], [0, 0.01, 0], '#68785b');
  g.userData.assetId = 'tent';
  return g;
}
export function pumpModel() {
  const g = new T.Group();
  cylinder(g, 0.68, 0.17, [0, 0.08, 0], '#b3ada0', 0.68, 8);
  box(g, [0.87, 1.22, 0.57], [0, 0.78, 0], '#c66d4c', 0.13);
  box(g, [1.04, 1.04, 0.62], [0, 1.87, 0], '#f1dfb9', 0.14);
  const l = label('FILL UP', 0.76, 0.25, '#344c43', '#f7e7c5');
  l.position.set(0, 2.05, 0.322);
  g.add(l);
  const digits = label('87.9   /   L', 0.68, 0.23, '#d2ddba', '#344c43');
  digits.position.set(0, 1.72, 0.33);
  g.add(digits);
  lineTube(
    g,
    [
      new T.Vector3(0.48, 2.1, 0),
      new T.Vector3(0.95, 1.1, 0),
      new T.Vector3(0.69, 0.6, 0),
      new T.Vector3(0.58, 1.65, 0.1),
    ],
    0.05,
    '#34473c',
  );
  box(g, [0.13, 0.28, 0.12], [0.59, 1.7, 0.1], '#424c3e');
  g.userData.assetId = 'pump';
  return g;
}
export function picnic() {
  const g = new T.Group();
  for (const z of [-0.8, 0, 0.8])
    box(g, [2.8, 0.12, z === 0 ? 0.9 : 0.35], [0, z === 0 ? 1 : 0.55, z], '#a88254');
  for (const x of [-0.9, 0.9]) {
    const leg = box(g, [0.13, 1, 1.9], [x, 0.48, 0], '#66735b');
    leg.rotation.z = x * 0.17;
  }
  g.userData.assetId = 'picnic';
  return g;
}
export function teapot() {
  const g = new T.Group();
  const pot = sphere(g, 3.2, [0, 3.1, 0], '#e8c77d', 2);
  pot.scale.y = 0.8;
  cylinder(g, 2.0, 0.24, [0, 5.25, 0], '#c9784e', 1.6, 16);
  sphere(g, 0.4, [0, 5.65, 0], '#c9784e');
  lineTube(
    g,
    [new T.Vector3(2, 3, 0), new T.Vector3(4, 3.7, 0), new T.Vector3(4.6, 5.1, 0)],
    0.55,
    '#e8c77d',
  );
  mesh(new T.TorusGeometry(1.8, 0.33, 8, 18), '#c9784e', g, [-2.5, 3.3, 0]);
  cylinder(g, 3, 0.3, [0, 0.2, 0], '#a7b19b', 3, 12);
  g.userData.assetId = 'teapot';
  return g;
}

// Register an original GLB here to replace any procedural prop without changing gameplay.
export const assetRegistry: Record<string, (() => T.Group) | { glb: string; scale?: number }> = {
  pine,
  tree: broadTree,
  tent: tentModel,
  pump: pumpModel,
  person,
  picnic,
  teapot,
  ...Object.fromEntries(
    (['tent', 'cooler', 'water', 'tools', 'spare', 'camera', 'fuel', 'bag'] as ItemId[]).map(
      (id) => [`item:${id}`, () => itemModel(id)],
    ),
  ),
};
export async function loadAsset(id: string) {
  const entry = assetRegistry[id];
  if (!entry) throw new Error(`Unknown asset: ${id}`);
  if (typeof entry === 'function') return entry();
  const result = await new GLTFLoader().loadAsync(entry.glb);
  result.scene.scale.setScalar(entry.scale ?? 1);
  return result.scene;
}
