import { defineMaterial } from '../../engine/types';
import { brickGenerator } from '../../generators/brick';

/**
 * Old red-brown facing brick for a town house. brick-house-grimy and brick-house-mossy are
 * weathering variants with the same seed and layout, so a game shader (or polylab's vertex
 * paint blending) can mix the three without the bricks shifting.
 */
export default defineMaterial({
  id: 'brick-house',
  name: 'House brick, running bond',
  category: 'Masonry',
  description: 'Hand-set red-brown bricks with dark clinkers and kiln flashing in light grey lime mortar; the clean base of a vertex-blend set.',
  generator: brickGenerator,
  seed: 21,
  params: {
    bond: 0,
    brickLength: 215,
    brickHeight: 65,
    mortar: 10,
    bricksPerRow: 8,
    courses: 24, // a 1.8 m tile: repetition stays invisible across a whole facade
    cornerRadius: 3,
    edgeRound: 5,
    edgeWear: 3,
    chips: 0.4,
    chipDepth: 4,
    bulge: 0.9,
    tilt: 1.1,
    sandRelief: 0.45,
    pits: 0.4,
    colorA: '#8c4634',
    colorB: '#a3573c',
    colorC: '#6f3a2e',
    colorVar: 1.3,
    darkBricks: 0.16,
    darkColor: '#432822',
    flashing: 0.55,
    mottle: 0.16,
    speckle: 0.45,
    sandFacing: 0.25,
    mortarColor: '#a59d90',
    mortarDepth: 5,
    mortarProfile: 1,
    mortarGrain: 0.7,
    soot: 0.12,
    efflorescence: 0.06,
    streaks: 0.08,
    aoRadius: 25,
  },
});
