import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { Emulator } from '../src/emulator';
import { HeadlessSurfaceFactory } from '../src/midp/surface';
import { loadDir, root, rt } from './helpers';

const fixtures = join(root, 'build/fixtures');
const boot = rt();

// Every scheduler tick the running program is saved, restored into a brand-new emulator and continued there;
// the output must still match the real JVM line for line.
describe('save states survive a restore at every tick', () => {
  for (const name of readdirSync(join(root, 'tests/java'))) {
    test(name, async () => {
      const app = loadDir(join(fixtures, name));
      const lines: string[] = [];
      const errors: string[] = [];
      const create = () => {
        const emu = new Emulator({
          rt: boot,
          game: app,
          surfaces: new HeadlessSurfaceFactory(),
          storage: null,
          out: (s, stream) => (stream === 1 ? lines : errors).push(s),
        });
        emu.vm.sliceMs = 0;
        emu.vm.quantum = 97;
        return emu;
      };
      let emu = create();
      emu.vm.runMain('Main');
      let restores = 0;
      while (!emu.vm.halted) {
        await new Promise((r) => setTimeout(r, 0));
        if (emu.vm.halted) break;
        const data = emu.saveState();
        emu.vm.halt(-1);
        emu = create();
        emu.loadState(data);
        restores++;
      }
      expect(errors).toEqual([]);
      expect(emu.vm.exitCode).toBe(0);
      expect(restores).toBeGreaterThan(0);
      const expected = readFileSync(join(fixtures, `${name}.expected.txt`), 'utf8').split('\n');
      expected.pop();
      expect(lines).toEqual(expected);
    }, 60000);
  }
});
