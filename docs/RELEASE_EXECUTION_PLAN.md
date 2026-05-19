# Release Execution Plan

All roadmap phases (1-5) are closed for baseline release. This document defines the next execution track to move from "phase complete" to "user-facing production launch".

## Stage 1: Release Candidate Freeze

- Tag release candidate branch from `main` (`v1.0.0-rc1`).
- Freeze feature scope to only:
  - crash fixes
  - data integrity fixes
  - critical UX blockers
- Lock region catalog + pack manifests for RC validation.

Exit gate:
- Full selfcheck suite passes on frozen commit.
- No unresolved P0 defects.

## Stage 2: Device Validation Matrix

- Validate on:
  - Android low-end (4 GB RAM)
  - Android mid-range
  - Android high-end
  - iOS reference device
- Execute:
  - cold-start offline launch
  - search/routing/AI interaction loop
  - offline pack install/update/resume/rollback path
  - sustained navigation stress session

Exit gate:
- No crashers/blockers.
- Performance budgets stay inside thresholds in `docs/performance_budgets.json`.

## Stage 3: Operations Readiness

- Verify pack transaction telemetry fields emitted end-to-end.
- Verify interrupted transaction recovery on app restart.
- Verify release catalog/readiness JSON generation in CI path.
- Verify rollback playbook for bad region pack promotion.

Exit gate:
- Dry-run rollback succeeds.
- Readiness + catalog artifacts regenerate deterministically.

## Stage 4: Pilot Rollout

- Limited user rollout with monitoring.
- Track:
  - install success
  - route success
  - pack update success
  - crash-free sessions
- Run hotfix-only cadence during pilot.

Exit gate:
- Pilot SLOs stable for launch window.

## Stage 5: GA Launch

- Promote RC to GA tag.
- Publish release notes.
- Enable standard update cadence and post-launch QA sweeps.

Exit gate:
- GA build available and verified with same artifact hashes used in final validation.
