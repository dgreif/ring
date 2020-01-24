import { getBatteryLevel } from '../../api'

describe('Ring Camera', () => {
  describe('battery level', () => {
    it('should handle string battery life', () => {
      expect(getBatteryLevel({ battery_life: '49' })).toEqual(49)
    })

    it('should handle null battery life', () => {
      expect(getBatteryLevel({ battery_life: null })).toEqual(null)
    })

    it('should handle right battery only', () => {
      expect(
        getBatteryLevel({ battery_life: null, battery_life_2: 24 })
      ).toEqual(24)
    })

    it('should handle left battery only', () => {
      expect(
        getBatteryLevel({ battery_life: 76, battery_life_2: null })
      ).toEqual(76)
    })

    it('should handle dual batteries', () => {
      expect(
        getBatteryLevel({ battery_life: '92', battery_life_2: 84 })
      ).toEqual(84)
      expect(
        getBatteryLevel({ battery_life: '92', battery_life_2: 100 })
      ).toEqual(92)
    })
  })
})
