import type { MaterialDef, ParamDef, ParamValue, ParamValues } from '../engine/types';
import { allParams } from '../engine/types';
import type { ToneMap } from '../viewer/viewer';

export interface BakeUi {
  resolution: number;
  supersample: number;
}
export interface ViewUi {
  toneMap: ToneMap;
  exposure: number;
  animate: boolean;
  displacement: boolean;
  borders: boolean;
}
export interface ExportUi {
  resolution: number;
  supersample: number;
  normalDX: boolean;
  normal16: boolean;
  unity: boolean;
}

export interface PanelCallbacks {
  param(key: string, value: ParamValue, final: boolean): void;
  reset(key: string | null): void;
  seed(seed: number): void;
  bake(s: BakeUi): void;
  view(v: ViewUi): void;
  exportSettings(e: ExportUi): void;
  exportOne(): void;
  exportAll(): void;
  copy(): void;
  resetCameras(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (html) e.innerHTML = html;
  return e;
};

function fmt(p: ParamDef, v: number): string {
  if (p.type !== 'float') return String(Math.round(v));
  const step = p.step ?? 0.01;
  const d = Math.max(0, Math.min(4, Math.ceil(-Math.log10(step))));
  return v.toFixed(d);
}

export class Panel {
  private root: HTMLElement;
  private cb: PanelCallbacks;
  private rows = new Map<string, { row: HTMLElement; set: (v: ParamValue) => void }>();
  private statsEl!: HTMLElement;
  private seedInput!: HTMLInputElement;
  private exportStatus!: HTMLElement;
  private openGroups = new Set<string>();

  constructor(root: HTMLElement, cb: PanelCallbacks) {
    this.root = root;
    this.cb = cb;
  }

  render(def: MaterialDef, values: ParamValues, defaults: ParamValues, seed: number, bake: BakeUi, view: ViewUi, exp: ExportUi) {
    // remember which groups were open
    this.root.querySelectorAll('details[data-group]').forEach((d) => {
      const g = (d as HTMLElement).dataset.group!;
      if ((d as HTMLDetailsElement).open) this.openGroups.add(g);
      else this.openGroups.delete(g);
    });
    this.root.innerHTML = '';
    this.rows.clear();

    const head = el('div', { class: 'section' });
    head.innerHTML = `<h2>${def.name}</h2><p>${def.description ?? ''}</p>`;
    this.statsEl = el('div', { class: 'stats' });
    head.appendChild(this.statsEl);
    this.root.appendChild(head);

    // ---- bake settings ----
    const bakeSec = el('div', { class: 'section' });
    const resSel = this.select([256, 512, 1024, 2048], bake.resolution, (v) => this.cb.bake({ ...bake, resolution: (bake.resolution = v) }));
    const ssSel = this.select([1, 2, 3, 4], bake.supersample, (v) => this.cb.bake({ ...bake, supersample: (bake.supersample = v) }), (v) => `${v}×${v}`);
    bakeSec.append(this.ctl('Preview res', resSel), this.ctl('Supersample', ssSel));
    const seedRow = el('div', { class: 'inline' });
    this.seedInput = el('input', { type: 'number', value: String(seed), min: '0', step: '1' }) as HTMLInputElement;
    this.seedInput.addEventListener('change', () => this.cb.seed(Math.max(0, Math.floor(Number(this.seedInput.value) || 0))));
    const dice = el('button', { title: 'Random seed (R)' }, '⚄');
    dice.addEventListener('click', () => {
      const s = Math.floor(Math.random() * 100000);
      this.seedInput.value = String(s);
      this.cb.seed(s);
    });
    seedRow.append(this.seedInput, dice);
    bakeSec.append(this.ctl('Seed', seedRow));
    this.root.appendChild(bakeSec);

    // ---- params ----
    const params = allParams(def);
    const groups = new Map<string, [string, ParamDef][]>();
    for (const [k, p] of Object.entries(params)) {
      const g = p.group ?? 'General';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push([k, p]);
    }
    let first = true;
    for (const [g, list] of groups) {
      const det = el('details', { 'data-group': g }) as HTMLDetailsElement;
      det.open = this.openGroups.size ? this.openGroups.has(g) : first || g !== 'Output';
      first = false;
      det.appendChild(el('summary', {}, g));
      const body = el('div', { class: 'body' });
      for (const [k, p] of list) body.appendChild(this.paramRow(k, p, values[k] ?? p.default, defaults[k] ?? p.default));
      det.appendChild(body);
      this.root.appendChild(det);
    }
    const pb = el('div', { class: 'section' });
    const btns = el('div', { class: 'buttons' });
    const resetAll = el('button', { title: 'Reset all parameters to the preset values' }, 'Reset params');
    resetAll.addEventListener('click', () => this.cb.reset(null));
    const copy = el('button', { title: 'Copy current parameters as a preset (paste into the material file)' }, 'Copy params');
    copy.addEventListener('click', () => this.cb.copy());
    btns.append(resetAll, copy);
    pb.appendChild(btns);
    this.root.appendChild(pb);

    // ---- view ----
    const viewDet = el('details', { 'data-group': '__view' }) as HTMLDetailsElement;
    viewDet.open = this.openGroups.size ? this.openGroups.has('__view') : true;
    viewDet.appendChild(el('summary', {}, 'View'));
    const vb = el('div', { class: 'body' });
    const tm = el('select') as HTMLSelectElement;
    for (const [v, n] of [['neutral', 'Khronos Neutral'], ['agx', 'AgX'], ['aces', 'ACES Filmic'], ['linear', 'Linear (clip)']]) tm.appendChild(el('option', { value: v }, n));
    tm.value = view.toneMap;
    tm.addEventListener('change', () => this.cb.view({ ...view, toneMap: (view.toneMap = tm.value as ToneMap) }));
    vb.appendChild(this.ctl('Tone mapping', tm));
    const ex = el('input', { type: 'range', min: '-2', max: '2', step: '0.05', value: String(Math.log2(view.exposure)) }) as HTMLInputElement;
    ex.addEventListener('input', () => this.cb.view({ ...view, exposure: (view.exposure = 2 ** Number(ex.value)) }));
    vb.appendChild(this.ctl('Exposure', ex));
    const checks = el('div', { class: 'checks' });
    const check = (label: string, key: 'animate' | 'displacement' | 'borders', title: string) => {
      const l = el('label', { title });
      const c = el('input', { type: 'checkbox' }) as HTMLInputElement;
      c.checked = view[key];
      c.addEventListener('change', () => this.cb.view({ ...view, [key]: (view[key] = c.checked) }));
      l.append(c, document.createTextNode(label));
      checks.appendChild(l);
    };
    check('Animate lights', 'animate', 'Moving lights in the close-up, softbox and night views (A)');
    check('Displacement', 'displacement', 'Displace dense preview meshes by the height map (D). Engines use parallax instead.');
    check('Tile borders', 'borders', 'Outline the texture tiles in the tiling view (B)');
    vb.appendChild(checks);
    const vbtn = el('div', { class: 'buttons' });
    const rc = el('button', {}, 'Reset cameras');
    rc.addEventListener('click', () => this.cb.resetCameras());
    vbtn.appendChild(rc);
    vb.appendChild(vbtn);
    vb.appendChild(el('div', { class: 'kbd' }, 'Drag a view to orbit, scroll to zoom, double-click to focus.<br><b>←</b><b>→</b> material <b>R</b> reseed <b>A</b> animate <b>D</b> displace <b>B</b> borders <b>E</b> export'));
    viewDet.appendChild(vb);
    this.root.appendChild(viewDet);

    // ---- export ----
    const expDet = el('details', { 'data-group': '__export' }) as HTMLDetailsElement;
    expDet.open = this.openGroups.size ? this.openGroups.has('__export') : true;
    expDet.appendChild(el('summary', {}, 'Export'));
    const eb = el('div', { class: 'body' });
    eb.appendChild(this.ctl('Resolution', this.select([512, 1024, 2048, 4096], exp.resolution, (v) => this.cb.exportSettings({ ...exp, resolution: (exp.resolution = v) }))));
    eb.appendChild(this.ctl('Supersample', this.select([1, 2, 3, 4], exp.supersample, (v) => this.cb.exportSettings({ ...exp, supersample: (exp.supersample = v) }), (v) => `${v}×${v}`)));
    const dxWrap = el('div', { class: 'checks' });
    const expCheck = (label: string, key: 'normalDX' | 'normal16' | 'unity', title: string) => {
      const l = el('label', { title });
      const c = el('input', { type: 'checkbox' }) as HTMLInputElement;
      c.checked = exp[key];
      c.addEventListener('change', () => this.cb.exportSettings({ ...exp, [key]: (exp[key] = c.checked) }));
      l.append(c, document.createTextNode(label));
      dxWrap.appendChild(l);
    };
    expCheck('DirectX normal too', 'normalDX', 'Also write a DirectX-convention (-Y) normal map, e.g. for Unreal');
    expCheck('16-bit normal', 'normal16', 'Smoother normal gradients for glossy surfaces');
    expCheck('Unity mask map', 'unity', 'Extra RGBA map: R metallic, G AO, A smoothness (HDRP mask map / URP metallic map)');
    eb.appendChild(dxWrap);
    const ebtn = el('div', { class: 'buttons' });
    const e1 = el('button', { class: 'primary', title: 'PNG maps + Godot .tres + glTF + JSON (E)' }, 'Export material');
    e1.addEventListener('click', () => this.cb.exportOne());
    const ea = el('button', {}, 'Export all');
    ea.addEventListener('click', () => this.cb.exportAll());
    ebtn.append(e1, ea);
    eb.appendChild(ebtn);
    this.exportStatus = el('div', { class: 'stats' });
    eb.appendChild(this.exportStatus);
    expDet.appendChild(eb);
    this.root.appendChild(expDet);
  }

  setStats(text: string) {
    if (this.statsEl) this.statsEl.textContent = text;
  }
  setExportStatus(text: string) {
    if (this.exportStatus) this.exportStatus.textContent = text;
  }
  setSeed(seed: number) {
    if (this.seedInput) this.seedInput.value = String(seed);
  }
  setParam(key: string, v: ParamValue) {
    this.rows.get(key)?.set(v);
  }

  private ctl(label: string, input: HTMLElement): HTMLElement {
    const d = el('div', { class: 'ctl' });
    d.append(el('label', {}, label), input);
    return d;
  }

  private select(values: number[], current: number, on: (v: number) => void, label = (v: number) => String(v)): HTMLSelectElement {
    const s = el('select') as HTMLSelectElement;
    for (const v of values) s.appendChild(el('option', { value: String(v) }, label(v)));
    s.value = String(current);
    s.addEventListener('change', () => on(Number(s.value)));
    return s;
  }

  private paramRow(key: string, p: ParamDef, value: ParamValue, def: ParamValue): HTMLElement {
    const row = el('div', { class: 'row', title: `${key}${p.help ? ' — ' + p.help : ''}` });
    const label = el('label', {}, (p.label ?? key) + (p.type === 'float' || p.type === 'int' ? (p.unit ? ` <span style="color:var(--muted)">${p.unit}</span>` : '') : ''));
    const reset = el('span', { class: 'reset', title: `Reset to ${def}` }, '↺');
    reset.addEventListener('click', () => this.cb.reset(key));
    const mark = (v: ParamValue) => row.classList.toggle('modified', String(v) !== String(def));
    let set: (v: ParamValue) => void;

    if (p.type === 'float' || p.type === 'int') {
      const log = p.type === 'float' && p.log && p.min > 0;
      const toSlider = (v: number) => (log ? (Math.log(v / p.min) / Math.log(p.max / p.min)) * 1000 : v);
      const fromSlider = (s: number) => (log ? p.min * (p.max / p.min) ** (s / 1000) : s);
      const step = p.type === 'int' ? 1 : (p.step ?? 0.01);
      const range = el('input', { type: 'range', min: String(log ? 0 : p.min), max: String(log ? 1000 : p.max), step: String(log ? 1 : step) }) as HTMLInputElement;
      const num = el('input', { type: 'number', step: String(step) }) as HTMLInputElement;
      const snap = (v: number) => (p.type === 'int' ? Math.round(v) : Math.round(v / step) * step);
      set = (v) => {
        range.value = String(toSlider(Number(v)));
        num.value = fmt(p, Number(v));
        mark(v);
      };
      range.addEventListener('input', () => {
        const v = snap(fromSlider(Number(range.value)));
        num.value = fmt(p, v);
        mark(v);
        this.cb.param(key, v, false);
      });
      range.addEventListener('change', () => this.cb.param(key, snap(fromSlider(Number(range.value))), true));
      num.addEventListener('change', () => {
        const v = snap(Number(num.value));
        set(v);
        this.cb.param(key, v, true);
      });
      set(Number(value));
      row.append(label, range, num, reset);
    } else if (p.type === 'bool') {
      row.classList.add('wide');
      const c = el('input', { type: 'checkbox' }) as HTMLInputElement;
      set = (v) => {
        c.checked = !!v;
        mark(!!v);
      };
      c.addEventListener('change', () => {
        mark(c.checked);
        this.cb.param(key, c.checked, true);
      });
      set(value);
      const wrap = el('div');
      wrap.appendChild(c);
      row.append(label, wrap, reset);
    } else if (p.type === 'color') {
      row.classList.add('wide');
      const c = el('input', { type: 'color' }) as HTMLInputElement;
      set = (v) => {
        c.value = String(v);
        mark(String(v).toLowerCase());
      };
      c.addEventListener('input', () => {
        mark(c.value);
        this.cb.param(key, c.value, false);
      });
      c.addEventListener('change', () => this.cb.param(key, c.value, true));
      set(value);
      row.append(label, c, reset);
    } else {
      row.classList.add('wide');
      const s = el('select') as HTMLSelectElement;
      p.options.forEach((o, i) => s.appendChild(el('option', { value: String(i) }, o)));
      set = (v) => {
        s.value = String(v);
        mark(Number(v));
      };
      s.addEventListener('change', () => {
        mark(Number(s.value));
        this.cb.param(key, Number(s.value), true);
      });
      set(value);
      row.append(label, s, reset);
    }
    this.rows.set(key, { row, set });
    return row;
  }
}
