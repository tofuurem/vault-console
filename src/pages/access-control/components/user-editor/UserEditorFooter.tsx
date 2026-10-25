import Button from '@/components/base/Button';

interface UserEditorFooterProps {
  readonly dirty: boolean;
  readonly operationCount: number;
  readonly showBack: boolean;
  readonly reviewing: boolean;
  readonly applying: boolean;
  readonly canApply: boolean;
  readonly onBack: () => void;
  readonly onContinue: () => void;
  readonly onApply: () => void;
}

export default function UserEditorFooter({
  dirty,
  operationCount,
  showBack,
  reviewing,
  applying,
  canApply,
  onBack,
  onContinue,
  onApply,
}: UserEditorFooterProps) {
  return (
    <>
      <span className="hidden font-mono text-[10px] text-foreground-400 sm:block">
        {dirty ? `${operationCount} staged Vault changes` : 'No draft changes'}
      </span>
      <div className="ml-auto flex items-center gap-2">
        {showBack && (
          <Button
            type="button"
            size="sm"
            onClick={onBack}
          >
            <i className="ri-arrow-left-line" aria-hidden="true" /> Back
          </Button>
        )}
        {!reviewing ? (
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onContinue}
          >
            Continue <i className="ri-arrow-right-line" aria-hidden="true" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            size="sm"
            loading={applying}
            disabled={!canApply}
            onClick={onApply}
          >
            Apply {operationCount} change{operationCount === 1 ? '' : 's'}
          </Button>
        )}
      </div>
    </>
  );
}
