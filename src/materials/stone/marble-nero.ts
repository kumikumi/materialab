import { defineMaterial } from '../../engine/types';
import { marbleGenerator } from '../../generators/marble';

export default defineMaterial({
  id: 'marble-nero',
  name: 'Nero Marquina marble',
  category: 'Stone',
  description: 'Black marble with crisp white calcite veins, polished 60×60 cm tiles (enable Bookmatched for mirrored slabs).',
  generator: marbleGenerator,
  seed: 5,
  params: {
    baseColor: '#1b1b1d',
    cloudColor: '#2a2a2d',
    veinColor: '#e4e2dc',
    accentColor: '#8c8a86',
    veinScale: 0.45,
    veinDirection: -25,
    veinStretch: 2.4,
    veinWidth: 0.014,
    veinAmount: 1,
    warp: 0.6,
    clouds: 0.35,
    accent: 0.4,
    sparkle: 0.2,
    bookmatch: false,
    groutColor: '#262628',
    roughness: 0.05,
  },
});
