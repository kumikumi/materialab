/**
 * Batch export without clicking around:
 *
 *   npm run export                         # every material, 2048 px
 *   npm run export -- oak-floorboards brick-red --res 4096 --ss 3
 *   npm run export -- --out ../my-godot-game/materials
 *   npm run export -- --dx --unity         # + DirectX normal map, Unity mask map
 *
 * Starts the dev server, opens the app in your default browser (the
 * generators run on the GPU via WebGL2), waits until the page reports that
 * all files were written, then exits.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const ids: string[] = [];
let res = 2048, ss = 2, out = 'exports', port = 5199, openBrowser = true;
const flags: string[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--res') res = Number(args[++i]);
  else if (a === '--ss') ss = Number(args[++i]);
  else if (a === '--out') out = args[++i];
  else if (a === '--port') port = Number(args[++i]);
  else if (a === '--no-open') openBrowser = false;
  else if (a === '--dx') flags.push('dx=1');
  else if (a === '--normal16') flags.push('n16=1');
  else if (a === '--unity') flags.push('unity=1');
  else if (a === '-h' || a === '--help') {
    console.log('usage: npm run export -- [material ids...] [--res 2048] [--ss 2] [--out exports] [--port 5199] [--dx] [--normal16] [--unity] [--no-open]');
    process.exit(0);
  } else ids.push(a);
}
process.env.MATERIALAB_EXPORT_DIR = path.resolve(out);

const done = new Promise<{ exported?: number }>((resolve) => {
  (globalThis as { __materialabDone?: (i: { exported?: number }) => void }).__materialabDone = resolve;
});
const server = await createServer({ server: { port, strictPort: false }, logLevel: 'warn' });
await server.listen();
const actual = (server.httpServer?.address() as { port: number }).port;
const url = `http://localhost:${actual}/?anim=0&res=512&ss=1&export=${ids.length ? ids.join(',') : 'all'}&eres=${res}&ess=${ss}${flags.map((f) => '&' + f).join('')}`;
console.log(`exporting ${ids.length ? ids.join(', ') : 'all materials'} at ${res}px (ss ${ss}) -> ${process.env.MATERIALAB_EXPORT_DIR}`);
console.log(openBrowser ? `opening ${url}` : `open this URL in a WebGL2 browser: ${url}`);
const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
const openArgs = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
if (openBrowser) spawn(opener, openArgs, { stdio: 'ignore', detached: true }).unref();

const timeout = setTimeout(() => {
  console.error('timed out waiting for the browser (is WebGL2 available? keep the tab in the foreground)');
  process.exit(1);
}, 30 * 60 * 1000);
const info = await done;
clearTimeout(timeout);
console.log(`done: ${info.exported ?? '?'} materials written to ${process.env.MATERIALAB_EXPORT_DIR}`);
await server.close();
process.exit(0);
