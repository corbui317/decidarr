export function isSecureCookieEnabled(): boolean {
  if (process.env.SECURE_COOKIES === 'false') return false;
  if (process.env.SECURE_COOKIES === 'true') return true;
  return process.env.NODE_ENV === 'production';
}
