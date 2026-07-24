import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

const localStorageValues = new Map<string, string>();
const testLocalStorage: Storage = {
  get length() {
    return localStorageValues.size;
  },
  clear: () => localStorageValues.clear(),
  getItem: (key) => localStorageValues.get(key) ?? null,
  key: (index) => [...localStorageValues.keys()][index] ?? null,
  removeItem: (key) => {
    localStorageValues.delete(key);
  },
  setItem: (key, value) => {
    localStorageValues.set(key, String(value));
  },
};
Object.defineProperty(window, 'localStorage', { configurable: true, value: testLocalStorage });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: testLocalStorage });

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: function* emptyRectList() {},
  });
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  window.localStorage.clear();
});
