import { defineMaterial } from '../../engine/types';
import { metalGenerator } from '../../generators/metal';

export default defineMaterial({
  id: 'steel-galvanized',
  name: 'Galvanized steel',
  category: 'Metal',
  description: 'Hot-dip galvanized sheet with a zinc spangle pattern, patches of white rust and handling scratches.',
  generator: metalGenerator,
  seed: 5,
  previewScale: 0.5,
  params: {
    tile: 0.6,
    metalColor: '#c9cdd0',
    roughness: 0.3,
    toneVar: 0.05,
    anisotropy: 0,
    brush: 0,
    spangle: 1,
    spangleSize: 32,
    whiteRust: 0.25,
    scratches: 0.3,
    smudges: 0.1,
    dents: 0.1,
  },
});
