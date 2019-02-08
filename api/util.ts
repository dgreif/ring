export function delay(milliseconds: number) {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds)
  })
}

export function unique<T>(values: T[]) {
  return Array.from(new Set(values))
}
