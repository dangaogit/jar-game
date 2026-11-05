import type { Emulator } from '../emulator';
import { SnapshotBusyError, readStateInfo } from '../snapshot';
import type { App, Panel } from './app';
import { download, formatTime, h, pickFile, safeFileName } from './dom';
import { deleteSlot, listSlots, putSlot, readSlot, slotKey, type SlotMeta } from './idb';

const SLOTS = 4;

/** saves the running game, waiting briefly if it is in the middle of an asynchronous native call */
async function snapshot(emu: Emulator): Promise<Uint8Array> {
  for (let attempt = 0; ; attempt++) {
    try {
      return emu.saveState();
    } catch (e) {
      if (!(e instanceof SnapshotBusyError) || attempt >= 50) throw e;
      await new Promise((r) => setTimeout(r, 40));
    }
  }
}

const kb = (n: number) => (n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Save-state slots (IndexedDB), save-state files and RMS import / export. */
export class SavesPanel implements Panel {
  private emu: Emulator | null = null;
  private slots: SlotMeta[] = [];
  private busy = false;

  constructor(
    private root: HTMLElement,
    private app: App,
  ) {
    this.render();
  }

  attach(emu: Emulator) {
    const changed = this.emu?.id !== emu.id;
    this.emu = emu;
    if (changed) void this.refresh();
  }

  private async refresh() {
    this.slots = this.emu ? await listSlots(this.emu.id).catch(() => []) : [];
    this.render();
  }

  private async run(what: string, fn: () => Promise<void>) {
    if (this.busy) return;
    this.busy = true;
    try {
      await fn();
    } catch (e) {
      this.app.log(`${what}失败：${(e as Error).message}`, true);
    } finally {
      this.busy = false;
      await this.refresh();
    }
  }

  private save(slot: number) {
    return this.run('存档', async () => {
      const emu = this.app.emu!;
      const data = await snapshot(emu);
      const meta: SlotMeta = {
        key: slotKey(emu.id, slot),
        game: emu.id,
        slot,
        time: Date.now(),
        size: data.length,
        thumb: this.app.thumbnail(),
      };
      await putSlot(meta, data);
      this.app.log(`已保存到槽位 ${slot}（${kb(data.length)}）`);
    });
  }

  private load(meta: SlotMeta) {
    return this.run('读档', async () => {
      const data = await readSlot(meta.key);
      if (!data) throw new Error('存档数据丢失');
      this.app.restore(data);
      this.app.log(`已读取槽位 ${meta.slot}（${formatTime(meta.time)}）`);
    });
  }

  private exportSlot(meta: SlotMeta) {
    return this.run('导出存档', async () => {
      const data = await readSlot(meta.key);
      if (!data) throw new Error('存档数据丢失');
      download(`${safeFileName(this.emu!.info.name)}-槽位${meta.slot}.jgs`, data);
    });
  }

  private importState() {
    return this.run('导入存档', async () => {
      const file = await pickFile('.jgs');
      if (!file) return;
      const data = new Uint8Array(await file.arrayBuffer());
      const info = readStateInfo(data);
      this.app.restore(data);
      this.app.log(`已读取存档文件 ${file.name}（${formatTime(info.time)}）`);
    });
  }

  private exportRms() {
    const emu = this.app.emu!;
    download(`${safeFileName(emu.info.name)}.rms.json`, emu.rms.exportJson(), 'application/json');
  }

  private importRms() {
    return this.run('导入 RMS', async () => {
      const file = await pickFile('.json,application/json');
      if (!file) return;
      const text = await file.text();
      JSON.parse(text);
      this.app.emu!.rms.importJson(text);
      this.app.log(`已导入 RMS 存档 ${file.name}，正在重启游戏`);
      this.app.restart();
    });
  }

  private render() {
    if (!this.emu) {
      this.root.replaceChildren(h('p', { class: 'muted', textContent: '加载游戏后可以即时存档、读档。' }));
      return;
    }
    const rows = h('div', { class: 'slots' });
    for (let slot = 1; slot <= SLOTS; slot++) {
      const meta = this.slots.find((m) => m.slot === slot);
      const save = h('button', { class: 'btn small primary', textContent: '保存' });
      save.onclick = () => void this.save(slot);
      const actions = h('div', { class: 'slot-actions' }, save);
      if (meta) {
        const load = h('button', { class: 'btn small', textContent: '读取' });
        load.onclick = () => void this.load(meta);
        const exp = h('button', { class: 'btn small', textContent: '导出' });
        exp.onclick = () => void this.exportSlot(meta);
        const del = h('button', { class: 'btn small danger', textContent: '删除' });
        del.onclick = () => void this.run('删除存档', () => deleteSlot(meta.key));
        actions.append(load, exp, del);
      }
      rows.append(
        h(
          'div',
          { class: 'slot' },
          meta?.thumb ? h('img', { class: 'thumb', src: meta.thumb, alt: '' }) : h('div', { class: 'thumb empty' }),
          h(
            'div',
            { class: 'slot-info' },
            h('div', { class: 'slot-title', textContent: `槽位 ${slot}` }),
            h('div', { class: 'muted', textContent: meta ? `${formatTime(meta.time)} · ${kb(meta.size)}` : '空' }),
          ),
          actions,
        ),
      );
    }
    const importState = h('button', { class: 'btn small', textContent: '读取存档文件…' });
    importState.onclick = () => void this.importState();
    const exportRms = h('button', { class: 'btn small', textContent: '导出 RMS' });
    exportRms.onclick = () => this.exportRms();
    const importRms = h('button', { class: 'btn small', textContent: '导入 RMS…' });
    importRms.onclick = () => void this.importRms();
    this.root.replaceChildren(
      h('h3', { textContent: '即时存档' }),
      h('p', {
        class: 'muted note',
        textContent: '保存游戏此刻的完整运行状态（内存、线程、画面和 RMS），读档后从存档那一刻继续。',
      }),
      rows,
      h('div', { class: 'panel-bar' }, importState),
      h('h3', { textContent: 'RMS 存档' }),
      h('p', {
        class: 'muted note',
        textContent: '游戏自己写入的存档数据（RecordStore），会自动保存在浏览器里。可导出备份或迁移到其他设备，导入后游戏会重启。',
      }),
      h('div', { class: 'panel-bar' }, exportRms, importRms),
    );
  }
}
