// The default fake account: one location with an alarm hub, a Beams bridge,
// two cameras (one with a light and siren), a chime, an intercom and an
// ONVIF camera. Built from the ring-client-api test fixtures so the fake
// cloud and the unit tests describe the same devices.
import { locationsResponse } from '../../../../../packages/ring-client-api/test/fixtures/locations.ts'
import { buildRingDevicesResponse } from '../../../../../packages/ring-client-api/test/fixtures/ring-devices.ts'
import {
  alarmDeviceList,
  BASE_ASSET_UUID,
  BEAM_ASSET_UUID,
  beamDeviceList,
  clapTicketResponse,
} from '../../../../../packages/ring-client-api/test/fixtures/hub-devices.ts'
import type { FakeScenario } from '../types.ts'

const [baseAsset, beamAsset] = clapTicketResponse.assets,
  locationId = locationsResponse.user_locations[0].location_id

export default function createScenario(): FakeScenario {
  const ringDevices = structuredClone(buildRingDevicesResponse())
  // A mechanical in-home chime on the doorbell, so the plugin publishes the
  // "Front Door In-Home Doorbell" switch.
  Object.assign(ringDevices.doorbots[0].settings, {
    chime_settings: { type: 0, enable: true, duration: 0 },
  })

  return structuredClone({
    description:
      'Alarm + Beams + cameras location ("Home"). Cameras: Front Door (doorbell with in-home chime), Garage Cam (light + siren).',
    locations: locationsResponse.user_locations,
    ringDevices,
    hubs: [
      {
        locationId,
        asset: { ...baseAsset, uuid: BASE_ASSET_UUID },
        docs: alarmDeviceList,
      },
      {
        locationId,
        asset: { ...beamAsset, uuid: BEAM_ASSET_UUID },
        docs: beamDeviceList,
      },
    ],
    locationModes: {},
  })
}
