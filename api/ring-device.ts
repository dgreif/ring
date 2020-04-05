import { BehaviorSubject } from 'rxjs'
import { deviceTypesWithVolume, RingDeviceData } from './ring-types'
import { filter } from 'rxjs/operators'
import { Location } from './location'

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
      .pipe(filter((update) => update.zid === this.zid))
      .subscribe((update) => this.updateData(update))
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
    })
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
}
