import { defineMaterial } from '../../engine/types';
import { rustedPaintGenerator } from '../../generators/rusted-paint';

export default defineMaterial({
  id: 'steel-rusted-paint',
  name: 'Rusting painted steel',
  category: 'Metal',
  description: 'Green industrial paint on steel, sun-faded, blistering and flaking, with rust breaking through and streaking.',
  generator: rustedPaintGenerator,
  seed: 7,
  previewScale: 0.6,
  params: {},
});
