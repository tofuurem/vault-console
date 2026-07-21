const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SPECIAL = '!@#$%&*_-+=';
const ALL_CHARACTERS = `${UPPERCASE}${LOWERCASE}${DIGITS}${SPECIAL}`;

function secureRandomIndex(maxExclusive: number): number {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Secure password generation is unavailable in this browser.');
  }
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
    throw new Error('Password character set must not be empty.');
  }

  const range = 0x1_0000_0000;
  const unbiasedLimit = Math.floor(range / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(buffer);
  } while (buffer[0] >= unbiasedLimit);
  return buffer[0] % maxExclusive;
}

function characterFrom(characters: string): string {
  return characters[secureRandomIndex(characters.length)];
}

export function generateSecurePassword(length = 24): string {
  if (!Number.isInteger(length) || length < 16 || length > 128) {
    throw new Error('Password length must be between 16 and 128 characters.');
  }

  const result = [
    characterFrom(UPPERCASE),
    characterFrom(LOWERCASE),
    characterFrom(DIGITS),
    characterFrom(SPECIAL),
  ];
  while (result.length < length) result.push(characterFrom(ALL_CHARACTERS));

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = secureRandomIndex(index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result.join('');
}

export interface PasswordAssessment {
  readonly score: number;
  readonly label: 'Weak' | 'Fair' | 'Good' | 'Strong' | 'Excellent';
}

export function assessPassword(password: string): PasswordAssessment {
  let score = 0;
  if (password.length >= 16) score += 1;
  if (password.length >= 24) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[!@#$%&*_\-+=]/.test(password)) score += 1;
  if (new Set(password).size >= Math.min(14, password.length)) score += 1;

  if (score >= 6) return { score, label: 'Excellent' };
  if (score === 5) return { score, label: 'Strong' };
  if (score === 4) return { score, label: 'Good' };
  if (score === 3) return { score, label: 'Fair' };
  return { score, label: 'Weak' };
}
