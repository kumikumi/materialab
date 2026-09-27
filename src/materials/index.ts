import type { Category, MaterialDef } from '../engine/types';

/*
 * Every .ts file under src/materials (except this one) default-exports a
 * MaterialDef. New files are picked up automatically, and edits hot-reload.
 */
const modules = import.meta.glob<{ default: MaterialDef }>(['./**/*.ts', '!./index.ts'], { eager: true });

export const CATEGORY_ORDER: Category[] = ['Wood', 'Masonry', 'Concrete', 'Stone', 'Metal'];

export const materials: MaterialDef[] = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, m]) => m.default)
  .filter((m): m is MaterialDef => !!m && !!m.id)
  .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));

if (import.meta.hot) {
  import.meta.hot.accept();
  window.dispatchEvent(new CustomEvent('materialab:materials-updated', { detail: materials }));
}
