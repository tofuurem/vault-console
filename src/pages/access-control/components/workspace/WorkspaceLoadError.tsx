import Button from '@/components/base/Button';

interface WorkspaceLoadErrorProps {
  readonly message: string;
  readonly onRetry: () => void;
  readonly onBack: () => void;
}

export default function WorkspaceLoadError({
  message,
  onRetry,
  onBack,
}: WorkspaceLoadErrorProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-5 text-center">
      <p role="alert" className="text-sm font-semibold text-warning-900">
        {message}
      </p>
      <div className="mt-3 flex gap-2">
        <Button type="button" size="sm" onClick={onRetry}>Retry</Button>
        <Button type="button" size="sm" onClick={onBack}>Back</Button>
      </div>
    </div>
  );
}
