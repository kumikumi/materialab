import { defineGenerator, type ParamValues } from '../engine/types';

const n = (p: ParamValues, k: string) => Number(p[k]);

/** Cast-in-place concrete: formwork panels with tie holes, or board-formed, plus weathering. */
export const concreteGenerator = defineGenerator({
  id: 'concrete',
  params: {
    // ---- mix
    color: { type: 'color', group: 'Concrete', label: 'Color', default: '#a19e98' },
    mottle: { type: 'float', group: 'Concrete', label: 'Mottling', default: 0.45, min: 0, max: 1.5, step: 0.01 },
    mottleScale: { type: 'float', group: 'Concrete', label: 'Mottle size', default: 0.07, min: 0.01, max: 0.5, step: 0.005, unit: 'm' },
    sand: { type: 'float', group: 'Concrete', label: 'Sand speckle', default: 0.5, min: 0, max: 1, step: 0.01 },
    relief: { type: 'float', group: 'Concrete', label: 'Surface relief', default: 0.2, min: 0, max: 3, step: 0.01, unit: 'mm' },
    waviness: { type: 'float', group: 'Concrete', label: 'Waviness', default: 0.6, min: 0, max: 5, step: 0.05, unit: 'mm' },
    aggregate: { type: 'float', group: 'Concrete', label: 'Exposed aggregate', default: 0, min: 0, max: 1, step: 0.01 },
    aggregateSize: { type: 'float', group: 'Concrete', label: 'Aggregate size', default: 12, min: 2, max: 40, step: 0.5, unit: 'mm' },
    aggColorA: { type: 'color', group: 'Concrete', label: 'Aggregate A', default: '#8d8780' },
    aggColorB: { type: 'color', group: 'Concrete', label: 'Aggregate B', default: '#6b6863' },
    bugholes: { type: 'float', group: 'Concrete', label: 'Bugholes / dm²', default: 1.2, min: 0, max: 10, step: 0.05 },
    bugholeSize: { type: 'float', group: 'Concrete', label: 'Bughole size', default: 4, min: 0.5, max: 15, step: 0.1, unit: 'mm' },
    roughness: { type: 'float', group: 'Concrete', label: 'Roughness', default: 0.8, min: 0, max: 1, step: 0.005 },
    // ---- formwork
    formwork: { type: 'enum', group: 'Formwork', label: 'Formwork', default: 1, options: ['None', 'Panels with tie holes', 'Board-formed'] },
    panelWidth: { type: 'float', group: 'Formwork', label: 'Panel width', default: 0.9, min: 0.2, max: 3, step: 0.05, unit: 'm' },
    panelHeight: { type: 'float', group: 'Formwork', label: 'Panel height', default: 1.8, min: 0.2, max: 3, step: 0.05, unit: 'm' },
    panelsX: { type: 'int', group: 'Formwork', label: 'Panels across', default: 2, min: 1, max: 6 },
    panelsY: { type: 'int', group: 'Formwork', label: 'Panels up', default: 1, min: 1, max: 6 },
    panelTone: { type: 'float', group: 'Formwork', label: 'Panel tone var', default: 0.06, min: 0, max: 0.3, step: 0.005 },
    seamStep: { type: 'float', group: 'Formwork', label: 'Seam step', default: 0.4, min: 0, max: 3, step: 0.05, unit: 'mm' },
    tiesX: { type: 'int', group: 'Formwork', label: 'Tie holes across', default: 2, min: 0, max: 6 },
    tiesY: { type: 'int', group: 'Formwork', label: 'Tie holes up', default: 3, min: 0, max: 8 },
    tieRadius: { type: 'float', group: 'Formwork', label: 'Tie hole radius', default: 13, min: 3, max: 40, step: 0.5, unit: 'mm' },
    tieDepth: { type: 'float', group: 'Formwork', label: 'Tie hole depth', default: 15, min: 0, max: 50, step: 0.5, unit: 'mm' },
    tieInset: { type: 'float', group: 'Formwork', label: 'Tie inset', default: 0.2, min: 0.05, max: 0.5, step: 0.01 },
    boardWidth: { type: 'float', group: 'Formwork', label: 'Board width', default: 0.12, min: 0.04, max: 0.4, step: 0.005, unit: 'm', help: 'Board-formed: width of the form boards' },
    boardGrain: { type: 'float', group: 'Formwork', label: 'Wood grain imprint', default: 0.35, min: 0, max: 2, step: 0.01, unit: 'mm' },
    // ---- weathering
    stains: { type: 'float', group: 'Weathering', label: 'Stains', default: 0.3, min: 0, max: 1, step: 0.01 },
    streaks: { type: 'float', group: 'Weathering', label: 'Rain streaks', default: 0.3, min: 0, max: 1, step: 0.01 },
    efflorescence: { type: 'float', group: 'Weathering', label: 'Efflorescence', default: 0.05, min: 0, max: 1, step: 0.01 },
    cracks: { type: 'float', group: 'Weathering', label: 'Hairline cracks', default: 0.15, min: 0, max: 1, step: 0.01 },
  },
  tileSize: (p) => [n(p, 'panelsX') * n(p, 'panelWidth'), n(p, 'panelsY') * n(p, 'panelHeight')],
  extras: (p) => ({ parallax: n(p, 'formwork') === 1 && n(p, 'tieDepth') > 3 }),
  glsl: /* glsl */ `
void surface(vec2 uv, inout Surface s) {
  ConcreteParams cp;
  cp.color = color;
  cp.mottle = mottle;
  cp.mottleScale = mottleScale;
  cp.sand = sand;
  cp.aggregate = aggregate;
  cp.aggregateSize = aggregateSize * 0.001;
  cp.aggColorA = aggColorA;
  cp.aggColorB = aggColorB;
  cp.bugholes = bugholes;
  cp.bugholeSize = bugholeSize * 0.001;
  cp.relief = relief;
  cp.waviness = waviness;
  cp.octaveScale = 1.0;
  ConcreteSample cs = concreteSurface(uv, cp, 1.0);
  vec3 col = cs.color;
  float h = cs.height;
  float rough = roughness + cs.rough;
  float cavity = cs.cavity;

  Cell panel = gridLayout(uv, panelsX, panelsY, 0.0, 2.0);
  vec2 pl = panel.local;
  float streakSrc = 0.0;

  if (formwork == 1) {
    // each pour against a different panel: slight tone and plane offset
    col *= 1.0 + (panel.rnd.x - 0.5) * 2.0 * panelTone;
    h += (panel.rnd.y - 0.5) * 2.0 * seamStep;
    // tilt of the panel face
    h += seamStep * ((panel.rnd.z - 0.5) * (pl.x / panel.size.x - 0.5) + (panel.rnd.w - 0.5) * (pl.y / panel.size.y - 0.5));
    // seam: thin fin of paste that leaked between panels, and darker line
    float seam = 1.0 - smoothstep(0.0006, 0.0018, panel.edge);
    float fin = 1.0 - smoothstep(0.0, 0.0008, panel.edge);
    h += fin * 0.25 - seam * 0.15;
    col *= 1.0 - 0.18 * seam;
    rough += 0.05 * seam;

    // tie holes
    if (tiesX > 0 && tiesY > 0) {
      float R = tieRadius * 0.001;
      float best = 1e3;
      vec2 bestP = vec2(0.0);
      for (int j = 0; j < 8; j++) {
        if (j >= tiesY) break;
        for (int i = 0; i < 6; i++) {
          if (i >= tiesX) break;
          vec2 f = vec2(tiesX > 1 ? float(i) / float(tiesX - 1) : 0.5, tiesY > 1 ? float(j) / float(tiesY - 1) : 0.5);
          vec2 tp = (tieInset + (1.0 - 2.0 * tieInset) * f) * panel.size;
          float dd = length(pl - tp);
          if (dd < best) { best = dd; bestP = tp; }
        }
      }
      float cone = 1.0 - smoothstep(R * 0.96, R, best);
      float plug = 1.0 - smoothstep(R * 0.42, R * 0.46, best);
      float ring = (1.0 - smoothstep(R, R * 1.25, best)) * (1.0 - cone);
      // conical recess down to a plastic plug
      float depthAt = mix(tieDepth * 0.35, tieDepth, 1.0 - clamp((best - R * 0.46) / (R * 0.5), 0.0, 1.0));
      h -= cone * mix(depthAt, tieDepth, plug);
      col = mix(col, col * 0.62, cone * (1.0 - plug));
      col = mix(col, vec3(0.34, 0.34, 0.35), plug);
      col = mix(col, col * 0.93, ring);
      rough = mix(rough, 0.55, plug);
      cavity = max(cavity, cone * 0.8);
      // rust / water stain running down from the hole (texture v points up)
      vec2 rel = pl - bestP;
      float below = smoothstep(0.0, -0.02, rel.y) * exp(rel.y / 0.35);
      float wdt = R * (0.6 + 0.9 * sat(-rel.y / 0.3));
      streakSrc = below * exp(-(rel.x * rel.x) / (wdt * wdt)) * (0.6 + 0.4 * noise2(vec2(rel.x / 0.004, rel.y / 0.05), 30.0));
    }
  } else if (formwork == 2) {
    // board-formed: every form board leaves its grain and a seam
    int rowsN = max(1, int(floor(u_tileSize.y / boardWidth + 0.5)));
    Cell b = plankLayout(uv, rowsN, 1, 2, 3.0);
    vec2 bp = vec2(b.local.x, b.local.y - 0.5 * b.size.y);
    WoodSpecies sp;
    sp.ringWidth = 0.0045; sp.ringVar = 0.5; sp.lateMin = 0.2; sp.lateMax = 0.4; sp.lateSharp = 0.85;
    sp.ringWave = 0.0015; sp.poreType = 0.0; sp.poreSize = 0.0001; sp.poreDensity = 0.0;
    sp.rays = 0.0; sp.raySize = 0.01; sp.rayLength = 0.01; sp.rayWidth = 0.0002; sp.fiberScale = 0.0008;
    sp.knotDensity = 2.0; sp.knotSize = 0.012; sp.deadKnots = 0.3; sp.curl = 0.0; sp.curlSpacing = 0.01;
    WoodLog lg = makeLog(b.rnd, b.rnd2, b.size.y, 0.1, 0.25, 0.05, 0.2, 1.2, 0.0, 0.0);
    WoodSample w = woodSample(bp, 0.0, b.size, lg, sp);
    // the form's raised latewood leaves grooves in the concrete
    h -= boardGrain * (w.late + 0.25 * w.fiber * 0.5 + 0.6 * w.knot);
    h += (b.rnd.x - 0.5) * 1.2 + (b.rnd.y - 0.5) * 1.5 * (bp.y / b.size.y);
    float seam = 1.0 - smoothstep(0.0, 0.0012, b.edge);
    h += seam * 0.4;
    col *= 1.0 + (b.rnd.z - 0.5) * 2.0 * panelTone + 0.025 * (w.late - 0.5);
    col *= 1.0 - 0.12 * seam;
  }

  // ---------------- weathering
  float stainN = pfbm(uv, F(0.25), 5, 0.55, 40.0);
  col *= 1.0 - stains * 0.18 * smoothstep(0.0, 0.6, stainN);
  col = mix(col, col * vec3(1.0, 0.98, 0.93), stains * smoothstep(0.2, 0.7, pfbm(uv, F(0.5), 3, 0.5, 41.0)));
  if (streaks > 0.0) {
    float st = pstreaks(uv, vec2(F(0.08).x, F(0.8).y), 42.0);
    col *= 1.0 - streaks * 0.22 * smoothstep(0.5, 1.0, st);
  }
  col = mix(col, col * vec3(0.8, 0.75, 0.68), sat(streakSrc) * 0.4);
  if (efflorescence > 0.0) {
    float ef = smoothstep(0.55, 0.85, 0.5 + 0.6 * pfbm(uv, F(0.3), 5, 0.6, 43.0)) * efflorescence;
    col = mix(col, vec3(0.86, 0.86, 0.84), ef * 0.7);
    rough = mix(rough, 0.95, ef);
  }
  if (cracks > 0.0) {
    vec2 cr = pcracks(uv, F(0.3), 0.0025, 1.0, 0.2 + 0.45 * cracks, 44.0);
    vec2 cr2 = pcracks(uv, F(0.9), 0.0016, 1.0, 0.3 + 0.5 * cracks, 46.0);
    float cm = max(cr.x * smoothstep(1.0 - cracks, 1.2 - cracks, pvalue(uv, F(0.5), 45.0)), cr2.x * 0.7);
    h -= cm * 0.6;
    col *= 1.0 - 0.45 * cm;
    cavity = max(cavity, cm * 0.5);
  }

  s.albedo = col;
  s.height = h;
  s.roughness = clamp(rough, 0.0, 1.0);
  s.metallic = 0.0;
  s.ao = 1.0 - 0.4 * cavity;
}
`,
});
