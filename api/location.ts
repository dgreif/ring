import { connect as connectSocketIo } from 'socket.io-client'
import { BehaviorSubject, merge, ReplaySubject, Subject } from 'rxjs'
import {
  concatMap,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  publishReplay,
  refCount,
  scan,
  skip,
  take,
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
} from './ring-types'
import { appApi, clientApi, RingRestClient } from './rest-client'
import { getSearchQueryString, RingCamera } from './ring-camera'
import { RingDevice } from './ring-device'

const deviceListMessageType = 'DeviceInfoDocGetList'

function flattenDeviceData(data: any): RingDeviceData {
  return Object.assign(
    {},
    data.general && data.general.v2,
    data.device && data.device.v1
  )
}

export class Location {
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
  onDevices = this.onDeviceList.pipe(
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
    publishReplay(1),
    refCount()
  )
  onSessionInfo = this.onDataUpdate.pipe(
    filter((m) => m.msg === 'SessionInfo'),
    map((m) => m.body as AssetSession[])
  )
  onConnected = new BehaviorSubject(false)
  onLocationMode = new ReplaySubject<LocationMode>(1)
  private onLocationModeRequested = new Subject()
  reconnecting = false
  connectionPromise?: Promise<SocketIOClient.Socket>
  securityPanel?: RingDevice
  assets?: TicketAsset[]
  receivedAssetDeviceLists: string[] = []
  offlineAssets: string[] = []
  hasHubs = this.options.hasHubs
  hasAlarmBaseStation = this.options.hasAlarmBaseStation

  constructor(
    public readonly locationDetails: UserLocation,
    public readonly cameras: RingCamera[],
    public readonly options: {
      hasHubs: boolean
      hasAlarmBaseStation: boolean
      locationModePollingSeconds?: number
    },
    private restClient: RingRestClient
  ) {
    // start listening for devices immediately
    this.onDevices.subscribe()

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
            this.requestList(deviceListMessageType, assetUuid)
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

    if (!options.hasAlarmBaseStation && options.locationModePollingSeconds) {
      merge(this.onLocationModeRequested, this.onLocationMode)
        .pipe(debounceTime(options.locationModePollingSeconds * 1000))
        .subscribe(() => this.getLocationMode())

      void this.getLocationMode()
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

  async createConnection(): Promise<SocketIOClient.Socket> {
    logInfo('Creating location socket.io connection')
    const { assets, ticket, host } = await this.restClient.request<{
      assets: TicketAsset[]
      host: string
      ticket: string
    }>({
      url: appApi('clap/tickets?locationID=' + this.id),
    })
    this.assets = assets
    this.receivedAssetDeviceLists.length = 0
    this.offlineAssets.length = 0

    if (!assets.length) {
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

        logInfo('Reconnecting location socket.io connection')
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
    return new Promise<SocketIOClient.Socket>((resolve, reject) => {
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

  async sendCommandToSecurityPanel(commandType: string, data?: {}) {
    const securityPanel = await this.getSecurityPanel()
    securityPanel.sendCommand(commandType, data)
  }

  async setAlarmMode(alarmMode: AlarmMode, bypassSensorZids?: string[]) {
    const securityPanel = await this.getSecurityPanel(),
      updatedDataPromise = securityPanel.onData
        .pipe(skip(1), take(1))
        .toPromise()

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
    this.restClient.request<any>({
      method: 'POST',
      url: `https://api.ring.com/groups/v1/locations/${this.id}/groups/${groupId}/devices`,
      data: {
        lights_on: {
          duration_seconds: durationSeconds,
          enabled: on,
        },
      },
      json: true,
    })
  }

  getNextMessageOfType(type: MessageType, src: string) {
    return this.onMessage
      .pipe(
        filter((m) => m.msg === type && m.src === src),
        map((m) => m.body),
        take(1)
      )
      .toPromise()
  }

  requestList(listType: MessageType, assetId: string) {
    this.sendMessage({ msg: listType, dst: assetId })
  }

  getList(listType: MessageType, assetId: string) {
    this.requestList(listType, assetId)
    return this.getNextMessageOfType(listType, assetId)
  }

  getDevices() {
    if (!this.hasHubs) {
      return [] as RingDevice[]
    }

    if (!this.connectionPromise) {
      this.getConnection()
    }

    return this.onDevices.pipe(take(1)).toPromise()
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
      json: true,
      data: {
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
    this.onLocationModeRequested.next()

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
      json: true,
      data: { mode },
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
      data: settings,
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
      json: true,
      data: { sharedUsersEnabled },
    })
  }

  async supportsLocationModeSwitching() {
    if (this.hasAlarmBaseStation || !this.cameras.length) {
      return false
    }

    const modeResponse = await this.getLocationMode(),
      { mode, readOnly, notYetParticipatingInMode } = modeResponse

    logDebug('Location Mode: ' + JSON.stringify(modeResponse))

    return (
      !readOnly &&
      !notYetParticipatingInMode?.length &&
      !disabledLocationModes.includes(mode)
    )
  }
}
