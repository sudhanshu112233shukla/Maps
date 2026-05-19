# RC Freeze Checklist (Stage 1)

Scope: This checklist defines the minimum bar for cutting a release-candidate snapshot from `main`.

## Freeze Rules

- No feature work after freeze; only crash/data-integrity/UX blockers.
- Pack manifests, delta manifests, catalog and readiness files are treated as release inputs.
- Any change to release inputs requires re-freezing and regenerating the lockfile.

## Pre-Freeze Gates

- `npm.cmd run selfcheck:all` passes.
- Android debug assemble passes on Windows:
  - `npm.cmd run android:assemble:debug:g`

## Freeze Actions

1. Generate lockfile:
   - `npm.cmd run release:freeze`
2. Re-run integrity:
   - `npm.cmd run selfcheck:rc-freeze`
   - `npm.cmd run selfcheck:all`
3. Tag RC (optional, manual):
   - `git tag v1.0.0-rc1`
   - `git push origin v1.0.0-rc1`

## Freeze Outputs

- `public/data/releases/rc.lock.json` exists and matches `HEAD`.
- `public/data/releases/catalog.json` + `public/data/releases/readiness.json` match the locked hashes.
- For every released region:
  - `/data/packs/<region>.manifest.json` hash matches lockfile.
  - `/data/packs/<region>.delta.json` hash matches lockfile.

