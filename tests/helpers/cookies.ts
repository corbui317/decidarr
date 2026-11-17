const cookieStore = new Map<string, string>();

export function setTestCookie(name: string, value: string) {
  cookieStore.set(name, value);
}

export function clearTestCookies() {
  cookieStore.clear();
}

export function getTestCookie(name: string): string | undefined {
  return cookieStore.get(name);
}

