let ffmpegPath: string | undefined

export function setFfmpegPath(path: string) {
  ffmpegPath = path
}

export function getFfmpegPath() {
  return ffmpegPath
}
