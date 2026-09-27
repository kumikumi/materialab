import { defineMaterial } from '../../engine/types';
import { cobblestoneGenerator } from '../../generators/cobblestone';

export default defineMaterial({
  id: 'cobblestone-granite',
  name: 'Granite setts',
  category: 'Stone',
  description: 'Old-town granite cobbles in courses: split faces, traffic-polished tops, sandy joints with pebbles and moss.',
  generator: cobblestoneGenerator,
  seed: 4,
  params: {
    minPerRow: 8,
    maxPerRow: 11,
    joint: 14,
    irregularity: 11,
    cornerRadius: 20,
    dome: 5,
    tilt: 3.5,
    stoneA: '#8a8987',
    stoneB: '#8f8681',
    stoneC: '#69696c',
    jointColor: '#554b40',
  },
});
