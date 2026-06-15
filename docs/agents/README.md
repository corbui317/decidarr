# Decidarr Agents

Agent guidance for Decidarr spec-driven work.

## Default Agent Roster

| Boundary | Lead | Pair | QA Gate |
|----------|------|------|---------|
| Auth, API, integrations | Backend Architect | Security Engineer | API Tester |
| MongoDB/Mongoose/cache | Backend Architect | Database Optimizer | API Tester |
| Dashboard, filters, result UI | Frontend Developer | UX Architect | Evidence Collector |
| Secrets, SSRF, tokens, access rules | Security Engineer | Backend Architect | Code Reviewer |
| Animation and accessibility | Frontend Developer | UX Architect | Accessibility Auditor |
| Tautulli/TMDb/Overseerr external APIs | Backend Architect | API Tester | Test Results Analyzer |
| Mobile/PWA discovery | Mobile App Builder | UX Architect | Evidence Collector |
| Product sequencing | Product Manager | Software Architect | Reality Checker |
| Docs and task hygiene | Technical Writer | Product Manager | Code Reviewer |

## Activation Rule

Start solo for small, low-risk work. Add a pair only when the task crosses a boundary: UI/API, schema/performance, security/privacy, external integration, mobile, AI, or major product sequencing.

## Canonical Workflow

Use [decidarr-agent-workflows.md](./decidarr-agent-workflows.md) for the full lifecycle, prompts, and handoff rules.
