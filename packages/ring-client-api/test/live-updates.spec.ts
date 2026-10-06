import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { firstValueFrom } from 'rxjs'
import { filter, take } from 'rxjs/operators'
import { RingApi } from '../api.ts'
import { RingCamera } from '../ring-camera.ts'
import { Location } from '../location.ts'
import { RingDevice } from '../ring-device.ts'
import { PushNotificationAction } from '../ring-types.ts'
import { locationsResponse, userLocation } from './fixtures/locations.ts'
import {
  buildRingDevicesResponse,
  doorbellCamera,
  stickupCamera,
} from './fixtures/ring-devices.ts'
import {
  BASE_ASSET_UUID,
  dataUpdateMessage,
  hubDeviceDocs,
} from './fixtures/hub-devices.ts'
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

function mockRestForCamera() {
  return createMockRestClient(() => Promise.resolve({})) as any
}

describe('Live updates — camera / chime polling', () => {
  let restClient: ReturnType<typeof createMockRestClient>,
    api: RingApi,
    ringDevicesCall = 0

  beforeEach(() => {
    ringDevicesCall = 0
    restClient = createMockRestClient(({ url }) => {
      if (url === deviceApi('locations')) {
        return Promise.resolve(locationsResponse)
      }
      if (url === clientApi('ring_devices')) {
        ringDevicesCall++
        const base = buildRingDevicesResponse()
        if (ringDevicesCall > 1) {
          return Promise.resolve({
            ...base,
            stickup_cams: [
              {
                ...stickupCamera,
                led_status: 'on',
                battery_life: '50',
              },
            ],
          })
        }
        return Promise.resolve(base)
      }
      return Promise.resolve({})
    })

    api = new RingApi({
      refreshToken: 'test-refresh',
      cameraStatusPollingSeconds: 0.05,
    })
    ;(api as any).restClient = restClient
  })

  afterEach(() => {
    api.disconnect()
  })

  it('polls ring_devices and pushes updates into camera.onData', async () => {
    const [location] = await api.getLocations(),
      garage = location.cameras.find((c) => c.id === stickupCamera.id)!

    expect(garage.data.led_status).toBe('off')

    const updated = await firstValueFrom(
      garage.onData.pipe(
        filter((d) => (d as any).led_status === 'on'),
        take(1),
      ),
    )

    expect((updated as any).led_status).toBe('on')
    expect((updated as any).battery_life).toBe('50')
    expect(ringDevicesCall).toBeGreaterThan(1)
  })

  it('refetches when a device requests an update', async () => {
    const [location] = await api.getLocations(),
      frontDoor = location.cameras.find((c) => c.id === doorbellCamera.id)!

    // Wait until polling has started at least once
    await vi.waitFor(() => expect(ringDevicesCall).toBeGreaterThanOrEqual(1))
    const before = ringDevicesCall

    frontDoor.requestUpdate()

    await vi.waitFor(() => expect(ringDevicesCall).toBeGreaterThan(before))
  })
})

describe('Live updates — hub DataUpdate without full socket', () => {
  it('RingDevice receives location.onDeviceDataUpdate for matching zid', async () => {
    const restClient = createMockRestClient(),
      location = new Location(
        userLocation,
        [],
        [],
        [],
        { hasHubs: true, hasAlarmBaseStation: true },
        restClient as any,
      )

    location.assets = [
      {
        doorbotId: 1,
        kind: 'base_station_v1',
        onBattery: false,
        status: 'online',
        uuid: BASE_ASSET_UUID,
      },
    ]

    // Seed device list through onMessage (same path as WS)
    location.onMessage.next({
      msg: 'DeviceInfoDocGetList',
      datatype: 'DeviceInfoDocType',
      src: BASE_ASSET_UUID,
      body: [hubDeviceDocs.contactSensor],
    })

    const devices = await firstValueFrom(location.onDevices),
      contact = devices.find((d) => d.zid === 'zid-contact')!
    expect(contact).toBeInstanceOf(RingDevice)

    const updatePromise = firstValueFrom(
      contact.onData.pipe(
        filter((d) => d.faulted === true),
        take(1),
      ),
    )

    location.onDataUpdate.next(
      dataUpdateMessage(BASE_ASSET_UUID, [
        {
          ...hubDeviceDocs.contactSensor,
          general: {
            v2: {
              ...hubDeviceDocs.contactSensor.general.v2,
              faulted: true,
            },
          },
        },
      ]).msg,
    )

    expect((await updatePromise).faulted).toBe(true)
    location.disconnect()
  })
})

describe('Live updates — camera push notifications', () => {
  it('processPushNotification emits motion on onMotionDetected', async () => {
    const camera = new RingCamera(
        doorbellCamera as any,
        true,
        mockRestForCamera(),
        false,
      ),
      motionPromise = firstValueFrom(
        camera.onMotionDetected.pipe(
          filter((m) => m === true),
          take(1),
        ),
      )

    camera.processPushNotification({
      version: '2.0.0',
      android_config: {
        category: PushNotificationAction.Motion,
        body: 'Motion detected at Front Door',
      },
      analytics: {
        server_correlation_id: 'c1',
        server_id: 'com.ring.pns',
        subcategory: 'motion',
        triggered_at: 0,
        sent_at: 0,
        referring_item_type: 'device',
        referring_item_id: '1001',
      },
      data: {
        device: {
          e2ee_enabled: false,
          id: 1001,
          kind: 'lpd_v1',
          name: 'Front Door',
        },
        event: {
          ding: {
            id: 'ding-uuid-1',
            created_at: '2024-01-01T00:00:00Z',
            subtype: 'motion',
            detection_type: 'motion',
          },
          eventito: { type: 'motion', timestamp: 0 },
          riid: 'r1',
          is_sidewalk: false,
          live_session: {
            streaming_data_hash: 'h',
            active_streaming_profile: 'rms',
            default_audio_route: 'speaker',
            max_duration: 60,
          },
        },
        location: { id: userLocation.location_id },
      },
    } as any)

    expect(await motionPromise).toBe(true)
  })
})
