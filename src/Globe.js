import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { coordsToVectors } from './utils/geoUtils.js';

/**
 * Manages the Three.js scene, globe rendering, and country visualization
 */
export class Globe {
  constructor(canvas) {
    this.canvas = canvas;
    this.countries = [];
    this.countryMeshes = new Map(); // Map country ID to meshes for raycasting

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

    this.canvas.addEventListener('click', (event) => this.onCanvasClick(event));
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
      color: 0xffffff,
      linewidth: 1,
      opacity: 0.8,
      transparent: true
    });

    if (geometry.type === 'Polygon') {
      // Single polygon - use outer ring (first coordinate array)
      const points = coordsToVectors(geometry.coordinates[0], 5);
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(lineGeometry, lineMaterial);
      line.userData = { countryId: country.id };
      this.countryGroup.add(line);
      meshes.push(line);
    } else if (geometry.type === 'MultiPolygon') {
      // Multiple polygons - iterate through each
      geometry.coordinates.forEach(polygon => {
        const points = coordsToVectors(polygon[0], 5);
        const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(lineGeometry, lineMaterial);
        line.userData = { countryId: country.id };
        this.countryGroup.add(line);
        meshes.push(line);
      });
    }

    return meshes;
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
}
