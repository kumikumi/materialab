import { defineMaterial } from '../../engine/types';
import { metalGenerator } from '../../generators/metal';

export default defineMaterial({
  id: 'steel-polished-worn',
  name: 'Polished steel, worn',
  category: 'Metal',
  description: 'Mirror-polished steel after years of use: swirls of random scratches, dings and greasy fingerprints.',
  generator: metalGenerator,
  seed: 3,
  previewScale: 0.35,
  params: {
    tile: 0.4,
    metalColor: '#c4c7c9',
    roughness: 0.07,
    toneVar: 0.02,
    anisotropy: 0,
    brush: 0,
    scratches: 0.8,
    scratchDir: 1,
    smudges: 0.5,
    dents: 0.35,
  },
});
