import './ui/style.css';
import { materials as initialMaterials, CATEGORY_ORDER } from './materials';
import { Baker, MaterialMaps, nextFrame, textureDims } from './engine/baker';
import { defaultValues, allParams, type MaterialDef, type ParamValue, type ParamValues } from './engine/types';
import { Viewer } from './viewer/viewer';
import { fmtLen } from './viewer/views';
import { Panel, type BakeUi, type ExportUi, type ViewUi } from './ui/panel';
import { buildExport, saveExport } from './export/exporter';
import { encodePNG } from './export/png';

const q = new URLSearchParams(location.search);
const $ = (id: string) => document.getElementById(id)!;

const state = {
  materials: initialMaterials,
  def: null as MaterialDef | null,
  values: {} as ParamValues,
  defaults: {} as ParamValues,
  seed: 1,
  bake: { resolution: Number(q.get('res') ?? 2048), supersample: Number(q.get('ss') ?? 2) } as BakeUi,
  view: {
    toneMap: 'neutral',
    exposure: 1,
    animate: q.get('anim') !== '0',
    displacement: q.get('disp') === '1',
    borders: q.get('borders') === '1',
  } as ViewUi,
  exp: { resolution: Number(q.get('eres') ?? 2048), supersample: Number(q.get('ess') ?? 2), normalDX: q.get('dx') === '1', normal16: q.get('n16') === '1', unity: q.get('unity') === '1' } as ExportUi,
  exporting: false,
};

const viewer = new Viewer($('gl') as HTMLCanvasElement, $('views'));
const baker = new Baker(viewer.renderer);
viewer.animate = state.view.animate;
viewer.displacement = state.view.displacement;
viewer.setTileBorders(state.view.borders);

// ---------------------------------------------------------------- persistence
const storeKey = (id: string) => `materialab:${id}`;
function loadSaved(def: MaterialDef): { values: ParamValues; seed?: number } {
  try {
    const raw = localStorage.getItem(storeKey(def.id));
    if (!raw) return { values: {} };
    const s = JSON.parse(raw);
    const params = allParams(def);
    const values: ParamValues = {};
    for (const [k, v] of Object.entries(s.values ?? {})) if (k in params) values[k] = v as ParamValue;
    return { values, seed: s.seed };
  } catch {
    return { values: {} };
  }
}
let saveTimer = 0;
function save() {
  const def = state.def;
  if (!def) return;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const diff: ParamValues = {};
    for (const [k, v] of Object.entries(state.values)) if (String(v) !== String(state.defaults[k])) diff[k] = v;
    const seedChanged = state.seed !== (def.seed ?? 1);
    try {
      if (!Object.keys(diff).length && !seedChanged) localStorage.removeItem(storeKey(def.id));
      else localStorage.setItem(storeKey(def.id), JSON.stringify({ values: diff, seed: seedChanged ? state.seed : undefined }));
    } catch {
      /* storage unavailable */
    }
  }, 250);
}

// ---------------------------------------------------------------- UI helpers
function showError(msg: string | null) {
  const e = $('error');
  e.textContent = msg ?? '';
  e.classList.toggle('show', !!msg);
}
let toastTimer = 0;
function toast(msg: string, ms = 3500) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), ms);
}

function renderList() {
  const nav = $('materials');
  nav.innerHTML = '';
  for (const cat of CATEGORY_ORDER) {
    const list = state.materials.filter((m) => m.category === cat);
    if (!list.length) continue;
    const h = document.createElement('div');
    h.className = 'cat';
    h.textContent = cat;
    nav.appendChild(h);
    for (const m of list) {
      const a = document.createElement('div');
      a.className = 'mat-item' + (m.id === state.def?.id ? ' active' : '');
      a.dataset.id = m.id;
      a.innerHTML = `<span class="thumb"></span><span>${m.name}</span>`;
      a.title = m.description ?? '';
      a.addEventListener('click', () => select(m.id));
      nav.appendChild(a);
    }
  }
  refreshThumbs();
}

const thumbs = new Map<string, string>();
function refreshThumbs() {
  document.querySelectorAll<HTMLElement>('.mat-item').forEach((el) => {
    const url = thumbs.get(el.dataset.id!);
    if (url) (el.querySelector('.thumb') as HTMLElement).style.backgroundImage = `url(${url})`;
  });
}

const panel = new Panel($('panel'), {
  param(key, value, final) {
    state.values[key] = value;
    save();
    requestBake(final ? 'full' : 'interactive');
  },
  reset(key) {
    if (!state.def) return;
    if (key) state.values[key] = state.defaults[key];
    else state.values = { ...state.defaults };
    save();
    renderPanel();
    requestBake('full');
  },
  seed(s) {
    state.seed = s;
    save();
    requestBake('full');
  },
  bake(b) {
    state.bake = b;
    requestBake('full');
  },
  view(v) {
    const prev = state.view;
    state.view = v;
    viewer.animate = v.animate;
    viewer.exposure = v.exposure;
    viewer.setToneMapping(v.toneMap);
    viewer.setTileBorders(v.borders);
    if (v.displacement !== prev.displacement || v.displacement !== viewer.displacement) viewer.setDisplacement(v.displacement);
    viewer.invalidate();
  },
  exportSettings(e) {
    state.exp = e;
  },
  exportOne: () => void exportCurrent(),
  exportAll: () => void exportAll(),
  copy() {
    if (!state.def) return;
    const gen = state.def.generator;
    const lines: string[] = [];
    for (const [k, v] of Object.entries(state.values)) {
      const p = allParams(state.def)[k];
      if (!p || String(v) === String(p.default)) continue;
      lines.push(`    ${k}: ${typeof v === 'string' ? `'${v}'` : typeof v === 'number' ? +v.toFixed(5) : v},`);
    }
    const text = `  // ${gen.id} preset\n  seed: ${state.seed},\n  params: {\n${lines.join('\n')}\n  },\n`;
    navigator.clipboard?.writeText(text).then(
      () => toast('Preset copied to the clipboard'),
      () => toast('Clipboard not available'),
    );
    console.log(text);
  },
  resetCameras: () => viewer.resetCameras(),
});

function renderPanel() {
  if (!state.def) return;
  panel.render(state.def, state.values, state.defaults, state.seed, state.bake, state.view, state.exp);
}

// ---------------------------------------------------------------- baking
type Quality = 'interactive' | 'full';
let pending: Quality | null = null;
let running = false;
const mapsCache = new Map<string, MaterialMaps>();
let lastStats = '';
/** Duration of the last full-quality bake; fast machines skip the reduced drag preview. */
let lastFullMs = Infinity;

function requestBake(quality: Quality) {
  pending = pending === 'full' ? 'full' : quality;
  if (state.exporting) return;
  baker.cancel();
  void pump();
}

async function pump() {
  if (running) return;
  running = true;
  try {
    while (pending && state.def && !state.exporting) {
      const quality = pending;
      pending = null;
      const reduced = quality === 'interactive' && lastFullMs > 120;
      const settings = reduced ? { resolution: Math.min(512, state.bake.resolution), supersample: 1 } : state.bake;
      const tile = state.def.generator.tileSize(state.values);
      const [w, h] = textureDims(tile, settings.resolution);
      const key = `${w}x${h}`;
      const res = await baker.bake(state.values, state.seed, settings, mapsCache.get(key) ?? null, true);
      if (!res) continue;
      mapsCache.set(key, res.maps);
      viewer.setMaps(res.maps, state.def.generator.extras?.(state.values) ?? {});
      const [lo, hi] = res.maps.heightRange;
      lastStats =
        `${w}×${h} px · ${settings.supersample}×${settings.supersample} ss · ${res.ms.toFixed(0)} ms\n` +
        `tile ${fmtLen(tile[0])} × ${fmtLen(tile[1])} · ${Math.round(w / tile[0])} px/m\n` +
        `height range ${(hi - lo).toFixed(2)} mm`;
      panel.setStats(lastStats + (reduced ? '  (preview)' : ''));
      if (quality === 'full') {
        lastFullMs = res.ms;
        onFullBake();
      }
    }
  } catch (e) {
    showError(String((e as Error)?.stack ?? e));
  } finally {
    running = false;
  }
}

function onFullBake() {
  fullBakeWaiters.splice(0).forEach((f) => f());
}
const fullBakeWaiters: (() => void)[] = [];
const waitFullBake = () => new Promise<void>((r) => fullBakeWaiters.push(r));

// ---------------------------------------------------------------- thumbnails
/** Small lit albedo previews for the material list, baked in the background. */
async function makeThumbnails() {
  const tb = new Baker(viewer.renderer);
  let maps: MaterialMaps | null = null;
  const S = 96;
  for (const def of state.materials) {
    if (thumbs.has(def.id)) continue;
    // stay out of the way of interactive work
    while (running || state.exporting) await new Promise((r) => setTimeout(r, 200));
    await new Promise((r) => setTimeout(r, 30));
    if (!tb.compile(def).ok) continue;
    const saved = loadSaved(def);
    const values = { ...defaultValues(def), ...saved.values };
    // bake a small patch: a full tile scaled down is too busy for 26 px
    const res = await tb.bake(values, saved.seed ?? def.seed ?? 1, { resolution: 256, supersample: 2 }, maps, false);
    if (!res) continue;
    maps = res.maps;
    const gen = tb.read(maps.gen, 0, 'f32') as Float32Array;
    const nrm = tb.read(maps.normal, 0, 'f16') as Float32Array;
    const W = maps.width;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(S, S);
    const L = [-0.5, 0.5, 0.7];
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const i = (maps.height - 1 - y) * W + x;
        const nx = nrm[i * 4] * 2 - 1, ny = nrm[i * 4 + 1] * 2 - 1, nz = nrm[i * 4 + 2] * 2 - 1;
        const lit = 0.55 + 0.55 * Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
        for (let k = 0; k < 3; k++) img.data[(y * S + x) * 4 + k] = Math.min(255, gen[i * 4 + k] * 255 * lit);
        img.data[(y * S + x) * 4 + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    thumbs.set(def.id, c.toDataURL());
    refreshThumbs();
  }
  maps?.dispose();
}

// ---------------------------------------------------------------- selection
let lastScale = -1;
/** Switch material. `hot` = same material after a code reload (keeps cameras). */
function select(id: string, hot = false) {
  const def = state.materials.find((m) => m.id === id) ?? state.materials[0];
  if (!def) return;
  state.def = def;
  history.replaceState(null, '', `${location.pathname}${location.search}#${def.id}`);
  state.defaults = defaultValues(def);
  // user tweaks live in localStorage; everything else follows the (possibly edited) preset
  const saved = loadSaved(def);
  state.values = { ...state.defaults, ...saved.values };
  state.seed = saved.seed ?? def.seed ?? 1;
  const r = baker.compile(def);
  showError(r.ok ? null : `Shader error in ${def.generator.id}:\n${r.error}`);
  document.querySelectorAll('.mat-item').forEach((e) => e.classList.toggle('active', (e as HTMLElement).dataset.id === def.id));
  renderPanel();
  if (!r.ok) return;
  const scale = def.previewScale ?? 1;
  if (!hot || scale !== lastScale) viewer.rebuild(scale, def.generator.tileSize(state.values));
  lastScale = scale;
  requestBake('full');
}

function step(dir: number) {
  const i = state.materials.findIndex((m) => m.id === state.def?.id);
  const n = state.materials.length;
  select(state.materials[(i + dir + n) % n].id);
}

// ---------------------------------------------------------------- export
async function exportCurrent() {
  if (!state.def || state.exporting) return;
  state.exporting = true;
  baker.cancel();
  try {
    const files = await buildExport(baker, state.def, state.values, state.seed, state.exp, (s) => panel.setExportStatus(s));
    const where = await saveExport(state.def.id, files);
    panel.setExportStatus(`${files.length} files → ${where}`);
    toast(`Exported ${state.def.name} → ${where}`);
  } catch (e) {
    showError(`Export failed: ${(e as Error).message ?? e}`);
  } finally {
    state.exporting = false;
    requestBake('full');
  }
}

async function exportAll(ids?: string[]) {
  if (state.exporting) return;
  state.exporting = true;
  baker.cancel();
  const current = state.def?.id;
  const list = ids?.length ? state.materials.filter((m) => ids.includes(m.id)) : state.materials;
  let n = 0;
  try {
    for (const def of list) {
      const r = baker.compile(def);
      if (!r.ok) {
        showError(`Shader error in ${def.id}:\n${r.error}`);
        continue;
      }
      const saved = loadSaved(def);
      const values = { ...defaultValues(def), ...saved.values };
      const files = await buildExport(baker, def, values, saved.seed ?? def.seed ?? 1, state.exp, (s) => panel.setExportStatus(`[${n + 1}/${list.length}] ${s}`));
      await saveExport(def.id, files);
      n++;
    }
    panel.setExportStatus(`exported ${n} materials`);
    toast(`Exported ${n} materials`);
  } finally {
    state.exporting = false;
    if (current) {
      baker.compile(state.def!);
      requestBake('full');
    }
  }
  return n;
}

// ---------------------------------------------------------------- screenshots (automation)
async function shot(name: string) {
  await nextFrame();
  viewer.render();
  const blob = await new Promise<Blob | null>((r) => viewer.renderer.domElement.toBlob(r, 'image/png'));
  if (blob) await fetch(`/__shot/${name}.png`, { method: 'POST', body: blob });
}

async function automation() {
  const ex = q.get('export');
  if (ex) {
    await waitFullBake();
    const n = await exportAll(ex === 'all' ? undefined : ex.split(','));
    (window as unknown as { __materialab: unknown }).__materialab = { exportDone: true, exported: n };
    await fetch('/__done', { method: 'POST', body: JSON.stringify({ exported: n }) }).catch(() => {});
    toast(`Export finished (${n} materials). You can close this tab.`, 60000);
  }
  const sh = q.get('shot');
  if (sh) {
    const ids = sh === 'all' ? state.materials.map((m) => m.id) : sh === '1' ? [state.def!.id] : sh.split(',');
    for (const id of ids) {
      const w = waitFullBake();
      if (state.def?.id !== id) select(id);
      else requestBake('full');
      await w;
      await shot(id + (q.get('suffix') ?? ''));
    }
    (window as unknown as { __materialab: unknown }).__materialab = { shotsDone: true };
  }
}

// ---------------------------------------------------------------- hot reload
window.addEventListener('materialab:materials-updated', (e) => {
  state.materials = (e as CustomEvent<MaterialDef[]>).detail;
  renderList();
  if (state.def) select(state.def.id, true);
});
window.addEventListener('materialab:glsl-updated', () => {
  if (state.def) select(state.def.id, true);
});

window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (id && id !== state.def?.id) select(id);
});

// ---------------------------------------------------------------- keys
window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'arrowright' || k === 'arrowdown') step(1);
  else if (k === 'arrowleft' || k === 'arrowup') step(-1);
  else if (k === 'r') {
    state.seed = Math.floor(Math.random() * 100000);
    panel.setSeed(state.seed);
    save();
    requestBake('full');
  } else if (k === 'a' || k === 'd' || k === 'b') {
    const key = ({ a: 'animate', d: 'displacement', b: 'borders' } as const)[k];
    state.view = { ...state.view, [key]: !state.view[key] };
    viewer.animate = state.view.animate;
    viewer.setTileBorders(state.view.borders);
    if (key === 'displacement') viewer.setDisplacement(state.view.displacement);
    renderPanel();
    panel.setStats(lastStats);
  } else if (k === 'e') void exportCurrent();
  else if (k === 'escape' && viewer.focused) viewer.toggleFocus(viewer.focused);
  else return;
  e.preventDefault();
});

// ---------------------------------------------------------------- start
renderList();
select(location.hash.slice(1) || q.get('m') || state.materials[0]?.id);
const focus = q.get('view');
if (focus) {
  const v = viewer.views.find((x) => x.id === focus);
  if (v) viewer.toggleFocus(v);
}
viewer.start();
void automation();
if (!q.get('export') && !q.get('shot')) setTimeout(() => void makeThumbnails(), 1500);

/** Save the whole canvas, or one view's rectangle, to shots/<name>.png (dev server). */
async function shotView(name: string, viewId?: string) {
  viewer.render();
  const canvas = viewer.renderer.domElement;
  let src: HTMLCanvasElement = canvas;
  if (viewId) {
    const v = viewer.views.find((x) => x.id === viewId);
    if (!v) throw new Error('no view ' + viewId);
    const r = v.el.getBoundingClientRect();
    const pr = viewer.renderer.getPixelRatio();
    src = document.createElement('canvas');
    src.width = Math.round(r.width * pr);
    src.height = Math.round(r.height * pr);
    src.getContext('2d')!.drawImage(canvas, r.left * pr, r.top * pr, src.width, src.height, 0, 0, src.width, src.height);
  }
  const blob = await new Promise<Blob | null>((r) => src.toBlob(r, 'image/png'));
  if (!blob) return;
  const res = await fetch(`/__shot/${name}.png`, { method: 'POST', body: blob });
  return res.json();
}

/**
 * Debug: write the current preview maps (optionally a texel crop [x, y, w, h],
 * y from the top) to shots/<name>_<map>.png.
 */
async function dumpMaps(name: string, crop?: [number, number, number, number]) {
  const maps = viewer.currentMaps;
  if (!maps) return;
  const W = maps.width, H = maps.height;
  const [cx, cy, cw, ch] = crop ?? [0, 0, W, H];
  const gen0 = baker.read(maps.gen, 0, 'f32') as Float32Array;
  const nrm = baker.read(maps.normal, 0, 'f16') as Float32Array;
  const orm = baker.read(maps.orm) as Uint8Array;
  const [lo, hi] = maps.heightRange;
  const out: Record<string, Uint8Array> = { albedo: new Uint8Array(cw * ch * 3), normal: new Uint8Array(cw * ch * 3), orm: new Uint8Array(cw * ch * 3), height: new Uint8Array(cw * ch * 3) };
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const s = (H - 1 - (cy + y)) * W + (cx + x), d = (y * cw + x) * 3;
      const hv = Math.round(((gen0[s * 4 + 3] - lo) / Math.max(hi - lo, 1e-6)) * 255);
      for (let k = 0; k < 3; k++) {
        out.albedo[d + k] = Math.round(Math.min(1, Math.max(0, gen0[s * 4 + k])) * 255);
        out.normal[d + k] = Math.round(Math.min(1, Math.max(0, nrm[s * 4 + k])) * 255);
        out.orm[d + k] = orm[s * 4 + k];
        out.height[d + k] = hv;
      }
    }
  for (const [k, data] of Object.entries(out)) {
    const png = await encodePNG({ width: cw, height: ch, channels: 3, bitDepth: 8, data });
    await fetch(`/__shot/${name}_${k}.png`, { method: 'POST', body: png as BodyInit });
  }
}

/** Debug: for each material, bake, then save the given views and an albedo/normal/orm crop. */
async function shootSet(ids: string[], views: string[] = ['studio'], crop: [number, number, number, number] | null = [0, 0, 700, 700]) {
  const log: string[] = [];
  for (const id of ids) {
    const w = waitFullBake();
    if (state.def?.id === id) requestBake('full');
    else select(id);
    await w;
    for (const v of views) await shotView(`${id}_${v}`, v);
    if (crop) await dumpMaps(id, crop);
    log.push(`${id}: ${lastStats.split('\n')[0]} ${$('error').textContent}`);
  }
  return log;
}

/**
 * Contact sheet: one row per material, one column per view, saved as
 * shots/<name>.jpg. Handy for reviewing a whole category at once.
 */
async function gallery(name: string, ids: string[], views = ['studio', 'sun', 'raking', 'softbox'], cell = 360) {
  const pr = viewer.renderer.getPixelRatio();
  const labelH = 26;
  const sheet = document.createElement('canvas');
  const first = viewer.views.find((v) => v.id === views[0])!.el.getBoundingClientRect();
  const cellH = Math.round((cell * first.height) / first.width);
  sheet.width = cell * views.length;
  sheet.height = (cellH + labelH) * ids.length;
  const ctx = sheet.getContext('2d')!;
  ctx.fillStyle = '#0b0c0e';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  for (let row = 0; row < ids.length; row++) {
    const w = waitFullBake();
    if (state.def?.id === ids[row]) requestBake('full');
    else select(ids[row]);
    await w;
    viewer.render();
    const y0 = row * (cellH + labelH);
    ctx.fillStyle = '#d8d9dc';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText(state.def!.name, 8, y0 + 18);
    views.forEach((vid, col) => {
      const r = viewer.views.find((v) => v.id === vid)!.el.getBoundingClientRect();
      ctx.drawImage(viewer.renderer.domElement, r.left * pr, r.top * pr, r.width * pr, r.height * pr, col * cell, y0 + labelH, cell, cellH);
    });
  }
  const blob = await new Promise<Blob | null>((r) => sheet.toBlob(r, 'image/jpeg', 0.9));
  if (blob) await fetch(`/__shot/${name}.jpg`, { method: 'POST', body: blob });
}

/**
 * Tiling check: for each material compare the jump across the tile border
 * with the average jump between neighbouring texels. Ratios near 1 mean
 * seamless; a real seam shows up as a large ratio.
 */
async function seamReport(ids = state.materials.map((m) => m.id), res = 512) {
  const tb = new Baker(viewer.renderer);
  const out: Record<string, string> = {};
  for (const id of ids) {
    const def = state.materials.find((m) => m.id === id)!;
    if (!tb.compile(def).ok) {
      out[id] = 'compile error';
      continue;
    }
    const r = await tb.bake(defaultValues(def), def.seed ?? 1, { resolution: res, supersample: 1 }, null, false);
    if (!r) continue;
    const g = tb.read(r.maps.gen, 0, 'f32') as Float32Array;
    const W = r.maps.width, H = r.maps.height;
    const ch = (i: number, c: number) => (c === 3 ? g[i * 4 + 3] : 0.2126 * g[i * 4] + 0.7152 * g[i * 4 + 1] + 0.0722 * g[i * 4 + 2]);
    const parts: string[] = [];
    for (const c of [0, 3]) {
      let inX = 0, inY = 0, sx = 0, sy = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W - 1; x++) inX += Math.abs(ch(y * W + x + 1, c) - ch(y * W + x, c));
        sx += Math.abs(ch(y * W, c) - ch(y * W + W - 1, c));
      }
      for (let x = 0; x < W; x++) {
        for (let y = 0; y < H - 1; y++) inY += Math.abs(ch((y + 1) * W + x, c) - ch(y * W + x, c));
        sy += Math.abs(ch(x, c) - ch((H - 1) * W + x, c));
      }
      inX /= H * (W - 1); inY /= W * (H - 1); sx /= H; sy /= W;
      parts.push(`${c === 0 ? 'albedo' : 'height'} x${(sx / Math.max(inX, 1e-9)).toFixed(2)} y${(sy / Math.max(inY, 1e-9)).toFixed(2)}`);
    }
    out[id] = parts.join('  ');
    r.maps.dispose();
  }
  return out;
}

// handy for debugging from the devtools console
(window as unknown as { materialab: unknown }).materialab = { state, viewer, baker, select, exportAll, shotView, waitFullBake, dumpMaps, shootSet, gallery, seamReport };
