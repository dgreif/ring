interface SessionBody {
  doorbot_id: number
  session_id: string
}

interface AnswerMessage {
  method: 'sdp'
  body: {
    sdp: string
    type: 'answer'
  } & SessionBody
}

interface IceCandidateMessage {
  method: 'ice'
  body: {
    ice: string
    mlineindex: number
  } & SessionBody
}

interface SessionCreatedMessage {
  method: 'session_created'
  body: SessionBody
}

interface SessionStartedMessage {
  method: 'session_started'
  body: SessionBody
}

interface PongMessage {
  method: 'pong'
  body: SessionBody
}

interface NotificationMessage {
  method: 'notification'
  body: {
    is_ok: boolean
    text: string
  } & SessionBody
}

interface CameraStartedMessage {
  method: 'camera_started'
  body: SessionBody
}

interface StreamInfoMessage {
  method: 'stream_info'
  body: SessionBody & {
    transcoding: boolean
    transcoding_reason: 'codec_mismatch' | string
  }
}

// eslint-disable-next-line no-shadow
enum CloseReasonCode {
  NormalClose = 0,
  // reason: { code: 5, text: '[rsl-apps/webrtc-liveview-server/Session.cpp:429] [Auth] [0xd540]: [rsl-apps/session-manager/Manager.cpp:227] [AppAuth] Unauthorized: invalid or expired token' }
  // reason: { code: 5, text: 'Authentication failed: -1' }
  // reason: { code: 5, text: 'Sessions with the provided ID not found' }
  AuthenticationFailed = 5,
  // reason: { code: 6, text: 'Timeout waiting for ping' }
  Timeout = 6,
}

interface CloseMessage {
  method: 'close'
  body: {
    reason: { code: CloseReasonCode; text: string }
  } & SessionBody
}

export type IncomingMessage =
  | AnswerMessage
  | IceCandidateMessage
  | SessionCreatedMessage
  | SessionStartedMessage
  | PongMessage
  | CloseMessage
  | NotificationMessage
  | CameraStartedMessage
  | StreamInfoMessage
