import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import { createCookieMock } from './tests/helpers/cookies';

process.env.MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/decidarr-test';
process.env.SECURE_COOKIES = 'false';

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

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => createCookieMock()),
}));
