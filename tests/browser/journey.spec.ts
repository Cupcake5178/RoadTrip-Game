import { test, expect, type Page } from '@playwright/test';
import { freshSave, packItem, eventKind } from '../../src/state';
import { roadX, roadHeading } from '../../src/route';

declare global {
  interface Window {
    __roadtrip: any;
  }
}
async function snapshot(page: Page) {
  return page.evaluate(() => window.__roadtrip.snapshot());
}
async function key(page: Page, code: string) {
  await page.keyboard.down(code);
  await page.waitForTimeout(120);
  await page.keyboard.up(code);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
async function approach(page: Page, id: string, dx = 0, dz = 1.8) {
  const p = await page.evaluate((id) => window.__roadtrip.target(id), id);
  expect(p, `Interactive target ${id} exists`).toBeTruthy();
  await page.evaluate(
    ({ p, dx, dz }) => {
      window.__roadtrip.warp(p.x + dx, p.z + dz);
    },
    { p, dx, dz },
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.evaluate((p) => window.__roadtrip.aim(p.x, p.y, p.z), p);
  await expect
    .poll(async () => (await snapshot(page)).target, { message: `Look at ${id}` })
    .toBe(id);
}
async function hold(page: Page, until: (s: any) => boolean) {
  await page.keyboard.down('e');
  await expect.poll(async () => until(await snapshot(page)), { timeout: 35_000 }).toBe(true);
  await page.keyboard.up('e');
  await page.waitForTimeout(150);
}
async function begin(page: Page) {
  await page.goto('/?test');
  await page.waitForSelector('.home-content', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Let’s hit the road' }).click();
  await page.getByRole('button', { name: 'Let’s pack' }).click();
  await expect.poll(async () => (await snapshot(page)).panel).toBe(null);
  await key(page, 'p');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Graphics quality').selectOption('low');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: /Back to the weekend/ }).click();
}

test('a complete weekend: physical packing, driving, repairs, fuel, decisions, camping, photos, rewards and continue', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await begin(page);
  // Physical supplies are looked at, picked up, carried and packed with real E inputs.
  for (const id of ['tent', 'cooler', 'water', 'tools', 'spare', 'camera']) {
    await approach(page, 'item:' + id);
    await key(page, 'e');
    expect((await snapshot(page)).holding).toBe(id);
    await approach(page, 'trunk', 0, 2);
    await key(page, 'e');
    expect((await snapshot(page)).save.trip.packed).toContain(id);
  }
  await approach(page, 'roof', -2, 0);
  await hold(page, (s) => s.save.trip.roofSecured);
  await approach(page, 'door', -1.6, 0);
  await key(page, 'e');
  await key(page, 'e');
  expect((await snapshot(page)).mode).toBe('driving');
  await page.keyboard.down('w');
  await expect
    .poll(async () => (await snapshot(page)).save.trip.distance, { timeout: 30_000 })
    .toBeGreaterThan(3);
  await page.keyboard.up('w');
  const driven = await snapshot(page);
  expect(driven.save.trip.distance).toBeGreaterThan(3);
  expect(driven.save.vehicle.fuel).toBeLessThan(53);
  expect(driven.carBodyAttached).toBe(true);
  expect(Math.abs(driven.carBodyWorld.x - driven.save.vehicle.x)).toBeLessThan(0.08);
  expect(Math.abs(driven.carBodyWorld.z - driven.save.vehicle.z)).toBeLessThan(0.08);
  expect(driven.handMeshes).toBe(4);
  await page.screenshot({ path: 'test-results/driving.png' });
  // The travel harness only shortens travel, and the event still triggers through the game loop.
  await page.evaluate(() => {
    const s = 720;
    const x = Math.sin(s / 410) * 46 + Math.sin(s / 153) * 9;
    window.__roadtrip.warp(x + 7.5, -s, true);
  });
  await expect.poll(async () => (await snapshot(page)).save.trip.problem).not.toBeNull();
  await key(page, 'e');
  const problem = (await snapshot(page)).save.trip.problem;
  if (problem === 'flat') {
    await approach(page, 'tire', -1.8, 0);
    await key(page, 'e');
    await hold(page, (s) => s.save.trip.repairStep === 2);
    await hold(page, (s) => !s.save.trip.problem);
  } else if (problem === 'heat') {
    await approach(page, 'hood', 0, -1.8);
    await key(page, 'e');
    await hold(page, (s) => !s.save.trip.problem);
  } else {
    await approach(page, 'roof', -2, 0);
    await hold(page, (s) => !s.save.trip.problem);
  }
  expect((await snapshot(page)).save.trip.repairs).toBe(1);
  // Park at an actual pump and hold the nozzle interaction.
  const pump = await page.evaluate(() => window.__roadtrip.target('pump'));
  await page.evaluate((p) => window.__roadtrip.warp(p.x - 4, p.z, true), pump);
  await key(page, 'e');
  await approach(page, 'pump');
  const beforeFuel = (await snapshot(page)).save.money;
  await hold(page, (s) => s.save.vehicle.fuel >= 99);
  expect((await snapshot(page)).save.money).toBeLessThan(beforeFuel);
  await approach(page, 'store');
  await key(page, 'e');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Snack refill' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  // Capture a real WebGL image and retain a scenic discovery.
  await approach(page, 'view:lake', 0, 2);
  await key(page, 'e');
  await key(page, 'c');
  await key(page, 'c');
  let state = await snapshot(page);
  expect(state.save.trip.photos[0].image).toMatch(/^data:image\/jpeg/);
  expect(state.save.trip.scenicPhotos).toContain('lake');
  await page.screenshot({ path: 'test-results/mirror-lake.png' });
  await approach(page, 'route');
  await key(page, 'e');
  await page.getByRole('button', { name: /Pinecone trail/i }).click();
  expect((await snapshot(page)).save.trip.route).toBe('shortcut');
  await approach(page, 'camp');
  for (const name of [
    'Pitch your tent',
    'Light the campfire',
    'Cook supper',
    'Sleep until morning',
  ]) {
    await key(page, 'e');
    await page.getByRole('button', { name }).click();
  }
  state = await snapshot(page);
  expect(state.save.trip.campStage).toBe(4);
  expect(state.save.passengers[0].energy).toBeGreaterThan(99);
  await approach(page, 'teapot');
  await key(page, 'e');
  await key(page, 'c');
  await key(page, 'c');
  // Drive the last few meters with ordinary acceleration, then walk to the destination.
  await page.evaluate(() => {
    const s = 7080;
    const x = Math.sin(s / 410) * 46 + Math.sin(s / 153) * 9;
    window.__roadtrip.warp(x + 7.5, -s, true);
  });
  await key(page, 'e');
  await approach(page, 'finish');
  await key(page, 'e');
  await expect(page.getByRole('heading', { name: 'The long way was worth it.' })).toBeVisible();
  state = await snapshot(page);
  expect(state.save.trip.completed).toBe(true);
  expect(state.save.career).toBeGreaterThan(160);
  expect(state.save.journals).toHaveLength(1);
  await page.screenshot({ path: 'test-results/journal.png' });
  const savedSeed = state.save.trip.seed;
  await page.reload();
  await page.waitForSelector('.home-content', { timeout: 60_000 });
  state = await snapshot(page);
  expect(state.save.trip.seed).toBe(savedSeed);
  expect(state.save.trip.photos).toHaveLength(2);
  await page.getByRole('button', { name: 'Let’s hit the road' }).click();
  await page.getByRole('button', { name: 'Let’s pack' }).click();
  state = await snapshot(page);
  expect(state.save.trip.completed).toBe(false);
  expect(state.save.trip.seed).not.toBe(savedSeed);
  expect(state.save.career).toBeGreaterThan(160);
  expect(errors).toEqual([]);
});

test('settings, dropped physics cargo, map, assistance, reset and returning to title stay usable', async ({
  page,
}) => {
  await page.goto('/?test');
  await page.waitForSelector('.home-content', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Graphics quality').selectOption('low');
  await page.getByLabel('Music', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.home-content')).toBeVisible();
  // Settings save an unstarted trip, so the menu correctly offers Continue.
  await page.getByRole('button', { name: 'Continue your trip' }).click();
  await approach(page, 'item:bag');
  await key(page, 'e');
  await key(page, 'q');
  expect((await snapshot(page)).holding).toBeNull();
  await page.waitForTimeout(1200);
  await approach(page, 'item:bag');
  await key(page, 'e');
  expect((await snapshot(page)).holding).toBe('bag');
  await key(page, 'q');
  await key(page, 'm');
  await expect(page.getByRole('heading', { name: 'A weekend, unfolding.' })).toBeVisible();
  await key(page, 'Escape');
  await key(page, 'r');
  expect((await snapshot(page)).save.money).toBe(152);
  await key(page, 'p');
  await page.getByRole('button', { name: 'Save & return to title' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Reset all saves', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, reset all saves' }).click();
  expect(await page.evaluate(() => localStorage.getItem('roadtrip.mountain.v1'))).toBeNull();
  await expect(page.getByRole('button', { name: 'Let’s hit the road' })).toBeVisible();
});

for (const kind of ['flat', 'heat', 'cargo', 'flat-without-supplies'] as const) {
  test(`roadside ${kind}: the problem is solvable through its physical interaction`, async ({
    page,
  }) => {
    const save = freshSave();
    const expected = kind === 'flat-without-supplies' ? 'flat' : kind;
    for (let seed = 0; seed < 100; seed++) {
      save.trip.seed = seed;
      if (eventKind(save) === expected) break;
    }
    save.settings.quality = 'low';
    save.settings.music = false;
    save.trip.departed = true;
    save.trip.roofSecured = true;
    if (kind !== 'flat-without-supplies')
      for (const id of ['spare', 'tools', 'water'] as const) packItem(save, id);
    save.vehicle = {
      ...save.vehicle,
      x: roadX(720) + 8,
      z: -720,
      yaw: roadHeading(720),
      condition: 70,
    };
    save.player = { x: save.vehicle.x - 3, z: -718, yaw: 0 };
    await page.addInitScript(
      (s) => localStorage.setItem('roadtrip.mountain.v1', JSON.stringify(s)),
      save,
    );
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?test');
    await page.waitForSelector('.home-content', { timeout: 60_000 });
    await page.getByRole('button', { name: 'Continue your trip' }).click();
    await expect.poll(async () => (await snapshot(page)).save.trip.problem).toBe(expected);
    if (expected === 'flat') {
      await approach(page, 'tire', -1.8, 0);
      if (kind !== 'flat-without-supplies') {
        await key(page, 'e');
        await hold(page, (s) => s.save.trip.repairStep === 2);
      }
      await hold(page, (s) => !s.save.trip.problem);
    } else if (expected === 'heat') {
      await approach(page, 'hood', 0, -1.8);
      await key(page, 'e');
      await hold(page, (s) => !s.save.trip.problem);
      expect((await snapshot(page)).save.trip.water).toBe(2);
      await page.evaluate(() => window.__roadtrip.advance(150));
      await expect.poll(async () => (await snapshot(page)).save.trip.weather).not.toBe('sunny');
      await key(page, 'f');
      await expect(page.locator('#toast')).toContainText('Headlights on');
      await approach(page, 'route');
      await key(page, 'e');
      await page.getByRole('button', { name: /Stay on the highway/ }).click();
      expect((await snapshot(page)).save.trip.route).toBe('highway');
    } else {
      await approach(page, 'roof', -2, 0);
      await hold(page, (s) => !s.save.trip.problem);
      expect((await snapshot(page)).save.trip.roofSecured).toBe(true);
    }
    const result = await snapshot(page);
    expect(result.save.trip.repairs).toBe(1);
    expect(result.save.vehicle.condition).toBe(85);
    if (kind === 'flat-without-supplies') expect(result.save.money).toBe(146);
    expect(errors).toEqual([]);
  });
}
