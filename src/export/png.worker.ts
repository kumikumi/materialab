import { encodePNG, type PngImage } from './png';

self.onmessage = async (e: MessageEvent<{ id: number; img: PngImage }>) => {
  const out = await encodePNG(e.data.img);
  (self as unknown as Worker).postMessage({ id: e.data.id, out }, [out.buffer]);
};
