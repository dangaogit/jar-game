import { gameInfo, type GameInfo } from '../emulator';
import { deleteGame, listGames, putGame, readGame } from './idb';
import { formatTime, h } from './dom';

export async function rememberGame(entries: Map<string, Uint8Array>, bytes: Uint8Array, fileName: string) {
  const info: GameInfo = gameInfo(entries);
  const path = info.midlets[0]?.icon?.replace(/^\/+/, '');
  const iconBytes = path ? entries.get(path) : null;
  let icon = '';
  if (iconBytes && iconBytes.length < 256 * 1024) {
    let binary = '';
    for (const b of iconBytes) binary += String.fromCharCode(b);
    icon = `data:image/png;base64,${btoa(binary)}`;
  }
  await putGame({ id: `${info.name}|${info.vendor}`, name: info.name, vendor: info.vendor,
    fileName, played: Date.now(), icon }, bytes);
}

export class Library {
  constructor(private root: HTMLElement, private load: (bytes: Uint8Array, name: string) => Promise<void>,
    private report: (message: string, error?: boolean) => void) {}

  async refresh() {
    try {
      const games = await listGames();
      this.root.replaceChildren();
      if (!games.length) this.root.append(h('p', { class: 'muted', textContent: '导入的游戏会留在这里。下次回来，直接继续。' }));
      for (const game of games) {
        const open = h('button', { class: 'library-open' },
          game.icon ? h('img', { src: game.icon, alt: '' }) : h('span', { class: 'game-icon', textContent: 'J' }),
          h('span', {}, h('strong', { textContent: game.name }), h('small', { textContent: `上次游玩 ${formatTime(game.played)}` })));
        open.onclick = async () => {
          open.disabled = true;
          try {
            const bytes = await readGame(game.id);
            if (!bytes) throw new Error('游戏文件丢失，请重新导入');
            await this.load(bytes, game.fileName);
          } catch (e) { this.report((e as Error).message, true); }
          finally { open.disabled = false; }
        };
        const remove = h('button', { class: 'btn small', textContent: '移除', title: '仅移除游戏文件，保留存档' });
        remove.onclick = async () => {
          try { await deleteGame(game.id); await this.refresh(); }
          catch (e) { this.report(`移除失败：${(e as Error).message}`, true); }
        };
        this.root.append(h('div', { class: 'library-item' }, open, remove));
      }
    } catch { this.root.replaceChildren(h('p', { class: 'muted', textContent: '浏览器存储不可用，仍可导入游戏游玩。' })); }
  }
}
