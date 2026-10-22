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
  hubDisconnectionMessage,
  sessionInfoMessage,
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
    expect(types).toContain(RingDeviceType.BaseStation)
    expect(types).toContain(RingDeviceType.Keypad)
    expect(types).toContain(RingDeviceType.ContactSensor)
    expect(types).toContain(RingDeviceType.MotionSensor)
    expect(types).toContain(RingDeviceType.FloodFreezeSensor)
    expect(types).toContain(RingDeviceType.FreezeSensor)
    expect(types).toContain(RingDeviceType.TemperatureSensor)
    expect(types).toContain(RingDeviceType.WaterSensor)
    expect(types).toContain(RingDeviceType.TiltSensor)
    expect(types).toContain(RingDeviceType.GlassbreakSensor)
    expect(types).toContain(RingDeviceType.SmokeAlarm)
    expect(types).toContain(RingDeviceType.CoAlarm)
    expect(types).toContain(RingDeviceType.SmokeCoListener)
    expect(types).toContain(RingDeviceType.KiddeSmokeCoAlarm)
    expect(types).toContain(RingDeviceType.Thermostat)
    expect(types).toContain(RingDeviceType.WaterValve)
    expect(types).toContain(RingDeviceType.UnknownZWave)
    expect(types).toContain(RingDeviceType.RetrofitZone)
    expect(types).toContain(RingDeviceType.Switch)
    expect(types).toContain(RingDeviceType.MultiLevelSwitch)
    expect(types).toContain(RingDeviceType.BeamsSwitch)
    expect(types).toContain(RingDeviceType.BeamsMultiLevelSwitch)
    expect(types).toContain(RingDeviceType.BeamsLightGroupSwitch)
    expect(types).toContain(RingDeviceType.BeamsMotionSensor)
    expect(types).toContain(RingDeviceType.BeamsTransformerSwitch)
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

  it('tracks SessionInfo offline/online and re-requests device list on recovery', async () => {
    const devicesPromise = location.getDevices()
    await vi.waitFor(() => expect(MockWebSocket.latest()).toBeTruthy())
    const socket = MockWebSocket.latest()!
    await vi.waitFor(() => expect(socket.sent.length).toBeGreaterThanOrEqual(2))

    socket.receive(deviceListMessage(BASE_ASSET_UUID, alarmDeviceList))
    socket.receive(deviceListMessage(BEAM_ASSET_UUID, beamDeviceList))
    await devicesPromise

    const sentBeforeOffline = socket.sent.length

    socket.receive(
      sessionInfoMessage([
        {
          assetUuid: BASE_ASSET_UUID,
          connectionStatus: 'cell-backup',
          doorbotId: 3001,
          kind: 'base_station_v1',
          sessionId: 1,
        },
      ]),
    )

    await vi.waitFor(() =>
      expect(location.offlineAssets).toContain(BASE_ASSET_UUID),
    )

    socket.receive(
      sessionInfoMessage([
        {
          assetUuid: BASE_ASSET_UUID,
          connectionStatus: 'online',
          doorbotId: 3001,
          kind: 'base_station_v1',
          sessionId: 2,
        },
      ]),
    )

    await vi.waitFor(() =>
      expect(location.offlineAssets).not.toContain(BASE_ASSET_UUID),
    )
    await vi.waitFor(() =>
      expect(socket.sent.length).toBeGreaterThan(sentBeforeOffline),
    )

    const lastSent = JSON.parse(socket.sent[socket.sent.length - 1]!)
    expect(lastSent.msg.msg).toBe('DeviceInfoDocGetList')
    expect(lastSent.msg.dst).toBe(BASE_ASSET_UUID)
  })

  it('reconnects the websocket on HubDisconnectionEventType', async () => {
    vi.useFakeTimers()
    try {
      location.getConnection().catch(() => undefined)
      await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(1))
      // Allow the open microtask to run
      await Promise.resolve()
      await vi.waitFor(() => expect(location.onConnected.getValue()).toBe(true))

      const firstSocket = MockWebSocket.latest()!
      firstSocket.receive(hubDisconnectionMessage())

      // reconnect() closes the socket and waits 1s before creating a new one
      await vi.advanceTimersByTimeAsync(1100)
      await vi.waitFor(() => expect(MockWebSocket.instances.length).toBe(2))
      await Promise.resolve()
      await vi.waitFor(() => expect(location.onConnected.getValue()).toBe(true))
    } finally {
      vi.useRealTimers()
    }
  })
})
