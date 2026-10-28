import { test, expect, type Page } from '@playwright/test';
import { freshSave } from '../../src/state';

async function frames(page: Page, count = 3) {
  for (let i = 0; i < count; i++)
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
}
const snapshot = (page: Page) => page.evaluate(() => window.__roadtrip.snapshot());

test('moving companions do not hide the player while they step out of the wagon', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const save = freshSave();
  save.player = { x: 12.1, z: 13.5, yaw: Math.PI };
  save.settings.quality = 'low';
  save.settings.music = false;
  await page.addInitScript(
    (s) => localStorage.setItem('roadtrip.mountain.v1', JSON.stringify(s)),
    save,
  );
  await page.goto('/?test');
  await page.waitForSelector('.home-content', { timeout: 60000 });
  await page.getByRole('button', { name: 'Continue your trip' }).click();
  for (let i = 0; i < 24; i++) {
    await frames(page, 1);
    const s = await snapshot(page);
    const view = {
      x: s.position.x - s.camera.x,
      y: s.position.y + 1.23 - s.camera.y,
      z: s.position.z - s.camera.z,
    };
    const lengthSquared = view.x ** 2 + view.y ** 2 + view.z ** 2;
    for (const head of s.companionHeads) {
      const t =
        ((head.x - s.camera.x) * view.x +
          (head.y - s.camera.y) * view.y +
          (head.z - s.camera.z) * view.z) /
        lengthSquared;
      if (t <= 0 || t >= 0.92) continue;
      const distance = Math.hypot(
        head.x - s.camera.x - t * view.x,
        head.y - s.camera.y - t * view.y,
        head.z - s.camera.z - t * view.z,
      );
      expect(distance, 'A companion head must not block the view of the player').toBeGreaterThan(
        0.5,
      );
    }
  }
  await page.screenshot({ path: 'test-results/characters-companion-camera.png' });
});

test('four rebuilt expedition characters remain visible and animated from the gameplay camera', async ({
  page,
}) => {
  test.setTimeout(150000);
  await page.setViewportSize({ width: 1600, height: 900 });
  const save = freshSave();
  save.trip.seed = 12345;
  save.settings.quality = 'low';
  save.settings.music = false;
  await page.addInitScript(
    (s) => localStorage.setItem('roadtrip.mountain.v1', JSON.stringify(s)),
    save,
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?test');
  await page.waitForSelector('.home-content', { timeout: 60000 });
  await page.getByRole('button', { name: 'Continue your trip' }).click();
  await page.evaluate(() => window.__roadtrip.warp(10, 17));
  await frames(page, 18);
  let state = await snapshot(page);
  await page.evaluate((p) => window.__roadtrip.aim(9, p.y + 1.5, 0), state.position);
  await frames(page);
  state = await snapshot(page);
  expect([state.avatar.identity, ...state.party.map((p: any) => p.identity)]).toEqual([
    'Wren',
    'June',
    'Milo',
    'Nia',
  ]);
  expect(new Set([state.avatar.headColor, ...state.party.map((p: any) => p.headColor)]).size).toBe(
    4,
  );
  expect(state.thirdPerson).toBe(true);
  expect(state.avatarVisible).toBe(true);
  await page.screenshot({ path: 'test-results/characters-gameplay-party.png' });

  await page.evaluate(() => window.__roadtrip.warp(18, 18));
  await frames(page, 3);
  state = await snapshot(page);
  await page.evaluate((p) => window.__roadtrip.aim(18, p.y + 1.5, -10), state.position);
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await expect
    .poll(async () => (await snapshot(page)).position.z)
    .toBeLessThan(state.position.z - 1.5);
  let running = await snapshot(page);
  let legSwing = Math.abs(running.avatarPose.legs[0] - running.avatarPose.legs[1]);
  for (let i = 0; i < 8; i++) {
    await frames(page, 1);
    running = await snapshot(page);
    legSwing = Math.max(
      legSwing,
      Math.abs(running.avatarPose.legs[0] - running.avatarPose.legs[1]),
    );
  }
  expect(running.position.z).toBeLessThan(state.position.z - 1);
  expect(running.avatarPose.lean).toBeLessThan(-0.1);
  expect(legSwing).toBeGreaterThan(0.5);
  await page.screenshot({ path: 'test-results/characters-gameplay-running.png' });
  await page.keyboard.down('Space');
  await frames(page, 2);
  await page.keyboard.up('Space');
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  expect((await snapshot(page)).grounded).toBe(false);
  await page.screenshot({ path: 'test-results/characters-gameplay-jump.png' });
  await expect.poll(async () => (await snapshot(page)).grounded).toBe(true);

  state = await snapshot(page);
  await page.evaluate((s) => {
    const yaw = s.avatarYaw + Math.PI;
    window.__roadtrip.aim(
      s.position.x - Math.sin(yaw) * 10,
      s.position.y + 1.5,
      s.position.z - Math.cos(yaw) * 10,
    );
  }, state);
  await frames(page, 8);
  await page.screenshot({ path: 'test-results/characters-gameplay-front.png' });
  for (let i = 0; i < 8; i++) await page.locator('#world').dispatchEvent('wheel', { deltaY: 120 });
  await frames(page, 10);
  state = await snapshot(page);
  expect(state.avatarVisible).toBe(true);
  expect(
    Math.hypot(state.camera.x - state.position.x, state.camera.z - state.position.z),
  ).toBeGreaterThan(5.5);
  await page.screenshot({ path: 'test-results/characters-gameplay-distance.png' });

  // The new physical width must protect the much larger round head at a wall.
  await page.evaluate(() => window.__roadtrip.warp(35, -3));
  await frames(page, 3);
  state = await snapshot(page);
  await page.evaluate((s) => window.__roadtrip.aim(35, s.position.y + 1.5, -20), state);
  await page.keyboard.down('w');
  await frames(page, 35);
  await page.keyboard.up('w');
  expect((await snapshot(page)).position.z).toBeGreaterThan(-6.4);
  await page.screenshot({ path: 'test-results/characters-gameplay-wall.png' });
  expect(errors).toEqual([]);
});
