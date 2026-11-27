import test from 'node:test';
import assert from 'node:assert/strict';
import type { StructDecl, TypeSpec } from './parser';
import {
  computeTypeByteSize,
  deserializeBytesIntoCell,
  deserializeIntoPointer,
  serializeCellToBytes,
  serializeFromPointer,
  type BinaryCell,
  type BinaryCodecContext,
  type BinaryMemoryBlock,
  type BinaryPointerVal,
  type BinaryStructVal,
} from './binaryCodec';

const t = (base: string, pointerDepth = 0, isUnsigned = false): TypeSpec => ({
  base,
  pointerDepth,
  isRef: false,
  isConst: false,
  isUnsigned,
});

function makeCharCell(ch: string): BinaryCell {
  const code = ch.charCodeAt(0) & 0xff;
  return { type: t('char'), value: { __kind: 'char', ch, code } };
}

test('computeTypeByteSize returns exact byte sizes for primitives, pointers, and structs with array fields', () => {
  assert.equal(computeTypeByteSize(t('char')), 1);
  assert.equal(computeTypeByteSize(t('bool')), 1);
  assert.equal(computeTypeByteSize(t('short')), 2);
  assert.equal(computeTypeByteSize(t('int')), 4);
  assert.equal(computeTypeByteSize(t('float')), 4);
  assert.equal(computeTypeByteSize(t('double')), 8);
  assert.equal(computeTypeByteSize(t('int', 1)), 8);

  const recordDecl: StructDecl = {
    kind: 'struct',
    name: 'Record',
    fields: [
      { name: 'id', type: t('int'), line: 1, column: 1 },
      { name: 'score', type: t('double'), line: 2, column: 1 },
      { name: 'active', type: t('bool'), line: 3, column: 1 },
      {
        name: 'tag',
        type: t('char'),
        arraySizes: [{ kind: 'number', value: 7, isFloat: false, line: 4, column: 1 }],
        line: 4,
        column: 1,
      },
    ],
    constructors: [],
    destructor: undefined,
    methods: [],
    line: 1,
    column: 1,
  };
  const structs = new Map<string, StructDecl>([['Record', recordDecl]]);
  // 4 + 8 + 1 + 7 = 20 bytes exact sum of fields
  assert.equal(computeTypeByteSize(t('Record'), structs), 20);
});

test('serializeCellToBytes and deserializeBytesIntoCell round-trip primitives including negative ints, floats, and NUL bytes', () => {
  const ctx: BinaryCodecContext = { structs: new Map(), blocks: new Map() };

  const intCell: BinaryCell = { type: t('int'), value: -123456 };
  const intBytes = serializeCellToBytes(intCell, ctx);
  assert.equal(intBytes.byteLength, 4);
  const intOut: BinaryCell = { type: t('int'), value: 0 };
  deserializeBytesIntoCell(intOut, intBytes, ctx);
  assert.equal(intOut.value, -123456);

  const dblCell: BinaryCell = { type: t('double'), value: 3.141592653589793 };
  const dblBytes = serializeCellToBytes(dblCell, ctx);
  assert.equal(dblBytes.byteLength, 8);
  const dblOut: BinaryCell = { type: t('double'), value: 0 };
  deserializeBytesIntoCell(dblOut, dblBytes, ctx);
  assert.equal(dblOut.value, 3.141592653589793);

  const fltCell: BinaryCell = { type: t('float'), value: 1.5 };
  const fltBytes = serializeCellToBytes(fltCell, ctx);
  assert.equal(fltBytes.byteLength, 4);
  const fltOut: BinaryCell = { type: t('float'), value: 0 };
  deserializeBytesIntoCell(fltOut, fltBytes, ctx);
  assert.equal(fltOut.value, 1.5);

  const boolCell: BinaryCell = { type: t('bool'), value: true };
  const boolBytes = serializeCellToBytes(boolCell, ctx);
  assert.deepEqual(Array.from(boolBytes), [1]);
  const boolOut: BinaryCell = { type: t('bool'), value: false };
  deserializeBytesIntoCell(boolOut, boolBytes, ctx);
  assert.equal(boolOut.value, true);
});

test('serializeFromPointer and deserializeIntoPointer round-trip array of structs with embedded NUL bytes', () => {
  const recordDecl: StructDecl = {
    kind: 'struct',
    name: 'Record',
    fields: [
      { name: 'id', type: t('int'), line: 1, column: 1 },
      { name: 'score', type: t('double'), line: 2, column: 1 },
      {
        name: 'name',
        type: t('char'),
        arraySizes: [{ kind: 'number', value: 8, isFloat: false, line: 3, column: 1 }],
        line: 3,
        column: 1,
      },
    ],
    constructors: [],
    destructor: undefined,
    methods: [],
    line: 1,
    column: 1,
  };
  const structs = new Map<string, StructDecl>([['Record', recordDecl]]);
  const blocks = new Map<number, BinaryMemoryBlock>();

  const makeNamePtr = (blockId: number, text: string): BinaryPointerVal => {
    const chars: BinaryCell[] = Array.from({ length: 8 }, (_, idx) =>
      makeCharCell(idx < text.length ? text[idx] : '\0')
    );
    blocks.set(blockId, { id: blockId, cells: chars, elemSize: 1, baseAddr: 0x1000 * blockId, freed: false });
    return { __kind: 'ptr', blockId, offset: 0, elemSize: 1, baseAddr: 0x1000 * blockId };
  };

  const makeRecord = (nameBlockId: number, id: number, score: number, name: string): BinaryStructVal => ({
    __kind: 'struct',
    structName: 'Record',
    fields: new Map<string, BinaryCell>([
      ['id', { type: t('int'), value: id }],
      ['score', { type: t('double'), value: score }],
      [
        'name',
        {
          type: t('char', 1),
          value: makeNamePtr(nameBlockId, name),
          arrayLength: 8,
          arrayElemType: t('char'),
        },
      ],
    ]),
  });

  const srcRecs: BinaryCell[] = [
    { type: t('Record'), value: makeRecord(10, 7, 99.25, 'Ada') },
    { type: t('Record'), value: makeRecord(11, 256, -4.5, 'Bob') },
  ];
  blocks.set(1, { id: 1, cells: srcRecs, elemSize: 20, baseAddr: 0x2000, freed: false });
  const srcPtr: BinaryPointerVal = { __kind: 'ptr', blockId: 1, offset: 0, elemSize: 20, baseAddr: 0x2000 };

  const dstRecs: BinaryCell[] = [
    { type: t('Record'), value: makeRecord(20, 0, 0, '') },
    { type: t('Record'), value: makeRecord(21, 0, 0, '') },
  ];
  blocks.set(2, { id: 2, cells: dstRecs, elemSize: 20, baseAddr: 0x3000, freed: false });
  const dstPtr: BinaryPointerVal = { __kind: 'ptr', blockId: 2, offset: 0, elemSize: 20, baseAddr: 0x3000 };

  const ctx: BinaryCodecContext = { structs, blocks };
  const raw = serializeFromPointer(srcPtr, 40, ctx);
  assert.equal(raw.byteLength, 40);
  // NUL padding bytes inside name[8] must be exact 0x00 bytes
  assert.equal(raw[15], 0);
  assert.equal(raw[19], 0);

  const bytesWritten = deserializeIntoPointer(dstPtr, raw, ctx);
  assert.equal(bytesWritten, 40);

  const rec0 = dstRecs[0].value as BinaryStructVal;
  const rec1 = dstRecs[1].value as BinaryStructVal;
  assert.equal(rec0.fields.get('id')?.value, 7);
  assert.equal(rec0.fields.get('score')?.value, 99.25);
  assert.equal(rec1.fields.get('id')?.value, 256);
  assert.equal(rec1.fields.get('score')?.value, -4.5);

  const name0Cells = blocks.get(20)!.cells;
  const decodedName0 = name0Cells
    .map((c) => c.value.ch as string)
    .join('')
    .replace(/\0+$/, '');
  assert.equal(decodedName0, 'Ada');
});
