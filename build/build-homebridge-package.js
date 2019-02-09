const fs = require('fs')

const main = JSON.parse(fs.readFileSync('package.json'))
const homebridge = JSON.parse(fs.readFileSync('homebridge/package.json'))
const output = JSON.stringify(Object.assign(main, homebridge), null, 2)

fs.writeFileSync('release-homebridge/package.json', output)
