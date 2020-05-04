import 'dotenv/config'
import { RingApi } from '../api'

async function example() {
  const ringApi = new RingApi({
      refreshToken: process.env.RING_REFRESH_TOKEN!,
    }),
    locations = await ringApi.getLocations(),
    [myLocation] = locations,
    [myChime] = myLocation.chimes,
    newRingtone = await myChime.getRingtoneByDescription('Triangle', 'ding')

  await myChime.updateChime({
    chime: {
      settings: {
        ding_audio_id: newRingtone.id,
        ding_audio_user_id: newRingtone.user_id,
      },
    },
  })

  await myChime.playSound('ding')

  await myChime.playSound('motion')
}

example()
