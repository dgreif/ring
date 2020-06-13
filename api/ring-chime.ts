import {
  ChimeData,
  ChimeOptions,
  ChimeSoundKind,
  RingtoneOptions,
} from './ring-types'
import { clientApi, RingRestClient } from './rest-client'
import { delay } from './util'

export class RingChime {
  id = this.initialData.id

  constructor(
    private initialData: ChimeData,
    private restClient: RingRestClient
  ) {}

  get data() {
    return this.initialData
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

  snooze(time: number) {
    return this.restClient.request({
      url: this.chimeUrl('do_not_disturb'),
      method: 'POST',
      json: { time },
    })
  }

  clearSnooze() {
    return this.restClient.request({
      url: this.chimeUrl('do_not_disturb'),
      method: 'POST',
    })
  }

  async updateChime(data: ChimeOptions) {
    await this.restClient.request({
      url: this.chimeUrl(),
      method: 'PUT',
      json: data,
    })

    const {
      ding_audio_user_id,
      motion_audio_id,
      ding_audio_id,
      motion_audio_user_id,
    } = data.chime?.settings || {}

    if (
      ding_audio_id ||
      ding_audio_user_id ||
      motion_audio_id ||
      motion_audio_user_id
    ) {
      // allow chime to update and restart with new ringtone (will blink blue)
      await delay(20000)
    }
  }
}
