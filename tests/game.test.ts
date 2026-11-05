import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { Emulator, readJar } from '../src/emulator';
import { HeadlessSurfaceFactory } from '../src/midp/surface';
import { rt } from './helpers';

// GAME_JAR=<path to a game .jar> [DUMP_STACKS=1] npx vitest run tests/game.test.ts
const GAME_JAR = process.env.GAME_JAR ?? '';

test.skipIf(!GAME_JAR || !existsSync(GAME_JAR))('real game boots and presents frames headlessly', async () => {
  const log: string[] = [];
  const emu = new Emulator({
    rt: rt(),
    game: readJar(readFileSync(GAME_JAR)),
    surfaces: new HeadlessSurfaceFactory(),
    storage: null,
    out: (s, stream) => {
      if (log.length < 200) log.push(`${stream === 2 ? 'ERR ' : ''}${s}`);
    },
  });
  const uncaught: string[] = [];
  emu.onUncaught((name, desc) => uncaught.push(`${name}: ${desc}`));
  emu.start();
  const deadline = Date.now() + 15000;
  while (emu.midp.frames < 30 && !emu.vm.halted && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }
  if (process.env.DUMP_STACKS) {
    for (const t of emu.vm.threads) {
      emu.vm.current = t;
      console.log(`thread ${t.name} state=${t.state}\n  ${emu.vm.captureStack(t).slice(0, 8).join('\n  ')}`);
    }
    emu.vm.current = null;
  }
  emu.stop();
  console.log(`frames=${emu.midp.frames} instructions=${emu.vm.icount}\n${log.slice(0, 40).join('\n')}`);
  expect(uncaught).toEqual([]);
  expect(emu.midp.frames).toBeGreaterThanOrEqual(30);
}, 30000);
