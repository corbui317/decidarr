# Feature: Native vs PWA Architecture Decision

## Status

**Complete** — produced [DECIDARR-08-ADR-01](../../adr/DECIDARR-08-ADR-01-native-vs-pwa.md) (accepted 2026-08-03). Decision: **PWA-first with native companion**.

## What & Why

Decidarr needs an explicit, evidence-backed decision before investing in native authentication, app-store delivery, and offline synchronization. The ADR must compare the shipped PWA with realistic native alternatives using user outcomes, operating constraints, security, lifecycle cost, and measured evidence—not framework preference.

The decision can be written before large-scale production data exists, but unavailable evidence must be recorded as an assumption and paired with a review trigger. Lack of analytics is not permission to invent demand.

## User Outcomes

- As a maintainer, I want a durable platform decision so that future implementation does not fork without clear value.
- As an operator, I want the selected approach to preserve self-hosting and avoid unnecessary hosted dependencies.
- As a mobile user, I want the selected platform to improve real constraints such as installation, deep links, reliability, and offline behavior.

## Non-Goals

- Implementing an Expo app, sync protocol, or offline cache.
- Treating an ADR as permanent; material evidence may trigger supersession.
- Requiring invasive analytics or collecting media-choice data without consent.
- Selecting a platform solely because it is familiar or fashionable.
- Comparing native capabilities that Decidarr has no product requirement to use.

## Implementation Snapshot

### Current / Shipped

| Capability | Evidence | Status |
|------------|----------|--------|
| Responsive mobile web | Mobile E2E at 375px/414px | Shipped |
| Install metadata and service worker | Manifest/SW unit and E2E tests | Shipped |
| Static-asset cache only | `public/sw.js` | Shipped |
| Plex iOS/Android deep links | Selection play links | Shipped |
| Production install evidence | None | Missing |
| Native auth and sync cost | Parent spec sketches only | Unestimated |
| Retention/install demand data | None defined | Missing |

### Candidate decisions

1. **PWA-only:** Continue mobile web; improve installation and online resilience.
2. **PWA-first with native companion:** Keep web canonical and add a bounded Expo client.
3. **Native-first mobile:** Make native the primary mobile experience while retaining web administration.
4. **Defer:** Keep the PWA shell but make no platform investment until a named trigger occurs.

“Build both fully” is not a valid default; it must justify duplicated lifecycle cost.

## 1. Data and Evidence Changes

No product data model change is required to write the ADR.

If measurement is introduced, use privacy-minimized aggregate events:

```typescript
type MobileEvidenceEvent =
  | 'pwa_install_prompt_available'
  | 'pwa_install_started'
  | 'pwa_standalone_launch'
  | 'mobile_core_loop_completed'
  | 'plex_deep_link_attempted'
  | 'network_failure_blocked_action'

interface AggregateMobileEvidence {
  event: MobileEvidenceEvent
  periodStart: string
  count: number
  platformFamily?: 'ios' | 'android' | 'desktop' | 'unknown'
}
```

Rules:

- Prefer local/operator-visible aggregate logs or an opt-in, self-host-compatible mechanism.
- Do not collect movie titles, Plex IDs, filter values, usernames, tokens, IP addresses, or precise device fingerprints for this decision.
- Define retention, operator controls, and deletion behavior before adding measurement.
- ADR discovery may instead use structured interviews, issue labels, and an opt-in survey if telemetry is inappropriate.

## 2. Decision Inputs and Contracts

### Required evidence pack

| Input | Minimum evidence |
|-------|------------------|
| Current PWA quality | Production HTTPS verification, install/standalone smoke, mobile core-loop smoke |
| User demand | Interviews, survey, support issues, or aggregate usage with sample size stated |
| Platform pain | Ranked failures that native can plausibly solve |
| Native cost | Auth, sync, app-store, CI/signing, device QA, support, and release estimates |
| PWA cost | Browser limitations, installation education, offline scope, and QA estimates |
| Security | Threat comparison for cookies, native tokens, device storage, revocation, and supply chain |
| Self-hosting | LAN/public access, certificates, server discovery, and operator burden |
| Maintenance capacity | Named owners and sustainable release cadence |

### Decision questions

1. What user problem cannot be met adequately by the PWA?
2. How often does that problem occur, and for which platform segment?
3. Does native delivery require a hosted broker or can self-hosting remain intact?
4. Which offline actions are valuable enough to justify a sync protocol?
5. Can the team maintain iOS, Android, web, backend, signing, and store compliance?
6. What security boundary changes when browser sessions become native bearer tokens?
7. What is the smallest reversible experiment that validates the preferred option?

### Scoring rubric

Score each option `1–5`; cite evidence for every score.

| Criterion | Weight |
|-----------|--------|
| Core-loop user value | 25 |
| Solves measured mobile pain | 20 |
| Self-hosting fit | 15 |
| Security and privacy | 15 |
| Delivery/maintenance cost | 15 |
| Offline/deep-link capability | 5 |
| Distribution/discoverability | 5 |

Weighted totals inform the decision but do not replace written reasoning. Any option that fails a mandatory security or self-hosting constraint is rejected regardless of score.

### ADR output contract

Create `docs/adr/DECIDARR-08-ADR-01-native-vs-pwa.md` containing:

- status: `Proposed`, `Accepted`, `Rejected`, or `Superseded`;
- date, owners, consulted roles, and target review date;
- context and decision drivers;
- options considered;
- evidence and confidence level;
- weighted comparison;
- decision;
- positive and negative consequences;
- implementation guardrails;
- rollout experiment;
- rollback/exit criteria;
- assumptions and triggers for review;
- links to specs and evidence.

## 3. Product and UX Research Changes

### Research cohort

Include, where available:

- iOS and Android users;
- LAN-only and remotely exposed self-hosted operators;
- users who installed the PWA and users who did not;
- users with unreliable connectivity;
- accessibility users relying on Dynamic Type, screen readers, or reduced motion.

### Interview prompts

- How do users currently reach Decidarr on mobile?
- Where does the browser/PWA flow fail or feel costly?
- Is offline access valuable if Plex playback still requires network/server access?
- Would users install from an app store, and what trust expectations change?
- Which actions must work when away from the home network?
- Are push notifications, background work, or OS integrations actually required?

Avoid asking “Would you use an app?” as the primary demand signal; ask about recent behavior and concrete failures.

### Prototype boundary

If evidence remains ambiguous, permit one reversible spike:

- a non-production Expo shell using mock/local fixture data;
- no production auth, credentials, persistence, app-store submission, or backend schema;
- time-boxed estimate and usability test;
- code discarded or isolated unless the ADR accepts native.

## 4. Acceptance Criteria

### ADR readiness

- [ ] The current PWA is tested on a production or production-equivalent HTTPS origin.
- [ ] Mobile core-loop and install evidence covers at least one current iOS Safari and Android Chrome device.
- [x] User-demand evidence names method, sample size, date, and limitations.
- [x] Native auth, sync, release, signing, support, and QA costs are estimated as ranges.
- [x] Security and self-hosting constraints are reviewed explicitly.

### ADR completion

- [x] All four candidate decisions are considered or explicitly ruled out with reasons.
- [x] Every score cites evidence or is labeled as an assumption.
- [x] The accepted option names implementation guardrails and non-goals.
- [x] The ADR includes a reversible first step, success metrics, failure/exit criteria, and review date.
- [x] `docs/specs/beta/08-mobile-pwa-later.md`, the spec index, and backlog link the accepted ADR.
- [x] Native implementation remains blocked unless the accepted decision authorizes it (Phase A authorized; production gated on security).

## 5. Edge Cases

- Too little production usage -> choose `Defer` or make a low-confidence decision with a dated review trigger.
- Interview sample consists only of maintainers -> label selection bias; do not generalize.
- iOS PWA limitation drives request but affects few users -> quantify segment and severity.
- Native improves installation but remote self-host connectivity remains unsolved -> do not credit native for solving network reachability.
- Offline cache is proposed but Plex playback remains unreachable -> separate browsing/decision value from playback value.
- App-store rules or signing costs change -> trigger ADR review.
- Browser capabilities materially improve -> trigger ADR review before continuing native investment.
- Security review rejects native token design -> reject or defer native regardless of weighted score.
- A native spike becomes production by inertia -> prohibited until ADR acceptance and implementation spec approval.

## 6. Dependency Map

**Create:**

- `docs/adr/DECIDARR-08-ADR-01-native-vs-pwa.md`
- `docs/evidence/mobile/` index or equivalent release attachments
- Optional privacy-reviewed aggregate measurement plan

**Modify:**

- `docs/specs/beta/08-mobile-pwa-later.md`
- `docs/specs/README.md`
- `docs/tasks/beta/beta-backlog.md`

**Depends on:**

- [Production HTTPS and PWA verification](./01-production-https-pwa-verification.md)
- [Offline sync and Expo client cost/scope](./02-offline-sync-expo-client.md)
- Current mobile viewport smoke checklist
- Maintainer capacity and self-hosting constraints

**Blocked by:**

- No named decision owner
- No acceptable evidence source or explicit assumption policy
- Unreviewed native authentication threat model for any decision authorizing native work

## 7. Decision Process

1. Name the decision owner, contributors, review date, and constraints.
2. Complete production PWA verification and physical-device smoke.
3. Gather privacy-appropriate demand and pain evidence.
4. Estimate each option with engineering, security, operations, and QA input.
5. Score options, document uncertainty, and select the smallest sufficient strategy.
6. Review the proposed ADR with maintainers and security.
7. Accept, reject, or defer; link the outcome from parent specs and backlog.
8. Create task plans only for work authorized by the accepted decision.

## 8. Verification

**Document checks:**

- Every cited artifact exists and records date/version/commit where applicable.
- Scores recompute correctly from criterion values and weights.
- Assumptions have an owner and review trigger.
- Consequences include ongoing operational costs, not only build cost.
- No option claims offline, push, background execution, or app-store benefits without corresponding implementation scope.

**Manual / Evidence:**

- Decision review notes from product, engineering, security, operations, and QA.
- At least one current iOS and Android device flow.
- Redacted user-research summary.
- Cost estimate ranges and confidence levels.

**Known evidence gaps:**

- Small self-hosted communities may never provide statistically significant telemetry.
- Store policy and mobile OS behavior can change after acceptance; the ADR must be reviewable.

## 9. Task Handoff

- **Backlog ID:** `DECIDARR-08-ADR-01`
- **First safe task:** Create the ADR evidence pack index and assign owners; do not scaffold Expo.
- **Review boundary:** Research and architecture decision only.
- **Evidence required for done:** Accepted ADR, source evidence, scoring worksheet, review sign-off, and linked follow-up tasks.

## Agent Activation

- **Lead agent:** `Senior Developer`
- **Pair agent:** `Mobile App Builder`
- **QA gate:** `Security Engineer` and `Evidence Collector`
- **Activation mode:** `gated`
- **When to activate pair:** Costing native architecture, platform capability validation, physical-device evidence
- **Context pack:** this spec, parent spec 08, production PWA evidence, native/offline spec, user research, security constraints
- **Expected handoff:** accepted/deferred ADR, evidence pack, confidence and assumptions, authorized next tasks
- **Do not activate:** Native production implementation before ADR acceptance
