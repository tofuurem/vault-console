import { PKI_DEFAULT_KEY_BITS, type PkiKeyExport, type PkiKeyType } from '@/domain/engines/pki/pki';
import { ipListError, issuerNameError, requiredError, ttlError } from '@/domain/engines/pki/pki-helpers';

export interface CaFormState {
  readonly exportKey: PkiKeyExport;
  readonly commonName: string;
  readonly issuerName: string;
  readonly keyName: string;
  readonly keyType: PkiKeyType;
  readonly keyBits: number;
  readonly ttl: string;
  readonly maxPathLength: string;
  readonly organization: string;
  readonly ou: string;
  readonly country: string;
  readonly locality: string;
  readonly province: string;
  readonly altNames: string;
  readonly ipSans: string;
}

export const EMPTY_CA_FORM: CaFormState = {
  exportKey: 'internal',
  commonName: '',
  issuerName: '',
  keyName: '',
  keyType: 'ec',
  keyBits: PKI_DEFAULT_KEY_BITS.ec,
  ttl: '87600h',
  maxPathLength: '',
  organization: '',
  ou: '',
  country: '',
  locality: '',
  province: '',
  altNames: '',
  ipSans: '',
};

export type CaFormErrors = Partial<Record<keyof CaFormState, string>>;

export function caFormErrors(form: CaFormState): CaFormErrors {
  const pathLength = form.maxPathLength.trim();
  const errors: CaFormErrors = {
    commonName: requiredError(form.commonName, 'a common name'),
    issuerName: issuerNameError(form.issuerName),
    keyName: issuerNameError(form.keyName),
    ttl: ttlError(form.ttl),
    maxPathLength: pathLength && !/^(-1|\d{1,2})$/.test(pathLength) ? 'Use a whole number, or leave empty for no limit.' : undefined,
    ipSans: ipListError(form.ipSans),
  };
  return Object.fromEntries(Object.entries(errors).filter(([, value]) => value)) as CaFormErrors;
}

export function pathLengthValue(value: string): number | undefined {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : undefined;
}

export function caSubject(form: CaFormState) {
  return {
    commonName: form.commonName,
    keyType: form.keyType,
    keyBits: form.keyBits,
    keyName: form.keyName,
    organization: form.organization,
    ou: form.ou,
    country: form.country,
    locality: form.locality,
    province: form.province,
    altNames: form.altNames,
    ipSans: form.ipSans,
  };
}
