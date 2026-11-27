import { hasBinaryBytes, isBinaryFileName } from './vfsHelpers';

export interface ZipEntryInput {
  name: string;
  content: string | Uint8Array;
  updatedAt?: number;
}

// Precomputed IEEE 802.3 CRC-32 lookup table (100% local, zero dependencies)
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeEntryContent(entry: ZipEntryInput): Uint8Array {
  if (entry.content instanceof Uint8Array) {
    return entry.content;
  }
  if (isBinaryFileName(entry.name) || entry.content.includes('\0')) {
    const raw = new Uint8Array(entry.content.length);
    for (let i = 0; i < entry.content.length; i += 1) {
      raw[i] = entry.content.charCodeAt(i) & 0xff;
    }
    return raw;
  }
  return new TextEncoder().encode(entry.content);
}

function toDosTimeAndDate(timestampMs: number): { dosTime: number; dosDate: number } {
  const d = new Date(timestampMs);
  const year = Math.max(1980, Math.min(2107, d.getFullYear()));
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const seconds = Math.floor(d.getSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

/**
 * Builds a valid RFC-compliant PKZIP archive (STORE method, CRC-32, UTF-8 names)
 * entirely offline in JS with zero external libraries.
 */
export function createZipArchive(entries: ZipEntryInput[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const isDir = entry.name.endsWith('/');
    const nameBytes = encoder.encode(entry.name);
    const dataBytes = isDir ? new Uint8Array(0) : encodeEntryContent(entry);
    const crc = computeCrc32(dataBytes);
    const { dosTime, dosDate } = toDosTimeAndDate(entry.updatedAt ?? Date.now());
    const utf8Flag = 0x0800;

    // Local File Header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true); // Version needed to extract (2.0)
    lv.setUint16(6, utf8Flag, true); // General purpose bit flag (UTF-8)
    lv.setUint16(8, 0, true); // Compression method: 0 = STORE
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dataBytes.length, true); // Compressed size
    lv.setUint32(22, dataBytes.length, true); // Uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // Extra field length
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    // Central Directory Header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central directory signature
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed
    cv.setUint16(8, utf8Flag, true); // UTF-8 flag
    cv.setUint16(10, 0, true); // Method: STORE
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // Extra field length
    cv.setUint16(32, 0, true); // File comment length
    cv.setUint16(34, 0, true); // Disk number start
    cv.setUint16(36, 0, true); // Internal file attributes
    cv.setUint32(38, isDir ? 0x10 : 0, true); // External file attributes (0x10 = DOS directory)
    cv.setUint32(42, offset, true); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  let centralDirSize = 0;
  for (const part of centralParts) {
    centralDirSize += part.length;
  }

  // End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // EOCD signature
  ev.setUint16(4, 0, true); // Number of this disk
  ev.setUint16(6, 0, true); // Disk where central directory starts
  ev.setUint16(8, entries.length, true); // Entries on this disk
  ev.setUint16(10, entries.length, true); // Total entries
  ev.setUint32(12, centralDirSize, true); // Size of central directory
  ev.setUint32(16, offset, true); // Offset of start of central directory
  ev.setUint16(20, 0, true); // Comment length

  const totalLength = offset + centralDirSize + eocd.length;
  const archive = new Uint8Array(totalLength);
  let cursor = 0;
  for (const part of localParts) {
    archive.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    archive.set(part, cursor);
    cursor += part.length;
  }
  archive.set(eocd, cursor);
  return archive;
}

function isAppleTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouch = navigator.maxTouchPoints ?? 0;
  return /iPad|iPhone|iPod/i.test(ua) || (platform === 'MacIntel' && maxTouch > 1);
}

function triggerAnchorDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Delay revoke slightly for iPadOS Safari download handoff
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1500);
}

/**
 * Safari & iPadOS "Save to Files" compatible export helper.
 * Uses native Web Share Sheet (with Files destination) on iPadOS/iOS when supported,
 * and falls back cleanly to Blob + <a download> everywhere else.
 * Never uses window.showDirectoryPicker.
 */
export async function exportBlobToFiles(
  blob: Blob,
  fileName: string
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (
    isAppleTouchDevice() &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof File !== 'undefined'
  ) {
    try {
      const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
      const canShare =
        typeof navigator.canShare === 'function' ? navigator.canShare({ files: [file] }) : false;
      if (canShare) {
        await navigator.share({ files: [file], title: fileName });
        return 'shared';
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return 'cancelled';
      }
      // Fall back to standard Blob anchor download if share sheet fails
    }
  }

  triggerAnchorDownload(blob, fileName);
  return 'downloaded';
}

export async function exportSingleFileToDevice(
  name: string,
  contentOrBytes: string | Uint8Array
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  let blob: Blob;
  if (contentOrBytes instanceof Uint8Array) {
    const copy = new Uint8Array(contentOrBytes.byteLength);
    copy.set(contentOrBytes);
    const mime =
      isBinaryFileName(name) || hasBinaryBytes(contentOrBytes)
        ? 'application/octet-stream'
        : 'text/plain;charset=utf-8';
    blob = new Blob([copy.buffer], { type: mime });
  } else {
    const isBin = isBinaryFileName(name) || contentOrBytes.includes('\0');
    if (isBin) {
      const bytes = new Uint8Array(contentOrBytes.length);
      for (let i = 0; i < contentOrBytes.length; i += 1) {
        bytes[i] = contentOrBytes.charCodeAt(i) & 0xff;
      }
      blob = new Blob([bytes.buffer], { type: 'application/octet-stream' });
    } else {
      blob = new Blob([contentOrBytes], { type: 'text/plain;charset=utf-8' });
    }
  }
  const downloadName = name.split('/').pop() || name;
  return exportBlobToFiles(blob, downloadName);
}

export async function exportWorkspaceZipToDevice(
  entries: ZipEntryInput[],
  zipName = 'cpp-workspace.zip'
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const bytes = createZipArchive(entries);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: 'application/zip' });
  return exportBlobToFiles(blob, zipName);
}
