import { request } from 'node:http'
import { createRequire } from 'node:module'
import { connect } from 'node:net'
import { isDeepStrictEqual } from 'node:util'
import { CliError } from './output.ts'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const hap = require('@homebridge/hap-nodejs')

const appleUuidSuffix = '-0000-1000-8000-0026BB765291'

function shortUuid(uuid: string) {
  const upper = uuid.toUpperCase()
  if (upper.endsWith(appleUuidSuffix)) {
    return upper.slice(0, 8).replace(/^0+/, '') || '0'
  }
  return upper
}

interface HapTypeInfo {
  name: string
  enumByValue?: Record<number, string>
  valueByEnum?: Record<string, number>
}

function buildTypeMap(registry: Record<string, any>) {
  const map = new Map<string, HapTypeInfo>()
  for (const key of Object.getOwnPropertyNames(registry)) {
    const type = registry[key]
    if (!type || typeof type.UUID !== 'string') {
      continue
    }
    const short = shortUuid(type.UUID)
    if (map.has(short)) {
      continue
    }

    const enumByValue: Record<number, string> = {},
      valueByEnum: Record<string, number> = {}
    for (const prop of Object.getOwnPropertyNames(type)) {
      const value = type[prop]
      if (/^[A-Z][A-Z0-9_]*$/.test(prop) && typeof value === 'number') {
        enumByValue[value] ??= prop
        valueByEnum[prop] = value
      }
    }

    map.set(short, {
      name: key,
      ...(Object.keys(valueByEnum).length ? { enumByValue, valueByEnum } : {}),
    })
  }
  return map
}

const serviceTypes = buildTypeMap(hap.Service),
  characteristicTypes = buildTypeMap(hap.Characteristic)

function serviceTypeName(type: string) {
  return serviceTypes.get(shortUuid(type))?.name ?? type
}

function characteristicInfo(type: string): HapTypeInfo {
  return characteristicTypes.get(shortUuid(type)) ?? { name: type }
}

// Services an agent almost never needs. Hidden unless --all is passed.
const noisyServices = new Set([
  'AccessoryInformation',
  'ProtocolInformation',
  'CameraRTPStreamManagement',
  'CameraOperatingMode',
  'CameraRecordingManagement',
  'DataStreamTransportManagement',
  'Siri',
  'SiriEndpoint',
])
// Cameras always register these for two-way audio; chimes use Speaker for
// their real volume control, so only hide them on cameras.
const cameraAudioServices = new Set(['Microphone', 'Speaker'])

export interface HapEndpoint {
  port: number
  pin: string
  host?: string
}

export interface RawHapResponse {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: Buffer
}

export function hapRequest(
  endpoint: HapEndpoint,
  method: string,
  path: string,
  body?: unknown,
  { timeoutMs = 10_000 } = {},
) {
  return new Promise<RawHapResponse>((resolve, reject) => {
    const payload =
        body === undefined ? undefined : Buffer.from(JSON.stringify(body)),
      req = request(
        {
          host: endpoint.host ?? '127.0.0.1',
          port: endpoint.port,
          method,
          path,
          agent: false,
          headers: {
            authorization: endpoint.pin,
            ...(payload
              ? {
                  'content-type': 'application/hap+json',
                  'content-length': payload.length,
                }
              : {}),
          },
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk) => chunks.push(chunk))
          res.on('end', () =>
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: Buffer.concat(chunks),
            }),
          )
          res.on('error', reject)
        },
      )

    req.setTimeout(timeoutMs, () => {
      req.destroy(
        new Error(
          `HAP request ${method} ${path} on port ${endpoint.port} timed out after ${timeoutMs}ms`,
        ),
      )
    })
    req.on('error', reject)
    req.end(payload)
  })
}

function parseJson(response: RawHapResponse) {
  const text = response.body.toString('utf8')
  if (!text) {
    return undefined
  }
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export interface FlatCharacteristic {
  ref: string
  shortRef: string
  accessoryName: string
  accessorySerial?: string
  serviceType: string
  serviceLabel: string
  aid: number
  iid: number
  port: number
  type: string
  name: string
  value: unknown
  valueLabel?: string
  format?: string
  perms: string[]
  unit?: string
  minValue?: number
  maxValue?: number
  validValues?: number[]
  validValueLabels?: Record<string, number>
  description?: string
}

export interface FlatService {
  label: string
  type: string
  name?: string
  iid: number
  hidden: boolean
  characteristics: FlatCharacteristic[]
}

export interface FlatAccessory {
  name: string
  serial?: string
  model?: string
  manufacturer?: string
  aid: number
  port: number
  external: boolean
  services: FlatService[]
}

function findCharValue(service: any, typeName: string) {
  return service.characteristics?.find(
    (c: any) => characteristicInfo(c.type).name === typeName,
  )?.value
}

function uniqueLabel(base: string, used: Set<string>) {
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  for (let i = 2; ; i++) {
    const candidate = `${base}#${i}`
    if (!used.has(candidate)) {
      used.add(candidate)
      return candidate
    }
  }
}

// Error responses and missing values are not device state.
export function isReadableValue(
  target: Pick<FlatCharacteristic, 'format'>,
  value: unknown,
) {
  switch (target.format) {
    case 'bool':
      return value === true || value === false || value === 0 || value === 1
    case 'uint8':
    case 'uint16':
    case 'uint32':
    case 'uint64':
    case 'int':
    case 'float':
      return typeof value === 'number' && Number.isFinite(value)
    case 'string':
    case 'data':
    case 'tlv8':
      return typeof value === 'string'
    default:
      return (
        typeof value === 'boolean' ||
        typeof value === 'string' ||
        (typeof value === 'number' && Number.isFinite(value))
      )
  }
}

// HAP reports bools as 1/0 on reads but accepts true/false on writes.
export function sameValue(
  target: Pick<FlatCharacteristic, 'format'>,
  a: unknown,
  b: unknown,
) {
  if (!isReadableValue(target, a) || !isReadableValue(target, b)) {
    return false
  }
  if (target.format === 'bool') {
    return Boolean(a) === Boolean(b)
  }
  return isDeepStrictEqual(a, b)
}

export function labelValue(typeName: string, value: unknown) {
  const info = [...characteristicTypes.values()].find(
    (t) => t.name === typeName,
  )
  if (typeof value === 'number' && info?.enumByValue?.[value]) {
    return info.enumByValue[value]
  }
  return undefined
}

export function flattenAccessories(
  raw: { port: number; external: boolean; accessories: any[] }[],
) {
  const accessories: FlatAccessory[] = [],
    usedAccessoryNames = new Set<string>()

  for (const { port, external, accessories: rawAccessories } of raw) {
    for (const rawAccessory of rawAccessories) {
      const info = rawAccessory.services.find(
          (s: any) => serviceTypeName(s.type) === 'AccessoryInformation',
        ),
        infoName = String(
          findCharValue(info ?? {}, 'Name') ?? rawAccessory.aid,
        ),
        // hap-nodejs appends 4 hex digits of the MAC to externally published
        // accessories ("Front Door" -> "Front Door EC90"). Strip it so refs
        // match the Ring device name.
        baseName = external ? infoName.replace(/ [0-9A-F]{4}$/, '') : infoName

      // The Homebridge bridge itself is aid 1 on the bridge port and has no
      // useful controls. Skip it so refs only cover Ring devices.
      if (!external && rawAccessory.aid === 1) {
        continue
      }

      const accessoryName = uniqueLabel(baseName, usedAccessoryNames),
        accessorySerial = findCharValue(info ?? {}, 'SerialNumber'),
        usedServiceLabels = new Set<string>(),
        services: FlatService[] = [],
        isCamera = rawAccessory.services.some(
          (s: any) => serviceTypeName(s.type) === 'CameraRTPStreamManagement',
        )

      for (const rawService of rawAccessory.services) {
        const typeName = serviceTypeName(rawService.type),
          serviceName =
            findCharValue(rawService, 'ConfiguredName') ??
            findCharValue(rawService, 'Name'),
          labelBase =
            typeof serviceName === 'string' &&
            serviceName &&
            serviceName !== baseName
              ? serviceName
              : typeName,
          label = uniqueLabel(labelBase, usedServiceLabels),
          usedCharNames = new Set<string>(),
          characteristics: FlatCharacteristic[] = []

        for (const rawChar of rawService.characteristics ?? []) {
          const charInfo = characteristicInfo(rawChar.type),
            charName = uniqueLabel(charInfo.name, usedCharNames),
            validValues: number[] | undefined = rawChar['valid-values']
          characteristics.push({
            ref: `${accessoryName}/${label}/${charName}`,
            shortRef: `${accessoryName}/${charName}`,
            accessoryName,
            accessorySerial,
            serviceType: typeName,
            serviceLabel: label,
            aid: rawAccessory.aid,
            iid: rawChar.iid,
            port,
            type: shortUuid(rawChar.type),
            name: charName,
            value: rawChar.value,
            valueLabel:
              typeof rawChar.value === 'number'
                ? charInfo.enumByValue?.[rawChar.value]
                : undefined,
            format: rawChar.format,
            perms: rawChar.perms ?? [],
            unit: rawChar.unit,
            minValue: rawChar.minValue,
            maxValue: rawChar.maxValue,
            validValues,
            validValueLabels: charInfo.valueByEnum
              ? Object.fromEntries(
                  Object.entries(charInfo.valueByEnum).filter(
                    ([, v]) => !validValues || validValues.includes(v),
                  ),
                )
              : undefined,
            description: rawChar.description,
          })
        }

        services.push({
          label,
          type: typeName,
          name: typeof serviceName === 'string' ? serviceName : undefined,
          iid: rawService.iid,
          hidden:
            noisyServices.has(typeName) ||
            (isCamera && cameraAudioServices.has(typeName)),
          characteristics,
        })
      }

      accessories.push({
        name: accessoryName,
        serial: accessorySerial,
        model: findCharValue(info ?? {}, 'Model'),
        manufacturer: findCharValue(info ?? {}, 'Manufacturer'),
        aid: rawAccessory.aid,
        port,
        external,
        services,
      })
    }
  }

  return accessories
}

export async function fetchRawAccessories(endpoint: HapEndpoint) {
  const response = await hapRequest(endpoint, 'GET', '/accessories')
  if (response.status !== 200) {
    throw new Error(
      `GET /accessories on port ${endpoint.port} returned ${
        response.status
      }: ${response.body.toString('utf8')}`,
    )
  }
  return parseJson(response).accessories as any[]
}

function isPortOpen(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = connect({ host: '127.0.0.1', port })
    socket.setTimeout(500)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => resolve(false))
  })
}

export async function discoverExternalPorts(ports: number[]) {
  const open = await Promise.all(
    ports.map(async (port) => ((await isPortOpen(port)) ? port : undefined)),
  )
  return open.filter((p): p is number => p !== undefined)
}

export interface HapTopology {
  bridgePort: number
  externalPorts: number[]
  pin: string
}

export async function loadAccessories(topology: HapTopology) {
  const raw: { port: number; external: boolean; accessories: any[] }[] = [
    {
      port: topology.bridgePort,
      external: false,
      accessories: await fetchRawAccessories({
        port: topology.bridgePort,
        pin: topology.pin,
      }),
    },
  ]

  for (const port of topology.externalPorts) {
    try {
      raw.push({
        port,
        external: true,
        accessories: await fetchRawAccessories({ port, pin: topology.pin }),
      })
    } catch {
      // Port was open but not a HAP server (or it went away). Ignore it.
    }
  }

  return flattenAccessories(raw)
}

export function allCharacteristics(accessories: FlatAccessory[]) {
  return accessories.flatMap((a) =>
    a.services.flatMap((s) => s.characteristics),
  )
}

export function resolveRef(accessories: FlatAccessory[], ref: string) {
  const chars = allCharacteristics(accessories),
    exact = chars.filter((c) => c.ref === ref)
  if (exact.length === 1) {
    return exact[0]
  }

  const short = chars.filter((c) => c.shortRef === ref)
  if (short.length === 1) {
    return short[0]
  }

  const lowered = ref.toLowerCase(),
    caseInsensitive = chars.filter(
      (c) =>
        c.ref.toLowerCase() === lowered || c.shortRef.toLowerCase() === lowered,
    )
  if (caseInsensitive.length === 1) {
    return caseInsensitive[0]
  }

  const candidates = (short.length > 1 ? short : caseInsensitive).map(
    (c) => c.ref,
  )
  if (candidates.length > 1) {
    throw new CliError(`Ref "${ref}" is ambiguous`, {
      code: 'ambiguous-ref',
      details: { candidates },
      next: ['Use one of the full refs listed in details.candidates.'],
    })
  }

  const [accessoryPart] = ref.split('/'),
    similar = chars
      .filter((c) =>
        c.ref.toLowerCase().includes(accessoryPart.toLowerCase().trim()),
      )
      .slice(0, 25)
      .map((c) => c.ref)
  throw new CliError(`No characteristic matches ref "${ref}"`, {
    code: 'unknown-ref',
    details: { similar },
    next: [
      'Refs look like "<Accessory>/<Service label>/<Characteristic>", or "<Accessory>/<Characteristic>" when unique.',
      'Run `ring-ctl accessories` to list every ref, or `ring-ctl accessories --filter <text>` to narrow it down.',
    ],
  })
}

export function coerceValue(target: FlatCharacteristic, input: string) {
  const enumValue = target.validValueLabels?.[input.toUpperCase()]
  if (enumValue !== undefined) {
    return enumValue
  }

  switch (target.format) {
    case 'bool': {
      const normalized = input.toLowerCase()
      if (['true', '1', 'on', 'yes'].includes(normalized)) {
        return true
      }
      if (['false', '0', 'off', 'no'].includes(normalized)) {
        return false
      }
      break
    }
    case 'uint8':
    case 'uint16':
    case 'uint32':
    case 'uint64':
    case 'int':
    case 'float': {
      const number = Number(input)
      if (Number.isFinite(number)) {
        return number
      }
      break
    }
    case 'string':
      return input
    default:
      try {
        return JSON.parse(input)
      } catch {
        return input
      }
  }

  throw new CliError(
    `"${input}" is not a valid value for ${target.ref} (format ${target.format})`,
    {
      code: 'invalid-value',
      details: {
        format: target.format,
        validValueLabels: target.validValueLabels,
        minValue: target.minValue,
        maxValue: target.maxValue,
      },
      next: [
        target.validValueLabels
          ? `Use one of: ${Object.keys(target.validValueLabels).join(', ')}`
          : `Pass a ${target.format} value.`,
      ],
    },
  )
}

export async function readCharacteristics(
  pin: string,
  targets: FlatCharacteristic[],
) {
  const byPort = new Map<number, FlatCharacteristic[]>()
  for (const target of targets) {
    byPort.set(target.port, [...(byPort.get(target.port) ?? []), target])
  }

  const values = new Map<FlatCharacteristic, unknown>()
  for (const [port, group] of byPort) {
    const ids = group.map((t) => `${t.aid}.${t.iid}`).join(','),
      response = await hapRequest(
        { port, pin },
        'GET',
        `/characteristics?id=${ids}`,
      ),
      body = parseJson(response)
    if (response.status !== 200 && response.status !== 207) {
      throw new Error(
        `GET /characteristics returned ${response.status}: ${JSON.stringify(
          body,
        )}`,
      )
    }
    for (const item of body.characteristics as any[]) {
      const target = group.find((t) => t.aid === item.aid && t.iid === item.iid)
      if (target) {
        values.set(
          target,
          item.status ? { hapStatus: item.status } : item.value,
        )
      }
    }
  }
  return values
}

export async function readCharacteristic(
  pin: string,
  target: FlatCharacteristic,
) {
  const values = await readCharacteristics(pin, [target])
  return values.get(target)
}

export async function writeCharacteristic(
  pin: string,
  target: FlatCharacteristic,
  value: unknown,
) {
  const response = await hapRequest(
    { port: target.port, pin },
    'PUT',
    '/characteristics',
    { characteristics: [{ aid: target.aid, iid: target.iid, value }] },
    { timeoutMs: 30_000 },
  )

  if (response.status === 204) {
    return { ok: true as const }
  }

  const body = parseJson(response),
    status = body?.characteristics?.[0]?.status ?? body?.status
  if (response.status === 207 && !status) {
    return { ok: true as const }
  }
  return { ok: false as const, httpStatus: response.status, hapStatus: status }
}

export async function requestSnapshot(
  pin: string,
  port: number,
  { width = 640, height = 360, timeoutMs = 30_000 } = {},
) {
  const deadline = Date.now() + timeoutMs
  let lastError = ''

  // The plugin answers the first request with an error while it fetches and
  // caches a fresh snapshot from Ring, so keep asking until it lands.
  while (Date.now() < deadline) {
    const response = await hapRequest(
      { port, pin },
      'POST',
      '/resource',
      {
        'resource-type': 'image',
        aid: 1,
        'image-width': width,
        'image-height': height,
      },
      { timeoutMs: 20_000 },
    )

    if (
      response.status === 200 &&
      String(response.headers['content-type']).includes('image')
    ) {
      return response.body
    }

    lastError = `${response.status} ${response.body.toString('utf8')}`
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }

  throw new CliError(`Snapshot did not arrive within ${timeoutMs}ms`, {
    code: 'snapshot-timeout',
    details: { lastError },
    next: [
      'Check `ring-ctl logs --grep snapshot` for errors from the plugin.',
      'Battery cameras can take longer; retry with a larger --timeout.',
    ],
  })
}

export interface HapEvent {
  ts: string
  aid: number
  iid: number
  value: unknown
}

// Opens a raw HAP connection, subscribes to the given characteristics and
// yields EVENT/1.0 notifications until stopped.
export function subscribe(
  pin: string,
  port: number,
  targets: { aid: number; iid: number }[],
  onEvent: (event: HapEvent) => void,
) {
  return new Promise<{ close: () => void }>((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port }),
      body = Buffer.from(
        JSON.stringify({
          characteristics: targets.map((t) => ({ ...t, ev: true })),
        }),
      )
    let buffer = Buffer.alloc(0),
      subscribed = false

    socket.once('error', reject)
    socket.on('connect', () => {
      socket.write(
        `PUT /characteristics HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nAuthorization: ${pin}\r\nContent-Type: application/hap+json\r\nContent-Length: ${body.length}\r\n\r\n`,
      )
      socket.write(body)
    })

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])

      for (;;) {
        const headerEnd = buffer.indexOf('\r\n\r\n')
        if (headerEnd === -1) {
          return
        }
        const header = buffer.subarray(0, headerEnd).toString('utf8'),
          lengthMatch = /content-length:\s*(\d+)/i.exec(header),
          length = lengthMatch ? parseInt(lengthMatch[1], 10) : 0
        if (buffer.length < headerEnd + 4 + length) {
          return
        }
        const messageBody = buffer.subarray(
          headerEnd + 4,
          headerEnd + 4 + length,
        )
        buffer = buffer.subarray(headerEnd + 4 + length)

        if (header.startsWith('EVENT/1.0')) {
          const parsed = JSON.parse(messageBody.toString('utf8'))
          for (const item of parsed.characteristics ?? []) {
            onEvent({
              ts: new Date().toISOString(),
              aid: item.aid,
              iid: item.iid,
              value: item.value,
            })
          }
        } else if (!subscribed) {
          subscribed = true
          const status = parseInt(header.split(' ')[1], 10)
          if (status === 204 || status === 207 || status === 200) {
            resolve({ close: () => socket.destroy() })
          } else {
            socket.destroy()
            reject(
              new Error(
                `Event subscription failed with ${status}: ${messageBody.toString(
                  'utf8',
                )}`,
              ),
            )
          }
        }
      }
    })
  })
}
