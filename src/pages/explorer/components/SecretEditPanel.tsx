import JsonSecretEditor from './JsonSecretEditor';
import SecretFieldsEditor from './SecretFieldsEditor';
import type { SecretEditDraft, SecretEditorMode } from './useSecretEditDraft';

const MODES: readonly (readonly [SecretEditorMode, string, string])[] = [
  ['fields', 'Fields', 'ri-list-check-2'],
  ['json', 'JSON', 'ri-braces-line'],
];

interface SecretEditPanelProps {
  readonly draft: SecretEditDraft;
  readonly currentVersion: number;
  readonly saving: boolean;
  readonly saveError: string;
  readonly focusErrorSignal: number;
}

function ChangeCounters({ draft }: { readonly draft: SecretEditDraft }) {
  const { changes } = draft;
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className="rounded bg-success-50 px-2 py-1 font-medium text-success-700"><strong className="mr-1 font-mono tabular-nums">{changes.added}</strong>added</span>
      <span className="rounded bg-warning-50 px-2 py-1 font-medium text-warning-700"><strong className="mr-1 font-mono tabular-nums">{changes.changed}</strong>changed</span>
      <span className="rounded bg-danger-50 px-2 py-1 font-medium text-danger-700"><strong className="mr-1 font-mono tabular-nums">{changes.removed}</strong>removed</span>
    </div>
  );
}

export default function SecretEditPanel({
  draft,
  currentVersion,
  saving,
  saveError,
  focusErrorSignal,
}: SecretEditPanelProps) {
  const { validation } = draft;
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden bg-background-100 p-3 sm:p-5" id="secret-workspace-content">
      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Editor view" className="inline-flex rounded-md border border-background-300 bg-background-50 p-0.5">
          {MODES.map(([mode, label, icon]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={draft.mode === mode}
              disabled={saving}
              onClick={() => draft.switchMode(mode)}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-7 ${
                draft.mode === mode ? 'bg-primary-100 text-primary-700' : 'text-foreground-600 hover:text-foreground-900'
              }`}
            >
              <i className={icon} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        {draft.modeNotice && <p role="status" className="text-[11px] text-warning-800">{draft.modeNotice}</p>}
      </div>

      {draft.mode === 'fields' ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <section aria-label="Secret fields" className="max-w-4xl rounded-lg border border-background-300 bg-background-50 p-3">
            <SecretFieldsEditor fields={draft.fields} onChange={draft.setFields} disabled={saving} />
          </section>
        </div>
      ) : (
        <JsonSecretEditor
          value={draft.rawJson}
          onChange={draft.setRawJson}
          onFormat={draft.formatJson}
          validationError={validation.result?.ok === false ? validation.result.message : undefined}
          validationLocation={validation.result?.ok === false ? validation.result.location : undefined}
          focusErrorSignal={focusErrorSignal}
          disabled={saving}
          largeDocument={validation.isLarge}
          validationPending={validation.status === 'pending'}
        />
      )}

      <footer className="flex shrink-0 flex-wrap items-center gap-3 rounded-lg border border-background-300 bg-background-50 px-3 py-2">
        <ChangeCounters draft={draft} />
        <p className="min-w-[220px] flex-1 text-[10px] leading-4 text-foreground-500">Check-and-set is fixed to v{currentVersion}. Concurrent changes fail instead of being overwritten.</p>
        {!draft.dirty && <span className="text-[10px] text-foreground-500">No changes</span>}
        {saveError && <p role="alert" className="w-full border-t border-danger-100 pt-2 text-xs text-danger-700">{saveError}</p>}
      </footer>
    </main>
  );
}
