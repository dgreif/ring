import { connect as connectSocketIo } from 'socket.io-client'
import { BehaviorSubject, Subject } from 'rxjs'
import {
  filter,
  take,
  map,
  concatMap,
  distinctUntilChanged,
  publishReplay,
  scan,
  refCount
} from 'rxjs/operators'
import { delay, logError, logInfo } from './util'
import {
  AlarmMode,
  RingDeviceData,
  deviceTypesWithVolume,
  RingDeviceType,
  SocketIoMessage,
  MessageType,
  UserLocation,
  TicketAsset,
  MessageDataType
} from './ring-types'
import { RingRestClient } from './rest-client'

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
  onDataUpdate = new Subject()
  onDeviceDataUpdate = this.onDataUpdate.pipe(
    filter((message: any) => {
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
        // TODO: test with beam bridge offline
        this.assets &&
          this.assets.every(asset =>
            this.receivedAssetDeviceLists.includes(asset.uuid)
          )
      )
    }),
    publishReplay(1),
    refCount()
  )
  onConnected = new BehaviorSubject(false)
  reconnecting = false
  connectionPromise?: Promise<SocketIOClient.Socket>
  securityPanel?: RingDevice
  assets?: TicketAsset[]
  receivedAssetDeviceLists: string[] = []

  public readonly locationId: string

  constructor(
    public readonly locationDetails: UserLocation,
    private restClient: RingRestClient
  ) {
    this.locationId = locationDetails.location_id

    // start listening for devices immediately
    this.onDevices.subscribe()
  }

  async createConnection(): Promise<SocketIOClient.Socket> {
    logInfo('Creating location socket.io connection')
    const { assets, ticket, host } = await this.restClient.request<{
      assets: TicketAsset[]
      host: string
      ticket: string
    }>(
      'GET',
      'https://app.ring.com/api/v1/clap/tickets?locationID=' + this.locationId
    )
    this.assets = assets
    this.receivedAssetDeviceLists.length = 0

    if (!assets.length) {
      const errorMessage = `No assets (alarm hubs or beam bridges) found for location ${
        this.locationDetails.name
      } - ${this.locationId}`
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

  async setAlarmMode(alarmMode: AlarmMode, bypassSensorZids?: string[]) {
    const securityPanel = await this.getSecurityPanel()
    return securityPanel.setInfo({
      command: {
        v1: [
          {
            commandType: 'security-panel.switch-mode',
            data: {
              mode: alarmMode,
              bypass: bypassSensorZids
            }
          }
        ]
      }
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
        `Could not find a security panel for location ${
          this.locationDetails.name
        } - ${this.locationId}`
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
}
