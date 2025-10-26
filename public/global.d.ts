import type { IPCursor } from './ip'

declare global {
  interface Window {
    clippyFloat?: {
      hide(): void;
      show(): void;
      positionBelowCursor(): void;
    };
    ipCursor?: IPCursor;
  }
}

export {}
