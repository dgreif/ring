# Releases

Release publishing happens in GitHub Actions on `main`. Do not publish locally.
Feature and fix PRs should include Changesets as usual.

## Beta releases

1. Run **Manage beta** on `main` with **Start beta** selected. Review and merge
   the resulting pull request to enter Changesets beta mode. Existing Changesets
   will be included in the first beta.
2. Review and merge the **Version Packages (beta)** pull request to publish to
   npm's `beta` dist-tag. The `latest` tag is not changed.
3. Merge more changes with Changesets into `main` and merge the updated version
   pull request to publish the next beta. Changesets used in betas are retained
   in `.changeset/pre/` for the stable changelog.

## Stable release

1. Run **Manage beta** on `main` with **Exit beta** selected. Review and merge
   the resulting pull request. This only marks the cycle for exit; it does not
   publish.
2. Review and merge the resulting **Version Packages** pull request. It combines
   the retained Changesets into the stable changelog, preserves the beta entries,
   and removes `.changeset/pre.json`. CI publishes to npm's `latest` dist-tag.

Review the version pull request after changing modes; do not merge an outdated
beta version pull request during exit. The `beta` dist-tag remains on the last
beta until another beta is published. A stable patch during an active beta
requires a separate maintenance branch.

Outside a beta cycle, merge the normal **Version Packages** pull request to
publish a stable release.

## Publishing prerequisites

- `GH_TOKEN_CHANGESETS` must be available to Actions with permission to push
  release branches and create pull requests, tags, and releases. It is exposed
  only to steps that need those permissions.
- Configure npm Trusted Publishing for **both** `homebridge-ring` and
  `ring-client-api`, allowing the GitHub Actions workflow `release.yml` in
  `dgreif/ring`. Only the publish job receives `id-token: write` for npm OIDC.
