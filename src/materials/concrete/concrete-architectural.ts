import { defineMaterial } from '../../engine/types';
import { concreteGenerator } from '../../generators/concrete';

export default defineMaterial({
  id: 'concrete-architectural',
  name: 'Architectural concrete',
  category: 'Concrete',
  description: 'Smooth fair-faced concrete cast against 90×180 cm panels: tie-hole cones, panel seams, bugholes, faint rust streaks.',
  generator: concreteGenerator,
  seed: 1,
  params: {
    color: '#9b9a96',
    mottle: 0.22,
    mottleScale: 0.05,
    sand: 0.45,
    relief: 0.12,
    waviness: 0.5,
    bugholes: 0.7,
    bugholeSize: 3.5,
    roughness: 0.72,
    formwork: 1,
    panelWidth: 0.9,
    panelHeight: 1.8,
    panelsX: 2,
    panelsY: 1,
    tiesX: 2,
    tiesY: 3,
    stains: 0.25,
    streaks: 0.25,
    cracks: 0.05,
    aoRadius: 30,
  },
});
