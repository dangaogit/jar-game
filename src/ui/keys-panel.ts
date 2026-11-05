import type { Emulator } from '../emulator';
import { KeyBindings, PHONE_KEYS, keyLabel } from '../keymap';
import type { Panel } from './app';
import { h } from './dom';

/** Editable key bindings, saved per game. */
export class KeysPanel implements Panel {
  bindings = new KeyBindings(localStorage, null);
  private gameName = '';
  /** phone key id waiting for a keyboard key */
  private capturing: string | null = null;

  constructor(private root: HTMLElement) {
    window.addEventListener('keydown', (e) => this.capture(e), true);
    this.render();
  }

  attach(emu: Emulator) {
    if (this.bindings.gameId === emu.id) return;
    this.bindings = new KeyBindings(localStorage, emu.id);
    this.gameName = emu.info.name;
    this.capturing = null;
    this.render();
  }

  /** MIDP key code for a keyboard event, unless the panel is waiting for a binding */
  lookup(code: string): number | undefined {
    return this.capturing ? undefined : this.bindings.lookup(code);
  }

  private capture(e: KeyboardEvent) {
    if (!this.capturing) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.code !== 'Escape') this.bindings.bind(this.capturing, e.code);
    this.capturing = null;
    this.render();
  }

  private render() {
    const b = this.bindings;
    const scope = b.gameId
      ? `「${this.gameName}」${b.custom ? '的专属键位' : '（使用默认键位，修改后单独保存）'}`
      : '默认键位（未加载游戏，修改会作为所有游戏的默认值）';
    const reset = h('button', { class: 'btn small', textContent: b.gameId ? '恢复默认' : '恢复内置键位' });
    reset.onclick = () => {
      b.reset();
      this.render();
    };
    const grid = h('div', { class: 'keymap' });
    for (const k of PHONE_KEYS) {
      const cell = h('div', { class: 'keys' });
      grid.append(h('div', { class: 'key-label', textContent: k.label }), cell);
      for (const code of b.map[k.id]) {
        const chip = h('button', { class: 'kbd', title: '点击移除', textContent: keyLabel(code) });
        chip.onclick = () => {
          b.unbind(k.id, code);
          this.render();
        };
        cell.append(chip);
      }
      if (this.capturing === k.id) {
        cell.append(h('span', { class: 'capturing', textContent: '请按下按键…（Esc 取消）' }));
      } else {
        const add = h('button', { class: 'kbd add', title: '添加按键', textContent: '+' });
        add.onclick = () => {
          this.capturing = k.id;
          this.render();
        };
        cell.append(add);
      }
    }
    this.root.replaceChildren(
      h('div', { class: 'panel-bar' }, h('span', { class: 'muted', textContent: scope }), reset),
      grid,
      h('p', { class: 'muted note', textContent: '点击按键标签可移除；同一个键盘按键只能绑定到一个手机按键。' }),
    );
  }
}
