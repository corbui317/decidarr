import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

process.env.MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/decidarr-test';
process.env.SECURE_COOKIES = 'false';
process.env.DECIDARR_ALLOW_PRIVATE_URLS = 'true';

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

const testCookieStore = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const value = testCookieStore.get(name);
      return value !== undefined ? { name, value } : undefined;
    },
    set: (name: string, value: string) => {
      testCookieStore.set(name, value);
    },
    delete: (name: string) => {
      testCookieStore.delete(name);
    },
  })),
}));

export { testCookieStore };
