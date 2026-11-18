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

export function createCookieMock() {
  return {
    get: (name: string) => {
      const value = cookieStore.get(name);
      return value !== undefined ? { name, value } : undefined;
    },
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  };
}
