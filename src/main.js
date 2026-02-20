import * as THREE from 'three';
import { Globe } from './Globe.js';
import { CountryLoader } from './CountryLoader.js';
import { SubdivisionLoader } from './SubdivisionLoader.js';
import { CountryOverlay } from './CountryOverlay.js';
import { CountrySelector } from './CountrySelector.js';

// Hex colours matching CountryOverlay OVERLAY_COLORS — used for the dot in the UI
const SLOT_CSS_COLORS = ['#ff3333', '#4488ff', '#33cc66'];

/**
 * Main application entry point
 */
class TheTrueSize3DApp {
  constructor() {
    this.canvas = document.getElementById('globe-canvas');
    this.loadingElement = document.getElementById('loading');

    // Compass elements
    this.compassControl = document.getElementById('compass-control');
    this.compassSvg = document.getElementById('compass');
    this.compassOuter = document.getElementById('compass-outer');
    this.compassRotation = 0; // radians

    // Multi-slot state
    this.overlaySlots = []; // { slotIndex, selector, rowEl }
    this.allItems = [];     // unified country + subdivision list (set after load)

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

      this.allItems = [...countryItems, ...subdivisionItems];

      this.globe.renderCountries(this.countryLoader.countries);

      if (this.subdivisionLoader.subdivisions.length > 0) {
        this.globe.renderSubdivisions(this.subdivisionLoader.subdivisions);
      }

      // Create the first slot automatically
      this.addOverlaySlot();

      this.setupTooltip();
      this.setupCompass();
      this.setupOverlayDrag();
      this.setupHelpPanel();
      this.startOverlayUpdate();

      this.hideLoading();
    } catch (error) {
      console.error('Failed to initialize application:', error);
      this.showError('Failed to load country data. Please refresh the page.');
    }
  }

  // ---------------------------------------------------------------------------
  // Slot management
  // ---------------------------------------------------------------------------

  /**
   * Adds a new overlay slot (up to 3).  Creates the DOM row, CountrySelector,
   * and wires up callbacks.
   */
  addOverlaySlot() {
    const slotIndex = this.overlaySlots.length; // 0, 1, or 2
    if (slotIndex >= 3) return;

    // --- Build DOM row ---
    const row = document.createElement('div');
    row.className = 'overlay-slot';
    row.dataset.slotIndex = slotIndex;

    const dot = document.createElement('span');
    dot.className = 'overlay-color-dot';
    dot.style.background = SLOT_CSS_COLORS[slotIndex];

    const searchWrapper = document.createElement('div');
    searchWrapper.className = 'slot-search-wrapper';

    const input = document.createElement('input');
    input.className = 'slot-search';
    input.type = 'text';
    input.placeholder = 'Search countries & regions…';
    input.autocomplete = 'off';

    const list = document.createElement('div');
    list.className = 'slot-list hidden';

    searchWrapper.appendChild(input);
    searchWrapper.appendChild(list);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'slot-clear-btn';
    clearBtn.textContent = '×';
    clearBtn.title = 'Remove this overlay';

    row.appendChild(dot);
    row.appendChild(searchWrapper);
    row.appendChild(clearBtn);

    document.getElementById('overlay-slots').appendChild(row);

    // --- CountrySelector ---
    const selector = new CountrySelector(input, list, clearBtn);
    selector.setItems(this.allItems);

    selector.onSelect((feature) => {
      this.overlay.show(feature, slotIndex);
      // Show compass on first overlay
      this.compassControl.classList.remove('hidden');
    });

    selector.onClear(() => {
      this.overlay.clear(slotIndex);
      this.removeOverlaySlot(slotIndex);
    });

    this.overlaySlots.push({ slotIndex, selector, rowEl: row });

    // Show/hide "+ Add Overlay" button
    this._updateAddButton();
  }

  /**
   * Remove a slot from the UI and overlay.
   * @param {number} slotIndex
   */
  removeOverlaySlot(slotIndex) {
    const idx = this.overlaySlots.findIndex(s => s.slotIndex === slotIndex);
    if (idx === -1) return;

    const { rowEl } = this.overlaySlots[idx];
    rowEl.remove();
    this.overlaySlots.splice(idx, 1);

    this._updateAddButton();

    if (!this.overlay.hasAnyOverlay()) {
      this.compassControl.classList.add('hidden');
      this.compassRotation = 0;
      this.compassOuter.setAttribute('transform', 'rotate(0)');
      this.overlay.setRotation(0);
    }
  }

  /** Show + Add Overlay if < 3 slots; hide it at 3. */
  _updateAddButton() {
    const btn = document.getElementById('add-overlay-btn');
    if (this.overlaySlots.length >= 3) {
      btn.classList.add('hidden');
    } else {
      btn.classList.remove('hidden');
    }
  }

  // ---------------------------------------------------------------------------
  // Event setup
  // ---------------------------------------------------------------------------

  setupTooltip() {
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

    // Wire "+ Add Overlay" button
    document.getElementById('add-overlay-btn').addEventListener('click', () => {
      this.addOverlaySlot();
    });
  }

  /**
   * Draggable compass: click-and-drag rotates the outer ring and all overlays.
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

  /**
   * Click-and-drag an overlay region to reposition it on the globe.
   * Intercepts mousedown before OrbitControls when the cursor is over an overlay.
   */
  setupOverlayDrag() {
    this.dragRaycaster = new THREE.Raycaster();
    this.draggingSlot = -1;

    const getMouseNDC = (clientX, clientY) => {
      const rect = this.canvas.getBoundingClientRect();
      return new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
    };

    // --- Mouse ---
    this.canvas.addEventListener('mousedown', (e) => {
      const meshes = this.overlay.getOverlayMeshes();
      if (meshes.length === 0) return;

      this.dragRaycaster.setFromCamera(getMouseNDC(e.clientX, e.clientY), this.globe.camera);
      const hits = this.dragRaycaster.intersectObjects(meshes, false);
      if (hits.length > 0) {
        this.draggingSlot = hits[0].object.userData.slotIndex;
        this.globe.controls.enabled = false;
        this.canvas.style.cursor = 'grabbing';
        e.stopPropagation();
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.draggingSlot !== -1) {
        // Pass NDC coords to overlay; it re-projects against the globe sphere
        // internally each frame so the overlay tracks screen position.
        this.overlay.setDisplayNDC(this.draggingSlot, getMouseNDC(e.clientX, e.clientY));
        return;
      }

      // Hover cursor feedback
      const meshes = this.overlay.getOverlayMeshes();
      if (meshes.length > 0) {
        this.dragRaycaster.setFromCamera(getMouseNDC(e.clientX, e.clientY), this.globe.camera);
        const hits = this.dragRaycaster.intersectObjects(meshes, false);
        this.canvas.style.cursor = hits.length > 0 ? 'grab' : '';
      } else {
        this.canvas.style.cursor = '';
      }
    });

    document.addEventListener('mouseup', () => {
      if (this.draggingSlot !== -1) {
        this.draggingSlot = -1;
        this.globe.controls.enabled = true;
        this.canvas.style.cursor = '';
      }
    });

    // --- Touch ---
    this.canvas.addEventListener('touchstart', (e) => {
      const meshes = this.overlay.getOverlayMeshes();
      if (meshes.length === 0) return;

      const t = e.touches[0];
      this.dragRaycaster.setFromCamera(getMouseNDC(t.clientX, t.clientY), this.globe.camera);
      const hits = this.dragRaycaster.intersectObjects(meshes, false);
      if (hits.length > 0) {
        this.draggingSlot = hits[0].object.userData.slotIndex;
        this.globe.controls.enabled = false;
        e.stopPropagation();
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      if (this.draggingSlot === -1) return;
      const t = e.touches[0];
      this.overlay.setDisplayNDC(this.draggingSlot, getMouseNDC(t.clientX, t.clientY));
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchend', () => {
      if (this.draggingSlot !== -1) {
        this.draggingSlot = -1;
        this.globe.controls.enabled = true;
      }
    });
  }

  setupHelpPanel() {
    const helpBtn = document.getElementById('help-btn');
    const helpPanel = document.getElementById('help-panel');
    helpBtn.addEventListener('click', () => {
      helpPanel.classList.toggle('hidden');
    });

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
      if (!helpPanel.classList.contains('hidden') &&
          !helpPanel.contains(e.target) &&
          e.target !== helpBtn) {
        helpPanel.classList.add('hidden');
      }
    });
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
  document.addEventListener('DOMContentLoaded', () => new TheTrueSize3DApp());
} else {
  new TheTrueSize3DApp();
}
