import { defineMaterial } from '../../engine/types';
import { flagstoneGenerator } from '../../generators/flagstone';

export default defineMaterial({
  id: 'slate-flagstone',
  name: 'Slate crazy paving',
  category: 'Stone',
  description: 'Irregular cleft-slate slabs in mortar: terraced cleavage faces, blue/green/rust tones, chipped edges.',
  generator: flagstoneGenerator,
  seed: 3,
  params: {
    cleft: 3,
    layers: 6,
    colorA: '#4a4d51',
    colorB: '#4c4e49',
    colorC: '#564d47',
    rustiness: 0.3,
    mortarColor: '#7d766c',
  },
});
