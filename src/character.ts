import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { seeded } from './route';
import { skinCharacter } from './character-skin';

export interface CharacterMotion {
  speed?: number;
  running?: boolean;
  grounded?: boolean;
  vertical?: number;
  carrying?: boolean;
  seated?: boolean;
  turn?: number;
  action?: number;
  landing?: number;
  stumble?: number;
  climbing?: boolean;
}
interface Rig {
  torso: T.Object3D;
  head: T.Object3D;
  arms: T.Object3D[];
  legs: T.Object3D[];
  eyes: T.Object3D[];
  backpack: T.Object3D;
  phase: number;
}
const materials = new Map<string, T.MeshStandardMaterial>();
const ball = new T.SphereGeometry(1, 12, 8);
const rounded = new RoundedBoxGeometry(1, 1, 1, 2, 0.16);
function part(
  parent: T.Object3D,
  geometry: T.BufferGeometry,
  color: string,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
) {
  if (!materials.has(color))
    materials.set(color, new T.MeshStandardMaterial({ color, roughness: 0.9 }));
  const mesh = new T.Mesh(geometry, materials.get(color));
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Original short, rounded trail companions, with interchangeable clothing and articulated pivots. */
export function createCharacter(seed = 1, jacket?: string) {
  const random = seeded(seed + 4801);
  const root = new T.Group();
  root.userData.dynamic = true;
  const colors = ['#71a499', '#d9a455', '#bd7d67', '#8196af', '#9b87a6', '#b0b774'];
  const skin = ['#efc6a2', '#b98462', '#d6a47e', '#8d624b'][Math.floor(random() * 4)];
  const hair = ['#493f37', '#91744d', '#bf8457', '#d1c5a5'][Math.floor(random() * 4)];
  const shirt = jacket ?? colors[Math.floor(random() * colors.length)];
  const packColor = colors[Math.floor(random() * colors.length)];
  const torso = new T.Group();
  torso.position.y = 0.565;
  root.add(torso);
  part(torso, rounded, shirt, 0, 0.22, 0, 0.72, 0.67, 0.43);
  part(torso, rounded, '#e5d4ae', 0, 0.53, -0.04, 0.3, 0.1, 0.34);
  part(torso, rounded, '#e8dfbd', 0.19, 0.3, -0.225, 0.14, 0.11, 0.025).rotation.z = -0.1;
  part(torso, rounded, '#f3d594', 0, 0.2, -0.23, 0.025, 0.36, 0.025);
  const backpack = new T.Group();
  backpack.position.set(0, 0.23, 0.28);
  torso.add(backpack);
  part(backpack, rounded, packColor, 0, 0, 0.08, 0.55, 0.63, 0.29);
  part(backpack, rounded, '#d6bd85', 0, 0.19, 0.24, 0.46, 0.16, 0.12);
  part(backpack, rounded, '#6b7960', 0, -0.15, 0.25, 0.36, 0.2, 0.1);
  for (const side of [-1, 1])
    part(torso, rounded, '#566c5b', side * 0.24, 0.21, -0.23, 0.065, 0.56, 0.05);
  part(backpack, rounded, '#dcc08a', 0.28, -0.05, 0.08, 0.1, 0.32, 0.14);
  const head = new T.Group();
  head.position.set(0, 0.78, -0.015);
  torso.add(head);
  part(head, ball, skin, 0, 0, 0, 0.355, 0.35, 0.32);
  part(head, ball, hair, 0, 0.17, 0.045, 0.36, 0.23, 0.3);
  for (const side of [-1, 1]) part(head, ball, skin, side * 0.345, -0.01, 0, 0.065, 0.085, 0.065);
  part(head, ball, skin, 0, -0.035, -0.31, 0.07, 0.065, 0.065);
  const eyes: T.Object3D[] = [];
  for (const side of [-1, 1]) {
    eyes.push(part(head, ball, '#263d35', side * 0.12, 0.025, -0.299, 0.031, 0.047, 0.018));
    part(head, rounded, hair, side * 0.12, 0.12, -0.29, 0.1, 0.025, 0.026).rotation.z = side * 0.12;
    part(head, ball, '#d58f77', side * 0.225, -0.07, -0.242, 0.05, 0.028, 0.015);
  }
  const smile = new T.CatmullRomCurve3([
    new T.Vector3(-0.075, -0.115, -0.292),
    new T.Vector3(0, -0.145, -0.315),
    new T.Vector3(0.075, -0.115, -0.292),
  ]);
  part(head, new T.TubeGeometry(smile, 8, 0.012, 4, false), '#815743', 0, 0, 0, 1, 1, 1);
  const hat = Math.floor(random() * 4);
  if (hat === 0) {
    part(head, new T.CylinderGeometry(0.37, 0.4, 0.06, 12), '#d9bb78', 0, 0.22, 0, 1, 1, 1);
    part(head, new T.CylinderGeometry(0.25, 0.32, 0.2, 10), '#d9bb78', 0, 0.34, 0.01, 1, 1, 1);
    part(head, rounded, '#74917a', 0, 0.28, -0.3, 0.3, 0.045, 0.03);
  } else if (hat === 1) {
    part(head, ball, '#c28359', 0, 0.22, 0.025, 0.35, 0.2, 0.31);
    part(head, rounded, '#daaa79', 0, 0.17, -0.02, 0.71, 0.1, 0.63);
    part(head, ball, '#e9cf99', 0, 0.45, 0.02, 0.085, 0.085, 0.085);
  } else if (hat === 2) {
    part(head, ball, '#607d77', 0, 0.22, 0, 0.35, 0.17, 0.32);
    part(head, rounded, '#526f68', 0, 0.17, -0.28, 0.47, 0.045, 0.39).rotation.x = -0.1;
  } else {
    part(head, ball, hair, -0.18, 0.28, 0.01, 0.18, 0.16, 0.22);
    part(head, rounded, '#e0b668', 0.23, 0.15, -0.235, 0.15, 0.035, 0.03).rotation.z = 0.3;
  }
  const arms: T.Group[] = [],
    legs: T.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new T.Group();
    arm.position.set(side * 0.39, 0.43, 0);
    torso.add(arm);
    part(arm, rounded, shirt, side * 0.015, -0.18, 0, 0.23, 0.42, 0.27);
    part(arm, ball, skin, side * 0.02, -0.43, -0.015, 0.125, 0.13, 0.12);
    arms.push(arm);
    const leg = new T.Group();
    leg.position.set(side * 0.2, 0.06, 0);
    torso.add(leg);
    const shorts = random() > 0.5 ? '#52665d' : '#777c68';
    part(leg, rounded, shorts, 0, -0.13, 0, 0.27, 0.28, 0.3);
    part(leg, rounded, skin, 0, -0.33, 0.01, 0.18, 0.2, 0.19);
    part(leg, rounded, '#eee0b9', 0, -0.43, -0.01, 0.2, 0.1, 0.22);
    part(leg, rounded, '#485d51', 0, -0.53, -0.07, 0.29, 0.17, 0.43);
    part(leg, rounded, '#c3b58c', 0, -0.6, -0.07, 0.3, 0.045, 0.44);
    legs.push(leg);
  }
  const bones = skinCharacter(root, [torso, head, ...arms, ...legs, backpack, ...eyes]);
  root.userData.rig = {
    torso: bones[0],
    head: bones[1],
    arms: bones.slice(2, 4),
    legs: bones.slice(4, 6),
    backpack: bones[6],
    eyes: bones.slice(7),
    phase: random() * 8,
  } satisfies Rig;
  root.userData.appearance = { seed, shirt, packColor, skin, hat };
  return root;
}

export function animateCharacter(
  root: T.Group,
  time: number,
  dt: number,
  motion: CharacterMotion = {},
) {
  const rig = root.userData.rig as Rig | undefined;
  if (!rig) return;
  const speed = motion.speed ?? 0,
    walking = Math.min(1, speed / 2),
    running = !!motion.running;
  const cycle = time * (running ? 13 : 8) + rig.phase;
  const bounce = Math.abs(Math.sin(cycle)) * walking * (running ? 0.065 : 0.035);
  const seated = !!motion.seated,
    air = motion.grounded === false;
  const carry = !!motion.carrying,
    action = motion.action ?? 0,
    landing = motion.landing ?? 0,
    stumble = motion.stumble ?? 0;
  rig.torso.position.y = (seated ? 0.46 : 0.565) + bounce - landing * 0.11;
  rig.torso.scale.y = 1 - landing * 0.1;
  rig.torso.rotation.x = T.MathUtils.damp(
    rig.torso.rotation.x,
    (running ? -0.12 : 0) + stumble * 0.3 - (motion.climbing ? 0.25 : 0),
    10,
    dt,
  );
  rig.torso.rotation.z =
    Math.sin(cycle * 0.5) * 0.028 * walking +
    (motion.turn ?? 0) * -0.09 +
    Math.sin(time * 17) * stumble * 0.1;
  rig.head.rotation.z = Math.sin(time * 1.3 + rig.phase) * 0.035 + (motion.turn ?? 0) * 0.06;
  rig.head.rotation.y = Math.sin(time * 0.65 + rig.phase) * 0.08;
  const blink = (time + rig.phase) % 4.7 < 0.12 ? 0.14 : 1;
  rig.eyes.forEach((eye) => (eye.scale.y = 0.047 * blink));
  rig.arms.forEach((arm, i) => {
    const target = seated
      ? 0.55
      : carry
        ? 1.18
        : air
          ? -0.65
          : Math.sin(cycle + i * Math.PI) * walking * 0.7;
    arm.rotation.x = T.MathUtils.damp(
      arm.rotation.x,
      target + Math.sin(action * Math.PI) * 0.8 + (motion.climbing ? 0.8 : 0),
      12,
      dt,
    );
    arm.rotation.z = (i ? -1 : 1) * (seated ? 0.1 : carry ? -0.14 : 0.12 + stumble * 0.4);
  });
  rig.legs.forEach((leg, i) => {
    const target = seated
      ? 1.3
      : air
        ? -0.35 + i * 0.35
        : Math.sin(cycle + i * Math.PI) * walking * (running ? 0.75 : 0.5);
    leg.rotation.x = T.MathUtils.damp(leg.rotation.x, target, 14, dt);
  });
  rig.backpack.rotation.x = Math.sin(cycle + 0.5) * walking * 0.06;
  rig.backpack.position.y = 0.23 + Math.sin(cycle) * walking * 0.025;
}
