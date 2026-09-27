import { defineMaterial } from '../../engine/types';
import { metalGenerator } from '../../generators/metal';

export default defineMaterial({
  id: 'aluminum-brushed',
  name: 'Brushed aluminium',
  category: 'Metal',
  description: 'Linear-brushed aluminium sheet: anisotropic highlights, fine streaks, light handling marks.',
  generator: metalGenerator,
  seed: 1,
  previewScale: 0.35,
  params: {
    tile: 0.5,
    metalColor: '#e2e4e6',
    roughness: 0.26,
    toneVar: 0.03,
    anisotropy: 0.55,
    brush: 1,
    brushLength: 0.15,
    brushWidth: 0.22,
    brushRough: 0.12,
    brushDepth: 0.012,
    brushWave: 0.2,
    scratches: 0.25,
    scratchDir: 0.15,
    smudges: 0.2,
    dents: 0.05,
  },
});
