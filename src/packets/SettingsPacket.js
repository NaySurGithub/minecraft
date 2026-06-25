import { Packet } from './Packet.js'
export class SettingsPacket extends Packet { constructor(data = {}) { super('SETTINGS', data) } }
