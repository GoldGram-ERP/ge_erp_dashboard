# Versioning

Every new build carries a version bump of 0.0.1 (the owner's rule, 2026-11-04). The skill `/vv` holds the flow.

- Release number: `version` in `package.json` (patch +1 per build). Stamp: `X.Y.Z+<commit>`, shown at the foot of the sidebar (`v1.0.1+ab12cd3`).
- `npm run release` bumps, commits "Version X.Y.Z" and tags `vX.Y.Z`. Then `git push origin main --follow-tags`.
- `npm run pack:hostinger` packs only the commit tagged exactly `v<package version>`; an un-bumped commit is refused.
- The backend has its own version, internal, never shown on a screen.

## What's new (the changelog the Admin sees)

Every release carries its lines in `changelog/changelog.json`. Add them as you land a change, never by editing code:
`node scripts/changelog.mjs add --kind new|better|fixed --en "..." --ar "..." [--route /menu/address]`.
`npm run release` stamps the unreleased block with the new version and date, and refuses to cut a release with no lines (`--skip-changelog` when nobody sees the change). `node scripts/changelog.mjs check` and the Vitest keep the file valid.
