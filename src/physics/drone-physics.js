import * as THREE from 'three';

export const DroneState = {
  DISARMED: 'DISARMED',
  TAKING_OFF: 'TAKING_OFF',
  HOVER: 'HOVER',
  FLYING: 'FLYING',
  LANDING: 'LANDING',
  EMERGENCY: 'EMERGENCY'
};

export class DronePhysics {
  constructor(droneModel) {
    this.droneModel = droneModel;
    this.group = droneModel.group;

    // Kinematics (World coordinates: X: right, Y: up, Z: forward/backward)
    this.position = new THREE.Vector3(0, 0.02, 0); // Ground position
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.acceleration = new THREE.Vector3(0, 0, 0);

    // Orientation: Yaw (Y), Pitch (X tilt), Roll (Z tilt)
    this.yaw = 0; // Radians (0 = pointing +Z)
    this.pitch = 0; // Radians
    this.roll = 0; // Radians

    // Dynamic bank angles
    this.targetPitch = 0;
    this.targetRoll = 0;

    // Flight State
    this.state = DroneState.DISARMED;
    this.battery = 100;
    this.flightTime = 0;
    this.speed = 40; // Default speed in cm/s

    // RC Inputs (-100 to 100)
    this.rc = { roll: 0, pitch: 0, throttle: 0, yaw: 0 };
    this.lastRcTime = 0;

    // Discrete command execution state
    this.activeTask = null; // e.g. { type: 'MOVE', startPos, targetPos, ... }

    // Flip animation state
    this.isFlipping = false;
    this.flipProgress = 0;
    this.flipDir = 'f';

    // Synchronize initial model position
    this.group.position.copy(this.position);
    this.updateModelRotation();
  }

  // Handle incoming commands from UDP or Manual UI
  executeCommand(cmd, args = []) {
    console.log(`[Physics] Executing: "${cmd}" [${args.join(', ')}]`);

    switch (cmd) {
      case 'takeoff':
        return this.startTakeoff();

      case 'land':
        return this.startLanding();

      case 'emergency':
        return this.emergencyStop();

      case 'stop':
        this.activeTask = null;
        this.rc = { roll: 0, pitch: 0, throttle: 0, yaw: 0 };
        this.velocity.set(0, 0, 0);
        if (this.state === DroneState.FLYING) this.state = DroneState.HOVER;
        return 'ok';

      case 'speed': {
        const val = parseFloat(args[0]);
        if (!isNaN(val) && val >= 10 && val <= 100) {
          this.speed = val;
          return 'ok';
        }
        return 'error';
      }

      case 'up':
      case 'down':
      case 'left':
      case 'right':
      case 'forward':
      case 'back': {
        const distCm = parseFloat(args[0]);
        if (isNaN(distCm) || distCm < 20 || distCm > 500) return 'error';
        return this.startDiscreteMove(cmd, distCm);
      }

      case 'cw':
      case 'ccw': {
        const angleDeg = parseFloat(args[0]);
        if (isNaN(angleDeg) || angleDeg < 1 || angleDeg > 3600) return 'error';
        return this.startRotation(cmd, angleDeg);
      }

      case 'flip': {
        const dir = (args[0] || 'f').toLowerCase();
        if (['l', 'r', 'f', 'b'].includes(dir)) {
          return this.startFlip(dir);
        }
        return 'error';
      }

      case 'rc': {
        // args: a b c d (roll, pitch, throttle, yaw)
        const a = Math.max(-100, Math.min(100, parseInt(args[0]) || 0));
        const b = Math.max(-100, Math.min(100, parseInt(args[1]) || 0));
        const c = Math.max(-100, Math.min(100, parseInt(args[2]) || 0));
        const d = Math.max(-100, Math.min(100, parseInt(args[3]) || 0));

        this.setRc(a, b, c, d);
        return 'ok';
      }

      default:
        return 'ok';
    }
  }

  setRc(roll, pitch, throttle, yaw) {
    if (this.state === DroneState.DISARMED || this.state === DroneState.LANDING) return;

    this.rc.roll = roll;
    this.rc.pitch = pitch;
    this.rc.throttle = throttle;
    this.rc.yaw = yaw;
    this.lastRcTime = Date.now();

    // If active discrete task was running, RC stick input cancels it
    if (roll !== 0 || pitch !== 0 || throttle !== 0 || yaw !== 0) {
      if (this.activeTask) this.activeTask = null;
      this.state = DroneState.FLYING;
    }
  }

  startTakeoff() {
    if (this.state !== DroneState.DISARMED) return 'error';
    this.state = DroneState.TAKING_OFF;
    this.droneModel.setPropellerSpeed(1.2);
    this.droneModel.setLedColor(0x10b981, true); // Blinking green

    return new Promise((resolve) => {
      this.activeTask = {
        type: 'TAKEOFF',
        targetHeight: 1.0, // 100cm hover
        onComplete: () => {
          this.state = DroneState.HOVER;
          this.droneModel.setPropellerSpeed(1.0);
          this.droneModel.setLedColor(0x10b981, false); // Solid green
          resolve('ok');
        }
      };
    });
  }

  startLanding() {
    if (this.state === DroneState.DISARMED) return 'error';
    this.state = DroneState.LANDING;
    this.activeTask = null;
    this.droneModel.setLedColor(0xf59e0b, true); // Amber blinking

    return new Promise((resolve) => {
      this.activeTask = {
        type: 'LANDING',
        onComplete: () => {
          this.state = DroneState.DISARMED;
          this.velocity.set(0, 0, 0);
          this.position.y = 0.02;
          this.pitch = 0;
          this.roll = 0;
          this.droneModel.setPropellerSpeed(0);
          this.droneModel.setLedColor(0x3b82f6, false); // Idle blue
          resolve('ok');
        }
      };
    });
  }

  emergencyStop() {
    this.state = DroneState.EMERGENCY;
    this.activeTask = null;
    this.rc = { roll: 0, pitch: 0, throttle: 0, yaw: 0 };
    this.droneModel.setPropellerSpeed(0);
    this.droneModel.setLedColor(0xef4444, true); // Red emergency
    return 'ok';
  }

  startDiscreteMove(direction, distCm) {
    if (this.state === DroneState.DISARMED || this.state === DroneState.LANDING) return 'error';
    this.state = DroneState.FLYING;

    const distM = distCm / 100;
    const moveVector = new THREE.Vector3();

    // Local drone coordinate direction:
    // Forward is +Z in drone's local frame
    switch (direction) {
      case 'forward': moveVector.set(0, 0, distM); break;
      case 'back':    moveVector.set(0, 0, -distM); break;
      case 'left':   moveVector.set(distM, 0, 0); break;   // Left on screen (+X world)
      case 'right':  moveVector.set(-distM, 0, 0); break;  // Right on screen (-X world)
      case 'up':     moveVector.set(0, distM, 0); break;
      case 'down':   moveVector.set(0, -distM, 0); break;
    }

    // Rotate horizontal vectors by drone's current yaw
    moveVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    const startPos = this.position.clone();
    const targetPos = startPos.clone().add(moveVector);

    // Prevent crashing underground
    if (targetPos.y < 0.1) targetPos.y = 0.1;

    return new Promise((resolve) => {
      this.activeTask = {
        type: 'MOVE',
        startPos,
        targetPos,
        speedM: Math.max(0.2, this.speed / 100),
        startTime: Date.now(),
        duration: (distM / Math.max(0.2, this.speed / 100)) * 1000,
        onComplete: () => {
          this.state = DroneState.HOVER;
          resolve('ok');
        }
      };
    });
  }

  startRotation(dir, angleDeg) {
    if (this.state === DroneState.DISARMED || this.state === DroneState.LANDING) return 'error';
    this.state = DroneState.FLYING;

    const rad = (angleDeg * Math.PI) / 180;
    const deltaYaw = (dir === 'cw' ? -rad : rad); // Restored original correct rotation
    const startYaw = this.yaw;
    const targetYaw = this.yaw + deltaYaw;
    const rotSpeedRad = THREE.MathUtils.degToRad(60); // 60 deg/sec
    const duration = (rad / rotSpeedRad) * 1000;

    return new Promise((resolve) => {
      this.activeTask = {
        type: 'ROTATE',
        startYaw,
        targetYaw,
        startTime: Date.now(),
        duration: Math.max(500, duration),
        onComplete: () => {
          this.state = DroneState.HOVER;
          resolve('ok');
        }
      };
    });
  }

  async startFlip(dir) {
    // If drone is on the ground, auto-takeoff to safe altitude first
    if (this.state === DroneState.DISARMED) {
      await this.startTakeoff();
      await new Promise(r => setTimeout(r, 400));
    }

    if (this.isFlipping) return 'error';

    this.isFlipping = true;
    this.flipProgress = 0;
    this.flipDir = dir;
    this.droneModel.setPropellerSpeed(1.5);
    this.droneModel.setLedColor(0xa855f7, true); // Strobe LED during flip

    const startY = Math.max(1.0, this.position.y);
    this.position.y = startY;

    return new Promise((resolve) => {
      this.activeTask = {
        type: 'FLIP',
        dir,
        startY,
        duration: 900, // Smooth 0.9s duration
        startTime: Date.now(),
        onComplete: () => {
          this.isFlipping = false;
          this.pitch = 0;
          this.roll = 0;
          this.position.y = startY;
          this.droneModel.setPropellerSpeed(1.0);
          this.droneModel.setLedColor(0x10b981, false);
          this.state = DroneState.HOVER;
          resolve('ok');
        }
      };
    });
  }

  update(delta) {
    // 1. Update Flight Time & Battery
    if (this.state !== DroneState.DISARMED) {
      this.flightTime += delta;
      // Drains 100% in ~13 minutes = ~780s
      this.battery = Math.max(0, this.battery - (delta / 7.8));
    }

    // 2. Process Emergency State
    if (this.state === DroneState.EMERGENCY) {
      this.velocity.y -= 9.81 * delta; // Free fall
      this.position.addScaledVector(this.velocity, delta);
      if (this.position.y <= 0.02) {
        this.position.y = 0.02;
        this.velocity.set(0, 0, 0);
        this.state = DroneState.DISARMED;
      }
      this.group.position.copy(this.position);
      return;
    }

    // 3. Process Active Discrete Tasks (Takeoff, Land, Up/Down/Move, Rotate, Flip)
    if (this.activeTask) {
      this.updateActiveTask(delta);
    } else if (this.state === DroneState.FLYING || this.state === DroneState.HOVER) {
      // 4. Process RC Controls
      this.updateRcPhysics(delta);
    }

    // Floor collision prevention
    if (this.position.y < 0.02) {
      this.position.y = 0.02;
      this.velocity.y = 0;
    }

    // Update Three.js Object3D Position & Rotation
    this.group.position.copy(this.position);
    this.updateModelRotation();
  }

  updateActiveTask(delta) {
    const task = this.activeTask;

    if (task.type === 'TAKEOFF') {
      const climbSpeed = 0.8; // m/s
      this.position.y += climbSpeed * delta;
      this.droneModel.setPropellerSpeed(1.2);

      if (this.position.y >= task.targetHeight) {
        this.position.y = task.targetHeight;
        this.velocity.set(0, 0, 0);
        const cb = task.onComplete;
        this.activeTask = null;
        if (cb) cb();
      }
    } else if (task.type === 'LANDING') {
      const descendSpeed = 0.4; // m/s
      this.position.y -= descendSpeed * delta;
      this.droneModel.setPropellerSpeed(0.8);

      if (this.position.y <= 0.02) {
        this.position.y = 0.02;
        const cb = task.onComplete;
        this.activeTask = null;
        if (cb) cb();
      }
    } else if (task.type === 'MOVE') {
      const elapsed = Date.now() - task.startTime;
      const t = Math.min(1.0, elapsed / task.duration);
      // Smooth ease-in-out
      const easeT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      this.position.lerpVectors(task.startPos, task.targetPos, easeT);

      // Banking into movement (tilting into translation direction)
      const moveDelta = task.targetPos.clone().sub(task.startPos);
      const moveDir = moveDelta.clone().normalize();
      this.targetPitch = -moveDir.z * 0.25;
      this.targetRoll = -moveDir.x * 0.25;

      if (t >= 1.0) {
        this.position.copy(task.targetPos);
        this.targetPitch = 0;
        this.targetRoll = 0;
        const cb = task.onComplete;
        this.activeTask = null;
        if (cb) cb();
      }
    } else if (task.type === 'ROTATE') {
      const elapsed = Date.now() - task.startTime;
      const t = Math.min(1.0, elapsed / task.duration);
      const easeT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      this.yaw = THREE.MathUtils.lerp(task.startYaw, task.targetYaw, easeT);

      if (t >= 1.0) {
        this.yaw = task.targetYaw;
        const cb = task.onComplete;
        this.activeTask = null;
        if (cb) cb();
      }
    } else if (task.type === 'FLIP') {
      const elapsed = Date.now() - task.startTime;
      const t = Math.min(1.0, elapsed / task.duration);

      // Dynamic aerobatic pop: climbs in first half, settles back in second half
      const heightArc = Math.sin(t * Math.PI) * 0.35;
      this.position.y = (task.startY || 1.0) + heightArc;

      // 360-degree rotation with smooth ease
      const rot360 = t * Math.PI * 2;

      if (task.dir === 'f') this.pitch = rot360;
      else if (task.dir === 'b') this.pitch = -rot360;
      else if (task.dir === 'l') this.roll = -rot360;
      else if (task.dir === 'r') this.roll = rot360;

      if (t >= 1.0) {
        this.pitch = 0;
        this.roll = 0;
        this.position.y = task.startY || 1.0;
        const cb = task.onComplete;
        this.activeTask = null;
        if (cb) cb();
      }
    }
  }

  updateRcPhysics(delta) {
    // Convert RC values (-100 to 100) to velocities
    // Max horizontal speed: ~2.5 m/s
    // Max vertical speed: ~1.5 m/s
    // Max yaw rate: ~100 deg/s (~1.74 rad/s)
    const maxHorizontalSpeed = 2.5;
    const maxVerticalSpeed = 1.5;
    const maxYawRate = THREE.MathUtils.degToRad(120);

    // Right stick X (Roll): positive moves Right on screen (-X world), negative moves Left (+X world)
    const targetLocalVx = -(this.rc.roll / 100) * maxHorizontalSpeed;
    const targetLocalVz = (this.rc.pitch / 100) * maxHorizontalSpeed;
    const targetVy = (this.rc.throttle / 100) * maxVerticalSpeed;
    // Left stick X (Yaw): restored original correct yaw direction on throttle stick
    const yawRate = -(this.rc.yaw / 100) * maxYawRate;

    // Apply Yaw
    this.yaw += yawRate * delta;

    // Transform local body velocity (Roll / Pitch) to world frame using current Yaw
    const worldTargetVel = new THREE.Vector3(targetLocalVx, targetVy, targetLocalVz);
    worldTargetVel.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    // Smooth velocity damping / acceleration
    const accelRate = 6.0;
    this.velocity.x += (worldTargetVel.x - this.velocity.x) * Math.min(1.0, accelRate * delta);
    this.velocity.y += (worldTargetVel.y - this.velocity.y) * Math.min(1.0, accelRate * delta);
    this.velocity.z += (worldTargetVel.z - this.velocity.z) * Math.min(1.0, accelRate * delta);

    // Position integration
    this.position.addScaledVector(this.velocity, delta);

    // Calculate dynamic tilt/banking based on stick inputs & velocity
    // Quadcopter tilts in direction of acceleration (positive roll tilts Right on screen towards -X)
    const maxTilt = THREE.MathUtils.degToRad(18); // ~18 degrees tilt at full speed
    this.targetPitch = -(this.rc.pitch / 100) * maxTilt;
    this.targetRoll = (this.rc.roll / 100) * maxTilt;

    // Smooth tilt interpolation
    this.pitch += (this.targetPitch - this.pitch) * Math.min(1.0, 10.0 * delta);
    this.roll += (this.targetRoll - this.roll) * Math.min(1.0, 10.0 * delta);
  }

  updateModelRotation() {
    // Apply Y-X-Z Euler rotation (Yaw -> Pitch -> Roll)
    this.group.rotation.order = 'YXZ';
    this.group.rotation.y = this.yaw;
    this.group.rotation.x = this.pitch;
    this.group.rotation.z = this.roll;
  }

  // Generate telemetry state object for UDP 8890 broadcast
  getTelemetryState() {
    // DJI Tello Units:
    // pitch, roll, yaw: degrees
    // vgx, vgy, vgz: speeds in cm/s
    // h, tof: height / distance in cm
    // bat: % (0-100)
    // baro: meters
    // agx, agy, agz: acceleration (cm/s^2 or g)
    // In aviation / drone telemetry: positive roll is right bank, negative roll is left bank
    const pitchDeg = THREE.MathUtils.radToDeg(this.pitch);
    const rollDeg = -THREE.MathUtils.radToDeg(this.roll);
    const yawDeg = THREE.MathUtils.radToDeg(this.yaw);

    const heightCm = Math.max(0, Math.round(this.position.y * 100));

    // Convert world velocity to drone local body velocities (vgx: forward/back, vgy: lateral left/right, vgz: vertical)
    const localVel = this.velocity.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.yaw);

    return {
      pitch: Math.round(pitchDeg),
      roll: Math.round(rollDeg),
      yaw: Math.round(yawDeg),
      vgx: Math.round(localVel.z * 100), // Forward/backward cm/s
      vgy: Math.round(localVel.x * 100), // Lateral left/right cm/s
      vgz: Math.round(localVel.y * 100), // Vertical cm/s
      templ: 52,
      temph: 58,
      tof: heightCm,
      h: heightCm,
      bat: Math.round(this.battery),
      baro: parseFloat(this.position.y.toFixed(2)),
      time: Math.round(this.flightTime),
      agx: parseFloat((this.velocity.x * 10).toFixed(2)),
      agy: parseFloat((this.velocity.y * 10).toFixed(2)),
      agz: parseFloat(((this.velocity.z * 10) - 980).toFixed(2)),
      speed: this.speed,
      isFlying: this.state !== DroneState.DISARMED,
      flightState: this.state
    };
  }
}
