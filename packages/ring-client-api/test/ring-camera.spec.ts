import {
  getBatteryLevel,
  cleanSnapshotUuid,
  RingCamera,
} from '../ring-camera.ts'
import { StreamingSession } from '../streaming/streaming-session.ts'
import { describe, expect, it, vi } from 'vitest'

describe('Ring Camera', () => {
  describe('battery level', () => {
    it('should handle string battery life', () => {
      expect(
        getBatteryLevel({
          battery_life: '49',
        }),
      ).toEqual(49)
    })

    it('should handle null battery life', () => {
      expect(getBatteryLevel({ battery_life: null })).toEqual(null)
    })

    it('should handle right battery only', () => {
      expect(
        getBatteryLevel({ battery_life: null, battery_life_2: 24 }),
      ).toEqual(24)
    })

    it('should handle left battery only', () => {
      expect(
        getBatteryLevel({ battery_life: 76, battery_life_2: null }),
      ).toEqual(76)
    })

    it('should handle dual batteries', () => {
      expect(
        getBatteryLevel({ battery_life: '92', battery_life_2: 84 }),
      ).toEqual(84)
      expect(
        getBatteryLevel({ battery_life: '92', battery_life_2: 100 }),
      ).toEqual(92)
    })
  })

  describe('cleanSnapshotUuid', () => {
    it('should return the original uuid if it is already clean', () => {
      expect(cleanSnapshotUuid('c2a0a397-3538-422d-bb4e-51837a56b870')).toBe(
        'c2a0a397-3538-422d-bb4e-51837a56b870',
      )
    })

    it('should return remove anything after :', () => {
      expect(
        cleanSnapshotUuid('c2a0a397-3538-422d-bb4e-51837a56b870:122429140'),
      ).toBe('c2a0a397-3538-422d-bb4e-51837a56b870')
    })

    it('should handle falsy values', () => {
      expect(cleanSnapshotUuid(undefined)).toBe(undefined)
      expect(cleanSnapshotUuid(null)).toBe(null)
    })
  })

  describe('startLiveCall', () => {
    it('should throw an error when live_view_disabled is true', async () => {
      // Create a mock camera data object with minimal required fields
      const mockCameraData = {
          id: 123456,
          description: 'Test Camera',
          kind: 'lpd_v1',
          settings: {
            live_view_disabled: true,
            sheila_settings: {
              cv_processing_enabled: true,
              local_storage_enabled: false,
            },
            server_settings: {
              ring_media_server_enabled: true,
            },
          },
        } as any,
        // Create a mock rest client
        mockRestClient = {
          request: vi.fn(),
          onSession: {
            pipe: vi.fn().mockReturnValue({
              subscribe: vi.fn(),
            }),
          },
        } as any,
        // Create a RingCamera instance
        camera = new RingCamera(mockCameraData, false, mockRestClient, false)

      // Attempt to start a live call and expect it to throw
      await expect(camera.startLiveCall()).rejects.toThrow(
        /Live view is currently disabled for Test Camera.*Enable live view for this camera in the Ring app to start streaming/,
      )
    })

    it('should not throw an error when live_view_disabled is false', async () => {
      // Create a mock camera data object
      const mockCameraData = {
          id: 123456,
          description: 'Test Camera',
          kind: 'lpd_v1',
          settings: {
            live_view_disabled: false,
            sheila_settings: {
              cv_processing_enabled: true,
              local_storage_enabled: false,
            },
            server_settings: {
              ring_media_server_enabled: true,
            },
          },
        } as any,
        // Create a mock rest client
        mockRestClient = {
          request: vi.fn().mockResolvedValue({ ticket: 'mock-ticket' }),
          onSession: {
            pipe: vi.fn().mockReturnValue({
              subscribe: vi.fn(),
            }),
          },
        } as any,
        // Create a RingCamera instance
        camera = new RingCamera(mockCameraData, false, mockRestClient, false),
        // startLiveCall should succeed and return a StreamingSession
        session = await camera.startLiveCall()
      expect(session).toBeDefined()
      expect(session).toBeInstanceOf(StreamingSession)
    })

    it('should not throw an error when live_view_disabled is undefined', async () => {
      // Create a mock camera data object
      const mockCameraData = {
          id: 123456,
          description: 'Test Camera',
          kind: 'lpd_v1',
          settings: {
            sheila_settings: {
              cv_processing_enabled: true,
              local_storage_enabled: false,
            },
            server_settings: {
              ring_media_server_enabled: true,
            },
          },
        } as any,
        // Create a mock rest client
        mockRestClient = {
          request: vi.fn().mockResolvedValue({ ticket: 'mock-ticket' }),
          onSession: {
            pipe: vi.fn().mockReturnValue({
              subscribe: vi.fn(),
            }),
          },
        } as any,
        // Create a RingCamera instance
        camera = new RingCamera(mockCameraData, false, mockRestClient, false),
        // startLiveCall should succeed and return a StreamingSession
        session = await camera.startLiveCall()
      expect(session).toBeDefined()
      expect(session).toBeInstanceOf(StreamingSession)
    })
  })
})
