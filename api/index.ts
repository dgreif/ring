import { RingRestClient } from './rest-client'
import { unique } from './util'
import { Alarm } from './alarm'
import { BaseStation } from './ring-types'

export * from './alarm'
export * from './ring-types'

export interface RingAlarmOptions {
  email: string
  password: string
  locationIds?: string[]
}

export async function getAlarms(options: RingAlarmOptions) {
  const restClient = new RingRestClient(options.email, options.password)
  const { base_stations: baseStations } = await restClient.request<{
    base_stations: BaseStation[]
  }>('GET', 'https://app.ring.com/rhq/v1/clients_api/ring_devices')
  const locationIds = baseStations
    .map(baseStation => baseStation.location_id)
    .filter(locationId => {
      return (
        !Array.isArray(options.locationIds) ||
        options.locationIds.includes(locationId)
      )
    })

  return unique(locationIds).map(
    locationId => new Alarm(locationId, restClient)
  )
}
