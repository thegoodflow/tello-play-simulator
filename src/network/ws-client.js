export class WebSocketClient {
  constructor(options = {}) {
    this.onCommand = options.onCommand || (() => {});
    this.onInit = options.onInit || (() => {});
    this.onClientConnected = options.onClientConnected || (() => {});
    this.onConnectionStatus = options.onConnectionStatus || (() => {});

    this.ws = null;
    this.isConnected = false;
    this.reconnectTimer = null;
    this.telemetryInterval = null;
    this.getTelemetry = options.getTelemetry || (() => ({}));

    this.connect();
  }

  connect() {
    // Determine WS URL based on current host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    // If running on Vite dev server (port 3000), backend is proxy or direct port 3001
    const wsUrl = `${protocol}//${host}:${window.location.port === '3000' ? '3001' : window.location.port}/ws`;

    console.log(`[WS Client] Connecting to ${wsUrl}...`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[WS Client] Connected to simulator backend bridge.');
        this.isConnected = true;
        this.onConnectionStatus(true);
        this.startTelemetryLoop();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (e) {
          console.error('[WS Client] Failed to parse message:', e);
        }
      };

      this.ws.onclose = () => {
        console.log('[WS Client] Disconnected. Retrying in 2s...');
        this.isConnected = false;
        this.onConnectionStatus(false);
        this.stopTelemetryLoop();
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.warn('[WS Client Error]:', err);
      };
    } catch (e) {
      console.error('[WS Client Connect Exception]:', e);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2000);
  }

  handleMessage(data) {
    switch (data.type) {
      case 'INIT':
        this.onInit(data);
        break;

      case 'UDP_COMMAND':
        this.onCommand(data);
        break;

      case 'CLIENT_CONNECTED':
        this.onClientConnected(data.client);
        break;

      default:
        break;
    }
  }

  startTelemetryLoop() {
    this.stopTelemetryLoop();
    // Send state every 100ms (10Hz) to match DJI Tello 8890 rate
    this.telemetryInterval = setInterval(() => {
      if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        const state = this.getTelemetry();
        this.ws.send(JSON.stringify({
          type: 'TELEMETRY_UPDATE',
          state
        }));
      }
    }, 100);
  }

  stopTelemetryLoop() {
    if (this.telemetryInterval) {
      clearInterval(this.telemetryInterval);
      this.telemetryInterval = null;
    }
  }

  sendSimulatorCommand(cmd, args = []) {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'SIMULATOR_COMMAND',
        command: cmd,
        args
      }));
    }
  }

  sendCommandResult(id, result = 'ok') {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'COMMAND_RESULT',
        id,
        result
      }));
    }
  }
}
