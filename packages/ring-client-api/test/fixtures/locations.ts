import type { UserLocation } from '../../ring-types.ts'

export const LOCATION_ID = 'loc-alarm-001'

export const userLocation: UserLocation = {
  location_id: LOCATION_ID,
  name: 'Home',
  created_at: '2020-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  owner_id: 1,
  user_verified: true,
  geo_service_verified: 'address_only',
  geo_coordinates: { latitude: '0', longitude: '0' },
  address: {
    address1: '1 Test St',
    address2: '',
    cross_street: '',
    city: 'Testville',
    state: 'CA',
    timezone: 'America/Los_Angeles',
    zip_code: '90000',
  },
}

export const locationsResponse = {
  user_locations: [userLocation],
}
