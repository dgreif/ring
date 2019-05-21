import { RingRestClient } from './rest-client'
import { Location } from './location'
import { BaseStation, BeamBridge, UserLocation } from './ring-types'

export * from './location'
export * from './ring-types'

export interface RingAlarmOptions {
  email: string
  password: string
  locationIds?: string[]
}

export async function getLocations(options: RingAlarmOptions) {
  const restClient = new RingRestClient(options.email, options.password)
  const { user_locations: locations } = await restClient.request<{
    user_locations: UserLocation[]
  }>('GET', 'https://app.ring.com/rhq/v1/devices/v1/locations')
  const {
    base_stations: baseStations,
    beams_bridges: beamBridges
  } = await restClient.request<{
    base_stations: BaseStation[]
    beams_bridges: BeamBridge[]
  }>('GET', 'https://app.ring.com/rhq/v1/clients_api/ring_devices')
  const locationIdsWithHubs = [...baseStations, ...beamBridges].map(
    x => x.location_id
  )

  return locations
    .filter(location => {
      return (
        (!Array.isArray(options.locationIds) ||
          options.locationIds.includes(location.location_id)) &&
        locationIdsWithHubs.includes(location.location_id)
      )
    })
    .map(location => new Location(location, restClient))
}
