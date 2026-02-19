import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { coordsToVectors, latLonToVector3 } from './utils/geoUtils.js';

/**
 * Manages the Three.js scene, globe rendering, and country visualization
 */
export class Globe {
  constructor(canvas) {
    this.canvas = canvas;
    this.countries = [];
    this.countryMeshes = new Map(); // Map country ID to meshes for raycasting
    this.countryColorMap = new Map(); // Map country name → THREE.Color for subdivision matching
    this.countryFillMeshes = [];     // Fill meshes for hover raycasting
    this.subdivisionHitMeshes = [];  // Transparent hit meshes for subdivision hover

    this.setupScene();
    this.setupLighting();
    this.setupGlobe();
    this.setupControls();
    this.setupRaycaster();

    this.animate();
  }

  setupScene() {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000011);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.z = 15;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    // Handle window resize
    window.addEventListener('resize', () => this.onWindowResize());
  }

  setupLighting() {
    // Ambient light for overall illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    // Directional light for depth
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 3, 5);
    this.scene.add(directionalLight);
  }

  setupGlobe() {
    // Create globe sphere
    const geometry = new THREE.SphereGeometry(5, 64, 64);
    const material = new THREE.MeshPhongMaterial({
      color: 0x2233aa,
      emissive: 0x112244,
      shininess: 10
    });

    this.globeMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.globeMesh);

    // Group to hold country border lines
    this.countryGroup = new THREE.Group();
    this.globeMesh.add(this.countryGroup);
  }

  setupControls() {
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 30;
  }

  setupRaycaster() {
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.mouseDownPos = { x: 0, y: 0 };

    this.canvas.addEventListener('mousedown', (event) => {
      this.mouseDownPos.x = event.clientX;
      this.mouseDownPos.y = event.clientY;
    });

    this.canvas.addEventListener('click', (event) => {
      const dx = event.clientX - this.mouseDownPos.x;
      const dy = event.clientY - this.mouseDownPos.y;
      if (dx * dx + dy * dy > 9) return; // ignore drags
      this.onCanvasClick(event);
    });

    this.canvas.addEventListener('mousemove', (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);

      // Subdivision hit meshes at r=5.015 are above country fills at r=5.01,
      // so they are always intersected first when present.
      const candidates = [...this.subdivisionHitMeshes, ...this.countryFillMeshes];
      const intersects = this.raycaster.intersectObjects(candidates, false);

      if (intersects.length > 0) {
        // Suppress hits on the far side of the globe: if the ray hits the
        // globe sphere before the country mesh, the country is occluded.
        const globeHits = this.raycaster.intersectObject(this.globeMesh, false);
        if (globeHits.length > 0 && globeHits[0].distance < intersects[0].distance) {
          if (this.onHover) this.onHover(null);
        } else {
          const userData = intersects[0].object.userData;
          const label = userData.type === 'subdivision'
            ? userData.name
            : (userData.countryName || String(userData.countryId));
          if (this.onHover) this.onHover({ label, x: event.clientX, y: event.clientY });
        }
      } else {
        if (this.onHover) this.onHover(null);
      }
    });
  }

  /**
   * Render country borders on the globe
   * @param {Array} countries - Array of country features
   */
  renderCountries(countries) {
    this.countries = countries;

    countries.forEach(country => {
      const meshes = this.createCountryBorders(country);
      this.countryMeshes.set(country.id, { country, meshes });
    });
  }

  /**
   * Create line geometries for country borders
   * @param {Object} country - Country feature with geometry
   * @returns {Array} Array of THREE.Line meshes
   */
  createCountryBorders(country) {
    const meshes = [];
    const geometry = country.geometry;

    if (!geometry || !geometry.coordinates) {
      return meshes;
    }

    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x000000,
      linewidth: 1,
      opacity: 0.8,
      transparent: true
    });

    // Deterministic non-blue color for this country, keyed by name for subdivision matching
    const nameKey = country.properties?.name || String(country.id);
    const fillColor = this.countryColor(nameKey);
    this.countryColorMap.set(nameKey, fillColor);
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: fillColor,
      side: THREE.DoubleSide
    });

    const rings = geometry.type === 'Polygon'
      ? [geometry.coordinates[0]]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates.map(p => p[0])
        : [];

    rings.forEach(ring => {
      // Create filled polygon
      const fillMesh = this.createFilledPolygon(ring, 5.01, fillMaterial);
      if (fillMesh) {
        fillMesh.userData = { countryId: country.id, countryName: nameKey };
        this.countryFillMeshes.push(fillMesh);
        this.countryGroup.add(fillMesh);
        meshes.push(fillMesh);
      }

      // Create border line
      const points = coordsToVectors(ring, 5.011);
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(lineGeometry, lineMaterial);
      line.userData = { countryId: country.id };
      this.countryGroup.add(line);
      meshes.push(line);
    });

    return meshes;
  }

  /**
   * Create a filled polygon mesh from a coordinate ring
   * @param {Array} coordinates - Array of [lon, lat] pairs
   * @param {number} radius - Sphere radius
   * @param {THREE.Material} material - Material for the mesh
   * @returns {THREE.Mesh|null}
   */
  createFilledPolygon(coordinates, radius, material, maxEdge = 0.3) {
    if (coordinates.length < 3) return null;

    // Remove closing duplicate point if present
    const last = coordinates.length - 1;
    const isClosed = coordinates[0][0] === coordinates[last][0] &&
                     coordinates[0][1] === coordinates[last][1];
    const openCoords = isClosed ? coordinates.slice(0, -1) : coordinates;

    if (openCoords.length < 3) return null;

    const points3D = openCoords.map(([lon, lat]) => latLonToVector3(lat, lon, radius));

    // Project 3D points onto a tangent plane at their centroid for 2D triangulation.
    // This avoids the lon/lat wrapping problem that breaks Antarctica and other
    // polar polygons whose coordinates span the full [-180, 180] longitude range.
    const centroid = new THREE.Vector3();
    for (const p of points3D) centroid.add(p);
    centroid.divideScalar(points3D.length).normalize();

    const refUp = Math.abs(centroid.y) < 0.99
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
    const right = new THREE.Vector3().crossVectors(centroid, refUp).normalize();
    const forward = new THREE.Vector3().crossVectors(right, centroid).normalize();

    const points2D = points3D.map(p =>
      new THREE.Vector2(p.dot(right), p.dot(forward))
    );

    let triangles;
    try {
      triangles = THREE.ShapeUtils.triangulateShape(points2D, []);
    } catch (e) {
      return null;
    }

    if (triangles.length === 0) return null;

    // Subdivide triangles so flat faces follow the sphere curvature.
    // Without this, large triangles sag below the sphere and the ocean shows through.
    const vertices = [];
    for (const [a, b, c] of triangles) {
      this.subdivideTriangle(points3D[a], points3D[b], points3D[c], radius, maxEdge, vertices);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.computeVertexNormals();

    return new THREE.Mesh(geo, material);
  }

  /**
   * Recursively subdivide a triangle, projecting midpoints onto the sphere
   * so the mesh follows curvature instead of cutting through the globe.
   */
  subdivideTriangle(a, b, c, radius, maxEdge, out) {
    const ab = a.distanceTo(b);
    const bc = b.distanceTo(c);
    const ca = c.distanceTo(a);

    if (ab <= maxEdge && bc <= maxEdge && ca <= maxEdge) {
      out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      return;
    }

    // Split the longest edge and project the midpoint onto the sphere
    const mid = new THREE.Vector3();
    if (ab >= bc && ab >= ca) {
      mid.addVectors(a, b).multiplyScalar(0.5).setLength(radius);
      this.subdivideTriangle(a, mid, c, radius, maxEdge, out);
      this.subdivideTriangle(mid, b, c, radius, maxEdge, out);
    } else if (bc >= ab && bc >= ca) {
      mid.addVectors(b, c).multiplyScalar(0.5).setLength(radius);
      this.subdivideTriangle(a, b, mid, radius, maxEdge, out);
      this.subdivideTriangle(a, mid, c, radius, maxEdge, out);
    } else {
      mid.addVectors(c, a).multiplyScalar(0.5).setLength(radius);
      this.subdivideTriangle(a, b, mid, radius, maxEdge, out);
      this.subdivideTriangle(mid, b, c, radius, maxEdge, out);
    }
  }

  /**
   * Generate a deterministic non-blue color from a country ID
   * @param {string|number} id - Country ID
   * @returns {THREE.Color}
   */
  countryColor(id) {
    // Simple string hash to get a stable number from the country ID
    let hash = 0;
    const str = String(id);
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    // Map hash to hue 0-280, then skip the blue range (180-260)
    let hue = ((hash >>> 0) % 280);
    if (hue >= 180) hue += 80;
    return new THREE.Color().setHSL(hue / 360, 0.7, 0.5);
  }

  /**
   * Handle canvas click for country selection
   */
  onCanvasClick(event) {
    // Calculate mouse position in normalized device coordinates
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update raycaster
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Check for intersections with country lines
    const allLines = [];
    this.countryMeshes.forEach(({ meshes }) => {
      allLines.push(...meshes);
    });

    const intersects = this.raycaster.intersectObjects(allLines, false);

    if (intersects.length > 0) {
      // Suppress clicks on the far side of the globe
      const globeHits = this.raycaster.intersectObject(this.globeMesh, false);
      if (globeHits.length > 0 && globeHits[0].distance < intersects[0].distance) {
        return;
      }

      const countryId = intersects[0].object.userData.countryId;
      const countryData = this.countryMeshes.get(countryId);

      if (countryData && this.onCountryClick) {
        this.onCountryClick(countryData.country);
      }
    }
  }

  /**
   * Set callback for country click events
   * @param {Function} callback - Function to call with country data
   */
  setCountryClickHandler(callback) {
    this.onCountryClick = callback;
  }

  /**
   * Set callback for hover events
   * @param {Function} callback - Called with { label, x, y } on hover, null when leaving
   */
  setHoverHandler(callback) {
    this.onHover = callback;
  }

  /**
   * Render subdivision (admin1) borders on the globe
   * @param {Array} features - Array of subdivision GeoJSON features
   */
  renderSubdivisions(features) {
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x222222,
      linewidth: 1,
      opacity: 0.7,
      transparent: true
    });

    features.forEach(feature => {
      const geometry = feature.geometry;
      if (!geometry || !geometry.coordinates) return;

      const adminName = feature.properties?.admin;
      const adm0_a3 = feature.properties?.adm0_a3;
      const color = this.countryColorMap.get(adminName) || this.countryColor(adm0_a3 || adminName || '');

      const hitMaterial = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide
      });

      const rings = geometry.type === 'Polygon'
        ? [geometry.coordinates[0]]
        : geometry.type === 'MultiPolygon'
          ? geometry.coordinates.map(p => p[0])
          : [];

      rings.forEach(ring => {
        // Subdivision border lines just above country borders
        const points = coordsToVectors(ring, 5.012);
        const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(lineGeometry, lineMaterial);
        this.countryGroup.add(line);

        // Transparent hit mesh for hover raycasting (coarser subdivision for performance)
        const hitMesh = this.createFilledPolygon(ring, 5.015, hitMaterial, 0.5);
        if (hitMesh) {
          hitMesh.userData = {
            type: 'subdivision',
            name: feature.properties?.name,
            countryName: feature.properties?.admin || feature.properties?.sovereign
          };
          this.subdivisionHitMeshes.push(hitMesh);
          this.countryGroup.add(hitMesh);
        }
      });
    });
  }

  /**
   * Handle window resize
   */
  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * Animation loop
   */
  animate() {
    requestAnimationFrame(() => this.animate());

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Get the scene for adding overlay groups
   */
  getScene() {
    return this.scene;
  }

  /**
   * Get the camera for overlay centering
   */
  getCamera() {
    return this.camera;
  }
}
