import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestHiddenInput } from '../util.ts'

describe('requestHiddenInput', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads a line from the terminal without echoing it', async () => {
    const stdin = Object.assign(new PassThrough(), {
        isTTY: true,
        setRawMode: vi.fn(),
      }),
      stdoutWrite = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation(() => true)
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(
      stdin as unknown as typeof process.stdin,
    )

    const password = requestHiddenInput('Password: ')
    stdin.write(' hunter2\r')

    expect(await password).toBe('hunter2')
    expect(stdin.setRawMode).toHaveBeenCalledWith(true)
    expect(stdoutWrite.mock.calls.map(([chunk]) => chunk).join('')).toBe(
      'Password: \n',
    )
  })
})
