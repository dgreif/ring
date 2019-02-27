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
import { delay } from './util'
import {
  AlarmMode,
  AlarmDeviceData,
  deviceTypesWithVolume,
  AlarmDeviceType,
  SocketIoMessage,
  MessageType
} from './ring-types'
import { RingRestClient } from './rest-client'

const deviceListMessageType = 'DeviceInfoDocGetList'

function flattenDeviceData(data: any): AlarmDeviceData {
  return Object.assign(
    {},
    data.general && data.general.v2,
    data.device && data.device.v1
  )
}

export class AlarmDevice {
  onData = new BehaviorSubject(this.initialData)
  zid = this.initialData.zid

  constructor(private initialData: AlarmDeviceData, public alarm: Alarm) {
    alarm.onDeviceDataUpdate
      .pipe(filter(update => update.zid === this.zid))
      .subscribe(update => this.updateData(update))
  }

  updateData(update: Partial<AlarmDeviceData>) {
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

    return this.alarm.setDeviceInfo(this.zid, { device: { v1: { volume } } })
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

export class Alarm {
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
    filter(m => m.msg === deviceListMessageType),
    map(m => m.body)
  )
  onDevices = this.onDeviceList.pipe(
    scan(
      (devices, deviceList) => {
        return deviceList.reduce((updatedDevices, data) => {
          const flatData = flattenDeviceData(data),
            existingDevice = updatedDevices.find(x => x.zid === flatData.zid)

          if (existingDevice) {
            existingDevice.updateData(flatData)
            return updatedDevices
          }

          return [...updatedDevices, new AlarmDevice(flatData, this)]
        }, devices)
      },
      [] as AlarmDevice[]
    ),
    distinctUntilChanged((a, b) => a.length === b.length),
    publishReplay(1),
    refCount()
  )
  onConnected = new BehaviorSubject(false)
  reconnecting = false
  connectionPromise?: Promise<SocketIOClient.Socket>
  securityPanelZid?: string

  constructor(
    public readonly locationId: string,
    private restClient: RingRestClient
  ) {
    // start listening for devices immediately
    this.onDevices.subscribe()
  }

  async createConnection(): Promise<SocketIOClient.Socket> {
    // logger('Creating alarm socket.io connection')
    const connectionDetails = await this.restClient.request<{
      server: string
      authCode: string
    }>('POST', 'https://app.ring.com/api/v1/rs/connections', {
      accountId: this.locationId
    })
    const connection = connectSocketIo(
      `wss://${connectionDetails.server}/?authcode=${
        connectionDetails.authCode
      }`,
      { transports: ['websocket'] }
    )
    const reconnect = () => {
      if (this.reconnecting && this.connectionPromise) {
        return this.connectionPromise
      }

      this.onConnected.next(false)

      // logger('Reconnecting alarm socket.io connection')
      this.reconnecting = true
      connection.close()
      return (this.connectionPromise = delay(1000).then(() => {
        return this.createConnection()
      }))
    }

    this.reconnecting = false
    connection.on('DataUpdate', (message: SocketIoMessage) => {
      if (message.datatype === 'HubDisconnectionEventType') {
        // logger('Alarm connection told to reconnect')
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
        // logger('Ring alarm connected to socket.io server')
        this.requestList(deviceListMessageType)
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

  async sendMessage(message: any) {
    const connection = await this.getConnection()
    message.seq = this.seq++
    connection.emit('message', message)
  }

  setDeviceInfo(zid: string, body: any) {
    return this.sendMessage({
      msg: 'DeviceInfoSet',
      datatype: 'DeviceInfoSetType',
      body: [
        {
          zid,
          ...body
        }
      ]
    })
  }

  async setAlarmMode(alarmMode: AlarmMode, bypassSensorZids?: string[]) {
    const zid = await this.getSecurityPanelZid()
    return this.setDeviceInfo(zid, {
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

  getNextMessageOfType(type: MessageType) {
    return this.onMessage
      .pipe(
        filter(m => m.msg === type),
        map(m => m.body),
        take(1)
      )
      .toPromise()
  }

  requestList(listType: MessageType) {
    this.sendMessage({ msg: listType })
  }

  getList(listType: MessageType) {
    this.requestList(listType)
    return this.getNextMessageOfType(listType)
  }

  getDevices() {
    if (!this.connectionPromise) {
      this.getConnection()
    }

    return this.onDevices.pipe(take(1)).toPromise()
  }

  getRoomList() {
    return this.getList('RoomGetList')
  }

  async getSecurityPanelZid() {
    if (this.securityPanelZid) {
      return this.securityPanelZid
    }

    const devices = await this.getDevices()
    const securityPanel = devices.find(device => {
      return device.data.deviceType === AlarmDeviceType.SecurityPanel
    })

    if (!securityPanel) {
      throw new Error(
        `Could not find a security panel for location ${this.locationId}`
      )
    }

    return (this.securityPanelZid = securityPanel.zid)
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
