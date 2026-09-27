import { defineMaterial } from '../../engine/types';
import { brickGenerator } from '../../generators/brick';

export default defineMaterial({
  id: 'brick-red',
  name: 'Red brick, running bond',
  category: 'Masonry',
  description: 'Machine-made red facing bricks in stretcher bond with recessed, tooled light-grey mortar.',
  generator: brickGenerator,
  seed: 2,
  params: {
    pits: 0.3,
    bond: 0,
    bricksPerRow: 4,
    courses: 12,
    colorA: '#904a37',
    colorB: '#a65a40',
    colorC: '#7b4033',
    darkBricks: 0.06,
    flashing: 0.35,
    chips: 0.25,
    edgeWear: 2,
    mortarDepth: 5,
    mortarProfile: 1,
    soot: 0.1,
    efflorescence: 0.05,
    aoRadius: 25,
  },
});
