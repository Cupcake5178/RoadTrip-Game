import { clamp, seeded, STOPS, type StopId } from './route';

export type ItemId = 'tent' | 'cooler' | 'water' | 'tools' | 'spare' | 'camera' | 'fuel' | 'bag';
export const ITEMS: Record<
  ItemId,
  { name: string; slots: number; price: number; color: number; hint: string }
> = {
  tent: {
    name: 'Two-person tent',
    slots: 2,
    price: 18,
    color: 0xd39743,
    hint: 'A cozy night at Pinecone Camp.',
  },
  cooler: {
    name: 'Snack cooler',
    slots: 2,
    price: 12,
    color: 0x74adb1,
    hint: 'Four snacks. Fewer “are we there yets”.',
  },
  water: {
    name: 'Water jug',
    slots: 1,
    price: 6,
    color: 0xa2c9c8,
    hint: 'For thirsty people. Or thirsty engines.',
  },
  tools: {
    name: 'Tool kit',
    slots: 1,
    price: 15,
    color: 0xc87851,
    hint: 'Repairs the wagon. Confidence included.',
  },
  spare: {
    name: 'Spare tire & jack',
    slots: 2,
    price: 20,
    color: 0x343b3a,
    hint: 'Makes a flat tire a tiny adventure.',
  },
  camera: {
    name: 'Pocket camera',
    slots: 1,
    price: 10,
    color: 0xe5bd6c,
    hint: 'Earn extra rewards for scenic photos.',
  },
  fuel: {
    name: 'Emergency fuel',
    slots: 2,
    price: 15,
    color: 0x9ca861,
    hint: 'A little insurance against a long walk.',
  },
  bag: {
    name: 'Weekend bag',
    slots: 1,
    price: 8,
    color: 0xc58d72,
    hint: 'Fresh socks improve everybody’s mood.',
  },
};
export type Weather = 'sunny' | 'cloudy' | 'rain' | 'fog';
export type Problem = 'flat' | 'heat' | 'cargo' | null;
export interface Photo {
  image: string;
  label: string;
  time: number;
}
export interface Moment {
  text: string;
  at: number;
}
export interface Trip {
  seed: number;
  elapsed: number;
  distance: number;
  fuelUsed: number;
  spent: number;
  repairs: number;
  eventIndex: number;
  eventAt: number;
  problem: Problem;
  repairStep: number;
  weather: Weather;
  weatherAt: number;
  route: 'undecided' | 'highway' | 'shortcut';
  discoveries: StopId[];
  moments: Moment[];
  photos: Photo[];
  packed: ItemId[];
  provisioned: ItemId[];
  roofSecured: boolean;
  snacks: number;
  water: number;
  campStage: number;
  completed: boolean;
  reward: number;
  rating: number;
  departed: boolean;
  scenicPhotos: StopId[];
}
export interface VehicleState {
  x: number;
  z: number;
  yaw: number;
  fuel: number;
  condition: number;
  paint: string;
}
export interface Passenger {
  name: string;
  type: string;
  hunger: number;
  energy: number;
  mood: number;
  color: string;
}
export interface Settings {
  volume: number;
  sensitivity: number;
  quality: 'low' | 'high';
  fov: number;
  music: boolean;
}
export interface Save {
  version: 1;
  money: number;
  career: number;
  completed: number;
  upgrades: string[];
  unlocked: string[];
  settings: Settings;
  vehicle: VehicleState;
  passengers: Passenger[];
  trip: Trip;
  journals: {
    reward: number;
    rating: number;
    distance: number;
    moments: Moment[];
    photos: Photo[];
  }[];
  mode: 'walking' | 'driving';
  player: { x: number; z: number; yaw: number };
}
export const STORAGE_KEY = 'roadtrip.mountain.v1';
export function freshSave(
  settings?: Settings,
  career?: Pick<Save, 'career' | 'completed' | 'upgrades' | 'unlocked' | 'journals'>,
): Save {
  return {
    version: 1,
    money: 160,
    career: career?.career ?? 0,
    completed: career?.completed ?? 0,
    upgrades: career?.upgrades ?? [],
    unlocked: career?.unlocked ?? ['Mountain Weekend'],
    journals: career?.journals ?? [],
    settings: settings ?? { volume: 0.35, sensitivity: 1, quality: 'high', fov: 76, music: true },
    vehicle: { x: 9, z: 8, yaw: 0, fuel: 53, condition: 100, paint: '#ce7957' },
    mode: 'walking',
    player: { x: 14, z: 13, yaw: 0.5 },
    passengers: [
      { name: 'June', type: 'the planner', hunger: 10, energy: 95, mood: 85, color: '#dfb858' },
      {
        name: 'Milo',
        type: 'the happy camper',
        hunger: 15,
        energy: 90,
        mood: 90,
        color: '#7fada2',
      },
    ],
    trip: {
      seed: Math.floor(Math.random() * 1000000),
      elapsed: 0,
      distance: 0,
      fuelUsed: 0,
      spent: 0,
      repairs: 0,
      eventIndex: 0,
      eventAt: 640,
      problem: null,
      repairStep: 0,
      weather: 'sunny',
      weatherAt: 140,
      route: 'undecided',
      discoveries: ['home'],
      moments: [{ text: 'Left Maple Hollow with high hopes and mismatched socks.', at: 0 }],
      photos: [],
      packed: [],
      provisioned: [],
      roofSecured: false,
      snacks: 0,
      water: 0,
      campStage: 0,
      completed: false,
      reward: 0,
      rating: 0,
      departed: false,
      scenicPhotos: [],
    },
  };
}
export function cargoUsed(save: Save) {
  return save.trip.packed.reduce((sum, id) => sum + ITEMS[id].slots, 0);
}
export function cargoCapacity(save: Save) {
  return save.upgrades.includes('rack') ? 14 : 11;
}
export function packItem(save: Save, id: ItemId) {
  if (save.trip.packed.includes(id) || cargoUsed(save) + ITEMS[id].slots > cargoCapacity(save))
    return false;
  save.trip.packed.push(id);
  if (!save.trip.provisioned.includes(id)) {
    if (id === 'cooler') save.trip.snacks += 4;
    if (id === 'water') save.trip.water += 3;
    save.trip.provisioned.push(id);
  }
  return true;
}
export function spend(save: Save, amount: number) {
  if (amount < 0 || !Number.isFinite(amount) || save.money < amount) return false;
  save.money -= amount;
  save.trip.spent += amount;
  return true;
}
export function refuel(save: Save) {
  const liters = Math.min(100 - save.vehicle.fuel, Math.floor(save.money / 0.7));
  if (liters < 1) return 0;
  spend(save, Math.round(liters * 0.7 * 100) / 100);
  save.vehicle.fuel += liters;
  return liters;
}
export function feed(save: Save) {
  if (save.trip.snacks <= 0) return false;
  save.trip.snacks--;
  save.passengers.forEach((p) => {
    p.hunger = Math.max(0, p.hunger - 55);
    p.mood = Math.min(100, p.mood + 13);
  });
  return true;
}
export function discover(save: Save, id: StopId) {
  if (save.trip.discoveries.includes(id)) return false;
  save.trip.discoveries.push(id);
  save.trip.moments.push({
    text: `Stopped at ${STOPS.find((s) => s.id === id)!.name}.`,
    at: save.trip.elapsed,
  });
  save.passengers.forEach((p) => (p.mood = clamp(p.mood + 6, 0, 100)));
  return true;
}
export function eventKind(save: Save): Exclude<Problem, null> {
  const random = seeded(save.trip.seed + save.trip.eventIndex * 177);
  return (['flat', 'heat', 'cargo'] as const)[Math.floor(random() * 3)];
}
export function finishTrip(save: Save) {
  if (save.trip.completed) return;
  const mood = save.passengers.reduce((sum, p) => sum + p.mood, 0) / save.passengers.length;
  const rating = clamp(
    2 +
      Number(save.vehicle.condition > 65) +
      Number(save.trip.discoveries.length >= 5) +
      Number(save.trip.scenicPhotos.length >= 2 && mood > 35),
    1,
    5,
  );
  const reward =
    160 +
    save.trip.discoveries.length * 12 +
    save.trip.scenicPhotos.length * 20 +
    (save.money >= 30 ? 30 : 0);
  save.trip.completed = true;
  save.trip.rating = rating;
  save.trip.reward = reward;
  save.completed++;
  save.career += reward;
  save.unlocked = ['Mountain Weekend', 'Mountain Weekend · golden-hour remix'];
  save.trip.moments.push({
    text: 'Reached Sunrise Ridge. The long way was the right way.',
    at: save.trip.elapsed,
  });
  save.journals.unshift({
    reward,
    rating,
    distance: save.trip.distance,
    moments: [...save.trip.moments],
    photos: [...save.trip.photos],
  });
  save.journals = save.journals.slice(0, 3);
}
export function storeSave(save: Save) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}
export function loadSave(): Save | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (
      s.version !== 1 ||
      !s.trip ||
      !s.vehicle ||
      !Array.isArray(s.passengers) ||
      !s.settings ||
      !Array.isArray(s.trip.packed)
    )
      return null;
    if (
      !Number.isFinite(s.vehicle.x) ||
      !Number.isFinite(s.money) ||
      !s.trip.packed.every((id: string) => id in ITEMS)
    )
      return null;
    s.trip.provisioned ??= [...s.trip.packed];
    return s as Save;
  } catch {
    return null;
  }
}
