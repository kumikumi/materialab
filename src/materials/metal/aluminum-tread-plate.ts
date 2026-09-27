import { defineMaterial } from '../../engine/types';
import { treadPlateGenerator } from '../../generators/tread-plate';

export default defineMaterial({
  id: 'aluminum-tread-plate',
  name: 'Aluminium tread plate',
  category: 'Metal',
  description: 'Diamond (tread) plate with raised lugs, mill-finish streaks, polished lug tops and dirt around the bases.',
  generator: treadPlateGenerator,
  seed: 6,
  previewScale: 0.5,
  params: {},
});
