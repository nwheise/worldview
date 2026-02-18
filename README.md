# WorldView - Interactive 3D Globe

An interactive 3D globe web application that allows users to compare the true sizes of countries and regions by overlaying them on each other. This addresses the common misconception about country sizes caused by traditional 2D map projections (Mercator distortion).

## Features

- **Interactive 3D Globe**: Rotate and zoom with mouse/touch controls
- **Country & Subdivision Visualization**: Countries rendered with deterministic colors and flush black outlines; admin1 subdivision borders drawn on top, color-matched to their country
- **Hover Tooltips**: Hover over any country or subdivision on the globe to see its name in a tooltip
- **High-Resolution Borders**: 50m-resolution country borders for detailed coastlines
- **Size Comparison**: Overlay any country or admin1 subdivision on the globe to compare its true size with other regions
- **Search**: Single search field covering both countries and admin1 subdivisions
- **Click to Select**: Click directly on countries on the globe
- **Camera-Locked Overlay**: Selected region's centroid always faces the camera with geographic north mapped to screen-up
- **Compass Dial**: Drag the compass ring to rotate the overlay, independent of globe rotation
- **Real Geographic Data**: world-atlas TopoJSON (countries) + Natural Earth 50m admin1 GeoJSON (subdivisions)

## Technology Stack

- **Vite** - Fast development server and build tool
- **three.js** - 3D rendering with WebGL
- **OrbitControls** - Smooth mouse/touch rotation
- **world-atlas** - TopoJSON country boundaries (bundled locally)
- **Natural Earth 50m admin1** - Subdivision boundaries (bundled locally)
- **Vanilla JavaScript** - No framework overhead

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm

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

### Deploy to GitHub Pages

The live site is hosted at **https://nwheise.github.io/worldview/**.

**First-time setup** (only needed once):

1. Push the repository to GitHub.
2. Go to **Settings → Pages** in the GitHub repo.
3. Under "Build and deployment", set:
   - Source: **Deploy from a branch**
   - Branch: **`gh-pages`** / **`/ (root)`**
4. Click **Save**.

**To deploy:**

```bash
npm run deploy
```

This builds the project and publishes the `dist/` folder to the `gh-pages` branch. GitHub Pages will serve the updated site within a minute or two.

> **Note:** Geographic data files are bundled in `public/data/` and served from the same origin — no external CDN fetches at runtime.

## Usage

1. **Select a Region**: Use the search field (countries and admin1 subdivisions) or click on a country on the globe
2. **Compare Sizes**: Rotate the globe while the overlay stays camera-locked to compare the region's size with different areas
3. **Rotate Overlay**: Drag the compass dial ring to rotate the overlay around the camera axis
4. **Clear Overlay**: Click the "Clear Overlay" button to remove the current selection
5. **Explore**: Try overlaying Greenland on Africa to see how Mercator projection distorts sizes!

## Project Structure

```
worldview/
├── package.json
├── vite.config.js          # Vite config (sets base path for GitHub Pages)
├── index.html              # HTML structure, UI, and SVG compass dial
├── public/
│   └── data/
│       ├── countries-50m.json                      # world-atlas TopoJSON (50m)
│       └── ne_50m_admin_1_states_provinces.geojson # Natural Earth admin1 GeoJSON
├── src/
│   ├── main.js            # Application entry and orchestration (WorldViewApp)
│   ├── Globe.js           # Three.js scene and globe rendering (radius 5.0)
│   ├── CountryLoader.js   # TopoJSON fetch, arc-stitch, and GeoJSON conversion
│   ├── SubdivisionLoader.js # Natural Earth admin1 GeoJSON fetch and parse
│   ├── CountryOverlay.js  # Overlay mesh at radius 5.005, camera-locked orientation
│   ├── CountrySelector.js # Unified country+subdivision search and selection
│   ├── utils/
│   │   └── geoUtils.js    # Coordinate transformation utilities
│   └── styles.css         # UI styling
├── CLAUDE.md              # Claude Code guidance
└── README.md
```

## Key Implementation Details

### Coordinate Transformation

Geographic coordinates (latitude, longitude) to 3D Cartesian coordinates on a sphere:

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

- Globe mesh: radius **5.0**, rotates with OrbitControls
- Overlay mesh: radius **5.005**, orientation recomputed every frame so the region's centroid faces the camera with north up
- User compass rotation applied as `makeRotationAxis(cameraDir, -userRotation)` (negated for correct screen direction)
- Semi-transparent red material for visual comparison

### Data Pipeline

Both data sources are fetched in parallel on startup. Subdivision failure is non-fatal — the app continues with countries only.

## Known Limitations

- Countries/regions crossing the antimeridian (±180° longitude) like Russia may have rendering gaps

## Data Sources

- Country boundaries: [world-atlas](https://github.com/topojson/world-atlas) (TopoJSON, 50m resolution) — bundled in `public/data/`
- Subdivision boundaries: [Natural Earth 50m admin1](https://www.naturalearthdata.com/) — bundled in `public/data/`

## License

ISC
