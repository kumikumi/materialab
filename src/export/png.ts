/** Minimal PNG / ZIP writers (browser, no dependencies). */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array, crc = 0xffffffff): number {
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return crc;
}

async function zlib(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  dv.setUint32(8 + body.length, (crc32(out.subarray(4, 8 + body.length)) ^ 0xffffffff) >>> 0);
  return out;
}

export interface PngImage {
  width: number;
  height: number;
  /** 1 = gray, 3 = RGB, 4 = RGBA */
  channels: 1 | 3 | 4;
  bitDepth: 8 | 16;
  /** Top row first. 8-bit: Uint8Array, 16-bit: Uint16Array. */
  data: Uint8Array | Uint16Array;
  srgb?: boolean;
}

/** Encode with per-row adaptive filtering (the usual min-sum-of-abs heuristic). */
export async function encodePNG(img: PngImage): Promise<Uint8Array> {
  const { width: w, height: h, channels, bitDepth } = img;
  const bpp = channels * (bitDepth / 8);
  const stride = w * bpp;
  // raw bytes, big-endian for 16 bit
  let bytes: Uint8Array;
  if (bitDepth === 16) {
    const src = img.data as Uint16Array;
    bytes = new Uint8Array(src.length * 2);
    for (let i = 0; i < src.length; i++) {
      bytes[i * 2] = src[i] >> 8;
      bytes[i * 2 + 1] = src[i] & 255;
    }
  } else bytes = img.data as Uint8Array;

  const raw = new Uint8Array((stride + 1) * h);
  const cand = [new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride)];
  const zero = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const cur = bytes.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? bytes.subarray((y - 1) * stride, y * stride) : zero;
    let best = 0, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const o = cand[f];
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0;
        const b = prev[i];
        const c = i >= bpp ? prev[i - bpp] : 0;
        let p: number;
        switch (f) {
          case 0: p = 0; break;
          case 1: p = a; break;
          case 2: p = b; break;
          case 3: p = (a + b) >> 1; break;
          default: {
            const pp = a + b - c;
            const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
            p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          }
        }
        const v = (cur[i] - p) & 255;
        o[i] = v;
        sum += v < 128 ? v : 256 - v;
        if (sum >= bestSum) break;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = f;
      }
    }
    raw[y * (stride + 1)] = best;
    // recompute the winner fully (the loop above may have exited early)
    const o = cand[best];
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let p: number;
      switch (best) {
        case 0: p = 0; break;
        case 1: p = a; break;
        case 2: p = b; break;
        case 3: p = (a + b) >> 1; break;
        default: {
          const pp = a + b - c;
          const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
      }
      o[i] = (cur[i] - p) & 255;
    }
    raw.set(o, y * (stride + 1) + 1);
  }

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = bitDepth;
  ihdr[9] = channels === 1 ? 0 : channels === 3 ? 2 : 6;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)];
  if (img.srgb) parts.push(chunk('sRGB', new Uint8Array([0])));
  parts.push(chunk('IDAT', await zlib(raw)), chunk('IEND', new Uint8Array(0)));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Store-only ZIP (files are PNGs/text; PNGs are already compressed). */
export function makeZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = (crc32(f.data) ^ 0xffffffff) >>> 0;
    const lh = new Uint8Array(30 + name.length);
    const l = new DataView(lh.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(8, 0, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, f.data.length, true);
    l.setUint32(22, f.data.length, true);
    l.setUint16(26, name.length, true);
    lh.set(name, 30);
    locals.push(lh, f.data);
    const ch = new Uint8Array(46 + name.length);
    const c = new DataView(ch.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, f.data.length, true);
    c.setUint32(24, f.data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    ch.set(name, 46);
    centrals.push(ch);
    offset += lh.length + f.data.length;
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true);
  e.setUint32(16, offset, true);
  const all = [...locals, ...centrals, end];
  const out = new Uint8Array(all.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of all) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}
