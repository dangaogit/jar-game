import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { unzipSync } from 'fflate';

export const root = join(import.meta.dirname, '..');

export function loadJar(path: string): Map<string, Uint8Array> {
  return new Map(Object.entries(unzipSync(readFileSync(path))));
}

export function loadDir(dir: string): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.set(relative(dir, p).split('\\').join('/'), readFileSync(p));
    }
  };
  walk(dir);
  return out;
}

export function rt(): Map<string, Uint8Array> {
  return loadJar(join(root, 'public/rt.jar'));
}
