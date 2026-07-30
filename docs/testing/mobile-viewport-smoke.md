# Mobile Viewport Smoke Checklist

Manual and automated checks for Decidarr at mobile widths. Run before release when touching dashboard, settings, or PWA shell code.

## Viewports

| Device class | Width × height | Use |
|--------------|----------------|-----|
| Small phone | 375 × 667 | iPhone SE / minimum supported width |
| Large phone | 414 × 896 | iPhone 11 / common Android |

Chrome DevTools: toggle device toolbar → select preset or enter custom dimensions.

## Automated smoke (Playwright)

```bash
npm run test:e2e -- tests/e2e/mobile-viewport.spec.ts
```

Covers setup → dashboard at 375px and 414px, horizontal overflow, primary touch targets, settings modal, and PWA manifest/service-worker registration.

## Manual checklist

### Setup and auth (`/`)

- [ ] Welcome screen fits without horizontal scroll at 375px
- [ ] "Get Started" and Plex OAuth buttons are tappable (≥ 44px)
- [ ] Login screen fits without horizontal scroll
- [ ] "Login with Plex" button is full-width and tappable

### Dashboard (`/dashboard`)

- [ ] Sticky header visible; settings gear and logout tappable
- [ ] Library selector and media-type toggle usable
- [ ] Filter panel expands/collapses; no content clipped off-screen
- [ ] SPIN button visible and centered; no overlap with pool count text
- [ ] Spin animation stays within viewport (no horizontal scroll during animation)
- [ ] Result card: title readable; play and watched buttons tappable
- [ ] "Spin Again" / "Back to Machine" stack vertically on narrow widths
- [ ] Recent spins actions (reapply, revisit, delete) tappable

### Settings modal

- [ ] Modal fits within viewport height (scrollable body if needed)
- [ ] Tab row scrolls horizontally on admin view when needed
- [ ] Close (×) button tappable
- [ ] Theme picker and preference controls reachable without zoom

### PWA shell

- [ ] `/manifest.webmanifest` returns valid JSON with `display: standalone`
- [ ] Service worker registers (`Application → Service Workers` in DevTools)
- [ ] Icons load from `/icons/icon-192.svg` and `/icons/icon-512.svg`
- [ ] `theme-color` meta shows Plex gold (`#E5A00D`)
- [ ] Add to Home Screen / Install prompt appears on supported browsers (requires HTTPS in production)

### Safe areas (notched devices)

- [ ] Content not hidden behind status bar or home indicator
- [ ] Bottom padding on dashboard respects safe-area inset

## Known limitations (do not fail smoke for these)

- **Offline**: service worker caches static assets only; API calls require network.
- **Production audit**: current Lighthouse versions have no dedicated PWA category. Production verification combines Lighthouse quality categories with Chrome DevTools installability checks and requires an HTTPS deploy.
- **Native app deep links**: Plex `ios`/`android` links may be blocked in mobile browser; web fallback expected.
- **E2E**: Playwright runs Chromium device emulation, not real iOS Safari / Android Chrome.

## Pass criteria

All manual items checked **or** automated Playwright mobile spec green, with no horizontal overflow at 375px on dashboard after setup.
