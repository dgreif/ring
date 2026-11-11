export interface FakeHub {
  locationId: string
  asset: {
    uuid: string
    kind: string
    doorbotId: number
    onBattery: boolean
    status: 'online' | 'offline'
  }
  docs: any[]
}

export interface FakeScenario {
  description: string
  locations: any[]
  ringDevices: {
    doorbots: any[]
    stickup_cams: any[]
    authorized_doorbots: any[]
    chimes: any[]
    base_stations: any[]
    beams_bridges: any[]
    other: any[]
  }
  hubs: FakeHub[]
  locationModes: Record<string, { mode: string; readOnly: boolean }>
}
