import { getBatteryLevel, cleanSnapshotUuid } from '../index'

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
})
