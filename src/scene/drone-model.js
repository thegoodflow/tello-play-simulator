import * as THREE from 'three';

export class DroneModel {
  constructor() {
    this.group = new THREE.Group();
    this.propellers = [];
    this.propRotationSpeed = 0;
    this.targetPropSpeed = 0;
    this.ledLight = null;
    this.ledMesh = null;

    this.buildModel();
  }

  buildModel() {
    // Tello is compact: ~18cm diagonal motor-to-motor
    // Materials
    const whitePlasticMat = new THREE.MeshStandardMaterial({
      color: 0xf3f4f6,
      roughness: 0.35,
      metalness: 0.1
    });

    const darkChassisMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      roughness: 0.6,
      metalness: 0.3
    });

    const motorMat = new THREE.MeshStandardMaterial({
      color: 0x6b7280,
      roughness: 0.2,
      metalness: 0.8
    });

    const propMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.4,
      metalness: 0.1,
      transparent: true,
      opacity: 0.9
    });

    const cameraLensMat = new THREE.MeshStandardMaterial({
      color: 0x050505,
      roughness: 0.1,
      metalness: 0.9
    });

    // 1. Lower Chassis (Dark Grey)
    const lowerBodyGeo = new THREE.BoxGeometry(0.09, 0.024, 0.10);
    const lowerBody = new THREE.Mesh(lowerBodyGeo, darkChassisMat);
    lowerBody.position.y = 0;
    lowerBody.castShadow = true;
    lowerBody.receiveShadow = true;
    this.group.add(lowerBody);

    // Bottom sensors (Optical flow camera simulation)
    const bottomSensorGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.004, 16);
    const bottomSensor = new THREE.Mesh(bottomSensorGeo, cameraLensMat);
    bottomSensor.position.set(0, -0.013, 0.01);
    this.group.add(bottomSensor);

    // 2. Upper Fuselage Shell (Glossy White with Tello curve)
    const upperBodyGeo = new THREE.BoxGeometry(0.082, 0.018, 0.092);
    const upperBody = new THREE.Mesh(upperBodyGeo, whitePlasticMat);
    upperBody.position.y = 0.018;
    upperBody.castShadow = true;
    this.group.add(upperBody);

    // Top Dome Curve
    const topCurveGeo = new THREE.CylinderGeometry(0.038, 0.041, 0.086, 24);
    topCurveGeo.rotateZ(Math.PI / 2);
    const topCurve = new THREE.Mesh(topCurveGeo, whitePlasticMat);
    topCurve.position.set(0, 0.025, 0);
    topCurve.scale.set(1, 0.3, 1);
    topCurve.castShadow = true;
    this.group.add(topCurve);

    // 3. Front 720p Camera Module
    const cameraHousingGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.01, 16);
    cameraHousingGeo.rotateX(Math.PI / 2);
    const cameraHousing = new THREE.Mesh(cameraHousingGeo, darkChassisMat);
    cameraHousing.position.set(0, 0.006, 0.052);
    this.group.add(cameraHousing);

    const cameraLensGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.002, 16);
    cameraLensGeo.rotateX(Math.PI / 2);
    const cameraLens = new THREE.Mesh(cameraLensGeo, cameraLensMat);
    cameraLens.position.set(0, 0.006, 0.057);
    this.group.add(cameraLens);

    // 4. Front Status LED
    const ledGeo = new THREE.SphereGeometry(0.003, 12, 12);
    const ledMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    this.ledMesh = new THREE.Mesh(ledGeo, ledMat);
    this.ledMesh.position.set(-0.022, 0.012, 0.050);
    this.group.add(this.ledMesh);

    this.ledLight = new THREE.PointLight(0x10b981, 0.4, 0.5);
    this.ledLight.position.set(-0.022, 0.012, 0.052);
    this.group.add(this.ledLight);

    // 5. Four Motor Arms & Propellers
    // Arm positions: front-left, front-right, rear-left, rear-right
    // Coordinate convention: +Z is forward (camera faces +Z), +X is right, +Y is up
    const armDistanceX = 0.065;
    const armDistanceZ = 0.065;
    const armAngle = Math.PI / 4;

    const armPositions = [
      { x: -armDistanceX, z:  armDistanceZ, dir: 1,  name: 'FL' }, // Front-Left (CW)
      { x:  armDistanceX, z:  armDistanceZ, dir: -1, name: 'FR' }, // Front-Right (CCW)
      { x: -armDistanceX, z: -armDistanceZ, dir: -1, name: 'RL' }, // Rear-Left (CCW)
      { x:  armDistanceX, z: -armDistanceZ, dir: 1,  name: 'RR' }  // Rear-Right (CW)
    ];

    armPositions.forEach((pos) => {
      // Diagonal Arm Beam
      const armLength = Math.hypot(pos.x, pos.z) - 0.02;
      const armGeo = new THREE.BoxGeometry(0.01, 0.008, armLength);
      const armMesh = new THREE.Mesh(armGeo, darkChassisMat);
      armMesh.position.set(pos.x * 0.55, 0.002, pos.z * 0.55);
      armMesh.rotation.y = Math.atan2(pos.x, pos.z);
      armMesh.castShadow = true;
      this.group.add(armMesh);

      // Motor Can (Brushless motor)
      const motorGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.02, 16);
      const motorMesh = new THREE.Mesh(motorGeo, motorMat);
      motorMesh.position.set(pos.x, 0.006, pos.z);
      motorMesh.castShadow = true;
      this.group.add(motorMesh);

      // Propeller Hub & Blades
      const propGroup = new THREE.Group();
      propGroup.position.set(pos.x, 0.018, pos.z);

      // Center Hub
      const hubGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.004, 12);
      const hubMesh = new THREE.Mesh(hubGeo, motorMat);
      propGroup.add(hubMesh);

      // 2 Blades (3-inch / ~75mm prop = 0.075m length)
      const bladeLength = 0.076;
      const bladeGeo = new THREE.BoxGeometry(bladeLength, 0.001, 0.008);
      // Slight aerodynamic twist
      bladeGeo.rotateZ(0.08 * pos.dir);
      const bladeMesh = new THREE.Mesh(bladeGeo, propMat);
      bladeMesh.castShadow = true;
      propGroup.add(bladeMesh);

      // Semi-transparent Prop Disk for high-speed motion blur
      const blurDiskGeo = new THREE.CylinderGeometry(bladeLength * 0.5, bladeLength * 0.5, 0.001, 24);
      const blurDiskMat = new THREE.MeshBasicMaterial({
        color: 0x222222,
        transparent: true,
        opacity: 0.0
      });
      const blurDisk = new THREE.Mesh(blurDiskGeo, blurDiskMat);
      blurDisk.position.y = 0.001;
      propGroup.add(blurDisk);

      // Sleek Propeller Guard
      const guardCurve = new THREE.TorusGeometry(0.046, 0.0015, 8, 24, Math.PI * 1.3);
      guardCurve.rotateX(Math.PI / 2);
      const guardMesh = new THREE.Mesh(guardCurve, darkChassisMat);
      guardMesh.position.set(pos.x, 0.014, pos.z);
      guardMesh.rotation.y = Math.atan2(pos.x, pos.z) + Math.PI * 0.85;
      this.group.add(guardMesh);

      this.group.add(propGroup);

      this.propellers.push({
        group: propGroup,
        blade: bladeMesh,
        blurDisk: blurDisk,
        blurMat: blurDiskMat,
        dir: pos.dir
      });
    });

    // Subtle landing feet
    const footPositions = [
      { x: -0.035, z:  0.035 },
      { x:  0.035, z:  0.035 },
      { x: -0.035, z: -0.035 },
      { x:  0.035, z: -0.035 }
    ];
    footPositions.forEach(fp => {
      const footGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.01, 8);
      const foot = new THREE.Mesh(footGeo, darkChassisMat);
      foot.position.set(fp.x, -0.015, fp.z);
      this.group.add(foot);
    });
  }

  setPropellerSpeed(speed) {
    // 0 = off, 1 = hover, 1.5 = full throttle
    this.targetPropSpeed = speed;
  }

  setLedColor(colorHex, blinking = false) {
    if (this.ledMesh && this.ledLight) {
      this.ledMesh.material.color.setHex(colorHex);
      this.ledLight.color.setHex(colorHex);
      if (blinking) {
        const blink = Math.sin(Date.now() * 0.01) > 0;
        this.ledMesh.visible = blink;
        this.ledLight.intensity = blink ? 0.6 : 0;
      } else {
        this.ledMesh.visible = true;
        this.ledLight.intensity = 0.5;
      }
    }
  }

  update(delta) {
    // Smooth transition to target prop speed
    this.propRotationSpeed += (this.targetPropSpeed - this.propRotationSpeed) * Math.min(1.0, delta * 8.0);

    // Propeller spinning animation
    const rotAmount = this.propRotationSpeed * delta * 85;
    for (const prop of this.propellers) {
      prop.group.rotation.y += rotAmount * prop.dir;

      // Blur effect at high RPM
      if (this.propRotationSpeed > 0.4) {
        prop.blurMat.opacity = Math.min(0.35, (this.propRotationSpeed - 0.4) * 0.5);
        prop.blade.material.opacity = Math.max(0.3, 1.0 - (this.propRotationSpeed - 0.4) * 0.7);
      } else {
        prop.blurMat.opacity = 0;
        prop.blade.material.opacity = 0.95;
      }
    }
  }
}
