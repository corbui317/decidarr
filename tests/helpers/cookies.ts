import { testCookieStore, testHeaderStore } from '../../vitest.setup';

export function setTestHeader(name: string, value: string) {
  testHeaderStore.set(name.toLowerCase(), value);
}

export function clearTestHeaders() {
  testHeaderStore.clear();
}

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

