// Compiles tests/java/<name>/*.java against our rt and records the output of a real JVM as the golden file.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const testsDir = join(root, 'tests/java');
const outRoot = join(root, 'build/fixtures');
const rtClasses = join(root, 'build/rt-classes');

rmSync(outRoot, { recursive: true, force: true });
for (const name of readdirSync(testsDir)) {
  const src = join(testsDir, name);
  const out = join(outRoot, name);
  mkdirSync(out, { recursive: true });
  const files = readdirSync(src)
    .filter((f) => f.endsWith('.java'))
    .map((f) => join(src, f));
  execFileSync(
    'javac',
    ['-source', '8', '-target', '8', '-encoding', 'UTF-8', '-nowarn', '-Xlint:-options', '-g:source,lines', '-bootclasspath', rtClasses, '-d', out, ...files],
    { stdio: 'inherit' },
  );
  const expected = execFileSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-cp', out, 'Main'], {
    encoding: 'utf8',
  });
  writeFileSync(join(outRoot, `${name}.expected.txt`), expected);
  console.log(`fixture ${name}: ${expected.split('\n').length - 1} lines`);
}
