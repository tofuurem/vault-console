import ContentSkeleton from '@/components/base/ContentSkeleton';
import type { VaultError } from '@/domain/vault/errors';

export function ResourceLoading({ label }: { readonly label: string }) {
  return <ContentSkeleton label={label} variant="workspace" />;
}

export function ResourceError({
  error,
  retry,
}: {
  readonly error: VaultError;
  readonly retry: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div role="alert" className="max-w-md rounded-md border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
        <p className="font-semibold">This access-control resource could not be loaded</p>
        <p className="mt-1 text-xs leading-5">{error.message}</p>
        <button type="button" onClick={retry} className="mt-2 text-xs font-medium underline">Retry</button>
      </div>
    </div>
  );
}
