import * as THREE from 'three';
import { coordsToVectors } from './utils/geoUtils.js';

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
    const points = coordsToVectors(coordinates, radius);

    if (points.length < 3) {
      return; // Need at least 3 points for a polygon
    }

    // Create a shape from the points
    // We'll use a simple approach: create triangles from the first point to each edge
    const vertices = [];
    const firstPoint = points[0];

    for (let i = 1; i < points.length - 1; i++) {
      vertices.push(firstPoint.x, firstPoint.y, firstPoint.z);
      vertices.push(points[i].x, points[i].y, points[i].z);
      vertices.push(points[i + 1].x, points[i + 1].y, points[i + 1].z);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, material);
    this.overlayGroup.add(mesh);

    // Also add border lines for clarity
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
