import * as THREE from 'three';
import { latLonToVector3, coordsToVectors } from './utils/geoUtils.js';

/**
 * Manages country overlay visualization with fixed screen-center positioning.
 *
 * The overlay geometry is built on the sphere at a radius just barely above the
 * globe surface.  Each frame the overlayGroup is rotated so the country's
 * centroid faces the camera AND the country's geographic north points toward
 * the top of the screen (camera up).  An optional user rotation around the
 * view axis allows manual adjustment via a dial.
 */
export class CountryOverlay {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.overlayGroup = new THREE.Group();
    this.centroidDir = null;   // unit vector of country centroid on sphere
    this.currentCountry = null;
    this.userRotation = 0;     // additional rotation in radians around view axis

    this.scene.add(this.overlayGroup);
  }

  /**
   * Set additional rotation around the view axis (from the UI dial).
   * @param {number} radians
   */
  setRotation(radians) {
    this.userRotation = radians;
  }

  /**
   * Create and display an overlay for the selected country
   * @param {Object} country - Country feature with geometry
   */
  show(country) {
    this.clear();

    this.currentCountry = country;
    const geometry = country.geometry;

    if (!geometry || !geometry.coordinates) {
      console.warn('Country has no geometry:', country);
      return;
    }

    // Compute the centroid direction (unit vector) of the country on the sphere
    this.centroidDir = this.computeCentroidDirection(geometry);

    // Overlay radius just above the globe surface (5.0) so it sits flush
    const overlayRadius = 5.005;
    const material = new THREE.MeshBasicMaterial({
      color: 0xff3333,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });

    if (geometry.type === 'Polygon') {
      this.createPolygonOverlay(geometry.coordinates[0], overlayRadius, material);
    } else if (geometry.type === 'MultiPolygon') {
      geometry.coordinates.forEach(polygon => {
        this.createPolygonOverlay(polygon[0], overlayRadius, material);
      });
    }

    // Apply initial rotation so it faces the camera immediately
    this.update();
  }

  /**
   * Compute the centroid of the country as a unit direction vector on the sphere.
   * Averages all 3D vertex positions and normalises the result.
   * @param {Object} geometry - GeoJSON geometry
   * @returns {THREE.Vector3} unit vector
   */
  computeCentroidDirection(geometry) {
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
        sum.add(latLonToVector3(lat, lon, 1)); // unit sphere
        count++;
      });
    });

    return count > 0 ? sum.divideScalar(count).normalize() : new THREE.Vector3(0, 0, 1);
  }

  /**
   * Compute the local tangent frame at a point on the unit sphere.
   * Returns { right, up, forward } where forward = dir (outward normal),
   * up = geographic-north tangent, right = east tangent.
   * @param {THREE.Vector3} dir - unit vector (point on sphere)
   * @returns {{right: THREE.Vector3, up: THREE.Vector3, forward: THREE.Vector3}}
   */
  localFrame(dir) {
    const worldUp = new THREE.Vector3(0, 1, 0);
    const forward = dir.clone();

    // Project world-up onto the tangent plane to get the "north" tangent.
    // north = normalize( Y - (Y·dir) * dir )
    let up = worldUp.clone().addScaledVector(forward, -worldUp.dot(forward));
    if (up.lengthSq() < 1e-8) {
      // dir is near a pole — fall back to Z as reference
      up = new THREE.Vector3(0, 0, 1).addScaledVector(forward, -new THREE.Vector3(0, 0, 1).dot(forward));
    }
    up.normalize();

    const right = new THREE.Vector3().crossVectors(up, forward).normalize();

    return { right, up, forward };
  }

  /**
   * Create a single polygon overlay mesh
   * @param {Array} coordinates - Array of [lon, lat] pairs
   * @param {number} radius - Sphere radius for overlay
   * @param {THREE.Material} material - Material for the overlay
   */
  createPolygonOverlay(coordinates, radius, material) {
    if (coordinates.length < 3) return;

    // GeoJSON polygon rings are closed (last point === first point); remove the duplicate
    // before triangulating so earcut doesn't produce a degenerate zero-area triangle.
    const last = coordinates.length - 1;
    const isClosed = coordinates[0][0] === coordinates[last][0] &&
                     coordinates[0][1] === coordinates[last][1];
    const openCoords = isClosed ? coordinates.slice(0, -1) : coordinates;

    if (openCoords.length < 3) return;

    // Map open ring to 3D sphere positions
    const points3D = openCoords.map(([lon, lat]) => latLonToVector3(lat, lon, radius));

    // Triangulate in 2D lat/lon space using earcut (via THREE.ShapeUtils).
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

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.computeVertexNormals();

      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 999;
      this.overlayGroup.add(mesh);
    }

    // Border lines use the original closed ring so the outline is fully closed
    const linePoints = coordsToVectors(coordinates, radius);
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xff0000,
      linewidth: 2,
      transparent: true,
      opacity: 0.8,
      depthTest: false,
      depthWrite: false,
    });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    line.renderOrder = 999;
    this.overlayGroup.add(line);
  }

  /**
   * Clear the current overlay
   */
  clear() {
    while (this.overlayGroup.children.length > 0) {
      const child = this.overlayGroup.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      this.overlayGroup.remove(child);
    }

    this.currentCountry = null;
    this.centroidDir = null;
  }

  /**
   * Rotate the overlay group so:
   *  1. The country centroid faces the camera.
   *  2. Geographic north at the centroid maps to screen-up at the camera point.
   *  3. An optional user rotation is applied around the view axis.
   *
   * Call this every frame in the animation loop.
   */
  update() {
    if (!this.centroidDir) return;

    const cameraDir = this.camera.position.clone().normalize();

    // Build the tangent frame at the centroid (source) and camera-facing
    // point (target).  Both frames are {right, up, forward}.
    const srcFrame = this.localFrame(this.centroidDir);
    const tgtFrame = this.localFrame(cameraDir);

    // Source basis matrix (columns = right, up, forward)
    const srcMat = new THREE.Matrix4().makeBasis(
      srcFrame.right, srcFrame.up, srcFrame.forward
    );

    // Target basis matrix
    const tgtMat = new THREE.Matrix4().makeBasis(
      tgtFrame.right, tgtFrame.up, tgtFrame.forward
    );

    // Rotation = tgtMat * srcMat^T  (maps source frame → target frame)
    const srcMatInv = srcMat.clone().invert();
    const rotMat = tgtMat.clone().multiply(srcMatInv);

    // Optional user rotation around the view axis (cameraDir)
    if (this.userRotation !== 0) {
      const userRot = new THREE.Matrix4().makeRotationAxis(cameraDir, -this.userRotation);
      rotMat.premultiply(userRot);
    }

    this.overlayGroup.quaternion.setFromRotationMatrix(rotMat);
  }

  /** @returns {boolean} */
  hasOverlay() {
    return this.currentCountry !== null;
  }

  /** @returns {Object|null} */
  getCurrentCountry() {
    return this.currentCountry;
  }
}
