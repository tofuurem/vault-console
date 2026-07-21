export interface AccountDraft {
  readonly username: string;
  readonly displayName: string;
  readonly userpassMount: string;
  readonly password: string;
}

export interface AccountValidation {
  username?: string;
  userpassMount?: string;
  password?: string;
}

export function validateAccount(account: AccountDraft): AccountValidation {
  const errors: AccountValidation = {};
  const username = account.username.trim();
  const mount = account.userpassMount.replace(/^\/+|\/+$/g, '');

  if (!username) errors.username = 'Enter a username.';
  else if (!/^[a-z0-9_.-]+$/.test(username)) {
    errors.username = 'Use lowercase letters, numbers, dots, underscores, or hyphens.';
  } else if (username.startsWith('-') || username.startsWith('.') || username.endsWith('.')) {
    errors.username = 'Username cannot start with a hyphen or dot, or end with a dot.';
  }

  if (!mount) errors.userpassMount = 'Choose a userpass mount.';
  else if (mount.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    errors.userpassMount = 'Enter a valid Vault mount path.';
  }

  if (account.password.length < 16) errors.password = 'Use at least 16 characters.';
  return errors;
}
