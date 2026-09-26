import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { RingApi } from '../api.ts'
import { RingCamera } from '../ring-camera.ts'
import { RingChime } from '../ring-chime.ts'
import { RingIntercom } from '../ring-intercom.ts'
import { locationsResponse, LOCATION_ID } from './fixtures/locations.ts'
import {
  buildRingDevicesResponse,
  doorbellCamera,
  stickupCamera,
  chimeDevice,
  intercomDevice,
  onvifCamera,
} from './fixtures/ring-devices.ts'
import { createMockRestClient } from './fixtures/mock-websocket.ts'
import { clientApi, deviceApi } from '../rest-client.ts'

vi.mock('@eneris/push-receiver', () => ({
  PushReceiver: class {
    on() {
      return this
    }
    onCredentialsChanged() {
      return this
    }
    onNotification() {
      return this
    }
    connect() {
      return Promise.resolve()
    }
    whenReady = Promise.resolve()
  },
}))

describe('RingApi device discovery from location endpoints', () => {
  let restClient: ReturnType<typeof createMockRestClient>, api: RingApi

  beforeEach(() => {
    restClient = createMockRestClient(({ url }) => {
      if (url === deviceApi('locations')) {
        return Promise.resolve(locationsResponse)
      }
      if (url === clientApi('ring_devices')) {
        return Promise.resolve(buildRingDevicesResponse())
      }
      return Promise.resolve({})
    })

    api = new RingApi({ refreshToken: 'test-refresh' })
    // Replace the real rest client so we never hit the network
    ;(api as any).restClient = restClient
  })

  afterEach(() => {
    api.disconnect()
  })

  it('builds locations with cameras, chimes, and intercoms from ring_devices', async () => {
    const locations = await api.getLocations()

    expect(locations).toHaveLength(1)
    const location = locations[0]
    expect(location.locationId).toBe(LOCATION_ID)
    expect(location.name).toBe('Home')

    expect(location.cameras.map((c) => c.id).sort()).toEqual(
      [doorbellCamera.id, stickupCamera.id, onvifCamera.id].sort(),
    )
    expect(location.cameras.every((c) => c instanceof RingCamera)).toBe(true)

    expect(location.chimes).toHaveLength(1)
    expect(location.chimes[0]).toBeInstanceOf(RingChime)
    expect(location.chimes[0].id).toBe(chimeDevice.id)

    expect(location.intercoms).toHaveLength(1)
    expect(location.intercoms[0]).toBeInstanceOf(RingIntercom)
    expect(location.intercoms[0].id).toBe(intercomDevice.id)
  })

  it('marks locations with base stations / beam bridges as having hubs', async () => {
    const [location] = await api.getLocations()
    expect(location.hasHubs).toBe(true)
    expect(location.hasAlarmBaseStation).toBe(true)
  })

  it('treats doorbots and doorbell* kinds as doorbots', async () => {
    const [location] = await api.getLocations(),
      frontDoor = location.cameras.find((c) => c.id === doorbellCamera.id)!,
      garage = location.cameras.find((c) => c.id === stickupCamera.id)!

    expect(frontDoor.isDoorbot).toBe(true)
    expect(garage.isDoorbot).toBe(false)
  })

  it('partitions other devices into onvif / intercom / unknown', async () => {
    const devices = await api.fetchRingDevices()
    expect(devices.onvifCameras.map((d) => d.id)).toEqual([onvifCamera.id])
    expect(devices.intercoms.map((d) => d.id)).toEqual([intercomDevice.id])
    expect(devices.allCameras.map((d) => d.id).sort()).toEqual(
      [doorbellCamera.id, stickupCamera.id, onvifCamera.id].sort(),
    )
  })

  it('returns empty hub flags when location has no base station or beam bridge', async () => {
    restClient.request.mockImplementation(({ url }: { url: string }) => {
      if (url === deviceApi('locations')) {
        return Promise.resolve(locationsResponse)
      }
      if (url === clientApi('ring_devices')) {
        return Promise.resolve(
          buildRingDevicesResponse({
            base_stations: [],
            beams_bridges: [],
          }),
        )
      }
      return Promise.resolve({})
    })

    // Fresh api so locationsPromise is unset
    const apiNoHub = new RingApi({ refreshToken: 'test-refresh' })
    ;(apiNoHub as any).restClient = restClient

    const [location] = await apiNoHub.getLocations()
    expect(location.hasHubs).toBe(false)
    expect(location.hasAlarmBaseStation).toBe(false)
    expect(await location.getDevices()).toEqual([])

    apiNoHub.disconnect()
  })

  it('respects locationIds filter', async () => {
    const filtered = new RingApi({
      refreshToken: 'test-refresh',
      locationIds: ['other-loc'],
    })
    ;(filtered as any).restClient = restClient

    const locations = await filtered.getLocations()
    expect(locations).toHaveLength(0)
    filtered.disconnect()
  })
})
