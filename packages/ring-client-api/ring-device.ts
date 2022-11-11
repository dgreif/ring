import { BehaviorSubject } from 'rxjs'
import { deviceTypesWithVolume, RingDeviceData } from './ring-types'
import { filter, map } from 'rxjs/operators'
import { Location } from './location'
import { Subscribed } from './subscribed'
import { logError } from './util'

export class RingDevice extends Subscribed {
  onData
  zid
  id
  deviceType
  categoryId
  onComponentDevices

  constructor(
    private initialData: RingDeviceData,
    public location: Location,
    public assetId: string
  ) {
    super()

    this.onData = new BehaviorSubject(this.initialData)
    this.zid = this.initialData.zid
    this.id = this.zid
    this.deviceType = this.initialData.deviceType
    this.categoryId = this.initialData.categoryId
    this.onComponentDevices = this.location.onDevices.pipe(
      map((devices) => devices.filter(({ data }) => data.parentZid === this.id))
    )

    this.addSubscriptions(
      location.onDeviceDataUpdate
        .pipe(filter((update) => update.zid === this.zid))
        .subscribe((update) => this.updateData(update))
    )
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
          ...body,
        },
      ],
    })
  }

  sendCommand(commandType: string, data = {}) {
    this.setInfo({
      command: {
        v1: [
          {
            commandType,
            data,
          },
        ],
      },
    }).catch(logError)
  }

  toString() {
    return this.toJSON()
  }

  toJSON() {
    return JSON.stringify(
      {
        data: this.data,
      },
      null,
      2
    )
  }

  disconnect() {
    this.unsubscribe()
  }
}
