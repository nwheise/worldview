/**
 * Loads and parses GeoJSON country data from Natural Earth CDN
 */
export class CountryLoader {
  constructor() {
    this.countries = [];
    this.geoData = null;
  }

  /**
   * Fetch country data from Natural Earth CDN
   * @returns {Promise<Array>} Array of country features with geometries
   */
  async load() {
    try {
      const response = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');

      if (!response.ok) {
        throw new Error(`Failed to fetch country data: ${response.status}`);
      }

      const topoData = await response.json();

      // Convert TopoJSON to GeoJSON features
      this.geoData = this.parseTopoJSON(topoData);
      this.countries = this.geoData.features;

      return this.countries;
    } catch (error) {
      console.error('Error loading country data:', error);
      throw error;
    }
  }

  /**
   * Basic TopoJSON to GeoJSON converter
   * @param {Object} topology - TopoJSON topology object
   * @returns {Object} GeoJSON FeatureCollection
   */
  parseTopoJSON(topology) {
    const { objects, arcs } = topology;
    const countries = objects.countries;

    const features = countries.geometries.map(geom => {
      return {
        type: 'Feature',
        id: geom.id,
        properties: geom.properties || {},
        geometry: this.topoGeometryToGeoJSON(geom, arcs)
      };
    });

    return {
      type: 'FeatureCollection',
      features
    };
  }

  /**
   * Convert TopoJSON geometry to GeoJSON geometry
   */
  topoGeometryToGeoJSON(geom, arcs) {
    if (geom.type === 'Polygon') {
      return {
        type: 'Polygon',
        coordinates: geom.arcs.map(arc => this.stitchArcs(arc, arcs))
      };
    } else if (geom.type === 'MultiPolygon') {
      return {
        type: 'MultiPolygon',
        coordinates: geom.arcs.map(polygon =>
          polygon.map(arc => this.stitchArcs(arc, arcs))
        )
      };
    }
    return geom;
  }

  /**
   * Stitch together arc indices into coordinate arrays
   */
  stitchArcs(arcIndices, arcs) {
    const coordinates = [];

    arcIndices.forEach(arcIndex => {
      const arc = arcs[arcIndex < 0 ? ~arcIndex : arcIndex];
      const points = arcIndex < 0 ? arc.slice().reverse() : arc.slice();

      points.forEach(point => {
        coordinates.push(point);
      });
    });

    return coordinates;
  }

  /**
   * Get sorted list of country names
   * @returns {Array<Object>} Array of {id, name} objects sorted by name
   */
  getCountryList() {
    return this.countries
      .map(feature => ({
        id: feature.id,
        name: feature.properties.name || `Country ${feature.id}`
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get country feature by ID
   * @param {string|number} id - Country ID
   * @returns {Object|null} Country feature or null
   */
  getCountryById(id) {
    return this.countries.find(c => c.id === id) || null;
  }
}
