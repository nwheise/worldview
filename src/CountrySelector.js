/**
 * Manages a searchable selector for countries and subdivisions.
 * Each item has: { id, name, displayName, getFeature }
 */
export class CountrySelector {
  constructor(searchInput, listElement, clearButton) {
    this.searchInput = searchInput;
    this.listElement = listElement;
    this.clearButton = clearButton;
    this.items = [];
    this.onSelectCallback = null;
    this.onClearCallback = null;

    this.setupEventListeners();
  }

  /**
   * Replace the full items list.
   * @param {Array<{id, name, displayName, getFeature}>} items
   */
  setItems(items) {
    this.items = items;
  }

  /**
   * Render a (possibly filtered) list of items into the dropdown.
   */
  renderList(items) {
    this.listElement.innerHTML = '';
    items.forEach((item) => {
      const el = document.createElement('div');
      el.className = 'country-item';
      el.textContent = item.displayName;
      el.addEventListener('mousedown', (e) => {
        // mousedown (not click) so it fires before the input's blur
        e.preventDefault();
        this.selectItem(item);
      });
      this.listElement.appendChild(el);
    });
  }

  selectItem(item) {
    this.searchInput.value = item.name;
    this.listElement.classList.add('hidden');
    this.clearButton.disabled = false;

    if (this.onSelectCallback) {
      const feature = item.getFeature();
      if (feature) this.onSelectCallback(feature);
    }
  }

  setupEventListeners() {
    this.searchInput.addEventListener('focus', () => {
      this.filterAndShow(this.searchInput.value);
    });

    this.searchInput.addEventListener('input', () => {
      this.filterAndShow(this.searchInput.value);
    });

    this.searchInput.addEventListener('blur', () => {
      // Small delay so mousedown on list item fires first
      setTimeout(() => this.listElement.classList.add('hidden'), 150);
    });

    this.clearButton.addEventListener('click', () => {
      if (this.onClearCallback) this.onClearCallback();
      this.reset();
    });
  }

  filterAndShow(query) {
    const q = query.toLowerCase().trim();
    const filtered = q
      ? this.items.filter(item =>
          item.name.toLowerCase().includes(q) ||
          item.displayName.toLowerCase().includes(q)
        )
      : this.items;
    this.renderList(filtered);
    if (filtered.length > 0) {
      this.listElement.classList.remove('hidden');
    } else {
      this.listElement.classList.add('hidden');
    }
  }

  onSelect(callback) { this.onSelectCallback = callback; }
  onClear(callback) { this.onClearCallback = callback; }

  reset() {
    this.searchInput.value = '';
    this.clearButton.disabled = true;
    this.listElement.classList.add('hidden');
  }

  enableClearButton() { this.clearButton.disabled = false; }
  disableClearButton() { this.clearButton.disabled = true; }
}
