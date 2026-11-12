# Releases

Release publishing happens in GitHub Actions. Do not use the local `changeset publish` command or the old `npm run deploy`, `npm run prepare-beta`, or `npm run exit-beta` scripts.

All feature and fix PRs land on `main` with their Changesets. The `beta` branch only receives changes from `main` plus its own beta version PRs, so `main` always has everything needed for the stable release.

## Beta releases

1. Merge the changes you want to test into `main`, including their Changesets.
2. In Actions, run **Manage beta** from `main` with **Update beta** selected. It creates and initializes `beta` if the branch does not exist; otherwise it syncs the latest `main` into the active beta cycle. This does not publish to npm.
3. The Release workflow creates a **Version Packages (beta)** pull request. Review and merge it to publish the beta versions to npm with the `beta` dist-tag. The `latest` tag is not changed.
4. To include more changes, run **Manage beta** again with **Update beta** selected. It merges the latest `main` into `beta`, preserving the prerelease state and version counter. Merge the resulting beta version pull request to publish the next beta.
5. To start a new cycle after a stable release, select **Start new cycle** and enter `START BETA`. This resets `beta` to the current stable `main`. Earlier betas stay reachable through their release tags.

Do not commit directly to `beta`. Anything that only exists on `beta` is dropped by **Start new cycle**. An update fails without pushing if there are merge conflicts or `main` has already released a new stable version. That failure does not reset the branch; start a new cycle explicitly when appropriate.

## Stable release

1. Run **Manage beta** with **Update beta** selected and merge the beta version pull request so the last beta matches `main`.
2. Merge the stable **Version Packages** pull request on `main`. The Release workflow publishes the stable versions from `main` with npm's `latest` dist-tag.

Leave the stable Version Packages pull request open while a beta cycle is active. After the stable release, `beta` stays as it is until the next **Start new cycle**. The npm `beta` dist-tag keeps pointing at the last beta until the next beta is published.

## Publishing prerequisites

- `GH_TOKEN_CHANGESETS` must be available to Actions with permission to push release branches and create pull requests/releases. It is only exposed to steps that push branches or create pull requests, tags, or releases.
- Beta initialization, reset, and sync pushes use `GH_TOKEN_CHANGESETS`, not `GITHUB_TOKEN`, so they trigger the Release workflow. The token also needs permission to update workflow files when syncing them (`workflow` scope for a classic PAT). Repository rules must permit this token's actor to push to `beta`, including force pushes for **Start new cycle**. Sync uses an ordinary non-force push.
- Configure npm Trusted Publishing for **both** `homebridge-ring` and `ring-client-api`, allowing the GitHub Actions workflow `release.yml` in `dgreif/ring`. The Release workflow grants `id-token: write` only to its publish job and publishes using npm OIDC.
