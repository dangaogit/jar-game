import { Emulator, readJar } from './emulator';
import { KEY, type ScreenModel } from './midp/platform';
import { CanvasSurfaceFactory } from './midp/surface';
import type { App } from './ui/app';
import { BillingPanel } from './ui/billing-panel';
import { CheatsPanel } from './ui/cheats-panel';
import { $, isEditable } from './ui/dom';
import { KeysPanel } from './ui/keys-panel';
import { SavesPanel } from './ui/saves-panel';

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

let rtEntries: Map<string, Uint8Array> | null = null;
let emu: Emulator | null = null;
/** entries of the loaded jar, kept for restarts and state restores */
let game: Map<string, Uint8Array> | null = null;

function log(text: string, err = false) {
  const line = document.createElement('div');
  line.textContent = text;
  if (err) line.className = 'err';
  logEl.append(line);
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

function createEmulator(): Emulator {
  const e = new Emulator({
    rt: rtEntries!,
    game: game!,
    surfaces: new CanvasSurfaceFactory(),
    storage: window.localStorage,
    out: (s, stream) => log(s, stream === 2),
  });
  e.midp.onPresent = (screen) => screenCtx.drawImage(screen.canvas as CanvasImageSource, 0, 0);
  e.midp.onScreen = showScreen;
  e.midp.getScreenTexts = readScreenTexts;
  e.midp.onDestroyed = () => log('MIDlet 已退出');
  e.onUncaught((name, desc) => log(`线程 ${name} 未捕获异常: ${desc}`, true));
  return e;
}

/** makes `e` the running emulator; the previous one is stopped */
function attach(e: Emulator) {
  if (emu !== e) emu?.stop();
  emu = e;
  (window as any).__emu = e;
  titleEl.textContent = `${e.info.name}${e.info.vendor ? ` · ${e.info.vendor}` : ''}`;
  hintEl.hidden = true;
  for (const p of panels) p.attach(e);
}

function clearScreen() {
  screenCtx.fillStyle = '#000';
  screenCtx.fillRect(0, 0, canvas.width, canvas.height);
}

function boot() {
  const e = createEmulator();
  attach(e);
  clearScreen();
  e.start();
}

async function loadGame(bytes: Uint8Array, fileName: string) {
  emu?.stop();
  showScreen(null);
  logEl.textContent = '';
  await loadRt();
  try {
    game = readJar(bytes);
  } catch (e) {
    log(`无法解析 ${fileName}: ${(e as Error).message}`, true);
    return;
  }
  boot();
  log(`加载 ${fileName}: MIDlet ${emu!.info.midlets.map((m) => m.className).join(', ')}`);
}

const app: App = {
  get emu() {
    return emu;
  },
  log,
  restore(data) {
    if (!game) throw new Error('请先加载游戏');
    const e = createEmulator();
    try {
      e.loadState(data);
    } catch (err) {
      e.stop();
      throw err;
    }
    attach(e);
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
    if (timeout > 0 && model.commands.length === 0) alertTimer = setTimeout(() => emu?.midp.command(-1), timeout);
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

window.addEventListener('keydown', (e) => {
  if (!emu || isEditable(e.target) || (e.target as HTMLElement).closest?.('.overlay')) return;
  const code = keysPanel.lookup(e.code);
  if (code === undefined) return;
  e.preventDefault();
  if (e.repeat) emu.midp.keyRepeated(code);
  else emu.midp.keyPressed(code);
});

window.addEventListener('keyup', (e) => {
  if (!emu || isEditable(e.target) || (e.target as HTMLElement).closest?.('.overlay')) return;
  const code = keysPanel.lookup(e.code);
  if (code === undefined) return;
  e.preventDefault();
  emu.midp.keyReleased(code);
});

function screenPoint(e: PointerEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height];
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  emu?.midp.pointer('pressed', ...screenPoint(e));
});
canvas.addEventListener('pointermove', (e) => {
  if (e.buttons) emu?.midp.pointer('dragged', ...screenPoint(e));
});
canvas.addEventListener('pointerup', (e) => emu?.midp.pointer('released', ...screenPoint(e)));

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
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      emu?.midp.keyPressed(code);
    });
    b.addEventListener('pointerup', () => emu?.midp.keyReleased(code));
    keypad.append(b);
  }
}

// ---------------------------------------------------------------- loading

$<HTMLInputElement>('file').addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) await loadGame(new Uint8Array(await file.arrayBuffer()), file.name);
});

dropEl.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropEl.classList.add('dragging');
});
dropEl.addEventListener('dragleave', () => dropEl.classList.remove('dragging'));
dropEl.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropEl.classList.remove('dragging');
  const file = e.dataTransfer?.files[0];
  if (file) await loadGame(new Uint8Array(await file.arrayBuffer()), file.name);
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
  const frames = emu.midp.frames;
  const instr = emu.vm.icount;
  statsEl.textContent = `${Math.max(0, frames - lastFrames)} FPS · ${(Math.max(0, instr - lastInstr) / 1e6).toFixed(1)} M 指令/秒 · ${emu.vm.threads.length} 线程${emu.vm.halted ? ' · 已停止' : ''}`;
  lastFrames = frames;
  lastInstr = instr;
}, 1000);
