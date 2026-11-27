import type { Language } from '../types/compiler';
import type { VfsSyncDelta, VirtualFile } from './types';

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

  for (let offset = 0; offset < shown; offset += 16) {
    const addr = offset.toString(16).padStart(8, '0').toUpperCase();
    let hexLeft = '';
    let hexRight = '';
    let ascii = '';

    for (let i = 0; i < 16; i += 1) {
      if (offset + i < shown) {
        const b = bytes[offset + i];
        const hex = b.toString(16).padStart(2, '0').toUpperCase();
        if (i < 8) hexLeft += `${hex} `;
        else hexRight += `${hex} `;
        ascii += b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.';
      } else {
        if (i < 8) hexLeft += '   ';
        else hexRight += '   ';
        ascii += ' ';
      }
    }

    lines.push(`${addr}   ${hexLeft} ${hexRight}  |${ascii}|`);
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Normalizes a virtual file path used by the UI, C <cstdio>, or C++ <fstream> calls.
 * Strips leading "./" or "/", collapses repeated slashes, and blocks ".." traversal.
 */
export function normalizeVirtualPath(raw: string): string {
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

export function validateFileName(
  rawName: string,
  existingNames: Iterable<string>,
  ignoreName?: string
): { ok: true; normalized: string } | { ok: false; error: string } {
  const normalized = normalizeVirtualPath(rawName);
  if (!normalized) {
    return { ok: false, error: 'Введите имя файла (например, input.txt).' };
  }
  if (normalized.length > 120) {
    return { ok: false, error: 'Имя файла слишком длинное (максимум 120 символов).' };
  }
  if (INVALID_NAME_CHARS.test(normalized) || rawName.includes('..')) {
    return { ok: false, error: 'Имя файла содержит недопустимые символы.' };
  }
  if (normalized.endsWith('/')) {
    return { ok: false, error: 'Укажите имя файла, а не папки.' };
  }

  const normalizedIgnore = ignoreName ? normalizeVirtualPath(ignoreName) : undefined;
  for (const existing of existingNames) {
    const normExisting = normalizeVirtualPath(existing);
    if (normExisting === normalized && normExisting !== normalizedIgnore) {
      return { ok: false, error: `Файл «${normalized}» уже существует.` };
    }
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
  const norm = normalizeVirtualPath(name);
  return norm === 'main.cpp' || norm === 'main.c';
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
  const normalized = normalizeVirtualPath(name);
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

export function buildUniqueImportName(rawName: string, existingNames: Set<string>): string {
  const normalized = normalizeVirtualPath(rawName) || 'imported.txt';
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
