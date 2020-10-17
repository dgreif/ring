import { SrtpOptions } from '@homebridge/camera-utils'
import { map } from 'rxjs/operators'
import { randomInteger } from './util'
import { timer } from 'rxjs'
import { RtpHeader, SrtpSession } from 'werift-rtp'

export class RtpLatchGenerator {
  public readonly ssrc = randomInteger()
  private payload = Buffer.alloc(1, 0)
  private srtpSession = new SrtpSession({
    keys: {
      localMasterKey: this.srtpOptions.srtpKey,
      localMasterSalt: this.srtpOptions.srtpSalt,
      remoteMasterKey: this.srtpOptions.srtpKey,
      remoteMasterSalt: this.srtpOptions.srtpSalt,
    },
    profile: 1,
  })

  onLatchPacket = timer(0, 60).pipe(
    map((sequenceNumber) => {
      return this.srtpSession.encrypt(
        this.payload,
        new RtpHeader({
          padding: false,
          extension: false,
          marker: false,
          payloadType: this.payloadType,
          sequenceNumber: sequenceNumber % Math.pow(2, 32),
          timestamp: Date.now() % Math.pow(2, 32),
          ssrc: this.ssrc,
        })
      )
    })
  )

  constructor(
    public readonly srtpOptions: SrtpOptions,
    public readonly payloadType: number
  ) {}
}
