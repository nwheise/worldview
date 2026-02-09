/**
 * Manages the country selection UI dropdown
 */
export class CountrySelector {
  constructor(selectElement, clearButton, countryLoader) {
    this.selectElement = selectElement;
    this.clearButton = clearButton;
    this.countryLoader = countryLoader;
    this.onSelectCallback = null;
    this.onClearCallback = null;

    this.setupEventListeners();
  }

  /**
   * Populate the dropdown with country names
   */
  populate() {
    const countries = this.countryLoader.getCountryList();

    // Clear existing options except the first placeholder
    while (this.selectElement.options.length > 1) {
      this.selectElement.remove(1);
    }

    // Add country options
    countries.forEach(({ id, name }) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = name;
      this.selectElement.appendChild(option);
    });
  }

  /**
   * Setup event listeners for selection and clear
   */
  setupEventListeners() {
    this.selectElement.addEventListener('change', () => {
      const countryId = this.selectElement.value;

      if (countryId && this.onSelectCallback) {
        const country = this.countryLoader.getCountryById(countryId);
        if (country) {
          this.onSelectCallback(country);
          this.clearButton.disabled = false;
        }
      }
    });

    this.clearButton.addEventListener('click', () => {
      if (this.onClearCallback) {
        this.onClearCallback();
      }
      this.reset();
    });
  }

  /**
   * Set the callback for country selection
   * @param {Function} callback - Function to call with selected country
   */
  onSelect(callback) {
    this.onSelectCallback = callback;
  }

  /**
   * Set the callback for clearing overlay
   * @param {Function} callback - Function to call when clear is clicked
   */
  onClear(callback) {
    this.onClearCallback = callback;
  }

  /**
   * Reset the selector to default state
   */
  reset() {
    this.selectElement.value = '';
    this.clearButton.disabled = true;
  }

  /**
   * Enable the clear button
   */
  enableClearButton() {
    this.clearButton.disabled = false;
  }

  /**
   * Disable the clear button
   */
  disableClearButton() {
    this.clearButton.disabled = true;
  }
}
