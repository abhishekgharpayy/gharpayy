# Gharpayy-Ops

## Project Overview
Gharpayy-Ops is the central CRM and operational workspace for the Gharpayy team. It manages the entire lead lifecycle from discovery and qualification (Impact) to property tours, quotations, negotiation, and final check-in (Tenant creation).

## Architecture
- **Frontend**: React, Vite, TailwindCSS, shadcn/ui
- **State Management**: Zustand (Global Store), React Query (Data Fetching)
- **Realtime**: Socket.IO for live lead, tour, and activity synchronization
- **Pattern**: CQRS (Command Bus for mutations, Read models for queries)

## Setup & Development
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## Testing
Currently relying on manual verification flows. All changes must be verified against real-time Socket behavior, optimistic updates, and React rendering cycles.

## Folder Structure
- `src/components/`: Core UI components (ImpactQueue, LeadControlPanel)
- `src/lib/`: Global store, APIs, realtime bridges, and CRM helpers
- `src/routes/`: Route definitions
- `docs/`: (Ignored in Git) Internal engineering documentation and analysis

## Contribution Guidelines
Every engineering task must adhere to the **Engineering Execution Standard**:
1. **Understand**: Read internal docs before touching code.
2. **Investigate**: Document root cause and affected files.
3. **Design**: Plan the smallest possible implementation. No unnecessary refactoring.
4. **Senior Review**: Self-review for race conditions, optimistic update issues, and rendering regressions.
5. **Implement**: Clean, production-ready code.
6. **Verify**: Ensure correctness, concurrency safety, and proper rollback patterns.
7. **Commit**: Do not make large monolithic commits. Exclude internal docs from Git.
