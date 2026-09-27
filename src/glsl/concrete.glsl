// =====================================================================
//  Cast concrete surface, shared by the concrete and painted-concrete
//  generators. All inputs are tile uv (periodic).
// =====================================================================

struct ConcreteParams {
  vec3 color;
  float mottle;        // cloudy tone variation 0..1
  float mottleScale;   // m
  float sand;          // fine speckle 0..1
  float aggregate;     // exposed stones 0..1
  float aggregateSize; // m
  vec3 aggColorA;
  vec3 aggColorB;
  float bugholes;      // air voids per 0.01 m² (≈ per 10x10 cm)
  float bugholeSize;   // m, radius of the biggest
  float relief;        // mm, fine surface relief
  float waviness;      // mm, large-scale unevenness
  float octaveScale;   // < 1 removes fine detail (for paint leveling)
};

struct ConcreteSample {
  vec3 color;
  float height;   // mm
  float rough;    // additive roughness variation
  float cavity;   // 0..1, inside voids
};

ConcreteSample concreteSurface(vec2 uv, ConcreteParams p, float seed) {
  ConcreteSample o;
  // tone: cloudy hydration mottling + larger stains
  float m1 = pfbm(uv, F(p.mottleScale), 5, 0.55, seed + 1.0);
  float m2 = pfbm(uv, F(p.mottleScale * 4.0), 3, 0.5, seed + 2.0);
  vec3 col = p.color * (1.0 + p.mottle * (0.35 * m1 + 0.25 * m2));
  col = mix(col, col * vec3(1.02, 1.0, 0.96), sat(m2 + 0.2) * p.mottle);

  // fine sand: tiny light and dark specks
  float s1 = pspeckle(uv, F(0.0018), 0.5 * p.sand, 0.3, 0.6, seed + 3.0);
  float s2 = pspeckle(uv, F(0.0014), 0.4 * p.sand, 0.3, 0.6, seed + 4.0);
  col = mix(col, col * 0.72, s1 * 0.6);
  col = mix(col, col * 1.18 + 0.02, s2 * 0.5);

  // exposed aggregate: irregular stones of two sizes, some flush, some just under the paste
  float agg = 0.0;
  vec3 aggCol = p.aggColorA;
  if (p.aggregate > 0.0) {
    for (int k = 0; k < 2; k++) {
      float sz = p.aggregateSize * (k == 0 ? 1.0 : 0.45);
      vec2 fq = F(sz);
      vec2 wuv = uv + (0.45 * pfbm2(uv, fq * 1.5, 3, 0.5, seed + 5.0 + float(k))) / fq;
      Voronoi v = pvoronoi(wuv, fq, 0.9, seed + 6.0 + float(k));
      float present = step(v.rnd.z, p.aggregate * (k == 0 ? 0.7 : 1.0));
      float size = 0.22 + 0.3 * v.rnd.w;
      float a = present * (1.0 - smoothstep(size - 0.08, size, v.f1));
      // partially covered by paste
      a *= smoothstep(0.25, 0.55, 0.5 + 0.6 * pfbm(uv, fq * 3.0, 3, 0.5, seed + 7.0 + float(k)));
      vec3 sc = mix(p.aggColorA, p.aggColorB, v.rnd.x);
      sc = varyColor(sc, vec3(0.03, 0.3, 0.25), v.rnd.yzw);
      sc *= 0.9 + 0.2 * pnoise(uv, fq * 8.0, seed + 8.0);
      col = mix(col, sc, a);
      aggCol = sc;
      agg = max(agg, a);
    }
  }

  // height: fine grain + unevenness (octaveScale < 1 keeps only the coarse part)
  float fine = pfbm(uv, F(0.0015), 3, 0.6, seed + 7.0);
  float mid = pfbm(uv, F(0.012), 4, 0.5, seed + 8.0);
  float big = pfbm(uv, F(0.4), 4, 0.5, seed + 9.0);
  float h = p.relief * (0.45 * fine * p.octaveScale + 0.55 * mid) + p.waviness * big;
  h += agg * 0.15 * p.relief;

  // bugholes: round air voids of mixed sizes
  float cav = 0.0;
  if (p.bugholes > 0.0) {
    for (int i = 0; i < 3; i++) {
      float sz = p.bugholeSize * (i == 0 ? 1.0 : (i == 1 ? 0.55 : 0.3));
      float dens = p.bugholes * (i == 0 ? 0.08 : (i == 1 ? 0.25 : 0.6));
      vec2 fq = F(sz * 5.0);
      float cellArea = (u_tileSize.x / fq.x) * (u_tileSize.y / fq.y);
      float prob = clamp(dens * cellArea / 0.01, 0.0, 1.0);
      Voronoi v = pvoronoi(uv, fq, 0.8, seed + 10.0 + float(i));
      float r = (0.2 + 0.8 * v.rnd.w) * sz / (u_tileSize.x / fq.x);
      float hole = step(v.rnd.z, prob) * (1.0 - smoothstep(r * 0.75, r, v.f1));
      float rim = step(v.rnd.z, prob) * (1.0 - smoothstep(r, r * 1.35, v.f1)) * (1.0 - hole);
      float depth = sz * 1000.0 * (0.6 + 0.5 * v.rnd.x);
      h -= hole * depth * sqrt(max(0.0, 1.0 - (v.f1 / max(r, 1e-5)) * (v.f1 / max(r, 1e-5))));
      cav = max(cav, hole);
      col = mix(col, col * 0.92, rim * 0.5);
    }
    col = mix(col, col * 0.55, cav);
  }
  o.color = col;
  o.height = h;
  o.rough = 0.05 * fine - 0.04 * m1;
  o.cavity = cav;
  return o;
}
