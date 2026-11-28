import type { Language } from '../types/compiler';
import type {
  HexDumpRow,
  VfsSyncDelta,
  VirtualFile,
  VirtualFolder,
  WorkspaceTreeFileNode,
  WorkspaceTreeFolderNode,
  WorkspaceTreeNode,
} from './types';

const CPP_SYNTAX_EXTENSIONS = new Set([
  'cpp',
  'cc',
  'cxx',
  'c',
  'h',
  'hpp',
  'hh',
  'hxx',
  'ino',
]);

const BINARY_EXTENSIONS = new Set(['bin', 'dat', 'o', 'out']);

const INVALID_NAME_CHARS = /[\\:*?"<>|\u0000-\u001f]/;

const utf8Encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const utf8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
const utf8FatalDecoder =
  typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { fatal: true }) : null;

export function encodeUtf8(text: string): Uint8Array {
  if (utf8Encoder) {
    return utf8Encoder.encode(text);
  }
  const arr = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    arr[i] = text.charCodeAt(i) & 0xff;
  }
  return arr;
}

export function decodeUtf8(bytes: Uint8Array): string {
  if (utf8Decoder) {
    return utf8Decoder.decode(bytes);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

export function cloneBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a === b) return true;
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function toBytes(input: string | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? cloneBytes(input) : encodeUtf8(input);
}

/**
 * Detects whether a raw byte buffer contains binary content (NUL bytes, non-text
 * control bytes, or invalid UTF-8 sequences).
 */
export function hasBinaryBytes(bytes: Uint8Array): boolean {
  const scanLen = Math.min(bytes.byteLength, 8192);
  for (let i = 0; i < scanLen; i += 1) {
    const b = bytes[i];
    if (b === 0) return true;
    if (b < 0x09 || (b > 0x0d && b < 0x20 && b !== 0x1b)) {
      return true;
    }
  }
  if (utf8FatalDecoder && bytes.byteLength > 0) {
    try {
      utf8FatalDecoder.decode(bytes);
    } catch {
      return true;
    }
  }
  return false;
}

/**
 * Builds structured canonical 16-byte hex dump rows directly from raw Uint8Array bytes
 * (never decoding through UTF-8 so 0x00 and 0x80..0xFF remain exact).
 */
export function buildHexDumpRows(bytes: Uint8Array, maxBytes = bytes.byteLength): HexDumpRow[] {
  const limit = Math.max(0, Math.min(bytes.byteLength, maxBytes));
  const rows: HexDumpRow[] = [];

  for (let offset = 0; offset < limit; offset += 16) {
    const leftBytes: Array<number | null> = [];
    const rightBytes: Array<number | null> = [];
    let ascii = '';

    for (let i = 0; i < 16; i += 1) {
      if (offset + i < limit) {
        const b = bytes[offset + i];
        if (i < 8) leftBytes.push(b);
        else rightBytes.push(b);
        ascii += b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.';
      } else {
        if (i < 8) leftBytes.push(null);
        else rightBytes.push(null);
        ascii += ' ';
      }
    }

    rows.push({
      offset,
      offsetHex: offset.toString(16).padStart(8, '0').toUpperCase(),
      leftBytes,
      rightBytes,
      ascii,
    });
  }

  return rows;
}

/**
 * Formats a canonical plain-text 16-byte hex dump (used for clipboard copy and read-only hex preview).
 */
export function formatCanonicalHexDumpText(
  path: string,
  bytes: Uint8Array,
  maxBytes = bytes.byteLength
): string {
  const header = `Hex-дамп: ${path} (${bytes.byteLength} Б)`;
  if (bytes.byteLength === 0) {
    return `${header}\n(пустой файл — 0 Б)\n`;
  }
  const rows = buildHexDumpRows(bytes, maxBytes);
  const lines = [header];
  for (const row of rows) {
    const left = row.leftBytes
      .map((b) => (b === null ? '  ' : b.toString(16).padStart(2, '0').toUpperCase()))
      .join(' ');
    const right = row.rightBytes
      .map((b) => (b === null ? '  ' : b.toString(16).padStart(2, '0').toUpperCase()))
      .join(' ');
    lines.push(`${row.offsetHex}  ${left}  ${right}  |${row.ascii}|`);
  }
  if (maxBytes < bytes.byteLength) {
    lines.push(`... показаны первые ${maxBytes} из ${bytes.byteLength} Б`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Renders a deterministic hex + ASCII dump for inspecting binary files in the editor
 * without modifying or corrupting their underlying Uint8Array payload.
 */
export function formatHexDump(bytes: Uint8Array, maxBytes = 16384): string {
  if (bytes.byteLength === 0) {
    return '; Пустой бинарный файл (0 Б)\n';
  }
  const shown = Math.min(bytes.byteLength, maxBytes);
  const lines: string[] = [
    `; Бинарный файл (${bytes.byteLength} Б)${shown < bytes.byteLength ? ` — показаны первые ${shown} Б` : ''}`,
    '; Смещение   00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F   ASCII',
  ];

  const rows = buildHexDumpRows(bytes, shown);
  for (const row of rows) {
    const hexLeft = row.leftBytes
      .map((b) => (b === null ? '  ' : b.toString(16).padStart(2, '0').toUpperCase()))
      .join(' ');
    const hexRight = row.rightBytes
      .map((b) => (b === null ? '  ' : b.toString(16).padStart(2, '0').toUpperCase()))
      .join(' ');
    lines.push(`${row.offsetHex}   ${hexLeft}  ${hexRight}   |${row.ascii}|`);
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Normalizes a virtual file or folder path used by the UI, C <cstdio>, or C++ <fstream> calls.
 * Converts "\" to "/", strips leading "./" or "/", collapses repeated slashes,
 * and resolves ".." segments safely inside the virtual workspace root.
 */
export function normalizePath(raw: string): string {
  const trimmed = raw.trim().replace(/\\/g, '/');
  const withoutLeading = trimmed.replace(/^(\.\/|\/)+/, '');
  const parts = withoutLeading
    .split('/')
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p !== '.');

  const safeParts: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      safeParts.pop();
    } else {
      safeParts.push(part);
    }
  }
  return safeParts.join('/');
}

/** Backward-compatible alias for normalizePath. */
export const normalizeVirtualPath = normalizePath;

/**
 * Returns every ancestor folder path in top-down order.
 * Example: "lab7/nested/out.bin" -> ["lab7", "lab7/nested"]
 */
export function getParentFolderPaths(rawPath: string): string[] {
  const norm = normalizePath(rawPath);
  if (!norm || !norm.includes('/')) return [];
  const parts = norm.split('/');
  const parents: string[] = [];
  for (let i = 0; i < parts.length - 1; i += 1) {
    parents.push(parts.slice(0, i + 1).join('/'));
  }
  return parents;
}

export function getBaseName(rawPath: string): string {
  const norm = normalizePath(rawPath);
  const idx = norm.lastIndexOf('/');
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}

export function getDirName(rawPath: string): string {
  const norm = normalizePath(rawPath);
  const idx = norm.lastIndexOf('/');
  return idx >= 0 ? norm.slice(0, idx) : '';
}

export function isPathInsideFolder(rawPath: string, rawFolderPath: string): boolean {
  const normPath = normalizePath(rawPath);
  const normFolder = normalizePath(rawFolderPath);
  if (!normPath || !normFolder) return false;
  return normPath === normFolder || normPath.startsWith(`${normFolder}/`);
}

export function isDirectoryPath(
  rawPath: string,
  filePaths: Iterable<string>,
  folderPaths: Iterable<string>
): boolean {
  const norm = normalizePath(rawPath);
  if (!norm) return false;
  for (const fp of folderPaths) {
    const normFolder = normalizePath(fp);
    if (normFolder === norm || normFolder.startsWith(`${norm}/`)) {
      return true;
    }
  }
  const prefix = `${norm}/`;
  for (const f of filePaths) {
    if (normalizePath(f).startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

export function validateFileName(
  rawName: string,
  existingNames: Iterable<string>,
  ignoreName?: string,
  existingFolders: Iterable<string> = []
): { ok: true; normalized: string } | { ok: false; error: string } {
  const normalized = normalizePath(rawName);
  if (!normalized) {
    return { ok: false, error: 'Введите имя файла (например, input.txt или lab7/data.txt).' };
  }
  if (normalized.length > 160) {
    return { ok: false, error: 'Путь к файлу слишком длинный (максимум 160 символов).' };
  }
  if (INVALID_NAME_CHARS.test(normalized) || rawName.includes('..')) {
    return { ok: false, error: 'Имя файла содержит недопустимые символы.' };
  }
  if (rawName.trim().endsWith('/') || normalized.endsWith('/')) {
    return { ok: false, error: 'Укажите имя файла, а не папки.' };
  }

  const normalizedIgnore = ignoreName ? normalizePath(ignoreName) : undefined;
  const existingFileList: string[] = [];
  for (const existing of existingNames) {
    const normExisting = normalizePath(existing);
    existingFileList.push(normExisting);
    if (normExisting === normalized && normExisting !== normalizedIgnore) {
      return { ok: false, error: `Файл «${normalized}» уже существует.` };
    }
  }

  if (isDirectoryPath(normalized, existingFileList, existingFolders)) {
    return { ok: false, error: `Папка «${normalized}» уже существует.` };
  }

  // Ensure no ancestor segment collides with an existing file
  for (const parent of getParentFolderPaths(normalized)) {
    if (existingFileList.includes(parent) && parent !== normalizedIgnore) {
      return { ok: false, error: `Путь «${parent}» уже занят файлом.` };
    }
  }

  return { ok: true, normalized };
}

export function validateFolderName(
  rawName: string,
  existingFolders: Iterable<string>,
  existingFiles: Iterable<string>,
  ignoreFolder?: string
): { ok: true; normalized: string } | { ok: false; error: string } {
  const normalized = normalizePath(rawName);
  if (!normalized) {
    return { ok: false, error: 'Введите имя папки (например, lab7).' };
  }
  if (normalized.length > 140) {
    return { ok: false, error: 'Имя папки слишком длинное (максимум 140 символов).' };
  }
  if (INVALID_NAME_CHARS.test(normalized) || rawName.includes('..')) {
    return { ok: false, error: 'Имя папки содержит недопустимые символы.' };
  }

  const normIgnore = ignoreFolder ? normalizePath(ignoreFolder) : undefined;
  if (normIgnore && normalized.startsWith(`${normIgnore}/`)) {
    return { ok: false, error: 'Нельзя переместить папку внутрь самой себя.' };
  }

  const fileSet = new Set<string>();
  for (const f of existingFiles) {
    fileSet.add(normalizePath(f));
  }
  if (fileSet.has(normalized)) {
    return { ok: false, error: `Файл «${normalized}» уже существует.` };
  }
  for (const parent of getParentFolderPaths(normalized)) {
    if (fileSet.has(parent)) {
      return { ok: false, error: `Путь «${parent}» уже занят файлом.` };
    }
  }

  const folderSet = new Set<string>();
  for (const folder of existingFolders) {
    const nf = normalizePath(folder);
    if (nf) folderSet.add(nf);
  }
  for (const f of fileSet) {
    for (const parent of getParentFolderPaths(f)) {
      folderSet.add(parent);
    }
  }

  if (folderSet.has(normalized) && normalized !== normIgnore) {
    return { ok: false, error: `Папка «${normalized}» уже существует.` };
  }

  return { ok: true, normalized };
}

export function getFileExtension(name: string): string {
  const base = name.split('/').pop() ?? name;
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

export function isCppSyntaxFile(name: string): boolean {
  const ext = getFileExtension(name);
  return CPP_SYNTAX_EXTENSIONS.has(ext);
}

export function isBinaryFileName(name: string): boolean {
  const ext = getFileExtension(name);
  return BINARY_EXTENSIONS.has(ext);
}

export function detectLanguageFromFileName(name: string): Language | null {
  const ext = getFileExtension(name);
  if (ext === 'c') return 'c';
  if (ext === 'cpp' || ext === 'cc' || ext === 'cxx') return 'cpp';
  return null;
}

export function isEntrySourceFile(name: string): boolean {
  const norm = normalizePath(name);
  return norm === 'main.cpp' || norm === 'main.c';
}

export const DEV_CPP_C_TEMPLATE =
  '#include <stdio.h>\n\nint main(int argc, char** argv) {\n\t\n\treturn 0;\n}\n';

export const DEV_CPP_CPP_TEMPLATE =
  '#include <iostream>\n\nusing namespace std;\n\nint main(int argc, char** argv) {\n\t\n\treturn 0;\n}\n';

/**
 * Returns Dev-C++ style starter code when creating new .c or .cpp/.cc/.cxx files,
 * leaving all other file extensions (.txt, .h, .bin, .dat, etc.) completely empty.
 */
export function getNewFileInitialContent(fileName: string): string {
  const ext = getFileExtension(fileName);
  if (ext === 'c') return DEV_CPP_C_TEMPLATE;
  if (ext === 'cpp' || ext === 'cc' || ext === 'cxx') return DEV_CPP_CPP_TEMPLATE;
  return '';
}

export function computeByteSize(content: string | Uint8Array): number {
  if (content instanceof Uint8Array) return content.byteLength;
  return encodeUtf8(content).byteLength;
}

export function createVirtualFile(
  name: string,
  input: string | Uint8Array,
  updatedAt = Date.now()
): VirtualFile {
  const normalized = normalizePath(name);
  if (input instanceof Uint8Array) {
    const bytes = cloneBytes(input);
    const binary = isBinaryFileName(normalized) || hasBinaryBytes(bytes);
    return {
      name: normalized,
      bytes,
      content: binary ? formatHexDump(bytes) : decodeUtf8(bytes),
      updatedAt,
      size: bytes.byteLength,
      isBinary: binary,
    };
  }

  const bytes = encodeUtf8(input);
  const binary = isBinaryFileName(normalized) || input.includes('\0');
  return {
    name: normalized,
    bytes,
    content: input,
    updatedAt,
    size: bytes.byteLength,
    isBinary: binary,
  };
}

export function createVirtualFolder(rawPath: string, updatedAt = Date.now()): VirtualFolder {
  return {
    path: normalizePath(rawPath),
    updatedAt,
  };
}

function valuesEqual(a: string | Uint8Array | undefined, b: string | Uint8Array): boolean {
  if (a === undefined) return false;
  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    return bytesEqual(a, b);
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return a === b;
  }
  return bytesEqual(toBytes(a), toBytes(b));
}

export function computeVfsDelta(
  before: ReadonlyMap<string, string | Uint8Array>,
  after: ReadonlyMap<string, string | Uint8Array>
): VfsSyncDelta {
  const created: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  for (const [path, nextVal] of after.entries()) {
    if (!before.has(path)) {
      created.push(path);
    } else if (!valuesEqual(before.get(path), nextVal)) {
      modified.push(path);
    }
  }

  for (const path of before.keys()) {
    if (!after.has(path)) {
      deleted.push(path);
    }
  }

  created.sort();
  modified.sort();
  deleted.sort();

  return { created, modified, deleted };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
}

export function sortVirtualFiles(files: VirtualFile[], primaryEntry: string): VirtualFile[] {
  const secondaryEntry = primaryEntry === 'main.cpp' ? 'main.c' : 'main.cpp';
  return [...files].sort((a, b) => {
    if (a.name === primaryEntry) return -1;
    if (b.name === primaryEntry) return 1;
    if (a.name === secondaryEntry) return -1;
    if (b.name === secondaryEntry) return 1;
    return a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' });
  });
}

/**
 * Builds a deterministic hierarchical workspace tree merging explicit empty folders
 * and implicit parent folders derived from nested file paths.
 */
export function buildWorkspaceTree(
  files: VirtualFile[],
  folders: VirtualFolder[],
  primaryEntry: string
): WorkspaceTreeNode[] {
  const secondaryEntry = primaryEntry === 'main.cpp' ? 'main.c' : 'main.cpp';

  interface InternalDir {
    path: string;
    name: string;
    subDirs: Map<string, InternalDir>;
    files: VirtualFile[];
  }

  const root: InternalDir = {
    path: '',
    name: '',
    subDirs: new Map(),
    files: [],
  };

  const ensureDir = (rawFolderPath: string): InternalDir => {
    const norm = normalizePath(rawFolderPath);
    if (!norm) return root;
    const parts = norm.split('/');
    let cur = root;
    let accum = '';
    for (const part of parts) {
      accum = accum ? `${accum}/${part}` : part;
      let next = cur.subDirs.get(part);
      if (!next) {
        next = { path: accum, name: part, subDirs: new Map(), files: [] };
        cur.subDirs.set(part, next);
      }
      cur = next;
    }
    return cur;
  };

  for (const folder of folders) {
    if (folder.path) {
      ensureDir(folder.path);
    }
  }

  for (const file of files) {
    const dirPath = getDirName(file.name);
    const targetDir = dirPath ? ensureDir(dirPath) : root;
    targetDir.files.push(file);
  }

  const toNodes = (dir: InternalDir, depth: number): { nodes: WorkspaceTreeNode[]; fileCount: number } => {
    const folderNodes: WorkspaceTreeFolderNode[] = [];
    let totalFiles = dir.files.length;

    const sortedSubDirs = Array.from(dir.subDirs.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' })
    );

    for (const sub of sortedSubDirs) {
      const subRes = toNodes(sub, depth + 1);
      totalFiles += subRes.fileCount;
      folderNodes.push({
        kind: 'folder',
        path: sub.path,
        name: sub.name,
        depth,
        children: subRes.nodes,
        fileCount: subRes.fileCount,
      });
    }

    const sortedFiles = [...dir.files].sort((a, b) => {
      if (depth === 0) {
        if (a.name === primaryEntry) return -1;
        if (b.name === primaryEntry) return 1;
        if (a.name === secondaryEntry) return -1;
        if (b.name === secondaryEntry) return 1;
      }
      return getBaseName(a.name).localeCompare(getBaseName(b.name), 'ru', { sensitivity: 'base' });
    });

    const fileNodes: WorkspaceTreeFileNode[] = sortedFiles.map((file) => ({
      kind: 'file',
      path: file.name,
      name: getBaseName(file.name),
      depth,
      file,
    }));

    if (depth === 0) {
      // Pin main.cpp & main.c at very top, then folders, then remaining root files
      const pinnedEntries = fileNodes.filter(
        (n) => n.path === primaryEntry || n.path === secondaryEntry
      );
      const otherRootFiles = fileNodes.filter(
        (n) => n.path !== primaryEntry && n.path !== secondaryEntry
      );
      return {
        nodes: [...pinnedEntries, ...folderNodes, ...otherRootFiles],
        fileCount: totalFiles,
      };
    }

    return {
      nodes: [...folderNodes, ...fileNodes],
      fileCount: totalFiles,
    };
  };

  return toNodes(root, 0).nodes;
}

/**
 * Pure helper that renames a folder and updates every descendant folder and file path atomically.
 */
export function renameFolderPaths(
  filesMap: Record<string, VirtualFile>,
  foldersMap: Record<string, VirtualFolder>,
  oldFolderRaw: string,
  newFolderRaw: string,
  now = Date.now()
): {
  nextFilesMap: Record<string, VirtualFile>;
  nextFoldersMap: Record<string, VirtualFolder>;
  fileUpserts: VirtualFile[];
  fileDeletes: string[];
  folderUpserts: VirtualFolder[];
  folderDeletes: string[];
  pathRemap: Map<string, string>;
} {
  const oldFolder = normalizePath(oldFolderRaw);
  const newFolder = normalizePath(newFolderRaw);
  const prefix = `${oldFolder}/`;

  const nextFilesMap: Record<string, VirtualFile> = {};
  const nextFoldersMap: Record<string, VirtualFolder> = {};
  const fileUpserts: VirtualFile[] = [];
  const fileDeletes: string[] = [];
  const folderUpserts: VirtualFolder[] = [];
  const folderDeletes: string[] = [];
  const pathRemap = new Map<string, string>();

  // Update files
  for (const [path, file] of Object.entries(filesMap)) {
    if (path.startsWith(prefix)) {
      const nextPath = `${newFolder}/${path.slice(prefix.length)}`;
      const moved = createVirtualFile(nextPath, file.bytes, now);
      nextFilesMap[nextPath] = moved;
      fileDeletes.push(path);
      fileUpserts.push(moved);
      pathRemap.set(path, nextPath);
    } else {
      nextFilesMap[path] = file;
    }
  }

  // Update explicit folders
  for (const [path, folder] of Object.entries(foldersMap)) {
    if (path === oldFolder) {
      folderDeletes.push(path);
      const renamed = createVirtualFolder(newFolder, now);
      nextFoldersMap[newFolder] = renamed;
      folderUpserts.push(renamed);
    } else if (path.startsWith(prefix)) {
      const nextPath = `${newFolder}/${path.slice(prefix.length)}`;
      folderDeletes.push(path);
      const renamed = createVirtualFolder(nextPath, now);
      nextFoldersMap[nextPath] = renamed;
      folderUpserts.push(renamed);
    } else {
      nextFoldersMap[path] = folder;
    }
  }

  // Ensure new folder and all its ancestors exist explicitly
  for (const ancestor of [...getParentFolderPaths(newFolder), newFolder]) {
    if (ancestor && !nextFoldersMap[ancestor]) {
      const created = createVirtualFolder(ancestor, now);
      nextFoldersMap[ancestor] = created;
      folderUpserts.push(created);
    }
  }

  return {
    nextFilesMap,
    nextFoldersMap,
    fileUpserts,
    fileDeletes,
    folderUpserts,
    folderDeletes,
    pathRemap,
  };
}

/**
 * Pure helper that deletes a folder and all nested files and subfolders.
 */
export function deleteFolderPaths(
  filesMap: Record<string, VirtualFile>,
  foldersMap: Record<string, VirtualFolder>,
  folderRaw: string,
  protectedEntryFile?: string
): {
  nextFilesMap: Record<string, VirtualFile>;
  nextFoldersMap: Record<string, VirtualFolder>;
  fileDeletes: string[];
  folderDeletes: string[];
} {
  const folderPath = normalizePath(folderRaw);
  const prefix = `${folderPath}/`;

  const nextFilesMap: Record<string, VirtualFile> = {};
  const nextFoldersMap: Record<string, VirtualFolder> = {};
  const fileDeletes: string[] = [];
  const folderDeletes: string[] = [];

  for (const [path, file] of Object.entries(filesMap)) {
    if (path.startsWith(prefix) && path !== protectedEntryFile) {
      fileDeletes.push(path);
    } else {
      nextFilesMap[path] = file;
    }
  }

  for (const [path, folder] of Object.entries(foldersMap)) {
    if (path === folderPath || path.startsWith(prefix)) {
      folderDeletes.push(path);
    } else {
      nextFoldersMap[path] = folder;
    }
  }

  return { nextFilesMap, nextFoldersMap, fileDeletes, folderDeletes };
}

export function buildUniqueImportName(rawName: string, existingNames: Set<string>): string {
  const normalized = normalizePath(rawName) || 'imported.txt';
  if (!existingNames.has(normalized)) return normalized;

  const dot = normalized.lastIndexOf('.');
  const stem = dot > 0 ? normalized.slice(0, dot) : normalized;
  const ext = dot > 0 ? normalized.slice(dot) : '';

  let idx = 1;
  while (existingNames.has(`${stem}_${idx}${ext}`)) {
    idx += 1;
  }
  return `${stem}_${idx}${ext}`;
}
