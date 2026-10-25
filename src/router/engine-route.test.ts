import { describe, expect, it } from 'vitest';

import { engineRoute, resolveEngineRoute } from './engine-route';

describe('engine routes', () => {
  it('builds encoded engine URLs', () => {
    expect(engineRoute('pki/int', 'roles/web server')).toBe('/engines/pki/int/roles/web%20server');
    expect(engineRoute('db')).toBe('/engines/db');
  });

  it('matches the longest mount and keeps the rest as the sub-path', () => {
    const mounts = ['pki', 'pki/int', 'db'];
    expect(resolveEngineRoute('pki/int/roles/web', mounts)).toEqual({ mount: 'pki/int', subPath: 'roles/web' });
    expect(resolveEngineRoute('pki/issuers', mounts)).toEqual({ mount: 'pki', subPath: 'issuers' });
    expect(resolveEngineRoute('db', mounts)).toEqual({ mount: 'db', subPath: '' });
    expect(resolveEngineRoute('missing/x', mounts)).toBeUndefined();
  });
});
