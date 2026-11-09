import { Emulator, gameInfo, readJar } from './emulator';
import { KEY, type ScreenModel } from './midp/platform';
import { CanvasSurfaceFactory } from './midp/surface';
import type { App } from './ui/app';
import { BillingPanel } from './ui/billing-panel';
import { CheatsPanel } from './ui/cheats-panel';
import { $, isEditable } from './ui/dom';
import { KeysPanel } from './ui/keys-panel';
import { SavesPanel } from './ui/saves-panel';
import { readStateInfo } from './snapshot';
import { DEFAULT_RESOLUTION, PRESETS, resolution, savedResolution, type Resolution } from './resolution';
import { Library, rememberGame } from './ui/library';

const KEYPAD: (string | null)[][] = [
  ['左软', '上', '右软'],
  ['左', '确定', '右'],
  [null, '下', null],
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
];
const KEYPAD_CODES: Record<string, number> = {
  左软: KEY.SOFT_LEFT,
  右软: KEY.SOFT_RIGHT,
  上: KEY.UP,
  下: KEY.DOWN,
  左: KEY.LEFT,
  右: KEY.RIGHT,
  确定: KEY.FIRE,
  '*': KEY.STAR,
  '#': KEY.POUND,
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), KEY.NUM0 + i])),
};

const canvas = $<HTMLCanvasElement>('screen');
const screenCtx = canvas.getContext('2d')!;
const overlay = $<HTMLDivElement>('overlay');
const logEl = $<HTMLPreElement>('log');
const statsEl = $<HTMLSpanElement>('stats');
const titleEl = $<HTMLSpanElement>('title');
const hintEl = $<HTMLDivElement>('hint');
const dropEl = $<HTMLDivElement>('drop');
const speedEl = $<HTMLSelectElement>('speed');
const pauseEl = $<HTMLButtonElement>('pause');
const pausedOverlay = $<HTMLButtonElement>('paused-overlay');
const resolutionEl = $<HTMLSelectElement>('resolution');
const scaleEl = $<HTMLSelectElement>('scale');
let currentResolution = { ...DEFAULT_RESOLUTION };
let loading = 0;
const heldKeys = new Map<string, number>();
let heldPointer: [number, number] | null = null;

let rtEntries: Map<string, Uint8Array> | null = null;
let emu: Emulator | null = null;
/** entries of the loaded jar, kept for restarts and state restores */
let game: Map<string, Uint8Array> | null = null;

function log(text: string, err = false) {
  const line = document.createElement('div');
  line.textContent = text;
  if (err) line.className = 'err';
  logEl.append(line);
  if (err) {
    $('notice').textContent = text;
    $('notice').hidden = false;
  }
  while (logEl.childElementCount > 500) logEl.firstElementChild!.remove();
  logEl.scrollTop = logEl.scrollHeight;
}

async function loadRt(): Promise<Map<string, Uint8Array>> {
  if (!rtEntries) {
    const res = await fetch(`${import.meta.env.BASE_URL}rt.jar`);
    if (!res.ok) throw new Error('rt.jar 加载失败，请先运行 npm run build:rt');
    rtEntries = readJar(new Uint8Array(await res.arrayBuffer()));
  }
  return rtEntries;
}

function createEmulator(size = currentResolution): Emulator {
  const e = new Emulator({
    ...size,
    rt: rtEntries!,
    game: game!,
    surfaces: new CanvasSurfaceFactory(),
    storage: window.localStorage,
    out: (s, stream) => log(s, stream === 2),
  });
  e.midp.onPresent = (screen) => {
    if (canvas.width !== screen.w || canvas.height !== screen.h) {
      canvas.width = screen.w;
      canvas.height = screen.h;
    }
    screenCtx.drawImage(screen.canvas as CanvasImageSource, 0, 0);
  };
  e.midp.onScreen = showScreen;
  e.midp.getScreenTexts = readScreenTexts;
  e.midp.onDestroyed = () => log('MIDlet 已退出');
  e.onUncaught((name, desc) => log(`线程 ${name} 未捕获异常: ${desc}`, true));
  e.vm.speed = savedSpeed(e.id);
  speedEl.value = String(e.vm.speed);
  return e;
}

const speedKey = (gameId: string) => `jargame:speed:${gameId}`;

function savedSpeed(gameId: string): number {
  const v = Number(localStorage.getItem(speedKey(gameId)));
  return [...speedEl.options].some((o) => Number(o.value) === v) ? v : 1;
}

speedEl.addEventListener('change', () => {
  // a focused <select> would swallow the arrow keys the game needs
  speedEl.blur();
  const v = Number(speedEl.value);
  if (!emu) return;
  emu.vm.speed = v;
  if (v === 1) localStorage.removeItem(speedKey(emu.id));
  else localStorage.setItem(speedKey(emu.id), String(v));
});

/** makes `e` the running emulator; the previous one is stopped */
function attach(e: Emulator) {
  releaseInputs();
  if (emu !== e) emu?.stop();
  emu = e;
  (window as any).__emu = e;
  titleEl.textContent = `${e.info.name}${e.info.vendor ? ` · ${e.info.vendor}` : ''}`;
  hintEl.hidden = true;
  $('welcome').hidden = true;
  $('library-section').hidden = true;
  $('player').hidden = false;
  window.scrollTo(0, 0);
  currentResolution = { width: e.midp.width, height: e.midp.height };
  canvas.width = e.midp.width;
  canvas.height = e.midp.height;
  e.midp.onPresent?.(e.midp.screen);
  syncResolution();
  updatePause();
  resizeScreen();
  if (document.hidden && $<HTMLInputElement>('auto-pause').checked) e.pause();
  for (const p of panels) p.attach(e);
}

function clearScreen() {
  screenCtx.fillStyle = '#000';
  screenCtx.fillRect(0, 0, canvas.width, canvas.height);
}

function boot() {
  const e = createEmulator();
  try { e.start(); }
  catch (error) { e.stop(); throw error; }
  attach(e);
  showScreen(null);
  clearScreen();
  if (document.hidden && $<HTMLInputElement>('auto-pause').checked) { e.pause(); updatePause(); }
}

async function loadGame(bytes: Uint8Array, fileName: string) {
  const request = ++loading;
  try {
    const entries = readJar(bytes);
    const info = gameInfo(entries);
    if (!info.midlets.length) throw new Error('未找到可运行的 MIDlet，请选择 J2ME 游戏 jar');
    await loadRt();
    if (request !== loading) return;
    const previousGame = game, previousResolution = currentResolution;
    game = entries;
    currentResolution = savedResolution(`${info.name}|${info.vendor}`);
    $('notice').hidden = true;
    try { boot(); }
    catch (error) { game = previousGame; currentResolution = previousResolution; throw error; }
    $('notice').hidden = true;
    log(`加载 ${fileName}: MIDlet ${info.midlets.map((m) => m.className).join(', ')}`);
    try { await rememberGame(entries, bytes, fileName); await library.refresh(); }
    catch { log('游戏已启动，但浏览器无法保存游戏库；可能是存储空间不足或隐私模式。', true); }
  } catch (error) {
    log(`加载 ${fileName} 失败：${(error as Error).message}`, true);
  }
}

const app: App = {
  get emu() {
    return emu;
  },
  log,
  restore(data) {
    if (!game) throw new Error('请先加载游戏');
    const info = readStateInfo(data);
    const e = createEmulator({ width: info.width, height: info.height });
    try {
      e.loadState(data);
    } catch (err) {
      e.stop();
      throw err;
    }
    attach(e);
    showScreen(e.midp.screenModel);
  },
  restart() {
    if (game) boot();
  },
  thumbnail() {
    const c = document.createElement('canvas');
    c.width = canvas.width / 2;
    c.height = canvas.height / 2;
    c.getContext('2d')!.drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.75);
  },
};

const keysPanel = new KeysPanel($('panel-keys'));
const panels = [keysPanel, new SavesPanel($('panel-saves'), app), new CheatsPanel($('panel-cheats'), app), new BillingPanel($('panel-billing'), app)];

const tabs = document.querySelectorAll<HTMLButtonElement>('#tabs button');
function selectTab(name: string) {
  tabs.forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== name));
  localStorage.setItem('jargame:tab', name);
}
tabs.forEach((b) => (b.onclick = () => selectTab(b.dataset.tab!)));
selectTab(localStorage.getItem('jargame:tab') ?? 'keys');

// ---------------------------------------------------------------- screens (Form/List/Alert/TextBox)

const SCREEN_FORM = 1;
const SCREEN_LIST = 2;
const SCREEN_ALERT = 3;
const SCREEN_TEXTBOX = 4;
let currentModel: ScreenModel | null = null;
let alertTimer: ReturnType<typeof setTimeout> | null = null;

function showScreen(model: ScreenModel | null) {
  currentModel = model;
  if (alertTimer) clearTimeout(alertTimer);
  overlay.replaceChildren();
  overlay.hidden = !model;
  if (!model) return;
  const title = document.createElement('div');
  title.className = 'o-title';
  title.textContent = model.title ?? '';
  const body = document.createElement('div');
  body.className = 'o-body';
  let selected = model.selected;
  if (model.kind === SCREEN_FORM || model.kind === SCREEN_TEXTBOX) {
    model.types.forEach((type, i) => {
      const label = model.texts[i * 2] ?? '';
      const value = model.texts[i * 2 + 1] ?? '';
      if (type === 3) {
        const [sel, options] = value.split('\u0001');
        const l = document.createElement('label');
        l.textContent = label;
        const select = document.createElement('select');
        (options ? options.split('\u0002') : []).forEach((o, k) => select.add(new Option(o, String(k))));
        select.selectedIndex = Number(sel);
        select.dataset.index = String(i);
        l.append(select);
        body.append(l);
      } else if (type === 1) {
        const l = document.createElement('label');
        l.textContent = label;
        const input = document.createElement(model.kind === SCREEN_TEXTBOX ? 'textarea' : 'input');
        input.value = value;
        input.dataset.index = String(i);
        l.append(input);
        body.append(l);
      } else {
        const p = document.createElement('div');
        p.textContent = label ? `${label} ${value}` : value;
        body.append(p);
      }
    });
  } else if (model.kind === SCREEN_LIST) {
    model.texts.forEach((text, i) => {
      const item = document.createElement('div');
      item.className = 'o-item' + (i === selected ? ' selected' : '');
      item.textContent = text ?? '';
      item.onclick = () => {
        selected = i;
        emu?.midp.command(-1, i);
      };
      body.append(item);
    });
  } else if (model.kind === SCREEN_ALERT) {
    const p = document.createElement('div');
    p.textContent = model.texts[0] ?? '';
    body.append(p);
    const timeout = model.types[0];
    if (timeout > 0 && model.commands.length === 0 && emu) {
      const owner = emu;
      const deadline = owner.vm.now() + timeout;
      const expire = () => {
        if (owner !== emu || currentModel !== model) return;
        if (!owner.paused && owner.vm.now() >= deadline) owner.midp.command(-1);
        else alertTimer = setTimeout(expire, 50);
      };
      alertTimer = setTimeout(expire, 50);
    }
  }
  const cmds = document.createElement('div');
  cmds.className = 'o-commands';
  const labels = model.commands.length > 0 ? model.commands : model.kind === SCREEN_ALERT ? ['确定'] : [];
  labels.forEach((label, i) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => emu?.midp.command(model.commands.length > 0 ? i : -1, selected);
    cmds.append(b);
  });
  overlay.append(title, body, cmds);
}

function readScreenTexts(): (string | null)[] | null {
  if (!currentModel) return null;
  const n = currentModel.types.length;
  const out: (string | null)[] = new Array(n).fill(null);
  overlay.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-index]').forEach((el) => {
    out[Number(el.dataset.index)] = el.value;
  });
  return out;
}

// ---------------------------------------------------------------- input

function releaseInputs() {
  for (const code of new Set(heldKeys.values())) emu?.midp.keyReleased(code);
  heldKeys.clear();
  if (heldPointer) emu?.midp.pointer('released', ...heldPointer);
  heldPointer = null;
}

function updatePause() {
  pauseEl.disabled = !emu || emu.vm.halted;
  pauseEl.textContent = emu?.paused ? '继续' : '暂停';
  pausedOverlay.hidden = !emu?.paused;
}
function togglePause() {
  if (!emu || emu.vm.halted) return;
  releaseInputs();
  if (emu.paused) emu.resume();
  else emu.pause();
  updatePause();
  pauseEl.blur();
}
pauseEl.onclick = togglePause;
pausedOverlay.onclick = togglePause;
window.addEventListener('blur', releaseInputs);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  releaseInputs();
  if ($<HTMLInputElement>('auto-pause').checked) emu?.pause();
  updatePause();
});

window.addEventListener('keydown', (e) => {
  if (!emu || isEditable(e.target) || $<HTMLDialogElement>('help').open) return;
  const code = keysPanel.lookup(e.code);
  if (e.code === 'KeyP' && code === undefined && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    if (!e.repeat) togglePause();
    return;
  }
  if (emu.paused || (e.target as HTMLElement).closest?.('.overlay') || code === undefined) return;
  e.preventDefault();
  if (e.repeat) emu.midp.keyRepeated(code);
  else { heldKeys.set(e.code, code); emu.midp.keyPressed(code); }
});
window.addEventListener('keyup', (e) => {
  const code = heldKeys.get(e.code);
  if (code === undefined) return;
  heldKeys.delete(e.code);
  e.preventDefault();
  emu?.midp.keyReleased(code);
});

function screenPoint(e: PointerEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height];
}
canvas.addEventListener('pointerdown', (e) => {
  if (!emu || emu.paused) return;
  canvas.setPointerCapture(e.pointerId);
  heldPointer = screenPoint(e);
  emu.midp.pointer('pressed', ...heldPointer);
});
canvas.addEventListener('pointermove', (e) => {
  if (heldPointer && emu && !emu.paused) {
    heldPointer = screenPoint(e);
    emu.midp.pointer('dragged', ...heldPointer);
  }
});
const releasePointer = () => {
  if (heldPointer) emu?.midp.pointer('released', ...heldPointer);
  heldPointer = null;
};
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('lostpointercapture', releasePointer);

const keypad = $<HTMLDivElement>('keypad');
for (const row of KEYPAD) {
  for (const label of row) {
    const b = document.createElement('button');
    if (!label) {
      b.style.visibility = 'hidden';
      keypad.append(b);
      continue;
    }
    b.textContent = label;
    b.dataset.key = label;
    if (label.endsWith('软')) b.className = 'soft';
    const code = KEYPAD_CODES[label];
    const inputId = `pad:${label}`;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!emu || emu.paused) return;
      b.setPointerCapture(e.pointerId);
      heldKeys.set(inputId, code);
      emu.midp.keyPressed(code);
    });
    const release = () => {
      if (heldKeys.delete(inputId)) emu?.midp.keyReleased(code);
    };
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('lostpointercapture', release);
    keypad.append(b);
  }
}

// ---------------------------------------------------------------- loading

const library = new Library($('library'), loadGame, log);
void library.refresh();
$('library-toggle').onclick = () => { $('library-section').hidden = !$('library-section').hidden; };
$('import-large').onclick = () => $<HTMLInputElement>('file').click();
$('import-small').onclick = () => $<HTMLInputElement>('file').click();
$('help-toggle').onclick = () => {
  if (emu && !emu.paused) { releaseInputs(); emu.pause(); updatePause(); }
  $<HTMLDialogElement>('help').showModal();
};
$('fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.body.requestFullscreen();
  } catch { log('当前浏览器不支持全屏，请使用浏览器的全屏功能。', true); }
};
document.addEventListener('fullscreenchange', () => {
  $('fullscreen').textContent = document.fullscreenElement ? '退出全屏' : '全屏';
  resizeScreen();
});
$('tools-toggle').onclick = () => {
  const tools = $('tools');
  tools.hidden = !tools.hidden;
  $('tools-toggle').textContent = tools.hidden ? '展开工具' : '收起工具';
  $('tools-toggle').setAttribute('aria-expanded', String(!tools.hidden));
};
if (window.innerWidth <= 720) $('tools-toggle').click();

for (const preset of PRESETS) resolutionEl.add(new Option(preset.replace('x', ' × '), preset));
resolutionEl.add(new Option('自定义', 'custom'));
function syncResolution() {
  const { width, height } = currentResolution;
  const preset = `${width}x${height}`;
  resolutionEl.value = PRESETS.includes(preset) ? preset : 'custom';
  $<HTMLInputElement>('width').value = String(width);
  $<HTMLInputElement>('height').value = String(height);
  $('custom-size').hidden = resolutionEl.value !== 'custom';
}
resolutionEl.onchange = () => { $('custom-size').hidden = resolutionEl.value !== 'custom'; };
$('apply-resolution').onclick = () => {
  if (!emu) return;
  try {
    const [w, h] = resolutionEl.value.split('x').map(Number);
    const next = resolutionEl.value === 'custom'
      ? resolution(Number($<HTMLInputElement>('width').value), Number($<HTMLInputElement>('height').value))
      : resolution(w, h);
    if (next.width === currentResolution.width && next.height === currentResolution.height) return;
    currentResolution = next;
    localStorage.setItem(`jargame:resolution:${emu.id}`, JSON.stringify(next));
    $('notice').hidden = true;
    boot();
    log(`已切换至 ${next.width}×${next.height} 并重启游戏`);
  } catch (error) { log((error as Error).message, true); }
};
function resizeScreen() {
  const { width, height } = currentResolution;
  const available = Math.max(96, Math.min(window.innerWidth <= 720 ? window.innerWidth - 52 : window.innerWidth - 380, 800));
  const phoneTop = document.querySelector('.phone')!.getBoundingClientRect().top + window.scrollY;
  const room = window.innerHeight - phoneTop - keypad.offsetHeight - 48;
  const scale = scaleEl.value === 'fit'
    ? Math.min(available / width, Math.max(128, room) / height)
    : Number(scaleEl.value);
  dropEl.style.width = `${Math.round(width * scale)}px`;
  dropEl.style.height = `${Math.round(height * scale)}px`;
}
scaleEl.onchange = () => { scaleEl.blur(); resizeScreen(); };
window.addEventListener('resize', resizeScreen);
syncResolution();

async function importFile(file: File) {
  try {
    if (!file.name.toLowerCase().endsWith('.jar')) throw new Error('请选择 .jar 游戏文件，暂不支持 .jad');
    await loadGame(new Uint8Array(await file.arrayBuffer()), file.name);
  } catch (error) { log((error as Error).message, true); }
}
$<HTMLInputElement>('file').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) await importFile(file);
});
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  document.body.classList.add('dragging');
});
window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  document.body.classList.remove('dragging');
  const file = e.dataTransfer?.files[0];
  if (file) await importFile(file);
});

const jarParam = new URLSearchParams(location.search).get('jar');
if (jarParam) {
  fetch(jarParam)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((buf) => loadGame(new Uint8Array(buf), decodeURIComponent(jarParam.split('/').pop() ?? 'game.jar')))
    .catch((err) => log(`加载 ${jarParam} 失败: ${err.message}`, true));
}

let lastFrames = 0;
let lastInstr = 0;
setInterval(() => {
  if (!emu) return;
  updatePause();
  const frames = emu.midp.frames;
  const instr = emu.vm.icount;
  statsEl.textContent = `${Math.max(0, frames - lastFrames)} FPS · ${(Math.max(0, instr - lastInstr) / 1e6).toFixed(1)} M 指令/秒 · ${emu.vm.threads.length} 线程${emu.vm.halted ? ' · 已停止' : ''}`;
  lastFrames = frames;
  lastInstr = instr;
}, 1000);
