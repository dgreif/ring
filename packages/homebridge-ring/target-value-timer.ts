export class TargetValueTimer<T> {
  private timeout: number | undefined
  private targetValue: T | undefined

  setTarget(value: T, duration: number) {
    this.reset()

    this.targetValue = value
    this.timeout = setTimeout(() => {
      this.reset()
    }, duration) as any as number
  }

  hasTarget() {
    return this.timeout !== undefined
  }

  getTarget() {
    return this.targetValue as T
  }

  reset() {
    if (this.timeout !== undefined) {
      clearTimeout(this.timeout)
    }

    this.targetValue = undefined
    this.timeout = undefined
  }
}
