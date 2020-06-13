import 'dotenv/config'
import { RingApi } from '../api'

async function example() {
  const ringApi = new RingApi({
      refreshToken: process.env.RING_REFRESH_TOKEN!,
    }),
    [location] = await ringApi.getLocations(),
    [chime] = location.chimes,
    newRingtone = await chime.getRingtoneByDescription('Triangle', 'ding')

  await chime.updateChime({
    chime: {
      settings: {
        ding_audio_id: newRingtone.id,
        ding_audio_user_id: newRingtone.user_id,
      },
    },
  })

  await chime.playSound('ding')

  await chime.playSound('motion')
}

example()
