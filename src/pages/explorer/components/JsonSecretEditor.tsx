import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import type { SecretJsonLocation } from '@/domain/vault/secret-json';
import type { CodeMirrorJsonEditorHandle } from './CodeMirrorJsonEditor';

const CodeMirrorJsonEditor = lazy(() => import('./CodeMirrorJsonEditor'));

interface JsonSecretEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onFormat: () => void;
  readonly validationError?: string;
  readonly validationLocation?: SecretJsonLocation;
  readonly focusErrorSignal?: number;
  readonly disabled?: boolean;
}

interface CursorPosition {
  readonly line: number;
  readonly column: number;
}

export default function JsonSecretEditor({
  value,
  onChange,
  onFormat,
  validationError,
  validationLocation,
  focusErrorSignal = 0,
  disabled = false,
}: JsonSecretEditorProps) {
  const editorRef = useRef<CodeMirrorJsonEditorHandle>(null);
  const errorId = useId();
  const hintId = useId();
  const [cursor, setCursor] = useState<CursorPosition>({ line: 1, column: 1 });

  useEffect(() => {
    if (!focusErrorSignal || !validationLocation) return;
    editorRef.current?.focusOffset(validationLocation.offset);
  }, [focusErrorSignal, validationLocation]);

  return (
    <section aria-labelledby={`${hintId}-title`} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-background-300 bg-background-50">
      <div className="flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-background-200 bg-background-100 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <i className="ri-braces-line text-sm text-primary-500" aria-hidden="true" />
          <span id={`${hintId}-title`} className="text-xs font-medium text-foreground-700">JSON document</span>
          <span className="hidden text-[10px] text-foreground-400 sm:inline" id={hintId}>Root value must be an object. Errors are marked in the gutter.</span>
        </div>
        <div className="flex items-center gap-3">
          <output aria-live="polite" className="font-mono text-[10px] tabular-nums text-foreground-400">Ln {cursor.line}, Col {cursor.column}</output>
          <button type="button" onClick={onFormat} disabled={disabled} className="flex h-11 items-center gap-1 rounded px-3 text-[11px] font-medium text-foreground-600 hover:bg-background-200 hover:text-foreground-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-50 sm:h-6 sm:px-2">
            <i className="ri-align-left text-xs" aria-hidden="true" /> Format
          </button>
        </div>
      </div>
      <Suspense fallback={<div aria-label="Loading JSON editor" className="min-h-[280px] flex-1 animate-pulse bg-background-100" />}>
        <CodeMirrorJsonEditor
          ref={editorRef}
          value={value}
          onChange={onChange}
          onCursorChange={setCursor}
          disabled={disabled}
          describedBy={`${hintId}${validationError ? ` ${errorId}` : ''}`}
          invalid={Boolean(validationError)}
        />
      </Suspense>
      {validationError && (
        <div id={errorId} role="alert" className="flex shrink-0 flex-wrap items-center gap-2 border-t border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">
          <p className="min-w-0 flex-1">
            <i className="ri-error-warning-line mr-1.5" aria-hidden="true" />
            {validationError}
          </p>
          {validationLocation && (
            <button
              type="button"
              onClick={() => editorRef.current?.focusOffset(validationLocation.offset)}
              className="min-h-11 shrink-0 rounded px-1.5 py-1 font-medium text-danger-800 underline underline-offset-2 hover:bg-danger-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-400 sm:min-h-0"
            >
              Go to line {validationLocation.line}, column {validationLocation.column}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
