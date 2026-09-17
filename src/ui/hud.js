export class HUD {
  constructor() {
    this.elements = {};
    this.logEntries = [];
    this.maxLogs = 20;
    this.initElements();
  }

  initElements() {
    this.elements = {
      wsStatus: document.getElementById('ws-status'),
      clientStatus: document.getElementById('client-status'),
      droneIpDisplay: document.getElementById('drone-ip-display'),
      flightState: document.getElementById('flight-state'),
      batteryVal: document.getElementById('battery-val'),
      batteryBar: document.getElementById('battery-bar'),
      heightVal: document.getElementById('height-val'),
      speedVal: document.getElementById('speed-val'),
      flightTime: document.getElementById('flight-time'),
      pitchVal: document.getElementById('pitch-val'),
      rollVal: document.getElementById('roll-val'),
      yawVal: document.getElementById('yaw-val'),
      horizonLine: document.getElementById('horizon-line'),
      compassTape: document.getElementById('compass-tape'),
      commandLog: document.getElementById('command-log'),
      networkModal: document.getElementById('network-modal'),
      ipList: document.getElementById('ip-list')
    };
  }

  updateTelemetry(state) {
    if (!state) return;

    // Flight State
    if (this.elements.flightState) {
      this.elements.flightState.textContent = state.flightState || 'DISARMED';
      this.elements.flightState.className = `state-badge state-${(state.flightState || 'disarmed').toLowerCase()}`;
    }

    // Battery
    if (this.elements.batteryVal) {
      const bat = Math.round(state.bat || 0);
      this.elements.batteryVal.textContent = `${bat}%`;
      if (this.elements.batteryBar) {
        this.elements.batteryBar.style.width = `${bat}%`;
        if (bat > 50) this.elements.batteryBar.style.backgroundColor = '#10b981';
        else if (bat > 20) this.elements.batteryBar.style.backgroundColor = '#f59e0b';
        else this.elements.batteryBar.style.backgroundColor = '#ef4444';
      }
    }

    // Altitude / Height
    if (this.elements.heightVal) {
      this.elements.heightVal.textContent = `${Math.round(state.h || 0)} cm`;
    }

    // Speed
    if (this.elements.speedVal) {
      const speed = Math.round(Math.hypot(state.vgx || 0, state.vgy || 0, state.vgz || 0));
      this.elements.speedVal.textContent = `${speed} cm/s`;
    }

    // Flight Time
    if (this.elements.flightTime) {
      const t = Math.round(state.time || 0);
      const mins = Math.floor(t / 60).toString().padStart(2, '0');
      const secs = (t % 60).toString().padStart(2, '0');
      this.elements.flightTime.textContent = `${mins}:${secs}`;
    }

    // Attitude
    if (this.elements.pitchVal) this.elements.pitchVal.textContent = `${Math.round(state.pitch || 0)}°`;
    if (this.elements.rollVal) this.elements.rollVal.textContent = `${Math.round(state.roll || 0)}°`;
    if (this.elements.yawVal) this.elements.yawVal.textContent = `${Math.round(state.yaw || 0)}°`;

    // Artificial Horizon Display
    if (this.elements.horizonLine) {
      const rollDeg = -state.roll || 0;
      const pitchOffsetPx = Math.max(-50, Math.min(50, (state.pitch || 0) * 1.5));
      this.elements.horizonLine.style.transform = `translate(-50%, calc(-50% + ${pitchOffsetPx}px)) rotate(${rollDeg}deg)`;
    }

    // Compass Tape
    if (this.elements.compassTape) {
      const yawDeg = ((state.yaw || 0) % 360 + 360) % 360;
      this.elements.compassTape.textContent = `${Math.round(yawDeg)}° HDG`;
    }
  }

  setWsStatus(connected) {
    if (this.elements.wsStatus) {
      this.elements.wsStatus.textContent = connected ? 'ONLINE' : 'CONNECTING...';
      this.elements.wsStatus.className = connected ? 'status-pill online' : 'status-pill offline';
    }
  }

  setClientStatus(client) {
    if (this.elements.clientStatus) {
      if (client) {
        this.elements.clientStatus.textContent = `MOBILE: ${client.address}`;
        this.elements.clientStatus.className = 'status-pill client-active';
      } else {
        this.elements.clientStatus.textContent = 'NO APP CONNECTED';
        this.elements.clientStatus.className = 'status-pill client-idle';
      }
    }
  }

  setNetworkInfo(localIps, cmdPort) {
    if (this.elements.droneIpDisplay) {
      const ip = localIps && localIps.length > 0 ? localIps[0].address : '127.0.0.1';
      this.elements.droneIpDisplay.textContent = `${ip}:${cmdPort}`;
    }

    if (this.elements.ipList && localIps) {
      this.elements.ipList.innerHTML = localIps.map(item => `
        <div class="ip-row">
          <span class="ip-addr">${item.address}</span>
          <span class="ip-iface">(${item.interface})</span>
          <button class="copy-ip-btn" onclick="navigator.clipboard.writeText('${item.address}')">Copy</button>
        </div>
      `).join('');
    }
  }

  addLog(direction, text, client = '') {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    this.logEntries.push({ timestamp, direction, text, client });
    if (this.logEntries.length > this.maxLogs) {
      this.logEntries.shift();
    }

    if (this.elements.commandLog) {
      this.elements.commandLog.innerHTML = this.logEntries.map(entry => `
        <div class="log-line log-${entry.direction}">
          <span class="log-time">${entry.timestamp}</span>
          <span class="log-dir">[${entry.direction.toUpperCase()}]</span>
          <span class="log-msg">${entry.text}</span>
          ${entry.client ? `<span class="log-client">${entry.client}</span>` : ''}
        </div>
      `).join('');
      this.elements.commandLog.scrollTop = this.elements.commandLog.scrollHeight;
    }
  }
}
