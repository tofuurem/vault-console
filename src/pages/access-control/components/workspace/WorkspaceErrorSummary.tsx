import {
  useEffect,
  useRef,
} from 'react';

export interface WorkspaceValidationError {
  readonly id: string;
  readonly message: string;
  readonly step: string;
  readonly fieldId?: string;
}

interface WorkspaceErrorSummaryProps {
  readonly errors: readonly WorkspaceValidationError[];
  readonly onNavigate: (step: string, fieldId?: string) => void;
}

export default function WorkspaceErrorSummary({
  errors,
  onNavigate,
}: WorkspaceErrorSummaryProps) {
  const ref = useRef<HTMLDivElement>(null);
  const hadErrors = useRef(false);

  useEffect(() => {
    const hasErrors = errors.length > 0;
    if (hasErrors && !hadErrors.current) ref.current?.focus();
    hadErrors.current = hasErrors;
  }, [errors.length]);

  if (errors.length === 0) return null;
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="mb-5 rounded-lg border border-danger-300 bg-danger-50 p-3 text-danger-900 outline-none focus:ring-2 focus:ring-danger-300"
    >
      <p className="text-xs font-semibold">
        Resolve {errors.length} issue{errors.length === 1 ? '' : 's'} before Review
      </p>
      <ul className="mt-1.5 space-y-1">
        {errors.map((error) => (
          <li key={error.id}>
            <button
              type="button"
              onClick={() => onNavigate(error.step, error.fieldId)}
              className="text-left text-[10px] leading-4 underline decoration-danger-300 underline-offset-2 hover:decoration-danger-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-400"
            >
              {error.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
