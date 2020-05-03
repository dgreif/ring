import { createHash } from 'crypto'

export function generateMacAddress(uuid: string) {
  const sha1sum = createHash('sha1')
  sha1sum.update(uuid)
  const s = sha1sum.digest('hex')

  let i = 0
  return 'xx:xx:xx:xx:xx:xx'.replace(/[x]/g, () => s[i++]).toUpperCase()
}
