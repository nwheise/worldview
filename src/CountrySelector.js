/**
 * Manages a searchable country selector: text input with a filtered dropdown list.
 */
export class CountrySelector {
  constructor(searchInput, listElement, clearButton, countryLoader) {
    this.searchInput = searchInput;
    this.listElement = listElement;
    this.clearButton = clearButton;
    this.countryLoader = countryLoader;
    this.countries = [];
    this.onSelectCallback = null;
    this.onClearCallback = null;

    this.setupEventListeners();
  }

  /**
   * Populate the internal country list from the loader.
   */
  populate() {
    this.countries = this.countryLoader.getCountryList();
  }

  /**
   * Render a (possibly filtered) list of countries into the dropdown.
   */
  renderList(countries) {
    this.listElement.innerHTML = '';
    countries.forEach(({ id, name }) => {
      const item = document.createElement('div');
      item.className = 'country-item';
      item.textContent = name;
      item.addEventListener('mousedown', (e) => {
        // mousedown (not click) so it fires before the input's blur
        e.preventDefault();
        this.selectCountry(id, name);
      });
      this.listElement.appendChild(item);
    });
  }

  selectCountry(id, name) {
    this.searchInput.value = name;
    this.listElement.classList.add('hidden');
    this.clearButton.disabled = false;

    if (this.onSelectCallback) {
      const country = this.countryLoader.getCountryById(id);
      if (country) this.onSelectCallback(country);
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
      ? this.countries.filter(c => c.name.toLowerCase().includes(q))
      : this.countries;
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
