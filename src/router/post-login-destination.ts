export function postLoginDestination(state: unknown): string {
  const from = typeof state === 'object' && state !== null && 'from' in state
    ? (state as { readonly from?: unknown }).from
    : undefined;
  if (
    typeof from !== 'string'
    || !from.startsWith('/')
    || from.startsWith('//')
    || from.includes('\\')
  ) {
    return '/explorer';
  }
  return from;
}
