import { getBatteryLevel, cleanSnapshotUuid } from '../index'

describe('Ring Camera', () => {
  describe('battery level', () => {
    it('should handle string battery life', () => {
      expect(
        getBatteryLevel({
          battery_life: '49',
          battery_life_2: '50'
        })
      ).toEqual({ primary: 49, secondary: 50 })
    })

    it('should handle string battery life (no secondary)', () => {
      expect(
        getBatteryLevel({
          battery_life: '49'
        })
      ).toEqual({ primary: 49, secondary: null })
    })

    it('should handle null battery life', () => {
      expect(getBatteryLevel({ battery_life: null })).toEqual({ primary: null, secondary: null })
    })

    it('should handle right battery only', () => {
      expect(
        getBatteryLevel({ battery_life: null, battery_life_2: 24 })
      ).toEqual({ primary: null, secondary: 24 })
    })

    it('should handle left battery only', () => {
      expect(
        getBatteryLevel({ battery_life: 76, battery_life_2: null })
      ).toEqual({ primary: 76, secondary: null })
    })

    it('should handle dual batteries', () => {
      expect(
        getBatteryLevel({ battery_life: '92', battery_life_2: 84 })
      ).toEqual({ primary: 92, secondary: 84 })
      expect(
        getBatteryLevel({ battery_life: '92', battery_life_2: 100 })
      ).toEqual({ primary: 92, secondary: 100 })
    })
  })

  describe('cleanSnapshotUuid', () => {
    it('should return the original uuid if it is already clean', () => {
      expect(cleanSnapshotUuid('c2a0a397-3538-422d-bb4e-51837a56b870')).toBe(
        'c2a0a397-3538-422d-bb4e-51837a56b870'
      )
    })

    it('should return remove anything after :', () => {
      expect(
        cleanSnapshotUuid('c2a0a397-3538-422d-bb4e-51837a56b870:122429140')
      ).toBe('c2a0a397-3538-422d-bb4e-51837a56b870')
    })

    it('should handle falsy values', () => {
      expect(cleanSnapshotUuid(undefined)).toBe(undefined)
      expect(cleanSnapshotUuid(null)).toBe(null)
    })
  })
})
