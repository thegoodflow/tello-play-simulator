export class ManualControls {
  constructor(dronePhysics, wsClient, hud) {
    this.dronePhysics = dronePhysics;
    this.wsClient = wsClient;
    this.hud = hud;

    // Keyboard state
    this.keys = {};

    this.initButtons();
    this.initKeyboard();
    this.initVirtualJoysticks();
  }

  initButtons() {
    const btnTakeoff = document.getElementById('btn-takeoff');
    const btnLand = document.getElementById('btn-land');
    const btnEmergency = document.getElementById('btn-emergency');
    const btnReset = document.getElementById('btn-reset');
    const btnFlipF = document.getElementById('btn-flip-f');

    if (btnTakeoff) {
      btnTakeoff.addEventListener('click', () => {
        this.hud.addLog('ui', 'TAKEOFF requested');
        this.dronePhysics.executeCommand('takeoff');
        this.wsClient.sendSimulatorCommand('takeoff');
      });
    }

    if (btnLand) {
      btnLand.addEventListener('click', () => {
        this.hud.addLog('ui', 'LAND requested');
        this.dronePhysics.executeCommand('land');
        this.wsClient.sendSimulatorCommand('land');
      });
    }

    if (btnEmergency) {
      btnEmergency.addEventListener('click', () => {
        this.hud.addLog('ui', 'EMERGENCY stop triggered');
        this.dronePhysics.executeCommand('emergency');
        this.wsClient.sendSimulatorCommand('emergency');
      });
    }

    if (btnReset) {
      btnReset.addEventListener('click', () => {
        this.hud.addLog('ui', 'RESET drone to helipad');
        this.dronePhysics.position.set(0, 0.02, 0);
        this.dronePhysics.velocity.set(0, 0, 0);
        this.dronePhysics.yaw = 0;
        this.dronePhysics.pitch = 0;
        this.dronePhysics.roll = 0;
        this.dronePhysics.state = 'DISARMED';
        this.dronePhysics.battery = 100;
        this.dronePhysics.flightTime = 0;
        this.dronePhysics.droneModel.setPropellerSpeed(0);
        this.dronePhysics.droneModel.setLedColor(0x3b82f6);
      });
    }

    if (btnFlipF) {
      btnFlipF.addEventListener('click', () => {
        this.hud.addLog('ui', 'FLIP forward');
        this.dronePhysics.executeCommand('flip', ['f']);
      });
    }
  }

  initKeyboard() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;

      // Quick action triggers
      if (e.code === 'KeyT') {
        this.dronePhysics.executeCommand('takeoff');
      } else if (e.code === 'KeyL') {
        this.dronePhysics.executeCommand('land');
      } else if (e.code === 'Space') {
        if (this.dronePhysics.state === 'DISARMED') {
          this.dronePhysics.executeCommand('takeoff');
        } else {
          this.dronePhysics.executeCommand('land');
        }
      } else if (e.code === 'KeyF') {
        this.hud.addLog('ui', 'FLIP [F]');
        this.dronePhysics.executeCommand('flip', ['f']);
      } else if (e.code === 'Escape') {
        this.dronePhysics.executeCommand('emergency');
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
  }

  initVirtualJoysticks() {
    // Setup touch/mouse drag handlers on left & right joystick containers
    this.setupJoystick('stick-left', (x, y) => {
      // Left stick: X = Yaw (d), Y = Throttle (c)
      this.stickYaw = Math.round(x * 100);
      this.stickThrottle = Math.round(-y * 100); // Up is positive throttle
    });

    this.setupJoystick('stick-right', (x, y) => {
      // Right stick: X = Roll (a), Y = Pitch (b)
      this.stickRoll = Math.round(x * 100);
      this.stickPitch = Math.round(-y * 100); // Up is forward pitch
    });

    this.stickRoll = 0;
    this.stickPitch = 0;
    this.stickThrottle = 0;
    this.stickYaw = 0;
  }

  setupJoystick(elementId, onMove) {
    const container = document.getElementById(elementId);
    if (!container) return;
    const knob = container.querySelector('.joystick-knob');
    if (!knob) return;

    let isDragging = false;
    const radius = 45; // Max drag radius in px

    const handlePointerStart = (e) => {
      isDragging = true;
      updateKnob(e);
    };

    const handlePointerMove = (e) => {
      if (!isDragging) return;
      updateKnob(e);
    };

    const handlePointerEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      knob.style.transform = `translate(0px, 0px)`;
      onMove(0, 0);
    };

    const updateKnob = (e) => {
      const rect = container.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      let dx = clientX - centerX;
      let dy = clientY - centerY;
      const dist = Math.hypot(dx, dy);

      if (dist > radius) {
        dx = (dx / dist) * radius;
        dy = (dy / dist) * radius;
      }

      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      onMove(dx / radius, dy / radius);
    };

    container.addEventListener('mousedown', handlePointerStart);
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerEnd);

    container.addEventListener('touchstart', handlePointerStart, { passive: false });
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerEnd);
  }

  update() {
    // Combine keyboard and virtual joystick inputs
    let roll = this.stickRoll || 0;
    let pitch = this.stickPitch || 0;
    let throttle = this.stickThrottle || 0;
    let yaw = this.stickYaw || 0;

    // Keyboard mappings
    if (this.keys['KeyW']) pitch = 80;
    if (this.keys['KeyS']) pitch = -80;
    if (this.keys['KeyA']) roll = -80;
    if (this.keys['KeyD']) roll = 80;

    if (this.keys['ArrowUp']) throttle = 80;
    if (this.keys['ArrowDown']) throttle = -80;
    if (this.keys['ArrowLeft']) yaw = -80;
    if (this.keys['ArrowRight']) yaw = 80;

    // If any manual input is active, update drone RC
    if (roll !== 0 || pitch !== 0 || throttle !== 0 || yaw !== 0) {
      this.dronePhysics.setRc(roll, pitch, throttle, yaw);
    } else if (this.dronePhysics.rc.roll !== 0 || this.dronePhysics.rc.pitch !== 0 ||
               this.dronePhysics.rc.throttle !== 0 || this.dronePhysics.rc.yaw !== 0) {
      // Check if this was a keyboard release
      if (!this.stickRoll && !this.stickPitch && !this.stickThrottle && !this.stickYaw &&
          Date.now() - this.dronePhysics.lastRcTime > 200) {
        this.dronePhysics.setRc(0, 0, 0, 0);
      }
    }
  }
}
