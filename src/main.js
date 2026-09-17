import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DroneModel } from './scene/drone-model.js';
import { Environment } from './scene/environment.js';
import { DronePhysics } from './physics/drone-physics.js';
import { WebSocketClient } from './network/ws-client.js';
import { HUD } from './ui/hud.js';
import { ManualControls } from './ui/manual-controls.js';

class SimulatorApp {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.clock = new THREE.Clock();

    // Camera Modes: 'chase', 'fpv', 'orbit'
    this.cameraMode = 'chase';

    this.initScene();
    this.initComponents();
    this.initCameraControls();
    this.initNetwork();
    this.setupEventListeners();

    this.animate();
  }

  initScene() {
    // 1. Three.js Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0f1d);
    this.scene.fog = new THREE.FogExp2(0x0a0f1d, 0.035);

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.05,
      100
    );
    this.camera.position.set(0, 1.5, -2.5);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // 4. Orbit Controls (Used in 'orbit' mode)
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;
    this.orbitControls.maxPolarAngle = Math.PI / 2 + 0.02; // Don't clip under floor
    this.orbitControls.minDistance = 0.3;
    this.orbitControls.maxDistance = 25;
    this.orbitControls.enabled = false; // Initially disabled for chase cam
  }

  initComponents() {
    // 3D Environment (Arena, Grid, Helipad, Obstacles, Lights)
    this.environment = new Environment(this.scene);

    // 3D Drone Model
    this.droneModel = new DroneModel();
    this.scene.add(this.droneModel.group);

    // Drone Physics
    this.dronePhysics = new DronePhysics(this.droneModel);

    // HUD Display
    this.hud = new HUD();
  }

  initNetwork() {
    this.wsClient = new WebSocketClient({
      getTelemetry: () => this.dronePhysics.getTelemetryState(),
      onInit: (data) => {
        this.hud.setNetworkInfo(data.localIps, data.cmdPort);
        this.hud.addLog('sys', `Server online. Listening on UDP ${data.cmdPort}`);
        if (data.clients && data.clients.length > 0) {
          this.hud.setClientStatus(data.clients[0]);
        }
      },
      onConnectionStatus: (connected) => {
        this.hud.setWsStatus(connected);
      },
      onClientConnected: (client) => {
        this.hud.setClientStatus(client);
        this.hud.addLog('udp', `Mobile App connected from ${client.address}:${client.port}`);
      },
      onCommand: (msg) => {
        this.hud.addLog('udp', `Cmd: "${msg.command}"`, msg.client ? `${msg.client.address}` : '');
        const p = this.dronePhysics.executeCommand(msg.cmd, msg.args);
        if (msg.id) {
          Promise.resolve(p)
            .then((res) => {
              this.wsClient.sendCommandResult(msg.id, res || 'ok');
            })
            .catch(() => {
              this.wsClient.sendCommandResult(msg.id, 'error');
            });
        }
      }
    });

    // Manual controls (Virtual joysticks & keyboard)
    this.manualControls = new ManualControls(this.dronePhysics, this.wsClient, this.hud);
  }

  initCameraControls() {
    const camButtons = {
      chase: document.getElementById('cam-chase'),
      fpv: document.getElementById('cam-fpv'),
      orbit: document.getElementById('cam-orbit')
    };

    const setCamMode = (mode) => {
      this.cameraMode = mode;
      Object.keys(camButtons).forEach(m => {
        if (camButtons[m]) {
          camButtons[m].classList.toggle('active', m === mode);
        }
      });

      const fpvCrosshair = document.getElementById('fpv-crosshair');
      if (fpvCrosshair) {
        fpvCrosshair.style.display = mode === 'fpv' ? 'block' : 'none';
      }

      if (mode === 'orbit') {
        this.orbitControls.enabled = true;
        this.orbitControls.target.copy(this.dronePhysics.position);
      } else {
        this.orbitControls.enabled = false;
      }
    };

    if (camButtons.chase) camButtons.chase.addEventListener('click', () => setCamMode('chase'));
    if (camButtons.fpv) camButtons.fpv.addEventListener('click', () => setCamMode('fpv'));
    if (camButtons.orbit) camButtons.orbit.addEventListener('click', () => setCamMode('orbit'));
  }

  setupEventListeners() {
    // Window Resize
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Info Modal Toggle
    const btnInfo = document.getElementById('btn-info');
    const modal = document.getElementById('network-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');

    if (btnInfo && modal) {
      btnInfo.addEventListener('click', () => modal.classList.toggle('hidden'));
    }
    if (btnCloseModal && modal) {
      btnCloseModal.addEventListener('click', () => modal.classList.add('hidden'));
    }
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
        }
      });
    }
  }

  updateCamera() {
    const dronePos = this.dronePhysics.position;
    const yaw = this.dronePhysics.yaw;

    if (this.cameraMode === 'chase') {
      // Third-person chase camera positioned behind and slightly above the drone
      const chaseDist = 1.6;
      const chaseHeight = 0.55;

      // Position vector relative to drone heading (+Z is forward)
      const offset = new THREE.Vector3(0, chaseHeight, -chaseDist);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

      const targetCamPos = dronePos.clone().add(offset);
      this.camera.position.lerp(targetCamPos, 0.12);

      // Look slightly ahead of drone
      const lookTarget = dronePos.clone().add(new THREE.Vector3(0, 0.1, 0.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
      this.camera.lookAt(lookTarget);

    } else if (this.cameraMode === 'fpv') {
      // First-person view directly from Tello front camera module
      // Camera is located at local (0, 0.006, 0.057)
      const eyeOffset = new THREE.Vector3(0, 0.012, 0.06);
      eyeOffset.applyEuler(this.droneModel.group.rotation);
      const camPos = dronePos.clone().add(eyeOffset);
      this.camera.position.copy(camPos);

      // Look forward along drone local heading and pitch
      const lookDir = new THREE.Vector3(0, 0, 1.0);
      lookDir.applyEuler(this.droneModel.group.rotation);
      this.camera.lookAt(camPos.clone().add(lookDir));

    } else if (this.cameraMode === 'orbit') {
      // OrbitControls tracks drone position
      this.orbitControls.target.lerp(dronePos, 0.1);
      this.orbitControls.update();
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = Math.min(this.clock.getDelta(), 0.1);

    // 1. Update Physics
    this.dronePhysics.update(delta);

    // 2. Update 3D Model Props & Visuals
    this.droneModel.update(delta);

    // 3. Update Manual Controls
    this.manualControls.update();

    // 4. Update Camera View
    this.updateCamera();

    // 5. Update HUD Telemetry
    this.hud.updateTelemetry(this.dronePhysics.getTelemetryState());

    // 6. Render Frame
    this.renderer.render(this.scene, this.camera);
  }
}

// Start simulator once DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  new SimulatorApp();
});
