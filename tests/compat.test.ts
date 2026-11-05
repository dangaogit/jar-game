import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { Emulator, readJar } from '../src/emulator';
import { HeadlessSurfaceFactory } from '../src/midp/surface';
import { rt } from './helpers';

// COMPAT_DIR=<folder of jars>
//   [COMPAT_SAMPLE=60|all] [COMPAT_SHARD=i/n] [COMPAT_OUT=results.jsonl] [COMPAT_TIMEOUT_MS=4000]
//   npx vitest run tests/compat.test.ts
// Aggregate a results file with: node scripts/compat-report.mjs <results.jsonl...>
const dir = process.env.COMPAT_DIR;
const sample = process.env.COMPAT_SAMPLE ?? '60';
const [shardIndex, shardCount] = (process.env.COMPAT_SHARD ?? '0/1').split('/').map(Number);
const outFile = process.env.COMPAT_OUT;
const timeoutMs = Number(process.env.COMPAT_TIMEOUT_MS ?? 4000);
const TARGET_FRAMES = 10;

function seededShuffle<T>(items: T[], seed: number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    const j = seed % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface CompatResult {
  jar: string;
  status: 'ok' | 'slow' | 'no-frame' | 'uncaught' | 'vm-error' | 'load-error' | 'exited';
  frames: number;
  instructions: number;
  ms: number;
  uncaught: string[];
  errors: string[];
}

async function runOne(boot: Map<string, Uint8Array>, path: string, jar: string): Promise<CompatResult> {
  const errors: string[] = [];
  const uncaught: string[] = [];
  const started = Date.now();
  let emu: Emulator;
  try {
    emu = new Emulator({
      rt: boot,
      game: readJar(readFileSync(path)),
      surfaces: new HeadlessSurfaceFactory(),
      storage: null,
      out: (s, stream) => {
        if (stream === 2 && errors.length < 40) errors.push(s.split('\n')[0].slice(0, 300));
      },
    });
    emu.onUncaught((name, desc) => uncaught.push(`${name}: ${desc}`.slice(0, 300)));
    emu.start();
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 300);
    return { jar, status: 'load-error', frames: 0, instructions: 0, ms: Date.now() - started, uncaught, errors: [msg] };
  }
  const deadline = Date.now() + timeoutMs;
  while (emu.midp.frames < TARGET_FRAMES && !emu.vm.halted && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20));
  }
  const frames = emu.midp.frames;
  const halted = emu.vm.halted;
  emu.stop();
  let status: CompatResult['status'];
  if (errors.some((e) => e.startsWith('[VM fatal]'))) status = 'vm-error';
  else if (frames >= TARGET_FRAMES) status = 'ok';
  else if (uncaught.length) status = 'uncaught';
  else if (halted) status = 'exited';
  else status = frames > 0 ? 'slow' : 'no-frame';
  return { jar, status, frames, instructions: emu.vm.icount, ms: Date.now() - started, uncaught, errors };
}

test.skipIf(!dir)('compatibility', async () => {
  const boot = rt();
  let jars = readdirSync(dir!)
    .filter((f) => f.toLowerCase().endsWith('.jar'))
    .sort();
  if (sample !== 'all') jars = seededShuffle(jars, 20261104).slice(0, Number(sample));
  jars = jars.filter((_, i) => i % shardCount === shardIndex);
  const counts: Record<string, number> = {};
  for (const jar of jars) {
    const r = await runOne(boot, join(dir!, jar), jar);
    counts[r.status] = (counts[r.status] ?? 0) + 1;
    if (outFile) appendFileSync(outFile, JSON.stringify(r) + '\n');
    else if (r.status !== 'ok') console.log(`${r.status.padEnd(10)} ${String(r.frames).padStart(3)}f  ${r.jar}  ${r.uncaught[0] ?? r.errors[0] ?? ''}`);
  }
  console.log(`${jars.length} jars:`, counts);
  expect(jars.length).toBeGreaterThan(0);
}, 24 * 3600 * 1000);
