import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { seeded } from './route';
import { skinCharacter } from './character-skin';

export const CHARACTER_BODY = { radius: 0.53, halfHeight: 0.35, centerY: 0.905 } as const;

/** Four original toy-like expedition people. These palettes stay readable across trips. */
export const EXPEDITION_CAST = [
  {
    name: 'Wren',
    head: '#78d7bf',
    shirt: '#ed654b',
    pants: '#313858',
    boots: '#ffd05a',
    pack: '#6455bd',
    trim: '#ffe7a0',
    hat: 'trail-cap',
  },
  {
    name: 'June',
    head: '#b094ed',
    shirt: '#ffd24f',
    pants: '#3d405d',
    boots: '#ed6a5a',
    pack: '#248e99',
    trim: '#ffc970',
    hat: 'bobble',
  },
  {
    name: 'Milo',
    head: '#79b9ed',
    shirt: '#ca4875',
    pants: '#333f61',
    boots: '#f69a44',
    pack: '#efb83e',
    trim: '#6556a2',
    hat: 'bucket',
  },
  {
    name: 'Nia',
    head: '#f6a06d',
    shirt: '#249a94',
    pants: '#423b66',
    boots: '#9c6be0',
    pack: '#b9d860',
    trim: '#f6d6a5',
    hat: 'backward-cap',
  },
] as const;

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
  hanging?: boolean;
  reaching?: number;
  slipping?: number;
}
interface Rig {
  torso: T.Object3D;
  head: T.Object3D;
  arms: T.Object3D[];
  hands: T.Object3D[];
  legs: T.Object3D[];
  eyes: T.Object3D[];
  brows: T.Object3D[];
  mouth: T.Object3D;
  backpack: T.Object3D;
  phase: number;
}
const materials = new Map<string, T.MeshStandardMaterial>();
const ball = new T.SphereGeometry(1, 20, 14);
const capsule = new T.CapsuleGeometry(1, 1, 4, 12);
const rounded = new RoundedBoxGeometry(1, 1, 1, 2, 0.2);
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
    materials.set(color, new T.MeshStandardMaterial({ color, roughness: 0.95 }));
  const mesh = new T.Mesh(geometry, materials.get(color));
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function pill(
  parent: T.Object3D,
  color: string,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth = width,
) {
  return part(parent, capsule, color, x, y, z, width / 2, height / 3, depth / 2);
}

/** Giant spherical head, little bean body, tube arms, mitten hands, stump legs and big boots. */
export function createCharacter(seed = 1, identity = ((seed % 4) + 4) % 4) {
  const palette = EXPEDITION_CAST[identity % EXPEDITION_CAST.length];
  const random = seeded(seed + 4801);
  const root = new T.Group();
  root.name = `expedition-${palette.name.toLowerCase()}`;
  root.userData.dynamic = true;
  const ink = '#292841';
  const torso = new T.Group();
  torso.position.y = 0.34;
  root.add(torso);
  pill(torso, palette.shirt, 0, 0.2, 0, 0.6, 0.46, 0.42);
  // Broad pack straps, with no seams, buttons, zipper or realistic cloth detail.
  for (const side of [-1, 1])
    part(torso, rounded, palette.trim, side * 0.19, 0.21, -0.202, 0.065, 0.34, 0.035);

  const backpack = new T.Group();
  backpack.position.set(0, 0.22, 0.34);
  torso.add(backpack);
  pill(backpack, palette.pack, 0, 0, 0.06, 0.66, 0.6, 0.43);
  pill(backpack, palette.trim, 0, -0.12, 0.28, 0.43, 0.22, 0.13);
  part(backpack, rounded, palette.trim, 0, 0.24, 0.18, 0.4, 0.11, 0.16);

  const head = new T.Group();
  head.position.set(0, 0.89, -0.005);
  torso.add(head);
  // A true sphere: no nose, ears, hair, skin shading, chin or other human anatomy.
  part(head, ball, palette.head, 0, 0, 0, 0.53, 0.53, 0.53);
  const eyes: T.Object3D[] = [],
    brows: T.Object3D[] = [];
  for (const side of [-1, 1]) {
    eyes.push(part(head, ball, ink, side * 0.15, 0.015, -0.51, 0.032, 0.05, 0.015));
    const brow = part(head, rounded, ink, side * 0.15, 0.145, -0.493, 0.105, 0.026, 0.025);
    brows.push(brow);
  }
  const smile = new T.CatmullRomCurve3([
    new T.Vector3(-0.085, -0.14, -0.505),
    new T.Vector3(0, -0.185, -0.509),
    new T.Vector3(0.085, -0.14, -0.505),
  ]);
  const mouth =
    palette.name === 'Milo'
      ? part(head, new T.TorusGeometry(0.06, 0.014, 6, 16), ink, 0, -0.16, -0.511, 0.8, 1, 1)
      : part(head, new T.TubeGeometry(smile, 8, 0.014, 5, false), ink, 0, 0, 0, 1, 1, 1);
  // Tiny hats sit on top of the ball instead of concealing the round silhouette.
  if (palette.hat === 'bobble') {
    part(head, ball, palette.pack, -0.09, 0.48, 0.015, 0.255, 0.11, 0.23);
    part(head, ball, palette.trim, -0.11, 0.6, 0.015, 0.055, 0.055, 0.055);
  } else if (palette.hat === 'bucket') {
    part(
      head,
      new T.CylinderGeometry(0.19, 0.25, 0.16, 16),
      palette.shirt,
      0.08,
      0.51,
      0.02,
      1,
      1,
      1,
    );
    part(
      head,
      new T.CylinderGeometry(0.3, 0.3, 0.045, 16),
      palette.trim,
      0.08,
      0.44,
      0.02,
      1,
      1,
      1,
    );
  } else {
    const back = palette.hat === 'backward-cap';
    part(head, ball, back ? ink : palette.trim, back ? 0.1 : -0.08, 0.48, 0.01, 0.255, 0.135, 0.23);
    const brim = part(
      head,
      rounded,
      back ? palette.boots : palette.pack,
      back ? 0.1 : -0.08,
      0.44,
      back ? 0.24 : -0.24,
      0.39,
      0.045,
      0.31,
    );
    brim.rotation.z = back ? -0.12 : 0.12;
  }

  const arms: T.Group[] = [],
    legs: T.Group[] = [],
    hands: T.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new T.Group();
    arm.position.set(side * 0.33, 0.33, 0);
    torso.add(arm);
    pill(arm, palette.shirt, side * 0.015, -0.16, 0, 0.25, 0.36);
    const hand = new T.Group();
    hand.position.set(side * 0.02, -0.355, -0.015);
    arm.add(hand);
    part(hand, ball, palette.head, 0, 0, 0, 0.14, 0.155, 0.14);
    part(hand, ball, palette.head, -side * 0.11, 0.035, -0.05, 0.065, 0.075, 0.065);
    hands.push(hand);
    arms.push(arm);
    const leg = new T.Group();
    leg.position.set(side * 0.18, 0.08, 0);
    torso.add(leg);
    pill(leg, palette.pants, 0, -0.1, 0, 0.26, 0.24);
    part(leg, rounded, palette.boots, 0, -0.3, -0.09, 0.35, 0.23, 0.5);
    part(leg, rounded, ink, 0, -0.385, -0.09, 0.36, 0.055, 0.51);
    legs.push(leg);
  }
  const bones = skinCharacter(root, [
    torso,
    head,
    ...arms,
    ...legs,
    backpack,
    ...eyes,
    ...brows,
    mouth,
    ...hands,
  ]);
  root.userData.rig = {
    torso: bones[0],
    head: bones[1],
    arms: bones.slice(2, 4),
    hands: bones.slice(12, 14),
    legs: bones.slice(4, 6),
    backpack: bones[6],
    eyes: bones.slice(7, 9),
    brows: bones.slice(9, 11),
    mouth: bones[11],
    phase: random() * 8,
  } satisfies Rig;
  root.userData.appearance = {
    seed,
    identity: palette.name,
    shirt: palette.shirt,
    packColor: palette.pack,
    headColor: palette.head,
    hat: palette.hat,
  };
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
  const walking = Math.min(1, (motion.speed ?? 0) / 2),
    running = !!motion.running;
  const cycle = time * (running ? 13 : 8) + rig.phase;
  const seated = !!motion.seated,
    air = motion.grounded === false;
  const falling = air && (motion.vertical ?? 0) < -2;
  const carry = !!motion.carrying,
    action = Math.sin((motion.action ?? 0) * Math.PI);
  const landing = motion.landing ?? 0;
  const stumble = Math.max(motion.stumble ?? 0, motion.slipping ?? 0);
  const reach = Math.max(motion.reaching ?? 0, motion.climbing ? 1 : 0, motion.hanging ? 1 : 0);
  const bounce = Math.abs(Math.sin(cycle)) * walking * (running ? 0.075 : 0.035);
  rig.torso.position.y = (seated ? 0.28 : 0.34) + bounce - landing * 0.065;
  rig.torso.scale.set(1 + landing * 0.07, 1 - landing * 0.12, 1 + landing * 0.05);
  rig.torso.rotation.x = T.MathUtils.damp(
    rig.torso.rotation.x,
    (running ? -0.25 : 0) + stumble * 0.48 - reach * 0.17 + (falling ? 0.18 : 0),
    9,
    dt,
  );
  rig.torso.rotation.z =
    Math.sin(cycle * 0.5) * 0.065 * walking -
    (motion.turn ?? 0) * 0.22 +
    Math.sin(time * 17) * stumble * 0.19;
  rig.head.rotation.set(
    Math.sin(time * 2 + rig.phase) * 0.04 + (running ? 0.1 : 0) - stumble * 0.16,
    Math.sin(time * 0.65 + rig.phase) * 0.11,
    Math.sin(time * 1.3 + rig.phase) * 0.07 + (motion.turn ?? 0) * 0.12,
  );
  const blink = (time + rig.phase) % 4.7 < 0.12 ? 0.1 : 1;
  rig.eyes.forEach((eye) => (eye.scale.y = 0.05 * blink * (landing > 0.3 ? 0.45 : 1)));
  rig.brows.forEach((brow, i) => {
    brow.rotation.z = (i ? -1 : 1) * (stumble > 0.1 || falling ? 0.45 : -0.12);
    brow.position.y = 0.145 + (falling ? 0.045 : 0) - landing * 0.035;
  });
  rig.mouth.rotation.z = Math.sin(time * 7) * stumble * 0.15;
  rig.arms.forEach((arm, i) => {
    const floppy = Math.sin(cycle + i * Math.PI + 0.4) * walking;
    const target = seated
      ? 0.6
      : reach
        ? 2.9
        : carry
          ? 1.95
          : air
            ? falling
              ? 2.5
              : 2.15
            : floppy * (running ? 1.2 : 0.7);
    arm.rotation.x = T.MathUtils.damp(arm.rotation.x, target + action * 1.4, 9, dt);
    arm.rotation.z =
      (i ? -1 : 1) * (reach ? -0.52 : carry ? 0.08 : -(0.13 + stumble * 0.65 + (air ? 0.4 : 0))) +
      Math.sin(cycle * 1.5 + i) * walking * 0.08;
    arm.scale.y = T.MathUtils.damp(
      arm.scale.y,
      reach ? 3.4 : air ? 1.18 : 1 + Math.abs(floppy) * 0.1,
      8,
      dt,
    );
    rig.hands[i].scale.y = 1 / arm.scale.y;
  });
  rig.legs.forEach((leg, i) => {
    const target = seated
      ? 1.4
      : air
        ? -0.65 + i * 0.75 + Math.sin(time * 12 + i) * (falling ? 0.35 : 0)
        : Math.sin(cycle + i * Math.PI) * walking * (running ? 1.0 : 0.6);
    leg.rotation.x = T.MathUtils.damp(leg.rotation.x, target, 12, dt);
    leg.rotation.z = (i ? 1 : -1) * (air ? 0.15 : stumble * 0.22);
  });
  rig.backpack.rotation.x = Math.sin(cycle - 0.7) * walking * 0.12;
  rig.backpack.rotation.z = Math.sin(cycle * 0.5) * walking * 0.07;
  rig.backpack.position.y = 0.22 + Math.sin(cycle) * walking * 0.035;
}
