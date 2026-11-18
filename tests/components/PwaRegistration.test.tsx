import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import PwaRegistration from '@/components/PwaRegistration';

describe('PwaRegistration', () => {
  const register = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    register.mockClear();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register },
    });
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      value: 'complete',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers the static service worker on load', async () => {
    render(<PwaRegistration />);
    await vi.waitFor(() => {
      expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    });
  });

  it('does nothing when service workers are unavailable', () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: undefined,
    });

    render(<PwaRegistration />);
    expect(register).not.toHaveBeenCalled();
  });
});
