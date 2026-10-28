import { Vector3 } from 'three';

export const ROUTE_LENGTH = 7200;
export const ROAD_HALF = 4.9;
export type StopId = 'home' | 'fuel' | 'lake' | 'fork' | 'camp' | 'town' | 'summit';
export const STOPS: {
  id: StopId;
  name: string;
  s: number;
  side: number;
  description: string;
  icon: string;
}[] = [
  {
    id: 'home',
    name: 'Maple Hollow',
    s: 0,
    side: 1,
    description: 'Pack a little. Dream a lot.',
    icon: '⌂',
  },
  {
    id: 'fuel',
    name: 'Last Chance Gas',
    s: 1100,
    side: 1,
    description: 'Fuel, snacks & questionable postcards.',
    icon: '⛽',
  },
  {
    id: 'lake',
    name: 'Mirror Lake',
    s: 2250,
    side: -1,
    description: 'A view worth taking the long way for.',
    icon: '◈',
  },
  {
    id: 'fork',
    name: 'The Fork',
    s: 3100,
    side: 1,
    description: 'Easy highway or bumpy mountain trail?',
    icon: '⑂',
  },
  {
    id: 'camp',
    name: 'Pinecone Camp',
    s: 4300,
    side: 1,
    description: 'One tent. A thousand stars.',
    icon: '△',
  },
  {
    id: 'town',
    name: 'Little Spruce',
    s: 5550,
    side: 1,
    description: 'Home of the extraordinarily large teapot.',
    icon: '☕',
  },
  {
    id: 'summit',
    name: 'Sunrise Ridge',
    s: 7140,
    side: -1,
    description: 'You made it. Stay a little.',
    icon: '☀',
  },
];

export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
export function roadX(s: number) {
  return Math.sin(s / 410) * 46 + Math.sin(s / 153) * 9;
}
export function roadY(s: number) {
  return (
    2 + smooth((s - 1600) / 1800) * 64 + smooth((s - 5400) / 1500) * 54 + Math.sin(s / 230) * 1.6
  );
}
export function roadPoint(s: number, offset = 0) {
  return new Vector3(roadX(s) + offset, roadY(s), -s);
}
export function roadHeading(s: number) {
  return -Math.atan2((roadX(s + 1) - roadX(s - 1)) / 2, 1);
}
export function terrainHeight(x: number, z: number) {
  const s = -z;
  const distance = Math.abs(x - roadX(s));
  const slope = smooth((distance - 55) / 140);
  const height =
    roadY(s) - 0.08 + slope * (Math.sin(x * 0.015 + s * 0.005) * 8 + Math.sin(x * 0.039) * 3);
  const lakeDistance = Math.hypot(x - (roadX(2250) - 155), z + 2250);
  return lerp(height, roadY(2250) - 1.4, smooth((128 - lakeDistance) / 9));
}
export function biome(s: number) {
  if (s < 650) return 'Maple country';
  if (s < 1750) return 'Whispering woods';
  if (s < 2800) return 'The lake district';
  if (s < 5000) return 'Pinecone pass';
  if (s < 6100) return 'Little Spruce valley';
  return 'The high country';
}
export function nextStop(s: number) {
  return STOPS.find((stop) => stop.s > s + 40) ?? STOPS[STOPS.length - 1];
}
export function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
