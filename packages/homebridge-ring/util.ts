import { createHash } from 'crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function generateMacAddress(uuid: string) {
  const sha1sum = createHash('sha1')
  sha1sum.update(uuid)
  const s = sha1sum.digest('hex')

  let i = 0
  return 'xx:xx:xx:xx:xx:xx'.replace(/[x]/g, () => s[i++]).toUpperCase()
}

/**
 * The plugin's `media` directory, for a module at `moduleUrl` in the package
 * root (running from source) or in its `lib` directory (the build).
 */
export function getMediaDirectory(moduleUrl: string) {
  // fileURLToPath, not URL.pathname: on Windows the pathname is `/C:/...`, which
  // Node opens as `C:\C:\...`, and it keeps spaces as `%20` on every platform
  const directory = fileURLToPath(new URL('.', moduleUrl))
  return path.join(
    path.basename(directory) === 'lib' ? path.dirname(directory) : directory,
    'media',
  )
}
