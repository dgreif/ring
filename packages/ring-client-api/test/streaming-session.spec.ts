import { ReplaySubject, Subject } from 'rxjs'
import type { RtpPacket } from 'werift'
import { describe, expect, it, vi } from 'vitest'
import { StreamingSession } from '../streaming/streaming-session.ts'

function createConnection() {
  return {
    onAudioRtp: new Subject<RtpPacket>(),
    onVideoRtp: new Subject<RtpPacket>(),
    onCallAnswered: new ReplaySubject<string>(1),
    onCallEnded: new ReplaySubject<{ code: number; text: string } | undefined>(
      1,
    ),
    onError: new ReplaySubject<void>(1),
    activateCameraSpeaker: vi.fn(),
    requestKeyFrame: vi.fn(),
    sendAudioPacket: vi.fn(),
    stop: vi.fn(),
  }
}

function createRtp(sequenceNumber: number, timestamp: number) {
  return {
    header: { sequenceNumber, timestamp },
    payload: Buffer.alloc(0),
  } as RtpPacket
}

describe('StreamingSession', () => {
  it('keeps RTP continuous and requests a key frame after answered_timeout', async () => {
    const initialConnection = createConnection(),
      replacementConnection = createConnection(),
      createReplacement = vi.fn().mockResolvedValue(replacementConnection),
      session = new StreamingSession(
        { name: 'Front Door' } as any,
        initialConnection as any,
        createReplacement,
      ),
      packets: RtpPacket[] = []

    session.onVideoRtp.subscribe((packet) => packets.push(packet))
    initialConnection.onVideoRtp.next(createRtp(40000, 90000))
    initialConnection.onVideoRtp.next(createRtp(40001, 93000))
    initialConnection.onCallEnded.next({
      code: 10,
      text: 'answered_timeout',
    })

    await vi.waitFor(() => expect(createReplacement).toHaveBeenCalledOnce())

    replacementConnection.onCallAnswered.next('v=0')
    replacementConnection.onVideoRtp.next(createRtp(100, 5000))
    replacementConnection.onVideoRtp.next(createRtp(101, 8000))

    expect(
      packets.map(({ header }) => [header.sequenceNumber, header.timestamp]),
    ).toEqual([
      [40000, 90000],
      [40001, 93000],
      [40002, 96000],
      [40003, 99000],
    ])
    expect(replacementConnection.requestKeyFrame).toHaveBeenCalledOnce()

    session.stop()
  })

  it('ends instead of reconnecting for other close reasons', () => {
    const connection = createConnection(),
      createReplacement = vi.fn(),
      session = new StreamingSession(
        { name: 'Front Door' } as any,
        connection as any,
        createReplacement,
      ),
      ended = vi.fn()

    session.onCallEnded.subscribe(ended)
    connection.onCallEnded.next({ code: 9, text: 'answered_timeout' })

    expect(createReplacement).not.toHaveBeenCalled()
    expect(ended).toHaveBeenCalledOnce()
  })
})
