import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHexDumpRows,
  buildWorkspaceTree,
  bytesEqual,
  computeVfsDelta,
  createVirtualFile,
  createVirtualFolder,
  deleteFolderPaths,
  formatCanonicalHexDumpText,
  formatFileSize,
  formatHexDump,
  hasBinaryBytes,
  isBinaryFileName,
  isCppSyntaxFile,
  normalizePath,
  normalizeVirtualPath,
  renameFolderPaths,
  sortVirtualFiles,
  validateFileName,
  validateFolderName,
} from './vfsHelpers';
import { computeCrc32, createZipArchive } from './zipExport';

test('normalizeVirtualPath cleans leading slashes, dot-slashes, and parent traversals', () => {
  assert.equal(normalizeVirtualPath('./input.txt'), 'input.txt');
  assert.equal(normalizeVirtualPath('/output.txt'), 'output.txt');
  assert.equal(normalizeVirtualPath('  ./dir//data.bin  '), 'dir/data.bin');
  assert.equal(normalizeVirtualPath('a/b/../c.h'), 'a/c.h');
  assert.equal(normalizeVirtualPath('../../../etc/passwd'), 'etc/passwd');
  assert.equal(normalizePath('lab7\\nested\\\\out.bin'), 'lab7/nested/out.bin');
  assert.equal(normalizePath('./lab7/../lab7/nested/./a.txt'), 'lab7/nested/a.txt');
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
  assert.equal(validateFileName('lab7', existing, undefined, ['lab7']).ok, false);
  assert.equal(validateFileName('input.txt/child.txt', existing).ok, false);
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

test('createZipArchive builds a valid PKZIP container with CRC-32, UTF-8 payloads, and explicit empty folder entries', () => {
  assert.equal(computeCrc32(new TextEncoder().encode('123456789')), 0xcbf43926);

  const zip = createZipArchive([
    { name: 'main.cpp', content: 'int main() { return 0; }\n' },
    { name: 'lab7/отчёт.txt', content: 'Привет, iPad!\n' },
    { name: 'lab7/nested/data.bin', content: new Uint8Array([0x00, 0x01, 0x02, 0xff]) },
    { name: 'empty_dir/', content: new Uint8Array(0) },
  ]);

  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // Local file header signature at byte 0
  assert.equal(view.getUint32(0, true), 0x04034b50);
  // UTF-8 flag bit 11 (0x0800) set
  assert.equal(view.getUint16(6, true), 0x0800);
  // EOCD record at last 22 bytes
  const eocdOffset = zip.byteLength - 22;
  assert.equal(view.getUint32(eocdOffset, true), 0x06054b50);
  assert.equal(view.getUint16(eocdOffset + 8, true), 4);
  assert.equal(view.getUint16(eocdOffset + 10, true), 4);
  // Central directory starts at offset recorded in EOCD
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  assert.equal(view.getUint32(cdOffset, true), 0x02014b50);
  // Verify nested path and empty_dir/ appear in archive bytes
  const zipLatin = new TextDecoder('latin1').decode(zip);
  assert.equal(zipLatin.includes('lab7/nested/data.bin'), true);
  assert.equal(zipLatin.includes('empty_dir/'), true);
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

test('buildHexDumpRows and formatCanonicalHexDumpText preserve raw 0x00 and 0x80..0xFF bytes with 8+8 split and 4KB limit', () => {
  const bytes = new Uint8Array(20);
  bytes.set([0x48, 0x69, 0x00, 0x7f, 0x80, 0xff, 0x20, 0x7e, 0x41, 0x42, 0x00, 0x0a, 0x30, 0x31, 0x32, 0x33, 0xde, 0xad, 0xbe, 0xef]);

  const rows = buildHexDumpRows(bytes);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].offsetHex, '00000000');
  assert.deepEqual(rows[0].leftBytes, [0x48, 0x69, 0x00, 0x7f, 0x80, 0xff, 0x20, 0x7e]);
  assert.deepEqual(rows[0].rightBytes, [0x41, 0x42, 0x00, 0x0a, 0x30, 0x31, 0x32, 0x33]);
  assert.equal(rows[0].ascii, 'Hi.... ~AB..0123');

  assert.equal(rows[1].offsetHex, '00000010');
  assert.deepEqual(rows[1].leftBytes, [0xde, 0xad, 0xbe, 0xef, null, null, null, null]);
  assert.equal(rows[1].ascii, '....            ');

  const text = formatCanonicalHexDumpText('bin_check.bin', bytes);
  assert.match(text, /^Hex-дамп: bin_check\.bin \(20 Б\)/);
  assert.match(text, /00000000  48 69 00 7F 80 FF 20 7E  41 42 00 0A 30 31 32 33  \|Hi\.\.\.\. ~AB\.\.0123\|/);

  // Truncation check for >4KB payloads
  const big = new Uint8Array(5000);
  big.fill(0x55);
  assert.equal(buildHexDumpRows(big, 4096).length, 256);
  assert.equal(buildHexDumpRows(big, big.byteLength).length, 313);
});

test('hierarchical folder tree, validation, rename, and delete maintain strict invariants', () => {
  const filesMap: Record<string, ReturnType<typeof createVirtualFile>> = {
    'main.cpp': createVirtualFile('main.cpp', 'int main(){}'),
    'main.c': createVirtualFile('main.c', 'int main(){return 0;}'),
    'lab7/input.txt': createVirtualFile('lab7/input.txt', 'hello'),
    'lab7/nested/out.bin': createVirtualFile('lab7/nested/out.bin', new Uint8Array([0, 255])),
  };
  const foldersMap: Record<string, ReturnType<typeof createVirtualFolder>> = {
    empty_dir: createVirtualFolder('empty_dir'),
    lab7: createVirtualFolder('lab7'),
    'lab7/nested': createVirtualFolder('lab7/nested'),
  };

  assert.equal(validateFolderName('lab7', Object.keys(foldersMap), Object.keys(filesMap)).ok, false);
  assert.equal(validateFolderName('main.cpp', Object.keys(foldersMap), Object.keys(filesMap)).ok, false);
  assert.equal(validateFolderName('lab7/sub', Object.keys(foldersMap), Object.keys(filesMap), 'lab7').ok, false);
  assert.deepEqual(
    validateFolderName('lab8', Object.keys(foldersMap), Object.keys(filesMap), 'lab7'),
    { ok: true, normalized: 'lab8' }
  );

  const tree = buildWorkspaceTree(Object.values(filesMap), Object.values(foldersMap), 'main.cpp');
  // Root order: main.cpp, main.c, then folders (empty_dir, lab7)
  assert.equal(tree[0].kind, 'file');
  assert.equal(tree[0].path, 'main.cpp');
  assert.equal(tree[1].kind, 'file');
  assert.equal(tree[1].path, 'main.c');
  assert.equal(tree[2].kind, 'folder');
  assert.equal(tree[2].path, 'empty_dir');
  assert.equal(tree[2].fileCount, 0);
  assert.equal(tree[3].kind, 'folder');
  assert.equal(tree[3].path, 'lab7');
  assert.equal(tree[3].fileCount, 2);

  // Rename lab7 -> hw7 updates all child files and subfolders
  const renamed = renameFolderPaths(filesMap, foldersMap, 'lab7', 'hw7');
  assert.equal('hw7/input.txt' in renamed.nextFilesMap, true);
  assert.equal('hw7/nested/out.bin' in renamed.nextFilesMap, true);
  assert.equal('lab7/input.txt' in renamed.nextFilesMap, false);
  assert.equal('hw7' in renamed.nextFoldersMap, true);
  assert.equal('hw7/nested' in renamed.nextFoldersMap, true);
  assert.equal(renamed.pathRemap.get('lab7/nested/out.bin'), 'hw7/nested/out.bin');

  // Delete hw7 removes folder, nested subfolder, and child files while keeping main.cpp & empty_dir
  const deleted = deleteFolderPaths(renamed.nextFilesMap, renamed.nextFoldersMap, 'hw7', 'main.cpp');
  assert.equal('hw7/input.txt' in deleted.nextFilesMap, false);
  assert.equal('hw7/nested/out.bin' in deleted.nextFilesMap, false);
  assert.equal('hw7' in deleted.nextFoldersMap, false);
  assert.equal('hw7/nested' in deleted.nextFoldersMap, false);
  assert.equal('empty_dir' in deleted.nextFoldersMap, true);
  assert.equal('main.cpp' in deleted.nextFilesMap, true);
});

