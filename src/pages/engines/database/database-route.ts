import { isDatabaseName } from '@/domain/engines/database/database-validation';

/** Sections mirror the Vault API: `config/:name`, `roles/:name`, `static-roles/:name`. */
export type DatabaseSection = 'config' | 'roles' | 'static-roles';

export type DatabaseRoute =
  | { readonly section: DatabaseSection; readonly mode: 'list' }
  | { readonly section: DatabaseSection; readonly mode: 'create'; readonly connection?: string }
  | { readonly section: DatabaseSection; readonly mode: 'view' | 'edit'; readonly name: string };

const SECTIONS: readonly DatabaseSection[] = ['config', 'roles', 'static-roles'];
/** `~` is not allowed in Vault names, so this never collides with a real role. */
const CREATE_SEGMENT = '~new';

function isSection(value: string | undefined): value is DatabaseSection {
  return SECTIONS.includes(value as DatabaseSection);
}

export function parseDatabaseRoute(subPath: string): DatabaseRoute {
  const [first, second, third] = subPath.split('/').filter(Boolean);
  if (!isSection(first)) return { section: 'config', mode: 'list' };
  if (second === CREATE_SEGMENT) {
    return third && isDatabaseName(third)
      ? { section: first, mode: 'create', connection: third }
      : { section: first, mode: 'create' };
  }
  if (!second || !isDatabaseName(second)) return { section: first, mode: 'list' };
  return { section: first, mode: third === 'edit' ? 'edit' : 'view', name: second };
}

export function databaseSubPath(route: DatabaseRoute): string {
  if (route.mode === 'list') return route.section;
  if (route.mode === 'create') {
    return [route.section, CREATE_SEGMENT, route.connection].filter(Boolean).join('/');
  }
  return route.mode === 'edit' ? `${route.section}/${route.name}/edit` : `${route.section}/${route.name}`;
}

export function routeName(route: DatabaseRoute): string | undefined {
  return route.mode === 'view' || route.mode === 'edit' ? route.name : undefined;
}
