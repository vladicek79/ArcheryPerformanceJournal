// Generates the PNG app icons (target rings on a dark ground) without external tools.
// Usage: node scripts/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const RINGS = [
  [1.0, [255, 255, 255]],
  [0.8, [26, 26, 26]],
  [0.6, [0, 162, 232]],
  [0.4, [210, 43, 43]],
  [0.2, [255, 225, 26]],
];
const GROUND = [20, 24, 28];

function colourAt(d, radius) {
  let col = GROUND;
  for (const [r, c] of RINGS) if (d <= r * radius) col = c;
  return col;
}

function render(size, radiusFrac, rounded) {
  const px = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const radius = size * radiusFrac;
  const corner = size * 0.2;
  const S = 4; // supersampling
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const fx = x + (sx + 0.5) / S, fy = y + (sy + 0.5) / S;
          if (rounded && !insideRoundedRect(fx, fy, size, corner)) continue;
          const c = colourAt(Math.hypot(fx - cx, fy - cx), radius);
          r += c[0]; g += c[1]; b += c[2]; a += 255;
        }
      }
      const n = S * S, i = (y * size + x) * 4;
      const cov = a / 255;
      px[i] = cov ? r / cov : 0; px[i + 1] = cov ? g / cov : 0; px[i + 2] = cov ? b / cov : 0; px[i + 3] = a / n;
    }
  }
  return png(size, px);
}

function insideRoundedRect(x, y, size, r) {
  const qx = Math.max(r - x, 0, x - (size - r));
  const qy = Math.max(r - y, 0, y - (size - r));
  return qx * qx + qy * qy <= r * r;
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('icon-192.png', out), render(192, 0.4, true));
writeFileSync(new URL('icon-512.png', out), render(512, 0.4, true));
writeFileSync(new URL('maskable-512.png', out), render(512, 0.32, false)); // rings inside the 80% safe zone
console.log('icons written');
