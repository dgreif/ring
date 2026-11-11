export class CliError extends Error {
  next: string[]
  code: string
  details?: unknown

  constructor(
    message: string,
    { next = [], code = 'error', details }: CliErrorOptions = {},
  ) {
    super(message)
    this.next = next
    this.code = code
    this.details = details
  }
}

interface CliErrorOptions {
  next?: string[]
  code?: string
  details?: unknown
}

export function printJson(value: unknown) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n')
}

export function printError(error: unknown) {
  if (error instanceof CliError) {
    printJson({
      ok: false,
      code: error.code,
      error: error.message,
      next: error.next,
      details: error.details,
    })
    return
  }

  const message = error instanceof Error ? error.message : String(error)
  printJson({
    ok: false,
    code: 'unexpected',
    error: message,
    stack: error instanceof Error ? error.stack : undefined,
    next: [
      'This is a bug in ring-ctl itself. Check `ring-ctl logs` for Homebridge output, then fix the CLI (see "Maintaining this skill" in SKILL.md).',
    ],
  })
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
