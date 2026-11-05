// Compiles the Java platform library (rt/src) into public/rt.jar.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'rt/src');
const genDir = join(root, 'build/rt-gen');
const outDir = join(root, 'build/rt-classes');
const jarPath = join(root, 'public/rt.jar');

/** [fully qualified name, superclass, extra int-index constructor] */
const THROWABLES = [
  ['java.lang.Exception', 'java.lang.Throwable'],
  ['java.lang.Error', 'java.lang.Throwable'],
  ['java.lang.RuntimeException', 'java.lang.Exception'],
  ['java.lang.ArithmeticException', 'java.lang.RuntimeException'],
  ['java.lang.IndexOutOfBoundsException', 'java.lang.RuntimeException'],
  ['java.lang.ArrayIndexOutOfBoundsException', 'java.lang.IndexOutOfBoundsException', 'Array index out of range: '],
  ['java.lang.StringIndexOutOfBoundsException', 'java.lang.IndexOutOfBoundsException', 'String index out of range: '],
  ['java.lang.ArrayStoreException', 'java.lang.RuntimeException'],
  ['java.lang.ClassCastException', 'java.lang.RuntimeException'],
  ['java.lang.ClassNotFoundException', 'java.lang.Exception'],
  ['java.lang.CloneNotSupportedException', 'java.lang.Exception'],
  ['java.lang.IllegalAccessException', 'java.lang.Exception'],
  ['java.lang.InstantiationException', 'java.lang.Exception'],
  ['java.lang.InterruptedException', 'java.lang.Exception'],
  ['java.lang.IllegalArgumentException', 'java.lang.RuntimeException'],
  ['java.lang.IllegalThreadStateException', 'java.lang.IllegalArgumentException'],
  ['java.lang.NumberFormatException', 'java.lang.IllegalArgumentException'],
  ['java.lang.IllegalMonitorStateException', 'java.lang.RuntimeException'],
  ['java.lang.IllegalStateException', 'java.lang.RuntimeException'],
  ['java.lang.NegativeArraySizeException', 'java.lang.RuntimeException'],
  ['java.lang.NullPointerException', 'java.lang.RuntimeException'],
  ['java.lang.SecurityException', 'java.lang.RuntimeException'],
  ['java.lang.UnsupportedOperationException', 'java.lang.RuntimeException'],
  ['java.lang.VirtualMachineError', 'java.lang.Error'],
  ['java.lang.OutOfMemoryError', 'java.lang.VirtualMachineError'],
  ['java.lang.StackOverflowError', 'java.lang.VirtualMachineError'],
  ['java.lang.LinkageError', 'java.lang.Error'],
  ['java.lang.NoClassDefFoundError', 'java.lang.LinkageError'],
  ['java.lang.UnsatisfiedLinkError', 'java.lang.LinkageError'],
  ['java.lang.ExceptionInInitializerError', 'java.lang.LinkageError'],
  ['java.lang.IncompatibleClassChangeError', 'java.lang.LinkageError'],
  ['java.lang.AbstractMethodError', 'java.lang.IncompatibleClassChangeError'],
  ['java.lang.NoSuchFieldError', 'java.lang.IncompatibleClassChangeError'],
  ['java.lang.NoSuchMethodError', 'java.lang.IncompatibleClassChangeError'],
  ['java.lang.InstantiationError', 'java.lang.IncompatibleClassChangeError'],
  ['java.io.IOException', 'java.lang.Exception'],
  ['java.io.EOFException', 'java.io.IOException'],
  ['java.io.InterruptedIOException', 'java.io.IOException'],
  ['java.io.UnsupportedEncodingException', 'java.io.IOException'],
  ['java.io.UTFDataFormatException', 'java.io.IOException'],
  ['java.util.NoSuchElementException', 'java.lang.RuntimeException'],
  ['java.util.EmptyStackException', 'java.lang.RuntimeException'],
  ['javax.microedition.midlet.MIDletStateChangeException', 'java.lang.Exception'],
  ['javax.microedition.io.ConnectionNotFoundException', 'java.io.IOException'],
  ['javax.microedition.media.MediaException', 'java.lang.Exception'],
  ['javax.microedition.rms.RecordStoreException', 'java.lang.Exception'],
  ['javax.microedition.rms.RecordStoreFullException', 'javax.microedition.rms.RecordStoreException'],
  ['javax.microedition.rms.RecordStoreNotFoundException', 'javax.microedition.rms.RecordStoreException'],
  ['javax.microedition.rms.RecordStoreNotOpenException', 'javax.microedition.rms.RecordStoreException'],
  ['javax.microedition.rms.InvalidRecordIDException', 'javax.microedition.rms.RecordStoreException'],
];

function writeGen(fqcn, source) {
  const file = join(genDir, fqcn.replace(/\./g, '/') + '.java');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, source);
}

function generate() {
  rmSync(genDir, { recursive: true, force: true });
  for (const [fqcn, sup, indexPrefix] of THROWABLES) {
    const pkg = fqcn.slice(0, fqcn.lastIndexOf('.'));
    const name = fqcn.slice(pkg.length + 1);
    const indexCtor = indexPrefix
      ? `\n    public ${name}(int index) {\n        super("${indexPrefix}" + index);\n    }\n`
      : '';
    writeGen(
      fqcn,
      `package ${pkg};\n\npublic class ${name} extends ${sup} {\n    public ${name}() {\n        super();\n    }\n\n    public ${name}(String message) {\n        super(message);\n    }\n${indexCtor}}\n`,
    );
  }
  const sb = readFileSync(join(srcDir, 'java/lang/StringBuffer.java'), 'utf8')
    .replace(/^\/\*\*.*\*\/\n/m, '')
    .replace(/StringBuffer/g, 'StringBuilder');
  writeGen('java.lang.StringBuilder', sb);
}

function listFiles(dir, ext, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) listFiles(p, ext, out);
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

generate();
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const sources = [...listFiles(srcDir, '.java'), ...listFiles(genDir, '.java')];
execFileSync(
  'javac',
  [
    '-source', '8',
    '-target', '8',
    '-encoding', 'UTF-8',
    '-nowarn',
    '-Xlint:-options',
    '-g:source,lines',
    '-bootclasspath', outDir,
    '-sourcepath', `${srcDir}:${genDir}`,
    '-d', outDir,
    ...sources,
  ],
  { stdio: 'inherit' },
);

const entries = {};
for (const file of listFiles(outDir, '.class')) entries[relative(outDir, file)] = readFileSync(file);
mkdirSync(dirname(jarPath), { recursive: true });
writeFileSync(jarPath, zipSync(entries, { level: 6 }));
console.log(`rt.jar: ${Object.keys(entries).length} classes -> ${relative(root, jarPath)}`);
