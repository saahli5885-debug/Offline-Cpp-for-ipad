import type { Expr, StructDecl, TypeSpec } from './parser';

export interface BinaryCharVal {
  __kind: 'char';
  ch: string;
  code: number;
}

export interface BinaryPointerVal {
  __kind: 'ptr';
  blockId: number;
  offset: number;
  elemSize: number;
  baseAddr: number;
}

export interface BinaryStructVal {
  __kind: 'struct';
  structName: string;
  fields: Map<string, BinaryCell>;
}

export interface BinaryCell {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  type: TypeSpec;
  arrayLength?: number;
  arrayElemType?: TypeSpec;
}

export interface BinaryMemoryBlock {
  id: number;
  cells: BinaryCell[];
  elemSize: number;
  baseAddr: number;
  freed: boolean;
}

export interface BinaryCodecContext {
  structs: ReadonlyMap<string, StructDecl>;
  blocks: ReadonlyMap<number, BinaryMemoryBlock>;
  enumConsts?: ReadonlyMap<string, number>;
}

function isBinaryChar(v: unknown): v is BinaryCharVal {
  return typeof v === 'object' && v !== null && '__kind' in v && (v as BinaryCharVal).__kind === 'char';
}

function isBinaryPtr(v: unknown): v is BinaryPointerVal {
  return typeof v === 'object' && v !== null && '__kind' in v && (v as BinaryPointerVal).__kind === 'ptr';
}

function isBinaryStruct(v: unknown): v is BinaryStructVal {
  return typeof v === 'object' && v !== null && '__kind' in v && (v as BinaryStructVal).__kind === 'struct';
}

function makeBinaryChar(code: number): BinaryCharVal {
  const byte = code & 0xff;
  return { __kind: 'char', ch: String.fromCharCode(byte), code: byte };
}

function toNumericVal(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isBinaryChar(v)) return v.code;
  if (isBinaryPtr(v)) return v.blockId === 0 ? 0 : v.baseAddr + v.offset * v.elemSize;
  if (typeof v === 'string') return v.length > 0 ? v.charCodeAt(0) : 0;
  return 0;
}

/**
 * Evaluates a constant integer array dimension expression in a struct field declaration
 * (e.g., `char name[16]`, `int grid[2 * 4]`, or enum constant).
 */
export function evalConstArrayLength(
  expr: Expr,
  enumConsts?: ReadonlyMap<string, number>
): number {
  if (expr.kind === 'number') {
    return Math.max(0, Math.trunc(expr.value));
  }
  if (expr.kind === 'ident' && enumConsts?.has(expr.name)) {
    return Math.max(0, Math.trunc(enumConsts.get(expr.name)!));
  }
  if (expr.kind === 'unary') {
    const inner = evalConstArrayLength(expr.arg, enumConsts);
    if (expr.op === '+') return inner;
    if (expr.op === '-') return -inner;
  }
  if (expr.kind === 'binary') {
    const l = evalConstArrayLength(expr.left, enumConsts);
    const r = evalConstArrayLength(expr.right, enumConsts);
    if (expr.op === '+') return l + r;
    if (expr.op === '-') return l - r;
    if (expr.op === '*') return l * r;
    if (expr.op === '/' && r !== 0) return Math.trunc(l / r);
  }
  return 1;
}

/**
 * Computes the exact serialized byte size of a primitive, pointer, or struct type.
 * For structs, returns the exact sum of the serialized byte sizes of its declared fields
 * in declaration order (including fixed-size array fields and nested structs).
 */
export function computeTypeByteSize(
  t: TypeSpec,
  structs?: ReadonlyMap<string, StructDecl>,
  enumConsts?: ReadonlyMap<string, number>,
  visiting?: Set<string>
): number {
  if (t.pointerDepth > 0) return 8;
  switch (t.base) {
    case 'char':
    case 'bool':
    case 'int8_t':
    case 'uint8_t':
      return 1;
    case 'short':
    case 'int16_t':
    case 'uint16_t':
      return 2;
    case 'int':
    case 'float':
    case 'int32_t':
    case 'uint32_t':
      return 4;
    case 'double':
    case 'long':
    case 'long long':
    case 'size_t':
    case 'ssize_t':
    case 'ptrdiff_t':
    case 'streamsize':
    case 'int64_t':
    case 'uint64_t':
      return 8;
    default: {
      if (structs && structs.has(t.base)) {
        const seen = visiting ?? new Set<string>();
        if (seen.has(t.base)) return 8;
        seen.add(t.base);
        const decl = structs.get(t.base)!;
        let total = 0;
        for (const field of decl.fields) {
          const elemSize = computeTypeByteSize(field.type, structs, enumConsts, seen);
          if (field.arraySizes && field.arraySizes.length > 0) {
            let count = 1;
            for (const dim of field.arraySizes) {
              count *= Math.max(1, evalConstArrayLength(dim, enumConsts));
            }
            total += elemSize * count;
          } else {
            total += elemSize;
          }
        }
        seen.delete(t.base);
        return Math.max(1, total);
      }
      return 8;
    }
  }
}

export function computeCellByteSize(
  cell: BinaryCell,
  structs?: ReadonlyMap<string, StructDecl>,
  enumConsts?: ReadonlyMap<string, number>
): number {
  if (cell.arrayLength !== undefined && cell.arrayElemType !== undefined) {
    return cell.arrayLength * computeTypeByteSize(cell.arrayElemType, structs, enumConsts);
  }
  return computeTypeByteSize(cell.type, structs, enumConsts);
}

function writePrimitiveToView(
  view: DataView,
  byteOffset: number,
  type: TypeSpec,
  val: unknown
): number {
  if (type.pointerDepth > 0) {
    const addr = BigInt(Math.max(0, Math.trunc(toNumericVal(val))));
    view.setBigUint64(byteOffset, addr, true);
    return 8;
  }

  switch (type.base) {
    case 'bool': {
      const truthy = typeof val === 'boolean' ? val : toNumericVal(val) !== 0;
      view.setUint8(byteOffset, truthy ? 1 : 0);
      return 1;
    }
    case 'char':
    case 'uint8_t': {
      const code = isBinaryChar(val) ? val.code : Math.trunc(toNumericVal(val)) & 0xff;
      view.setUint8(byteOffset, code & 0xff);
      return 1;
    }
    case 'int8_t': {
      view.setInt8(byteOffset, Math.trunc(toNumericVal(val)));
      return 1;
    }
    case 'short':
    case 'int16_t': {
      if (type.isUnsigned) {
        view.setUint16(byteOffset, Math.trunc(toNumericVal(val)) & 0xffff, true);
      } else {
        view.setInt16(byteOffset, Math.trunc(toNumericVal(val)), true);
      }
      return 2;
    }
    case 'uint16_t': {
      view.setUint16(byteOffset, Math.trunc(toNumericVal(val)) & 0xffff, true);
      return 2;
    }
    case 'int':
    case 'int32_t': {
      if (type.isUnsigned) {
        view.setUint32(byteOffset, Math.trunc(toNumericVal(val)) >>> 0, true);
      } else {
        view.setInt32(byteOffset, Math.trunc(toNumericVal(val)) | 0, true);
      }
      return 4;
    }
    case 'uint32_t': {
      view.setUint32(byteOffset, Math.trunc(toNumericVal(val)) >>> 0, true);
      return 4;
    }
    case 'float': {
      view.setFloat32(byteOffset, toNumericVal(val), true);
      return 4;
    }
    case 'double': {
      view.setFloat64(byteOffset, toNumericVal(val), true);
      return 8;
    }
    case 'long':
    case 'long long':
    case 'int64_t':
    case 'ssize_t':
    case 'ptrdiff_t':
    case 'streamsize': {
      const n = Math.trunc(toNumericVal(val));
      const safe = Number.isFinite(n) ? BigInt(n) : 0n;
      if (type.isUnsigned) {
        view.setBigUint64(byteOffset, BigInt.asUintN(64, safe), true);
      } else {
        view.setBigInt64(byteOffset, BigInt.asIntN(64, safe), true);
      }
      return 8;
    }
    case 'size_t':
    case 'uint64_t': {
      const n = Math.trunc(toNumericVal(val));
      const safe = Number.isFinite(n) ? BigInt(n) : 0n;
      view.setBigUint64(byteOffset, BigInt.asUintN(64, safe), true);
      return 8;
    }
    default: {
      view.setFloat64(byteOffset, toNumericVal(val), true);
      return 8;
    }
  }
}

function readPrimitiveFromView(
  view: DataView,
  byteOffset: number,
  type: TypeSpec
): { value: unknown; bytesRead: number } {
  if (type.pointerDepth > 0) {
    // Preserve raw address as numeric value or nullptr if 0
    const raw = view.getBigUint64(byteOffset, true);
    if (raw === 0n) {
      return {
        value: { __kind: 'ptr', blockId: 0, offset: 0, elemSize: 1, baseAddr: 0 } satisfies BinaryPointerVal,
        bytesRead: 8,
      };
    }
    return { value: Number(raw), bytesRead: 8 };
  }

  switch (type.base) {
    case 'bool':
      return { value: view.getUint8(byteOffset) !== 0, bytesRead: 1 };
    case 'char':
      return { value: makeBinaryChar(view.getUint8(byteOffset)), bytesRead: 1 };
    case 'uint8_t':
      return { value: view.getUint8(byteOffset), bytesRead: 1 };
    case 'int8_t':
      return { value: view.getInt8(byteOffset), bytesRead: 1 };
    case 'short':
    case 'int16_t':
      return {
        value: type.isUnsigned ? view.getUint16(byteOffset, true) : view.getInt16(byteOffset, true),
        bytesRead: 2,
      };
    case 'uint16_t':
      return { value: view.getUint16(byteOffset, true), bytesRead: 2 };
    case 'int':
    case 'int32_t':
      return {
        value: type.isUnsigned ? view.getUint32(byteOffset, true) : view.getInt32(byteOffset, true),
        bytesRead: 4,
      };
    case 'uint32_t':
      return { value: view.getUint32(byteOffset, true), bytesRead: 4 };
    case 'float':
      return { value: view.getFloat32(byteOffset, true), bytesRead: 4 };
    case 'double':
      return { value: view.getFloat64(byteOffset, true), bytesRead: 8 };
    case 'long':
    case 'long long':
    case 'int64_t':
    case 'ssize_t':
    case 'ptrdiff_t':
    case 'streamsize': {
      const bi = type.isUnsigned
        ? view.getBigUint64(byteOffset, true)
        : view.getBigInt64(byteOffset, true);
      return { value: Number(bi), bytesRead: 8 };
    }
    case 'size_t':
    case 'uint64_t':
      return { value: Number(view.getBigUint64(byteOffset, true)), bytesRead: 8 };
    default:
      return { value: view.getFloat64(byteOffset, true), bytesRead: 8 };
  }
}

function serializeCellInto(
  cell: BinaryCell,
  out: Uint8Array,
  view: DataView,
  offset: number,
  ctx: BinaryCodecContext
): number {
  // Fixed-size array cell (e.g., `int arr[4]` or struct field `char name[16]`)
  if (cell.arrayLength !== undefined && cell.arrayElemType !== undefined && isBinaryPtr(cell.value)) {
    const blk = ctx.blocks.get(cell.value.blockId);
    const elemSize = computeTypeByteSize(cell.arrayElemType, ctx.structs, ctx.enumConsts);
    let cursor = offset;
    for (let i = 0; i < cell.arrayLength; i += 1) {
      const idx = cell.value.offset + i;
      if (blk && idx >= 0 && idx < blk.cells.length) {
        cursor += serializeCellInto(blk.cells[idx], out, view, cursor, ctx);
      } else {
        cursor += elemSize;
      }
    }
    return cursor - offset;
  }

  // Struct instance: iterate declared fields in declaration order
  if (isBinaryStruct(cell.value)) {
    const decl = ctx.structs.get(cell.value.structName);
    let cursor = offset;
    if (decl) {
      for (const f of decl.fields) {
        const fieldCell = cell.value.fields.get(f.name);
        if (fieldCell) {
          cursor += serializeCellInto(fieldCell, out, view, cursor, ctx);
        } else {
          const elemSize = computeTypeByteSize(f.type, ctx.structs, ctx.enumConsts);
          let count = 1;
          if (f.arraySizes && f.arraySizes.length > 0) {
            for (const dim of f.arraySizes) {
              count *= Math.max(1, evalConstArrayLength(dim, ctx.enumConsts));
            }
          }
          cursor += elemSize * count;
        }
      }
    } else {
      for (const fieldCell of cell.value.fields.values()) {
        cursor += serializeCellInto(fieldCell, out, view, cursor, ctx);
      }
    }
    return cursor - offset;
  }

  return writePrimitiveToView(view, offset, cell.type, cell.value);
}

function deserializeCellFrom(
  cell: BinaryCell,
  data: Uint8Array,
  view: DataView,
  offset: number,
  ctx: BinaryCodecContext
): number {
  // Fixed-size array cell (e.g., `int arr[4]` or struct field `char name[16]`)
  if (cell.arrayLength !== undefined && cell.arrayElemType !== undefined && isBinaryPtr(cell.value)) {
    const blk = ctx.blocks.get(cell.value.blockId);
    const elemSize = computeTypeByteSize(cell.arrayElemType, ctx.structs, ctx.enumConsts);
    let cursor = offset;
    for (let i = 0; i < cell.arrayLength; i += 1) {
      const idx = cell.value.offset + i;
      if (blk && idx >= 0 && idx < blk.cells.length) {
        cursor += deserializeCellFrom(blk.cells[idx], data, view, cursor, ctx);
      } else {
        cursor += elemSize;
      }
    }
    return cursor - offset;
  }

  // Struct instance: iterate declared fields in declaration order
  if (isBinaryStruct(cell.value)) {
    const decl = ctx.structs.get(cell.value.structName);
    let cursor = offset;
    if (decl) {
      for (const f of decl.fields) {
        const fieldCell = cell.value.fields.get(f.name);
        if (fieldCell) {
          cursor += deserializeCellFrom(fieldCell, data, view, cursor, ctx);
        } else {
          const elemSize = computeTypeByteSize(f.type, ctx.structs, ctx.enumConsts);
          let count = 1;
          if (f.arraySizes && f.arraySizes.length > 0) {
            for (const dim of f.arraySizes) {
              count *= Math.max(1, evalConstArrayLength(dim, ctx.enumConsts));
            }
          }
          cursor += elemSize * count;
        }
      }
    } else {
      for (const fieldCell of cell.value.fields.values()) {
        cursor += deserializeCellFrom(fieldCell, data, view, cursor, ctx);
      }
    }
    return cursor - offset;
  }

  const res = readPrimitiveFromView(view, offset, cell.type);
  cell.value = res.value;
  return res.bytesRead;
}

/**
 * Serializes a single runtime cell (primitive, fixed-size array, or struct) into an exact Uint8Array.
 */
export function serializeCellToBytes(cell: BinaryCell, ctx: BinaryCodecContext): Uint8Array {
  const size = computeCellByteSize(cell, ctx.structs, ctx.enumConsts);
  const buf = new Uint8Array(size);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  serializeCellInto(cell, buf, view, 0, ctx);
  return buf;
}

/**
 * Deserializes a raw Uint8Array slice back into a single runtime cell in place.
 */
export function deserializeBytesIntoCell(
  cell: BinaryCell,
  bytes: Uint8Array,
  ctx: BinaryCodecContext
): void {
  const expected = computeCellByteSize(cell, ctx.structs, ctx.enumConsts);
  if (bytes.byteLength >= expected) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    deserializeCellFrom(cell, bytes, view, 0, ctx);
    return;
  }
  // Partial read: merge incoming bytes over current serialized representation
  const merged = serializeCellToBytes(cell, ctx);
  merged.set(bytes.subarray(0, Math.min(bytes.byteLength, expected)), 0);
  const view = new DataView(merged.buffer, merged.byteOffset, merged.byteLength);
  deserializeCellFrom(cell, merged, view, 0, ctx);
}

/**
 * Serializes `totalBytes` starting at a runtime pointer (supporting pointers to primitives,
 * structs, fixed-size arrays, malloc blocks, and C string literals).
 */
export function serializeFromPointer(
  src: unknown,
  totalBytes: number,
  ctx: BinaryCodecContext
): Uint8Array {
  const count = Math.max(0, Math.trunc(totalBytes));
  const out = new Uint8Array(count);
  if (count === 0) return out;

  if (typeof src === 'string') {
    const encoded = new TextEncoder().encode(src);
    out.set(encoded.subarray(0, Math.min(encoded.byteLength, count)), 0);
    return out;
  }

  if (!isBinaryPtr(src) || src.blockId === 0) {
    return out;
  }

  const blk = ctx.blocks.get(src.blockId);
  if (!blk || blk.freed) return out;

  let byteCursor = 0;
  let cellIdx = src.offset;
  while (byteCursor < count && cellIdx >= 0 && cellIdx < blk.cells.length) {
    const cellBytes = serializeCellToBytes(blk.cells[cellIdx], ctx);
    const toCopy = Math.min(cellBytes.byteLength, count - byteCursor);
    out.set(cellBytes.subarray(0, toCopy), byteCursor);
    byteCursor += toCopy;
    cellIdx += 1;
  }

  return out;
}

/**
 * Deserializes `data` bytes into memory starting at a runtime pointer (supporting pointers to
 * primitives, structs, fixed-size arrays, and char buffers).
 */
export function deserializeIntoPointer(
  dest: unknown,
  data: Uint8Array,
  ctx: BinaryCodecContext
): number {
  if (data.byteLength === 0) return 0;
  if (!isBinaryPtr(dest) || dest.blockId === 0) return 0;

  const blk = ctx.blocks.get(dest.blockId);
  if (!blk || blk.freed) return 0;

  let byteCursor = 0;
  let cellIdx = dest.offset;
  while (byteCursor < data.byteLength && cellIdx >= 0 && cellIdx < blk.cells.length) {
    const cell = blk.cells[cellIdx];
    const cellSize = computeCellByteSize(cell, ctx.structs, ctx.enumConsts);
    const sliceEnd = Math.min(data.byteLength, byteCursor + cellSize);
    const slice = data.subarray(byteCursor, sliceEnd);
    deserializeBytesIntoCell(cell, slice, ctx);
    byteCursor += slice.byteLength;
    cellIdx += 1;
  }

  return byteCursor;
}
