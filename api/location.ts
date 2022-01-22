import {
  connect as connectSocketIo,
  Socket as SocketIOSocket,
} from 'socket.io-client'
import {
  BehaviorSubject,
  firstValueFrom,
  merge,
  Observable,
  ReplaySubject,
  Subject,
} from 'rxjs'
import {
  concatMap,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  scan,
  shareReplay,
  skip,
} from 'rxjs/operators'
import { delay, generateUuid, logDebug, logError, logInfo } from './util'
import {
  AccountMonitoringStatus,
  AlarmMode,
  AssetSession,
  DispatchSignalType,
  MessageDataType,
  MessageType,
  RingDeviceData,
  RingDeviceType,
  SocketIoMessage,
  TicketAsset,
  UserLocation,
  CameraEventResponse,
  CameraEventOptions,
  HistoryOptions,
  RingDeviceHistoryEvent,
  LocationModeResponse,
  LocationModeSettings,
  LocationMode,
  LocationModeSharing,
  LocationModeSettingsResponse,
  LocationModeInput,
  disabledLocationModes,
  isWebSocketSupportedAsset,
} from './ring-types'
import { appApi, clientApi, RingRestClient } from './rest-client'
import { getSearchQueryString, RingCamera } from './ring-camera'
import { RingChime } from './ring-chime'
import { RingDevice } from './ring-device'
import { Subscribed } from './subscribed'

const deviceListMessageType = 'DeviceInfoDocGetList'

function flattenDeviceData(data: any): RingDeviceData {
  return Object.assign(
    {},
    data.general && data.general.v2,
    data.device && data.device.v1
  )
}

export class Location extends Subscribed {
  private seq = 1

  onMessage = new Subject<SocketIoMessage>()
  onDataUpdate = new Subject<SocketIoMessage>()
  onDeviceDataUpdate = this.onDataUpdate.pipe(
    filter((message) => {
      return message.datatype === 'DeviceInfoDocType' && Boolean(message.body)
    }),
    concatMap((message) => message.body),
    map(flattenDeviceData)
  )
  onDeviceList = this.onMessage.pipe(
    filter((m) => m.msg === deviceListMessageType)
  )
  onDevices: Observable<RingDevice[]> = this.onDeviceList.pipe(
    scan((devices, { body: deviceList, src }) => {
      if (!deviceList) {
        return devices
      }

      if (!this.receivedAssetDeviceLists.includes(src)) {
        this.receivedAssetDeviceLists.push(src)
      }

      return deviceList.reduce((updatedDevices: RingDevice[], data) => {
        const flatData = flattenDeviceData(data),
          existingDevice = updatedDevices.find((x) => x.zid === flatData.zid)

        if (existingDevice) {
          existingDevice.updateData(flatData)
          return updatedDevices
        }

        return [...updatedDevices, new RingDevice(flatData, this, src)]
      }, devices)
    }, [] as RingDevice[]),
    distinctUntilChanged((a, b) => a.length === b.length),
    filter(() => {
      return Boolean(
        this.assets &&
          this.assets.every((asset) =>
            this.receivedAssetDeviceLists.includes(asset.uuid)
          )
      )
    }),
    shareReplay(1)
  )
  onSessionInfo = this.onDataUpdate.pipe(
    filter((m) => m.msg === 'SessionInfo'),
    map((m) => m.body as AssetSession[])
  )
  onConnected = new BehaviorSubject(false)
  onLocationMode = new ReplaySubject<LocationMode>(1)
  private onLocationModeRequested = new Subject()
  reconnecting = false
  private disconnected = false
  connectionPromise?: Promise<typeof SocketIOSocket>
  securityPanel?: RingDevice
  assets?: TicketAsset[]
  receivedAssetDeviceLists: string[] = []
  offlineAssets: string[] = []
  hasHubs
  hasAlarmBaseStation

  constructor(
    public readonly locationDetails: UserLocation,
    public readonly cameras: RingCamera[],
    public readonly chimes: RingChime[],
    public readonly options: {
      hasHubs: boolean
      hasAlarmBaseStation: boolean
      locationModePollingSeconds?: number
    },
    private restClient: RingRestClient
  ) {
    super()

    this.hasHubs = this.options.hasHubs
    this.hasAlarmBaseStation = this.options.hasAlarmBaseStation

    this.addSubscriptions(
      // start listening for devices immediately
      this.onDevices.subscribe(),

      // watch for sessions to come online
      this.onSessionInfo.subscribe((sessions) => {
        sessions.forEach(({ connectionStatus, assetUuid }) => {
          const assetWasOffline = this.offlineAssets.includes(assetUuid),
            asset = this.assets && this.assets.find((x) => x.uuid === assetUuid)

          if (!asset) {
            // we don't know about this asset, so don't worry about it
            return
          }

          if (connectionStatus === 'online') {
            if (assetWasOffline) {
              // eslint-disable-next-line @typescript-eslint/no-empty-function
              this.requestList(deviceListMessageType, assetUuid).catch(() => {})
              this.offlineAssets = this.offlineAssets.filter(
                (id) => id !== assetUuid
              )
              logInfo(`Ring ${asset.kind} ${assetUuid} has come back online`)
            }
          } else if (!assetWasOffline) {
            logError(
              `Ring ${asset.kind} ${assetUuid} is offline or on cellular backup.  Waiting for status to change`
            )
            this.offlineAssets.push(assetUuid)
          }
        })
      })
    )

    if (!options.hasAlarmBaseStation && options.locationModePollingSeconds) {
      this.addSubscriptions(
        merge(this.onLocationModeRequested, this.onLocationMode)
          .pipe(debounceTime(options.locationModePollingSeconds * 1000))
          .subscribe(() => this.getLocationMode())
      )

      this.getLocationMode().catch(logError)
    }
  }

  get id() {
    return this.locationId
  }

  get locationId() {
    return this.locationDetails.location_id
  }

  get name() {
    return this.locationDetails.name
  }

  async createConnection(): Promise<typeof SocketIOSocket> {
    if (this.disconnected) {
      return Promise.resolve({ disconnected: true } as any)
    }

    logInfo('Creating location socket.io connection - ' + this.name)

    if (process.version.startsWith('v15.')) {
      logError(
        'Node 15 is not currently supported by the Ring client. Please install the latest Node 14 instead. May not be able to fetch devices from Ring Alarm and Smart Lighting Hubs on this version of node.'
      )
    }

    const { assets, ticket, host } = await this.restClient.request<{
        assets: TicketAsset[]
        host: string
        subscriptionTopics: string[]
        ticket: string
      }>({
        url: appApi('clap/tickets?locationID=' + this.id),
      }),
      supportedAssets = assets.filter(isWebSocketSupportedAsset)
    this.assets = supportedAssets
    this.receivedAssetDeviceLists.length = 0
    this.offlineAssets.length = 0

    if (!supportedAssets.length) {
      const errorMessage = `No assets (alarm hubs or beam bridges) found for location ${this.name} - ${this.id}`
      logError(errorMessage)
      throw new Error(errorMessage)
    }

    const connection = connectSocketIo(
        `wss://${host}/?authcode=${ticket}&ack=false&EIO=3`,
        { transports: ['websocket'] }
      ),
      reconnect = () => {
        if (this.reconnecting && this.connectionPromise) {
          return this.connectionPromise
        }

        this.onConnected.next(false)

        if (!this.disconnected) {
          logInfo('Reconnecting location socket.io connection')
        }

        this.reconnecting = true
        connection.close()
        return (this.connectionPromise = delay(1000).then(() => {
          return this.createConnection()
        }))
      }

    this.reconnecting = false
    connection.on('DataUpdate', (message: SocketIoMessage) => {
      if (message.datatype === 'HubDisconnectionEventType') {
        logInfo('Location connection told to reconnect')
        return reconnect()
      }

      this.onDataUpdate.next(message)
    })
    connection.on('message', (message: SocketIoMessage) =>
      this.onMessage.next(message)
    )
    connection.on('error', reconnect)
    connection.on('disconnect', reconnect)
    return new Promise<typeof SocketIOSocket>((resolve, reject) => {
      connection.once('connect', () => {
        resolve(connection)
        this.onConnected.next(true)
        logInfo('Ring connected to socket.io server')
        assets.forEach((asset) =>
          this.requestList(deviceListMessageType, asset.uuid)
        )
      })
      connection.once('error', reject)
    }).catch(reconnect)
  }

  getConnection() {
    if (!this.hasHubs) {
      return Promise.reject(
        new Error(`Location ${this.name} does not have any hubs`)
      )
    }

    if (this.connectionPromise) {
      return this.connectionPromise
    }

    return (this.connectionPromise = this.createConnection())
  }

  async sendMessage(message: {
    msg: MessageType
    datatype?: MessageDataType
    dst: string
    body?: any
    seq?: number
  }) {
    const connection = await this.getConnection()
    message.seq = this.seq++
    connection.emit('message', message)
  }

  async sendCommandToSecurityPanel(
    commandType: string,
    data?: Record<string, unknown>
  ) {
    const securityPanel = await this.getSecurityPanel()
    securityPanel.sendCommand(commandType, data)
  }

  async setAlarmMode(alarmMode: AlarmMode, bypassSensorZids?: string[]) {
    const securityPanel = await this.getSecurityPanel(),
      updatedDataPromise = firstValueFrom(securityPanel.onData.pipe(skip(1)))

    await this.sendCommandToSecurityPanel('security-panel.switch-mode', {
      mode: alarmMode,
      bypass: bypassSensorZids,
    })

    const updatedData = await updatedDataPromise

    if (updatedData.mode !== alarmMode) {
      throw new Error(
        `Failed to set alarm mode to "${alarmMode}".  Sensors may require bypass, which can only be done in the Ring app.`
      )
    }
  }

  async getAlarmMode() {
    const securityPanel = await this.getSecurityPanel()
    return securityPanel.data.mode as AlarmMode
  }

  soundSiren() {
    return this.sendCommandToSecurityPanel('security-panel.sound-siren')
  }

  silenceSiren() {
    return this.sendCommandToSecurityPanel('security-panel.silence-siren')
  }

  setLightGroup(groupId: string, on: boolean, durationSeconds = 60) {
    return this.restClient.request<any>({
      method: 'POST',
      url: `https://api.ring.com/groups/v1/locations/${this.id}/groups/${groupId}/devices`,
      json: {
        lights_on: {
          duration_seconds: durationSeconds,
          enabled: on,
        },
      },
    })
  }

  getNextMessageOfType(type: MessageType, src: string) {
    return firstValueFrom(
      this.onMessage.pipe(
        filter((m) => m.msg === type && m.src === src),
        map((m) => m.body)
      )
    )
  }

  requestList(listType: MessageType, assetId: string) {
    return this.sendMessage({ msg: listType, dst: assetId })
  }

  async getList(listType: MessageType, assetId: string) {
    await this.requestList(listType, assetId)
    return this.getNextMessageOfType(listType, assetId)
  }

  async getDevices(): Promise<RingDevice[]> {
    if (!this.hasHubs) {
      return Promise.resolve([])
    }

    if (!this.connectionPromise) {
      await this.getConnection()
    }

    return firstValueFrom(this.onDevices)
  }

  getRoomList(assetId: string) {
    return this.getList('RoomGetList', assetId)
  }

  async getSecurityPanel() {
    if (this.securityPanel) {
      return this.securityPanel
    }

    const devices = await this.getDevices(),
      securityPanel = devices.find((device) => {
        return device.data.deviceType === RingDeviceType.SecurityPanel
      })

    if (!securityPanel) {
      throw new Error(
        `Could not find a security panel for location ${this.name} - ${this.id}`
      )
    }

    return (this.securityPanel = securityPanel)
  }

  disarm() {
    return this.setAlarmMode('none')
  }

  armHome(bypassSensorZids?: string[]) {
    return this.setAlarmMode('some', bypassSensorZids)
  }

  armAway(bypassSensorZids?: string[]) {
    return this.setAlarmMode('all', bypassSensorZids)
  }

  getHistory(options: HistoryOptions = {}) {
    options.maxLevel = options.maxLevel || 50

    return this.restClient.request<RingDeviceHistoryEvent[]>({
      url: appApi(
        `rs/history${getSearchQueryString({
          accountId: this.id,
          ...options,
        })}`
      ),
    })
  }

  getCameraEvents(options: CameraEventOptions = {}) {
    return this.restClient.request<CameraEventResponse>({
      url: clientApi(
        `locations/${this.id}/events${getSearchQueryString(options)}`
      ),
    })
  }

  getAccountMonitoringStatus() {
    return this.restClient.request<AccountMonitoringStatus>({
      url: appApi('rs/monitoring/accounts/' + this.id),
    })
  }

  private triggerAlarm(signalType: DispatchSignalType) {
    const now = Date.now(),
      alarmSessionUuid = generateUuid(),
      baseStationAsset =
        this.assets && this.assets.find((x) => x.kind === 'base_station_v1')

    if (!baseStationAsset) {
      throw new Error(
        'Cannot dispatch panic events without an alarm base station'
      )
    }

    return this.restClient.request<AccountMonitoringStatus>({
      method: 'POST',
      url: appApi(
        `rs/monitoring/accounts/${this.id}/assets/${baseStationAsset.uuid}/userAlarm`
      ),
      json: {
        alarmSessionUuid,
        currentTsMs: now,
        eventOccurredTime: now,
        signalType,
      },
    })
  }

  triggerBurglarAlarm() {
    return this.triggerAlarm(DispatchSignalType.Burglar)
  }

  triggerFireAlarm() {
    return this.triggerAlarm(DispatchSignalType.Fire)
  }

  async getLocationMode() {
    this.onLocationModeRequested.next(null)

    const response = await this.restClient.request<LocationModeResponse>({
      method: 'GET',
      url: appApi(`mode/location/${this.id}`),
    })

    this.onLocationMode.next(response.mode)

    return response
  }

  async setLocationMode(mode: LocationModeInput) {
    const response = await this.restClient.request<LocationModeResponse>({
      method: 'POST',
      url: appApi(`mode/location/${this.id}`),
      json: { mode },
    })

    this.onLocationMode.next(response.mode)

    return response
  }

  async disableLocationModes() {
    await this.restClient.request<void>({
      method: 'DELETE',
      url: appApi(`mode/location/${this.id}/settings`),
    })
    this.onLocationMode.next('disabled')
  }

  async enableLocationModes() {
    const response =
      await this.restClient.request<LocationModeSettingsResponse>({
        method: 'POST',
        url: appApi(`mode/location/${this.id}/settings/setup`),
      })

    await this.getLocationMode()

    return response
  }

  getLocationModeSettings() {
    return this.restClient.request<LocationModeSettingsResponse>({
      method: 'GET',
      url: appApi(`mode/location/${this.id}/settings`),
    })
  }

  setLocationModeSettings(settings: LocationModeSettings) {
    return this.restClient.request<LocationModeSettingsResponse>({
      method: 'POST',
      url: appApi(`mode/location/${this.id}/settings`),
      json: settings,
    })
  }

  getLocationModeSharing() {
    return this.restClient.request<LocationModeSharing>({
      method: 'GET',
      url: appApi(`mode/location/${this.id}/sharing`),
    })
  }

  setLocationModeSharing(sharedUsersEnabled: boolean) {
    return this.restClient.request<LocationModeSharing>({
      method: 'POST',
      url: appApi(`mode/location/${this.id}/sharing`),
      json: { sharedUsersEnabled },
    })
  }

  async supportsLocationModeSwitching() {
    if (this.hasAlarmBaseStation || !this.cameras.length) {
      return false
    }

    const modeResponse = await this.getLocationMode(),
      { mode, readOnly } = modeResponse

    logDebug('Location Mode: ' + JSON.stringify(modeResponse))

    return !readOnly && !disabledLocationModes.includes(mode)
  }

  disconnect() {
    this.disconnected = true
    this.unsubscribe()
    this.cameras.forEach((camera) => camera.disconnect())
    this.getDevices()
      .then((devices) => {
        devices.forEach((device) => device.disconnect())
      })
      .catch(logError)

    if (this.connectionPromise) {
      this.connectionPromise
        .then((connection) => connection.close())
        .catch(logError)
    }
  }
}
