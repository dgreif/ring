import { getBatteryLevel } from '../../api'
import { expect } from 'chai'

describe('Ring Camera', () => {
  describe('battery level', () => {
    it('should handle string battery life', () => {
      expect(getBatteryLevel({ battery_life: '49' })).to.equal(49)
    })

    it('should handle null battery life', () => {
      expect(getBatteryLevel({ battery_life: null })).to.equal(null)
    })

    it('should handle right battery only', () => {
      expect(
        getBatteryLevel({ battery_life: null, battery_life_2: 24 })
      ).to.equal(24)
    })

    it('should handle left battery only', () => {
      expect(
        getBatteryLevel({ battery_life: 76, battery_life_2: null })
      ).to.equal(76)
    })

    it('should handle dual batteries', () => {
      expect(
        getBatteryLevel({ battery_life: '92', battery_life_2: 84 })
      ).to.equal((84 + 92) / 2)
    })
  })
})
