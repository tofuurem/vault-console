import type { AccessPolicyRule } from './effective-access';
import type { VaultCapability } from './types';

export {
  ROLE_POLICY_PREFIX,
  USER_POLICY_PREFIX,
} from './policy-ownership';
import {
  ROLE_POLICY_PREFIX,
  USER_POLICY_PREFIX,
} from './policy-ownership';

export type ManagedPolicyKind = 'role' | 'user-direct' | 'external';

export function classifyPolicyName(name: string): ManagedPolicyKind {
  if (name.startsWith(ROLE_POLICY_PREFIX)) return 'role';
  if (name.startsWith(USER_POLICY_PREFIX)) return 'user-direct';
  return 'external';
}

export function managedRoleName(policyName: string): string {
  const slug = policyName.replace(new RegExp(`^${ROLE_POLICY_PREFIX}`), '');
  return slug.split('-').filter(Boolean).map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

const SUPPORTED_CAPABILITIES = new Set<VaultCapability>([
  'create',
  'read',
  'update',
  'patch',
  'delete',
  'list',
  'sudo',
  'subscribe',
  'recover',
  'deny',
]);

class ManagedPolicyParser {
  private index = 0;
  private readonly input: string;

  constructor(input: string) {
    this.input = input;
  }

  parse(): readonly AccessPolicyRule[] | null {
    const rules: AccessPolicyRule[] = [];
    this.skipTrivia();
    while (!this.atEnd()) {
      const pattern = this.parsePathHeader();
      if (pattern === null) return null;
      const capabilities = this.parseCapabilitiesBlock();
      if (capabilities === null || capabilities.length === 0) return null;
      rules.push({ pattern, capabilities });
      this.skipTrivia();
    }
    return rules.length > 0 ? rules : null;
  }

  private parsePathHeader(): string | null {
    if (!this.consumeWord('path')) return null;
    this.skipTrivia();
    const pattern = this.consumeJsonString();
    if (pattern === null) return null;
    this.skipTrivia();
    return this.consume('{') ? pattern : null;
  }

  private parseCapabilitiesBlock(): readonly VaultCapability[] | null {
    this.skipTrivia();
    if (!this.consumeWord('capabilities')) return null;
    this.skipTrivia();
    if (!this.consume('=')) return null;
    this.skipTrivia();
    if (!this.consume('[')) return null;
    this.skipTrivia();

    const capabilities: VaultCapability[] = [];
    while (!this.peek(']')) {
      const capability = this.consumeJsonString();
      if (capability === null || !SUPPORTED_CAPABILITIES.has(capability as VaultCapability)) {
        return null;
      }
      capabilities.push(capability as VaultCapability);
      this.skipTrivia();
      if (this.peek(']')) break;
      if (!this.consume(',')) return null;
      this.skipTrivia();
    }
    if (!this.consume(']')) return null;
    this.skipTrivia();
    if (!this.consume('}')) return null;
    return [...new Set(capabilities)];
  }

  private skipTrivia(): void {
    while (!this.atEnd()) {
      const rest = this.input.slice(this.index);
      const whitespace = rest.match(/^\s+/);
      if (whitespace) {
        this.index += whitespace[0].length;
        continue;
      }
      if (rest.startsWith('#') || rest.startsWith('//')) {
        const newline = rest.indexOf('\n');
        this.index += newline === -1 ? rest.length : newline + 1;
        continue;
      }
      break;
    }
  }

  private consumeWord(word: string): boolean {
    if (!this.input.startsWith(word, this.index)) return false;
    const next = this.input[this.index + word.length];
    if (next && /[A-Za-z0-9_-]/.test(next)) return false;
    this.index += word.length;
    return true;
  }

  private consumeJsonString(): string | null {
    if (!this.peek('"')) return null;
    const start = this.index;
    this.index += 1;
    let escaped = false;
    while (!this.atEnd()) {
      const character = this.input[this.index];
      this.index += 1;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === '\\') {
        escaped = true;
        continue;
      }
      if (character === '"') {
        try {
          const parsed = JSON.parse(this.input.slice(start, this.index));
          return typeof parsed === 'string' ? parsed : null;
        } catch {
          return null;
        }
      }
      if (character === '\n' || character === '\r') return null;
    }
    return null;
  }

  private peek(value: string): boolean {
    return this.input.startsWith(value, this.index);
  }

  private consume(value: string): boolean {
    if (!this.peek(value)) return false;
    this.index += value.length;
    return true;
  }

  private atEnd(): boolean {
    return this.index >= this.input.length;
  }
}

export function parseManagedPolicyHcl(hcl: string): readonly AccessPolicyRule[] | null {
  return new ManagedPolicyParser(hcl).parse();
}
