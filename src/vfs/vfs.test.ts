import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bytesEqual,
  computeVfsDelta,
  createVirtualFile,
  formatFileSize,
  formatHexDump,
  hasBinaryBytes,
  isBinaryFileName,
  isCppSyntaxFile,
  normalizeVirtualPath,
  sortVirtualFiles,
  validateFileName,
} from './vfsHelpers';
import { computeCrc32, createZipArchive } from './zipExport';

test('normalizeVirtualPath cleans leading slashes, dot-slashes, and parent traversals', () => {
  assert.equal(normalizeVirtualPath('./input.txt'), 'input.txt');
  assert.equal(normalizeVirtualPath('/output.txt'), 'output.txt');
  assert.equal(normalizeVirtualPath('  ./dir//data.bin  '), 'dir/data.bin');
  assert.equal(normalizeVirtualPath('a/b/../c.h'), 'a/c.h');
  assert.equal(normalizeVirtualPath('../../../etc/passwd'), 'etc/passwd');
});

test('validateFileName enforces non-empty, safe characters, and uniqueness', () => {
  const existing = ['main.cpp', 'input.txt'];
  assert.deepEqual(validateFileName('header.h', existing), { ok: true, normalized: 'header.h' });
  assert.equal(validateFileName('', existing).ok, false);
  assert.equal(validateFileName('input.txt', existing).ok, false);
  assert.deepEqual(validateFileName('input.txt', existing, 'input.txt'), {
    ok: true,
    normalized: 'input.txt',
  });
  assert.equal(validateFileName('bad:name.txt', existing).ok, false);
  assert.equal(validateFileName('../escape.txt', existing).ok, false);
});

test('syntax and binary file classification matches expected extensions', () => {
  assert.equal(isCppSyntaxFile('main.cpp'), true);
  assert.equal(isCppSyntaxFile('utils.h'), true);
  assert.equal(isCppSyntaxFile('math.hpp'), true);
  assert.equal(isCppSyntaxFile('input.txt'), false);
  assert.equal(isCppSyntaxFile('table.csv'), false);
  assert.equal(isCppSyntaxFile('data.dat'), false);

  assert.equal(isBinaryFileName('data.bin'), true);
  assert.equal(isBinaryFileName('records.dat'), true);
  assert.equal(isBinaryFileName('notes.txt'), false);
});

test('computeVfsDelta accurately detects created, modified, and deleted files', () => {
  const before = new Map<string, string>([
    ['main.cpp', 'int main() {}'],
    ['input.txt', '1 2 3'],
    ['temp.txt', 'delete me'],
  ]);
  const after = new Map<string, string>([
    ['main.cpp', 'int main() {}'],
    ['input.txt', '1 2 3 4'],
    ['output.txt', 'sum=10'],
  ]);

  const delta = computeVfsDelta(before, after);
  assert.deepEqual(delta, {
    created: ['output.txt'],
    modified: ['input.txt'],
    deleted: ['temp.txt'],
  });
});

test('sortVirtualFiles pins primary and secondary entry files first', () => {
  const files = [
    createVirtualFile('zebra.txt', 'z'),
    createVirtualFile('main.c', 'c'),
    createVirtualFile('alpha.h', 'h'),
    createVirtualFile('main.cpp', 'cpp'),
  ];
  const sorted = sortVirtualFiles(files, 'main.cpp').map((f) => f.name);
  assert.deepEqual(sorted, ['main.cpp', 'main.c', 'alpha.h', 'zebra.txt']);
  assert.equal(formatFileSize(512), '512 Б');
  assert.equal(formatFileSize(2048), '2.0 КБ');
});

test('createZipArchive builds a valid PKZIP container with CRC-32 and UTF-8 payloads', () => {
  assert.equal(computeCrc32(new TextEncoder().encode('123456789')), 0xcbf43926);

  const zip = createZipArchive([
    { name: 'main.cpp', content: 'int main() { return 0; }\n' },
    { name: 'отчёт.txt', content: 'Привет, iPad!\n' },
    { name: 'data.bin', content: '\x00\x01\x02\xff' },
  ]);

  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // Local file header signature at byte 0
  assert.equal(view.getUint32(0, true), 0x04034b50);
  // UTF-8 flag bit 11 (0x0800) set
  assert.equal(view.getUint16(6, true), 0x0800);
  // EOCD record at last 22 bytes
  const eocdOffset = zip.byteLength - 22;
  assert.equal(view.getUint32(eocdOffset, true), 0x06054b50);
  assert.equal(view.getUint16(eocdOffset + 8, true), 3);
  assert.equal(view.getUint16(eocdOffset + 10, true), 3);
  // Central directory starts at offset recorded in EOCD
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  assert.equal(view.getUint32(cdOffset, true), 0x02014b50);
});

test('preserves raw Uint8Array payloads with null and non-UTF8 bytes without corruption', () => {
  const raw = new Uint8Array([0x00, 0x01, 0x41, 0x00, 0x80, 0xfe, 0xff, 0x42]);
  const vf = createVirtualFile('struct.bin', raw);

  assert.equal(vf.isBinary, true);
  assert.equal(vf.size, raw.byteLength);
  assert.equal(bytesEqual(vf.bytes, raw), true);
  // Mutating original input must not mutate stored file bytes
  raw[0] = 0x99;
  assert.equal(vf.bytes[0], 0x00);

  // Hex preview contains offset, 00 byte, FF byte, and ASCII column
  const dump = formatHexDump(vf.bytes);
  assert.match(dump, /00000000/);
  assert.match(dump, /00 01 41 00 80 FE FF 42/);
  assert.equal(vf.content, dump);

  assert.equal(hasBinaryBytes(vf.bytes), true);
  assert.equal(hasBinaryBytes(new TextEncoder().encode('Привет, C++!\n')), false);

  // computeVfsDelta detects single-byte binary changes accurately
  const before = new Map<string, Uint8Array>([['struct.bin', new Uint8Array([0, 1, 2, 0])]]);
  const after = new Map<string, Uint8Array>([
    ['struct.bin', new Uint8Array([0, 1, 3, 0])],
    ['new.bin', new Uint8Array([0xff, 0x00])],
  ]);
  const delta = computeVfsDelta(before, after);
  assert.deepEqual(delta, {
    created: ['new.bin'],
    modified: ['struct.bin'],
    deleted: [],
  });

  // PKZIP stores exact Uint8Array payload verbatim with matching CRC-32
  const zip = createZipArchive([{ name: 'struct.bin', content: vf.bytes }]);
  const zView = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  assert.equal(zView.getUint32(14, true), computeCrc32(vf.bytes));
  assert.equal(zView.getUint32(18, true), vf.bytes.byteLength);
});
