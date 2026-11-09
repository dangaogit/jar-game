import { join } from 'node:path';
import { expect, test } from 'vitest';
import { Emulator } from '../src/emulator';
import { HeadlessSurfaceFactory } from '../src/midp/surface';
import { readStateInfo } from '../src/snapshot';
import { loadDir, root, rt } from './helpers';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => boolean) {
  const deadline = performance.now() + 3000;
  while (!check()) {
    if (performance.now() > deadline) throw new Error('timed out');
    await delay(5);
  }
}
function create(lines: string[], width = 176, height = 208) {
  const game = loadDir(join(root, 'build/fixtures-midp/lifecycle'));
  game.set('META-INF/MANIFEST.MF', new TextEncoder().encode('MIDlet-Name: Lifecycle\nMIDlet-1: Lifecycle,,Main\n'));
  return new Emulator({ rt: rt(), game,
    surfaces: new HeadlessSurfaceFactory(), storage: null, width, height, out: (s) => lines.push(s) });
}

test('pause delivers lifecycle, freezes frames and clock, and resumes repeatedly', async () => {
  const lines: string[] = [];
  const e = create(lines);
  try {
    e.start();
    await until(() => e.midp.frames >= 3);
    for (let i = 0; i < 3; i++) {
      e.pause();
      e.pause();
      await until(() => e.vm.paused);
      expect(lines.filter((s) => s === 'pause')).toHaveLength(i + 1);
      const frames = e.midp.frames, time = e.vm.now(), instructions = e.vm.icount;
      e.vm.speed = 2;
      e.vm.kick();
      await delay(60);
      expect(e.midp.frames).toBe(frames);
      expect(e.vm.icount).toBe(instructions);
      expect(e.vm.now()).toBe(time);
      e.resume();
      e.resume();
      await until(() => e.midp.frames > frames);
    }
    expect(lines.filter((s) => s === 'start')).toHaveLength(4);
  } finally { e.stop(); }
});

test('paused snapshot restores running, preserves clock and rejects wrong dimensions', async () => {
  const lines: string[] = [];
  const e = create(lines), restored = create(lines), wrong = create([], 240, 320);
  try {
    e.start();
    await until(() => e.midp.frames >= 2);
    e.vm.speed = 4;
    e.pause();
    await until(() => e.vm.paused);
    const clock = e.vm.currentTimeMillis();
    const data = e.saveState();
    expect(readStateInfo(data)).toMatchObject({ width: 176, height: 208 });
    expect(() => wrong.loadState(data)).toThrow('分辨率');
    e.stop();
    restored.loadState(data);
    expect(restored.paused).toBe(false);
    expect(restored.vm.currentTimeMillis()).toBeGreaterThanOrEqual(clock);
    const frames = restored.midp.frames;
    await until(() => restored.midp.frames > frames);
    expect(lines.filter((s) => s === 'start')).toHaveLength(2);
  } finally { e.stop(); restored.stop(); wrong.stop(); }
});

test('resume before pause acknowledgement does not leave a delayed freeze', async () => {
  const e = create([]);
  try {
    e.start();
    await until(() => e.midp.frames >= 2);
    e.pause(); e.resume();
    const frames = e.midp.frames;
    await delay(220);
    expect(e.vm.paused).toBe(false);
    expect(e.midp.frames).toBeGreaterThan(frames);
  } finally { e.stop(); }
});

test('a missing lifecycle acknowledgement still freezes, and stop cancels pending pause', async () => {
  const e = create([]);
  try {
    e.start();
    await until(() => e.midp.frames >= 2);
    e.midp.onPauseComplete = null;
    e.pause();
    await until(() => e.vm.paused);
    const time = e.vm.now(), frames = e.midp.frames;
    await delay(30);
    expect(e.vm.now()).toBe(time);
    expect(e.midp.frames).toBe(frames);
    e.resume();
    await until(() => e.midp.frames > frames);
    e.pause();
    e.stop();
    await delay(180);
    expect(e.vm.halted).toBe(true);
    expect(e.vm.paused).toBe(false);
  } finally { e.stop(); }
});
