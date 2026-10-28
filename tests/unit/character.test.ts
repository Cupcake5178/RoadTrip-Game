import { describe, expect, it } from 'vitest';
import * as T from 'three';
import { animateCharacter, createCharacter } from '../../src/character';

describe('original trail characters', () => {
  it('keeps boots on the ground and a readable short silhouette', () => {
    const actor = createCharacter(42);
    animateCharacter(actor, 0, 0.016);
    const bounds = new T.Box3().setFromObject(actor);
    expect(bounds.min.y).toBeGreaterThan(-0.02);
    expect(bounds.min.y).toBeLessThan(0.035);
    expect(bounds.max.y).toBeGreaterThan(1.6);
    expect(bounds.max.y).toBeLessThan(2.05);
  });
  it('reproduces a saved appearance and offers varied original clothing options', () => {
    expect(createCharacter(42).userData.appearance).toEqual(
      createCharacter(42).userData.appearance,
    );
    const options = new Set(
      Array.from({ length: 20 }, (_, i) => JSON.stringify(createCharacter(i).userData.appearance)),
    );
    expect(options.size).toBe(20);
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
