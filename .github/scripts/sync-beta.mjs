import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function readAt(ref, path) {
  return JSON.parse(git('show', `${ref}:${path}`))
}

function hasAt(ref, path) {
  return git('ls-tree', '--name-only', ref, '--', path) !== ''
}

function report(message) {
  console.log(message)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`)
  }
}

if (git('status', '--porcelain')) {
  throw new Error('Beta sync requires a clean checkout.')
}

git(
  'fetch',
  '--no-tags',
  'origin',
  '+refs/heads/main:refs/remotes/origin/main',
  '+refs/heads/beta:refs/remotes/origin/beta',
)

const main = git('rev-parse', 'refs/remotes/origin/main')
const beta = git('rev-parse', 'refs/remotes/origin/beta')
const configPath = '.changeset/config.json'
const prePath = '.changeset/pre.json'
const mainConfig = readAt(main, configPath)
const betaConfig = readAt(beta, configPath)

if (mainConfig.baseBranch !== 'main' || hasAt(main, prePath)) {
  throw new Error('main must be in stable Changesets mode.')
}
if (betaConfig.baseBranch !== 'beta' || !hasAt(beta, prePath)) {
  throw new Error('No active beta cycle. Run Manage beta to initialize it.')
}

const pre = readAt(beta, prePath)
if (pre.mode !== 'pre' || pre.tag !== 'beta') {
  throw new Error('beta must be in active Changesets beta mode.')
}

const packages = ['ring-client-api', 'homebridge-ring'].map((name) => {
  const path = `packages/${name}/package.json`
  const stable = readAt(main, path)
  const prerelease = readAt(beta, path)
  if (
    stable.name !== name ||
    prerelease.name !== name ||
    !/^\d+\.\d+\.\d+$/.test(stable.version)
  ) {
    throw new Error(`Invalid stable package ${name}@${stable.version}.`)
  }
  return { name, stable: stable.version, prerelease: prerelease.version }
})

const base = git('merge-base', main, beta)
for (const { name, stable, prerelease } of packages) {
  if (readAt(base, `packages/${name}/package.json`).version !== stable) {
    throw new Error(
      `main has changed the stable version of ${name} to ${stable}. Select Start new cycle in Manage beta.`,
    )
  }
  if (
    prerelease !== stable &&
    !/^\d+\.\d+\.\d+-beta\.\d+$/.test(prerelease)
  ) {
    throw new Error(`Invalid beta package ${name}@${prerelease}.`)
  }
}

git('switch', '--detach', beta)
console.log(git('merge', '--no-ff', '--no-edit', main))

const mergedPre = JSON.parse(readFileSync(prePath, 'utf8'))
const mergedConfig = JSON.parse(readFileSync(configPath, 'utf8'))
if (
  JSON.stringify(mergedPre) !== JSON.stringify(pre) ||
  mergedConfig.baseBranch !== 'beta'
) {
  throw new Error('Sync changed the beta prerelease state; refusing to push.')
}

// An ordinary fast-forward push refuses concurrent beta updates.
git('push', 'origin', 'HEAD:refs/heads/beta')
report(
  'Synced main into beta. Merge the resulting Version Packages (beta) PR to publish the next beta.',
)
