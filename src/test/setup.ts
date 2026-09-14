import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

const values = new Map<string, string>();
const memoryStorage: Storage = {
  get length() {
    return values.size;
  },
  clear() {
    values.clear();
  },
  getItem(key) {
    return values.get(key) ?? null;
  },
  key(index) {
    return [...values.keys()][index] ?? null;
  },
  removeItem(key) {
    values.delete(key);
  },
  setItem(key, value) {
    values.set(key, String(value));
  },
};

// Node 26 exposes an unavailable process-level storage object to jsdom.
// Tests need browser-like persistence without changing production storage.
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: memoryStorage,
});

afterEach(() => {
  cleanup();
});
