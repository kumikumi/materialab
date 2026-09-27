import { defineMaterial } from '../../engine/types';
import base from './brick-house';

/** brick-house with decades of soot, rain streaks and salt bloom (same bricks, for blending). */
export default defineMaterial({
  ...base,
  id: 'brick-house-grimy',
  name: 'House brick, grimy',
  description: 'The brick-house wall after decades of soot, runoff streaks and efflorescence; same seed and layout for vertex blending.',
  params: {
    ...base.params,
    mortarColor: '#857c70',
    soot: 0.9,
    streaks: 0.85,
    efflorescence: 0.3,
    speckle: 0.6,
  },
});
