import mqtt from 'mqtt'

const MQTT_BROKER = 'wss://broker.hivemq.com:8884/mqtt'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
]

class WebRTCConnection {
  constructor(peerConnection, dataChannel) {
    this.pc = peerConnection
    this.channel = dataChannel
    this.open = false
    this.onMessage = null
    this.onClose = null
    this.onError = null

    this.channel.onopen = () => {
      this.open = true
      if (this.onOpenCallback) this.onOpenCallback()
    }

    this.channel.onmessage = (event) => {
      if (this.onMessage) {
        try {
          const parsed = JSON.parse(event.data)
          this.onMessage(parsed)
        } catch (e) {
          this.onMessage(event.data)
        }
      }
    }

    this.channel.onclose = () => {
      this.open = false
      if (this.onClose) this.onClose()
    }

    this.channel.onerror = (err) => {
      if (this.onError) this.onError(err)
    }
  }

  send(data) {
    if (!this.open) return false
    try {
      this.channel.send(JSON.stringify(data))
      return true
    } catch (e) {
      if (this.onError) this.onError(e)
      return false
    }
  }

  close() {
    try { this.channel.close() } catch (e) {}
    try { this.pc.close() } catch (e) {}
  }
}

export function createHost(roomCode, handlers) {
  const client = mqtt.connect(MQTT_BROKER)
  const clientConnections = new Map()

  const hostTopic = `nazzacraft/rooms/${roomCode}/client_to_host`

  const session = {
    client,
    roomCode,
    ready: false,
    destroyed: false,
    destroy() {
      this.destroyed = true
      try { client.end() } catch (e) {}
      for (const conn of clientConnections.values()) {
        conn.close()
      }
    }
  }

  client.on('connect', () => {
    client.subscribe(hostTopic, (err) => {
      if (err) {
        if (handlers.onError) handlers.onError(err)
        return
      }
      session.ready = true
      if (handlers.onReady) handlers.onReady(roomCode)
    })
  })

  client.on('message', async (topic, message) => {
    if (topic !== hostTopic) return

    try {
      const msg = JSON.parse(message.toString())

      if (msg.type === 'join') {
        const { clientId } = msg
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
        const channel = pc.createDataChannel('game', { ordered: true })

        const connWrapper = new WebRTCConnection(pc, channel)
        clientConnections.set(clientId, connWrapper)

        pc.onicecandidate = (e) => {
          if (e.candidate && !session.destroyed) {
            client.publish(
              `nazzacraft/rooms/${roomCode}/host_to_client/${clientId}`,
              JSON.stringify({
                type: 'signal',
                data: { candidate: e.candidate }
              })
            )
          }
        }

        connWrapper.onOpenCallback = () => {
          if (handlers.onConnection) handlers.onConnection(connWrapper)
        }

        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        client.publish(
          `nazzacraft/rooms/${roomCode}/host_to_client/${clientId}`,
          JSON.stringify({
            type: 'signal',
            data: { sdp: pc.localDescription }
          })
        )
      }

      else if (msg.type === 'signal') {
        const { clientId, data } = msg
        const connWrapper = clientConnections.get(clientId)
        if (!connWrapper) return

        if (data.sdp) {
          await connWrapper.pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
        } else if (data.candidate) {
          await connWrapper.pc.addIceCandidate(new RTCIceCandidate(data.candidate))
        }
      }

      else if (msg.type === 'leave') {
        const { clientId } = msg
        const connWrapper = clientConnections.get(clientId)
        if (connWrapper) {
          connWrapper.close()
          clientConnections.delete(clientId)
        }
      }
    } catch (err) {
      if (handlers.onError) handlers.onError(err)
    }
  })

  client.on('error', (err) => {
    if (handlers.onError) handlers.onError(err)
  })

  return session
}

export function connectClient(roomCode, handlers) {
  const client = mqtt.connect(MQTT_BROKER)
  const clientId = Math.random().toString(36).substring(2, 9)
  let pc = null
  let connWrapper = null

  const clientTopic = `nazzacraft/rooms/${roomCode}/host_to_client/${clientId}`
  const hostTopic = `nazzacraft/rooms/${roomCode}/client_to_host`

  const session = {
    client,
    roomCode,
    connection: null,
    destroyed: false,
    destroy() {
      this.destroyed = true
      try {
        client.publish(hostTopic, JSON.stringify({ type: 'leave', clientId }))
      } catch (e) {}
      try { client.end() } catch (e) {}
      if (connWrapper) connWrapper.close()
    }
  }

  client.on('connect', () => {
    client.subscribe(clientTopic, (err) => {
      if (err) {
        if (handlers.onError) handlers.onError(err)
        return
      }
      client.publish(hostTopic, JSON.stringify({ type: 'join', clientId }))
    })
  })

  client.on('message', async (topic, message) => {
    if (topic !== clientTopic) return

    try {
      const msg = JSON.parse(message.toString())

      if (msg.type === 'signal') {
        const { data } = msg

        if (data.sdp) {
          pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

          pc.onicecandidate = (e) => {
            if (e.candidate && !session.destroyed) {
              client.publish(hostTopic, JSON.stringify({
                type: 'signal',
                clientId,
                data: { candidate: e.candidate }
              }))
            }
          }

          pc.ondatachannel = (e) => {
            connWrapper = new WebRTCConnection(pc, e.channel)
            session.connection = connWrapper
            connWrapper.onOpenCallback = () => {
              if (handlers.onConnected) handlers.onConnected(connWrapper)
            }
          }

          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)

          client.publish(hostTopic, JSON.stringify({
            type: 'signal',
            clientId,
            data: { sdp: pc.localDescription }
          }))
        } else if (data.candidate && pc) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
        }
      }
    } catch (err) {
      if (handlers.onError) handlers.onError(err)
    }
  })

  client.on('error', (err) => {
    if (handlers.onError) handlers.onError(err)
  })

  return session
}

export function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}
