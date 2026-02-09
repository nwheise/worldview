import { Globe } from './Globe.js';
import { CountryLoader } from './CountryLoader.js';
import { CountryOverlay } from './CountryOverlay.js';
import { CountrySelector } from './CountrySelector.js';

/**
 * Main application entry point
 */
class WorldViewApp {
  constructor() {
    this.canvas = document.getElementById('globe-canvas');
    this.selectElement = document.getElementById('country-select');
    this.clearButton = document.getElementById('clear-btn');
    this.loadingElement = document.getElementById('loading');

    this.init();
  }

  async init() {
    try {
      // Show loading indicator
      this.showLoading();

      // Initialize globe
      this.globe = new Globe(this.canvas);

      // Load country data
      this.countryLoader = new CountryLoader();
      await this.countryLoader.load();

      // Initialize overlay system
      this.overlay = new CountryOverlay(this.globe.getScene());

      // Setup country selector UI
      this.selector = new CountrySelector(
        this.selectElement,
        this.clearButton,
        this.countryLoader
      );
      this.selector.populate();

      // Render countries on globe
      this.globe.renderCountries(this.countryLoader.countries);

      // Setup event handlers
      this.setupEventHandlers();

      // Add overlay update to animation loop
      this.startOverlayUpdate();

      // Hide loading indicator
      this.hideLoading();

    } catch (error) {
      console.error('Failed to initialize application:', error);
      this.showError('Failed to load country data. Please refresh the page.');
    }
  }

  setupEventHandlers() {
    // Handle country selection from dropdown
    this.selector.onSelect((country) => {
      this.showCountryOverlay(country);
    });

    // Handle clear button
    this.selector.onClear(() => {
      this.overlay.clear();
    });

    // Handle country click on globe
    this.globe.setCountryClickHandler((country) => {
      this.showCountryOverlay(country);
    });
  }

  showCountryOverlay(country) {
    this.overlay.show(country);
    this.selector.enableClearButton();

    // Update dropdown to match if clicked on globe
    this.selectElement.value = country.id;
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
