// =====================================================================
//  Tileable layouts: planks, herringbone, brick bonds, grids.
//
//  Every layout returns a Cell. Cell sizes include the joint/gap, so the
//  visible piece is the cell inset by gap/2 — use `cell.edge` (distance
//  to the cell border in meters) to cut joints, bevels and chips.
//  The per-cell random numbers are derived from the wrapped cell center,
//  so a cell that straddles the tile border gets the same values on both
//  sides and the texture stays seamless.
// =====================================================================

struct Cell {
  vec2 local;   // meters from the cell's min corner; x runs along the cell's long / grain axis
  vec2 size;    // meters
  vec2 center;  // center in tile uv, wrapped to [0,1)
  vec2 axis;    // direction of local x in tile space
  float edge;   // distance (m) to the nearest cell border, >= 0
  vec4 rnd;     // stable random numbers
  vec4 rnd2;
  int kind;     // layout specific: row index, header/stretcher, H/V board...
};

vec4 cellRandom(vec2 centerUV, float seed) {
  ivec2 q = ivec2(floor(fract(centerUV) * 16384.0 + 0.5)) % 16384;
  return hash4(q, seed);
}

void finishCell(inout Cell c, float seed) {
  c.center = fract(c.center);
  c.edge = min(min(c.local.x, c.size.x - c.local.x), min(c.local.y, c.size.y - c.local.y));
  c.rnd = cellRandom(c.center, seed);
  c.rnd2 = cellRandom(c.center, seed + 71.0);
}

/**
 * Rows of planks running along u. Each row holds between minPer and maxPer
 * planks of random length with a random joint offset — like a floor.
 * rows: plank rows per tile (tile height = rows * plank width).
 */
Cell plankLayout(vec2 uv, int rows, int minPer, int maxPer, float seed) {
  vec2 T = u_tileSize;
  float fy = uv.y * float(rows);
  float rowF = floor(fy);
  int row = int(mod(rowF, float(rows)));
  vec4 hr = hash4(ivec2(row, 911), seed);
  int count = clamp(minPer + int(floor(hr.x * float(maxPer - minPer + 1))), 1, 8);
  float offset = hr.y;

  float total = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= count) break;
    total += 0.6 + hash1(ivec2(row, i), seed + 1.0);
  }
  float t = fract(uv.x + offset);
  float start = 0.0, len = 1.0, acc = 0.0;
  int idx = 0;
  for (int i = 0; i < 8; i++) {
    if (i >= count) break;
    float l = (0.6 + hash1(ivec2(row, i), seed + 1.0)) / total;
    if (t < acc + l || i == count - 1) { start = acc; len = (i == count - 1) ? 1.0 - acc : l; idx = i; break; }
    acc += l;
  }
  Cell c;
  c.local = vec2((t - start) * T.x, fract(fy) * T.y / float(rows));
  c.size = vec2(len * T.x, T.y / float(rows));
  c.center = vec2(start + 0.5 * len - offset, (rowF + 0.5) / float(rows));
  c.axis = vec2(1.0, 0.0);
  c.kind = row;
  finishCell(c, seed);
  return c;
}

/**
 * Regular rows of equal cells with a per-row shift (running bond etc.).
 * cols x rows cells per tile; row r is shifted by r * rowShift cells.
 * rows * rowShift must be an integer for the tile to wrap.
 */
Cell gridLayout(vec2 uv, int cols, int rows, float rowShift, float seed) {
  vec2 T = u_tileSize;
  float fy = uv.y * float(rows);
  float rowF = floor(fy);
  float fx = uv.x * float(cols) + rowF * rowShift;
  float colF = floor(fx);
  Cell c;
  vec2 cs = T / vec2(float(cols), float(rows));
  c.local = vec2(fract(fx), fract(fy)) * cs;
  c.size = cs;
  c.center = vec2((colF + 0.5 - rowF * rowShift) / float(cols), (rowF + 0.5) / float(rows));
  c.axis = vec2(1.0, 0.0);
  c.kind = int(mod(rowF, float(rows)));
  finishCell(c, seed);
  return c;
}

/**
 * Flemish bond: every course alternates stretcher (length L) and header
 * (length Hd), odd courses shifted so headers sit centered on stretchers.
 * Lengths are cell lengths (brick + joint). Tile width must be k*(L+Hd).
 * kind: 0 = stretcher, 1 = header.
 */
Cell flemishLayout(vec2 uv, float L, float Hd, int rows, float seed) {
  vec2 T = u_tileSize;
  float fy = uv.y * float(rows);
  float rowF = floor(fy);
  float period = L + Hd;
  float shift = mod(rowF, 2.0) * (0.5 * L + 0.5 * Hd);
  float x = uv.x * T.x + shift;
  float t = mod(x, period);
  float base = x - t;
  Cell c;
  float h = T.y / float(rows);
  if (t < L) {
    c.local = vec2(t, fract(fy) * h);
    c.size = vec2(L, h);
    c.center = vec2((base + 0.5 * L - shift) / T.x, (rowF + 0.5) / float(rows));
    c.kind = 0;
  } else {
    c.local = vec2(t - L, fract(fy) * h);
    c.size = vec2(Hd, h);
    c.center = vec2((base + L + 0.5 * Hd - shift) / T.x, (rowF + 0.5) / float(rows));
    c.kind = 1;
  }
  c.axis = vec2(1.0, 0.0);
  finishCell(c, seed);
  return c;
}

/**
 * 45° herringbone of boards W wide and n*W long (cell sizes, integer n).
 * The pattern repeats every (sqrt2*W, n*sqrt2*W); use a tile size of
 * (k*n*sqrt2*W) squared. kind: 0 = boards along +45°, 1 = along -45°.
 */
Cell herringboneLayout(vec2 uv, float W, float n, float seed) {
  vec2 p = uv * u_tileSize;
  const float s = 0.70710678;
  vec2 q = vec2(s * (p.x - p.y), s * (p.x + p.y)) / W;
  float a0 = floor((q.x + q.y) * 0.5);
  float b0 = floor((q.x - q.y) / (2.0 * n));
  Cell c;
  c.local = vec2(0.0); c.size = vec2(n, 1.0) * W; c.axis = vec2(1.0, 0.0); c.kind = 0;
  vec2 cq = vec2(0.0);
  bool found = false;
  for (int db = -2; db <= 1; db++) {
    for (int da = -6; da <= 1; da++) {
      float a = a0 + float(da), b = b0 + float(db);
      vec2 T = vec2(a + n * b, a - n * b);
      vec2 d = q - T;
      if (d.x >= 0.0 && d.x < n && d.y >= 0.0 && d.y < 1.0) {
        c.local = d * W; c.size = vec2(n, 1.0) * W;
        cq = T + vec2(0.5 * n, 0.5);
        c.axis = vec2(s, -s); c.kind = 0; found = true; break;
      }
      if (d.x >= n && d.x < n + 1.0 && d.y >= 1.0 - n && d.y < 1.0) {
        c.local = vec2(d.y - (1.0 - n), d.x - n) * W; c.size = vec2(n, 1.0) * W;
        cq = T + vec2(n + 0.5, 1.0 - 0.5 * n);
        c.axis = vec2(s, s); c.kind = 1; found = true; break;
      }
    }
    if (found) break;
  }
  // back to tile space: p = R(-45°) q
  vec2 cp = vec2(s * (cq.x + cq.y), s * (cq.y - cq.x)) * W;
  c.center = cp / u_tileSize;
  finishCell(c, seed);
  return c;
}

/** Tile size (meters, square) for herringboneLayout with `repeats` pattern periods. */
float herringboneTile(float W, float n, float repeats) { return repeats * n * 1.41421356 * W; }
