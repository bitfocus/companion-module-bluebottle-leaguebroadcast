// @ts-nocheck — vendored verbatim; exempt from this project's tsc strictness (noUnusedLocals/noUnusedParameters).
// Vendored from the LeagueBroadcast repository — DO NOT HAND-EDIT; re-vendor from source.
// Source: external/bluebottle-rpc/ts/src/index.ts (npm workspace @bluebottle/rpc)
// Repo:   BlueBottleGG/LeagueBroadcast
// Vendored: 2026-07-24
// Local patches: subscription rawHandler wrapped in try/catch so a deserializer or
//   handler throw is logged instead of escaping ws.onmessage as an uncaughtException
//   that kills the host process.
// - optional RpcClientOptions.webSocketFactory so a caller can supply a WebSocket
//   built with custom upgrade headers (Node's native WebSocket cannot set headers;
//   the `ws` package can, and it implements the browser-style onopen/onclose/
//   onmessage/onerror + binaryType surface this runtime relies on). Needed for
//   remote-host pairing authentication.
/**
 * @bluebottle/rpc — FlatBuffer-based RPC client runtime
 *
 * Wire protocol:
 *   Frame = Envelope + Payload
 *   Envelope: 0xBB (magic) | u16 length | u8 kind | u32 id (unless Event) | u16+utf8 method/channel
 *   Error payload: 0xEE (magic) | u16 length | u32 id | i32 code | u16+utf8 message
 *   Payload: raw FlatBuffer bytes (args or response)
 */

// ─── FlatBuffer Writer ───────────────────────────────────────────────

export class FlatBufferWriter {
  private fields: (FieldValue | null)[] = [];

  private ensure(index: number) {
    while (this.fields.length <= index) this.fields.push(null);
  }

  writeBool(index: number, value: boolean) {
    this.ensure(index);
    this.fields[index] = { scalar: new Uint8Array([value ? 1 : 0]), size: 1 };
  }

  writeByte(index: number, value: number) {
    this.ensure(index);
    this.fields[index] = { scalar: new Uint8Array([value & 0xff]), size: 1 };
  }

  writeShort(index: number, value: number) {
    this.ensure(index);
    const buf = new ArrayBuffer(2);
    new DataView(buf).setInt16(0, value, true);
    this.fields[index] = { scalar: new Uint8Array(buf), size: 2 };
  }

  writeUShort(index: number, value: number) {
    this.ensure(index);
    const buf = new ArrayBuffer(2);
    new DataView(buf).setUint16(0, value, true);
    this.fields[index] = { scalar: new Uint8Array(buf), size: 2 };
  }

  writeInt(index: number, value: number) {
    this.ensure(index);
    const buf = new ArrayBuffer(4);
    new DataView(buf).setInt32(0, value, true);
    this.fields[index] = { scalar: new Uint8Array(buf), size: 4 };
  }

  writeUInt(index: number, value: number) {
    this.ensure(index);
    const buf = new ArrayBuffer(4);
    new DataView(buf).setUint32(0, value, true);
    this.fields[index] = { scalar: new Uint8Array(buf), size: 4 };
  }

  writeLong(index: number, value: bigint) {
    this.ensure(index);
    const buf = new ArrayBuffer(8);
    new DataView(buf).setBigInt64(0, value, true);
    this.fields[index] = { scalar: new Uint8Array(buf), size: 8 };
  }

  writeULong(index: number, value: bigint) {
    this.ensure(index);
    const buf = new ArrayBuffer(8);
    new DataView(buf).setBigUint64(0, value, true);
    this.fields[index] = { scalar: new Uint8Array(buf), size: 8 };
  }

  writeFloat(index: number, value: number) {
    this.ensure(index);
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, value, true);
    this.fields[index] = { scalar: new Uint8Array(buf), size: 4 };
  }

  writeDouble(index: number, value: number) {
    this.ensure(index);
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, value, true);
    this.fields[index] = { scalar: new Uint8Array(buf), size: 8 };
  }

  writeString(index: number, value: string | null | undefined) {
    if (value == null) return;
    this.ensure(index);
    this.fields[index] = { stringData: new TextEncoder().encode(value), size: 4 };
  }

  writeByteVector(index: number, value: Uint8Array | number[] | null) {
    if (value == null) return;
    this.ensure(index);
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    this.fields[index] = { byteVector: bytes, size: 4 };
  }

  writeScalarVector(index: number, value: Uint8Array | number[] | null, elemSize: number) {
    if (value == null) return;
    this.ensure(index);
    let bytes: Uint8Array;
    if (value instanceof Uint8Array) {
      bytes = value;
    } else {
      // Convert number[] to bytes based on element size
      const buf = new ArrayBuffer(value.length * elemSize);
      const view = new DataView(buf);
      for (let i = 0; i < value.length; i++) {
        if (elemSize === 1) view.setUint8(i, value[i]);
        else if (elemSize === 2) view.setUint16(i * 2, value[i], true);
        else if (elemSize === 4) view.setUint32(i * 4, value[i], true);
      }
      bytes = new Uint8Array(buf);
    }
    this.fields[index] = { scalarVector: bytes, scalarVectorElemSize: elemSize, size: 4 };
  }

  writeFloatVector(index: number, value: number[] | null) {
    if (value == null) return;
    this.ensure(index);
    const buf = new ArrayBuffer(value.length * 4);
    const view = new DataView(buf);
    for (let i = 0; i < value.length; i++) {
      view.setFloat32(i * 4, value[i], true);
    }
    this.fields[index] = { scalarVector: new Uint8Array(buf), scalarVectorElemSize: 4, size: 4 };
  }

  // Typed numeric/bool scalar-vector writers. Each lays out [count:u32][elements LE], matching
  // the C# FlatBufferWriter.WriteScalarVector wire format so C# and TS interoperate byte-for-byte.

  writeIntVector(index: number, value: number[] | null) {
    if (value == null) return;
    this.ensure(index);
    const buf = new ArrayBuffer(value.length * 4);
    const view = new DataView(buf);
    for (let i = 0; i < value.length; i++) view.setInt32(i * 4, value[i], true);
    this.fields[index] = { scalarVector: new Uint8Array(buf), scalarVectorElemSize: 4, size: 4 };
  }

  writeUIntVector(index: number, value: number[] | null) {
    if (value == null) return;
    this.ensure(index);
    const buf = new ArrayBuffer(value.length * 4);
    const view = new DataView(buf);
    for (let i = 0; i < value.length; i++) view.setUint32(i * 4, value[i], true);
    this.fields[index] = { scalarVector: new Uint8Array(buf), scalarVectorElemSize: 4, size: 4 };
  }

  writeShortVector(index: number, value: number[] | null) {
    if (value == null) return;
    this.ensure(index);
    const buf = new ArrayBuffer(value.length * 2);
    const view = new DataView(buf);
    for (let i = 0; i < value.length; i++) view.setInt16(i * 2, value[i], true);
    this.fields[index] = { scalarVector: new Uint8Array(buf), scalarVectorElemSize: 2, size: 4 };
  }

  writeUShortVector(index: number, value: number[] | null) {
    if (value == null) return;
    this.ensure(index);
    const buf = new ArrayBuffer(value.length * 2);
    const view = new DataView(buf);
    for (let i = 0; i < value.length; i++) view.setUint16(i * 2, value[i], true);
    this.fields[index] = { scalarVector: new Uint8Array(buf), scalarVectorElemSize: 2, size: 4 };
  }

  writeLongVector(index: number, value: bigint[] | null) {
    if (value == null) return;
    this.ensure(index);
    const buf = new ArrayBuffer(value.length * 8);
    const view = new DataView(buf);
    for (let i = 0; i < value.length; i++) view.setBigInt64(i * 8, value[i], true);
    this.fields[index] = { scalarVector: new Uint8Array(buf), scalarVectorElemSize: 8, size: 4 };
  }

  writeULongVector(index: number, value: bigint[] | null) {
    if (value == null) return;
    this.ensure(index);
    const buf = new ArrayBuffer(value.length * 8);
    const view = new DataView(buf);
    for (let i = 0; i < value.length; i++) view.setBigUint64(i * 8, value[i], true);
    this.fields[index] = { scalarVector: new Uint8Array(buf), scalarVectorElemSize: 8, size: 4 };
  }

  writeDoubleVector(index: number, value: number[] | null) {
    if (value == null) return;
    this.ensure(index);
    const buf = new ArrayBuffer(value.length * 8);
    const view = new DataView(buf);
    for (let i = 0; i < value.length; i++) view.setFloat64(i * 8, value[i], true);
    this.fields[index] = { scalarVector: new Uint8Array(buf), scalarVectorElemSize: 8, size: 4 };
  }

  writeBoolVector(index: number, value: boolean[] | null) {
    if (value == null) return;
    this.ensure(index);
    const buf = new ArrayBuffer(value.length);
    const view = new DataView(buf);
    for (let i = 0; i < value.length; i++) view.setUint8(i, value[i] ? 1 : 0);
    this.fields[index] = { scalarVector: new Uint8Array(buf), scalarVectorElemSize: 1, size: 4 };
  }

  writeStringVector(index: number, value: (string | null)[] | null) {
    if (value == null) return;
    this.ensure(index);
    this.fields[index] = { stringVector: value, size: 4 };
  }

  writeTable(index: number, buffer: Uint8Array) {
    this.ensure(index);
    this.fields[index] = { tableBuffer: buffer, size: 4 };
  }

  writeTableVector(index: number, items: Uint8Array[]) {
    if (items.length === 0) return;
    this.ensure(index);
    this.fields[index] = { tableVector: items, size: 4 };
  }

  /**
   * Finish writing and produce the FlatBuffer binary.
   * fieldCount = number of fields in the vtable.
   */
  finish(fieldCount: number): Uint8Array {
    // Calculate layout
    const vtableSize = 4 + fieldCount * 2; // vtable_size(2) + table_size(2) + fields(2*n)
    let tableInlineSize = 4; // starts with soffset
    const fieldOffsets: number[] = new Array(fieldCount).fill(0);

    for (let i = 0; i < fieldCount; i++) {
      const f = i < this.fields.length ? this.fields[i] : null;
      if (f) {
        const alignment = f.size;
        const padding = (alignment - (tableInlineSize % alignment)) % alignment;
        tableInlineSize += padding;
        fieldOffsets[i] = tableInlineSize;
        tableInlineSize += f.size;
      }
    }

    // We'll build into a growable buffer
    const parts: Uint8Array[] = [];
    let totalLen = 0;
    const push = (data: Uint8Array) => { parts.push(data); totalLen += data.length; };

    // Root offset placeholder (4 bytes)
    const rootBuf = new ArrayBuffer(4);
    push(new Uint8Array(rootBuf));

    // VTable
    const vtBuf = new ArrayBuffer(vtableSize);
    const vtView = new DataView(vtBuf);
    vtView.setUint16(0, vtableSize, true);
    vtView.setUint16(2, tableInlineSize, true);
    for (let i = 0; i < fieldCount; i++) {
      vtView.setUint16(4 + i * 2, fieldOffsets[i], true);
    }
    push(new Uint8Array(vtBuf));

    const tableStart = totalLen; // offset of table in final buffer

    // Table inline data
    const tableBuf = new ArrayBuffer(tableInlineSize);
    const tableView = new DataView(tableBuf);
    // soffset to vtable
    const vtableOffset = 4; // vtable starts right after root offset
    tableView.setInt32(0, tableStart - vtableOffset, true);

    // Write scalar fields inline
    for (let i = 0; i < fieldCount; i++) {
      const f = i < this.fields.length ? this.fields[i] : null;
      if (!f || !f.scalar) continue;
      const off = fieldOffsets[i];
      new Uint8Array(tableBuf, off, f.scalar.length).set(f.scalar);
    }
    push(new Uint8Array(tableBuf));

    // Write offset data and collect patches
    const patches: { bufferOffset: number; value: number }[] = [];

    for (let i = 0; i < fieldCount; i++) {
      const f = i < this.fields.length ? this.fields[i] : null;
      if (!f || f.scalar) continue;

      // Pre-built FlatBuffer tables are written 4-byte aligned. Apply that padding BEFORE
      // capturing dataPos so the patched uoffset points at the aligned table itself, not at
      // the padding — otherwise the nested-table pointer lands short by the pad amount and the
      // reader computes a garbage root offset (out-of-range table start).
      if (f.tableBuffer) {
        const pad = (4 - (totalLen % 4)) % 4;
        if (pad) push(new Uint8Array(pad));
      }

      const offsetFieldPos = tableStart + fieldOffsets[i];
      const dataPos = totalLen;
      const relativeOffset = dataPos - offsetFieldPos;
      patches.push({ bufferOffset: offsetFieldPos, value: relativeOffset });

      if (f.stringData) {
        // String: [length:u32] [utf8] [null] [align4]
        const lenBuf = new ArrayBuffer(4);
        new DataView(lenBuf).setUint32(0, f.stringData.length, true);
        push(new Uint8Array(lenBuf));
        push(f.stringData);
        push(new Uint8Array([0])); // null terminator
        const pad = (4 - (totalLen % 4)) % 4;
        if (pad) push(new Uint8Array(pad));
      } else if (f.byteVector) {
        const lenBuf = new ArrayBuffer(4);
        new DataView(lenBuf).setUint32(0, f.byteVector.length, true);
        push(new Uint8Array(lenBuf));
        push(f.byteVector);
        const pad = (4 - (totalLen % 4)) % 4;
        if (pad) push(new Uint8Array(pad));
      } else if (f.scalarVector) {
        const count = f.scalarVector.length / (f.scalarVectorElemSize ?? 1);
        const lenBuf = new ArrayBuffer(4);
        new DataView(lenBuf).setUint32(0, count, true);
        push(new Uint8Array(lenBuf));
        push(f.scalarVector);
        const pad = (4 - (totalLen % 4)) % 4;
        if (pad) push(new Uint8Array(pad));
      } else if (f.stringVector) {
        const strs = f.stringVector;
        const count = strs.length;
        const lenBuf = new ArrayBuffer(4);
        new DataView(lenBuf).setUint32(0, count, true);
        push(new Uint8Array(lenBuf));
        // Reserve offset slots
        const offsetsStart = totalLen;
        const slotsBuf = new Uint8Array(count * 4);
        push(slotsBuf);
        // Write strings and collect patches for offsets
        for (let j = 0; j < count; j++) {
          const strBytes = strs[j] != null ? new TextEncoder().encode(strs[j]!) : new Uint8Array(0);
          const slotPos = offsetsStart + j * 4;
          const strPos = totalLen;
          patches.push({ bufferOffset: slotPos, value: strPos - slotPos });
          const sLenBuf = new ArrayBuffer(4);
          new DataView(sLenBuf).setUint32(0, strBytes.length, true);
          push(new Uint8Array(sLenBuf));
          push(strBytes);
          push(new Uint8Array([0]));
          const pad = (4 - (totalLen % 4)) % 4;
          if (pad) push(new Uint8Array(pad));
        }
      } else if (f.tableBuffer) {
        // Pre-built FlatBuffer table — alignment padding already applied above so the
        // patched uoffset points here.
        push(f.tableBuffer);
      } else if (f.tableVector) {
        const items = f.tableVector;
        const count = items.length;
        const lenBuf = new ArrayBuffer(4);
        new DataView(lenBuf).setUint32(0, count, true);
        push(new Uint8Array(lenBuf));
        // Reserve offset slots
        const offsetsStart = totalLen;
        const slotsBuf = new Uint8Array(count * 4);
        push(slotsBuf);
        // Write tables and collect patches for offsets
        for (let j = 0; j < count; j++) {
          const slotPos = offsetsStart + j * 4;
          const tblPos = totalLen;
          patches.push({ bufferOffset: slotPos, value: tblPos - slotPos });
          push(items[j]);
        }
      }
    }

    // Assemble final buffer
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }

    // Patch root offset
    new DataView(result.buffer, result.byteOffset).setInt32(0, tableStart, true);

    // Patch all offset fields
    for (const p of patches) {
      new DataView(result.buffer, result.byteOffset).setInt32(p.bufferOffset, p.value, true);
    }

    return result;
  }
}

interface FieldValue {
  scalar?: Uint8Array;
  stringData?: Uint8Array;
  byteVector?: Uint8Array;
  scalarVector?: Uint8Array;
  scalarVectorElemSize?: number;
  stringVector?: (string | null)[];
  tableBuffer?: Uint8Array;
  tableVector?: Uint8Array[];
  size: number;
}

// ─── FlatBuffer Reader ───────────────────────────────────────────────

export class FlatBufferReader {
  private buf: DataView;
  private bytes: Uint8Array;
  private tableStart: number;
  private vtableStart: number;
  private fieldCount: number;

  constructor(data: Uint8Array) {
    this.bytes = data;
    if (data.byteLength < 4) {
      console.error('[FlatBufferReader] Buffer too small to contain root offset', { byteLength: data.byteLength, firstBytes: Array.from(data.slice(0, Math.min(data.byteLength, 16))) });
      throw new Error(`FlatBufferReader: buffer too small (${data.byteLength} bytes). Expected at least 4 bytes for root offset.`);
    }
    this.buf = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const rootOffset = this.buf.getInt32(0, true);
    if (rootOffset < 0 || rootOffset > data.byteLength - 4) {
      console.error('[FlatBufferReader] Invalid root offset', { rootOffset, byteLength: data.byteLength, firstBytes: Array.from(data.slice(0, Math.min(data.byteLength, 32))) });
      throw new Error(`FlatBufferReader: invalid root offset ${rootOffset} in buffer of ${data.byteLength} bytes`);
    }
    this.tableStart = rootOffset;
    const soffset = this.buf.getInt32(this.tableStart, true);
    this.vtableStart = this.tableStart - soffset;
    if (this.vtableStart < 0 || this.vtableStart >= data.byteLength - 2) {
      console.error('[FlatBufferReader] Invalid vtable start', { vtableStart: this.vtableStart, tableStart: this.tableStart, soffset, byteLength: data.byteLength });
      throw new Error(`FlatBufferReader: invalid vtable start ${this.vtableStart} in buffer of ${data.byteLength} bytes`);
    }
    const vtableSize = this.buf.getUint16(this.vtableStart, true);
    if (vtableSize < 4 || this.vtableStart + vtableSize > data.byteLength) {
      console.error('[FlatBufferReader] Invalid vtable size', { vtableSize, vtableStart: this.vtableStart, byteLength: data.byteLength });
      throw new Error(`FlatBufferReader: invalid vtable size ${vtableSize} at offset ${this.vtableStart} in buffer of ${data.byteLength} bytes`);
    }
    this.fieldCount = (vtableSize - 4) / 2;
  }

  private getFieldOffset(fieldIndex: number): number {
    if (fieldIndex >= this.fieldCount) return 0;
    return this.buf.getUint16(this.vtableStart + 4 + fieldIndex * 2, true);
  }

  readBool(fieldIndex: number): boolean {
    const off = this.getFieldOffset(fieldIndex);
    return off !== 0 && this.bytes[this.tableStart + off] !== 0;
  }

  readByte(fieldIndex: number): number {
    const off = this.getFieldOffset(fieldIndex);
    return off === 0 ? 0 : this.bytes[this.tableStart + off];
  }

  readShort(fieldIndex: number): number {
    const off = this.getFieldOffset(fieldIndex);
    return off === 0 ? 0 : this.buf.getInt16(this.tableStart + off, true);
  }

  readUShort(fieldIndex: number): number {
    const off = this.getFieldOffset(fieldIndex);
    return off === 0 ? 0 : this.buf.getUint16(this.tableStart + off, true);
  }

  readInt(fieldIndex: number): number {
    const off = this.getFieldOffset(fieldIndex);
    return off === 0 ? 0 : this.buf.getInt32(this.tableStart + off, true);
  }

  readUInt(fieldIndex: number): number {
    const off = this.getFieldOffset(fieldIndex);
    return off === 0 ? 0 : this.buf.getUint32(this.tableStart + off, true);
  }

  readLong(fieldIndex: number): bigint {
    const off = this.getFieldOffset(fieldIndex);
    return off === 0 ? 0n : this.buf.getBigInt64(this.tableStart + off, true);
  }

  readULong(fieldIndex: number): bigint {
    const off = this.getFieldOffset(fieldIndex);
    return off === 0 ? 0n : this.buf.getBigUint64(this.tableStart + off, true);
  }

  readFloat(fieldIndex: number): number {
    const off = this.getFieldOffset(fieldIndex);
    return off === 0 ? 0 : this.buf.getFloat32(this.tableStart + off, true);
  }

  readDouble(fieldIndex: number): number {
    const off = this.getFieldOffset(fieldIndex);
    return off === 0 ? 0 : this.buf.getFloat64(this.tableStart + off, true);
  }

  readString(fieldIndex: number): string | null {
    const off = this.getFieldOffset(fieldIndex);
    if (off === 0) return null;
    const fieldPos = this.tableStart + off;
    const strOffset = this.buf.getInt32(fieldPos, true);
    const strStart = fieldPos + strOffset;
    const length = this.buf.getUint32(strStart, true);
    return new TextDecoder().decode(this.bytes.subarray(strStart + 4, strStart + 4 + length));
  }

  readByteVector(fieldIndex: number): Uint8Array | null {
    const off = this.getFieldOffset(fieldIndex);
    if (off === 0) return null;
    const fieldPos = this.tableStart + off;
    const vecOffset = this.buf.getInt32(fieldPos, true);
    const vecStart = fieldPos + vecOffset;
    const count = this.buf.getUint32(vecStart, true);
    return this.bytes.slice(vecStart + 4, vecStart + 4 + count);
  }

  readScalarVector(fieldIndex: number, elemSize: number): DataView | null {
    const off = this.getFieldOffset(fieldIndex);
    if (off === 0) return null;
    const fieldPos = this.tableStart + off;
    const vecOffset = this.buf.getInt32(fieldPos, true);
    const vecStart = fieldPos + vecOffset;
    const count = this.buf.getUint32(vecStart, true);
    const start = vecStart + 4;
    return new DataView(this.bytes.buffer, this.bytes.byteOffset + start, count * elemSize);
  }

  readStringVector(fieldIndex: number): (string | null)[] | null {
    const off = this.getFieldOffset(fieldIndex);
    if (off === 0) return null;
    const fieldPos = this.tableStart + off;
    const vecOffset = this.buf.getInt32(fieldPos, true);
    const vecStart = fieldPos + vecOffset;
    const count = this.buf.getUint32(vecStart, true);
    const result: (string | null)[] = [];
    const offsetsStart = vecStart + 4;
    for (let i = 0; i < count; i++) {
      const slotPos = offsetsStart + i * 4;
      const strRelOffset = this.buf.getInt32(slotPos, true);
      const strStart = slotPos + strRelOffset;
      const length = this.buf.getUint32(strStart, true);
      result.push(new TextDecoder().decode(this.bytes.subarray(strStart + 4, strStart + 4 + length)));
    }
    return result;
  }

  /** Read a nested table at the given field index, decoded by the provided function. */
  readTable<T>(fieldIndex: number, decode: (reader: FlatBufferReader) => T): T | null {
    const off = this.getFieldOffset(fieldIndex);
    if (off === 0) return null;
    const fieldPos = this.tableStart + off;
    const tableOffset = this.buf.getInt32(fieldPos, true);
    const childBufStart = fieldPos + tableOffset;
    // Nested tables are stored as complete FlatBuffers (root_offset + vtable + table + data).
    // Read the child's root offset to find the actual table start within the parent buffer.
    const childRootOffset = this.buf.getInt32(childBufStart, true);
    const tableStart = childBufStart + childRootOffset;
    const nested = this.buildNestedBuffer(tableStart);
    return decode(new FlatBufferReader(nested));
  }

  /** Read a vector of nested tables at the given field index. */
  readTableVector<T>(fieldIndex: number, decode: (reader: FlatBufferReader) => T): T[] | null {
    const off = this.getFieldOffset(fieldIndex);
    if (off === 0) return null;
    const fieldPos = this.tableStart + off;
    const vecOffset = this.buf.getInt32(fieldPos, true);
    const vecStart = fieldPos + vecOffset;
    const count = this.buf.getUint32(vecStart, true);
    const result: T[] = [];
    const offsetsStart = vecStart + 4;
    for (let i = 0; i < count; i++) {
      const slotPos = offsetsStart + i * 4;
      const tableRelOffset = this.buf.getInt32(slotPos, true);
      const childBufStart = slotPos + tableRelOffset;
      // Each child in a table vector is a complete FlatBuffer (root_offset + vtable + table + data).
      // Read the child's root offset to find the actual table start within the parent buffer.
      const childRootOffset = this.buf.getInt32(childBufStart, true);
      const tblStart = childBufStart + childRootOffset;
      const nested = this.buildNestedBuffer(tblStart);
      result.push(decode(new FlatBufferReader(nested)));
    }
    return result;
  }

  /** Read a vector of uint32 values. */
  readUIntVector(fieldIndex: number): number[] | null {
    const dv = this.readScalarVector(fieldIndex, 4);
    if (!dv) return null;
    const count = dv.byteLength / 4;
    const result: number[] = [];
    for (let i = 0; i < count; i++) {
      result.push(dv.getUint32(i * 4, true));
    }
    return result;
  }

  readFloatVector(fieldIndex: number): number[] | null {
    const dv = this.readScalarVector(fieldIndex, 4);
    if (!dv) return null;
    const count = dv.byteLength / 4;
    const result: number[] = [];
    for (let i = 0; i < count; i++) {
      result.push(dv.getFloat32(i * 4, true));
    }
    return result;
  }

  readIntVector(fieldIndex: number): number[] | null {
    const dv = this.readScalarVector(fieldIndex, 4);
    if (!dv) return null;
    const count = dv.byteLength / 4;
    const result: number[] = [];
    for (let i = 0; i < count; i++) result.push(dv.getInt32(i * 4, true));
    return result;
  }

  readShortVector(fieldIndex: number): number[] | null {
    const dv = this.readScalarVector(fieldIndex, 2);
    if (!dv) return null;
    const count = dv.byteLength / 2;
    const result: number[] = [];
    for (let i = 0; i < count; i++) result.push(dv.getInt16(i * 2, true));
    return result;
  }

  readUShortVector(fieldIndex: number): number[] | null {
    const dv = this.readScalarVector(fieldIndex, 2);
    if (!dv) return null;
    const count = dv.byteLength / 2;
    const result: number[] = [];
    for (let i = 0; i < count; i++) result.push(dv.getUint16(i * 2, true));
    return result;
  }

  readLongVector(fieldIndex: number): bigint[] | null {
    const dv = this.readScalarVector(fieldIndex, 8);
    if (!dv) return null;
    const count = dv.byteLength / 8;
    const result: bigint[] = [];
    for (let i = 0; i < count; i++) result.push(dv.getBigInt64(i * 8, true));
    return result;
  }

  readULongVector(fieldIndex: number): bigint[] | null {
    const dv = this.readScalarVector(fieldIndex, 8);
    if (!dv) return null;
    const count = dv.byteLength / 8;
    const result: bigint[] = [];
    for (let i = 0; i < count; i++) result.push(dv.getBigUint64(i * 8, true));
    return result;
  }

  readDoubleVector(fieldIndex: number): number[] | null {
    const dv = this.readScalarVector(fieldIndex, 8);
    if (!dv) return null;
    const count = dv.byteLength / 8;
    const result: number[] = [];
    for (let i = 0; i < count; i++) result.push(dv.getFloat64(i * 8, true));
    return result;
  }

  readBoolVector(fieldIndex: number): boolean[] | null {
    const dv = this.readScalarVector(fieldIndex, 1);
    if (!dv) return null;
    const count = dv.byteLength;
    const result: boolean[] = [];
    for (let i = 0; i < count; i++) result.push(dv.getUint8(i) !== 0);
    return result;
  }

  /** Get the raw bytes for the entire buffer (useful for passing opaque FlatBuffers). */
  get rawBytes(): Uint8Array {
    return this.bytes;
  }

  /**
   * Build a self-contained nested buffer so a new FlatBufferReader can parse a table
   * that's embedded inside this buffer at the given absolute position.
   */
  private buildNestedBuffer(tableStart: number): Uint8Array {
    const soffset = this.buf.getInt32(tableStart, true);
    const vtStart = tableStart - soffset;
    const regionStart = vtStart;
    const regionLength = this.bytes.byteLength - regionStart;
    const result = new Uint8Array(4 + regionLength);
    const view = new DataView(result.buffer);
    const newTablePos = 4 + (tableStart - regionStart);
    view.setInt32(0, newTablePos, true);
    result.set(this.bytes.subarray(regionStart, regionStart + regionLength), 4);
    return result;
  }
}

// ─── Envelope Codec ──────────────────────────────────────────────────

const ENVELOPE_MAGIC = 0xbb;
const ERROR_MAGIC = 0xee;

const enum EnvelopeKind {
  Request = 0,
  Response = 1,
  Error = 2,
  Event = 3,
}

interface Envelope {
  kind: EnvelopeKind;
  id?: number;
  method?: string;
  channel?: string;
}

function encodeEnvelope(kind: EnvelopeKind, id?: number, text?: string): Uint8Array {
  const textBytes = text ? new TextEncoder().encode(text) : null;
  // content = kind(1) + id(4, if not Event) + textLen(2)+text (if Request or Event)
  let contentLen = 1; // kind
  if (kind !== EnvelopeKind.Event) contentLen += 4; // id
  if (textBytes) contentLen += 2 + textBytes.length;

  const buf = new Uint8Array(3 + contentLen);
  const view = new DataView(buf.buffer);
  buf[0] = ENVELOPE_MAGIC;
  view.setUint16(1, contentLen, false); // big-endian
  let pos = 3;
  buf[pos++] = kind;
  if (kind !== EnvelopeKind.Event) {
    view.setUint32(pos, id ?? 0, false); // big-endian
    pos += 4;
  }
  if (textBytes) {
    view.setUint16(pos, textBytes.length, false); // big-endian
    pos += 2;
    buf.set(textBytes, pos);
  }
  return buf;
}

function decodeEnvelope(data: Uint8Array): { envelope: Envelope; payload: Uint8Array } {
  if (data.length < 4 || data[0] !== ENVELOPE_MAGIC)
    throw new Error('Invalid RPC envelope — missing magic byte');

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const length = view.getUint16(1, false); // big-endian
  const envelopeEnd = 3 + length;
  let pos = 3;

  const kind = data[pos++] as EnvelopeKind;
  const envelope: Envelope = { kind };

  if (kind !== EnvelopeKind.Event) {
    envelope.id = view.getUint32(pos, false); // big-endian
    pos += 4;
  }

  if (kind === EnvelopeKind.Request || kind === EnvelopeKind.Event) {
    const textLen = view.getUint16(pos, false);
    pos += 2;
    const text = new TextDecoder().decode(data.subarray(pos, pos + textLen));
    if (kind === EnvelopeKind.Request) envelope.method = text;
    else envelope.channel = text;
  }

  const payload = envelopeEnd < data.length ? data.subarray(envelopeEnd) : new Uint8Array(0);
  return { envelope, payload };
}

function decodeError(payload: Uint8Array): { id: number; code: number; message: string } {
  if (payload.length < 11 || payload[0] !== ERROR_MAGIC)
    throw new Error('Invalid RpcError format');

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let pos = 3; // skip magic + length
  const id = view.getUint32(pos, false);
  pos += 4;
  const code = view.getInt32(pos, false);
  pos += 4;
  const msgLen = view.getUint16(pos, false);
  pos += 2;
  const message = new TextDecoder().decode(payload.subarray(pos, pos + msgLen));
  return { id, code, message };
}

// ─── RPC Error ───────────────────────────────────────────────────────

export class RpcError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'RpcError';
  }
}

// ─── RPC Subscription ────────────────────────────────────────────────

export interface RpcSubscription<T> {
  readonly channel: string;
  onEvent(handler: (data: T) => void): void;
  unsubscribe(): void;
}

// ─── RPC Client ──────────────────────────────────────────────────────

export interface RpcClientOptions {
  /** WebSocket URL (e.g. ws://localhost:9001/ws/rpc) */
  url: string;
  /** Auto-reconnect on disconnect. Default true. */
  reconnect?: boolean;
  /** Base reconnect delay in ms. Default 1000. */
  reconnectDelay?: number;
  /**
   * Exponential backoff: delay = min(reconnectDelay * 2^(attempt-1), maxReconnectDelay)
   * plus up to reconnectJitter ms of random jitter (mirrors the C# RpcClient). Default true.
   */
  useExponentialBackoff?: boolean;
  /** Backoff cap in ms. Default 30000. */
  maxReconnectDelay?: number;
  /** Random jitter added to each retry delay in ms. Default 250. */
  reconnectJitter?: number;
  /**
   * Give up after this many consecutive failed attempts ('reconnect-failed' fires).
   * Default Infinity — browser guests have no operator to click "reconnect".
   */
  maxReconnectAttempts?: number;
  /**
   * Application-level heartbeat interval in ms; 0 (default) disables it. Detects half-open
   * sockets (backgrounded mobile tabs, dropped NAT bindings) that TCP alone won't surface:
   * a probe request is sent every interval, and if NO reply of any kind arrives within
   * heartbeatTimeoutMs the socket is force-closed so the normal reconnect path takes over.
   * Any reply — including an error envelope — counts as alive.
   */
  heartbeatIntervalMs?: number;
  /** How long to wait for a heartbeat reply before declaring the socket dead. Default 10000. */
  heartbeatTimeoutMs?: number;
  /** RPC method used as the heartbeat probe. Default 'ping.echo'. */
  heartbeatMethod?: string;
  /**
   * On document visibilitychange → visible, skip any pending backoff delay and retry
   * immediately (a tab waking from background shouldn't sit out a 30 s backoff).
   * Default true; ignored outside browser environments.
   */
  resumeOnVisibility?: boolean;
  /**
   * Local patch: optional factory for the underlying WebSocket, called once per
   * connect attempt. The returned object must implement the browser-style surface
   * (binaryType, onopen/onerror/onclose/onmessage, send, close) — the `ws` package
   * does. Lets Node callers attach custom upgrade headers (e.g. Authorization) that
   * the native WebSocket cannot set. Default: `new WebSocket(url)`.
   */
  webSocketFactory?: (url: string) => WebSocket;
}

/** Connection lifecycle events (multicast; the legacy onConnected/onDisconnected single
 * callbacks keep working alongside). 'reconnecting' fires when a retry is scheduled;
 * 'reconnect-failed' when maxReconnectAttempts is exhausted (never with the default
 * Infinity). */
export type RpcConnectionEvent = 'connected' | 'disconnected' | 'reconnecting' | 'reconnect-failed';

export interface RpcReconnectingInfo {
  attempt: number;
  nextDelayMs: number;
}

type PendingRequest = {
  resolve: (payload: Uint8Array) => void;
  reject: (err: RpcError) => void;
};

type EventHandler = (payload: Uint8Array) => void;

type SubscriptionEntry = {
  method: string;
  params: object;
  serializer?: (params: any) => Uint8Array;
};

export class RpcClient {
  /** Legacy single-callback hooks; prefer on()/off(). Both fire. */
  onConnected: (() => void) | null = null;
  onDisconnected: (() => void) | null = null;
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private eventHandlers = new Map<string, Set<EventHandler>>();
  // Active subscriptions keyed by channel, replace-on-write (mirrors the C# client's
  // _subscriptions) — so an app-level re-subscribe overwrites the tracked entry instead
  // of accumulating duplicates, and reconnect re-issues each channel exactly once.
  private subscriptions = new Map<string, SubscriptionEntry>();
  private connected = false;
  private options: Required<RpcClientOptions>;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private connectionListeners = new Map<RpcConnectionEvent, Set<(info?: RpcReconnectingInfo) => void>>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatInFlight = false;
  private visibilityHandler: (() => void) | null = null;

  constructor(options: RpcClientOptions) {
    this.options = {
      reconnect: true,
      reconnectDelay: 1000,
      useExponentialBackoff: true,
      maxReconnectDelay: 30_000,
      reconnectJitter: 250,
      maxReconnectAttempts: Infinity,
      heartbeatIntervalMs: 0,
      heartbeatTimeoutMs: 10_000,
      heartbeatMethod: 'ping.echo',
      resumeOnVisibility: true,
      ...options,
    };

    if (this.options.resumeOnVisibility && typeof document !== 'undefined') {
      this.visibilityHandler = () => {
        // A tab waking from background shouldn't sit out a long backoff delay.
        if (document.visibilityState === 'visible' && !this.connected && this.reconnectTimer) {
          this.reconnectNow();
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  /** Subscribe to a connection lifecycle event. Returns an unsubscribe function. */
  on(event: 'reconnecting', handler: (info: RpcReconnectingInfo) => void): () => void;
  on(event: 'connected' | 'disconnected' | 'reconnect-failed', handler: () => void): () => void;
  on(event: RpcConnectionEvent, handler: (...args: any[]) => void): () => void {
    let handlers = this.connectionListeners.get(event);
    if (!handlers) {
      handlers = new Set();
      this.connectionListeners.set(event, handlers);
    }
    handlers.add(handler);
    return () => this.off(event, handler);
  }

  off(event: RpcConnectionEvent, handler: (info?: RpcReconnectingInfo) => void): void {
    this.connectionListeners.get(event)?.delete(handler);
  }

  private emit(event: RpcConnectionEvent, info?: RpcReconnectingInfo): void {
    const handlers = this.connectionListeners.get(event);
    if (!handlers) return;
    for (const handler of [...handlers]) {
      try {
        handler(info);
      } catch (err) {
        console.error(`[RpcClient] ${event} listener threw`, err);
      }
    }
  }

  /** Consecutive failed reconnect attempts since the last successful connect. */
  get reconnectAttempts(): number {
    return this.attempts;
  }

  /** Cancel a pending backoff delay and retry immediately. No-op unless a retry is scheduled. */
  reconnectNow(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.connect().catch(() => {});
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Local patch: allow an injected WebSocket factory (custom upgrade headers).
      this.ws = this.options.webSocketFactory
        ? this.options.webSocketFactory(this.options.url)
        : new WebSocket(this.options.url);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.connected = true;
        this.attempts = 0;
        this.onConnected?.();
        this.emit('connected');
        this.startHeartbeat();
        resolve();
        // The server drops all per-connection subscription state on disconnect, so
        // re-issue tracked subscribe calls after every (re)connect. No-op on the
        // first connect (nothing tracked yet).
        void this.resubscribeAll();
      };

      this.ws.onerror = (ev) => {
        if (!this.connected) reject(new Error('WebSocket connection failed'));
      };

      this.ws.onclose = () => {
        const wasConnected = this.connected;
        this.connected = false;
        this.stopHeartbeat();
        if (wasConnected) {
          this.onDisconnected?.();
          this.emit('disconnected');
        }
        // Reject all pending requests
        for (const [, req] of this.pending) {
          req.reject(new RpcError(0, 'Connection closed'));
        }
        this.pending.clear();

        if (this.options.reconnect) {
          this.attempts++;
          if (this.attempts > this.options.maxReconnectAttempts) {
            this.emit('reconnect-failed');
            return;
          }
          const delay = this.nextReconnectDelay();
          this.emit('reconnecting', { attempt: this.attempts, nextDelayMs: delay });
          // Swallow the retry's rejection — the next onclose schedules the next attempt.
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect().catch(() => {});
          }, delay);
        }
      };

      this.ws.onmessage = (ev) => {
        const data = new Uint8Array(ev.data as ArrayBuffer);
        this.handleFrame(data);
      };
    });
  }

  private nextReconnectDelay(): number {
    const base = this.options.useExponentialBackoff
      ? Math.min(
          this.options.reconnectDelay * Math.pow(2, this.attempts - 1),
          this.options.maxReconnectDelay,
        )
      : this.options.reconnectDelay;
    return base + Math.floor(Math.random() * this.options.reconnectJitter);
  }

  // ── Heartbeat ──────────────────────────────────────────────────────

  private startHeartbeat(): void {
    if (this.options.heartbeatIntervalMs <= 0) return;
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => void this.sendHeartbeat(), this.options.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.heartbeatInFlight = false;
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.connected || this.heartbeatInFlight) return;
    this.heartbeatInFlight = true;
    let alive = false;
    try {
      const probe = this.sendRequest(this.options.heartbeatMethod, {});
      const timeout = new Promise<never>((_, rejectTimeout) =>
        setTimeout(() => rejectTimeout(new Error('heartbeat timeout')), this.options.heartbeatTimeoutMs),
      );
      await Promise.race([probe, timeout]);
      alive = true;
    } catch (err) {
      // ANY server reply proves the link is up — an error envelope (auth-denied,
      // bad params) is just as alive as a success. Only a local transport error
      // (code 0: not connected / connection closed) or the timeout means dead.
      alive = err instanceof RpcError && err.code !== 0;
    } finally {
      this.heartbeatInFlight = false;
    }

    if (!alive && this.connected) {
      console.warn('[RpcClient] Heartbeat timed out — closing half-open socket');
      // Route through the normal onclose → reconnect path.
      this.ws?.close();
    }
  }

  disconnect() {
    this.options.reconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.ws?.close();
  }

  /**
   * Call an RPC method. Serializes params via the provided serializer,
   * sends the request, and returns the raw response payload bytes.
   */
  async rpc<T>(method: string, params: object, serializer?: (params: any) => Uint8Array, deserializer?: (data: Uint8Array) => T): Promise<T> {
    const responsePayload = await this.sendRequest(method, params, serializer);
    if (deserializer) return deserializer(responsePayload);
    return responsePayload as unknown as T;
  }

  /**
   * Subscribe to a channel. Sends a subscription request and returns
   * a subscription handle that receives events.
   */
  async subscribe<T>(method: string, params: object, serializer?: (params: any) => Uint8Array, deserializer?: (data: Uint8Array) => T): Promise<RpcSubscription<T>> {
    const responsePayload = await this.sendRequest(method, params, serializer);

    // The channel name is returned in the response payload from the server
    const channel = responsePayload.length > 0
      ? new TextDecoder().decode(responsePayload)
      : method;
    const handlers = new Set<(data: T) => void>();

    const rawHandler: EventHandler = (raw) => {
      // Local patch: this runs synchronously inside ws.onmessage — a deserializer
      // or handler throw must be contained, not escape as an uncaughtException.
      try {
        const value = deserializer ? deserializer(raw) : raw as unknown as T;
        for (const h of handlers) h(value);
      } catch (err) {
        console.error('[RpcClient] subscription handler failed for', channel, err);
      }
    };

    if (!this.eventHandlers.has(channel)) {
      this.eventHandlers.set(channel, new Set());
    }
    this.eventHandlers.get(channel)!.add(rawHandler);
    // Latest subscribe for a channel wins for reconnect replay (C# replace semantics).
    this.subscriptions.set(channel, { method, params, serializer });

    return {
      channel,
      onEvent(handler: (data: T) => void) {
        handlers.add(handler);
      },
      unsubscribe: () => {
        const channelHandlers = this.eventHandlers.get(channel);
        channelHandlers?.delete(rawHandler);
        if (channelHandlers && channelHandlers.size === 0) {
          this.eventHandlers.delete(channel);
          this.subscriptions.delete(channel);
        }
      },
    };
  }

  private sendRequest(method: string, params: object, serializer?: (params: any) => Uint8Array): Promise<Uint8Array> {
    const id = this.nextId++;
    const envelope = encodeEnvelope(EnvelopeKind.Request, id, method);
    const payload = serializer ? serializer(params) : new Uint8Array(0);

    const frame = new Uint8Array(envelope.length + payload.length);
    frame.set(envelope);
    frame.set(payload, envelope.length);

    return this.sendAndWait(id, frame);
  }

  /**
   * Re-issue every tracked subscribe call after a reconnect (mirrors the C# client's
   * ResubscribeAllAsync). The server tears down per-connection subscription pumps on
   * disconnect, so without this, events for existing subscriptions never fire again.
   * Failed entries stay tracked and are retried on the next reconnect.
   */
  private async resubscribeAll(): Promise<void> {
    for (const [channel, entry] of [...this.subscriptions]) {
      // Skip entries removed (unsubscribed/replaced) while earlier entries were re-subscribing.
      if (this.subscriptions.get(channel) !== entry) continue;
      try {
        const responsePayload = await this.sendRequest(entry.method, entry.params, entry.serializer);
        const newChannel = responsePayload.length > 0
          ? new TextDecoder().decode(responsePayload)
          : entry.method;
        if (newChannel !== channel) {
          // Server minted a different channel name — move handlers and tracking over.
          const handlers = this.eventHandlers.get(channel);
          this.eventHandlers.delete(channel);
          this.subscriptions.delete(channel);
          if (handlers) {
            const target = this.eventHandlers.get(newChannel);
            if (target) for (const h of handlers) target.add(h);
            else this.eventHandlers.set(newChannel, handlers);
          }
          this.subscriptions.set(newChannel, entry);
        }
      } catch (err) {
        console.warn(`[RpcClient] Failed to re-subscribe to ${entry.method}`, err);
      }
    }
  }

  private sendAndWait(id: number, frame: Uint8Array): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.pending.delete(id);
        reject(new RpcError(0, 'Not connected'));
        return;
      }
      this.ws.send(frame);
    });
  }

  private handleFrame(data: Uint8Array) {
    const { envelope, payload } = decodeEnvelope(data);

    switch (envelope.kind) {
      case EnvelopeKind.Response: {
        if (payload.byteLength === 0) {
          console.warn('[RpcClient] Received empty response payload for id', envelope.id);
        }
        const req = this.pending.get(envelope.id!);
        if (req) {
          this.pending.delete(envelope.id!);
          req.resolve(payload);
        }
        break;
      }
      case EnvelopeKind.Error: {
        const err = decodeError(payload);
        const req = this.pending.get(err.id);
        if (req) {
          this.pending.delete(err.id);
          req.reject(new RpcError(err.code, err.message));
        }
        break;
      }
      case EnvelopeKind.Event: {
        const channel = envelope.channel!;
        const handlers = this.eventHandlers.get(channel);
        if (handlers) {
          for (const h of handlers) h(payload);
        }
        break;
      }
    }
  }

  get isConnected(): boolean {
    return this.connected;
  }
}
