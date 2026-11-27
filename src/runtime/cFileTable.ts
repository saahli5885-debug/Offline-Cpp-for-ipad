import { decodeUtf8, encodeUtf8 } from '../vfs/vfsHelpers';

export const C_SEEK_SET = 0;
export const C_SEEK_CUR = 1;
export const C_SEEK_END = 2;

export interface ParsedFopenMode {
  canRead: boolean;
  canWrite: boolean;
  appendMode: boolean;
  truncate: boolean;
  createIfMissing: boolean;
  isBinary: boolean;
}

export interface CFileHandle {
  id: number;
  path: string;
  mode: string;
  canRead: boolean;
  canWrite: boolean;
  appendMode: boolean;
  isBinary: boolean;
  buf: Uint8Array;
  length: number;
  pos: number;
  eofFlag: boolean;
  errorFlag: boolean;
  dirty: boolean;
  closed: boolean;
}

/**
 * Parses standard C stdio fopen() mode strings:
 * "r", "rb", "w", "wb", "a", "ab", "r+", "rb+", "r+b", "w+", "wb+", "w+b", "a+", "ab+", "a+b"
 */
export function parseFopenMode(rawMode: string): ParsedFopenMode | null {
  const mode = rawMode.trim();
  if (!mode) return null;

  const base = mode[0];
  if (base !== 'r' && base !== 'w' && base !== 'a') return null;

  const rest = mode.slice(1);
  let hasPlus = false;
  let hasBinary = false;
  for (const ch of rest) {
    if (ch === '+' && !hasPlus) {
      hasPlus = true;
    } else if (ch === 'b' && !hasBinary) {
      hasBinary = true;
    } else {
      return null;
    }
  }

  if (base === 'r') {
    return {
      canRead: true,
      canWrite: hasPlus,
      appendMode: false,
      truncate: false,
      createIfMissing: false,
      isBinary: hasBinary,
    };
  }
  if (base === 'w') {
    return {
      canRead: hasPlus,
      canWrite: true,
      appendMode: false,
      truncate: true,
      createIfMissing: true,
      isBinary: hasBinary,
    };
  }
  // 'a'
  return {
    canRead: hasPlus,
    canWrite: true,
    appendMode: true,
    truncate: false,
    createIfMissing: true,
    isBinary: hasBinary,
  };
}

export function createCFileHandle(
  id: number,
  path: string,
  mode: string,
  parsed: ParsedFopenMode,
  initialBytes?: Uint8Array
): CFileHandle {
  const srcLen = parsed.truncate ? 0 : (initialBytes?.byteLength ?? 0);
  const cap = Math.max(64, srcLen);
  const buf = new Uint8Array(cap);
  if (!parsed.truncate && initialBytes && srcLen > 0) {
    buf.set(initialBytes, 0);
  }
  return {
    id,
    path,
    mode,
    canRead: parsed.canRead,
    canWrite: parsed.canWrite,
    appendMode: parsed.appendMode,
    isBinary: parsed.isBinary,
    buf,
    length: srcLen,
    pos: parsed.appendMode && !parsed.canRead ? srcLen : 0,
    eofFlag: false,
    errorFlag: false,
    dirty: false,
    closed: false,
  };
}

export function getCFileBytes(handle: CFileHandle): Uint8Array {
  return handle.buf.slice(0, handle.length);
}

function ensureCapacity(handle: CFileHandle, needed: number): void {
  if (needed <= handle.buf.byteLength) return;
  let nextCap = Math.max(64, handle.buf.byteLength);
  while (nextCap < needed) {
    nextCap *= 2;
  }
  const nextBuf = new Uint8Array(nextCap);
  nextBuf.set(handle.buf.subarray(0, handle.length), 0);
  handle.buf = nextBuf;
}

export function writeCFileBytes(handle: CFileHandle, data: Uint8Array): number {
  if (!handle.canWrite || handle.closed) {
    handle.errorFlag = true;
    return 0;
  }
  if (data.byteLength === 0) return 0;

  const targetPos = handle.appendMode ? handle.length : handle.pos;
  const endPos = targetPos + data.byteLength;
  ensureCapacity(handle, endPos);
  // Zero-fill any seek gap past previous EOF
  if (targetPos > handle.length) {
    handle.buf.fill(0, handle.length, targetPos);
  }
  handle.buf.set(data, targetPos);
  handle.pos = endPos;
  if (endPos > handle.length) {
    handle.length = endPos;
  }
  handle.dirty = true;
  return data.byteLength;
}

export function readCFileBytes(handle: CFileHandle, requestedBytes: number): Uint8Array {
  if (!handle.canRead || handle.closed) {
    handle.errorFlag = true;
    return new Uint8Array(0);
  }
  const req = Math.max(0, Math.trunc(requestedBytes));
  if (req === 0) return new Uint8Array(0);

  const avail = Math.max(0, handle.length - handle.pos);
  const actual = Math.min(avail, req);
  const out = handle.buf.slice(handle.pos, handle.pos + actual);
  handle.pos += actual;
  if (actual < req) {
    handle.eofFlag = true;
  }
  return out;
}

export function readCFileByte(handle: CFileHandle): number {
  if (!handle.canRead || handle.closed) {
    handle.errorFlag = true;
    return -1;
  }
  if (handle.pos >= handle.length) {
    handle.eofFlag = true;
    return -1;
  }
  const b = handle.buf[handle.pos];
  handle.pos += 1;
  return b;
}

export function writeCFileByte(handle: CFileHandle, chCode: number): number {
  const byte = Math.trunc(chCode) & 0xff;
  const written = writeCFileBytes(handle, new Uint8Array([byte]));
  return written === 1 ? byte : -1;
}

export function seekCFile(handle: CFileHandle, offset: number, origin: number): number {
  if (handle.closed) return -1;
  const off = Math.trunc(offset);
  let target: number;
  if (origin === C_SEEK_SET) {
    target = off;
  } else if (origin === C_SEEK_CUR) {
    target = handle.pos + off;
  } else if (origin === C_SEEK_END) {
    target = handle.length + off;
  } else {
    return -1;
  }
  if (target < 0) return -1;
  handle.pos = target;
  handle.eofFlag = false;
  return 0;
}

export function rewindCFile(handle: CFileHandle): void {
  if (handle.closed) return;
  handle.pos = 0;
  handle.eofFlag = false;
  handle.errorFlag = false;
}

export function clearCFileErr(handle: CFileHandle): void {
  handle.eofFlag = false;
  handle.errorFlag = false;
}

export function ungetcCFile(handle: CFileHandle, chCode: number): number {
  if (handle.closed || !handle.canRead || chCode === -1) return -1;
  const byte = Math.trunc(chCode) & 0xff;
  if (handle.pos > 0) {
    handle.pos -= 1;
    handle.buf[handle.pos] = byte;
  }
  handle.eofFlag = false;
  return byte;
}

/**
 * Reads up to `maxCount - 1` characters (stopping after '\n' or EOF) from a CFileHandle,
 * advancing `handle.pos` by the exact UTF-8 byte length consumed.
 */
export function readCFileFgets(handle: CFileHandle, maxCount: number): string | null {
  if (!handle.canRead || handle.closed) {
    handle.errorFlag = true;
    return null;
  }
  if (maxCount <= 1) return '';
  if (handle.pos >= handle.length) {
    handle.eofFlag = true;
    return null;
  }

  // Decode remaining slice as UTF-8 so Cyrillic/Unicode text lines work cleanly
  const remainingBytes = handle.buf.subarray(handle.pos, handle.length);
  const remainingText = decodeUtf8(remainingBytes);
  if (remainingText.length === 0) {
    handle.eofFlag = true;
    return null;
  }

  let limit = Math.min(maxCount - 1, remainingText.length);
  const nlIdx = remainingText.indexOf('\n');
  if (nlIdx !== -1 && nlIdx + 1 < limit) {
    limit = nlIdx + 1;
  } else if (nlIdx !== -1 && nlIdx + 1 === limit) {
    limit = nlIdx + 1;
  }

  const chunk = remainingText.slice(0, limit);
  const consumedBytes = encodeUtf8(chunk).byteLength;
  handle.pos = Math.min(handle.length, handle.pos + consumedBytes);
  return chunk;
}
