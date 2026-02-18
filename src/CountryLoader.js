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
      const response = await fetch(`${import.meta.env.BASE_URL}data/countries-50m.json`);

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
    const { objects, arcs, transform } = topology;
    const countries = objects.countries;

    // Delta-decode all arcs up front
    const decodedArcs = arcs.map(arc => {
      let x = 0, y = 0;
      return arc.map(point => {
        x += point[0];
        y += point[1];
        if (transform) {
          return [
            x * transform.scale[0] + transform.translate[0],
            y * transform.scale[1] + transform.translate[1]
          ];
        }
        return [x, y];
      });
    });

    const features = countries.geometries.map(geom => {
      return {
        type: 'Feature',
        id: geom.id,
        properties: geom.properties || {},
        geometry: this.topoGeometryToGeoJSON(geom, decodedArcs)
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

      // Skip first point of subsequent arcs to avoid duplicates at joins
      const start = coordinates.length > 0 ? 1 : 0;
      for (let i = start; i < points.length; i++) {
        coordinates.push(points[i]);
      }
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
