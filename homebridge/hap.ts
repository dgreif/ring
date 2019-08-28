/* eslint-disable @typescript-eslint/ban-ts-ignore */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace HAP {
  export interface Accessory {
    UUID: string
    displayName: string
    category: number
    services: Service[]

    on(...args: any[]): void
    getService(...args: any[]): Service
    addService(...args: any[]): Service
    removeService(...args: any[]): void
    getServiceByUUIDAndSubType(...args: any[]): Service
    updateReachability(reachable: boolean): void
    setCharacteristic(...args: any[]): Service
    configureCameraSource(cameraSource: any): void
  }

  export interface Service {
    AccessoryInformation: void
    displayName?: string
    UUID: string
    subtype?: string

    setCharacteristic(...args: any[]): Service
    getCharacteristic(...args: any[]): Characteristic
  }

  export interface Characteristic {
    [key: string]: any
    on(
      eventType: 'get',
      callback: (err: any, value: any) => void
    ): Characteristic
    on(
      eventType: 'set',
      handler: (value: any, callback: (err?: Error) => void) => void
    ): Characteristic
    updateValue(
      newValue: boolean | string | number,
      callback?: () => void,
      context?: any
    ): Characteristic
  }

  export interface Log {
    (...args: any[]): void
    error(...args: any[]): void
    debug(...args: any[]): void
    info(...args: any[]): void
  }

  export interface AccessoryConfig {
    [key: string]: any
  }

  export interface Platform {
    on(...args: any[]): void
    registerPlatformAccessories(
      pluginName: string,
      platformName: string,
      accessories: Accessory[]
    ): void
    unregisterPlatformAccessories(
      pluginName: string,
      platformName: string,
      accessories: Accessory[]
    ): void
    publishCameraAccessories(pluginName: string, accessories: Accessory[]): void
  }
}

class Hap {
  // @ts-ignore
  public PlatformAccessory: new (
    displayName: string,
    uuid: string,
    category: number
  ) => HAP.Accessory
  // @ts-ignore
  public Service: {
    [key: string]: any
  }
  // @ts-ignore
  public Characteristic: {
    [key: string]: any
  }
  // @ts-ignore
  public UUIDGen: {
    generate(input: string): string
    unparse(input: Buffer): string
  }
  // @ts-ignore
  public AccessoryCategories: {
    [key: string]: number
  }

  public StreamController: any
}

export const hap = new Hap()
