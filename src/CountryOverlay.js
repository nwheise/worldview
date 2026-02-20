import * as THREE from 'three';
import { latLonToVector3, coordsToVectors } from './utils/geoUtils.js';

const OVERLAY_COLORS = [0xff3333, 0x4488ff, 0x33cc66]; // red, blue, green
const NUM_SLOTS = 3;

/**
 * Manages up to 3 independent country overlay slots on the globe.
 *
 * Each slot has its own Three.js Group whose orientation is updated every frame
 * so the country's centroid faces the camera and geographic north maps to
 * screen-up.  A shared `userRotation` (compass dial) is applied to all active
 * slots simultaneously.
 */
// Globe radius must match Globe.js
const GLOBE_RADIUS = 5.0;

export class CountryOverlay {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.userRotation = 0;
    this._raycaster = new THREE.Raycaster();

    this.slots = Array.from({ length: NUM_SLOTS }, (_, i) => ({
      active: false,
      country: null,
      originalCentroidDir: null, // fixed direction computed at show(); never changes
      displayNDC: null,          // THREE.Vector2 in NDC; null = always face camera (center)
      group: new THREE.Group(),
      color: OVERLAY_COLORS[i],
    }));

    // Add all groups to the scene up front; empty groups cost nothing
    this.slots.forEach(slot => this.scene.add(slot.group));
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Show a country on the given slot.
   * @param {Object} country - GeoJSON feature
   * @param {number} slotIndex - 0, 1, or 2
   */
  show(country, slotIndex) {
    this.clear(slotIndex);

    const slot = this.slots[slotIndex];
    slot.country = country;
    slot.active = true;

    const geometry = country.geometry;
    if (!geometry || !geometry.coordinates) {
      console.warn('Country has no geometry:', country);
      return;
    }

    slot.originalCentroidDir = this._computeCentroidDirection(geometry);
    slot.displayNDC = null; // null → update() targets center of screen (cameraDir)

    const overlayRadius = 5.005;
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: slot.color,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });

    if (geometry.type === 'Polygon') {
      this._createPolygonOverlay(geometry.coordinates[0], overlayRadius, fillMaterial, slotIndex);
    } else if (geometry.type === 'MultiPolygon') {
      geometry.coordinates.forEach(polygon => {
        this._createPolygonOverlay(polygon[0], overlayRadius, fillMaterial, slotIndex);
      });
    }

    this.update();
  }

  /**
   * Clear a single slot — disposes meshes and marks slot inactive.
   * @param {number} slotIndex
   */
  clear(slotIndex) {
    const slot = this.slots[slotIndex];
    while (slot.group.children.length > 0) {
      const child = slot.group.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      slot.group.remove(child);
    }
    slot.active = false;
    slot.country = null;
    slot.originalCentroidDir = null;
    slot.displayNDC = null;
    slot.group.quaternion.identity();
  }

  /** Clear all slots. */
  clearAll() {
    for (let i = 0; i < NUM_SLOTS; i++) this.clear(i);
  }

  /**
   * Set shared rotation from the compass dial.
   * @param {number} radians
   */
  setRotation(radians) {
    this.userRotation = radians;
  }

  /**
   * Set where the overlay should appear, as a screen-space NDC coordinate.
   * update() re-projects this to a globe point using the current camera each
   * frame, so the overlay stays fixed on screen when the globe is rotated.
   * @param {number} slotIndex
   * @param {THREE.Vector2} ndc - NDC coords in [-1,1] x [-1,1]
   */
  setDisplayNDC(slotIndex, ndc) {
    this.slots[slotIndex].displayNDC = ndc.clone();
  }

  /**
   * Returns all fill Mesh objects from active slots (for drag raycasting).
   * Line objects are excluded — they are too thin to reliably hit.
   * @returns {THREE.Mesh[]}
   */
  getOverlayMeshes() {
    const meshes = [];
    this.slots.forEach(slot => {
      if (!slot.active) return;
      slot.group.children.forEach(child => {
        if (child.isMesh) meshes.push(child);
      });
    });
    return meshes;
  }

  /** @returns {boolean} true if any slot is active */
  hasAnyOverlay() {
    return this.slots.some(s => s.active);
  }

  /**
   * @param {number} slotIndex
   * @returns {boolean}
   */
  hasOverlay(slotIndex) {
    return this.slots[slotIndex].active;
  }

  /**
   * Update orientation for all active slots.  Call every animation frame.
   */
  update() {
    const cameraDir = this.camera.position.clone().normalize();

    this.slots.forEach(slot => {
      if (!slot.active || !slot.originalCentroidDir) return;

      // Re-project the stored NDC position against the globe sphere using the
      // current camera.  This makes the overlay track a fixed screen position
      // rather than a fixed world-space point, so spinning the globe underneath
      // does not move the overlay.
      let targetDir;
      if (slot.displayNDC) {
        targetDir = this._ndcToGlobeDir(slot.displayNDC) ?? cameraDir;
      } else {
        targetDir = cameraDir;
      }

      const srcFrame = this._localFrame(slot.originalCentroidDir);
      const tgtFrame = this._localFrame(targetDir);

      const srcMat = new THREE.Matrix4().makeBasis(srcFrame.right, srcFrame.up, srcFrame.forward);
      const tgtMat = new THREE.Matrix4().makeBasis(tgtFrame.right, tgtFrame.up, tgtFrame.forward);

      const rotMat = tgtMat.clone().multiply(srcMat.clone().invert());

      if (this.userRotation !== 0) {
        const userRot = new THREE.Matrix4().makeRotationAxis(cameraDir, -this.userRotation);
        rotMat.premultiply(userRot);
      }

      slot.group.quaternion.setFromRotationMatrix(rotMat);
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** @private */
  _computeCentroidDirection(geometry) {
    const rings =
      geometry.type === 'Polygon'
        ? [geometry.coordinates[0]]
        : geometry.type === 'MultiPolygon'
          ? geometry.coordinates.map(p => p[0])
          : [];

    const sum = new THREE.Vector3();
    let count = 0;

    rings.forEach(ring => {
      ring.forEach(([lon, lat]) => {
        sum.add(latLonToVector3(lat, lon, 1));
        count++;
      });
    });

    return count > 0 ? sum.divideScalar(count).normalize() : new THREE.Vector3(0, 0, 1);
  }

  /**
   * @private
   * Compute {right, up, forward} tangent frame at a point on the unit sphere.
   */
  _localFrame(dir) {
    const worldUp = new THREE.Vector3(0, 1, 0);
    const forward = dir.clone();

    let up = worldUp.clone().addScaledVector(forward, -worldUp.dot(forward));
    if (up.lengthSq() < 1e-8) {
      up = new THREE.Vector3(0, 0, 1).addScaledVector(forward, -new THREE.Vector3(0, 0, 1).dot(forward));
    }
    up.normalize();

    const right = new THREE.Vector3().crossVectors(up, forward).normalize();
    return { right, up, forward };
  }

  /**
   * @private
   * Cast a ray from the camera through an NDC point and return the normalised
   * direction to the nearest globe-sphere intersection, or null if the ray misses.
   * Using analytic sphere intersection avoids needing a mesh reference.
   * @param {THREE.Vector2} ndc
   * @returns {THREE.Vector3|null}
   */
  _ndcToGlobeDir(ndc) {
    this._raycaster.setFromCamera(ndc, this.camera);
    const ro = this._raycaster.ray.origin;
    const rd = this._raycaster.ray.direction;
    // Solve |ro + t*rd|² = R²  →  t² + 2(ro·rd)t + (|ro|²-R²) = 0
    const b = ro.dot(rd);
    const c = ro.dot(ro) - GLOBE_RADIUS * GLOBE_RADIUS;
    const disc = b * b - c;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc); // front (near) intersection
    if (t < 0) return null;
    return ro.clone().addScaledVector(rd, t).normalize();
  }

  /**
   * @private
   * Build fill + outline meshes for one polygon ring and add to the slot's group.
   * Fill meshes get `userData.slotIndex` for raycasting.
   */
  _createPolygonOverlay(coordinates, radius, fillMaterial, slotIndex) {
    if (coordinates.length < 3) return;

    const last = coordinates.length - 1;
    const isClosed = coordinates[0][0] === coordinates[last][0] &&
                     coordinates[0][1] === coordinates[last][1];
    const openCoords = isClosed ? coordinates.slice(0, -1) : coordinates;

    if (openCoords.length < 3) return;

    const points3D = openCoords.map(([lon, lat]) => latLonToVector3(lat, lon, radius));
    const points2D = openCoords.map(([lon, lat]) => new THREE.Vector2(lon, lat));

    let triangles;
    try {
      triangles = THREE.ShapeUtils.triangulateShape(points2D, []);
    } catch (e) {
      console.warn('Triangulation failed, skipping fill:', e);
      triangles = [];
    }

    if (triangles.length > 0) {
      const vertices = [];
      for (const [a, b, c] of triangles) {
        const pa = points3D[a], pb = points3D[b], pc = points3D[c];
        vertices.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z, pc.x, pc.y, pc.z);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geo.computeVertexNormals();

      const mesh = new THREE.Mesh(geo, fillMaterial);
      mesh.renderOrder = 999;
      mesh.userData = { slotIndex };
      this.slots[slotIndex].group.add(mesh);
    }

    // Border lines
    const slot = this.slots[slotIndex];
    const lineColor = slot.color;
    const linePoints = coordsToVectors(coordinates, radius);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
    const lineMat = new THREE.LineBasicMaterial({
      color: lineColor,
      linewidth: 2,
      transparent: true,
      opacity: 0.8,
      depthTest: false,
      depthWrite: false,
    });
    const line = new THREE.Line(lineGeo, lineMat);
    line.renderOrder = 999;
    slot.group.add(line);
  }
}
