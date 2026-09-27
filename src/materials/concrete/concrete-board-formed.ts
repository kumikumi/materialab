import { defineMaterial } from '../../engine/types';
import { concreteGenerator } from '../../generators/concrete';

export default defineMaterial({
  id: 'concrete-board-formed',
  name: 'Board-formed concrete',
  category: 'Concrete',
  description: 'Concrete cast against rough-sawn boards: the wood grain, knots and board seams are imprinted in the surface.',
  generator: concreteGenerator,
  seed: 6,
  params: {
    color: '#96938d',
    mottle: 0.55,
    relief: 0.2,
    waviness: 0.4,
    bugholes: 1.4,
    roughness: 0.82,
    formwork: 2,
    panelWidth: 1.2,
    panelHeight: 1.2,
    panelsX: 2,
    panelsY: 1,
    boardWidth: 0.1,
    boardGrain: 0.3,
    panelTone: 0.07,
    stains: 0.3,
    streaks: 0.15,
    cracks: 0.05,
  },
});
