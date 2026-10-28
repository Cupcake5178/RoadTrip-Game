import { describe, expect, it } from 'vitest';
import * as T from 'three';
import { animateCharacter, createCharacter, EXPEDITION_CAST } from '../../src/character';

function partBounds(actor: T.Group, boneIndex: number) {
  actor.updateMatrixWorld(true);
  let mesh!: T.SkinnedMesh;
  actor.traverse((object) => {
    if (object instanceof T.SkinnedMesh) mesh = object;
  });
  const bounds = new T.Box3();
  const position = mesh.geometry.attributes.position;
  const skin = mesh.geometry.attributes.skinIndex;
  for (let i = 0; i < position.count; i++) {
    if (skin.getX(i) !== boneIndex) continue;
    const vertex = new T.Vector3().fromBufferAttribute(position, i);
    mesh.applyBoneTransform(i, vertex);
    bounds.expandByPoint(vertex.applyMatrix4(mesh.matrixWorld));
  }
  return bounds;
}

describe('original trail characters', () => {
  it('gives every character a spherical giant head, tiny torso, large pack and grounded oversized boots', () => {
    for (let identity = 0; identity < 4; identity++) {
      const actor = createCharacter(42, identity);
      const bounds = new T.Box3().setFromObject(actor);
      const head = partBounds(actor, 2).getSize(new T.Vector3());
      const body = partBounds(actor, 1).getSize(new T.Vector3());
      const bootsAndLegs = partBounds(actor, 5).getSize(new T.Vector3());
      const pack = partBounds(actor, 7).getSize(new T.Vector3());
      expect(bounds.min.y).toBeGreaterThan(-0.02);
      expect(bounds.min.y).toBeLessThan(0.035);
      expect(bounds.max.y).toBeLessThan(2.05);
      expect(head.x / body.x).toBeGreaterThan(1.7);
      expect(head.x / body.y).toBeGreaterThan(2);
      expect(head.x / bounds.getSize(new T.Vector3()).y).toBeGreaterThan(0.55);
      expect(head.x / head.z).toBeCloseTo(1, 1);
      expect(pack.x).toBeGreaterThan(body.x);
      expect(bootsAndLegs.z).toBeGreaterThan(body.z * 1.1);
    }
  });
  it('keeps four distinct color identities and reproduces the chosen character across trips', () => {
    expect(createCharacter(42).userData.appearance).toEqual(
      createCharacter(42).userData.appearance,
    );
    const cast = Array.from({ length: 4 }, (_, i) => createCharacter(42, i).userData.appearance);
    expect(new Set(cast.map((c) => c.headColor)).size).toBe(4);
    expect(new Set(cast.map((c) => c.shirt)).size).toBe(4);
    expect(new Set(cast.map((c) => c.packColor)).size).toBe(4);
    expect(cast.map((c) => c.identity)).toEqual(EXPEDITION_CAST.map((c) => c.name));
    expect(createCharacter(99, 0).userData.appearance.identity).toBe('Wren');
  });
  it('reaches around the giant head while keeping the mitten hands round', () => {
    const actor = createCharacter(3, 0);
    for (let i = 0; i < 60; i++) animateCharacter(actor, 1, 1 / 60, { hanging: true });
    actor.updateMatrixWorld(true);
    const rig = actor.userData.rig;
    const head = rig.head.getWorldPosition(new T.Vector3());
    for (const hand of rig.hands) {
      const point = hand.getWorldPosition(new T.Vector3());
      expect(Math.abs(point.x - head.x)).toBeGreaterThan(0.7);
      expect(point.y).toBeGreaterThan(head.y + 0.4);
      expect(hand.getWorldScale(new T.Vector3()).y).toBeCloseTo(1);
    }
  });
  it('animates without allocating a growing hierarchy of visual parts', () => {
    const actor = createCharacter(9);
    let before = 0;
    actor.traverse(() => before++);
    for (let i = 0; i < 300; i++)
      animateCharacter(actor, i / 60, 1 / 60, {
        speed: 5,
        running: true,
        carrying: i > 100,
        grounded: i % 60 < 40,
        landing: i % 60 === 41 ? 1 : 0,
      });
    let after = 0;
    actor.traverse(() => after++);
    expect(after).toBe(before);
    expect(after).toBeLessThan(80);
    expect(Number.isFinite(new T.Box3().setFromObject(actor).max.y)).toBe(true);
  });
});
