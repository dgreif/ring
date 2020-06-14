import {
  ChimeData,
  ChimeUpdate,
  ChimeSoundKind,
  RingtoneOptions,
} from './ring-types'
import { clientApi, RingRestClient } from './rest-client'
import { BehaviorSubject, Subject } from 'rxjs'

const settingsWhichRequireReboot = [
  'ding_audio_id',
  'ding_audio_user_id',
  'motion_audio_id',
  'motion_audio_user_id',
]

export class RingChime {
  id = this.initialData.id
  deviceType = this.initialData.kind
  model = this.deviceType === 'chime_pro' ? 'Chime Pro' : 'Chime'
  onData = new BehaviorSubject<ChimeData>(this.initialData)
  onRequestUpdate = new Subject()

  constructor(
    private initialData: ChimeData,
    private restClient: RingRestClient
  ) {}

  updateData(update: ChimeData) {
    this.onData.next(update)
  }

  requestUpdate() {
    this.onRequestUpdate.next()
  }

  get data() {
    return this.onData.getValue()
  }

  get name() {
    return this.data.description
  }

  get description() {
    return this.data.description
  }

  get volume() {
    return this.data.settings.volume
  }

  getRingtones() {
    return this.restClient.request<RingtoneOptions>({
      url: clientApi('ringtones'),
    })
  }

  async getRingtoneByDescription(description: string, kind: ChimeSoundKind) {
    const ringtones = await this.getRingtones(),
      requestedRingtone = ringtones.audios.find(
        (audio) =>
          audio.available &&
          audio.description === description &&
          audio.kind === kind
      )

    if (!requestedRingtone) {
      throw new Error('Requested ringtone not found')
    }

    return requestedRingtone
  }

  chimeUrl(path = '') {
    return clientApi(`chimes/${this.id}/${path}`)
  }

  playSound(kind: ChimeSoundKind) {
    return this.restClient.request({
      url: this.chimeUrl('play_sound'),
      method: 'POST',
      json: { kind },
    })
  }

  async snooze(time: number) {
    // time is in minutes, max 24 * 60 (1440)
    await this.restClient.request({
      url: this.chimeUrl('do_not_disturb'),
      method: 'POST',
      json: { time },
    })

    this.requestUpdate()
  }

  async clearSnooze() {
    await this.restClient.request({
      url: this.chimeUrl('do_not_disturb'),
      method: 'POST',
    })

    this.requestUpdate()
  }

  async updateChime(update: ChimeUpdate) {
    await this.restClient.request({
      url: this.chimeUrl(),
      method: 'PUT',
      json: { chime: update },
    })

    this.requestUpdate()

    // inform caller if this change requires a reboot
    return Object.keys(update.settings || {}).some((key) =>
      settingsWhichRequireReboot.includes(key)
    )
  }

  setVolume(volume: number) {
    if (volume < 0 || volume > 11) {
      throw new Error(
        `Volume for ${this.name} must be between 0 and 11, got ${volume}`
      )
    }

    return this.updateChime({
      settings: {
        volume,
      },
    })
  }
}
