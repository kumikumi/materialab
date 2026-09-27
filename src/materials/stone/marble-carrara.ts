import { defineMaterial } from '../../engine/types';
import { marbleGenerator } from '../../generators/marble';

export default defineMaterial({
  id: 'marble-carrara',
  name: 'Carrara marble tiles',
  category: 'Stone',
  description: 'Polished white Carrara marble, 60×60 cm tiles with soft grey veining and a hairline grout joint.',
  generator: marbleGenerator,
  seed: 2,
  params: {},
});
