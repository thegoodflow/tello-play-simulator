import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { UdpBridge } from './udp-bridge.js';
import { VideoStreamer } from './video-streamer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to get local network IP addresses (prioritizes real LAN/Wi-Fi and filters out virtual bridges)
function getLocalIps() {
  const interfaces = os.networkInterfaces();
  const physicalIps = [];
  const otherIps = [];

  for (const name of Object.keys(interfaces)) {
    const isVirtual = /^(docker|br-|veth|virbr|tun|tap|lo)/i.test(name);
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        if (!isVirtual) {
          physicalIps.push({ interface: name, address: net.address });
        } else {
          otherIps.push({ interface: name, address: net.address });
        }
      }
    }
  }

  return physicalIps.length > 0 ? physicalIps : otherIps;
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const HTTP_PORT = process.env.PORT || 3001;
const CMD_PORT = 8889;
const STATE_PORT = 8890;
const VIDEO_PORT = 11111;

// Video Streamer
const videoStreamer = new VideoStreamer({ videoPort: VIDEO_PORT });

// Connected WebSocket clients (browsers running Three.js simulator)
const wsClients = new Set();

// Broadcast a message to all connected Three.js browser clients
function broadcastToFrontend(data) {
  const json = JSON.stringify(data);
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}

// Track pending commands awaiting physics/maneuver completion
let commandIdCounter = 0;
const pendingCommands = new Map();

const MOVEMENT_COMMANDS = new Set([
  'takeoff', 'land', 'up', 'down', 'left', 'right',
  'forward', 'back', 'cw', 'ccw', 'flip', 'stop'
]);

function getEstimatedDurationMs(cmd, args) {
  switch (cmd) {
    case 'takeoff': return 2500;
    case 'land': return 2000;
    case 'up':
    case 'down':
    case 'left':
    case 'right':
    case 'forward':
    case 'back': {
      const dist = parseFloat(args[0]) || 50;
      return Math.max(600, Math.round((dist / 40) * 1000));
    }
    case 'cw':
    case 'ccw': {
      const angle = parseFloat(args[0]) || 90;
      return Math.max(500, Math.round((angle / 60) * 1000));
    }
    case 'flip': return 1500;
    case 'stop': return 100;
    default: return 0;
  }
}

// UDP Bridge handling Tello ports
const udpBridge = new UdpBridge({
  cmdPort: CMD_PORT,
  statePort: STATE_PORT,
  videoPort: VIDEO_PORT,
  onCommand: ({ raw, cmd, args, client }) => {
    if (cmd === 'streamon') {
      videoStreamer.start(client.address);
      return 'ok';
    } else if (cmd === 'streamoff') {
      videoStreamer.stop();
      return 'ok';
    }

    if (!MOVEMENT_COMMANDS.has(cmd)) {
      // Non-movement commands (read queries, command, speed, rc): forward to UI and reply immediately
      broadcastToFrontend({
        type: 'UDP_COMMAND',
        command: raw,
        cmd,
        args,
        client
      });
      return;
    }

    // Movement command: assign unique ID and wait for physics completion
    const id = ++commandIdCounter;
    broadcastToFrontend({
      type: 'UDP_COMMAND',
      id,
      command: raw,
      cmd,
      args,
      client
    });

    if (wsClients.size > 0) {
      // A browser 3D simulator is connected: wait for physics completion via WebSocket
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pendingCommands.delete(id);
          resolve('ok'); // Fallback after safety timeout
        }, 12000);
        pendingCommands.set(id, { resolve, timer });
      });
    } else {
      // Headless mode: simulate realistic physical execution time
      const durationMs = getEstimatedDurationMs(cmd, args);
      return new Promise((resolve) => {
        setTimeout(() => resolve('ok'), durationMs);
      });
    }
  },
  onClientConnect: (client) => {
    broadcastToFrontend({
      type: 'CLIENT_CONNECTED',
      client
    });
  }
});

udpBridge.start();

// Serve static frontend if built
app.use(express.static(path.join(__dirname, '../dist')));
app.use(express.json());

// API Info endpoint
app.get('/api/info', (req, res) => {
  res.json({
    localIps: getLocalIps(),
    cmdPort: CMD_PORT,
    statePort: STATE_PORT,
    videoPort: VIDEO_PORT,
    droneState: udpBridge.droneState,
    activeClients: Array.from(udpBridge.clients.values())
  });
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  wsClients.add(ws);
  console.log(`[WebSocket] Three.js simulator client connected. Active: ${wsClients.size}`);

  // Send initial configuration and state to new browser client
  ws.send(JSON.stringify({
    type: 'INIT',
    localIps: getLocalIps(),
    cmdPort: CMD_PORT,
    statePort: STATE_PORT,
    videoPort: VIDEO_PORT,
    droneState: udpBridge.droneState,
    clients: Array.from(udpBridge.clients.values())
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === 'TELEMETRY_UPDATE') {
        // Update UDP state broadcaster with simulated drone physics from Three.js
        udpBridge.updateDroneState(data.state);
      } else if (data.type === 'COMMAND_RESULT') {
        // Browser completed physical maneuver
        const pending = pendingCommands.get(data.id);
        if (pending) {
          clearTimeout(pending.timer);
          pendingCommands.delete(data.id);
          pending.resolve(data.result || 'ok');
        }
      } else if (data.type === 'SIMULATOR_COMMAND') {
        // User clicked on-screen button in browser (e.g. Takeoff, Land)
        // Simulate as if it was received via UDP or manual override
        console.log(`[Manual Control] Command: "${data.command}"`);
        if (data.command === 'streamon' && udpBridge.lastClient) {
          videoStreamer.start(udpBridge.lastClient.address);
        } else if (data.command === 'streamoff') {
          videoStreamer.stop();
        }
      }
    } catch (e) {
      console.error('[WebSocket Error] Message parse failure:', e);
    }
  });

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log(`[WebSocket] Three.js simulator client disconnected. Active: ${wsClients.size}`);
    // If no browser clients remain, resolve all pending commands so UDP does not hang
    if (wsClients.size === 0) {
      for (const [id, pending] of pendingCommands.entries()) {
        clearTimeout(pending.timer);
        pending.resolve('ok');
      }
      pendingCommands.clear();
    }
  });
});

server.listen(HTTP_PORT, '0.0.0.0', () => {
  const ips = getLocalIps();
  const primaryIp = ips.length > 0 ? ips[0].address : '127.0.0.1';

  console.log('\n============================================================');
  console.log('   DJI TELLO THREE.JS 3D DRONE SIMULATOR & UDP BRIDGE      ');
  console.log('============================================================');
  console.log(`  🌐 Web 3D Visualizer:    http://localhost:${HTTP_PORT} (or http://${primaryIp}:${HTTP_PORT})`);
  console.log(`  📡 WebSocket API Server: http://0.0.0.0:${HTTP_PORT}`);
  console.log(`  🛸 Drone Control Port:   UDP ${CMD_PORT} (0.0.0.0:${CMD_PORT})`);
  console.log(`  📊 Drone Telemetry Port: UDP ${STATE_PORT}`);
  console.log(`  📹 H.264 Video Stream:   UDP ${VIDEO_PORT}`);
  console.log('------------------------------------------------------------');
  console.log('  📱 HOW TO CONNECT YOUR MOBILE APP:');
  if (ips.length > 0) {
    console.log(`  1. Connect your phone to the same Wi-Fi as this computer.`);
    console.log(`  2. In your mobile app, set the Drone IP to:`);
    ips.forEach(ip => console.log(`     -> ${ip.address}  (Interface: ${ip.interface})`));
  } else {
    console.log(`  Set Drone IP to: 127.0.0.1 (or check your Wi-Fi IP)`);
  }
  console.log(`  3. Ensure app uses UDP Command Port: ${CMD_PORT}`);
  console.log('============================================================\n');
});

// Handle clean shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down Tello Simulator & UDP Bridge...');
  udpBridge.stop();
  videoStreamer.stop();
  process.exit(0);
});
