import * as THREE from 'three';

/**
 * Convert geographic coordinates (latitude, longitude) to 3D Cartesian coordinates
 * on a sphere surface.
 *
 * @param {number} lat - Latitude in degrees (-90 to 90)
 * @param {number} lon - Longitude in degrees (-180 to 180)
 * @param {number} radius - Sphere radius
 * @returns {THREE.Vector3} 3D position on sphere surface
 */
export function latLonToVector3(lat, lon, radius) {
  // Convert latitude to polar angle (0 at north pole, π at south pole)
  const phi = (90 - lat) * (Math.PI / 180);

  // Convert longitude to azimuthal angle (0 at prime meridian)
  const theta = (lon + 180) * (Math.PI / 180);

  // Spherical to Cartesian conversion
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);

  return new THREE.Vector3(x, y, z);
}

/**
 * Convert GeoJSON coordinates array to array of THREE.Vector3 points
 *
 * @param {Array} coordinates - Array of [lon, lat] pairs
 * @param {number} radius - Sphere radius
 * @returns {Array<THREE.Vector3>} Array of 3D points
 */
export function coordsToVectors(coordinates, radius) {
  return coordinates.map(([lon, lat]) => latLonToVector3(lat, lon, radius));
}
