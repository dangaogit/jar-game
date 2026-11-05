import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  CheatEngine,
  MemoryScanner,
  describeCell,
  formatCheats,
  parseCheats,
  pathOf,
  readCell,
  resolvePath,
} from '../src/cheats';
import { JVM } from '../src/vm/jvm';
import { installLang } from '../src/vm/natives/lang';
import { loadDir, root, rt } from './helpers';

const boot = rt();

function start() {
  const lines: string[] = [];
  const vm = new JVM({ boot, app: loadDir(join(root, 'build/fixtures/cheats')), out: (s) => lines.push(s) }).install(
    installLang,
  );
  vm.runMain('Main');
  return { vm, lines };
}

const settle = () => new Promise((r) => setTimeout(r, 30));

test('search narrows to a value and the cheat path resolves back to it', async () => {
  const { vm, lines } = start();
  await settle();
  const scanner = new MemoryScanner(vm);
  scanner.first('eq', 100);
  const hp = scanner.results(1000).find((r) => describeCell(r) === 'Player.hp');
  expect(hp).toBeDefined();

  const steps = new MemoryScanner(vm);
  steps.first('unknown');
  await settle();
  steps.next('inc');
  expect(steps.results(1000).map(describeCell)).toContain('Player.steps');

  const path = pathOf(vm, hp!);
  expect(path).toBe('Main.inst:LMain;.player:LPlayer;.hp:I');
  expect(resolvePath(vm, path!)).toEqual({ holder: hp!.holder, index: hp!.index, type: 'I' });

  const items = new MemoryScanner(vm);
  items.first('eq', 8);
  const item = items.results(1000).find((r) => describeCell(r) === 'int[3] [1]')!;
  expect(pathOf(vm, item)).toBe('Main.inst:LMain;.items:[I.1');

  const engine = new CheatEngine();
  engine.attach(vm);
  engine.cheats = parseCheats(
    formatCheats([
      { name: '生命', path: path!, value: 999, locked: true },
      { name: '金钱', path: 'Main.money:I', value: 99999, locked: false },
      { name: '道具', path: 'Main.inst:LMain;.items:[I.1', value: 5, locked: true },
    ]),
  );
  expect(engine.cheats[0].locked).toBe(true);
  expect(engine.cheats[1].locked).toBe(false);
  expect(engine.apply(engine.cheats[1])).toBe(true);
  expect(readCell(resolvePath(vm, 'Main.money:I')!)).toBe(99999);
  expect(resolvePath(vm, 'Main.missing:I')).toBeNull();

  await vm.waitForExit();
  expect(lines).toEqual(['hp=999 money=99999 item1=5']);
});
