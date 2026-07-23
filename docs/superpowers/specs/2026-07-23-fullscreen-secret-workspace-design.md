# Fullscreen Secret Workspace Design

Date: 2026-07-23
Status: Approved

## 1. Purpose

Vault Console currently renders secret data in a narrow inspector and edits it
in a drawer. This works for flat key/value records but makes nested objects,
arrays, and large JSON documents difficult to understand and unsafe to edit.

The new secret workspace gives the entire viewport to reading and editing one
KV v2 secret while retaining the compact inspector as a fast preview.

## 2. Goals

- Read deeply nested objects and arrays without flattening or stringifying
  their structure.
- Edit a complete secret as valid JSON in a large, focused surface.
- Preserve all JSON value types and nested data exactly.
- Keep values masked by default and make reveal state explicit.
- Retain KV v2 check-and-set protection when saving a new version.
- Prevent accidental submission of malformed JSON or a non-object root.
- Keep the workflow keyboard-accessible at narrow and wide viewport sizes.

## 3. Non-goals

- A general-purpose IDE, schema editor, or JSON Schema integration.
- Visual drag-and-drop editing of arbitrary JSON trees.
- Editing an individual historical version in place; Vault versions remain
  immutable and restore still creates a new version.
- Changing the Vault HTTP adapter or KV v2 storage format.
- Moving version destruction or metadata deletion out of the existing
  inspector in this iteration.

## 4. User experience

### 4.1 Compact inspector

Selecting a secret continues to open the existing inspector. It remains useful
for the current version, quick key inspection, version history, metadata, and
destructive actions.

The Data tab gains an explicit `Open full screen` action. Nested values are
identified as objects or arrays instead of being presented as an unreadable
masked string. `Edit secret` opens the same full-screen workspace directly in
edit mode.

### 4.2 Full-screen read mode

The workspace covers the application viewport and has a stable header with:

- back/close action;
- full logical secret path;
- current version and creation timestamp;
- masked/revealed state;
- edit action when the current Vault token permits it.

Data has two representations:

- `Tree`: recursively collapsible objects and arrays with type and item-count
  hints. Container structure and keys remain visible while primitive values are
  masked. Individual primitive values can be revealed or copied.
- `JSON`: formatted JSON for scanning or copying a complete document. Values
  remain redacted until the user explicitly reveals the document.

The tree is the default for nested data. The JSON representation uses the full
available width and scrolls independently so large documents do not resize the
surrounding application.

### 4.3 Full-screen edit mode

Editing uses a full-height monospaced JSON text area initialized with formatted
secret data. The editor:

- accepts any nested JSON whose root is an object;
- preserves objects, arrays, strings, numbers, booleans, and null;
- supports a format action;
- reports parse errors with a line and column when available;
- marks invalid content programmatically and blocks review/save;
- shows the current cursor line and column;
- inserts spaces when Tab is pressed instead of moving focus out of the editor.

Saving retains the currently loaded version as the check-and-set value. The
workspace shows the top-level added, changed, and removed counts before the
write. A successful write closes edit mode and refreshes the directory,
details, history, and permissions through the existing page flow.

Closing a modified editor requires explicit confirmation to discard changes.

## 5. Security and privacy

- Secret values are masked on every new read-mode opening.
- Reveal state lives only in React memory and is reset on close.
- UI code does not log data, copy it into URLs, or persist it in browser
  storage.
- Copy actions are deliberate user gestures and announce success without
  echoing the copied value.
- Error messages describe JSON syntax only and never interpolate secret data.
- The editor submits only the parsed object after local validation.
- Vault remains the authorization boundary and the existing capability checks
  run immediately before every write.

## 6. Accessibility and responsive behavior

- The workspace is an accessible modal dialog with a name, Escape handling,
  focus containment, and focus restoration.
- Tabs expose correct tab, tablist, and tabpanel semantics and support arrow-key
  navigation.
- Icon-only actions have accessible names and at least 24-by-24-pixel targets.
- Validation uses `aria-invalid`, an associated error description, and a live
  status region.
- On narrow screens the toolbar wraps, the path remains readable, and the
  editor retains the full remaining vertical space.
- At 200% zoom all controls remain reachable without overlapping the editor.

## 7. Component and domain boundaries

- `SecretWorkspace`: dialog lifecycle, read/edit modes, dirty-state protection,
  and save orchestration.
- `SecretDataTree`: recursive read-only structure, reveal, and copy behavior.
- `JsonSecretEditor`: raw text, formatting, cursor status, and accessible
  validation feedback.
- `secret-json`: framework-independent parsing, redaction, nested-data
  detection, and change-summary helpers.

`ExplorerPage` owns the selected secret and opens the workspace. `Inspector`
only emits open/edit intents and keeps version/metadata operations unchanged.
No React component constructs Vault paths or calls HTTP endpoints directly.

## 8. Error handling

- Invalid JSON stays in the editor and never reaches the gateway.
- A valid array or primitive root produces a distinct `root must be an object`
  error.
- A Vault check-and-set conflict remains visible through the existing
  normalized mutation error path and keeps the editor contents intact.
- Session expiry continues to clear the in-memory session.
- Closing during an in-flight save is disabled.

## 9. Verification

- Domain tests cover nested-data detection, redaction without mutation, parsing,
  root validation, and change summaries.
- Component tests cover masked tree rendering, expansion, reveal, accessible
  tabs, formatting, invalid JSON, dirty close protection, and nested saves.
- Explorer regression tests prove that nested objects and arrays reach the Vault
  gateway unchanged with the exact loaded CAS version.
- Browser verification covers wide and narrow viewports, keyboard operation,
  overflow, and visual hierarchy.
- Full typecheck, lint, Vitest, production build, and real-Vault Compose checks
  run before publication.
