import { Globe } from './Globe.js';
import { CountryLoader } from './CountryLoader.js';
import { SubdivisionLoader } from './SubdivisionLoader.js';
import { CountryOverlay } from './CountryOverlay.js';
import { CountrySelector } from './CountrySelector.js';

/**
 * Main application entry point
 */
class WorldViewApp {
  constructor() {
    this.canvas = document.getElementById('globe-canvas');
    this.loadingElement = document.getElementById('loading');

    // Compass elements
    this.compassControl = document.getElementById('compass-control');
    this.compassSvg = document.getElementById('compass');
    this.compassOuter = document.getElementById('compass-outer');
    this.compassRotation = 0; // radians

    this.init();
  }

  async init() {
    try {
      this.showLoading();

      this.globe = new Globe(this.canvas);

      this.countryLoader = new CountryLoader();
      this.subdivisionLoader = new SubdivisionLoader();

      await Promise.all([
        this.countryLoader.load(),
        this.subdivisionLoader.load().catch(() => {
          console.warn('Subdivision data unavailable; falling back to countries only.');
        }),
      ]);

      this.overlay = new CountryOverlay(this.globe.getScene(), this.globe.getCamera());

      // Build unified items list: countries + subdivisions
      const countryItems = this.countryLoader.getCountryList().map(({ id, name }) => ({
        id: `c-${id}`,
        name,
        displayName: name,
        getFeature: () => this.countryLoader.getCountryById(id),
      }));

      const subdivisionItems = this.subdivisionLoader.getSubdivisionList().map(({ id, name, displayName }) => ({
        id: `s-${id}`,
        name,
        displayName,
        getFeature: () => this.subdivisionLoader.getSubdivisionById(id),
      }));

      this.selector = new CountrySelector(
        document.getElementById('country-search'),
        document.getElementById('country-list'),
        document.getElementById('clear-btn')
      );
      this.selector.setItems([...countryItems, ...subdivisionItems]);

      this.globe.renderCountries(this.countryLoader.countries);

      if (this.subdivisionLoader.subdivisions.length > 0) {
        this.globe.renderSubdivisions(this.subdivisionLoader.subdivisions);
      }

      this.setupEventHandlers();
      this.setupCompass();
      this.startOverlayUpdate();

      this.hideLoading();
    } catch (error) {
      console.error('Failed to initialize application:', error);
      this.showError('Failed to load country data. Please refresh the page.');
    }
  }

  setupEventHandlers() {
    this.selector.onSelect((feature) => {
      this.showOverlay(feature);
    });

    this.selector.onClear(() => {
      this.overlay.clear();
      this.compassControl.classList.add('hidden');
      this.compassRotation = 0;
      this.compassOuter.setAttribute('transform', 'rotate(0)');
    });

    this.tooltip = document.getElementById('tooltip');
    this.globe.setHoverHandler((hit) => {
      if (hit) {
        this.tooltip.textContent = hit.label;
        this.tooltip.style.left = (hit.x + 14) + 'px';
        this.tooltip.style.top  = (hit.y + 14) + 'px';
        this.tooltip.classList.add('visible');
      } else {
        this.tooltip.classList.remove('visible');
      }
    });
  }

  /**
   * Draggable compass: click-and-drag rotates the outer ring and the overlay.
   * Supports both mouse and touch.
   */
  setupCompass() {
    let dragging = false;
    let dragStartAngle = 0;
    let rotationAtStart = 0;

    const getPointerAngle = (clientX, clientY) => {
      const rect = this.compassSvg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      // Angle measured clockwise from top (north)
      return Math.atan2(clientX - cx, -(clientY - cy));
    };

    const onStart = (clientX, clientY) => {
      dragging = true;
      dragStartAngle = getPointerAngle(clientX, clientY);
      rotationAtStart = this.compassRotation;
    };

    const onMove = (clientX, clientY) => {
      if (!dragging) return;
      const angle = getPointerAngle(clientX, clientY);
      this.compassRotation = rotationAtStart + (angle - dragStartAngle);
      const deg = this.compassRotation * 180 / Math.PI;
      this.compassOuter.setAttribute('transform', `rotate(${deg})`);
      this.overlay.setRotation(this.compassRotation);
    };

    const onEnd = () => { dragging = false; };

    // Mouse
    this.compassSvg.addEventListener('mousedown', (e) => {
      onStart(e.clientX, e.clientY);
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    document.addEventListener('mouseup', onEnd);

    // Touch
    this.compassSvg.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      onStart(t.clientX, t.clientY);
      e.preventDefault();
    });
    document.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      onMove(t.clientX, t.clientY);
    });
    document.addEventListener('touchend', onEnd);
  }

  showOverlay(feature) {
    this.overlay.show(feature);
    this.selector.enableClearButton();

    // Show compass and reset rotation
    this.compassControl.classList.remove('hidden');
    this.compassRotation = 0;
    this.compassOuter.setAttribute('transform', 'rotate(0)');
    this.overlay.setRotation(0);
  }

  startOverlayUpdate() {
    const updateOverlay = () => {
      this.overlay.update();
      requestAnimationFrame(updateOverlay);
    };
    updateOverlay();
  }

  showLoading() {
    this.loadingElement.classList.remove('hidden');
  }

  hideLoading() {
    this.loadingElement.classList.add('hidden');
  }

  showError(message) {
    this.loadingElement.textContent = message;
    this.loadingElement.classList.remove('hidden');
    this.loadingElement.style.color = '#ff3333';
  }
}

// Initialize the application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new WorldViewApp());
} else {
  new WorldViewApp();
}
