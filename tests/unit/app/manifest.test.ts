import { describe, it, expect } from 'vitest';
import manifest from '@/app/manifest';

describe('PWA manifest', () => {
  it('defines installability metadata and required icons', () => {
    const data = manifest();

    expect(data.name).toContain('Decidarr');
    expect(data.short_name).toBe('Decidarr');
    expect(data.display).toBe('standalone');
    expect(data.start_url).toBe('/');
    expect(data.theme_color).toBe('#E5A00D');
    expect(data.background_color).toBe('#0f0f1a');
    expect(data.icons?.length).toBeGreaterThanOrEqual(3);

    const sizes = data.icons?.map((icon) => icon.sizes) ?? [];
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });
});
