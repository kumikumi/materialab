import { defineMaterial } from '../../engine/types';
import base from './brick-house';

/** brick-house overgrown with moss in the joints and damp patches (same bricks, for blending). */
export default defineMaterial({
  ...base,
  id: 'brick-house-mossy',
  name: 'House brick, mossy',
  description: 'The brick-house wall where it stays damp: moss cushions in the joints spreading over the faces, some soot; same seed and layout for vertex blending.',
  params: {
    ...base.params,
    mortarColor: '#8e877a',
    soot: 0.35,
    streaks: 0.3,
    efflorescence: 0.12,
    moss: 0.72,
    mossColor: '#48581f',
    mossTips: '#7a8237',
    mossHeight: 3,
  },
});
