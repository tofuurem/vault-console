import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';

import {
  loadInspectorPreferences,
  saveInspectorPreferences,
  type InspectorDockPlacement,
} from '@/application/preferences/inspector-preferences';
import Tooltip from '@/components/base/Tooltip';
import { useDialogFocus } from '@/components/base/useDialogFocus';

interface InspectorRenderActions {
  readonly openFullScreen: () => void;
  readonly exitFullScreen: () => void;
}

interface InspectorDockProps {
  readonly open: boolean;
  readonly path: string | null;
  readonly children: ReactNode;
  readonly renderInspector: (actions: InspectorRenderActions) => ReactNode;
  readonly onOpen: () => void;
  readonly onClose: () => void;
}

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export default function InspectorDock({
  open,
  path,
  children,
  renderInspector,
  onOpen,
  onClose,
}: InspectorDockProps) {
  const containerRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [preferences, setPreferences] = useState(() => (
    loadInspectorPreferences(browserStorage())
  ));
  const [fullScreen, setFullScreen] = useState(false);
  const [narrow, setNarrow] = useState(() => window.innerWidth < 768);
  const visible = open && Boolean(path);
  const fullScreenVisible = visible && (fullScreen || narrow);
  const dockedVisible = visible && !fullScreenVisible;

  useEffect(() => {
    saveInspectorPreferences(browserStorage(), preferences);
  }, [preferences]);

  useEffect(() => {
    const update = () => setNarrow(window.innerWidth < 768);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (!fullScreenVisible) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [fullScreenVisible]);

  const exitFullScreen = () => {
    if (narrow) onClose();
    else setFullScreen(false);
  };
  useDialogFocus(fullScreenVisible, dialogRef, exitFullScreen);

  const setPlacement = (placement: InspectorDockPlacement) => {
    setPreferences((current) => ({ ...current, placement }));
    setFullScreen(false);
  };
  const updateBottomRatio = (clientY: number) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds?.height) return;
    const ratio = (bounds.bottom - clientY) / bounds.height;
    setPreferences((current) => ({
      ...current,
      bottomRatio: clamp(ratio, 0.2, 0.75),
    }));
  };
  const updateRightWidth = (clientX: number) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds?.width) return;
    const maximum = Math.min(720, bounds.width * 0.7);
    setPreferences((current) => ({
      ...current,
      rightWidth: clamp(bounds.right - clientX, 280, maximum),
    }));
  };
  const startPointerResize = (
    event: PointerEvent<HTMLDivElement>,
    update: (coordinate: number) => void,
    coordinate: 'clientX' | 'clientY',
  ) => {
    event.preventDefault();
    const move = (moveEvent: globalThis.PointerEvent) => update(moveEvent[coordinate]);
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };
  const resizeFromKeyboard = (
    event: KeyboardEvent<HTMLDivElement>,
    placement: InspectorDockPlacement,
  ) => {
    if (placement === 'bottom' && !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    if (placement === 'right' && !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    setPreferences((current) => placement === 'bottom'
      ? {
          ...current,
          bottomRatio: clamp(
            current.bottomRatio + (event.key === 'ArrowUp' ? 0.05 : -0.05),
            0.2,
            0.75,
          ),
        }
      : {
          ...current,
          rightWidth: clamp(
            current.rightWidth + (event.key === 'ArrowLeft' ? 24 : -24),
            280,
            720,
          ),
        });
  };

  const header = (isFullScreen: boolean) => (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-background-200 bg-background-50 px-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground-500">Inspector</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-foreground-400">{path}</span>
      <div className="flex items-center gap-0.5">
        <Tooltip content="Dock inspector at bottom">
          <button type="button" aria-label="Dock inspector at bottom" onClick={() => setPlacement('bottom')} className={`flex h-6 w-6 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${!isFullScreen && preferences.placement === 'bottom' ? 'bg-primary-100 text-primary-700' : 'text-foreground-400 hover:bg-background-100 hover:text-foreground-700'}`}>
            <i className="ri-layout-bottom-2-line text-xs" aria-hidden="true" />
          </button>
        </Tooltip>
        <Tooltip content="Dock inspector at right">
          <button type="button" aria-label="Dock inspector at right" onClick={() => setPlacement('right')} className={`flex h-6 w-6 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${!isFullScreen && preferences.placement === 'right' ? 'bg-primary-100 text-primary-700' : 'text-foreground-400 hover:bg-background-100 hover:text-foreground-700'}`}>
            <i className="ri-layout-right-2-line text-xs" aria-hidden="true" />
          </button>
        </Tooltip>
        {!isFullScreen && (
          <Tooltip content="Open inspector full screen">
            <button type="button" aria-label="Open inspector full screen" onClick={() => setFullScreen(true)} className="flex h-6 w-6 items-center justify-center rounded text-foreground-400 hover:bg-background-100 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
              <i className="ri-fullscreen-line text-xs" aria-hidden="true" />
            </button>
          </Tooltip>
        )}
        {isFullScreen && (
          <Tooltip content="Exit full screen">
            <button type="button" aria-label="Exit inspector full screen" onClick={exitFullScreen} className="flex h-6 w-6 items-center justify-center rounded text-foreground-400 hover:bg-background-100 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
              <i className="ri-fullscreen-exit-line text-xs" aria-hidden="true" />
            </button>
          </Tooltip>
        )}
        <Tooltip content="Close inspector">
          <button type="button" aria-label="Close inspector" onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded text-foreground-400 hover:bg-background-100 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
            <i className="ri-close-line text-xs" aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
    </div>
  );

  const inspector = renderInspector({
    openFullScreen: () => setFullScreen(true),
    exitFullScreen: () => setFullScreen(false),
  });

  return (
    <main ref={containerRef} id="main-content" tabIndex={-1} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {preferences.placement === 'bottom' ? (
        <>
          <div className="flex min-h-0 min-w-0 flex-1">{children}</div>
          {dockedVisible && (
            <>
              <div
                role="separator"
                aria-label="Resize bottom inspector"
                aria-orientation="horizontal"
                aria-valuemin={20}
                aria-valuemax={75}
                aria-valuenow={Math.round(preferences.bottomRatio * 100)}
                tabIndex={0}
                onPointerDown={(event) => startPointerResize(event, updateBottomRatio, 'clientY')}
                onKeyDown={(event) => resizeFromKeyboard(event, 'bottom')}
                className="group flex h-1.5 shrink-0 cursor-row-resize items-center justify-center bg-background-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
              >
                <span className="h-0.5 w-12 rounded-full bg-background-400 group-hover:bg-primary-400" />
              </div>
              <aside aria-label="Secret inspector" className="flex min-h-[180px] shrink-0 flex-col border-t border-background-200 bg-background-50" style={{ height: `${preferences.bottomRatio * 100}%` }}>
                {header(false)}
                <div className="min-h-0 flex-1 overflow-hidden">{inspector}</div>
              </aside>
            </>
          )}
        </>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1">{children}</div>
          {dockedVisible && (
            <>
              <div
                role="separator"
                aria-label="Resize right inspector"
                aria-orientation="vertical"
                aria-valuemin={280}
                aria-valuemax={720}
                aria-valuenow={Math.round(preferences.rightWidth)}
                tabIndex={0}
                onPointerDown={(event) => startPointerResize(event, updateRightWidth, 'clientX')}
                onKeyDown={(event) => resizeFromKeyboard(event, 'right')}
                className="group flex w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-background-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
              >
                <span className="h-12 w-0.5 rounded-full bg-background-400 group-hover:bg-primary-400" />
              </div>
              <aside aria-label="Secret inspector" className="flex min-h-0 shrink-0 flex-col border-l border-background-200 bg-background-50" style={{ width: `${preferences.rightWidth}px` }}>
                {header(false)}
                <div className="min-h-0 flex-1 overflow-hidden">{inspector}</div>
              </aside>
            </>
          )}
        </div>
      )}

      {!visible && path && (
        <Tooltip content="Open inspector" position="left">
          <button type="button" aria-label="Open inspector" onClick={onOpen} className="absolute right-0 top-1/2 z-10 flex h-12 w-6 -translate-y-1/2 items-center justify-center rounded-l-md border border-r-0 border-background-300 bg-background-50 text-foreground-400 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
            <i className="ri-arrow-left-s-line text-sm" aria-hidden="true" />
          </button>
        </Tooltip>
      )}

      {fullScreenVisible && (
        <div className="fixed inset-0 z-[85] bg-background-50">
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={path ?? 'Secret inspector'} tabIndex={-1} className="flex h-full min-h-0 flex-col">
            {header(true)}
            <div className="min-h-0 flex-1 overflow-hidden">
              {inspector}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
