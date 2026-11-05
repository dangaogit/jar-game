import { Emulator, readJar } from './emulator';
import { KEY, type ScreenModel } from './midp/platform';
import { CanvasSurfaceFactory } from './midp/surface';

interface KeyBinding {
  label: string;
  code: number;
  keys: string[];
}

const BINDINGS: KeyBinding[] = [
  { label: '上', code: KEY.UP, keys: ['ArrowUp'] },
  { label: '下', code: KEY.DOWN, keys: ['ArrowDown'] },
  { label: '左', code: KEY.LEFT, keys: ['ArrowLeft'] },
  { label: '右', code: KEY.RIGHT, keys: ['ArrowRight'] },
  { label: '确定', code: KEY.FIRE, keys: ['Enter', 'Space'] },
  { label: '左软键', code: KEY.SOFT_LEFT, keys: ['KeyQ', 'F1'] },
  { label: '右软键', code: KEY.SOFT_RIGHT, keys: ['KeyE', 'F2'] },
  { label: '清除', code: KEY.CLEAR, keys: ['Backspace'] },
  { label: '*', code: KEY.STAR, keys: ['NumpadMultiply', 'KeyZ'] },
  { label: '#', code: KEY.POUND, keys: ['NumpadDivide', 'KeyX'] },
  ...Array.from({ length: 10 }, (_, i) => ({ label: String(i), code: KEY.NUM0 + i, keys: [`Digit${i}`, `Numpad${i}`] })),
];

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

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
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
const keyIndex = new Map<string, number>();
for (const b of BINDINGS) for (const k of b.keys) keyIndex.set(k, b.code);

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

async function loadGame(bytes: Uint8Array, fileName: string) {
  emu?.stop();
  overlay.hidden = true;
  logEl.textContent = '';
  const rt = await loadRt();
  let game: Map<string, Uint8Array>;
  try {
    game = readJar(bytes);
  } catch (e) {
    log(`无法解析 ${fileName}: ${(e as Error).message}`, true);
    return;
  }
  const e = new Emulator({
    rt,
    game,
    surfaces: new CanvasSurfaceFactory(),
    storage: window.localStorage,
    out: (s, stream) => log(s, stream === 2),
  });
  e.midp.onPresent = (screen) => screenCtx.drawImage(screen.canvas as CanvasImageSource, 0, 0);
  e.midp.onScreen = showScreen;
  e.midp.getScreenTexts = readScreenTexts;
  e.midp.onDestroyed = () => log('MIDlet 已退出');
  e.midp.onPlatformRequest = (url) => log(`platformRequest: ${url}`);
  e.onUncaught((name, desc) => log(`线程 ${name} 未捕获异常: ${desc}`, true));
  emu = e;
  (window as any).__emu = e;
  titleEl.textContent = `${e.info.name}${e.info.vendor ? ` · ${e.info.vendor}` : ''}`;
  hintEl.hidden = true;
  log(`加载 ${fileName}: MIDlet ${e.info.midlets.map((m) => m.className).join(', ')}`);
  screenCtx.fillStyle = '#000';
  screenCtx.fillRect(0, 0, canvas.width, canvas.height);
  e.start();
}

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
  if (!emu || (e.target as HTMLElement).closest?.('.overlay')) return;
  const code = keyIndex.get(e.code);
  if (code === undefined) return;
  e.preventDefault();
  if (e.repeat) emu.midp.keyRepeated(code);
  else emu.midp.keyPressed(code);
});

window.addEventListener('keyup', (e) => {
  if (!emu || (e.target as HTMLElement).closest?.('.overlay')) return;
  const code = keyIndex.get(e.code);
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

const keymapEl = $<HTMLTableElement>('keymap');
for (const b of BINDINGS.slice(0, 10)) {
  const tr = keymapEl.insertRow();
  tr.insertCell().textContent = b.label;
  tr.insertCell().innerHTML = b.keys.map((k) => `<kbd>${k.replace(/^Key|^Digit/, '')}</kbd>`).join('');
}
keymapEl.insertRow().insertCell().textContent = '数字键 0-9：主键盘或小键盘数字';

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
  statsEl.textContent = `${frames - lastFrames} FPS · ${((instr - lastInstr) / 1e6).toFixed(1)} M 指令/秒 · ${emu.vm.threads.length} 线程${emu.vm.halted ? ' · 已停止' : ''}`;
  lastFrames = frames;
  lastInstr = instr;
}, 1000);
