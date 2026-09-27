import { encodePNG, type PngImage } from './png';

/** Encode PNGs on a small pool of workers (falls back to the main thread). */
const size = Math.max(2, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
let workers: Worker[] | null = null;
let next = 0;
let seq = 0;
const pending = new Map<number, (out: Uint8Array) => void>();

function pool(): Worker[] | null {
  if (workers) return workers;
  try {
    workers = Array.from({ length: size }, () => {
      const w = new Worker(new URL('./png.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<{ id: number; out: Uint8Array }>) => {
        pending.get(e.data.id)?.(e.data.out);
        pending.delete(e.data.id);
      };
      return w;
    });
  } catch {
    workers = [];
  }
  return workers;
}

export function encodePNGAsync(img: PngImage): Promise<Uint8Array> {
  const ws = pool();
  if (!ws || !ws.length) return encodePNG(img);
  const id = ++seq;
  const w = ws[next++ % ws.length];
  return new Promise((resolve) => {
    pending.set(id, resolve);
    // copy: the caller may reuse its arrays
    w.postMessage({ id, img: { ...img, data: img.data.slice() } });
  });
}
