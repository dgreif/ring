import execa from 'execa'
import { spawn } from 'child_process'
import { logDebug } from './util'
import { Subject } from 'rxjs'

let ffmpegPath: string | undefined

export function setFfmpegPath(path: string) {
  ffmpegPath = path
}

export function getFfmpegPath() {
  return ffmpegPath || 'ffmpeg'
}

export async function doesFfmpegSupportCodec(codec: string) {
  const output = await execa(getFfmpegPath(), ['-codecs'])
  return output.stdout.includes(codec)
}

export class FfmpegProcess {
  private ff = spawn(
    getFfmpegPath(),
    this.ffOptions.map((x) => x.toString())
  )
  private onCloseSubject = new Subject()
  public readonly onClosed = this.onCloseSubject.asObservable()

  private stopped = false
  private closed = false
  constructor(
    private ffOptions: (string | number)[],
    private debugLabel: string
  ) {
    if (debugLabel) {
      this.ff.stderr.on('data', (data: any) => {
        logDebug(`ffmpeg stderr ${debugLabel}: ${data}`)
      })
    }

    this.ff.on('close', (code) => {
      this.closed = true
      this.onCloseSubject.next()
      logDebug(`ffmpeg ${debugLabel} exited with code ${code}`)
      this.stop()
    })

    process.on('SIGINT', this.stop)
    process.on('exit', this.stop)
  }

  stop = () => {
    if (this.stopped) {
      return
    }
    this.stopped = true

    this.ff.stderr.pause()
    this.ff.stdout.pause()

    if (!this.closed) {
      this.ff.kill()
    }

    process.off('SIGINT', this.stop)
    process.off('exit', this.stop)
  }

  start(input: string) {
    if (this.stopped) {
      return
    }

    this.ff.stdin.write(input)
    this.ff.stdin.end()
  }
}
