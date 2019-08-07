import { connect as connectSocketIo } from 'socket.io-client'
import { BehaviorSubject, Subject } from 'rxjs'
import {
  concatMap,
  distinctUntilChanged,
  filter,
  map,
  publishReplay,
  refCount,
  scan,
  skip,
  take
} from 'rxjs/operators'
import { delay, logError, logInfo } from './util'
import {
  AlarmMode,
  AssetSession,
  deviceTypesWithVolume,
  LocationEvent,
  MessageDataType,
  MessageType,
  RingDeviceData,
  RingDeviceType,
  SocketIoMessage,
  TicketAsset,
  UserLocation
} from './ring-types'
import { clientApi, RingRestClient } from './rest-client'
import { RingCamera } from './ring-camera'

const deviceListMessageType = 'DeviceInfoDocGetList'

function flattenDeviceData(data: any): RingDeviceData {
  return Object.assign(
    {},
    data.general && data.general.v2,
    data.device && data.device.v1
  )
}

export class RingDevice {
  onData = new BehaviorSubject(this.initialData)
  zid = this.initialData.zid
  id = this.zid
  deviceType = this.initialData.deviceType
  categoryId = this.initialData.categoryId

  constructor(
    private initialData: RingDeviceData,
    public location: Location,
    public assetId: string
  ) {
    location.onDeviceDataUpdate
      .pipe(filter(update => update.zid === this.zid))
      .subscribe(update => this.updateData(update))
  }

  updateData(update: Partial<RingDeviceData>) {
    this.onData.next(Object.assign({}, this.data, update))
  }

  get data() {
    return this.onData.getValue()
  }

  get name() {
    return this.data.name
  }

  get supportsVolume() {
    return (
      deviceTypesWithVolume.includes(this.data.deviceType) &&
      this.data.volume !== undefined
    )
  }

  setVolume(volume: number) {
    if (isNaN(volume) || volume < 0 || volume > 1) {
      throw new Error('Volume must be between 0 and 1')
    }

    if (!this.supportsVolume) {
      throw new Error(
        `Volume can only be set on ${deviceTypesWithVolume.join(', ')}`
      )
    }

    return this.setInfo({ device: { v1: { volume } } })
  }

  setInfo(body: any) {
    return this.location.sendMessage({
      msg: 'DeviceInfoSet',
      datatype: 'DeviceInfoSetType',
      dst: this.assetId,
      body: [
        {
          zid: this.zid,
          ...body
        }
      ]
    })
  }

  sendCommand(commandType: string, data = {}) {
    this.setInfo({
      command: {
        v1: [
          {
            commandType,
            data
          }
        ]
      }
    })
  }

  toString() {
    return this.toJSON()
  }

  toJSON() {
    return JSON.stringify(
      {
        data: this.data
      },
      null,
      2
    )
  }
}

export class Location {
  private seq = 1

  onMessage = new Subject<SocketIoMessage>()
  onDataUpdate = new Subject<SocketIoMessage>()
  onDeviceDataUpdate = this.onDataUpdate.pipe(
    filter(message => {
      return message.datatype === 'DeviceInfoDocType' && Boolean(message.body)
    }),
    concatMap(message => message.body),
    map(flattenDeviceData)
  )
  onDeviceList = this.onMessage.pipe(
    filter(m => m.msg === deviceListMessageType)
  )
  onDevices = this.onDeviceList.pipe(
    scan(
      (devices, { body: deviceList, src }) => {
        if (!deviceList) {
          return devices
        }

        if (!this.receivedAssetDeviceLists.includes(src)) {
          this.receivedAssetDeviceLists.push(src)
        }

        return deviceList.reduce((updatedDevices: RingDevice[], data) => {
          const flatData = flattenDeviceData(data),
            existingDevice = updatedDevices.find(x => x.zid === flatData.zid)

          if (existingDevice) {
            existingDevice.updateData(flatData)
            return updatedDevices
          }

          return [...updatedDevices, new RingDevice(flatData, this, src)]
        }, devices)
      },
      [] as RingDevice[]
    ),
    distinctUntilChanged((a, b) => a.length === b.length),
    filter(() => {
      return Boolean(
        this.assets &&
          this.assets.every(asset =>
            this.receivedAssetDeviceLists.includes(asset.uuid)
          )
      )
    }),
    publishReplay(1),
    refCount()
  )
  onSessionInfo = this.onDataUpdate.pipe(
    filter(m => m.msg === 'SessionInfo'),
    map(m => m.body as AssetSession[])
  )
  onConnected = new BehaviorSubject(false)
  reconnecting = false
  connectionPromise?: Promise<SocketIOClient.Socket>
  securityPanel?: RingDevice
  assets?: TicketAsset[]
  receivedAssetDeviceLists: string[] = []
  offlineAssets: string[] = []

  public readonly locationId: string

  constructor(
    public readonly locationDetails: UserLocation,
    public readonly cameras: RingCamera[],
    public readonly hasHubs: boolean,
    private restClient: RingRestClient
  ) {
    this.locationId = locationDetails.location_id

    // start listening for devices immediately
    this.onDevices.subscribe()

    // watch for sessions to come online
    this.onSessionInfo.subscribe(sessions => {
      sessions.forEach(({ connectionStatus, assetUuid }) => {
        const assetWasOffline = this.offlineAssets.includes(assetUuid)
        const asset = this.assets && this.assets.find(x => x.uuid === assetUuid)

        if (!asset) {
          // we don't know about this asset, so don't worry about it
          return
        }

        if (connectionStatus === 'online') {
          if (assetWasOffline) {
            this.requestList(deviceListMessageType, assetUuid)
            this.offlineAssets = this.offlineAssets.filter(
              id => id !== assetUuid
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
  }

  async createConnection(): Promise<SocketIOClient.Socket> {
    logInfo('Creating location socket.io connection')
    const { assets, ticket, host } = await this.restClient.request<{
      assets: TicketAsset[]
      host: string
      ticket: string
    }>({
      url:
        'https://app.ring.com/api/v1/clap/tickets?locationID=' + this.locationId
    })
    this.assets = assets
    this.receivedAssetDeviceLists.length = 0
    this.offlineAssets.length = 0

    if (!assets.length) {
      const errorMessage = `No assets (alarm hubs or beam bridges) found for location ${this.locationDetails.name} - ${this.locationId}`
      logError(errorMessage)
      throw new Error(errorMessage)
    }

    const connection = connectSocketIo(
      `wss://${host}/?authcode=${ticket}&ack=false&EIO=3`,
      { transports: ['websocket'] }
    )

    const reconnect = () => {
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
        assets.forEach(asset =>
          this.requestList(deviceListMessageType, asset.uuid)
        )
      })
      connection.once('error', reject)
    }).catch(reconnect)
  }

  async getConnection() {
    if (!this.hasHubs) {
      throw new Error(
        `Location ${this.locationDetails.name} does not have any hubs`
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
        .pipe(
          skip(1),
          take(1)
        )
        .toPromise()

    await this.sendCommandToSecurityPanel('security-panel.switch-mode', {
      mode: alarmMode,
      bypass: bypassSensorZids
    })

    const updatedData = await updatedDataPromise

    if (updatedData.mode !== alarmMode) {
      throw new Error(
        `Failed to set alarm mode to "${alarmMode}".  Sensors may require bypass, which can only be done in the Ring app.`
      )
    }
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
      url: `https://api.ring.com/groups/v1/locations/${this.locationId}/groups/${groupId}/devices`,
      data: {
        lights_on: {
          duration_seconds: durationSeconds,
          enabled: on
        }
      },
      json: true
    })
  }

  getNextMessageOfType(type: MessageType, src: string) {
    return this.onMessage
      .pipe(
        filter(m => m.msg === type && m.src === src),
        map(m => m.body),
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

    const devices = await this.getDevices()
    const securityPanel = devices.find(device => {
      return device.data.deviceType === RingDeviceType.SecurityPanel
    })

    if (!securityPanel) {
      throw new Error(
        `Could not find a security panel for location ${this.locationDetails.name} - ${this.locationId}`
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

  getEvents(limit = 50, olderThanId?: number | string) {
    const paginationKey = olderThanId ? `&pagination_key=${olderThanId}` : ''

    return this.restClient.request<{
      events: LocationEvent[]
      meta: { pagination_key: string }
    }>({
      url: clientApi(
        `locations/${this.locationId}/events?limit=${limit}${paginationKey}`
      )
    })
  }
}
