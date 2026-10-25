export type SshTab = 'ca' | 'roles' | 'sign' | 'otp';

export interface SshRoute {
  readonly tab: SshTab;
  /** Selected role on the Roles tab, or the preselected role on Sign key and OTP. */
  readonly role?: string;
}

const TABS: readonly SshTab[] = ['ca', 'roles', 'sign', 'otp'];

function isTab(value: string | undefined): value is SshTab {
  return (TABS as readonly (string | undefined)[]).includes(value);
}

/**
 * URL layout below the mount: `ca`, `roles[/<name>]`, `sign[/<role>]`, `otp[/<role>]`.
 * Only role names ever reach the URL; keys, certificates, and OTPs stay in component state.
 */
export function parseSshRoute(subPath: string): SshRoute {
  const [root, role] = subPath.split('/').filter(Boolean);
  if (!isTab(root) || root === 'ca') return { tab: 'ca' };
  return role ? { tab: root, role } : { tab: root };
}

export function sshRoutePath(route: SshRoute): string {
  if (route.tab === 'ca') return 'ca';
  return route.role ? `${route.tab}/${route.role}` : route.tab;
}
