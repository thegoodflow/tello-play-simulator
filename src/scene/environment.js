import * as THREE from 'three';

export class Environment {
  constructor(scene) {
    this.scene = scene;
    this.buildEnvironment();
  }

  buildEnvironment() {
    this.createFloor();
    this.createHelipad();
    this.createObstacles();
    this.createLighting();
  }

  createFloor() {
    // 1. Large Ground Plane
    const floorGeo = new THREE.PlaneGeometry(30, 30);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a, // dark slate
      roughness: 0.8,
      metalness: 0.2
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02; // flush beneath helipad
    floor.receiveShadow = true;
    this.scene.add(floor);

    // 2. High-Tech Grid Overlay
    const gridHelper = new THREE.GridHelper(30, 30, 0x38bdf8, 0x1e293b);
    gridHelper.position.y = -0.015;
    this.scene.add(gridHelper);

    // Fine inner grid for flight precision (10m x 10m with 0.5m subdivisions)
    const fineGrid = new THREE.GridHelper(10, 20, 0x0ea5e9, 0x1e293b);
    fineGrid.position.y = -0.012;
    this.scene.add(fineGrid);
  }

  createHelipad() {
    // Tello Landing Pad (approx 0.5m x 0.5m)
    const padGroup = new THREE.Group();
    padGroup.position.set(0, 0, 0);

    // Outer Pad base
    const padBaseGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.005, 32);
    const padBaseMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b, // safety amber/yellow
      roughness: 0.5
    });
    const padBase = new THREE.Mesh(padBaseGeo, padBaseMat);
    padBase.receiveShadow = true;
    padGroup.add(padBase);

    // Inner Dark Ring
    const innerRingGeo = new THREE.RingGeometry(0.24, 0.26, 32);
    innerRingGeo.rotateX(-Math.PI / 2);
    const innerRingMat = new THREE.MeshBasicMaterial({ color: 0x0f172a, side: THREE.DoubleSide });
    const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRing.position.y = 0.003;
    padGroup.add(innerRing);

    // Helipad "H" marking
    const hMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
    const leftBarGeo = new THREE.BoxGeometry(0.04, 0.003, 0.22);
    const leftBar = new THREE.Mesh(leftBarGeo, hMat);
    leftBar.position.set(-0.08, 0.003, 0);
    padGroup.add(leftBar);

    const rightBarGeo = new THREE.BoxGeometry(0.04, 0.003, 0.22);
    const rightBar = new THREE.Mesh(rightBarGeo, hMat);
    rightBar.position.set(0.08, 0.003, 0);
    padGroup.add(rightBar);

    const midBarGeo = new THREE.BoxGeometry(0.12, 0.003, 0.04);
    const midBar = new THREE.Mesh(midBarGeo, hMat);
    midBar.position.set(0, 0.003, 0);
    padGroup.add(midBar);

    // Orientation arrow pointing forward (+Z direction)
    const arrowGeo = new THREE.ConeGeometry(0.03, 0.08, 16);
    arrowGeo.rotateX(Math.PI / 2);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.position.set(0, 0.003, 0.28);
    padGroup.add(arrow);

    this.scene.add(padGroup);
  }

  createObstacles() {
    // Neon Flight Course Rings at different heights & distances
    const rings = [
      { x: 0,    y: 1.0, z: 1.5,  color: 0x06b6d4, radius: 0.4 },  // Cyan front ring
      { x: 1.2,  y: 1.4, z: 2.8,  color: 0xa855f7, radius: 0.45 }, // Purple right ring
      { x: -1.2, y: 1.2, z: 2.8,  color: 0x10b981, radius: 0.45 }, // Green left ring
      { x: 0,    y: 1.8, z: 4.2,  color: 0xf59e0b, radius: 0.5 }   // Yellow upper goal ring
    ];

    rings.forEach((r, idx) => {
      const ringGroup = new THREE.Group();
      ringGroup.position.set(r.x, r.y, r.z);

      // Torus Hoop
      const ringGeo = new THREE.TorusGeometry(r.radius, 0.025, 16, 48);
      const ringMat = new THREE.MeshStandardMaterial({
        color: r.color,
        emissive: r.color,
        emissiveIntensity: 0.6,
        roughness: 0.3
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.castShadow = true;
      ringGroup.add(ringMesh);

      // Stand / Pillar holding the hoop
      const standGeo = new THREE.CylinderGeometry(0.015, 0.02, r.y - r.radius, 16);
      const standMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });
      const stand = new THREE.Mesh(standGeo, standMat);
      stand.position.y = -(r.y - r.radius) / 2 - r.radius;
      stand.castShadow = true;
      ringGroup.add(stand);

      // Base plate
      const baseGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.01, 16);
      const base = new THREE.Mesh(baseGeo, standMat);
      base.position.y = -r.y;
      ringGroup.add(base);

      this.scene.add(ringGroup);
    });

    // 4 Corner Boundary Beacon Pillars (at 4m x 4m)
    const corners = [
      { x: -3.5, z: -3.5 },
      { x:  3.5, z: -3.5 },
      { x: -3.5, z:  4.5 },
      { x:  3.5, z:  4.5 }
    ];

    corners.forEach(c => {
      const pillarGeo = new THREE.CylinderGeometry(0.06, 0.08, 2.5, 16);
      const pillarMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.5
      });
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(c.x, 1.25, c.z);
      pillar.castShadow = true;
      this.scene.add(pillar);

      // Beacon Light on top
      const beaconGeo = new THREE.SphereGeometry(0.05, 12, 12);
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(c.x, 2.55, c.z);
      this.scene.add(beacon);

      const beaconLight = new THREE.PointLight(0x38bdf8, 0.3, 3);
      beaconLight.position.set(c.x, 2.55, c.z);
      this.scene.add(beaconLight);
    });
  }

  createLighting() {
    // Ambient Light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    // Directional Sun / Studio Light with soft shadows
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(5, 8, 5);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 25;
    sunLight.shadow.camera.left = -6;
    sunLight.shadow.camera.right = 6;
    sunLight.shadow.camera.top = 6;
    sunLight.shadow.camera.bottom = -6;
    sunLight.shadow.bias = -0.0005;
    this.scene.add(sunLight);

    // Soft Rim Light from opposite angle
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.4);
    rimLight.position.set(-5, 4, -5);
    this.scene.add(rimLight);
  }
}
