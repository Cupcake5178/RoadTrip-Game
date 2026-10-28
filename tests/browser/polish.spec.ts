import { test, expect, type Page } from '@playwright/test';
import { freshSave } from '../../src/state';
import { roadX } from '../../src/route';

async function frames(page: Page, count = 2) {
  for (let i = 0; i < count; i++)
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
}
async function key(page: Page, key: string) {
  await page.keyboard.down(key);
  await frames(page, 2);
  await page.keyboard.up(key);
  await frames(page, 2);
}
const state = (page: Page) => page.evaluate(() => window.__roadtrip.snapshot());
async function start(page: Page) {
  const save = freshSave();
  save.settings.quality = 'low';
  save.settings.music = false;
  await page.addInitScript(
    (s) => localStorage.setItem('roadtrip.mountain.v1', JSON.stringify(s)),
    save,
  );
  await page.goto('/?test');
  await page.waitForSelector('.home-content', { timeout: 60000 });
  await page.getByRole('button', { name: 'Continue your trip' }).click();
  await frames(page, 3);
}
async function approach(page: Page, id: string, dx = 0, dz = 1.8) {
  const p = await page.evaluate((id) => window.__roadtrip.target(id), id);
  expect(p).toBeTruthy();
  await page.evaluate(({ p, dx, dz }) => window.__roadtrip.warp(p.x + dx, p.z + dz), { p, dx, dz });
  await frames(page, 2);
  await page.evaluate((p) => window.__roadtrip.aim(p.x, p.y, p.z), p);
  await expect.poll(async () => (await state(page)).target).toBe(id);
}
async function overlapIssues(page: Page, selectors: string[]) {
  return page.evaluate((selectors) => {
    const nodes = selectors
      .flatMap((s) => Array.from(document.querySelectorAll<HTMLElement>(s)))
      .filter((n) => n.checkVisibility());
    const issues: string[] = [];
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i],
          b = nodes[j];
        if (a.contains(b) || b.contains(a)) continue;
        const ar = a.getBoundingClientRect(),
          br = b.getBoundingClientRect();
        if (
          Math.min(ar.right, br.right) - Math.max(ar.left, br.left) > 2 &&
          Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top) > 2
        )
          issues.push(`${a.id || a.className} overlaps ${b.id || b.className}`);
      }
    return issues;
  }, selectors);
}

for (const [width, height] of [
  [1920, 1080],
  [1600, 900],
  [1366, 768],
]) {
  test(`every menu and the busy HUD fit ${width}×${height}`, async ({ page }) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width, height });
    await start(page);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const panel of [
      'home',
      'intro',
      'pause',
      'packing',
      'store',
      'map',
      'route',
      'settings',
      'journal',
      'camp',
      'help',
      'upgrades',
      'reset',
      'new',
    ]) {
      await page.evaluate((panel) => window.__roadtrip.panel(panel), panel);
      await frames(page);
      const issues = await page.evaluate(() => {
        const paper = document.querySelector<HTMLElement>('.paper');
        const result: string[] = [];
        if (paper) {
          const r = paper.getBoundingClientRect();
          if (r.left < 12 || r.top < 12 || r.right > innerWidth - 12 || r.bottom > innerHeight - 12)
            result.push('Panel outside viewport');
          if (paper.scrollWidth > paper.clientWidth + 2) result.push('Panel horizontal overflow');
        }
        for (const n of document.querySelectorAll<HTMLElement>(
          '.paper .btn,.paper h2,.paper .shop-item,.home-actions .btn',
        ))
          if (n.scrollWidth > n.clientWidth + 2)
            result.push(`Text overflow: ${n.textContent?.slice(0, 40)}`);
        return result;
      });
      expect(issues, `${panel} layout`).toEqual([]);
      if (panel !== 'home') {
        await page.evaluate(() => window.__roadtrip.messages());
        expect(await overlapIssues(page, ['.paper', '#toast']), `${panel} feedback`).toEqual([]);
      }
      if (panel === 'home') {
        expect(
          await overlapIssues(page, [
            '.edition',
            'h1',
            'h1 > i',
            '.home-content > p',
            '.home-actions',
            '.route-ticket',
            '.home-footer',
          ]),
        ).toEqual([]);
        await page.screenshot({ path: `test-results/polish-home-${width}.png` });
      }
      if (panel === 'store')
        await page.screenshot({ path: `test-results/polish-store-${width}.png` });
    }
    await page.evaluate(() => window.__roadtrip.panel(null));
    await approach(page, 'trunk', 0, 2);
    await page.evaluate(() => window.__roadtrip.messages());
    await frames(page, 3);
    expect(
      await overlapIssues(page, [
        '.objective',
        '.top-right',
        '.vehicle-hud',
        '.route-peek',
        '#status-rail',
        '#interaction',
        '.key-hints',
      ]),
    ).toEqual([]);
    await page.screenshot({ path: `test-results/polish-hud-${width}.png` });
    const snapshot = await state(page);
    expect(snapshot.triangles).toBeLessThan(350000);
    expect(snapshot.drawCalls).toBeLessThan(650);
    console.log(
      `${width}×${height}: ${snapshot.drawCalls} draws, ${snapshot.triangles} triangles; menus and HUD fit.`,
    );
    expect(errors).toEqual([]);
  });
}

test('walking cannot pass through the car, house, fence, sign, pump, picnic table, trees or rocks', async ({
  page,
}) => {
  test.setTimeout(300000);
  await start(page);
  const obstacles = await page.evaluate(() => window.__roadtrip.obstacles());
  const tree = obstacles.find(
    (o: any) =>
      o.id.startsWith('tree trunks:') &&
      Math.abs(o.center.z) < 200 &&
      Math.abs(o.center.x) < 120 &&
      o.half.x > 0.3,
  );
  const rock = obstacles.find(
    (o: any) =>
      o.id.startsWith('large rocks:') &&
      Math.abs(o.center.z) < 250 &&
      Math.abs(o.center.x) < 140 &&
      o.half.x > 1.4 &&
      o.half.x < 3,
  );
  expect(tree).toBeTruthy();
  expect(rock).toBeTruthy();
  const fx = roadX(1100);
  const cases = [
    { name: 'car', x: 9, z: 13.5, limit: 10.55 },
    { name: 'house wall', x: 35, z: -3, limit: -6.65 },
    { name: 'fence rail', x: 24, z: -11, limit: -11.75 },
    { name: 'sign post', x: 20.72, z: 0, limit: -3.65 },
    { name: 'fuel pump', x: fx + 13, z: -1089, limit: -1092.55 },
    { name: 'picnic furniture', x: 22, z: 15, limit: 12.0 },
    {
      obstacle: tree,
      name: 'tree trunk',
      x: tree.center.x,
      z: tree.center.z + tree.half.z + 3,
      limit: tree.center.z + 0.15,
    },
    {
      obstacle: rock,
      name: 'large rock',
      x: rock.center.x,
      z: rock.center.z + rock.half.z + 3,
      limit: rock.center.z + 0.2,
    },
  ];
  for (const c of cases) {
    await page.evaluate((c) => window.__roadtrip.warp(c.x, c.z), c);
    await frames(page, 2);
    await page.evaluate((c) => {
      const s = window.__roadtrip.snapshot();
      window.__roadtrip.aim(c.x, s.position.y + 1.5, c.z - 10);
    }, c);
    await page.keyboard.down('w');
    let clearance = Infinity;
    for (let frame = 0; frame < 48; frame++) {
      await frames(page, 1);
      if ('obstacle' in c) {
        const actor = (await state(page)).position,
          o = c.obstacle;
        let dy = 0;
        if (o.kind === 'ball')
          dy = Math.max(actor.y + 0.3, Math.min(actor.y + 1.3, o.center.y)) - o.center.y;
        const radius = Math.max(o.half.x, o.half.z, o.kind === 'ball' ? o.half.y : 0);
        clearance = Math.min(
          clearance,
          Math.hypot(actor.x - o.center.x, dy, actor.z - o.center.z) - radius,
        );
      }
    }
    await page.keyboard.up('w');
    await frames(page, 2);
    const s = await state(page);
    if ('obstacle' in c)
      expect(
        clearance,
        `Capsule stays outside ${c.name}, including when it slides around it`,
      ).toBeGreaterThan(0.245);
    else expect(s.position.z, `Stopped by ${c.name}`).toBeGreaterThan(c.limit);
    expect(s.position.y).toBeGreaterThan(-3);
  }
  // Deliberately run and jump into the house: the capsule must still remain outside.
  await page.evaluate(() => window.__roadtrip.warp(35, -4));
  await frames(page, 2);
  await page.evaluate(() => {
    const s = window.__roadtrip.snapshot();
    window.__roadtrip.aim(35, s.position.y + 1.5, -15);
  });
  await page.keyboard.down('w');
  await key(page, 'Space');
  await frames(page, 35);
  await page.keyboard.up('w');
  expect((await state(page)).position.z).toBeGreaterThan(-6.65);
});

test('parking beside a wall chooses a clear vehicle exit', async ({ page }) => {
  await start(page);
  await page.evaluate(() => window.__roadtrip.warp(43.8, -12, true));
  await frames(page, 4);
  await key(page, 'e');
  const exited = await state(page);
  expect(exited.mode).toBe('walking');
  expect(exited.position.x).toBeGreaterThan(45);
});

test('third-person camera, jump/landing, throwing, travelers, vending and seating remain playable', async ({
  page,
}) => {
  test.setTimeout(180000);
  await start(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  expect((await state(page)).thirdPerson).toBe(true);
  await page.evaluate(() => window.__roadtrip.warp(18, 14));
  await frames(page, 5);
  const first = await state(page);
  await key(page, 'Space');
  await expect.poll(async () => (await state(page)).grounded).toBe(false);
  await expect.poll(async () => (await state(page)).grounded, { timeout: 15000 }).toBe(true);
  expect((await state(page)).audioEvents.jump).toBeGreaterThan(0);
  expect((await state(page)).audioEvents.land).toBeGreaterThan(0);
  await key(page, 'v');
  expect((await state(page)).thirdPerson).toBe(false);
  await key(page, 'v');
  expect((await state(page)).thirdPerson).toBe(true);
  await approach(page, 'junk:prop:mug0');
  await key(page, 'e');
  expect((await state(page)).holdingProp).toBe('prop:mug0');
  await key(page, 'g');
  expect((await state(page)).holdingProp).toBeNull();
  expect((await state(page)).audioEvents.throw).toBeGreaterThan(0);
  await approach(page, 'npc:sol');
  await key(page, 'e');
  await expect(page.locator('#dialogue')).toContainText('Sol');
  await approach(page, 'vending:1100');
  const budget = (await state(page)).save.money;
  await key(page, 'e');
  const after = await state(page);
  expect(after.save.money).toBe(budget - 3);
  expect(after.save.trip.snacks).toBe(2);
  expect(after.audioEvents.vending).toBeGreaterThan(0);
  await approach(page, 'seat:lake', 0, -1.8);
  await key(page, 'e');
  expect((await state(page)).seated).toBe(true);
  await key(page, 'e');
  expect((await state(page)).seated).toBe(false);
  // Inside the shop, orbit toward the rear wall. The camera must shorten its boom safely.
  const store = await page.evaluate(() => window.__roadtrip.target('store'));
  await page.evaluate((p) => window.__roadtrip.warp(p.x - 6, p.z - 0.5), store);
  await frames(page, 4);
  await page.evaluate((p) => window.__roadtrip.aim(p.x + 7, p.y, p.z), store);
  await frames(page, 5);
  const indoor = await state(page);
  expect(indoor.cameraClearance).toBeGreaterThan(0.97);
  expect(indoor.cameraObstructed).toBe(true);
  await page.screenshot({ path: 'test-results/polish-interior-camera.png' });
  await key(page, 'h');
  expect((await state(page)).audioEvents.horn).toBeGreaterThan(0);
  await expect.poll(async () => (await state(page)).audioLevel).toBeGreaterThan(0);
  await key(page, 'p');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('slider', { name: 'Master volume' }).focus();
  await page.keyboard.press('Home');
  await expect(page.getByRole('slider', { name: 'Master volume' })).toHaveValue('0');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('slider', { name: 'Master volume' })).not.toHaveValue('0');
  await page.keyboard.press('Home');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('slider', { name: 'Mouse sensitivity' })).toBeFocused();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: /Back to the weekend/ }).click();
  await frames(page, 12);
  expect((await state(page)).audioLevel).toBeLessThan(0.001);
  expect(errors).toEqual([]);
  expect(first.avatar.seed).toBeDefined();
});
