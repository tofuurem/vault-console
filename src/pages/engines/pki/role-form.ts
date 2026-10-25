import type { PkiRoleInput, PkiRoleKeyType } from '@/domain/engines/pki/pki';
import { EMPTY_ROLE_INPUT, joinList, roleNameError, splitList, ttlError } from '@/domain/engines/pki/pki-helpers';

/** Role form values; list fields are edited as comma- or newline-separated text. */
export interface RoleFormState extends Omit<PkiRoleInput, 'allowedDomains' | 'extKeyUsage' | 'organization' | 'ou'> {
  readonly name: string;
  readonly allowedDomains: string;
  readonly extKeyUsage: string;
  readonly organization: string;
  readonly ou: string;
}

export function roleFormState(name: string, input: PkiRoleInput = EMPTY_ROLE_INPUT): RoleFormState {
  return {
    ...input,
    name,
    allowedDomains: input.allowedDomains.join('\n'),
    extKeyUsage: joinList(input.extKeyUsage),
    organization: joinList(input.organization),
    ou: joinList(input.ou),
  };
}

export function roleInput(form: RoleFormState): PkiRoleInput {
  const { name: _name, ...rest } = form;
  return {
    ...rest,
    allowedDomains: splitList(form.allowedDomains),
    extKeyUsage: splitList(form.extKeyUsage),
    organization: splitList(form.organization),
    ou: splitList(form.ou),
  };
}

export type RoleFormErrors = Partial<Record<'name' | 'ttl' | 'maxTtl' | 'allowedDomains', string>>;

export function roleFormErrors(form: RoleFormState, mode: 'create' | 'update', existing: readonly string[]): RoleFormErrors {
  const errors: RoleFormErrors = {
    name: mode === 'create' ? roleNameError(form.name, existing) : undefined,
    ttl: ttlError(form.ttl),
    maxTtl: ttlError(form.maxTtl),
    allowedDomains: !form.allowAnyName && splitList(form.allowedDomains).length === 0 && !form.allowLocalhost && !form.allowIpSans
      ? 'Add a domain, or allow any name.'
      : undefined,
  };
  return Object.fromEntries(Object.entries(errors).filter(([, value]) => value)) as RoleFormErrors;
}

export const ROLE_KEY_TYPES: readonly { readonly value: PkiRoleKeyType; readonly label: string }[] = [
  { value: 'rsa', label: 'RSA' },
  { value: 'ec', label: 'EC (ECDSA)' },
  { value: 'ed25519', label: 'Ed25519' },
  { value: 'any', label: 'Any (signing CSRs only)' },
];
