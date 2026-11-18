# DECIDARR-08-ADR-01 Scoring Worksheet

Weighted comparison for native vs PWA options. Full decision: [DECIDARR-08-ADR-01](../../adr/DECIDARR-08-ADR-01-native-vs-pwa.md).

## Rubric

| Score | Meaning |
|-------|---------|
| 1 | Poor fit / high risk |
| 2 | Weak fit |
| 3 | Adequate with tradeoffs |
| 4 | Strong fit |
| 5 | Excellent fit |

## Criteria scores

### 1. Core-loop user value (weight 25)

| Option | Score | Evidence |
|--------|-------|----------|
| PWA-only | 4 | Core loop ships; mobile E2E at 375/414px (E-01) |
| PWA + native | 4 | Same web loop + native deep-link/session improvements |
| Native-first | 4 | Full loop possible but loses zero-install web entry |
| Defer | 2 | No improvement to current partial state |

### 2. Solves measured mobile pain (weight 20)

| Option | Score | Evidence |
|--------|-------|----------|
| PWA-only | 3 | Does not fix browser deep-link blocking (E-02 known limitation) |
| PWA + native | 4 | Native addresses deep links, secure storage, offline read (spec 02) |
| Native-first | 4 | Same pain relief as companion |
| Defer | 1 | Pain remains unaddressed |

### 3. Self-hosting fit (weight 15)

| Option | Score | Evidence |
|--------|-------|----------|
| PWA-only | 5 | No additional distribution; operator HTTPS only |
| PWA + native | 4 | Native auth targets operator origin; no broker required |
| Native-first | 2 | Store distribution does not solve home-server reachability |
| Defer | 5 | No new dependencies |

### 4. Security and privacy (weight 15)

| Option | Score | Evidence |
|--------|-------|----------|
| PWA-only | 4 | Mature cookie session model; `SECURE_COOKIES` shipped |
| PWA + native | 3 | New bearer-token boundary; gated on threat model (E-17) |
| Native-first | 3 | Same token concerns, larger attack surface |
| Defer | 5 | No new security boundary |

### 5. Delivery/maintenance cost (weight 15)

| Option | Score | Evidence |
|--------|-------|----------|
| PWA-only | 5 | ~0.25–0.5 weeks/release ongoing |
| PWA + native | 3 | ~11–23 engineer-weeks Phases A–C + store QA |
| Native-first | 2 | Highest dual-surface + store cost |
| Defer | 5 | No incremental build cost |

### 6. Offline/deep-link capability (weight 5)

| Option | Score | Evidence |
|--------|-------|----------|
| PWA-only | 2 | Static cache only; API network-required |
| PWA + native | 4 | Phased SQLite sync; Plex still network-required |
| Native-first | 5 | Full native platform APIs |
| Defer | 2 | No offline improvement |

### 7. Distribution/discoverability (weight 5)

| Option | Score | Evidence |
|--------|-------|----------|
| PWA-only | 3 | Install via browser; iOS education burden |
| PWA + native | 4 | Web install + optional app store |
| Native-first | 5 | App store primary |
| Defer | 3 | Status quo PWA shell |

## Weighted totals

Formula: `total = Σ(score × weight)`

| Option | Calculation | Total | Normalized |
|--------|-------------|-------|------------|
| PWA-only | 4×25 + 3×20 + 5×15 + 4×15 + 5×15 + 2×5 + 3×5 | **395** | 79% |
| PWA + native | 4×25 + 4×20 + 4×15 + 3×15 + 3×15 + 4×5 + 4×5 | **370** | 74% |
| Native-first | 4×25 + 4×20 + 2×15 + 3×15 + 2×15 + 5×5 + 5×5 | **315** | 63% |
| Defer | 2×25 + 1×20 + 5×15 + 5×15 + 5×15 + 2×5 + 3×5 | **320** | 64% |

## Mandatory constraint checks

| Constraint | PWA-only | PWA + native | Native-first | Defer |
|------------|----------|--------------|--------------|-------|
| Self-hosting intact | Pass | Pass | **Fail** (reachability) | Pass |
| Security review path | Pass | Conditional (E-17) | Conditional | Pass |
| Maintainer capacity | Pass | Conditional (phased) | **Fail** | Pass |

**Selected option:** PWA-first with native companion — highest score among options that pass mandatory constraints and close documented mobile pain.
