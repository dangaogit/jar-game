import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { JVM } from '../src/vm/jvm';
import { installLang } from '../src/vm/natives/lang';
import { loadDir, root, rt } from './helpers';

const fixtures = join(root, 'build/fixtures');
const boot = rt();

describe('conformance with a real JVM', () => {
  for (const name of readdirSync(join(root, 'tests/java'))) {
    test(name, async () => {
      const lines: string[] = [];
      const errors: string[] = [];
      const vm = new JVM({
        boot,
        app: loadDir(join(fixtures, name)),
        out: (s, stream) => (stream === 1 ? lines : errors).push(s),
      }).install(installLang);
      vm.runMain('Main');
      const code = await vm.waitForExit();
      expect(errors).toEqual([]);
      expect(code).toBe(0);
      const expected = readFileSync(join(fixtures, `${name}.expected.txt`), 'utf8').split('\n');
      expected.pop();
      expect(lines).toEqual(expected);
    }, 20000);
  }
});
