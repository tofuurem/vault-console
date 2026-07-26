import { describe, expect, it } from 'vitest';

import {
  assessPolicyOwnership,
  managedPolicyHeader,
  parseManagedPolicyHeader,
  renderManagedPolicy,
  USER_POLICY_PREFIX,
} from './policy-ownership';

const ROLE_BODY = `path "applications/data/payments/*" {
  capabilities = ["read"]
}`;

describe('managed ACL policy ownership', () => {
  it('renders and parses canonical role ownership metadata', () => {
    const header = managedPolicyHeader({
      kind: 'role',
      description: 'Payments readers',
    });

    expect(header).toBe(
      '# vault-console: {"schema":1,"kind":"role","description":"Payments readers"}',
    );
    expect(parseManagedPolicyHeader(header)).toEqual({
      schema: 1,
      kind: 'role',
      description: 'Payments readers',
    });
  });

  it('renders and parses canonical per-user ownership metadata', () => {
    const policy = renderManagedPolicy({
      kind: 'user-direct',
      owner: 'alice',
    }, ROLE_BODY);

    expect(policy).toBe(
      `# vault-console: {"schema":1,"kind":"user-direct","owner":"alice"}\n\n${ROLE_BODY}`,
    );
    expect(parseManagedPolicyHeader(policy)).toEqual({
      schema: 1,
      kind: 'user-direct',
      owner: 'alice',
    });
  });

  it('rejects malformed, unsupported, or ambiguous ownership headers', () => {
    expect(parseManagedPolicyHeader('# vault-console: not-json')).toBeNull();
    expect(parseManagedPolicyHeader(
      '# vault-console: {"schema":2,"kind":"role"}',
    )).toBeNull();
    expect(parseManagedPolicyHeader(
      '# vault-console: {"schema":1,"kind":"user-direct"}',
    )).toBeNull();
    expect(parseManagedPolicyHeader(
      '# vault-console: {"schema":1,"kind":"role","owner":"alice"}',
    )).toBeNull();
    expect(parseManagedPolicyHeader(
      '# vault-console: {"schema":1,"kind":"role","unknown":true}',
    )).toBeNull();
  });

  it('requires both the reserved name and a matching header for managed ownership', () => {
    expect(assessPolicyOwnership(
      'vc-role-payments-readers',
      renderManagedPolicy({ kind: 'role', description: 'Readers' }, ROLE_BODY),
    )).toMatchObject({
      state: 'managed',
      kind: 'role',
      editable: true,
    });

    expect(assessPolicyOwnership('vc-role-payments-readers', ROLE_BODY)).toMatchObject({
      state: 'unverified',
      kind: 'role',
      editable: true,
    });

    expect(assessPolicyOwnership(
      'legacy-payments',
      renderManagedPolicy({ kind: 'role' }, ROLE_BODY),
    )).toMatchObject({
      state: 'external',
      kind: 'external',
      editable: false,
    });

    expect(assessPolicyOwnership(
      `${USER_POLICY_PREFIX}alice`,
      renderManagedPolicy({ kind: 'role' }, ROLE_BODY),
    )).toMatchObject({
      state: 'unverified',
      kind: 'user-direct',
      editable: true,
    });
  });

  it('marks reserved policies with unsupported HCL as non-editable', () => {
    expect(assessPolicyOwnership(
      'vc-role-dynamic',
      '# vault-console: {"schema":1,"kind":"role"}\n\npath "secret/*" { capabilities = ["read"] }\nallowed_parameters = {"x" = []}',
    )).toMatchObject({
      state: 'managed',
      kind: 'role',
      editable: false,
    });
  });
});
