import dgram from 'dgram';

export class UdpBridge {
  constructor(options = {}) {
    this.cmdPort = options.cmdPort || 8889;
    this.statePort = options.statePort || 8890;
    this.videoPort = options.videoPort || 11111;
    this.onCommand = options.onCommand || (() => {});
    this.onClientConnect = options.onClientConnect || (() => {});
    
    this.cmdSocket = null;
    this.stateSocket = null;
    this.lastClient = null;
    this.clients = new Map(); // key: ip, value: { address, port, lastSeen }
    
    // Default simulated state
    this.droneState = {
      pitch: 0,
      roll: 0,
      yaw: 0,
      vgx: 0,
      vgy: 0,
      vgz: 0,
      templ: 55,
      temph: 60,
      tof: 10,
      h: 0,
      bat: 100,
      baro: 10.50,
      time: 0,
      agx: 0.0,
      agy: 0.0,
      agz: -980.0,
      speed: 10,
      isFlying: false,
      sdkMode: false,
      streamOn: false
    };

    this.stateInterval = null;
  }

  start() {
    this.initCmdSocket();
    this.initStateSocket();
  }

  initCmdSocket() {
    this.cmdSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    this.cmdSocket.on('listening', () => {
      const address = this.cmdSocket.address();
      console.log(`[UDP] Command server listening on ${address.address}:${address.port}`);
    });

    this.cmdSocket.on('message', (msg, rinfo) => {
      const rawText = msg.toString('utf-8').trim();
      const clientKey = `${rinfo.address}:${rinfo.port}`;
      const isNewClient = !this.clients.has(rinfo.address);

      this.clients.set(rinfo.address, {
        address: rinfo.address,
        port: rinfo.port,
        lastSeen: Date.now()
      });
      this.lastClient = { address: rinfo.address, port: rinfo.port };

      if (isNewClient) {
        console.log(`[UDP] New client connected from ${rinfo.address}:${rinfo.port}`);
        this.onClientConnect({ address: rinfo.address, port: rinfo.port });
      }

      console.log(`[UDP IN] From ${rinfo.address}:${rinfo.port} -> "${rawText}"`);

      this.handleIncomingCommand(rawText, rinfo);
    });

    this.cmdSocket.on('error', (err) => {
      console.error(`[UDP Cmd Error]:`, err);
    });

    try {
      this.cmdSocket.bind(this.cmdPort, '0.0.0.0');
    } catch (err) {
      console.error(`[UDP] Failed to bind command socket to ${this.cmdPort}:`, err);
    }
  }

  initStateSocket() {
    this.stateSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    this.stateSocket.on('listening', () => {
      console.log(`[UDP] State broadcaster ready on port ${this.statePort}`);
    });

    this.stateSocket.on('error', (err) => {
      console.error(`[UDP State Error]:`, err);
    });

    try {
      // Bind to 0 (ephemeral) so we can send to 8890
      this.stateSocket.bind(0, '0.0.0.0');
    } catch (err) {
      console.error(`[UDP] Failed to bind state socket:`, err);
    }

    // Start 10Hz state broadcast loop (DJI Tello sends state every 100ms)
    this.stateInterval = setInterval(() => {
      this.broadcastState();
    }, 100);
  }

  handleIncomingCommand(cmdText, rinfo) {
    const parts = cmdText.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Forward command to physics simulator via callback
    const result = this.onCommand({
      raw: cmdText,
      cmd,
      args,
      client: { address: rinfo.address, port: rinfo.port }
    });

    // Handle responses according to Tello SDK spec
    if (cmd === 'command') {
      this.droneState.sdkMode = true;
      this.sendReply('ok', rinfo);
    } else if (cmd === 'rc') {
      // Real Tello does NOT send a reply for 'rc' commands to prevent UDP saturation
      // rc a b c d (roll, pitch, throttle, yaw)
    } else if (cmd === 'streamon') {
      this.droneState.streamOn = true;
      this.sendReply('ok', rinfo);
    } else if (cmd === 'streamoff') {
      this.droneState.streamOn = false;
      this.sendReply('ok', rinfo);
    } else if (cmd === 'emergency') {
      this.droneState.isFlying = false;
      this.sendReply('ok', rinfo);
    } else if (cmd === 'battery?') {
      this.sendReply(`${Math.round(this.droneState.bat)}`, rinfo);
    } else if (cmd === 'speed?') {
      this.sendReply(`${this.droneState.speed.toFixed(1)}`, rinfo);
    } else if (cmd === 'time?') {
      this.sendReply(`${Math.round(this.droneState.time)}s`, rinfo);
    } else if (cmd === 'height?') {
      this.sendReply(`${Math.round(this.droneState.h)}`, rinfo);
    } else if (cmd === 'temp?') {
      this.sendReply(`${this.droneState.templ}~${this.droneState.temph}`, rinfo);
    } else if (cmd === 'attitude?') {
      const att = `pitch:${Math.round(this.droneState.pitch)};roll:${Math.round(this.droneState.roll)};yaw:${Math.round(this.droneState.yaw)};`;
      this.sendReply(att, rinfo);
    } else if (cmd === 'baro?') {
      this.sendReply(`${this.droneState.baro.toFixed(2)}`, rinfo);
    } else if (cmd === 'acceleration?' || cmd === 'agx?') {
      const acc = `agx:${this.droneState.agx.toFixed(2)};agy:${this.droneState.agy.toFixed(2)};agz:${this.droneState.agz.toFixed(2)};`;
      this.sendReply(acc, rinfo);
    } else if (cmd === 'tof?') {
      this.sendReply(`${Math.round(this.droneState.tof)}`, rinfo);
    } else if (cmd === 'wifi?') {
      this.sendReply('90', rinfo);
    } else if (cmd === 'sdk?') {
      this.sendReply('20', rinfo);
    } else if (cmd === 'sn?') {
      this.sendReply('0TQDF640010101', rinfo);
    } else {
      // Movement commands: takeoff, land, up, down, left, right, forward, back, cw, ccw, flip, go, stop
      // If result from simulator is a Promise or value, handle it
      if (result && typeof result.then === 'function') {
        result
          .then((res) => this.sendReply(res || 'ok', rinfo))
          .catch((err) => this.sendReply('error', rinfo));
      } else {
        this.sendReply('ok', rinfo);
      }
    }
  }

  sendReply(replyText, rinfo) {
    if (!this.cmdSocket) return;
    const msg = Buffer.from(replyText);
    this.cmdSocket.send(msg, 0, msg.length, rinfo.port, rinfo.address, (err) => {
      if (err) {
        console.error(`[UDP Reply Error] to ${rinfo.address}:${rinfo.port}:`, err);
      } else {
        console.log(`[UDP OUT] To ${rinfo.address}:${rinfo.port} -> "${replyText}"`);
      }
    });
  }

  updateDroneState(newState) {
    Object.assign(this.droneState, newState);
  }

  broadcastState() {
    if (!this.stateSocket) return;

    // DJI Tello 8890 state string format:
    // pitch:%d;roll:%d;yaw:%d;vgx:%d;vgy:%d;vgz:%d;templ:%d;temph:%d;tof:%d;h:%d;bat:%d;baro:%.2f;time:%d;agx:%.2f;agy:%.2f;agz:%.2f;\r\n
    const s = this.droneState;
    const stateStr = `pitch:${Math.round(s.pitch)};roll:${Math.round(s.roll)};yaw:${Math.round(s.yaw)};vgx:${Math.round(s.vgx)};vgy:${Math.round(s.vgy)};vgz:${Math.round(s.vgz)};templ:${Math.round(s.templ)};temph:${Math.round(s.temph)};tof:${Math.round(s.tof)};h:${Math.round(s.h)};bat:${Math.round(s.bat)};baro:${s.baro.toFixed(2)};time:${Math.round(s.time)};agx:${s.agx.toFixed(2)};agy:${s.agy.toFixed(2)};agz:${s.agz.toFixed(2)};\r\n`;

    const stateBuf = Buffer.from(stateStr);

    // Send to all known clients on port 8890
    const now = Date.now();
    for (const [ip, client] of this.clients.entries()) {
      // Expire clients inactive for more than 30s
      if (now - client.lastSeen > 30000) {
        this.clients.delete(ip);
        continue;
      }
      this.stateSocket.send(stateBuf, 0, stateBuf.length, this.statePort, client.address, (err) => {
        if (err && err.code !== 'EHOSTUNREACH') {
          // suppress common unreachable errors
        }
      });
    }

    // Also broadcast to localhost:8890 for local testing
    if (this.clients.size === 0) {
      this.stateSocket.send(stateBuf, 0, stateBuf.length, this.statePort, '127.0.0.1', () => {});
    }
  }

  stop() {
    if (this.stateInterval) clearInterval(this.stateInterval);
    if (this.cmdSocket) try { this.cmdSocket.close(); } catch(e) {}
    if (this.stateSocket) try { this.stateSocket.close(); } catch(e) {}
  }
}
