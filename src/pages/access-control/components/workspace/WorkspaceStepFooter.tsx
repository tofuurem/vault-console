import type { ReactNode } from 'react';

import Button from '@/components/base/Button';

interface WorkspaceStepFooterProps {
  readonly summary: ReactNode;
  readonly stepIndex: number;
  readonly reviewing: boolean;
  readonly continueDisabled: boolean;
  readonly onBack: () => void;
  readonly onContinue: () => void;
  readonly applyLabel: string;
  readonly applying: boolean;
  readonly canApply: boolean;
  readonly onApply: () => Promise<void>;
}

export default function WorkspaceStepFooter({
  summary,
  stepIndex,
  reviewing,
  continueDisabled,
  onBack,
  onContinue,
  applyLabel,
  applying,
  canApply,
  onApply,
}: WorkspaceStepFooterProps) {
  return (
    <>
      <span className="hidden font-mono text-[10px] text-foreground-400 sm:block">
        {summary}
      </span>
      <div className="ml-auto flex items-center gap-2">
        {stepIndex > 0 && (
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
            size="sm"
            variant="primary"
            disabled={continueDisabled}
            onClick={onContinue}
          >
            Continue <i className="ri-arrow-right-line" aria-hidden="true" />
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="primary"
            loading={applying}
            disabled={!canApply}
            onClick={() => { void onApply(); }}
          >
            {applyLabel}
          </Button>
        )}
      </div>
    </>
  );
}
