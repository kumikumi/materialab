import { defineMaterial } from '../../engine/types';
import { metalGenerator } from '../../generators/metal';

export default defineMaterial({
  id: 'steel-stainless-brushed',
  name: 'Brushed stainless steel',
  category: 'Metal',
  description: 'No. 4 finish stainless: very fine directional grain, darker and more neutral than aluminium, fingerprints.',
  generator: metalGenerator,
  seed: 2,
  previewScale: 0.35,
  params: {
    tile: 0.4,
    metalColor: '#c6c8ca',
    roughness: 0.2,
    toneVar: 0.02,
    anisotropy: 0.65,
    brush: 1,
    brushLength: 0.1,
    brushWidth: 0.12,
    brushRough: 0.1,
    brushDepth: 0.008,
    brushWave: 0.05,
    scratches: 0.2,
    scratchDir: 0.3,
    smudges: 0.35,
    dents: 0.02,
  },
});
