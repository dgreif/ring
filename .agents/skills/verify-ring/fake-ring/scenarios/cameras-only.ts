// A cameras-only location with no alarm or Beams hub. This is the only setup
// where the plugin exposes the "<Location> Mode" switch (Ring location modes).
import {
  doorbellCamera,
  stickupCamera,
} from '../../../../../packages/ring-client-api/test/fixtures/ring-devices.ts'
import { userLocation } from '../../../../../packages/ring-client-api/test/fixtures/locations.ts'
import type { FakeScenario } from '../types.ts'

const locationId = 'loc-cams-001'

export default function createScenario(): FakeScenario {
  return structuredClone({
    description:
      'Cameras-only location ("Cabin") with Ring location modes enabled. Exposes the "Cabin Mode" security system.',
    locations: [{ ...userLocation, location_id: locationId, name: 'Cabin' }],
    ringDevices: {
      doorbots: [
        {
          ...doorbellCamera,
          id: 7001,
          description: 'Cabin Door',
          location_id: locationId,
        },
      ],
      stickup_cams: [
        {
          ...stickupCamera,
          id: 7002,
          description: 'Cabin Yard',
          location_id: locationId,
        },
      ],
      authorized_doorbots: [],
      chimes: [],
      base_stations: [],
      beams_bridges: [],
      other: [],
    },
    hubs: [],
    locationModes: {
      [locationId]: { mode: 'disarmed', readOnly: false },
    },
  })
}
