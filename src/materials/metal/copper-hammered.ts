import { defineMaterial } from '../../engine/types';
import { metalGenerator } from '../../generators/metal';

export default defineMaterial({
  id: 'copper-hammered',
  name: 'Hammered copper',
  category: 'Metal',
  description: 'Hand-hammered copper sheet: overlapping dents, warm tarnish and a little verdigris in the hollows.',
  generator: metalGenerator,
  seed: 4,
  previewScale: 0.35,
  params: {
    tile: 0.5,
    metalColor: '#eeb49a',
    roughness: 0.24,
    toneVar: 0.08,
    anisotropy: 0,
    brush: 0.25,
    brushLength: 0.05,
    brushWidth: 0.4,
    hammer: 1,
    hammerSize: 13,
    hammerDepth: 0.4,
    scratches: 0.25,
    smudges: 0.2,
    tarnish: 0.35,
    tarnishColor: '#7a4634',
    patina: 0.12,
  },
});
