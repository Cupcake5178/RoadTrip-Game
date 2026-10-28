import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cargoCapacity,
  cargoUsed,
  discover,
  eventKind,
  feed,
  finishTrip,
  freshSave,
  loadSave,
  packItem,
  refuel,
  spend,
  STORAGE_KEY,
  storeSave,
} from '../../src/state';
import {
  roadHeading,
  roadPoint,
  roadX,
  roadY,
  seeded,
  terrainHeight,
  STOPS,
} from '../../src/route';

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    setItem: (key: string, v: string) => data.set(key, v),
    getItem: (key: string) => data.get(key) ?? null,
    removeItem: (key: string) => data.delete(key),
  });
});
describe('packing decisions and the road-trip economy', () => {
  it('enforces actual cargo limits without losing items or granting resources', () => {
    const s = freshSave();
    ['tent', 'cooler', 'water', 'tools', 'spare', 'camera', 'fuel'].forEach((id) =>
      expect(packItem(s, id as any)).toBe(true),
    );
    expect(cargoUsed(s)).toBe(cargoCapacity(s));
    expect(packItem(s, 'bag')).toBe(false);
    expect(packItem(s, 'cooler')).toBe(false);
    expect(s.trip.snacks).toBe(4);
  });
  it('does not generate infinite food by unpacking and repacking a cooler', () => {
    const s = freshSave();
    packItem(s, 'cooler');
    feed(s);
    s.trip.packed = [];
    packItem(s, 'cooler');
    expect(s.trip.snacks).toBe(3);
  });
  it('refuels only to tank capacity and charges exactly what was delivered', () => {
    const s = freshSave();
    s.vehicle.fuel = 60;
    expect(refuel(s)).toBe(40);
    expect(s.vehicle.fuel).toBe(100);
    expect(s.money).toBe(132);
    expect(s.trip.spent).toBe(28);
    expect(refuel(s)).toBe(0);
  });
  it('cannot overdraw a small budget during refuelling', () => {
    const s = freshSave();
    s.vehicle.fuel = 0;
    s.money = 7;
    expect(refuel(s)).toBe(10);
    expect(s.money).toBe(0);
    expect(s.vehicle.fuel).toBe(10);
  });
  it('rejects invalid purchases and keeps passenger needs bounded', () => {
    const s = freshSave();
    expect(spend(s, -5)).toBe(false);
    expect(spend(s, Infinity)).toBe(false);
    expect(spend(s, 1000)).toBe(false);
    expect(s.money).toBe(160);
    expect(feed(s)).toBe(false);
    packItem(s, 'cooler');
    expect(feed(s)).toBe(true);
    expect(s.passengers[0].hunger).toBe(0);
    expect(s.passengers[0].mood).toBeLessThanOrEqual(100);
  });
});
describe('replay, discoveries and rewards', () => {
  it('records a discovery once and awards completion only once', () => {
    const s = freshSave();
    expect(discover(s, 'lake')).toBe(true);
    expect(discover(s, 'lake')).toBe(false);
    finishTrip(s);
    const reward = s.career;
    finishTrip(s);
    expect(s.career).toBe(reward);
    expect(s.completed).toBe(1);
    expect(s.journals).toHaveLength(1);
    expect(s.unlocked).toContain('Mountain Weekend · golden-hour remix');
  });
  it('rewards exploration, photos and keeping the wagon healthy', () => {
    const a = freshSave(),
      b = freshSave();
    b.trip.discoveries = STOPS.map((s) => s.id);
    b.trip.scenicPhotos = ['lake', 'summit'];
    finishTrip(a);
    finishTrip(b);
    expect(b.trip.rating).toBe(5);
    expect(b.trip.reward).toBeGreaterThan(a.trip.reward);
  });
  it('preserves career progress but starts a fresh and playable trip', () => {
    const s = freshSave();
    finishTrip(s);
    s.upgrades.push('rack');
    const n = freshSave(s.settings, s);
    expect(n.career).toBe(s.career);
    expect(n.trip.completed).toBe(false);
    expect(n.trip.packed).toEqual([]);
    expect(cargoCapacity(n)).toBe(14);
    expect(n.money).toBe(160);
  });
  it('makes event rolls deterministic per trip and varied across seeds', () => {
    const a = freshSave();
    a.trip.seed = 17;
    const first = eventKind(a);
    expect(eventKind(a)).toBe(first);
    const kinds = new Set(
      Array.from({ length: 40 }, (_, seed) => {
        a.trip.seed = seed;
        return eventKind(a);
      }),
    );
    expect(kinds.size).toBe(3);
    const r = seeded(10),
      r2 = seeded(10);
    expect([r(), r(), r()]).toEqual([r2(), r2(), r2()]);
  });
});
describe('persistence and world continuity', () => {
  it('round-trips resources, decisions, rewards, photographs and positions', () => {
    const s = freshSave();
    packItem(s, 'water');
    s.trip.route = 'shortcut';
    s.trip.photos.push({ image: 'data:image/jpeg;base64,test', label: 'Mirror Lake', time: 10 });
    expect(storeSave(s)).toBe(true);
    expect(loadSave()).toEqual(s);
  });
  it('treats corrupt saves and unavailable storage as recoverable', () => {
    localStorage.setItem(STORAGE_KEY, '{');
    expect(loadSave()).toBeNull();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 4 }));
    expect(loadSave()).toBeNull();
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      getItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(loadSave()).toBeNull();
    expect(storeSave(freshSave())).toBe(false);
  });
  it('keeps the road on the terrain and stop pads level across the route', () => {
    for (let s = 0; s <= 7200; s += 17) {
      const p = roadPoint(s);
      expect(p.y - terrainHeight(p.x, p.z)).toBeCloseTo(0.08, 5);
      const h = roadHeading(s);
      expect(Math.abs(h)).toBeLessThan(0.25);
      expect(Math.abs(roadY(s + 1) - roadY(s))).toBeLessThan(0.16);
    }
    for (const stop of STOPS)
      expect(terrainHeight(roadX(stop.s) + 33, -stop.s)).toBeCloseTo(roadY(stop.s) - 0.08, 5);
  });
});
