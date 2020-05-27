import {
  decodeCryptoValue,
  generateSrtpOptions,
  getSrtpValue,
} from '../../api/rtp-utils'

describe('Rtp Utils', () => {
  describe('decodeCryptoValue', () => {
    it('should decode an srtp crypto string', () => {
      const input = 'NqC4Z0iABIbW2WLZHK4VGAdtjdsemf7qf9/odBa8',
        decoded = decodeCryptoValue(input)

      expect(decoded).toEqual({
        srtpKey: Buffer.from('36a0b86748800486d6d962d91cae1518', 'hex'),
        srtpSalt: Buffer.from('076d8ddb1e99feea7fdfe87416bc', 'hex'),
      })
    })
  })

  describe('getSrtpValue', () => {
    it('should decode an srtp crypto string', () => {
      const input = 'DRhwQ59h1cODtqGEmpomv3XvRfkH/nIHV/y1RVff',
        srtpOptions = decodeCryptoValue(input)

      expect(getSrtpValue(srtpOptions)).toEqual(input)
    })
  })

  describe('generateSrtpOptions', () => {
    it('should generate valid options', () => {
      const { srtpKey, srtpSalt } = generateSrtpOptions()

      expect(srtpKey.length).toEqual(16)
      expect(srtpSalt.length).toEqual(14)
    })

    it('should be able to be encoded/decode from base64', () => {
      const options = generateSrtpOptions(),
        srtpValue = getSrtpValue(options),
        decodedOptions = decodeCryptoValue(srtpValue)

      expect(decodedOptions).toEqual(options)
    })
  })
})
