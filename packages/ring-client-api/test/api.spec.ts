import { RingApi } from '../api.ts'
import { describe, expect, it, vi } from 'vitest'

const ownedDoorbell = {
    id: 1,
    kind: 'cocoa_doorbell',
    description: 'Owned Doorbell',
    location_id: 'owned-location',
  },
  sharedDoorbell = {
    id: 2,
    kind: 'lpd_v2',
    description: 'Shared Doorbell',
    location_id: 'shared-location',
  },
  sharedFloodlight = {
    id: 3,
    kind: 'osprey_floodlight',
    description: 'Shared Floodlight',
    location_id: 'shared-location',
  },
  // A factory, because `fetchRingDevices` pushes shared devices into these
  // arrays - sharing one literal between tests leaks state.
  legacyDevices = (doorbots: unknown[] = []) => ({
    doorbots,
    chimes: [],
    authorized_doorbots: [],
    stickup_cams: [],
    base_stations: [],
    beams_bridges: [],
    other: [],
  })

function createApi(handlers: Record<string, () => unknown>) {
  const api = new RingApi({ refreshToken: 'test' }),
    respond = ({ url }: { url: string }) => {
      for (const path in handlers) {
        if (url.includes(path)) {
          return Promise.resolve(handlers[path]())
        }
      }
      throw new Error(`Unexpected request to ${url}`)
    }

  // `request` is generic over its response type, which a mock cannot satisfy
  // without knowing every call site's type argument.
  vi.spyOn(api.restClient, 'request').mockImplementation(
    respond as unknown as typeof api.restClient.request,
  )

  return api
}

describe('Ring API', () => {
  describe('locations', () => {
    it('should include locations shared by another owner', async () => {
      const api = createApi({
          'location_info/v3/locations': () => ({
            user_locations: [
              { location_id: 'owned-location', is_owner: true },
              { location_id: 'shared-location', is_owner: false },
            ],
          }),
        }),
        locations = await api.fetchRawLocations()

      expect(locations.map((location) => location.location_id)).toEqual([
        'owned-location',
        'shared-location',
      ])
    })

    it('should fall back to the legacy endpoint', async () => {
      const api = createApi({
          'location_info/v3/locations': () => {
            throw new Error('404 Not Found')
          },
          'devices/v1/locations': () => ({
            user_locations: [{ location_id: 'owned-location' }],
          }),
        }),
        locations = await api.fetchRawLocations()

      expect(locations.map((location) => location.location_id)).toEqual([
        'owned-location',
      ])
    })
  })

  describe('devices', () => {
    it('should add shared cameras the legacy endpoint omits', async () => {
      const api = createApi({
          ring_devices: () => legacyDevices([ownedDoorbell]),
          'device_info/v3/devices': () => ({
            devices: [ownedDoorbell, sharedDoorbell, sharedFloodlight],
          }),
        }),
        { allCameras, authorizedDoorbots, stickupCams } =
          await api.fetchRingDevices()

      // The owned doorbell must not be duplicated by the shared lookup.
      expect(allCameras.map((camera) => camera.id)).toEqual([1, 3, 2])
      expect(authorizedDoorbots.map((camera) => camera.id)).toEqual([2])
      expect(stickupCams.map((camera) => camera.id)).toEqual([3])
    })

    it('should keep owned devices when the shared lookup fails', async () => {
      const api = createApi({
          ring_devices: () => legacyDevices([ownedDoorbell]),
          'device_info/v3/devices': () => {
            throw new Error('500 Internal Server Error')
          },
        }),
        { allCameras } = await api.fetchRingDevices()

      expect(allCameras.map((camera) => camera.id)).toEqual([1])
    })
  })
})
