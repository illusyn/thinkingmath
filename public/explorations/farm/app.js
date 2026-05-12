/* Thinking Math — lobby of framed stages.
   Vanilla port of the prototype's React app.jsx + tweaks-panel.jsx. */

const TWEAK_DEFAULTS = {
  transition: 'frameExpand',
  neighborPeek: 30,
  easeMs: 1000,
  lobbyTone: 'parchment',
  showFootlights: true,
  cylinder: true,
  drum: 18,
  settle: 0.00005,
};

const FARM_IMG = { fox: 'fox.jpg', rabbit: 'rabbit.jpg', farmer: 'farmer.jpg' };
const COLORED_BG = 'colored-bg.jpg';

const STAGES = [
  { id: 'farm',    title: 'The Farm',
    prompt: 'Can you keep the rabbits away from the foxes?',
    kind: 'wood', foyer: 'farm' },
  { id: 'colored', title: 'Colored Squares',
    prompt: 'A small grid that wants something beside it.',
    kind: 'marble', foyer: 'colored' },
  { id: 'soon',    title: 'Logical Shapes',
    prompt: 'Opening soon.',
    kind: 'navy', foyer: null },
];

const TWEAKS_KEY = 'thinkingmath.tweaks';
function loadTweaks() {
  try {
    const raw = localStorage.getItem(TWEAKS_KEY);
    if (!raw) return { ...TWEAK_DEFAULTS };
    return { ...TWEAK_DEFAULTS, ...JSON.parse(raw) };
  } catch { return { ...TWEAK_DEFAULTS }; }
}
function saveTweaks(t) {
  try { localStorage.setItem(TWEAKS_KEY, JSON.stringify(t)); } catch {}
}

const state = {
  view: 'lobby',
  focusIndex: 0,
  tweaks: loadTweaks(),
  tweaksOpen: false,
};

const root = document.getElementById('root');
const tweaksHost = document.getElementById('tweaks-host');
const gearBtn = document.getElementById('tweaks-gear');

/* cleanup callbacks for the currently-mounted view (resize listeners, raf, etc) */
const teardowns = [];

function setTweak(key, val) {
  state.tweaks[key] = val;
  saveTweaks(state.tweaks);
  renderApp();
  /* leave the panel itself in place — each control updates its own display */
}

function setView(view) {
  state.view = view;
  renderApp();
}

/* ---------- previews ---------- */
function previewHTML(kind) {
  if (kind === 'wood') {
    const cells = ['rabbit','fox','rabbit','farmer','farmer','fox','rabbit','farmer','fox'];
    return `<div class="farm-mini">${cells.map(c =>
      `<div class="farm-mini-cell"><img src="${FARM_IMG[c]}" alt="" draggable="false"></div>`
    ).join('')}</div>`;
  }
  if (kind === 'marble') {
    const palette = ['Y','Y','R','Y','Y','B','Y','R','B','Y','B','R','Y','R','B','Y'];
    return `<div class="cs-mini" style="background-image: url(${COLORED_BG})"><div class="cs-mini-grid">${
      palette.map(c => `<div class="cs-tile cs-${c}"></div>`).join('')
    }</div></div>`;
  }
  return `<div class="mystery-mini"><svg viewBox="0 0 120 120" width="100%" height="100%">
    <rect x="6" y="6" width="108" height="108" fill="none" stroke="#f3e8c8" stroke-width="2"/>
    <circle cx="40" cy="40" r="18" fill="none" stroke="#f3e8c8" stroke-width="2"/>
    <circle cx="40" cy="40" r="6" fill="#d4a017"/>
    <polygon points="80,28 96,58 64,58" fill="none" stroke="#f3e8c8" stroke-width="2"/>
    <rect x="32" y="72" width="56" height="32" fill="none" stroke="#f3e8c8" stroke-width="2"/>
    <circle cx="60" cy="88" r="10" fill="#c0392b"/>
  </svg></div>`;
}

function makeStage(stage, active) {
  const div = document.createElement('div');
  div.className = `stage stage-${stage.kind}${active ? ' active' : ''}`;
  if (active && stage.foyer) {
    div.setAttribute('role', 'button');
    div.tabIndex = 0;
  } else {
    div.tabIndex = -1;
  }
  div.innerHTML = `
    <div class="stage-frame">
      <div class="stage-window">${previewHTML(stage.kind)}</div>
      <div class="stage-corner stage-corner-tl"></div>
      <div class="stage-corner stage-corner-tr"></div>
      <div class="stage-corner stage-corner-bl"></div>
      <div class="stage-corner stage-corner-br"></div>
    </div>
    <p class="stage-caption">${stage.prompt}</p>
    ${stage.foyer
      ? '<div class="stage-cta">step inside</div>'
      : '<div class="stage-closed">opening soon</div>'}
    ${state.tweaks.showFootlights ? '<div class="footlights" aria-hidden="true"></div>' : ''}
  `;
  return div;
}

/* ---------- Lobby ---------- */
function mountLobby(parent) {
  const lobby = document.createElement('div');
  lobby.className = 'lobby';
  lobby.innerHTML = `
    <header class="lobby-head">
      <a href="#" class="logo-link" aria-label="Thinking Math, home">
        <img src="/logo.svg" alt="" style="width:56px;height:56px;display:block">
      </a>
      <div class="wordmark">
        <div class="wm-line">Thinking Math</div>
        <div class="wm-sub">a small lobby of puzzles · thinkingmath.org</div>
      </div>
    </header>
  `;
  lobby.querySelector('.logo-link').addEventListener('click', (e) => {
    e.preventDefault(); window.location.reload();
  });
  parent.appendChild(lobby);
  mountCarousel(lobby);
}

function mountCarousel(parent) {
  const wrap = document.createElement('div');
  wrap.className = `carousel-wrap${state.tweaks.cylinder ? ' is-cylinder' : ''}`;
  wrap.innerHTML = `
    <div class="carousel-label">
      <span class="step-mark">↞</span>
      <span>push to glide</span>
      <span class="step-mark">↠</span>
    </div>
    <div class="carousel-track">
      <div class="track-inner"></div>
    </div>
    <div class="carousel-controls">
      <button class="arrow prev" aria-label="Previous">‹</button>
      <div class="dots"></div>
      <button class="arrow next" aria-label="Next">›</button>
    </div>
  `;
  parent.appendChild(wrap);

  const track = wrap.querySelector('.carousel-track');
  const inner = wrap.querySelector('.track-inner');
  const dots = wrap.querySelector('.dots');
  track.style.setProperty('--peek', state.tweaks.neighborPeek + '%');

  const layout = { slotW: 540, sidePad: 0 };
  const animRef = { raf: 0 };
  const drag = { active: false, startX: 0, lastX: 0, scrollLeft: 0, moved: 0, lastT: 0, vel: 0, downSlot: -1 };

  function cancelAnim() {
    if (animRef.raf) { cancelAnimationFrame(animRef.raf); animRef.raf = 0; }
  }

  function recalc() {
    const tw = track.clientWidth;
    const slotW = Math.round(tw * (1 - state.tweaks.neighborPeek / 100));
    const sidePad = Math.round((tw - slotW) / 2);
    track.style.setProperty('--slot-w', slotW + 'px');
    track.style.setProperty('--side-pad', sidePad + 'px');
    layout.slotW = slotW;
    layout.sidePad = sidePad;
  }

  function paint() {
    const slots = track.querySelectorAll('.slot');
    const slotW = layout.slotW || 1;
    const sidePad = layout.sidePad || 0;
    const center = track.scrollLeft + track.clientWidth / 2;
    const drum = state.tweaks.cylinder ? state.tweaks.drum : 0;
    slots.forEach((el, i) => {
      const slotCenter = sidePad + i * slotW + slotW / 2;
      const rel = (slotCenter - center) / slotW;
      if (Math.abs(rel) < 0.02) {
        el.style.transform = 'none';
        el.style.opacity = '1';
        el.style.zIndex = '100';
        return;
      }
      const clamped = Math.max(-1.4, Math.min(1.4, rel));
      const eased = Math.sign(clamped) * Math.pow(Math.abs(clamped), 1.15);
      const rotY = eased * drum;
      const tz   = -Math.abs(eased) * 60;
      const opacity = Math.max(0.45, 1 - Math.abs(rel) * 0.25);
      el.style.transform = `translateZ(${tz}px) rotateY(${rotY}deg)`;
      el.style.opacity = String(opacity);
      el.style.zIndex = String(100 - Math.round(Math.abs(rel) * 10));
    });
  }

  function settleTo(index, initialVel = 0) {
    cancelAnim();
    const target = Math.max(0, Math.min(STAGES.length - 1, index)) * layout.slotW;
    const stiff = Math.max(0.012, Math.min(0.18, state.tweaks.settle));
    const damp = 1 - Math.sqrt(stiff) * 1.05;
    let vel = initialVel;

    const step = () => {
      const cur = track.scrollLeft;
      const dx = target - cur;
      vel = vel * damp + dx * stiff;
      track.scrollLeft = cur + vel;
      paint();
      if (Math.abs(dx) < 0.5 && Math.abs(vel) < 0.03) {
        track.scrollLeft = target;
        animRef.raf = 0;
        paint();
        return;
      }
      animRef.raf = requestAnimationFrame(step);
    };
    step();
  }

  function refreshActiveClasses() {
    track.querySelectorAll('.slot').forEach((slot, i) => {
      const stage = slot.querySelector('.stage');
      if (!stage) return;
      const isActive = i === state.focusIndex;
      stage.classList.toggle('active', isActive);
      const data = STAGES[i];
      if (isActive && data.foyer) {
        stage.setAttribute('role', 'button');
        stage.tabIndex = 0;
      } else {
        stage.removeAttribute('role');
        stage.tabIndex = -1;
      }
    });
    dots.querySelectorAll('.dot').forEach((d, i) => {
      d.classList.toggle('on', i === state.focusIndex);
    });
  }

  function setFocus(i) {
    state.focusIndex = i;
    refreshActiveClasses();
    settleTo(i);
  }

  /* build slots + dots */
  STAGES.forEach((s, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.appendChild(makeStage(s, i === state.focusIndex));
    slot.addEventListener('click', (e) => {
      if (drag.moved > 6) { e.preventDefault(); return; }
      if (i === state.focusIndex) {
        if (s.foyer) enterStage(s, i);
      } else {
        setFocus(i);
      }
    });
    slot.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && i === state.focusIndex && s.foyer) {
        e.preventDefault();
        enterStage(s, i);
      }
    });
    inner.appendChild(slot);

    const d = document.createElement('button');
    d.type = 'button';
    d.className = `dot${i === state.focusIndex ? ' on' : ''}`;
    d.setAttribute('aria-label', `Go to ${s.title}`);
    d.addEventListener('click', () => setFocus(i));
    dots.appendChild(d);
  });

  wrap.querySelector('.arrow.prev').addEventListener('click',
    () => setFocus(Math.max(0, state.focusIndex - 1)));
  wrap.querySelector('.arrow.next').addEventListener('click',
    () => setFocus(Math.min(STAGES.length - 1, state.focusIndex + 1)));

  /* drag / wheel */
  track.addEventListener('pointerdown', (e) => {
    cancelAnim();
    drag.active = true;
    drag.startX = e.clientX;
    drag.lastX = e.clientX;
    drag.scrollLeft = track.scrollLeft;
    drag.moved = 0;
    drag.lastT = performance.now();
    drag.vel = 0;
    const slotEl = e.target.closest?.('.slot');
    const slots = track.querySelectorAll('.slot');
    drag.downSlot = slotEl ? Array.prototype.indexOf.call(slots, slotEl) : -1;
    track.classList.add('dragging');
    try { track.setPointerCapture(e.pointerId); } catch {}
  });
  track.addEventListener('pointermove', (e) => {
    if (!drag.active) return;
    const now = performance.now();
    const dt = Math.max(1, now - drag.lastT);
    const dx = e.clientX - drag.lastX;
    drag.vel = 0.65 * drag.vel + 0.35 * (dx / dt);
    drag.lastT = now;
    drag.lastX = e.clientX;
    const totalDx = e.clientX - drag.startX;
    drag.moved = Math.max(drag.moved, Math.abs(totalDx));
    track.scrollLeft = drag.scrollLeft - totalDx;
    paint();
  });
  function onPointerEnd() {
    if (!drag.active) return;
    drag.active = false;
    track.classList.remove('dragging');

    if (drag.moved <= 6 && drag.downSlot >= 0) {
      const i = drag.downSlot;
      const s = STAGES[i];
      if (i === state.focusIndex) {
        if (s && s.foyer) enterStage(s, i);
      } else {
        setFocus(i);
      }
      return;
    }
    const initialVel = -drag.vel * 16;
    const projection = initialVel / Math.max(0.04, Math.sqrt(state.tweaks.settle));
    const projectedScroll = track.scrollLeft + projection;
    const idx = Math.max(0, Math.min(STAGES.length - 1,
      Math.round(projectedScroll / layout.slotW)));
    state.focusIndex = idx;
    refreshActiveClasses();
    settleTo(idx, initialVel);
  }
  track.addEventListener('pointerup', onPointerEnd);
  track.addEventListener('pointercancel', onPointerEnd);
  track.addEventListener('pointerleave', onPointerEnd);

  let wheelTimer;
  track.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) < 1) return;
    cancelAnim();
    track.scrollLeft += e.deltaX;
    paint();
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      const idx = Math.max(0, Math.min(STAGES.length - 1,
        Math.round(track.scrollLeft / layout.slotW)));
      state.focusIndex = idx;
      refreshActiveClasses();
      settleTo(idx);
    }, 140);
  });

  /* initial layout — wait for actual width */
  requestAnimationFrame(() => {
    recalc();
    track.scrollLeft = state.focusIndex * layout.slotW;
    paint();
  });

  const onResize = () => {
    recalc();
    track.scrollLeft = state.focusIndex * layout.slotW;
    paint();
  };
  window.addEventListener('resize', onResize);
  teardowns.push(() => {
    window.removeEventListener('resize', onResize);
    cancelAnim();
    clearTimeout(wheelTimer);
  });
}

/* ---------- Threshold ---------- */
function enterStage(stage, index) {
  if (!stage.foyer) return;
  const slot = document.querySelectorAll('.slot')[index];
  const frame = slot?.querySelector('.stage-frame');
  const rect = frame?.getBoundingClientRect();
  if (!rect) { setView(stage.foyer + '-foyer'); return; }
  showThreshold(stage, { left: rect.left, top: rect.top, width: rect.width, height: rect.height });
}

function showThreshold(stage, originRect) {
  const kind = state.tweaks.transition;
  const ms = state.tweaks.easeMs;
  const el = document.createElement('div');
  el.className = `threshold threshold-${kind} phase-enter`;
  el.style.setProperty('--ms', ms + 'ms');

  let inner = `<div class="threshold-dim"></div>`;
  if (kind === 'frameExpand' || kind === 'apertureOpen') {
    inner += `
      <div class="threshold-frame" style="left:${originRect.left}px;top:${originRect.top}px;width:${originRect.width}px;height:${originRect.height}px">
        <div class="stage stage-${stage.kind} expanded">
          <div class="stage-frame">
            <div class="stage-window"></div>
            <div class="stage-corner stage-corner-tl"></div>
            <div class="stage-corner stage-corner-tr"></div>
            <div class="stage-corner stage-corner-bl"></div>
            <div class="stage-corner stage-corner-br"></div>
            ${kind === 'apertureOpen' ? '<div class="aperture"></div>' : ''}
          </div>
        </div>
      </div>`;
  }
  if (kind === 'lightFade') {
    inner += `<div class="lightfade"><div class="lightfade-title">${stage.title}</div></div>`;
  }
  el.innerHTML = inner;
  document.body.appendChild(el);

  setTimeout(() => {
    el.classList.remove('phase-enter');
    el.classList.add('phase-open');
    const frame = el.querySelector('.threshold-frame');
    if (frame) {
      frame.style.left = '0';
      frame.style.top = '0';
      frame.style.width = '100vw';
      frame.style.height = '100vh';
    }
  }, 40);

  setTimeout(() => {
    el.remove();
    setView(stage.foyer + '-foyer');
  }, ms + 40);
}

/* ---------- Farm Foyer ---------- */
const FOX = 'fox', RABBIT = 'rabbit', FARMER = 'farmer';
const INITIAL_FARM = [
  RABBIT, FOX,    RABBIT,
  FARMER, FARMER, FOX,
  RABBIT, FARMER, FOX,
];

function mountFarmFoyer(parent) {
  const cells = INITIAL_FARM.slice();
  let dragIdx = null;
  let solvedOnce = false;
  let floaterEl = null;

  const foyer = document.createElement('div');
  foyer.className = 'foyer foyer-farm';
  foyer.innerHTML = `
    <button class="foyer-back" aria-label="Back to the lobby">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>back to the lobby</span>
    </button>
    <header class="foyer-header">
      <a href="#" class="logo-link" aria-label="Thinking Math, home">
        <img src="/logo.svg" alt="" style="width:64px;height:64px;display:block">
      </a>
      <h1 class="foyer-title">The Farm</h1>
      <p class="foyer-prompt">Can you keep the rabbits away from the foxes?</p>
    </header>
    <div class="farm-grid-wrap"><div class="farm-grid"></div></div>
    <div class="farm-solved">The rabbits are safe.</div>
    <div class="door" role="button" aria-label="A door to the colored squares" tabindex="-1">
      <div class="door-jamb">
        <div class="door-pane">
          <div class="door-mini">
            <div class="cs-tile cs-R"></div>
            <div class="cs-tile cs-Y"></div>
            <div class="cs-tile cs-B"></div>
            <div class="cs-tile cs-Y"></div>
          </div>
        </div>
      </div>
      <div class="door-caption">a door</div>
    </div>
  `;
  parent.appendChild(foyer);

  foyer.querySelector('.foyer-back').addEventListener('click', () => setView('lobby'));
  foyer.querySelector('.logo-link').addEventListener('click', (e) => {
    e.preventDefault(); window.location.reload();
  });

  const grid = foyer.querySelector('.farm-grid');
  const gridWrap = foyer.querySelector('.farm-grid-wrap');
  const solvedMsg = foyer.querySelector('.farm-solved');
  const door = foyer.querySelector('.door');

  const neighborsOf = (i) => {
    const r = Math.floor(i / 3), c = i % 3, out = [];
    if (r > 0) out.push((r-1)*3+c);
    if (r < 2) out.push((r+1)*3+c);
    if (c > 0) out.push(r*3+(c-1));
    if (c < 2) out.push(r*3+(c+1));
    return out;
  };
  const isThreatened = (i) =>
    cells[i] === RABBIT && neighborsOf(i).some(n => cells[n] === FOX);
  const isSolved = () => !cells.some((_, i) => isThreatened(i));

  function paint(hoverIdx = null) {
    const solved = isSolved();
    grid.querySelectorAll('.farm-cell').forEach((el, i) => {
      el.classList.toggle('threatened', isThreatened(i));
      el.classList.toggle('calm', solved);
      el.classList.toggle('dragging', dragIdx === i);
      el.classList.toggle('drop', hoverIdx === i && dragIdx !== null && dragIdx !== i);
      const img = el.querySelector('img');
      img.src = FARM_IMG[cells[i]];
      img.alt = cells[i];
    });
    gridWrap.classList.toggle('solved', solved);
    solvedMsg.classList.toggle('on', solved);
    if (solved && !solvedOnce) {
      solvedOnce = true;
      door.classList.add('visible');
      door.tabIndex = 0;
    }
  }

  function showFloater(x, y, kind) {
    floaterEl = document.createElement('div');
    floaterEl.className = 'float-creature';
    floaterEl.style.left = x + 'px';
    floaterEl.style.top = y + 'px';
    floaterEl.innerHTML = `<img src="${FARM_IMG[kind]}" alt="">`;
    document.body.appendChild(floaterEl);
  }
  function moveFloater(x, y) {
    if (!floaterEl) return;
    floaterEl.style.left = x + 'px';
    floaterEl.style.top = y + 'px';
  }
  function hideFloater() {
    if (floaterEl) { floaterEl.remove(); floaterEl = null; }
  }

  function onDown(i, e) {
    e.preventDefault();
    dragIdx = i;
    showFloater(e.clientX, e.clientY, cells[i]);
    paint();

    const onMove = (ev) => {
      moveFloater(ev.clientX, ev.clientY);
      const els = document.elementsFromPoint(ev.clientX, ev.clientY);
      const target = els.find(el => el.dataset && el.dataset.cellIdx !== undefined);
      const ti = target ? parseInt(target.dataset.cellIdx, 10) : null;
      paint(ti);
    };
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const els = document.elementsFromPoint(ev.clientX, ev.clientY);
      const target = els.find(el => el.dataset && el.dataset.cellIdx !== undefined);
      if (target) {
        const ti = parseInt(target.dataset.cellIdx, 10);
        if (ti !== i) {
          [cells[i], cells[ti]] = [cells[ti], cells[i]];
        }
      }
      dragIdx = null;
      hideFloater();
      paint();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  cells.forEach((cr, i) => {
    const cell = document.createElement('div');
    cell.dataset.cellIdx = i;
    cell.className = 'farm-cell';
    cell.innerHTML = `<img src="${FARM_IMG[cr]}" alt="${cr}" draggable="false">`;
    cell.addEventListener('pointerdown', (e) => onDown(i, e));
    grid.appendChild(cell);
  });

  door.addEventListener('click', () => { if (solvedOnce) setView('colored-foyer'); });
  door.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && solvedOnce) {
      e.preventDefault();
      setView('colored-foyer');
    }
  });

  paint();
}

/* ---------- Colored Foyer ---------- */
function mountColoredFoyer(parent) {
  const tiles = ['Y','R','Y','B','Y','B','Y','R','Y'];
  const cycle = (c) => c === 'R' ? 'Y' : c === 'Y' ? 'B' : 'R';

  const foyer = document.createElement('div');
  foyer.className = 'foyer foyer-colored';
  foyer.style.backgroundImage = `url(${COLORED_BG})`;
  foyer.innerHTML = `
    <button class="foyer-back light" aria-label="Back to the lobby">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>back to the lobby</span>
    </button>
    <header class="foyer-header light">
      <h1 class="foyer-title">Colored Squares</h1>
      <p class="foyer-prompt">Tap to recolor. Each red wants two yellows beside it.</p>
    </header>
    <div class="cs-foyer-grid"></div>
    <div class="cs-foyer-cap">a small piece of the larger room</div>
  `;
  parent.appendChild(foyer);

  foyer.querySelector('.foyer-back').addEventListener('click', () => setView('lobby'));

  const gridEl = foyer.querySelector('.cs-foyer-grid');
  tiles.forEach((c, i) => {
    const tile = document.createElement('div');
    tile.className = `cs-tile cs-${c} clickable`;
    tile.addEventListener('click', () => {
      tiles[i] = cycle(tiles[i]);
      tile.className = `cs-tile cs-${tiles[i]} clickable`;
    });
    gridEl.appendChild(tile);
  });
}

/* ---------- Tweaks Panel ---------- */
function renderTweaksPanel() {
  tweaksHost.innerHTML = '';
  if (!state.tweaksOpen) {
    gearBtn.classList.remove('hidden');
    return;
  }
  gearBtn.classList.add('hidden');

  const panel = document.createElement('div');
  panel.className = 'twk-panel';
  panel.innerHTML = `
    <div class="twk-hd">
      <b>Tweaks</b>
      <button class="twk-x" aria-label="Close tweaks">✕</button>
    </div>
    <div class="twk-body"></div>
  `;
  panel.querySelector('.twk-x').addEventListener('click', () => {
    state.tweaksOpen = false;
    renderTweaksPanel();
  });

  const body = panel.querySelector('.twk-body');
  body.appendChild(tweakSection('Cylinder', [
    tweakToggle('Cylinder mode', state.tweaks.cylinder, v => setTweak('cylinder', v)),
    tweakSlider('Tilt amount', state.tweaks.drum, 0, 45, 1, '°', v => setTweak('drum', v)),
    tweakSlider('Glide speed (slower → faster)', state.tweaks.settle, 0.00005, 0.14, 0.00005, '', v => setTweak('settle', v)),
  ]));
  body.appendChild(tweakSection('Threshold', [
    tweakRadio('Entering', state.tweaks.transition, ['frameExpand', 'apertureOpen', 'lightFade'], v => setTweak('transition', v)),
    tweakSlider('Duration', state.tweaks.easeMs, 400, 1800, 50, ' ms', v => setTweak('easeMs', v)),
  ]));
  body.appendChild(tweakSection('Lobby', [
    tweakSlider('Card spacing', state.tweaks.neighborPeek, 0, 45, 1, '%', v => setTweak('neighborPeek', v)),
    tweakToggle('Footlights', state.tweaks.showFootlights, v => setTweak('showFootlights', v)),
    tweakRadio('Tone', state.tweaks.lobbyTone, ['parchment', 'morning', 'dusk'], v => setTweak('lobbyTone', v)),
  ]));

  tweaksHost.appendChild(panel);
}

function tweakSection(label, children) {
  const frag = document.createDocumentFragment();
  const head = document.createElement('div');
  head.className = 'twk-sect';
  head.textContent = label;
  frag.appendChild(head);
  children.forEach(c => frag.appendChild(c));
  return frag;
}

function tweakSlider(label, value, min, max, step, unit, onChange) {
  const row = document.createElement('div');
  row.className = 'twk-row';
  row.innerHTML = `
    <div class="twk-lbl">
      <span>${label}</span>
      <span class="twk-val">${value}${unit}</span>
    </div>
    <input type="range" class="twk-slider" min="${min}" max="${max}" step="${step}" value="${value}">
  `;
  const valEl = row.querySelector('.twk-val');
  row.querySelector('input').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    valEl.textContent = `${v}${unit}`;
    onChange(v);
  });
  return row;
}

function tweakToggle(label, value, onChange) {
  let on = value;
  const row = document.createElement('div');
  row.className = 'twk-row twk-row-h';
  row.innerHTML = `
    <div class="twk-lbl"><span>${label}</span></div>
    <button type="button" class="twk-toggle" data-on="${on ? '1' : '0'}"
            role="switch" aria-checked="${!!on}"><i></i></button>
  `;
  const btn = row.querySelector('button');
  btn.addEventListener('click', () => {
    on = !on;
    btn.dataset.on = on ? '1' : '0';
    btn.setAttribute('aria-checked', String(!!on));
    onChange(on);
  });
  return row;
}

function tweakRadio(label, value, options, onChange) {
  let val = value;
  const n = options.length;
  const row = document.createElement('div');
  row.className = 'twk-row';
  row.innerHTML = `
    <div class="twk-lbl"><span>${label}</span></div>
    <div class="twk-seg" role="radiogroup">
      <div class="twk-seg-thumb"></div>
      ${options.map(o => `<button type="button" role="radio" data-v="${o}">${o}</button>`).join('')}
    </div>
  `;
  const thumb = row.querySelector('.twk-seg-thumb');
  const update = () => {
    const idx = Math.max(0, options.indexOf(val));
    thumb.style.left = `calc(2px + ${idx} * (100% - 4px) / ${n})`;
    thumb.style.width = `calc((100% - 4px) / ${n})`;
    row.querySelectorAll('button[role=radio]').forEach(b => {
      b.setAttribute('aria-checked', String(b.dataset.v === val));
    });
  };
  update();
  row.querySelectorAll('button[role=radio]').forEach(b => {
    b.addEventListener('click', () => {
      val = b.dataset.v;
      update();
      onChange(val);
    });
  });
  return row;
}

/* ---------- App render ---------- */
function renderApp() {
  teardowns.splice(0).forEach(fn => { try { fn(); } catch {} });
  root.innerHTML = '';
  document.querySelectorAll('.float-creature').forEach(el => el.remove());

  const app = document.createElement('div');
  app.className = `app lobby-${state.tweaks.lobbyTone}`;
  root.appendChild(app);

  if (state.view === 'lobby') mountLobby(app);
  else if (state.view === 'farm-foyer') mountFarmFoyer(app);
  else if (state.view === 'colored-foyer') mountColoredFoyer(app);
}

/* ---------- bootstrap ---------- */
gearBtn.addEventListener('click', () => {
  state.tweaksOpen = !state.tweaksOpen;
  renderTweaksPanel();
});
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  if (e.key === 't' || e.key === 'T') {
    state.tweaksOpen = !state.tweaksOpen;
    renderTweaksPanel();
  }
});

renderApp();
renderTweaksPanel();
