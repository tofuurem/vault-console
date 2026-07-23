import { useId, useRef, useState, type ChangeEvent, type KeyboardEvent, type SyntheticEvent } from 'react';

interface JsonSecretEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onFormat: () => void;
  readonly validationError?: string;
  readonly disabled?: boolean;
}

interface CursorPosition {
  readonly line: number;
  readonly column: number;
}

function cursorPosition(value: string, offset: number): CursorPosition {
  const before = value.slice(0, offset);
  const lines = before.split('\n');
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

export default function JsonSecretEditor({
  value,
  onChange,
  onFormat,
  validationError,
  disabled = false,
}: JsonSecretEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const errorId = useId();
  const hintId = useId();
  const [cursor, setCursor] = useState<CursorPosition>({ line: 1, column: 1 });

  const updateCursor = (event: SyntheticEvent<HTMLTextAreaElement>) => {
    setCursor(cursorPosition(event.currentTarget.value, event.currentTarget.selectionStart));
  };
  const change = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
    updateCursor(event);
  };
  const insertIndent = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    const target = event.currentTarget;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const nextValue = `${value.slice(0, start)}  ${value.slice(end)}`;
    onChange(nextValue);
    requestAnimationFrame(() => {
      const editor = textareaRef.current;
      if (!editor) return;
      editor.selectionStart = start + 2;
      editor.selectionEnd = start + 2;
      setCursor(cursorPosition(nextValue, start + 2));
    });
  };

  return (
    <section aria-labelledby={`${hintId}-title`} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-background-300 bg-background-50">
      <div className="flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-background-200 bg-background-100 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <i className="ri-braces-line text-sm text-primary-500" aria-hidden="true" />
          <span id={`${hintId}-title`} className="text-xs font-medium text-foreground-700">JSON document</span>
          <span className="hidden text-[10px] text-foreground-400 sm:inline" id={hintId}>Root value must be an object. Tab inserts two spaces.</span>
        </div>
        <div className="flex items-center gap-3">
          <output aria-live="polite" className="font-mono text-[10px] tabular-nums text-foreground-400">Ln {cursor.line}, Col {cursor.column}</output>
          <button type="button" onClick={onFormat} disabled={disabled} className="flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium text-foreground-600 hover:bg-background-200 hover:text-foreground-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-50">
            <i className="ri-align-left text-xs" aria-hidden="true" /> Format
          </button>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        aria-label="Secret JSON editor"
        aria-invalid={Boolean(validationError)}
        aria-describedby={`${hintId}${validationError ? ` ${errorId}` : ''}`}
        value={value}
        onChange={change}
        onSelect={updateCursor}
        onKeyUp={updateCursor}
        onClick={updateCursor}
        onKeyDown={insertIndent}
        disabled={disabled}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        wrap="off"
        className="min-h-[280px] flex-1 resize-none overflow-auto bg-background-50 p-4 font-mono text-[12px] leading-6 text-foreground-900 caret-primary-500 focus:outline-none disabled:cursor-wait disabled:opacity-70"
      />
      {validationError && (
        <p id={errorId} role="alert" className="shrink-0 border-t border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <i className="ri-error-warning-line mr-1.5" aria-hidden="true" />
          {validationError}
        </p>
      )}
    </section>
  );
}
