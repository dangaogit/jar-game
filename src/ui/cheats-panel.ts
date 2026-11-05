import {
  CheatEngine,
  MemoryScanner,
  TYPE_NAMES,
  describeCell,
  formatCheats,
  parseCheats,
  pathOf,
  readCell,
  writeCell,
  type Cheat,
  type ScanMode,
  type ScanResult,
} from '../cheats';
import type { Emulator } from '../emulator';
import type { App, Panel } from './app';
import { fill, h } from './dom';

const SHOWN_RESULTS = 40;
const storageKey = (game: string) => `jargame:cheats:${game}`;

const FIRST_MODES: [ScanMode, string][] = [
  ['eq', '等于'],
  ['unknown', '未知初值'],
];
const NEXT_MODES: [ScanMode, string][] = [
  ['eq', '等于'],
  ['inc', '变大了'],
  ['dec', '变小了'],
  ['changed', '变化了'],
  ['unchanged', '没变'],
];

/** Memory value search plus a per-game list of cheat codes that can be locked, exported and imported. */
export class CheatsPanel implements Panel {
  readonly engine = new CheatEngine();
  private emu: Emulator | null = null;
  private scanner: MemoryScanner | null = null;
  private results: ScanResult[] = [];
  private status = '';
  private shareText: string | null = null;
  private resultsEl = h('tbody');
  private cheatsEl = h('tbody');

  constructor(
    private root: HTMLElement,
    private app: App,
  ) {
    setInterval(() => this.refreshValues(), 500);
    this.render();
  }

  attach(emu: Emulator) {
    const sameGame = this.emu?.id === emu.id;
    this.emu = emu;
    this.engine.attach(emu.vm);
    // the scan results point into the previous VM's heap
    this.scanner = new MemoryScanner(emu.vm);
    this.results = [];
    this.status = '';
    if (!sameGame) {
      this.engine.cheats = this.loadCheats();
      this.shareText = null;
    }
    this.render();
  }

  private loadCheats(): Cheat[] {
    try {
      return JSON.parse(localStorage.getItem(storageKey(this.emu!.id)) ?? '[]') as Cheat[];
    } catch {
      return [];
    }
  }

  private saveCheats() {
    localStorage.setItem(storageKey(this.emu!.id), JSON.stringify(this.engine.cheats));
  }

  private search(mode: ScanMode, raw: string) {
    const s = this.scanner!;
    const needsValue = mode === 'eq';
    const value = Number(raw);
    if (needsValue && (raw.trim() === '' || !Number.isFinite(value))) {
      this.status = '请输入要搜索的数值';
      this.render();
      return;
    }
    const t0 = performance.now();
    if (s.scans === 0) s.first(mode as 'eq' | 'unknown', value);
    else s.next(mode as Exclude<ScanMode, 'unknown'>, value);
    this.results = s.results(SHOWN_RESULTS);
    this.status = `第 ${s.scans} 次搜索：${s.count} 个结果（${Math.round(performance.now() - t0)} ms）`;
    if (s.count > SHOWN_RESULTS) this.status += `，显示前 ${SHOWN_RESULTS} 个`;
    this.render();
  }

  private addCheat(r: ScanResult) {
    const path = pathOf(this.emu!.vm, r);
    if (!path) {
      this.app.log('这个数值只存在于方法的局部变量里，无法生成稳定的金手指，只能在结果列表里直接修改', true);
      return;
    }
    if (this.engine.cheats.some((c) => c.path === path)) return;
    this.engine.cheats.push({ name: describeCell(r), path, value: readCell(r), locked: false });
    this.saveCheats();
    this.render();
  }

  private refreshValues() {
    if (!this.emu || !this.root.isConnected || this.root.offsetParent === null) return;
    this.resultsEl.querySelectorAll<HTMLElement>('[data-result]').forEach((el) => {
      const r = this.results[Number(el.dataset.result)];
      if (r) el.textContent = String(readCell(r));
    });
    this.cheatsEl.querySelectorAll<HTMLElement>('[data-cheat]').forEach((el) => {
      const c = this.engine.cheats[Number(el.dataset.cheat)];
      const cell = c && this.engine.resolve(c);
      el.textContent = cell ? String(readCell(cell)) : '未找到';
      el.classList.toggle('missing', !cell);
    });
  }

  private numberInput(value: number | null, onCommit: (v: number) => void) {
    const input = h('input', { type: 'number', value: value === null ? '' : String(value), placeholder: '新数值', class: 'num' });
    input.onkeydown = (e) => {
      if (e.key === 'Enter') input.blur();
    };
    input.onchange = () => {
      const v = Number(input.value);
      if (input.value.trim() !== '' && Number.isFinite(v)) onCommit(v);
    };
    return input;
  }

  private render() {
    if (!this.emu) {
      this.root.replaceChildren(h('p', { class: 'muted', textContent: '加载游戏后可以搜索和修改内存数值。' }));
      return;
    }
    const s = this.scanner!;
    const modeSel = h('select');
    for (const [mode, label] of s.scans === 0 ? FIRST_MODES : NEXT_MODES) modeSel.add(new Option(label, mode));
    const valueInput = h('input', { type: 'number', placeholder: '数值', class: 'num' });
    modeSel.onchange = () => (valueInput.disabled = modeSel.value !== 'eq');
    valueInput.onkeydown = (e) => {
      if (e.key === 'Enter') this.search(modeSel.value as ScanMode, valueInput.value);
    };
    const searchBtn = h('button', { class: 'btn small primary', textContent: s.scans === 0 ? '首次搜索' : '再次搜索' });
    searchBtn.onclick = () => this.search(modeSel.value as ScanMode, valueInput.value);
    const resetBtn = h('button', { class: 'btn small', textContent: '重新开始', disabled: s.scans === 0 });
    resetBtn.onclick = () => {
      s.reset();
      this.results = [];
      this.status = '';
      this.render();
    };

    this.resultsEl = h('tbody');
    this.results.forEach((r, i) => {
      const add = h('button', { class: 'btn small', textContent: '加入金手指' });
      add.onclick = () => this.addCheat(r);
      this.resultsEl.append(
        h(
          'tr',
          null,
          h('td', { class: 'loc', textContent: describeCell(r), title: describeCell(r) }),
          h('td', { class: 'muted', textContent: TYPE_NAMES[r.type] }),
          h('td', { class: 'val', textContent: String(readCell(r)), dataset: { result: String(i) } }),
          h(
            'td',
            null,
            this.numberInput(null, (v) => {
              writeCell(r, v);
              this.refreshValues();
            }),
          ),
          h('td', null, add),
        ),
      );
    });

    this.cheatsEl = h('tbody');
    this.engine.cheats.forEach((c, i) => {
      const lock = h('input', { type: 'checkbox', checked: c.locked, title: '锁定：持续写入这个值' });
      lock.onchange = () => {
        c.locked = lock.checked;
        this.saveCheats();
      };
      const name = h('input', { value: c.name, class: 'name', title: c.path });
      name.onchange = () => {
        c.name = name.value.trim() || c.path;
        this.saveCheats();
      };
      const apply = h('button', { class: 'btn small', textContent: '写入' });
      apply.onclick = () => {
        if (!this.engine.apply(c)) this.app.log(`金手指「${c.name}」的地址当前不存在（可能还没进入对应场景）`, true);
        this.refreshValues();
      };
      const del = h('button', { class: 'btn small danger', textContent: '删除' });
      del.onclick = () => {
        this.engine.cheats.splice(i, 1);
        this.saveCheats();
        this.render();
      };
      this.cheatsEl.append(
        h(
          'tr',
          null,
          h('td', null, lock),
          h('td', null, name),
          h('td', { class: 'val', dataset: { cheat: String(i) } }),
          h(
            'td',
            null,
            this.numberInput(c.value, (v) => {
              c.value = v;
              this.saveCheats();
              if (!c.locked) this.engine.apply(c);
            }),
          ),
          h('td', { class: 'actions' }, apply, del),
        ),
      );
    });

    const share = h('button', { class: 'btn small', textContent: this.shareText === null ? '导入 / 导出…' : '收起' });
    share.onclick = () => {
      this.shareText = this.shareText === null ? formatCheats(this.engine.cheats, this.emu!.info.name) : null;
      this.render();
    };
    let sharePane: HTMLElement | null = null;
    if (this.shareText !== null) {
      const text = h('textarea', { class: 'share', value: this.shareText, spellcheck: false, rows: 6 });
      text.oninput = () => (this.shareText = text.value);
      const copy = h('button', { class: 'btn small', textContent: '复制' });
      copy.onclick = () => void navigator.clipboard?.writeText(text.value).then(() => this.app.log('金手指已复制到剪贴板'));
      const imp = h('button', { class: 'btn small primary', textContent: '导入文本中的金手指' });
      imp.onclick = () => {
        try {
          const added = parseCheats(text.value).filter((c) => !this.engine.cheats.some((o) => o.path === c.path));
          this.engine.cheats.push(...added);
          this.saveCheats();
          this.app.log(`导入了 ${added.length} 条金手指`);
          this.shareText = null;
          this.render();
        } catch (e) {
          this.app.log((e as Error).message, true);
        }
      };
      sharePane = h(
        'div',
        { class: 'share-pane' },
        h('p', { class: 'muted note', textContent: '每行一条：名称 | 数值 | 地址路径 [| lock]。粘贴别人分享的文本后点击导入。' }),
        text,
        h('div', { class: 'panel-bar' }, copy, imp),
      );
    }

    fill(
      this.root,
      h('h3', { textContent: '内存搜索' }),
      h('div', { class: 'panel-bar' }, modeSel, valueInput, searchBtn, resetBtn),
      h('p', {
        class: 'muted note',
        textContent:
          this.status ||
          '先搜索当前数值（如金币 1200），让它在游戏里变化后再用新数值搜索，直到剩下少量结果。不知道具体数值时用「未知初值」，再按变大 / 变小筛选。',
      }),
      this.results.length
        ? h(
            'table',
            { class: 'grid' },
            h('thead', null, h('tr', null, ...['位置', '类型', '当前值', '修改为', ''].map((t) => h('th', { textContent: t })))),
            this.resultsEl,
          )
        : null,
      h('div', { class: 'panel-bar' }, h('h3', { textContent: '金手指' }), share),
      this.engine.cheats.length
        ? h(
            'table',
            { class: 'grid' },
            h('thead', null, h('tr', null, ...['锁定', '名称', '当前值', '目标值', ''].map((t) => h('th', { textContent: t })))),
            this.cheatsEl,
          )
        : h('p', { class: 'muted note', textContent: '还没有金手指。在搜索结果中点击「加入金手指」，或导入别人分享的金手指。' }),
      sharePane,
    );
    this.refreshValues();
  }
}
