import { json } from '@codemirror/lang-json';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import {
  highlightActiveLine,
  highlightActiveLineGutter,
  lineNumbers,
} from '@codemirror/view';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { EditorView, minimalSetup } from 'codemirror';

import { parseSecretJson } from '@/domain/vault/secret-json';

export interface CodeMirrorJsonEditorHandle {
  readonly focusOffset: (offset: number) => void;
}

interface CodeMirrorJsonEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onCursorChange: (position: { line: number; column: number }) => void;
  readonly describedBy: string;
  readonly invalid: boolean;
  readonly disabled: boolean;
}

function diagnosticsFor(source: string): readonly Diagnostic[] {
  const parsed = parseSecretJson(source);
  if (parsed.ok === true) return [];
  const offset = parsed.location?.offset ?? 0;
  return [{
    from: offset,
    to: Math.min(source.length, offset + 1),
    severity: 'error',
    source: 'JSON',
    message: parsed.message,
  }];
}

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'transparent',
    color: 'var(--color-foreground-900, #252529)',
    fontSize: '12px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
    lineHeight: '1.75',
  },
  '.cm-content': { padding: '12px 0', caretColor: '#5b4fcf' },
  '.cm-line': { padding: '0 14px 0 6px' },
  '.cm-gutters': {
    backgroundColor: '#f7f7f8',
    color: '#88888f',
    borderRight: '1px solid #e5e5e8',
  },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: '#f3f1ff' },
  '.cm-lintRange-error': { backgroundImage: 'none', borderBottom: '2px solid #dc2626' },
});

const CodeMirrorJsonEditor = forwardRef<CodeMirrorJsonEditorHandle, CodeMirrorJsonEditorProps>(
  function CodeMirrorJsonEditor({
    value,
    onChange,
    onCursorChange,
    describedBy,
    invalid,
    disabled,
  }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const onCursorChangeRef = useRef(onCursorChange);
    onChangeRef.current = onChange;
    onCursorChangeRef.current = onCursorChange;

    useEffect(() => {
      if (!hostRef.current) return;
      const view = new EditorView({
        doc: value,
        parent: hostRef.current,
        extensions: [
          minimalSetup,
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          json(),
          lintGutter(),
          linter((currentView) => diagnosticsFor(currentView.state.doc.toString()), {
            delay: 150,
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
            if (update.docChanged || update.selectionSet) {
              const head = update.state.selection.main.head;
              const line = update.state.doc.lineAt(head);
              onCursorChangeRef.current({
                line: line.number,
                column: head - line.from + 1,
              });
            }
          }),
          editorTheme,
        ],
      });
      viewRef.current = view;
      return () => {
        viewRef.current = null;
        view.destroy();
      };
      // The editor owns its document after mount; prop synchronization is handled below.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      const view = viewRef.current;
      if (!view || view.state.doc.toString() === value) return;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }, [value]);

    useEffect(() => {
      const content = viewRef.current?.contentDOM;
      if (!content) return;
      content.setAttribute('aria-label', 'Secret JSON editor');
      content.setAttribute('aria-describedby', describedBy);
      content.setAttribute('aria-invalid', String(invalid));
      content.setAttribute('aria-disabled', String(disabled));
      content.setAttribute('contenteditable', String(!disabled));
    }, [describedBy, disabled, invalid]);

    useImperativeHandle(ref, () => ({
      focusOffset(offset) {
        const view = viewRef.current;
        if (!view) return;
        const boundedOffset = Math.max(0, Math.min(offset, view.state.doc.length));
        view.dispatch({
          selection: { anchor: boundedOffset },
          scrollIntoView: true,
        });
        view.focus();
      },
    }), []);

    return <div ref={hostRef} className="min-h-[280px] flex-1 overflow-hidden" />;
  },
);

export default CodeMirrorJsonEditor;
