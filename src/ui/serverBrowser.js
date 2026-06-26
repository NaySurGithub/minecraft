import { t } from './translator.js'
import { DedicatedClientSession } from '../net/dedicatedClient.js'
import { MSG } from '../net/protocol.js'

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

const SERVERS_KEY = 'nazzaandnaycraft_servers'
const PING_TIMEOUT_MS = 5000

/**
 * Ping a server by opening a temporary WebSocket connection.
 * Sends a STATUS packet and waits for STATUS_RESPONSE.
 * Returns a promise that resolves with server info or null on failure.
 */
function pingServer(address, port) {
  return new Promise((resolve) => {
    let settled = false
    let gotResponse = false
    const startTime = Date.now()
    const done = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { ws.close() } catch (e) {}
      resolve(result)
    }

    const timer = setTimeout(() => done(null), PING_TIMEOUT_MS)

    let ws
    try {
     let protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://'
     ws = new WebSocket(protocol + address + ':' + port)
    } catch (e) {
      done(null)
      return
    }

    ws.onopen = () => {
      // Send a lightweight status query
      try {
        ws.send(JSON.stringify({ t: MSG.STATUS }))
      } catch (e) {
        done(null)
      }
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.t === MSG.STATUS_RESPONSE) {
          gotResponse = true
          done({
            online: true,
            version: String(msg.version || '?'),
            players: typeof msg.players === 'number' ? msg.players : 0,
            maxPlayers: typeof msg.maxPlayers === 'number' ? msg.maxPlayers : 20,
            motd: msg.motd || '',
            gameMode: msg.gameMode || '',
            difficulty: msg.difficulty || '',
            ping: Date.now() - startTime
          })
        }
      } catch (e) {
        // ignore parse errors, wait for timeout
      }
    }

    ws.onerror = () => done(null)
    ws.onclose = () => {
      if (!gotResponse) done(null)
    }
  })
}

export class ServerBrowser {
  constructor(menu) {
    this.menu = menu
    this.selectedServerId = null
    this.servers = this.loadServers()
    this._pinging = false
  }

  loadServers() {
    try {
      const saved = JSON.parse(localStorage.getItem(SERVERS_KEY) || 'null')
      return saved || []
    } catch (e) {
      return []
    }
  }

  saveServers() {
    localStorage.setItem(SERVERS_KEY, JSON.stringify(this.servers))
  }

  show(callbacks) {
    this.menu.clear('mc-dirt-menu')
    this.selectedServerId = null

    // Title
    this.menu.root.appendChild(el('h1', 'mc-menu-title', t('playMultiplayer') || 'Play Multiplayer'))

    // Server list
    const list = el('div', 'mc-world-list')
    list.id = 'mc-server-list'

    // Click on empty area to deselect
    list.addEventListener('click', (e) => {
      if (e.target === list) {
        this.deselectServer()
        this.updateButtons()
      }
    })

    this.renderServerList(list)

    // Empty state
    if (!this.servers.length) {
      list.appendChild(el('div', 'mc-world-empty', t('noServers') || 'No servers added yet. Click "Add Server" to get started.'))
    }

    this.menu.root.appendChild(list)

    // Bottom area with buttons
    const bottomWrap = el('div', 'mc-server-bottom-wrap')
    
    // Actions row (shown only when server is selected) - outside the grid
    this.actionsRow = el('div', 'mc-server-actions-row')
    this.actionsRow.id = 'mc-server-actions'
    this.actionsRow.style.display = 'none'

    this.joinBtn = this.menu.button(t('joinServer') || 'Join Server', () => this.joinServer(callbacks))
    this.actionsRow.appendChild(this.joinBtn)

    this.editBtn = this.menu.button(t('editServer') || 'Edit', () => this.showEditServer(callbacks))
    this.actionsRow.appendChild(this.editBtn)

    this.deleteBtn = this.menu.button(t('delete') || 'Delete', () => this.deleteServer(callbacks), 'mc-danger-btn')
    this.actionsRow.appendChild(this.deleteBtn)

    bottomWrap.appendChild(this.actionsRow)

    // Grid for always visible buttons
    const bottom = el('div', 'mc-menu-bottom')

    // Always visible buttons
    this.directConnBtn = this.menu.button(t('directConnection') || 'Direct Connection', () => this.showDirectConnection(callbacks))
    bottom.appendChild(this.directConnBtn)
    
    this.addServerBtn = this.menu.button(t('addServer') || 'Add Server', () => this.showAddServer(callbacks))
    bottom.appendChild(this.addServerBtn)

    this.refreshBtn = this.menu.button(t('refresh') || 'Refresh', () => this.refreshServers(callbacks))
    bottom.appendChild(this.refreshBtn)

    this.cancelBtn = this.menu.button(t('cancel') || 'Cancel', () => this.menu.showMain(callbacks))
    bottom.appendChild(this.cancelBtn)

    bottomWrap.appendChild(bottom)
    this.menu.root.appendChild(bottomWrap)

    // Auto-ping on first show
    this.pingAllServers()
  }

  renderServerList(list) {
    if (!list) return
    list.innerHTML = ''
    for (const server of this.servers) {
      const row = this.createServerRow(server)
      list.appendChild(row)
    }
  }

  createServerRow(server) {
    const item = el('button', 'mc-world-entry mc-server-entry')
    item.type = 'button'
    item.dataset.serverId = server.id

    // Build the content
    const nameLine = el('strong', '', server.name)
    item.appendChild(nameLine)

    // Status line
    const status = el('span')
    if (server.online) {
      const pingText = server.ping != null && server.ping >= 0 ? ' ' + server.ping + 'ms' : ''
      status.textContent = (server.version || 'v?') + ' \u2022 ' + server.players + '/' + server.maxPlayers + ' players' + pingText
      status.className = 'mc-server-status-online'
    } else if (server.pinging) {
      status.textContent = t('pinging') || 'Pinging...'
      status.className = 'mc-server-status-pinging'
    } else {
      status.textContent = t('cantConnect') || "Can't connect to server."
      status.className = 'mc-server-status-offline'
    }
    item.appendChild(status)

    // MOTD line (if available)
    if (server.motd) {
      const motdLine = el('span', 'mc-server-motd', server.motd)
      item.appendChild(motdLine)
    }

    // Address line
    const addr = el('span', 'mc-server-address', server.address)
    item.appendChild(addr)

    // Click handler
    item.onclick = () => {
      this.selectedServerId = server.id
      const serverList = document.getElementById('mc-server-list')
      if (serverList) {
        for (const child of serverList.children) child.classList.remove('selected')
      }
      item.classList.add('selected')
      this.updateButtons()
    }

    return item
  }

  selectServer(serverId) {
    this.selectedServerId = serverId
    this.updateButtons()
  }

  deselectServer() {
    this.selectedServerId = null
    const list = document.getElementById('mc-server-list')
    if (list) {
      for (const child of list.children) child.classList.remove('selected')
    }
    this.updateButtons()
  }

  updateButtons() {
    const hasSelection = this.selectedServerId !== null
    if (this.actionsRow) {
      this.actionsRow.style.display = hasSelection ? 'flex' : 'none'
    }
  }

  getSelectedServer() {
    return this.servers.find(s => s.id === this.selectedServerId)
  }

  async joinServer(callbacks) {
    const server = this.getSelectedServer()
    if (!server) return
    
    const parts = server.address.split(':')
    const address = parts[0]
    const port = parseInt(parts[1]) || 25565
    
    // Call the join callback with server info
    if (callbacks.joinDedicated) {
      callbacks.joinDedicated(address, port, server.name)
    }
  }

  showDirectConnection(callbacks) {
    this.menu.clear('mc-dirt-menu')
    this.menu.root.appendChild(el('h1', 'mc-menu-title', t('directConnection') || 'Direct Connection'))

    const form = el('div', 'mc-create-form')
    form.appendChild(el('label', '', t('serverAddress') || 'Server Address'))

    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = 'e.g., 192.168.1.100:25565'
    form.appendChild(input)

    this.menu.root.appendChild(form)

    const bottom = el('div', 'mc-menu-bottom')
    bottom.appendChild(this.menu.button(t('connect') || 'Connect', () => {
      const address = input.value.trim()
      if (!address) return
      
      const parts = address.split(':')
      const host = parts[0]
      const port = parseInt(parts[1]) || 25565
      
      if (callbacks.joinDedicated) {
        callbacks.joinDedicated(host, port, 'Direct Connection')
      }
    }))
    bottom.appendChild(this.menu.button(t('cancel') || 'Cancel', () => this.show(callbacks)))

    this.menu.root.appendChild(bottom)
    input.focus()
  }

  showAddServer(callbacks) {
    this.showServerDialog(null, callbacks)
  }

  showEditServer(callbacks) {
    const server = this.getSelectedServer()
    if (server) {
      this.showServerDialog(server, callbacks)
    }
  }

  showServerDialog(server, callbacks) {
    const isEdit = server !== null
    const title = isEdit ? (t('editServer') || 'Edit Server') : (t('addServer') || 'Add Server')

    this.menu.clear('mc-dirt-menu')
    this.menu.root.appendChild(el('h1', 'mc-menu-title', title))

    const form = el('div', 'mc-create-form')

    // Server Name
    form.appendChild(el('label', '', t('serverName') || 'Server Name'))
    const nameInput = document.createElement('input')
    nameInput.value = server ? server.name : 'NazzaNayCraft Server'
    form.appendChild(nameInput)

    // Server Address
    form.appendChild(el('label', '', t('serverAddress') || 'Server Address'))
    const addressInput = document.createElement('input')
    addressInput.value = server ? server.address : ''
    addressInput.placeholder = 'e.g., 192.168.1.100:25565'
    form.appendChild(addressInput)

    this.menu.root.appendChild(form)

    const bottom = el('div', 'mc-menu-bottom')
    bottom.appendChild(this.menu.button(isEdit ? (t('save') || 'Save') : (t('done') || 'Done'), () => {
      const name = nameInput.value.trim() || 'NazzaNayCraft Server'
      const address = addressInput.value.trim()

      if (!address) {
        alert('Please enter a server address')
        return
      }

      if (isEdit) {
        server.name = name
        server.address = address
        server.online = false
        server.pinging = false
      } else {
        this.servers.push({
          id: 'srv_' + Date.now().toString(36),
          name: name,
          address: address,
          version: '?',
          online: false,
          pinging: false,
          players: 0,
          maxPlayers: 20,
          motd: '',
          ping: -1
        })
      }

      this.saveServers()
      this.show(callbacks)
    }))
    bottom.appendChild(this.menu.button(t('cancel') || 'Cancel', () => this.show(callbacks)))

    this.menu.root.appendChild(bottom)

    nameInput.focus()
    nameInput.select()
  }

  deleteServer(callbacks) {
    const server = this.getSelectedServer()
    if (!server) return

    if (confirm('Are you sure you want to delete "' + server.name + '"?')) {
      this.servers = this.servers.filter(s => s.id !== server.id)
      this.saveServers()
      this.selectedServerId = null
      this.show(callbacks)
    }
  }

  async refreshServers(callbacks) {
    // Reset the pinging flag so pingAllServers can run
    this._pinging = false
    await this.pingAllServers()
  }

  async pingAllServers() {
    if (this._pinging) return
    this._pinging = true

    // Mark all as pinging and reset online status
    for (const server of this.servers) {
      server.pinging = true
      server.online = false
    }
    this.renderServerList(document.getElementById('mc-server-list'))
    this.updateButtons()

    // Ping all servers in parallel
    const promises = this.servers.map(async (server) => {
      const parts = server.address.split(':')
      const address = parts[0]
      const port = parseInt(parts[1]) || 25565

      const result = await pingServer(address, port)
      server.pinging = false

      if (result) {
        server.online = true
        server.version = result.version
        server.players = result.players
        server.maxPlayers = result.maxPlayers
        server.motd = result.motd || ''
        server.ping = result.ping != null ? result.ping : -1
      } else {
        server.online = false
        server.ping = -1
      }
    })

    await Promise.all(promises)
    this._pinging = false

    // Re-render the list with updated info
    const list = document.getElementById('mc-server-list')
    if (list) {
      this.renderServerList(list)
    }
    this.updateButtons()
  }
}
