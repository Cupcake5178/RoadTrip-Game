import { chromium } from '@playwright/test';
const baseURL = (process.env.CHARACTER_REVIEW_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/cast-review', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<html><body style="margin:0;background:#f2eedf"><div style="position:fixed;top:28px;left:48px;font:700 22px sans-serif;color:#292841">ROAD TRIP / ORIGINAL EXPEDITION CAST</div><div style="position:fixed;bottom:28px;left:0;right:0;display:flex;justify-content:space-around;font:700 22px sans-serif;color:#292841"><span>WREN</span><span>JUNE</span><span>MILO</span><span>NIA</span></div></body></html>',
    }),
  );
  await page.goto(`${baseURL}/cast-review`);
  await page.evaluate(async () => {
    const T = await import('/node_modules/.vite/deps/three.js');
    const { createCharacter, animateCharacter } = await import('/src/character.ts');
    const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(1600, 800);
    renderer.setPixelRatio(1);
    renderer.setClearColor('#f2eedf');
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    document.body.prepend(renderer.domElement);
    const scene = new T.Scene();
    scene.add(new T.HemisphereLight('#ffffff', '#b0a9be', 2.4));
    const light = new T.DirectionalLight('#fff0d9', 3);
    light.position.set(-3, 6, -5);
    scene.add(light);
    const camera = new T.OrthographicCamera(-4.8, 4.8, 2.4, -2.4, 0.1, 50);
    camera.position.set(0, 1.1, -10);
    camera.lookAt(0, 1.1, 0);
    const cast = [0, 1, 2, 3].map((i) => {
      const actor = createCharacter(100 + i, i);
      actor.position.x = (1.5 - i) * 2.35;
      scene.add(actor);
      return actor;
    });
    window.review = (angle = 0, silhouette = false, motion = {}) => {
      scene.overrideMaterial = silhouette ? new T.MeshBasicMaterial({ color: 0x14141d }) : null;
      cast.forEach((actor, i) => {
        actor.rotation.y = angle;
        for (let n = 0; n < 45; n++) animateCharacter(actor, 1.2, 1 / 60, motion);
      });
      renderer.render(scene, camera);
      return renderer.info.render;
    };
    window.review();
  });
  for (const [name, angle, black, motion] of [
    ['front', 0, false, {}],
    ['back', Math.PI, false, {}],
    ['silhouettes', Math.PI / 2, true, {}],
    ['running', -0.45, false, { speed: 6, running: true, grounded: true }],
    ['reaching', 0.4, false, { climbing: true }],
  ]) {
    console.log(
      name,
      await page.evaluate(
        ([angle, black, motion]) => window.review(angle, black, motion),
        [angle, black, motion],
      ),
    );
    await page.screenshot({ path: `docs/characters-${name}.png` });
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
