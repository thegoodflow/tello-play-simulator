# 🛸 DJI Tello 3D Drone Simulator (Three.js + Real UDP Bridge)

A browser-based 3D DJI Tello drone simulator built with Three.js that communicates **identically to a physical DJI Tello drone** over Wi-Fi via UDP.

Connect your mobile app, Python script (`djitellopy`), Scratch, or any Tello SDK client directly to your computer's IP address on UDP port `8889` to fly the virtual drone with live 3D physics and telemetry!

---

## 🌟 Features

- **Real UDP Network Control**:
  - **Port 8889 (Control)**: Listens for standard DJI Tello SDK text commands (`command`, `takeoff`, `land`, `rc a b c d`, `up 50`, `cw 90`, `flip`, read queries) and returns official responses (`ok`, battery %, speed, height, etc.).
  - **Port 8890 (State Telemetry)**: Broadcasts real-time drone telemetry packets at **10Hz** (`pitch:%d;roll:%d;yaw:%d;vgx:%d;vgy:%d;vgz:%d;h:%d;bat:%d;baro:%.2f;time:%d;\r\n`).
  - **Port 11111 (Video Stream)**: Supports H.264 video feed stream when `streamon` is received.
- **Three.js 3D Physics Simulation**:
  - Detailed 3D procedural DJI Tello quadcopter model with spinning dual-blade propellers, camera module, and multi-color status LED.
  - Realistic quadcopter flight dynamics: aerodynamic banking/tilt when translating, smooth inertia, altitude PID damping, and floor collision.
  - Interactive flight arena with helipad, coordinate grid, and aerial neon obstacle hoops at 1.0m, 1.4m, and 1.8m.
- **Cockpit & Flight HUD**:
  - **3 Camera Modes**: Third-person **Chase Cam**, First-person **FPV Nose Cam** with reticle, and Free **Orbit Cam**.
  - Real-time Artificial Horizon (attitude indicator), Compass heading tape, Altimeter, Speedometer, Battery bar, and Flight timer.
  - Live rolling terminal logging all inbound UDP commands and outbound replies.
- **On-Screen & Keyboard Manual Controls**:
  - Dual virtual joysticks (Throttle/Yaw and Pitch/Roll) for touchscreens and mouse.
  - Keyboard controls (`W/A/S/D`, `Arrows`, `Space` for Takeoff/Land, `ESC` for Emergency stop).

---

## 🚀 Quick Start

### 1. Start the Simulator with the Shell Script

Run the included executable launch script:

```bash
./start.sh
```

Or for development mode with hot-reloading (Vite + UDP):

```bash
./dev.sh
```

The script will automatically:
1. Verify dependencies and build the Three.js app.
2. Detect your local Wi-Fi IP address (e.g. `192.168.1.202`).
3. Display the **clickable links to the exposed web visualizer**:
   - Local: `http://localhost:3001`
   - Network: `http://192.168.1.202:3001`
4. Automatically attempt to open your default web browser.
5. Launch the UDP bridge on ports `8889` (control), `8890` (telemetry), and `11111` (video).

### 2. Open the Web Visualizer

Open your browser to:
```
http://localhost:3000
```
(or `http://<YOUR_COMPUTER_IP>:3000` from any device on your local network).

---

## 📱 How to Connect Your Mobile App

1. Ensure your **mobile phone** and **computer** are connected to the **same local Wi-Fi network** (or phone hotspot).
2. Look at the **DRONE IP** displayed in the top bar of the simulator (e.g. `192.168.1.202`).
3. In your mobile app (e.g., custom Tello controller, TelloFPV, or test app), set the **Drone IP** to that IP address.
4. Ensure the app sends commands to **UDP Port 8889**.
5. Once your app connects or sends commands, the simulator HUD will show `MOBILE: <YOUR_PHONE_IP>` and the drone will respond immediately!

---

## 🕹️ Keyboard Controls

| Key | Action |
|-----|--------|
| **T** or **Space** | Takeoff |
| **L** or **Space** | Land |
| **W / S** | Pitch Forward / Backward |
| **A / D** | Roll Left / Right (Strafe) |
| **Up / Down Arrow** | Throttle Up / Down (Altitude) |
| **Left / Right Arrow** | Yaw Turn CCW / CW (Rotate) |
| **Escape** | Emergency Motor Cut |

---

## 📡 Supported Tello SDK Commands

| Command | Description | Response |
|---------|-------------|----------|
| `command` | Enter SDK control mode | `ok` |
| `takeoff` | Auto takeoff to 1.0m altitude | `ok` |
| `land` | Auto land and stop motors | `ok` |
| `emergency` | Immediate motor stop | `ok` |
| `stop` | Hover in place | `ok` |
| `up x` / `down x` | Move up/down `x` cm (20–500) | `ok` |
| `left x` / `right x` | Move left/right `x` cm (20–500) | `ok` |
| `forward x` / `back x` | Move forward/back `x` cm (20–500) | `ok` |
| `cw x` / `ccw x` | Rotate clockwise/counter-clockwise `x` degrees | `ok` |
| `flip <l/r/f/b>` | Perform aerobatic flip | `ok` |
| `speed x` | Set movement speed (10–100 cm/s) | `ok` |
| `rc a b c d` | Real-time stick inputs (-100 to 100 for Roll, Pitch, Throttle, Yaw) | *(No response per spec)* |
| `streamon` / `streamoff` | Start / stop H.264 video feed on port 11111 | `ok` |
| `battery?` | Read current battery percentage | `100` |
| `speed?` | Read speed (cm/s) | `10.0` |
| `time?` | Read flight time | `15s` |
| `height?` | Read height (cm) | `100` |
| `temp?` | Read temperature range | `52~58` |
| `attitude?` | Read `pitch:%d;roll:%d;yaw:%d;` | Formatted string |
| `baro?` | Read barometer altitude (m) | `1.00` |
| `acceleration?` | Read accelerometer values | Formatted string |
| `tof?` | Read time-of-flight distance (cm) | `100` |

---

## 🧪 Automated Protocol Verification

You can test the entire UDP command and telemetry pipeline with the included test script:

```bash
npm run test:udp
```
