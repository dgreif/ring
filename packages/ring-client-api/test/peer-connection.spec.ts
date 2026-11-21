import { expect, it, vi } from 'vitest'
import { RTCPeerConnection } from 'werift'
import { WeriftPeerConnection } from '../streaming/peer-connection.ts'
import { enableDebug, useLogger } from '../util.ts'

it('logs routine ICE states only in debug mode and still emits closed', async () => {
  const addTransceiver = vi.spyOn(
      RTCPeerConnection.prototype,
      'addTransceiver',
    ),
    connection = new WeriftPeerConnection(),
    pc = addTransceiver.mock.contexts[0] as RTCPeerConnection,
    logInfo = vi.fn(),
    onConnectionState = vi.fn(),
    subscription = connection.onConnectionState.subscribe(onConnectionState),
    routineStates = [
      'new',
      'checking',
      'connected',
      'completed',
      'closed',
    ] as const

  addTransceiver.mockRestore()
  useLogger({ logInfo, logError: vi.fn() })

  function emitIceState(state: RTCPeerConnection['iceConnectionState']) {
    pc.iceConnectionStateChange.execute(state)
  }

  try {
    routineStates.forEach(emitIceState)

    expect(logInfo).not.toHaveBeenCalled()
    expect(onConnectionState.mock.calls).toEqual([['closed']])

    emitIceState('disconnected')
    emitIceState('failed')

    expect(logInfo.mock.calls).toEqual([
      ['iceConnectionStateChange: disconnected'],
      ['iceConnectionStateChange: failed'],
    ])

    logInfo.mockClear()
    enableDebug()

    routineStates.forEach(emitIceState)

    expect(logInfo.mock.calls).toEqual(
      routineStates.map((state) => [`iceConnectionStateChange: ${state}`]),
    )
    expect(onConnectionState.mock.calls).toEqual([['closed'], ['closed']])
  } finally {
    subscription.unsubscribe()
    await pc.close()
  }
})
