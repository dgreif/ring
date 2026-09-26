import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { firstValueFrom } from 'rxjs'
import { take } from 'rxjs/operators'
import { Location } from '../location.ts'
import { RingDeviceType } from '../ring-types.ts'
import { userLocation } from './fixtures/locations.ts'
import {
  BASE_ASSET_UUID,
  BEAM_ASSET_UUID,
  alarmDeviceList,
  beamDeviceList,
  clapTicketResponse,
  dataUpdateMessage,
  deviceListMessage,
  hubDeviceDocs,
} from './fixtures/hub-devices.ts'
import {
  MockWebSocket,
  createMockRestClient,
} from './fixtures/mock-websocket.ts'
import { appApi } from '../rest-client.ts'

vi.mock('undici', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>,
    { MockWebSocket: Ws } = await import('./fixtures/mock-websocket.ts')
  return {
    ...actual,
    WebSocket: Ws,
  }
})

describe('Location hub websocket', () => {
  let restClient: ReturnType<typeof createMockRestClient>, location: Location

  beforeEach(() => {
    MockWebSocket.reset()
    restClient = createMockRestClient(({ url }) => {
      if (url.includes('clap/tickets')) {
        return Promise.resolve(clapTicketResponse)
      }
      return Promise.resolve({})
    })
    location = new Location(
      userLocation,
      [],
      [],
      [],
      { hasHubs: true, hasAlarmBaseStation: true },
      restClient as any,
    )
  })

  afterEach(() => {
    location.disconnect()
  })

  it('requests clap ticket and connects with authcode', async () => {
    const devicesPromise = location.getDevices()
    await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1))

    const socket = MockWebSocket.latest()!
    expect(socket.url).toBe(
      `wss://${clapTicketResponse.host}/ws?authcode=${clapTicketResponse.ticket}&ack=false`,
    )
    expect(restClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: appApi(
          `clap/tickets?locationID=${userLocation.location_id}&enableExtendedEmergencyCellUsage=true&requestedTransport=ws`,
        ),
      }),
    )

    await vi.waitFor(() => expect(socket.sent.length).toBeGreaterThanOrEqual(2))

    socket.receive(deviceListMessage(BASE_ASSET_UUID, alarmDeviceList))
    socket.receive(deviceListMessage(BEAM_ASSET_UUID, beamDeviceList))

    const devices = await devicesPromise
    expect(devices.length).toBe(alarmDeviceList.length + beamDeviceList.length)
  })

  it('discovers representative alarm and beam device types', async () => {
    const devicesPromise = location.getDevices()
    await vi.waitFor(() => expect(MockWebSocket.latest()).toBeTruthy())
    const socket = MockWebSocket.latest()!
    await vi.waitFor(() => expect(socket.sent.length).toBeGreaterThanOrEqual(2))

    socket.receive(deviceListMessage(BASE_ASSET_UUID, alarmDeviceList))
    socket.receive(deviceListMessage(BEAM_ASSET_UUID, beamDeviceList))

    const devices = await devicesPromise,
      types = devices.map((d) => d.deviceType)

    expect(types).toContain(RingDeviceType.SecurityPanel)
    expect(types).toContain(RingDeviceType.ContactSensor)
    expect(types).toContain(RingDeviceType.MotionSensor)
    expect(types).toContain(RingDeviceType.FloodFreezeSensor)
    expect(types).toContain(RingDeviceType.SmokeAlarm)
    expect(types).toContain(RingDeviceType.CoAlarm)
    expect(types).toContain(RingDeviceType.Thermostat)
    expect(types).toContain(RingDeviceType.WaterValve)
    expect(types).toContain(RingDeviceType.BeamsSwitch)
    expect(types).toContain(RingDeviceType.BeamsMultiLevelSwitch)
    expect(types).toContain(RingDeviceType.BeamsLightGroupSwitch)
    expect(types).toContain('lock')

    const contact = devices.find((d) => d.zid === 'zid-contact')!
    expect(contact.data.faulted).toBe(false)
    expect(contact.data.name).toBe('Front Door Contact')
  })

  it('applies live DataUpdate to existing RingDevice.onData', async () => {
    const devicesPromise = location.getDevices()
    await vi.waitFor(() => expect(MockWebSocket.latest()).toBeTruthy())
    const socket = MockWebSocket.latest()!
    await vi.waitFor(() => expect(socket.sent.length).toBeGreaterThanOrEqual(2))

    socket.receive(deviceListMessage(BASE_ASSET_UUID, alarmDeviceList))
    socket.receive(deviceListMessage(BEAM_ASSET_UUID, beamDeviceList))
    const devices = await devicesPromise,
      contact = devices.find((d) => d.zid === 'zid-contact')!,
      nextData = firstValueFrom(contact.onData.pipe(take(2))).then(
        () => contact.data,
      )

    socket.receive(
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
      ]),
    )

    await nextData
    expect(contact.data.faulted).toBe(true)
  })

  it('sets onConnected true after socket open', async () => {
    expect(location.onConnected.getValue()).toBe(false)
    location.getConnection().catch(() => undefined)
    await vi.waitFor(() => expect(location.onConnected.getValue()).toBe(true))
  })

  it('rejects getConnection when location has no hubs', async () => {
    const noHub = new Location(
      userLocation,
      [],
      [],
      [],
      { hasHubs: false, hasAlarmBaseStation: false },
      restClient as any,
    )
    await expect(noHub.getConnection()).rejects.toThrow(
      /does not have any hubs/,
    )
    noHub.disconnect()
  })
})
