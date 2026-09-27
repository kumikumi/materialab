import { defineMaterial } from '../../engine/types';
import { paintedConcreteGenerator } from '../../generators/painted-concrete';

export default defineMaterial({
  id: 'concrete-painted-glossy',
  name: 'Painted concrete, glossy',
  category: 'Concrete',
  description: 'Epoxy-painted garage/warehouse floor: high gloss with orange peel, chipped to bare concrete, scuffs, scratches, saw cuts.',
  generator: paintedConcreteGenerator,
  seed: 3,
  params: {
    paintColor: '#4d6c79',
    paintRoughness: 0.08,
    chips: 0.3,
    traffic: 0.5,
    scratches: 0.5,
    scuffs: 0.35,
    dirt: 0.3,
    cracks: 0.25,
  },
});
