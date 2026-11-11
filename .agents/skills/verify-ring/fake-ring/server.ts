import { createHash, randomUUID } from 'node:crypto'
import { appendFileSync, readFileSync } from 'node:fs'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import type { Duplex } from 'node:stream'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { skillDir } from '../src/paths.ts'
import type { FakeHub, FakeScenario } from './types.ts'

const snapshotJpeg = readFileSync(
  join(skillDir, 'fake-ring/assets/snapshot.jpg'),
)
const fakeHubHost = 'fake-hub.ring.test'
const wsGuid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

export const fakeRefreshToken = 'fake-ring-refresh-token'

export async function loadScenario(nameOrPath: string) {
  const modulePath = /[/\\]|\.ts$|\.js$/.test(nameOrPath)
      ? nameOrPath
      : join(skillDir, 'fake-ring/scenarios', `${nameOrPath}.ts`),
    module = await import(pathToFileURL(modulePath).href),
    scenario: FakeScenario =
      typeof module.default === 'function' ? module.default() : module.default
  return scenario
}

interface RecordedRequest {
  ts: string
  method: string
  host: string
  path: string
  body?: unknown
  status?: number
}

interface FakeEvent {
  ts: string
  type: string
  [key: string]: unknown
}

interface HubClient {
  socket: Duplex
  send: (data: unknown) => void
}

function flatten(doc: any) {
  return { ...doc.general?.v2, ...doc.device?.v1 }
}

function encodeFrame(opcode: number, payload: Buffer) {
  const length = payload.length
  let header: Buffer
  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length])
  } else if (length < 65536) {
    header = Buffer.alloc(4)
    header[0] = 0x80 | opcode
    header[1] = 126
    header.writeUInt16BE(length, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x80 | opcode
    header[1] = 127
    header.writeBigUInt64BE(BigInt(length), 2)
  }
  return Buffer.concat([header, payload])
}

// Minimal RFC 6455 frame reader for the client side of the hub socket.
// Client frames are always masked; messages are small and unfragmented.
function createFrameReader(
  onMessage: (opcode: number, payload: Buffer) => void,
) {
  let buffer = Buffer.alloc(0)
  return (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])
    for (;;) {
      if (buffer.length < 2) {
        return
      }
      const opcode = buffer[0] & 0x0f,
        masked = (buffer[1] & 0x80) !== 0
      let length = buffer[1] & 0x7f,
        offset = 2
      if (length === 126) {
        if (buffer.length < 4) {
          return
        }
        length = buffer.readUInt16BE(2)
        offset = 4
      } else if (length === 127) {
        if (buffer.length < 10) {
          return
        }
        length = Number(buffer.readBigUInt64BE(2))
        offset = 10
      }
      const maskOffset = offset
      if (masked) {
        offset += 4
      }
      if (buffer.length < offset + length) {
        return
      }
      const payload = Buffer.from(buffer.subarray(offset, offset + length))
      if (masked) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= buffer[maskOffset + (i % 4)]
        }
      }
      buffer = buffer.subarray(offset + length)
      onMessage(opcode, payload)
    }
  }
}

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function parseMaybeJson(text: string) {
  if (!text) {
    return undefined
  }
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export interface FakeRingOptions {
  port: number
  scenario: FakeScenario
  scenarioName: string
  logFile?: string
}

export async function startFakeRing({
  port,
  scenario,
  scenarioName,
  logFile,
}: FakeRingOptions) {
  const requests: RecordedRequest[] = [],
    unhandled: RecordedRequest[] = [],
    events: FakeEvent[] = [],
    hubMessages: unknown[] = [],
    hubClients = new Set<HubClient>(),
    pushClients = new Set<ServerResponse>(),
    pushTokens: string[] = [],
    // Injected Ring errors (`ring-ctl emit ring-error`) to exercise the
    // plugin's failure paths. Each fails the next `remaining` matches.
    faults: {
      method?: string
      path: string
      pattern: RegExp
      status: number
      remaining: number
    }[] = []

  function log(entry: unknown) {
    if (logFile) {
      appendFileSync(logFile, JSON.stringify(entry) + '\n')
    }
  }

  function recordEvent(type: string, data: Record<string, unknown> = {}) {
    const event = { ts: new Date().toISOString(), type, ...data }
    events.push(event)
    if (events.length > 500) {
      events.shift()
    }
    log({ event })
    return event
  }

  // Ring merges partial settings updates (for example
  // `{chime_settings: {enable}}`) into the existing nested objects.
  function deepMerge(target: Record<string, any>, update: Record<string, any>) {
    for (const [key, value] of Object.entries(update)) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        target[key] &&
        typeof target[key] === 'object'
      ) {
        deepMerge(target[key], value)
      } else {
        target[key] = value
      }
    }
    return target
  }

  function allCameras() {
    const devices = scenario.ringDevices
    return [
      ...devices.doorbots,
      ...devices.authorized_doorbots,
      ...devices.stickup_cams,
      ...devices.other.filter((d) => d.kind && !d.kind.startsWith('intercom')),
    ]
  }

  function findDevice(id: string | number) {
    const devices = scenario.ringDevices
    return [
      ...allCameras(),
      ...devices.chimes,
      ...devices.other,
      ...devices.base_stations,
    ].find((d) => String(d.id) === String(id))
  }

  function findHubDoc(zid: string) {
    for (const hub of scenario.hubs) {
      const doc = hub.docs.find((d) => d.general?.v2?.zid === zid)
      if (doc) {
        return { hub, doc }
      }
    }
    return undefined
  }

  function broadcastHub(message: unknown) {
    for (const client of hubClients) {
      client.send(message)
    }
  }

  function broadcastDocUpdate(hub: FakeHub, doc: any) {
    broadcastHub({
      channel: 'DataUpdate',
      msg: {
        msg: 'DeviceInfoDocGetList',
        datatype: 'DeviceInfoDocType',
        src: hub.asset.uuid,
        body: [doc],
      },
    })
  }

  function updateHubDoc(zid: string, changes: Record<string, unknown>) {
    const found = findHubDoc(zid)
    if (!found) {
      return undefined
    }
    const { hub, doc } = found
    doc.device ??= { v1: {} }
    doc.device.v1 ??= {}
    for (const [key, value] of Object.entries(changes)) {
      if (doc.general?.v2 && key in doc.general.v2 && !(key in doc.device.v1)) {
        doc.general.v2[key] = value
      } else {
        doc.device.v1[key] = value
      }
    }
    broadcastDocUpdate(hub, doc)
    return flatten(doc)
  }

  function handleHubCommand(
    hub: FakeHub,
    zid: string,
    commandType: string,
    data: any,
  ) {
    recordEvent('hub-command', { zid, commandType, data })
    switch (commandType) {
      case 'security-panel.switch-mode':
        // Disarming silences an active alarm, like the real panel.
        updateHubDoc(
          zid,
          data?.mode === 'none'
            ? { mode: data.mode, alarmInfo: null }
            : { mode: data?.mode },
        )
        break
      case 'security-panel.sound-siren':
        recordEvent('siren', { zid, state: 'on' })
        updateHubDoc(zid, { siren: { state: 'on' } })
        break
      case 'security-panel.silence-siren':
        updateHubDoc(zid, { siren: { state: 'off' } })
        break
      case 'lock.lock':
        updateHubDoc(zid, { locked: 'locked' })
        break
      case 'lock.unlock':
        updateHubDoc(zid, { locked: 'unlocked' })
        break
      case 'light-mode.set':
        updateHubDoc(zid, { on: data?.lightMode === 'on' })
        break
      case 'valve.open':
        updateHubDoc(zid, { valveState: 'open' })
        break
      case 'valve.close':
        updateHubDoc(zid, { valveState: 'closed' })
        break
      default: {
        const found = findHubDoc(zid)
        if (found) {
          broadcastDocUpdate(hub, found.doc)
        }
      }
    }
  }

  function handleHubMessage(client: HubClient, raw: string) {
    const parsed = parseMaybeJson(raw) as any,
      message = parsed?.msg
    hubMessages.push(parsed)
    if (hubMessages.length > 500) {
      hubMessages.shift()
    }
    log({ hub: parsed })
    if (!message) {
      return
    }

    const hub = scenario.hubs.find((h) => h.asset.uuid === message.dst)
    switch (message.msg) {
      case 'DeviceInfoDocGetList':
        client.send({
          channel: 'message',
          msg: {
            msg: 'DeviceInfoDocGetList',
            datatype: 'DeviceInfoDocType',
            src: message.dst,
            body: hub?.docs ?? [],
          },
        })
        return
      case 'RoomGetList':
        client.send({
          channel: 'message',
          msg: {
            msg: 'RoomGetList',
            datatype: 'RoomListV2Type',
            src: message.dst,
            body: [],
          },
        })
        return
      case 'DeviceInfoSet':
        for (const item of message.body ?? []) {
          const commands = item.command?.v1 ?? []
          for (const command of commands) {
            handleHubCommand(hub!, item.zid, command.commandType, command.data)
          }
          if (item.device?.v1) {
            recordEvent('hub-set', { zid: item.zid, device: item.device.v1 })
            updateHubDoc(item.zid, item.device.v1)
          }
        }
        return
      default:
        recordEvent('hub-unhandled', { msg: message.msg, dst: message.dst })
    }
  }

  function acceptHubSocket(req: IncomingMessage, socket: Duplex) {
    const key = req.headers['sec-websocket-key']
    if (!key) {
      socket.destroy()
      return
    }
    const accept = createHash('sha1')
      .update(key + wsGuid)
      .digest('base64')
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    )

    const client: HubClient = {
      socket,
      send: (data) =>
        socket.write(encodeFrame(0x1, Buffer.from(JSON.stringify(data)))),
    }
    hubClients.add(client)
    recordEvent('hub-connected')

    socket.on(
      'data',
      createFrameReader((opcode, payload) => {
        if (opcode === 0x1) {
          handleHubMessage(client, payload.toString('utf8'))
        } else if (opcode === 0x8) {
          socket.end(encodeFrame(0x8, payload.subarray(0, 2)))
        } else if (opcode === 0x9) {
          socket.write(encodeFrame(0xa, payload))
        }
      }),
    )
    socket.on('close', () => {
      hubClients.delete(client)
      recordEvent('hub-disconnected')
    })
    socket.on('error', () => hubClients.delete(client))
  }

  function sendPush(notification: Record<string, unknown>) {
    const data = Object.fromEntries(
        Object.entries(notification).map(([k, v]) => [
          k,
          typeof v === 'string' ? v : JSON.stringify(v),
        ]),
      ),
      payload = `data: ${JSON.stringify({ data })}\n\n`
    for (const client of pushClients) {
      client.write(payload)
    }
    return pushClients.size
  }

  function buildDingNotification(
    camera: any,
    kind: 'ding' | 'motion',
    subtype?: string,
  ) {
    const now = Date.now(),
      dingId = String(
        BigInt(now) * 1000n + BigInt(Math.floor(Math.random() * 1000)),
      )
    return {
      version: '2.0.0',
      android_config: {
        category:
          kind === 'motion'
            ? 'com.ring.pn.live-event.motion'
            : String(camera.kind).startsWith('intercom')
            ? 'com.ring.pn.live-event.intercom'
            : 'com.ring.pn.live-event.ding',
        body: `There is ${
          kind === 'ding' ? 'someone at your' : 'motion at your'
        } ${camera.description}`,
      },
      analytics: {
        server_correlation_id: randomUUID(),
        server_id: 'com.ring.pns',
        subcategory: kind,
        triggered_at: now,
        sent_at: now,
        referring_item_type: 'device',
        referring_item_id: String(camera.id),
      },
      data: {
        device: {
          e2ee_enabled: false,
          id: camera.id,
          kind: camera.kind,
          name: camera.description,
        },
        event: {
          ding: {
            id: dingId,
            created_at: new Date(now).toISOString(),
            subtype: subtype ?? (kind === 'ding' ? 'ding' : 'human'),
            detection_type: kind === 'ding' ? undefined : subtype ?? 'human',
          },
          eventito: { type: kind, timestamp: now },
          riid: randomUUID(),
          is_sidewalk: false,
          live_session: {
            streaming_data_hash: 'fake',
            active_streaming_profile: 'rms',
            default_audio_route: 'speaker',
            max_duration: 180,
          },
        },
        location: { id: camera.location_id },
      },
      img: { snapshot_uuid: randomUUID() },
    }
  }

  function json(res: ServerResponse, status: number, body: unknown) {
    const payload = Buffer.from(JSON.stringify(body ?? {}))
    res.writeHead(status, {
      'content-type': 'application/json',
      'content-length': payload.length,
      date: new Date().toUTCString(),
    })
    res.end(payload)
  }

  type RouteHandler = (
    match: RegExpExecArray,
    context: {
      method: string
      body: any
      query: URLSearchParams
      res: ServerResponse
    },
  ) => unknown | Promise<unknown>

  const routes: { method: string; pattern: RegExp; handler: RouteHandler }[] = [
    {
      method: 'POST',
      pattern: /^\/oauth\/token$/,
      handler: () => ({
        access_token: 'fake-access-token-' + randomUUID(),
        expires_in: 3600,
        refresh_token: fakeRefreshToken,
        scope: 'client',
        token_type: 'Bearer',
      }),
    },
    {
      method: 'POST',
      pattern: /^\/clients_api\/session$/,
      handler: () => ({
        profile: {
          id: 1,
          email: 'fake@example.com',
          first_name: 'Fake',
          last_name: 'Ring',
          phone_number: '',
          authentication_token: 'fake-session',
          features: {},
        },
      }),
    },
    {
      method: 'GET',
      pattern: /^\/clients_api\/profile$/,
      handler: () => ({ profile: { id: 1, email: 'fake@example.com' } }),
    },
    {
      method: 'PATCH',
      pattern: /^\/clients_api\/device$/,
      handler: (_, { body }) => {
        const token = body?.device?.push_notification_token
        if (token) {
          pushTokens.push(token)
          recordEvent('push-token-registered', { token })
        }
        return {}
      },
    },
    {
      method: 'GET',
      pattern: /^\/devices\/v1\/locations$/,
      handler: () => ({ user_locations: scenario.locations }),
    },
    {
      method: 'GET',
      pattern: /^\/clients_api\/ring_devices$/,
      handler: () => scenario.ringDevices,
    },
    {
      method: 'GET',
      pattern: /^\/api\/v1\/clap\/tickets$/,
      handler: (_, { query }) => {
        const locationId = query.get('locationID')
        return {
          assets: scenario.hubs
            .filter((h) => h.locationId === locationId)
            .map((h) => h.asset),
          host: fakeHubHost,
          subscriptionTopics: [],
          ticket: 'fake-ticket-' + randomUUID(),
        }
      },
    },
    {
      method: 'GET',
      pattern: /^\/api\/v1\/mode\/location\/([^/]+)$/,
      handler: (match) => ({
        ...(scenario.locationModes[match[1]] ?? {
          mode: 'disabled',
          readOnly: true,
        }),
        lastUpdateTimeMS: Date.now(),
        securityStatus: { md: 'none', returnTopic: 'fake' },
      }),
    },
    {
      method: 'POST',
      pattern: /^\/api\/v1\/mode\/location\/([^/]+)$/,
      handler: (match, { body, res }) => {
        const mode = scenario.locationModes[match[1]]
        if (!mode) {
          json(res, 404, { error: 'location modes not enabled' })
          return undefined
        }
        mode.mode = body?.mode
        recordEvent('location-mode', { locationId: match[1], mode: mode.mode })
        return {
          ...mode,
          lastUpdateTimeMS: Date.now(),
          securityStatus: { md: 'none', returnTopic: 'fake' },
        }
      },
    },
    {
      method: 'POST',
      pattern:
        /^\/api\/v1\/rs\/monitoring\/accounts\/([^/]+)\/assets\/([^/]+)\/userAlarm$/,
      handler: (match, { body }) => {
        recordEvent('alarm-dispatch', {
          locationId: match[1],
          assetUuid: match[2],
          signalType: body?.signalType,
        })
        return {}
      },
    },
    {
      method: 'GET',
      pattern: /^\/api\/v1\/rs\/monitoring\/accounts\/([^/]+)$/,
      handler: () => ({
        accountUuid: 'fake',
        externalServiceConfigType: 'rrms',
        accountState: 'PROFESSIONAL',
        eligibleForDispatch: true,
        addressComplete: true,
        contactsComplete: true,
        codewordComplete: true,
        alarmSignalSent: false,
        professionallyMonitored: true,
        userAcceptDispatch: true,
        installationDate: Date.now(),
        entityId: 'fake',
        serviceState: 'FULL',
      }),
    },
    {
      method: 'PUT',
      pattern: /^\/clients_api\/doorbots\/(\d+)\/floodlight_light_(on|off)$/,
      handler: (match) => {
        const camera = findDevice(match[1])
        if (camera) {
          camera.led_status = match[2]
          recordEvent('camera-light', { id: camera.id, state: match[2] })
        }
        return {}
      },
    },
    {
      method: 'PUT',
      pattern: /^\/clients_api\/doorbots\/(\d+)\/siren_(on|off)$/,
      handler: (match) => {
        const camera = findDevice(match[1])
        if (camera) {
          camera.siren_status = {
            seconds_remaining: match[2] === 'on' ? 30 : 0,
          }
          recordEvent('siren', { cameraId: camera.id, state: match[2] })
        }
        return {}
      },
    },
    {
      method: 'GET',
      pattern: /^\/clients_api\/(doorbots|chimes)\/(\d+)\/health$/,
      handler: (match) => ({
        device_health: {
          id: Number(match[2]),
          wifi_name: 'fake-wifi',
          battery_percentage: 87,
          battery_percentage_category: 'good',
          battery_voltage: null,
          battery_voltage_category: null,
          latest_signal_strength: -50,
          latest_signal_category: 'good',
          average_signal_strength: -50,
          average_signal_category: 'good',
          firmware: 'Up To Date',
          updated_at: new Date().toISOString(),
          wifi_is_ring_network: false,
          packet_loss_category: 'good',
          packet_loss_strength: 0,
        },
      }),
    },
    {
      method: 'GET',
      pattern: /^\/devices\/v1\/devices\/(\d+)\/settings$/,
      handler: (match) => findDevice(match[1])?.settings ?? {},
    },
    {
      method: 'PATCH',
      pattern: /^\/devices\/v1\/devices\/(\d+)\/settings$/,
      handler: (match, { body }) => {
        const device = findDevice(match[1])
        if (device) {
          deepMerge((device.settings ??= {}), body ?? {})
          recordEvent('device-settings', { id: device.id, settings: body })
        }
        return {}
      },
    },
    {
      method: 'GET',
      pattern: /^\/snapshots\/next\/(\d+)$/,
      handler: (match, { res }) => {
        const now = Date.now()
        recordEvent('snapshot', { cameraId: Number(match[1]) })
        res.writeHead(200, {
          'content-type': 'image/jpeg',
          'content-length': snapshotJpeg.length,
          date: new Date(now).toUTCString(),
          'x-time-millis': String(now),
        })
        res.end(snapshotJpeg)
        return undefined
      },
    },
    {
      method: 'GET',
      pattern: /^\/clients_api\/ringtones$/,
      handler: () => ({ audios: [] }),
    },
    {
      method: 'POST',
      pattern: /^\/clients_api\/chimes\/(\d+)\/play_sound$/,
      handler: (match, { body }) => {
        recordEvent('chime-play', { id: Number(match[1]), body })
        return {}
      },
    },
    {
      method: 'POST',
      pattern: /^\/groups\/v1\/locations\/([^/]+)\/groups\/([^/]+)\/devices$/,
      handler: (match, { body }) => {
        const on = Boolean(body?.lights_on?.enabled)
        recordEvent('light-group', {
          locationId: match[1],
          groupId: match[2],
          on,
          durationSeconds: body?.lights_on?.duration_seconds,
        })
        for (const hub of scenario.hubs) {
          for (const doc of hub.docs) {
            const zid = doc.general?.v2?.zid
            if (zid && flatten(doc).groupId === match[2]) {
              updateHubDoc(zid, { on })
            }
          }
        }
        return {}
      },
    },
    {
      method: 'PUT',
      pattern: /^\/clients_api\/chimes\/(\d+)\/?$/,
      handler: (match, { body }) => {
        const chime = findDevice(match[1]),
          update = body?.chime ?? {}
        if (chime) {
          deepMerge(chime, update)
          recordEvent('chime-update', { id: chime.id, update })
        }
        return {}
      },
    },
    {
      method: 'PUT',
      pattern: /^\/clients_api\/doorbots\/(\d+)\/?$/,
      handler: (match, { body }) => {
        const camera = findDevice(match[1]),
          update = body?.doorbot ?? {}
        if (camera) {
          deepMerge(camera, update)
          recordEvent('camera-update', { id: camera.id, update })
        }
        return {}
      },
    },
    {
      method: 'POST',
      pattern: /^\/clients_api\/chimes\/(\d+)\/do_not_disturb$/,
      handler: (match, { body }) => {
        const chime = findDevice(match[1])
        if (chime) {
          chime.do_not_disturb = {
            seconds_left: body?.time ? Number(body.time) * 60 : 0,
          }
        }
        return {}
      },
    },
    {
      method: 'PUT',
      pattern: /^\/commands\/v1\/devices\/(\d+)\/device_rpc$/,
      handler: (match, { body }) => {
        recordEvent('device-rpc', {
          id: Number(match[1]),
          method:
            body?.request?.method ??
            body?.data?.params?.command_name ??
            body?.method,
          body,
        })
        return { result: { code: 0 } }
      },
    },
    {
      method: 'POST',
      pattern:
        /^\/clients_api\/doorbots\/(\d+)\/(subscribe|unsubscribe|motions_subscribe|motions_unsubscribe)$/,
      handler: () => ({}),
    },
    {
      method: 'POST',
      pattern: /^\/clients_api\/dings\/(\d+)\/(subscribe|unsubscribe)$/,
      handler: () => ({}),
    },
  ]

  async function handleControl(
    path: string,
    method: string,
    req: IncomingMessage,
    res: ServerResponse,
  ) {
    if (path === '/_control/push-stream' && method === 'GET') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      })
      res.write(': connected\n\n')
      pushClients.add(res)
      recordEvent('push-client-connected')
      req.on('close', () => pushClients.delete(res))
      return
    }

    if (path === '/_control/state' && method === 'GET') {
      json(res, 200, getState())
      return
    }

    const body = parseMaybeJson(await readBody(req)) as any

    if (path === '/_control/push' && method === 'POST') {
      const camera =
        findDevice(body?.deviceId) ??
        allCameras().find((c) => c.description === body?.deviceId)
      if (!camera) {
        json(res, 404, {
          error: `No camera or intercom with id or name "${body?.deviceId}"`,
          cameras: allCameras().map((c) => ({ id: c.id, name: c.description })),
        })
        return
      }
      const notification = buildDingNotification(
          camera,
          body.kind === 'motion' ? 'motion' : 'ding',
          body.subtype,
        ),
        delivered = sendPush(notification)
      recordEvent('push-sent', {
        kind: body.kind,
        cameraId: camera.id,
        delivered,
      })
      json(res, 200, { delivered, notification })
      return
    }

    if (path === '/_control/hub-update' && method === 'POST') {
      const updated = updateHubDoc(body?.zid, body?.set ?? {})
      if (!updated) {
        json(res, 404, {
          error: `No hub device with zid "${body?.zid}"`,
          zids: scenario.hubs.flatMap((h) =>
            h.docs.map((d) => ({
              zid: d.general?.v2?.zid,
              name: d.general?.v2?.name,
              deviceType: d.general?.v2?.deviceType,
            })),
          ),
        })
        return
      }
      recordEvent('control-hub-update', { zid: body.zid, set: body.set })
      json(res, 200, { device: updated })
      return
    }

    if (path === '/_control/camera-update' && method === 'POST') {
      const camera =
        findDevice(body?.deviceId) ??
        allCameras().find((c) => c.description === body?.deviceId)
      if (!camera) {
        json(res, 404, {
          error: `No device with id or name "${body?.deviceId}"`,
        })
        return
      }
      Object.assign(camera, body.set ?? {})
      recordEvent('control-camera-update', { id: camera.id, set: body.set })
      json(res, 200, { device: camera })
      return
    }

    if (path === '/_control/hub-disconnect' && method === 'POST') {
      for (const client of hubClients) {
        client.socket.destroy()
      }
      json(res, 200, { disconnected: true })
      return
    }

    if (path === '/_control/ring-error' && method === 'POST') {
      let pattern: RegExp
      try {
        pattern = new RegExp(String(body?.path ?? ''))
      } catch (e) {
        json(res, 400, { error: `Invalid path regex: ${(e as Error).message}` })
        return
      }
      const fault = {
        method: body?.method ? String(body.method).toUpperCase() : undefined,
        path: String(body?.path ?? ''),
        pattern,
        status: Number(body?.status ?? 500),
        remaining: Number(body?.count ?? 1),
      }
      faults.push(fault)
      recordEvent('ring-error-armed', {
        method: fault.method,
        path: fault.path,
        status: fault.status,
        count: fault.remaining,
      })
      json(res, 200, { armed: describeFaults() })
      return
    }

    json(res, 404, { error: `Unknown control route ${method} ${path}` })
  }

  function describeFaults() {
    return faults.map(({ method, path, status, remaining }) => ({
      method,
      path,
      status,
      remaining,
    }))
  }

  function getState() {
    return {
      scenario: scenarioName,
      description: scenario.description,
      hubClients: hubClients.size,
      pushClients: pushClients.size,
      pushTokens,
      locations: scenario.locations.map((l) => ({
        id: l.location_id,
        name: l.name,
        mode: scenario.locationModes[l.location_id],
      })),
      cameras: allCameras().map((c) => ({
        id: c.id,
        name: c.description,
        kind: c.kind,
        led_status: c.led_status,
        siren_status: c.siren_status,
      })),
      intercoms: scenario.ringDevices.other
        .filter((d) => String(d.kind).startsWith('intercom'))
        .map((d) => ({ id: d.id, name: d.description, kind: d.kind })),
      hubDevices: scenario.hubs.flatMap((h) =>
        h.docs.map((d) => {
          const flat = flatten(d)
          return {
            asset: h.asset.uuid,
            ...flat,
          }
        }),
      ),
      events,
      unhandled,
      faults: describeFaults(),
      recentRequests: requests.slice(-50),
      recentHubMessages: hubMessages.slice(-50),
    }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake'),
      method = req.method ?? 'GET'

    try {
      if (url.pathname.startsWith('/_control/')) {
        await handleControl(url.pathname, method, req, res)
        return
      }

      const hostMatch = /^\/_host\/([^/]+)(\/.*)?$/.exec(url.pathname),
        host = hostMatch?.[1] ?? 'unknown',
        path = hostMatch?.[2] ?? url.pathname,
        bodyText = await readBody(req),
        body = parseMaybeJson(bodyText),
        record: RecordedRequest = {
          ts: new Date().toISOString(),
          method,
          host,
          path: path + url.search,
          ...(body !== undefined ? { body } : {}),
        }

      requests.push(record)
      if (requests.length > 1000) {
        requests.shift()
      }

      const fault = faults.find(
        (f) => (!f.method || f.method === method) && f.pattern.test(path),
      )
      if (fault) {
        fault.remaining -= 1
        if (fault.remaining <= 0) {
          faults.splice(faults.indexOf(fault), 1)
        }
        record.status = fault.status
        recordEvent('ring-error-injected', {
          method,
          host,
          path,
          status: fault.status,
        })
        log({ request: record, injected: true })
        json(res, fault.status, {
          error: `Injected by ring-ctl emit ring-error (${fault.status})`,
        })
        return
      }

      for (const route of routes) {
        const match = route.pattern.exec(path)
        if (match && route.method === method) {
          const result = await route.handler(match, {
            method,
            body,
            query: url.searchParams,
            res,
          })
          if (!res.headersSent) {
            json(res, 200, result)
          }
          record.status = res.statusCode
          log({ request: record })
          return
        }
      }

      record.status = 404
      unhandled.push(record)
      log({ request: record, unhandled: true })
      json(res, 404, {
        error: `fake-ring has no route for ${method} ${host}${path}`,
      })
    } catch (e) {
      json(res, 500, { error: e instanceof Error ? e.message : String(e) })
    }
  })

  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url ?? '/', 'http://fake')
    if (/^\/_host\/[^/]+\/ws$/.test(url.pathname)) {
      acceptHubSocket(req, socket)
    } else {
      socket.destroy()
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve())
  })

  return {
    port,
    getState,
    close: () =>
      new Promise<void>((resolve) => {
        for (const client of hubClients) {
          client.socket.destroy()
        }
        for (const client of pushClients) {
          client.end()
        }
        server.close(() => resolve())
        server.closeAllConnections()
      }),
  }
}
