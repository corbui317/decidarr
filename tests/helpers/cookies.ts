import { testCookieStore } from '../../vitest.setup';

export function setTestCookie(name: string, value: string) {
  testCookieStore.set(name, value);
}

export function deleteTestCookie(name: string) {
  testCookieStore.delete(name);
}

export function clearTestCookies() {
  testCookieStore.clear();
}

export function getTestCookie(name: string): string | undefined {
  return testCookieStore.get(name);
}

