# WorldView - Interactive 3D Globe

An interactive 3D globe web application that allows users to compare the true sizes of countries by overlaying them on each other. This addresses the common misconception about country sizes caused by traditional 2D map projections (Mercator distortion).

## Features

- **Interactive 3D Globe**: Rotate and zoom with mouse/touch controls
- **Country Visualization**: All countries rendered with white borders on the globe
- **Size Comparison**: Overlay any country on the globe to compare its true size with other regions
- **Two Selection Methods**:
  - Select from dropdown menu
  - Click directly on countries on the globe
- **Fixed Overlay**: Selected country stays fixed in view while globe rotates beneath it
- **Real Geographic Data**: Uses Natural Earth 110m resolution GeoJSON data

## Technology Stack

- **Vite** - Fast development server and build tool
- **three.js** - 3D rendering with WebGL
- **OrbitControls** - Smooth mouse/touch rotation
- **Natural Earth** - High-quality geographic data
- **Vanilla JavaScript** - No framework overhead

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser to `http://localhost:5173`

### Build for Production

```bash
npm run build
```

The production files will be in the `dist/` directory.

## Usage

1. **Select a Country**: Use the dropdown menu or click on a country on the globe
2. **Compare Sizes**: Rotate the globe while the overlay stays fixed to compare the country's size with different regions
3. **Clear Overlay**: Click the "Clear Overlay" button to remove the current selection
4. **Explore**: Try overlaying Greenland on Africa to see how Mercator projection distorts sizes!

## Project Structure

```
worldview/
├── package.json
├── index.html              # HTML structure and UI
├── src/
│   ├── main.js            # Application entry and orchestration
│   ├── Globe.js           # Three.js scene and globe rendering
│   ├── CountryLoader.js   # GeoJSON data loading and parsing
│   ├── CountryOverlay.js  # Overlay mesh creation and positioning
│   ├── CountrySelector.js # Dropdown UI and selection handling
│   ├── utils/
│   │   └── geoUtils.js    # Coordinate transformation utilities
│   └── styles.css         # UI styling
└── README.md
```

## Key Implementation Details

### Coordinate Transformation

The critical part of the application is converting geographic coordinates (latitude, longitude) to 3D Cartesian coordinates on a sphere:

```javascript
function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);      // Polar angle
  const theta = (lon + 180) * (Math.PI / 180);   // Azimuthal angle

  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);

  return new THREE.Vector3(x, y, z);
}
```

### Overlay System

The overlay uses a separate `THREE.Group` with independent rotation:
- Globe mesh: radius 5.0, rotates with OrbitControls
- Overlay mesh: radius 5.2, fixed rotation maintained in animation loop
- Semi-transparent red material (40% opacity) for visual comparison

## Known Limitations

- Countries crossing the antimeridian (±180° longitude) like Russia may have gaps in their borders
- Complex multi-polygon countries use simplified triangulation
- Minor distortion at extreme viewing angles is acceptable for size comparison purposes

## Future Enhancements

- Multiple simultaneous overlays with different colors
- Higher resolution earth textures (NASA Blue Marble)
- Country name labels on hover
- Size comparison statistics (area in km²)
- Color coding by continent/region
- Search/filter functionality in dropdown
- Mobile touch optimizations
- Shareable permalinks for comparisons

## Data Source

Country boundary data from [Natural Earth](https://www.naturalearthdata.com/) via the [world-atlas](https://github.com/topojson/world-atlas) package.

## License

ISC

## Contributing

This is a demonstration project. Feel free to fork and enhance!
