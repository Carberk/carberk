import { brotliDecompressSync, inflateRawSync } from "node:zlib";

export function validateAsset(path, source, format) {
  const bytes = Buffer.isBuffer(source) ? source : Buffer.from(source);
  const fail = () => { throw new Error(`${path}: invalid ${format} binary structure`); };
  const range = (start, length) => Number.isSafeInteger(start) && length >= 0 && start >= 0 && start + length <= bytes.length;
  const u16 = (offset) => range(offset, 2) ? bytes.readUInt16BE(offset) : fail();
  const u32 = (offset) => range(offset, 4) ? bytes.readUInt32BE(offset) : fail();
  if (format === "png") {
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) fail();
    let offset = 8, image = false, end = false;
    while (offset < bytes.length) {
      const length = u32(offset);
      if (!range(offset, length + 12)) fail();
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      if (offset === 8 && (type !== "IHDR" || length !== 13 || !u32(offset + 8) || !u32(offset + 12))) fail();
      if (type === "IDAT") image = true;
      offset += length + 12;
      if (type === "IEND") { if (length || offset !== bytes.length) fail(); end = true; }
    }
    if (!image || !end) fail();
  } else if (["ttf", "otf"].includes(format)) {
    if (format === "otf" ? bytes.toString("ascii", 0, 4) !== "OTTO" : u32(0) !== 0x00010000) fail();
    const count = u16(4);
    if (!count || !range(12, count * 16)) fail();
    for (let i = 0; i < count; i++) if (!range(u32(12 + i * 16 + 8), u32(12 + i * 16 + 12))) fail();
  } else if (format === "woff2") {
    if (bytes.toString("ascii", 0, 4) !== "wOF2" || !range(0, 48) || u32(8) !== bytes.length || !u16(12) || u16(14)) fail();
    let offset = 48, expanded = 0;
    const integer = () => {
      let value = 0;
      for (let i = 0; i < 5; i++) {
        if (!range(offset, 1)) fail();
        const next = bytes[offset++];
        if (!i && next === 0x80 || value > 0x1ffffff) fail();
        value = value * 128 + (next & 0x7f);
        if (!(next & 0x80)) return value;
      }
      fail();
    };
    for (let i = 0; i < u16(12); i++) {
      if (!range(offset, 1)) fail();
      const flags = bytes[offset++], tag = flags & 63, transform = flags >> 6;
      if (tag === 63) offset += 4;
      const length = integer();
      expanded += [10, 11].includes(tag) ? transform === 0 ? integer() : length : transform ? integer() : length;
    }
    if (!range(offset, u32(20)) || expanded > 64 * 1024 * 1024) fail();
    if (brotliDecompressSync(bytes.subarray(offset, offset + u32(20)), { maxOutputLength: 64 * 1024 * 1024 }).length !== expanded) fail();
  } else if (format === "jar") {
    const end = bytes.lastIndexOf(Buffer.from([80, 75, 5, 6]));
    if (!range(end, 22) || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) fail();
    const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), start = bytes.readUInt32LE(end + 16);
    if (!count || start + size !== end || bytes.readUInt16LE(end + 8) !== count) fail();
    let offset = start;
    for (let i = 0; i < count; i++) {
      if (!range(offset, 46) || bytes.readUInt32LE(offset) !== 0x02014b50) fail();
      const compressed = bytes.readUInt32LE(offset + 20), expanded = bytes.readUInt32LE(offset + 24);
      const name = bytes.readUInt16LE(offset + 28), extra = bytes.readUInt16LE(offset + 30), comment = bytes.readUInt16LE(offset + 32);
      const local = bytes.readUInt32LE(offset + 42), method = bytes.readUInt16LE(offset + 10);
      if (!range(local, 30) || bytes.readUInt32LE(local) !== 0x04034b50 || !range(offset + 46, name + extra + comment)) fail();
      const data = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
      if (!range(data, compressed) || expanded > 64 * 1024 * 1024) fail();
      if (![0, 8].includes(method) || method === 0 && compressed !== expanded) fail();
      if (method === 8 && inflateRawSync(bytes.subarray(data, data + compressed), { maxOutputLength: 64 * 1024 * 1024 }).length !== expanded) fail();
      offset += 46 + name + extra + comment;
    }
    if (offset !== end) fail();
  } else if (format === "mp4") {
    let offset = 0;
    const types = new Set();
    while (offset < bytes.length) {
      let size = u32(offset), header = 8;
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      if (size === 1) { if (!range(offset, 16)) fail(); size = Number(bytes.readBigUInt64BE(offset + 8)); header = 16; }
      if (size === 0) size = bytes.length - offset;
      if (size < header || !range(offset, size)) fail();
      if (offset === 0 && (type !== "ftyp" || size < 16)) fail();
      types.add(type); offset += size;
    }
    if (!types.has("moov") || !types.has("mdat")) fail();
  } else if (["jpg", "jpeg"].includes(format)) {
    if (!bytes.subarray(0, 2).equals(Buffer.from([255, 216]))) fail();
    let offset = 2, frame = false, scan = false, end = false;
    while (offset < bytes.length) {
      if (bytes[offset++] !== 255 || !range(offset, 1)) fail();
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217) { end = offset === bytes.length; break; }
      if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker)) frame = true;
      const length = u16(offset);
      if (length < 2 || !range(offset, length)) fail();
      offset += length;
      if (marker === 218) {
        scan = true;
        while (offset < bytes.length) {
          if (bytes[offset] !== 255) { offset++; continue; }
          if (bytes[offset + 1] === 0 || bytes[offset + 1] >= 208 && bytes[offset + 1] <= 215) { offset += 2; continue; }
          break;
        }
      }
    }
    if (!frame || !scan || !end) fail();
  } else if (format === "ico") {
    if (!range(0, 6) || bytes.readUInt32LE(0) !== 0x00010000 || !bytes.readUInt16LE(4)) fail();
    for (let i = 0; i < bytes.readUInt16LE(4); i++) {
      const entry = 6 + i * 16;
      if (!range(entry, 16)) fail();
      const length = bytes.readUInt32LE(entry + 8), start = bytes.readUInt32LE(entry + 12);
      if (!range(start, length) || length < 8) fail();
      if (bytes[start] === 137) validateAsset(path, bytes.subarray(start, start + length), "png");
      else if (bytes.readUInt32LE(start) < 40) fail();
    }
  } else fail();
}
