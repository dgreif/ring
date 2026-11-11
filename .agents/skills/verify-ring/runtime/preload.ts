// Loaded into the Homebridge process with `node --import`. It never changes
// plugin code; it only wraps the network edges:
//   - every TCP listen binds to 127.0.0.1 and is recorded for the CLI
//   - fake mode: every Ring request and hub socket goes to the fake cloud and
//     the push receiver is swapped for a stub fed by the fake cloud
//   - live mode: dangerous Ring requests and hub commands are blocked unless
//     the CLI granted a short-lived permit (see src/policy.ts)
import { appendFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import net from 'node:net'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { repoRoot, skillDir } from '../src/paths.ts'
import {
  checkHubMessage,
  checkRingRequest,
  type GuardDecision,
} from '../src/policy.ts'

const mode = process.env.RING_VERIFY_MODE,
  sinkUrl = process.env.RING_VERIFY_SINK_URL,
  guardFile = process.env.RING_VERIFY_GUARD_FILE,
  listenersFile = process.env.RING_VERIFY_LISTENERS_FILE,
  require = createRequire(join(repoRoot, 'package.json')),
  undici = require('undici')

if (mode !== 'live' && mode !== 'fake') {
  throw new Error('RING_VERIFY_MODE must be "live" or "fake"')
}
if (!sinkUrl) {
  throw new Error('RING_VERIFY_SINK_URL is required')
}

const sink = new URL(sinkUrl)

function isLoopback(hostname: string) {
  return (
    hostname === '127.0.0.1' ||
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname === '[::1]'
  )
}

function guardLog(entry: Record<string, unknown>) {
  const line = { ts: new Date().toISOString(), pid: process.pid, ...entry }
  if (guardFile) {
    appendFileSync(guardFile, JSON.stringify(line) + '\n')
  }
  if (entry.action === 'block') {
    console.error(
      `[verify-ring guard] BLOCKED ${entry.target}: ${entry.reason}`,
    )
  }
}

// --- Listen on loopback only ------------------------------------------------

const wildcardHosts = new Set([undefined, null, '', '::', '0.0.0.0'])
const originalListen = net.Server.prototype.listen

net.Server.prototype.listen = function (this: net.Server, ...args: any[]) {
  const [first, second] = args
  if (
    first &&
    typeof first === 'object' &&
    !(first instanceof net.Server) &&
    first.path === undefined &&
    first.fd === undefined &&
    !first._handle &&
    !first.handle
  ) {
    if (wildcardHosts.has(first.host)) {
      args[0] = { ...first, host: '127.0.0.1' }
    }
  } else if (
    typeof first === 'number' ||
    (typeof first === 'string' && /^\d+$/.test(first))
  ) {
    if (typeof second === 'function' || typeof second === 'number') {
      args.splice(1, 0, '127.0.0.1')
    } else if (wildcardHosts.has(second)) {
      if (args.length >= 2) {
        args[1] = '127.0.0.1'
      } else {
        args.push('127.0.0.1')
      }
    }
  } else if (args.length === 0 || typeof first === 'function') {
    args.unshift(0, '127.0.0.1')
  }

  this.once('listening', () => {
    const address = this.address()
    if (listenersFile && address && typeof address === 'object') {
      appendFileSync(
        listenersFile,
        JSON.stringify({
          ts: new Date().toISOString(),
          pid: process.pid,
          address: address.address,
          port: address.port,
        }) + '\n',
      )
    }
  })

  return originalListen.apply(this, args as any)
} as typeof net.Server.prototype.listen

// --- Ring HTTP + hub WebSocket ----------------------------------------------

const AgentPrototype = undici.Agent.prototype,
  originalDispatch = AgentPrototype.dispatch

function toUrl(opts: any) {
  const origin = String(opts.origin?.origin ?? opts.origin)
  return new URL(String(opts.path ?? '/'), origin)
}

function redirectToSink(
  agent: unknown,
  opts: any,
  handler: unknown,
  url: URL,
  prefix: string,
) {
  return originalDispatch.call(
    agent,
    {
      ...opts,
      origin: sink.origin,
      path: `${prefix}/${url.host}${url.pathname}${url.search}`,
    },
    handler,
  )
}

async function collectBody(body: AsyncIterable<Uint8Array>) {
  const chunks: Buffer[] = []
  for await (const chunk of body) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function parseBody(body: unknown) {
  if (body === undefined || body === null) {
    return undefined
  }
  const text =
    typeof body === 'string'
      ? body
      : Buffer.isBuffer(body) || body instanceof Uint8Array
      ? Buffer.from(body).toString('utf8')
      : undefined
  if (text === undefined) {
    return undefined
  }
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function guardedDispatch(
  agent: unknown,
  opts: any,
  handler: unknown,
  url: URL,
  rawBody: unknown,
) {
  const method = String(opts.method ?? 'GET').toUpperCase(),
    decision: GuardDecision = checkRingRequest(method, url, parseBody(rawBody)),
    target = `${method} ${url.host}${url.pathname}`

  if (decision.action === 'block') {
    guardLog({ action: 'block', target, reason: decision.reason })
    // Answer with a 403 from the local sink so ring-client-api fails fast
    // instead of retrying a network error forever.
    return redirectToSink(
      agent,
      { ...opts, body: rawBody },
      handler,
      url,
      '/_blocked',
    )
  }

  if (method !== 'GET' && method !== 'HEAD') {
    guardLog({ action: 'allow', target, reason: decision.reason })
  }
  return originalDispatch.call(agent, { ...opts, body: rawBody }, handler)
}

AgentPrototype.dispatch = function (opts: any, handler: any) {
  let url: URL
  try {
    url = toUrl(opts)
  } catch {
    return originalDispatch.call(this, opts, handler)
  }

  if (isLoopback(url.hostname)) {
    return originalDispatch.call(this, opts, handler)
  }

  if (mode === 'fake') {
    return redirectToSink(this, opts, handler, url, '/_host')
  }

  const body = opts.body
  if (
    body &&
    typeof body !== 'string' &&
    !(body instanceof Uint8Array) &&
    typeof body[Symbol.asyncIterator] === 'function'
  ) {
    collectBody(body).then(
      (buffer) => guardedDispatch(this, opts, handler, url, buffer),
      (error) => {
        if (typeof handler.onResponseError === 'function') {
          handler.onResponseError(null, error)
        } else {
          handler.onError?.(error)
        }
      },
    )
    return true
  }

  return guardedDispatch(this, opts, handler, url, body)
}

if (mode === 'live') {
  const WebSocketPrototype = undici.WebSocket.prototype,
    originalSend = WebSocketPrototype.send

  WebSocketPrototype.send = function (data: unknown) {
    if (typeof data === 'string') {
      const decision = checkHubMessage(data)
      if (decision.action === 'block') {
        // Drop instead of throwing: the plugin does not await these sends and
        // an exception would become an unhandled rejection in Homebridge.
        guardLog({
          action: 'block',
          target: 'hub websocket',
          reason: decision.reason,
        })
        return
      }
      if (decision.permit) {
        guardLog({
          action: 'allow',
          target: 'hub websocket',
          reason: decision.reason,
        })
      }
    }
    return originalSend.call(this, data)
  }
}

// ring-client-api's hub socket uses the global dispatcher. Make it an npm
// undici Agent so it goes through the patched dispatch above.
undici.setGlobalDispatcher(new undici.Agent())

if (mode === 'fake') {
  const stubUrl = pathToFileURL(
    join(skillDir, 'runtime/push-receiver-stub.ts'),
  ).href
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === '@eneris/push-receiver') {
        return { url: stubUrl, shortCircuit: true }
      }
      return nextResolve(specifier, context)
    },
  })
}

guardLog({ action: 'preload', mode, sink: sink.origin })
