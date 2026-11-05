import { join } from 'node:path';
import { expect, test } from 'vitest';
import { Emulator } from '../src/emulator';
import type { BillingRequest } from '../src/midp/platform';
import { HeadlessSurfaceFactory } from '../src/midp/surface';
import { loadDir, root, rt } from './helpers';

async function run(crack: boolean) {
  const lines: string[] = [];
  const requests: BillingRequest[] = [];
  const emu = new Emulator({
    rt: rt(),
    game: loadDir(join(root, 'build/fixtures-midp/billing')),
    surfaces: new HeadlessSurfaceFactory(),
    storage: null,
    out: (s) => lines.push(s),
  });
  emu.midp.billingCrack = crack;
  emu.midp.onBilling = (r) => requests.push(r);
  emu.vm.runMain('Main');
  await emu.vm.waitForExit();
  return { lines, requests };
}

test('premium SMS reports success when the crack is on', async () => {
  const { lines, requests } = await run(true);
  expect(lines).toEqual(['wma text: paid', 'wma binary: paid', 'samsung: paid', 'smsc +8613800100500']);
  expect(requests).toEqual([
    { kind: 1, address: '10658008:16000', text: 'BUY LEVEL2', succeeded: true },
    { kind: 1, address: '10669588', text: '0102ab', succeeded: true },
    { kind: 2, address: '1066916500', text: 'GOLD', succeeded: true },
  ]);
});

test('premium SMS fails like a phone without network when the crack is off', async () => {
  const { lines, requests } = await run(false);
  expect(lines.slice(0, 3)).toEqual([
    'wma text: java.io.IOException SMS send failed',
    'wma binary: java.io.IOException SMS send failed',
    'samsung: java.io.IOException SMS send failed',
  ]);
  expect(requests.every((r) => !r.succeeded)).toBe(true);
});
