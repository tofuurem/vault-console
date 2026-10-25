import { describe, expect, it } from 'vitest';

import { databaseSubPath, parseDatabaseRoute, routeName } from './database-route';

describe('database routes', () => {
  it('parses sections, items, edit, and create paths', () => {
    expect(parseDatabaseRoute('')).toEqual({ section: 'config', mode: 'list' });
    expect(parseDatabaseRoute('unknown/thing')).toEqual({ section: 'config', mode: 'list' });
    expect(parseDatabaseRoute('roles')).toEqual({ section: 'roles', mode: 'list' });
    expect(parseDatabaseRoute('roles/web')).toEqual({ section: 'roles', mode: 'view', name: 'web' });
    expect(parseDatabaseRoute('static-roles/app/edit')).toEqual({ section: 'static-roles', mode: 'edit', name: 'app' });
    expect(parseDatabaseRoute('config/~new')).toEqual({ section: 'config', mode: 'create' });
    expect(parseDatabaseRoute('roles/~new/pg')).toEqual({ section: 'roles', mode: 'create', connection: 'pg' });
    expect(parseDatabaseRoute('roles/bad name')).toEqual({ section: 'roles', mode: 'list' });
  });

  it('round-trips every route', () => {
    for (const path of ['config', 'roles/web', 'static-roles/app/edit', 'config/~new', 'roles/~new/pg']) {
      expect(databaseSubPath(parseDatabaseRoute(path))).toBe(path);
    }
    expect(routeName(parseDatabaseRoute('roles/web/edit'))).toBe('web');
    expect(routeName(parseDatabaseRoute('roles/~new'))).toBeUndefined();
  });
});
