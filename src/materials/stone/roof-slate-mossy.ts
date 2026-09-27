import { defineMaterial } from '../../engine/types';
import base from './roof-slate';

/** roof-slate with moss along the joints and cushions on the slates (same slates, for blending). */
export default defineMaterial({
  ...base,
  id: 'roof-slate-mossy',
  name: 'Slate roof, mossy',
  description: 'The slate roof where it stays damp: moss in the joints and cushions on the butts; same seed and layout for vertex blending.',
  params: {
    ...base.params,
    moss: 0.78, // the fully mossy end of the blend
    mossColor: '#434d24',
    mossTips: '#767a42',
    mossHeight: 4,
    soot: 0.35,
  },
});
