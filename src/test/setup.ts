import '@testing-library/jest-dom/vitest';
import { env } from 'node:process';
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
    [Symbol.iterator]: () => ([] as DOMRect[])[Symbol.iterator](),
  });
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Unit tests must inject gateways or stub fetch; only the disposable-Vault
// integration run (scripts/test-vault.sh sets VAULT_TEST_ADDR) reaches the network.
if (!env.VAULT_TEST_ADDR) {
  globalThis.fetch = (input) => Promise.reject(new TypeError(`Network access is disabled in tests: ${String(input)}`));
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  window.localStorage.clear();
});
