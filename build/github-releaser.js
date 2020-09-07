require('dotenv/config')
const conventionalGithubReleaser = require('conventional-github-releaser')

conventionalGithubReleaser(
  {
    type: 'oauth',
    url: 'https://api.github.com/',
    token: process.env.GITHUB_TOKEN,
  },
  {
    preset: 'angular',
  },
  (e, release) => {
    if (e) {
      // eslint-disable-next-line no-console
      console.error(e)
      process.exit(1)
    }

    // eslint-disable-next-line no-console
    console.log(release)
    process.exit(0)
  }
)
