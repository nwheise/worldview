import * as THREE from 'three';
import { latLonToVector3, coordsToVectors } from './utils/geoUtils.js';

/**
 * Manages country overlay visualization with fixed positioning
 */
export class CountryOverlay {
  constructor(scene) {
    this.scene = scene;
    this.overlayGroup = new THREE.Group();
    this.fixedRotation = null;
    this.currentCountry = null;

    this.scene.add(this.overlayGroup);
  }

  /**
   * Create and display an overlay for the selected country
   * @param {Object} country - Country feature with geometry
   */
  show(country) {
    // Clear any existing overlay
    this.clear();

    this.currentCountry = country;
    const geometry = country.geometry;

    if (!geometry || !geometry.coordinates) {
      console.warn('Country has no geometry:', country);
      return;
    }

    // Store the current rotation as fixed
    this.fixedRotation = this.overlayGroup.rotation.clone();

    // Create overlay meshes at larger radius for visibility
    const overlayRadius = 5.2;
    const material = new THREE.MeshBasicMaterial({
      color: 0xff3333,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide
    });

    if (geometry.type === 'Polygon') {
      this.createPolygonOverlay(geometry.coordinates[0], overlayRadius, material);
    } else if (geometry.type === 'MultiPolygon') {
      geometry.coordinates.forEach(polygon => {
        this.createPolygonOverlay(polygon[0], overlayRadius, material);
      });
    }
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
    // Fan triangulation only works for convex polygons; countries are almost always
    // concave, which caused the "lines jutting out" artifact.
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
      this.overlayGroup.add(mesh);
    }

    // Border lines use the original closed ring so the outline is fully closed
    const linePoints = coordsToVectors(coordinates, radius);
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xff0000,
      linewidth: 2,
      transparent: true,
      opacity: 0.8
    });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    this.overlayGroup.add(line);
  }

  /**
   * Clear the current overlay
   */
  clear() {
    // Remove all children from overlay group
    while (this.overlayGroup.children.length > 0) {
      const child = this.overlayGroup.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      this.overlayGroup.remove(child);
    }

    this.currentCountry = null;
    this.fixedRotation = null;
  }

  /**
   * Update overlay rotation to keep it fixed in view
   * Call this in the animation loop
   */
  update() {
    if (this.fixedRotation) {
      this.overlayGroup.rotation.copy(this.fixedRotation);
    }
  }

  /**
   * Check if an overlay is currently displayed
   * @returns {boolean}
   */
  hasOverlay() {
    return this.currentCountry !== null;
  }

  /**
   * Get the currently displayed country
   * @returns {Object|null}
   */
  getCurrentCountry() {
    return this.currentCountry;
  }
}
