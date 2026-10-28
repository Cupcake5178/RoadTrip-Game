import { ITEMS, cargoCapacity, cargoUsed, type Save, type ItemId, loadSave } from './state';
import { biome, clamp, nextStop, ROUTE_LENGTH, STOPS } from './route';
import { EXPEDITION_CAST } from './character';

export type Panel =
  | 'home'
  | 'pause'
  | 'intro'
  | 'packing'
  | 'store'
  | 'map'
  | 'route'
  | 'settings'
  | 'journal'
  | 'camp'
  | 'help'
  | 'upgrades'
  | 'reset'
  | 'new'
  | null;
export const icons: Record<string, string> = {
  road: '<path d="m5 21 4-18m10 18L15 3M12 4v3m0 4v3m0 4v3"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Zm6-3v15m6-12v15"/>',
  mountain: '<path d="M2 20 10 5l4 7 2-4 6 12H2Zm5-9 3 2 3-2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  tent: '<path d="m3 20 9-17 9 17H3Zm6 0 3-8 3 8M10 3l4 0"/>',
  camera: '<path d="M3 7h4l2-3h6l2 3h4v13H3Z"/><circle cx="12" cy="13" r="4"/>',
  fuel: '<path d="M4 21V4h10v17M2 21h14M6 7h6v5H6m8-6 5 4v8a2 2 0 0 0 4 0v-5l-3-3"/>',
  tool: '<path d="m14 6 4 4 4-4a6 6 0 0 1-8 8l-7 7a3 3 0 0 1-4-4l7-7a6 6 0 0 1 8-8Z"/>',
  bag: '<rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V3h8v4M8 7v14m8-14v14"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  sound: '<path d="m11 4-6 5H2v6h3l6 5V4Zm5 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  heart: '<path d="M12 21 3 12C-3 3 9-1 12 7c3-8 15-4 9 5Z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
};
export const icon = (id: string, cls = '') =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[id] ?? icons.mountain}</svg>`;
export const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
const money = (n: number) => `$${Math.floor(n)}`;
const button = (action: string, text: string, cls = '', disabled = false) =>
  `<button data-action="${action}" class="btn ${cls}" ${disabled ? 'disabled' : ''}>${text}</button>`;
const itemIcon: Record<ItemId, string> = {
  tent: 'tent',
  cooler: 'bag',
  water: 'fuel',
  tools: 'tool',
  spare: 'tool',
  camera: 'camera',
  fuel: 'fuel',
  bag: 'bag',
};

export class UI {
  root = document.getElementById('app')!;
  panel: Panel = 'home';
  hud!: HTMLElement;
  overlay!: HTMLElement;
  toastElement!: HTMLElement;
  dialogueElement!: HTMLElement;
  onAction: (action: string, value?: string) => void = () => {};
  toastTimer = 0;
  dialogueTimer = 0;
  saveWarning = false;
  constructor() {
    this.root.innerHTML = `<div id="loading"><div class="loading-mark">${icon('mountain')}</div><p>Taking the scenic route…</p></div>
      <div id="hud" hidden>
        <header class="hud-top"><div class="objective glass"><span class="eyebrow">THE MOUNTAIN WEEKEND</span><h2 id="objective-title"></h2><div id="objective-sub"></div></div>
        <div class="top-right"><div class="trip-weather glass"><span id="weather-icon">${icon('sun')}</span><span id="clock"></span><span id="weather"></span></div><div class="wallet glass"><span>TRIP BUDGET</span><strong id="money"></strong></div><button class="icon-button glass" data-action="pause" aria-label="Pause game"><svg class="icon" viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5" width="3" height="14" rx="1"/><rect x="14" y="5" width="3" height="14" rx="1"/></svg></button></div></header>
        <div id="problem-banner" hidden></div><div id="dialogue" role="status" hidden></div>
        <div class="crosshair" id="crosshair"></div><div id="photo-frame" hidden><span>ROAD TRIP · POCKET CAMERA</span><div></div><span>Click or press C to keep this moment · Esc to put away</span></div>
        <div class="hud-bottom"><div><div id="passengers"></div><div class="vehicle-hud glass"><div class="speed"><strong id="speed">0</strong><span id="speed-unit">KM/H</span></div><div class="gauges"><div><span>${icon('fuel')} FUEL <b id="fuel-value"></b></span><i><em id="fuel-bar"></em></i></div><div><span>${icon('tool')} WAGON <b id="condition-value"></b></span><i><em id="condition-bar"></em></i></div></div></div><div class="mode-label" id="mode-label"></div></div>
        <div class="route-peek glass"><div><span class="eyebrow">THE ROAD AHEAD</span><button data-action="map" aria-label="Open route map">M ${icon('map')}</button></div><svg viewBox="0 0 190 55" class="mini-route"><path d="M8 44C40 44 25 9 66 13S100 54 126 30 160 7 183 10"/><path id="route-progress" d="M8 44C40 44 25 9 66 13S100 54 126 30 160 7 183 10"/><circle id="map-car" r="5" cx="8" cy="44"/></svg><strong id="next-stop"></strong><small id="remaining"></small></div></div>
        <div id="interaction" hidden></div><div class="key-hints" id="key-hints"></div><div id="capture-flash"></div>
      </div><div id="status-rail"><div id="toast" role="status" hidden></div></div><div id="overlay"></div>`;
    this.hud = document.getElementById('hud')!;
    this.overlay = document.getElementById('overlay')!;
    this.toastElement = document.getElementById('toast')!;
    this.dialogueElement = document.getElementById('dialogue')!;
    document
      .getElementById('status-rail')!
      .prepend(document.getElementById('problem-banner')!, this.dialogueElement);
    this.root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (el && !el.hasAttribute('disabled')) this.onAction(el.dataset.action!);
    });
    this.root.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.setting) this.onAction(`setting:${el.dataset.setting}`, el.value);
    });
    this.root.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.setting)
        this.onAction(
          `setting:${el.dataset.setting}`,
          el.type === 'checkbox' ? String(el.checked) : el.value,
        );
    });
  }
  loaded() {
    document.getElementById('loading')!.remove();
  }
  show(panel: Panel, save: Save) {
    this.panel = panel;
    this.hud.hidden = !!panel;
    this.root.dataset.panel = panel ?? 'playing';
    this.overlay.className = panel ? `overlay ${panel === 'home' ? 'home-overlay' : ''}` : '';
    if (!panel) {
      this.overlay.innerHTML = '';
      return;
    }
    this.overlay.innerHTML =
      panel === 'home'
        ? this.home(save)
        : `<section class="paper ${panel === 'journal' ? 'journal-paper' : ''}" role="dialog" aria-modal="true" aria-label="${panel}">${panel !== 'intro' && panel !== 'journal' ? `<button class="paper-close icon-button" data-action="close" aria-label="Close">${icon('close')}</button>` : ''}${this.content(panel, save)}</section>`;
  }
  home(save: Save) {
    const existing = loadSave();
    return `<div class="menu-brand"><span class="brand-symbol">${icon('mountain')}</span><span>A LITTLE WAGON. A LONG WEEKEND.</span></div><div class="home-content"><div class="edition"><span></span> A SMALL ADVENTURE IN A VERY BIG WORLD</div><h1>ROAD<br><span>TRIP</span><i>Take the long way.</i></h1><p>Good company. Questionable directions.<br>A mountain weekend to remember.</p><div class="home-actions">${button(existing && !existing.trip.completed ? 'continue' : 'new', `${existing && !existing.trip.completed ? 'Continue your trip' : 'Let’s hit the road'} ${icon('arrow')}`, 'primary large')}${button('new', 'New trip', 'quiet', !existing)}${button('settings', 'Settings', 'quiet')}${button('help', 'How to play', 'quiet')}</div><div class="route-ticket"><div class="ticket-stamp">${icon('mountain')}</div><div><span class="eyebrow">YOUR FIRST ADVENTURE</span><h3>The Mountain Weekend</h3><p>Maple Hollow ${icon('arrow')} Sunrise Ridge</p></div><div class="ticket-meta">7 stops<br><span>Infinite little detours</span></div></div></div><div class="home-footer"><span>MADE FOR WANDERING</span><span>Single player · Keyboard & mouse · Headphones recommended</span><span>v0.2.1 / EXPEDITION CAST</span></div><div class="scene-caption"><i></i> Somewhere between here<br><strong>and a really good story.</strong></div>${save.completed ? `<div class="career-chip">${save.completed} weekend${save.completed > 1 ? 's' : ''} remembered · ${money(save.career)} travel rewards</div>` : ''}`;
  }
  content(panel: Panel, s: Save): string {
    const head = (eyebrow: string, title: string, desc = '') =>
      `<span class="eyebrow">${eyebrow}</span><h2>${title}</h2>${desc ? `<p class="panel-desc">${desc}</p>` : ''}`;
    if (panel === 'intro')
      return `${head('A POSTCARD FROM MAPLE HOLLOW', 'The Mountain Weekend', 'Sunrise Ridge is calling. The wagon? Mostly ready. Pick what matters, leave a little room for the unexpected.')}<div class="intro-route">${icon('bag')} Pack ${icon('arrow')} ${icon('road')} Wander ${icon('arrow')} ${icon('mountain')} Arrive</div><div class="note">Walk to a supply and press <kbd>E</kbd> to pick it up. Carry it to the open trunk and press <kbd>E</kbd> to pack. You have <strong>${cargoCapacity(s)} cargo slots</strong> — and eight things that might come in handy.<br><br>Mouse to look · <kbd>W A S D</kbd> to move · <kbd>Shift</kbd> to sprint. Press <kbd>V</kbd> to switch first/third person; scroll to zoom. Click the world to capture your mouse; <kbd>Esc</kbd> releases it.</div>${button('resume', `Let’s pack ${icon('arrow')}`, 'primary full')}`;
    if (panel === 'pause')
      return `${head('TAKE A BREATHER', 'No hurry. You’re on a trip.')}<div class="pause-list">${button('resume', `Back to the weekend ${icon('arrow')}`, 'primary')}${button('map', `${icon('map')} Route & discoveries`)}${button('packing', `${icon('bag')} Cargo & supplies`)}${button('journal', `${icon('camera')} The trip journal`)}${button('upgrades', `${icon('tool')} Wagon workshop`)}${button('settings', `${icon('sound')} Settings`)}${button('help', 'Controls & field guide')}${button('recover', 'Roadside assistance · $8 maximum')}${button('home', 'Save & return to title', 'quiet')}</div><p class="fineprint">${this.saveWarning ? 'Storage is full or unavailable. This trip is currently saved in memory only.' : 'Your trip saves automatically. Browser saves stay on this device.'}</p>`;
    if (panel === 'packing')
      return `${head('A PLACE FOR THE IMPORTANT THINGS', 'Packed for possibilities.', `${cargoUsed(s)} / ${cargoCapacity(s)} cargo slots · ${s.trip.roofSecured ? 'Roof straps secured' : 'Roof straps need securing'}`)}<div class="cargo-slots">${Array.from({ length: cargoCapacity(s) }, (_, i) => `<i class="${i < cargoUsed(s) ? 'filled' : ''}"></i>`).join('')}</div><div class="item-list">${s.trip.packed.map((id) => `<div class="item-row">${icon(itemIcon[id])}<div><strong>${ITEMS[id].name}</strong><small>${ITEMS[id].hint}</small></div><span>${ITEMS[id].slots} slot${ITEMS[id].slots > 1 ? 's' : ''}</span>${button(`unpack:${id}`, 'Unpack', 'small')}</div>`).join('') || '<p class="empty">An empty wagon is full of potential.<br>Pick up a supply and bring it to the trunk.</p>'}</div><div class="supply-summary"><span>Snacks <b>${s.trip.snacks}</b></span><span>Water <b>${s.trip.water}</b></span>${button('feed', 'Share a snack', 'small', s.trip.snacks <= 0)}${button('usefuel', 'Use fuel can', 'small', !s.trip.packed.includes('fuel'))}</div><p class="fineprint">Unpack near your parked wagon. Loose items stay in the current session; packed supplies are saved.</p>`;
    if (panel === 'store')
      return `${head('LAST CHANCE PROVISIONS', 'Small things. Big difference.', `Your budget: ${money(s.money)}. A good snack can turn a whole trip around.`)}<div class="store-grid">${(Object.entries(ITEMS) as [ItemId, (typeof ITEMS)[ItemId]][]).map(([id, item]) => `<button class="shop-item" data-action="buy:${id}" ${s.trip.packed.includes(id) || cargoUsed(s) + item.slots > cargoCapacity(s) ? 'disabled' : ''}>${icon(itemIcon[id])}<strong>${item.name}</strong><small>${item.hint}</small><span>${s.trip.packed.includes(id) ? 'Already packed' : money(item.price) + ` · ${item.slots} slots`}</span></button>`).join('')}</div><div class="shop-extras">${button('buysnack', 'Snack refill · $5', '', s.money < 5)}${button('buywater', 'Water refill · $4', '', s.money < 4)}${button('repairshop', 'Full wagon service · $22', '', s.money < 22)}</div><p class="fineprint">Purchased supplies go straight into your wagon. No delivery fee. It’s a small town.</p>`;
    if (panel === 'map')
      return `${head('THE LONG WAY IS THE GOOD WAY', 'A weekend, unfolding.', `${(Math.max(0, ROUTE_LENGTH + s.vehicle.z) / 1000).toFixed(1)} km to Sunrise Ridge · Route: ${s.trip.route === 'undecided' ? 'choose at The Fork' : s.trip.route}`)}<div class="route-list">${STOPS.map((stop, i) => `<div class="route-stop ${s.trip.discoveries.includes(stop.id) ? 'visited' : ''} ${Math.abs(-s.vehicle.z - stop.s) < 170 ? 'here' : ''}"><div class="route-number">${s.trip.discoveries.includes(stop.id) ? icon('check') : `0${i + 1}`}</div><div><strong>${stop.name}</strong><small>${stop.description}</small></div><span>${(stop.s / 1000).toFixed(1)} km</span></div>`).join('')}</div><div class="note">Discover stops on foot. Pack a camera for scenic photo rewards. Choose a road at The Fork, solve a roadside problem, and make camp before your final climb.</div>`;
    if (panel === 'route')
      return `${head('TWO ROADS. BOTH A STORY.', 'Which way feels right?', 'June has a map. Milo has a feeling. One of them is upside down.')}<div class="route-options"><button class="route-option" data-action="route:highway">${icon('road')}<span class="eyebrow">THE SENSIBLE WAY</span><h3>Stay on the highway</h3><p>Smooth asphalt, easy corners, a happier planner. The steady choice.</p><span>June approves. Mostly.</span></button><button class="route-option" data-action="route:shortcut">${icon('mountain')}<span class="eyebrow">THE SCENIC WAY</span><h3>Pinecone trail</h3><p>A bumpy dirt loop through the pines. Bring secured cargo and a sense of humor.</p><span>Milo is already pointing.</span></button></div>`;
    if (panel === 'settings')
      return `${head('MAKE YOURSELF COMFORTABLE', 'Your kind of weekend.')}<div class="settings-list"><label>Master volume <output>${Math.round(s.settings.volume * 100)}%</output><input aria-label="Master volume" data-setting="volume" type="range" min="0" max="1" step=".05" value="${s.settings.volume}"></label><label>Mouse sensitivity <output>${s.settings.sensitivity.toFixed(1)}</output><input aria-label="Mouse sensitivity" data-setting="sensitivity" type="range" min=".3" max="2" step=".1" value="${s.settings.sensitivity}"></label><label>Field of view <output>${s.settings.fov}°</output><input aria-label="Field of view" data-setting="fov" type="range" min="60" max="95" step="1" value="${s.settings.fov}"></label><label>Graphics quality<select aria-label="Graphics quality" data-setting="quality"><option value="high" ${s.settings.quality === 'high' ? 'selected' : ''}>High · shadows & crisp scenery</option><option value="low" ${s.settings.quality === 'low' ? 'selected' : ''}>Low · gentler on your laptop</option></select></label><label class="check-setting">Third-person walking camera<input aria-label="Third-person walking camera" type="checkbox" data-setting="thirdPerson" ${s.settings.thirdPerson !== false ? 'checked' : ''}></label><label class="check-setting">Original road-trip radio<input aria-label="Music" type="checkbox" data-setting="music" ${s.settings.music ? 'checked' : ''}></label></div><div class="shop-extras">${button('fullscreen', 'Toggle fullscreen')}${button('reset', 'Reset all saves', 'danger')}</div><p class="fineprint">Desktop keyboard and mouse required. Audio begins after you start playing.</p>`;
    if (panel === 'camp')
      return `${head('PINECONE CAMP', 'A little closer to the stars.', s.trip.campStage >= 3 ? 'Morning already? The wagon smells faintly of toasted marshmallows.' : 'Put the road on pause. Your crew could use a little fresh air.')}<div class="camp-steps">${['Pitch the tent', 'Light the contained campfire', 'Cook a little supper', 'Sleep until morning'].map((text, i) => `<div><span class="step-dot ${s.trip.campStage > i ? 'done' : ''}">${s.trip.campStage > i ? '✓' : i + 1}</span>${text}</div>`).join('')}</div>${button('campaction', s.trip.campStage === 0 ? (s.trip.packed.includes('tent') ? 'Pitch your tent' : 'Rent a tent · $12') : s.trip.campStage === 1 ? 'Light the campfire' : s.trip.campStage === 2 ? 'Cook supper · 1 snack or $5' : 'Sleep until morning', 'primary full')}`;
    if (panel === 'journal')
      return `${head(s.trip.completed ? 'THE MOUNTAIN WEEKEND · COMPLETE' : 'THE MOUNTAIN WEEKEND · IN PROGRESS', s.trip.completed ? 'The long way was worth it.' : 'Collecting little moments.', s.trip.completed ? 'The wagon made it. So did the snacks. Mostly.' : 'Every stop has a story. Here’s yours so far.')}<div class="journal-rating">${s.trip.completed ? '★'.repeat(s.trip.rating) + '☆'.repeat(5 - s.trip.rating) : icon('road')}${s.trip.completed ? `<span>+${money(s.trip.reward)} travel rewards</span>` : ''}</div><div class="journal-stats"><div><strong>${(s.trip.distance / 1000).toFixed(1)}<small> km</small></strong><span>WANDERED</span></div><div><strong>${s.trip.fuelUsed.toFixed(1)}<small> L</small></strong><span>FUEL USED</span></div><div><strong>${money(s.trip.spent)}</strong><span>SPENT</span></div><div><strong>${s.trip.discoveries.length}</strong><span>STOPS FOUND</span></div><div><strong>${s.trip.repairs}</strong><span>ROADSIDE FIXES</span></div><div><strong>${s.trip.photos.length}</strong><span>MEMORIES KEPT</span></div></div>${s.trip.photos.length ? `<div class="photo-strip">${s.trip.photos.map((p) => `<figure><img src="${p.image}" alt="Photo at ${esc(p.label)}"><figcaption>${esc(p.label)}</figcaption></figure>`).join('')}</div>` : '<div class="empty photo-empty">' + icon('camera') + '<p>Some moments deserve a photograph.<br>Press C anywhere to keep one.</p></div>'}<div class="journal-moments">${s.trip.moments
        .slice(-8)
        .map((m) => `<p><span>✦</span>${esc(m.text)}</p>`)
        .join(
          '',
        )}</div><div class="shop-extras">${s.trip.completed ? button('replay', 'Another weekend? ' + icon('arrow'), 'primary') + button('upgrades', 'Spend your travel rewards') + button('home', 'Title screen', 'quiet') : button('resume', 'More road. More stories. ' + icon('arrow'), 'primary')}</div>${s.trip.completed ? '<p class="fineprint">Unlocked: Golden-hour remix · New weather, new roadside surprises. Your rewards carry into the next trip.</p>' : ''}`;
    if (panel === 'upgrades')
      return `${head('THE WAGON WORKSHOP', 'A little love goes a long way.', `Travel rewards: ${money(s.career)}. Upgrades carry into every weekend.`)}<div class="upgrade-list">${[
        {
          id: 'rack',
          name: 'Room for one more',
          desc: 'A bigger roof rack. 14 cargo slots.',
          price: 90,
        },
        {
          id: 'tires',
          name: 'Happy trails tires',
          desc: 'A little more grip and a little more go.',
          price: 120,
        },
        {
          id: 'tune',
          name: 'A proper tune-up',
          desc: 'Better acceleration. 18% less fuel used.',
          price: 150,
        },
      ]
        .map(
          (u) =>
            `<div class="item-row">${icon('tool')}<div><strong>${u.name}</strong><small>${u.desc}</small></div>${button('upgrade:' + u.id, s.upgrades.includes(u.id) ? 'Fitted ✓' : money(u.price), 'small', s.upgrades.includes(u.id) || s.career < u.price)}</div>`,
        )
        .join(
          '',
        )}</div><div class="paint-options"><span>Pick a little personality</span>${['#ce7957', '#7b9d94', '#d4b15e', '#91a6b4'].map((col) => `<button class="paint-swatch" style="--swatch:${col}" data-action="paint:${col}" aria-label="Paint wagon ${col}">${s.vehicle.paint === col ? '✓' : ''}</button>`).join('')}</div>`;
    if (panel === 'help')
      return `${head('THE GLOVEBOX FIELD GUIDE', 'A few things before you go.')}<div class="controls-grid">${[
        ['W A S D / arrows', 'Walk / drive'],
        ['Mouse / wheel', 'Look around / zoom camera'],
        ['Click world', 'Capture mouse'],
        ['E', 'Interact / enter / exit'],
        ['Shift / Space', 'Sprint / jump (handbrake in car)'],
        ['Q / G', 'Drop / throw carried item'],
        ['F / H / V', 'Headlights / horn / camera view'],
        ['C', 'Camera / take photograph'],
        ['M / Tab', 'Route map / cargo'],
        ['Esc / P', 'Pause / release mouse'],
        ['R', 'Roadside assistance'],
      ]
        .map(([key, val]) => `<kbd>${key}</kbd><span>${val}</span>`)
        .join(
          '',
        )}</div><div class="note"><strong>Little things that help</strong><br>Look at an object to see its prompt. Bring picked-up supplies to the trunk. Open the driver’s door, then interact again to enter. Stop before getting out.<br><br>A flat needs a spare and tools; overheating needs water. Don’t have them? The repair prompt offers an affordable tow-service fix. Assistance never strands you for lack of money.<br><br>Click a pump with E while your wagon is parked nearby. Enter the store for provisions. At camp, use the marked pitch. Take a photo at Mirror Lake. Reach the ridge and interact with the overlook to finish.</div>`;
    if (panel === 'reset')
      return `${head('START A CLEAN PAGE?', 'Reset every saved weekend?', 'This removes the current trip, journal photos, settings, and travel rewards from this browser.')}<div class="shop-extras">${button('confirmreset', 'Yes, reset all saves', 'danger')}${button('close', 'Keep my memories', 'primary')}</div>`;
    if (panel === 'new')
      return `${head('A FRESH WEEKEND', 'Leave this trip behind?', 'Your earned travel rewards and upgrades stay. The current unfinished trip will be replaced.')}<div class="shop-extras">${button('confirmnew', 'Start a new weekend', 'primary')}${button('close', 'Keep wandering')}</div>`;
    return '';
  }
  update(
    s: Save,
    speed: number,
    driving: boolean,
    holding: ItemId | null,
    targetText: string,
    targetHint: string,
    timer: number,
    headlights: boolean,
    photoMode: boolean,
    holdingProp?: string | null,
  ) {
    const byId = (id: string) => document.getElementById(id)!;
    const pos = clamp(-s.vehicle.z, 0, ROUTE_LENGTH),
      stop = nextStop(pos);
    let objective = !s.trip.departed ? 'Pack a little adventure.' : `${stop.name} is up ahead.`;
    let sub = !s.trip.departed
      ? 'Choose your supplies. Bring them to the trunk.'
      : `${biome(pos)} · ${(Math.max(0, stop.s - pos) / 1000).toFixed(1)} km to the next stop`;
    if (s.trip.problem) {
      objective =
        s.trip.problem === 'flat'
          ? 'A tiny roadside adventure.'
          : s.trip.problem === 'heat'
            ? 'The wagon needs a breather.'
            : 'Your roof rack is doing a dance.';
      sub = 'Pull over, step out, and inspect the wagon.';
    }
    if (pos > 7000) {
      objective = 'Welcome to Sunrise Ridge.';
      sub = 'Park, step out, and walk to the overlook.';
    }
    byId('objective-title').textContent = objective;
    byId('objective-sub').textContent = sub;
    byId('money').textContent = money(s.money);
    const hour = (s.trip.elapsed / 65 + (s.trip.seed % 2 ? 15 : 10)) % 24;
    byId('clock').textContent = `${Math.floor(hour).toString().padStart(2, '0')}:${Math.floor(
      (hour % 1) * 60,
    )
      .toString()
      .padStart(2, '0')}`;
    byId('weather').textContent = s.trip.weather;
    byId('speed').textContent = driving ? String(Math.round(Math.abs(speed) * 3.6)) : 'ON';
    byId('speed-unit').textContent = driving ? 'KM/H' : 'FOOT';
    byId('fuel-value').textContent = `${Math.round(s.vehicle.fuel)}%`;
    byId('fuel-bar').style.width = `${s.vehicle.fuel}%`;
    byId('condition-value').textContent = `${Math.round(s.vehicle.condition)}%`;
    byId('condition-bar').style.width = `${s.vehicle.condition}%`;
    byId('fuel-bar').className = s.vehicle.fuel < 22 ? 'low' : '';
    byId('condition-bar').className = s.vehicle.condition < 50 ? 'low' : '';
    byId('mode-label').textContent = driving
      ? `THE WANDER WAGON · ${headlights ? 'LIGHTS ON' : 'SLOW DAYS AHEAD'}`
      : holding
        ? `CARRYING · ${ITEMS[holding].name.toUpperCase()}`
        : holdingProp
          ? 'CARRYING · ROADSIDE TREASURE'
          : 'TAKE YOUR TIME. LOOK AROUND.';
    byId('next-stop').textContent = stop.name;
    byId('remaining').textContent =
      `${(Math.max(0, ROUTE_LENGTH - pos) / 1000).toFixed(1)} km to the ridge`;
    const path = byId('route-progress') as unknown as SVGPathElement;
    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len * (pos / ROUTE_LENGTH)} ${len}`;
    const point = path.getPointAtLength((len * pos) / ROUTE_LENGTH);
    byId('map-car').setAttribute('cx', String(point.x));
    byId('map-car').setAttribute('cy', String(point.y));
    const passengers = byId('passengers');
    passengers.innerHTML = s.passengers
      .map(
        (p) =>
          `<div class="passenger-chip"><span style="background:${EXPEDITION_CAST.find((c) => c.name === p.name)?.head ?? p.color}">${p.name[0]}</span><div><strong>${p.name}</strong><small>${p.hunger > 70 ? 'Could use a snack' : p.energy < 30 ? 'Ready for a rest' : p.mood > 70 ? 'Loving the long way' : p.mood > 40 ? 'Along for the ride' : 'Needs a little cheering up'}</small></div></div>`,
      )
      .join('');
    byId('problem-banner').hidden = !s.trip.problem;
    byId('problem-banner').textContent =
      s.trip.problem === 'flat'
        ? 'FLAT TIRE · Safe to roll slowly. Stop and inspect the front wheel.'
        : s.trip.problem === 'heat'
          ? 'WARM ENGINE · Pull over and inspect the hood.'
          : 'LOOSE CARGO · Pull over and secure the roof rack.';
    const interaction = byId('interaction');
    interaction.hidden = !targetText || !!this.panel || photoMode;
    interaction.innerHTML = targetText
      ? `<kbd>E</kbd><div><strong>${esc(targetText)}</strong>${targetHint ? `<small>${esc(targetHint)}</small>` : ''}</div>${timer > 0 ? `<i class="hold-progress" style="width:${timer * 100}%"></i>` : ''}`
      : '';
    byId('key-hints').innerHTML = driving
      ? '<span><kbd>W S</kbd> Go / brake</span><span><kbd>A D</kbd> Steer</span><span><kbd>E</kbd> Get out</span><span><kbd>V</kbd> Camera</span><span><kbd>M</kbd> Map</span>'
      : `<span><kbd>W A S D</kbd> Walk</span><span><kbd>E</kbd> Interact</span><span><kbd>${holding || holdingProp ? 'Q / G' : 'C'}</kbd> ${holding || holdingProp ? 'Drop / throw' : 'Photo'}</span><span><kbd>V</kbd> View</span><span><kbd>Tab</kbd> Supplies</span><span><kbd>P</kbd> Pause</span>`;
    byId('photo-frame').hidden = !photoMode;
    byId('crosshair').hidden = photoMode;
  }
  toast(text: string, kind = '') {
    clearTimeout(this.toastTimer);
    this.toastElement.hidden = false;
    this.toastElement.className = `toast ${kind}`;
    this.toastElement.textContent = text;
    this.toastTimer = window.setTimeout(() => (this.toastElement.hidden = true), 4800);
  }
  dialogue(name: string, text: string) {
    clearTimeout(this.dialogueTimer);
    this.dialogueElement.hidden = false;
    this.dialogueElement.innerHTML = `<span class="dialogue-avatar">${name[0]}</span><div><strong>${esc(name)}</strong><p>“${esc(text)}”</p></div>`;
    this.dialogueTimer = window.setTimeout(() => (this.dialogueElement.hidden = true), 7000);
  }
  flash() {
    const el = document.getElementById('capture-flash')!;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }
}
