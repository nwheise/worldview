/**
 * Loads and parses Natural Earth admin1 (states/provinces) GeoJSON data.
 */
export class SubdivisionLoader {
  constructor() {
    this.subdivisions = [];
  }

  /**
   * Fetch admin1 GeoJSON from CDN.
   * Uses Natural Earth 50m admin1 data (~2.3 MB uncompressed).
   */
  async load() {
    const response = await fetch(
      `${import.meta.env.BASE_URL}data/ne_50m_admin_1_states_provinces.geojson`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch admin1 data: ${response.status}`);
    }

    const data = await response.json();
    this.subdivisions = data.features;
  }

  /**
   * Get sorted list of subdivisions with display names.
   * @returns {Array<Object>} Array of {id, name, displayName} sorted by name
   */
  getSubdivisionList() {
    return this.subdivisions
      .filter(f => f.properties?.name)
      .map((f, i) => {
        const country = f.properties.admin || f.properties.sovereign || 'Region';
        return {
          id: i,
          name: f.properties.name,
          displayName: `${f.properties.name} (${country})`,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get subdivision GeoJSON feature by index.
   * @param {number} id - Index into this.subdivisions
   * @returns {Object|null} GeoJSON Feature or null
   */
  getSubdivisionById(id) {
    return this.subdivisions[id] || null;
  }
}
