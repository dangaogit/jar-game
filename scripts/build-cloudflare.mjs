// Workers Builds does not guarantee a JDK. Bootstrap Temurin 21 before the normal build.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let workDir;
const env = { ...process.env, BASE_PATH: '/' };

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status} (${url})`);
  return response;
}

try {
  const javac = spawnSync('javac', ['-version'], { encoding: 'utf8' });
  if (javac.status !== 0 || process.argv.includes('--download-jdk')) {
    const os = { linux: 'linux', darwin: 'mac' }[process.platform];
    const arch = { x64: 'x64', arm64: 'aarch64' }[process.arch];
    if (!os || !arch) throw new Error('Install JDK 21 and add javac to PATH before building on this platform');
    const assets = await (await get(`https://api.adoptium.net/v3/assets/latest/21/hotspot?os=${os}&architecture=${arch}&image_type=jdk&vendor=eclipse`)).json();
    const pkg = assets[0]?.binary?.package;
    if (!pkg?.link || !/^[a-f0-9]{64}$/i.test(pkg.checksum)) throw new Error('Invalid Temurin release metadata');
    console.log(`Downloading Temurin 21: ${pkg.name}`);
    const archive = Buffer.from(await (await get(pkg.link)).arrayBuffer());
    if (createHash('sha256').update(archive).digest('hex') !== pkg.checksum.toLowerCase()) {
      throw new Error('JDK archive SHA-256 mismatch');
    }
    const scratch = join(homedir(), '.tmp', 'jargame-cloudflare-build');
    mkdirSync(scratch, { recursive: true });
    workDir = mkdtempSync(join(scratch, 'jdk-'));
    const archivePath = join(workDir, 'jdk.tar.gz');
    const jdkDir = join(workDir, 'jdk');
    writeFileSync(archivePath, archive);
    mkdirSync(jdkDir);
    execFileSync('tar', ['-xzf', archivePath, '-C', jdkDir, '--strip-components=1'], { stdio: 'inherit' });
    const javaHome = os === 'mac' ? join(jdkDir, 'Contents', 'Home') : jdkDir;
    env.JAVA_HOME = javaHome;
    env.PATH = `${join(javaHome, 'bin')}${delimiter}${env.PATH ?? ''}`;
  }
  execFileSync('javac', ['-version'], { env, stdio: 'inherit' });
  execFileSync(process.execPath, ['scripts/build-rt.mjs'], { cwd: root, env, stdio: 'inherit' });
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit'], { cwd: root, env, stdio: 'inherit' });
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { cwd: root, env, stdio: 'inherit' });
} finally {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
}
