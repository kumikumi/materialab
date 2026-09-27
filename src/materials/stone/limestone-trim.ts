import { defineMaterial } from '../../engine/types';
import { concreteGenerator } from '../../generators/concrete';

/** Dressed limestone for lintels, sills, keystones and cornices (cast-stone look, no formwork). */
export default defineMaterial({
  id: 'limestone-trim',
  name: 'Limestone trim',
  category: 'Stone',
  description: 'Buff dressed limestone: fine sandy grain, soft mottling, a few voids, weather stains and runoff streaks.',
  generator: concreteGenerator,
  seed: 17,
  params: {
    color: '#b3a58a',
    mottle: 0.55,
    mottleScale: 0.12,
    sand: 0.65,
    relief: 0.35,
    waviness: 0.8,
    aggregate: 0,
    bugholes: 0.6,
    bugholeSize: 2.5,
    roughness: 0.85,
    formwork: 0,
    panelWidth: 1,
    panelHeight: 1,
    panelsX: 1,
    panelsY: 1,
    stains: 0.45,
    streaks: 0.35,
    efflorescence: 0.05,
    cracks: 0.12,
  },
});
