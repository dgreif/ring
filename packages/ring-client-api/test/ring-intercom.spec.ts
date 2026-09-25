import { Subject } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'
import { RingIntercom } from '../ring-intercom.ts'
import type { RingRestClient } from '../rest-client.ts'
import type { IntercomHandsetData } from '../ring-types.ts'

function createRestClient() {
  const onSession = new Subject<undefined>(),
    request = vi.fn().mockResolvedValue(undefined),
    restClient = { onSession, request } as unknown as RingRestClient

  return { onSession, request, restClient }
}

function createIntercomData(subscribed: boolean) {
  return {
    id: 123,
    kind: 'intercom_handset_audio',
    description: 'Front Door',
    subscribed,
    battery_life: 100,
    alerts: { connection: 'online' },
  } as unknown as IntercomHandsetData
}

const subscribeRequest = {
  method: 'POST',
  url: expect.stringContaining('doorbots/123/subscribe'),
}

describe('Ring Intercom', () => {
  describe('ding event subscription', () => {
    it('subscribes to ding events on creation', () => {
      const { request, restClient } = createRestClient()

      new RingIntercom(createIntercomData(false), restClient)

      expect(request).toHaveBeenCalledWith(subscribeRequest)
    })

    it('subscribes even when the api reports an existing subscription', () => {
      // The `subscribed` flag can be stale: the api reports an existing
      // subscription while it is still bound to a push token that is no longer
      // registered, in which case no ding notifications are delivered.
      const { request, restClient } = createRestClient()

      new RingIntercom(createIntercomData(true), restClient)

      expect(request).toHaveBeenCalledWith(subscribeRequest)
    })

    it('subscribes again when a new session is created', () => {
      vi.useFakeTimers()

      try {
        const { onSession, request, restClient } = createRestClient()

        new RingIntercom(createIntercomData(true), restClient)
        expect(request).toHaveBeenCalledTimes(1)

        // Throttled, so a session created by these api calls does not double up
        onSession.next(undefined)
        expect(request).toHaveBeenCalledTimes(1)

        vi.advanceTimersByTime(1100)
        onSession.next(undefined)

        expect(request).toHaveBeenCalledTimes(2)
        expect(request).toHaveBeenLastCalledWith(subscribeRequest)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
