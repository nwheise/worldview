# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## IMPORTANT INSTRUCTIONS FOR CLAUDE
- Claude must never work directly on main branch. Always use a feature branch.
- Claude must always update the CLAUDE.md and README.md files when committing changes.

## Commands

```bash
npm run dev      # Start Vite dev server (http://localhost:5173)
npm run build    # Production build → dist/
npm run preview  # Serve production build locally
```

No test suite exists.

## Architecture

WorldView is a vanilla JS + Three.js app with no framework. `src/main.js` (`WorldViewApp` class) is the orchestrator — it instantiates everything else and wires up events.

**Data pipeline:**
- `CountryLoader.js` fetches `world-atlas@2` TopoJSON from jsDelivr and converts it to GeoJSON using a custom arc-stitching parser (delta-decode → stitch → GeoJSON features).
- `SubdivisionLoader.js` fetches Natural Earth 50m admin1 GeoJSON (~2.3 MB) from jsDelivr (`@v5.0.1`, pinned). Both loaders are fetched in parallel; subdivision failure is non-fatal.
- `CountrySelector.js` holds a unified `items` list of `{ id, name, displayName, getFeature }` — countries and admin1 subdivisions share one search field.

**Rendering:**
- `Globe.js` manages the Three.js scene (camera, renderer, OrbitControls, lighting). Globe sphere is radius **5.0**. Country polygons are filled with deterministic colors and rendered with black outlines. Polygons are subdivided into triangles on the sphere surface to prevent planar sag.
- `CountryOverlay.js` places a semi-transparent red mesh at radius **5.005** (just above the globe). Each frame in the animation loop it recomputes the orientation so the selected region's centroid faces the camera and geographic north maps to screen-up. User rotation via the compass dial is applied as a negated angle around the camera direction vector (`makeRotationAxis(cameraDir, -userRotation)` — negated because right-hand rule with an axis pointing toward the viewer makes positive = counterclockwise on screen).

**Compass dial (index.html + main.js):**
- The draggable SVG compass has `#compass-outer` (the rotating ring with N/E/S/W labels) and a static center dot. Dragging rotates `#compass-outer` by `deg` and calls `overlay.setRotation(radians)`.

**Coordinate math** (`src/utils/geoUtils.js`):
- `latLonToVector3(lat, lon, radius)` — standard spherical → Cartesian. All GeoJSON coordinates are WGS84 `[lon, lat]`.

## Key Patterns

- All geo data classes follow the same pattern: `load()` (async fetch + parse), `getXList()` (returns sorted `{id, name, displayName}`), `getXById(id)`.
- `CountryOverlay.localFrame(dir)` computes a `{right, up, forward}` tangent frame at any point on the unit sphere — used to align the overlay to the camera.
- Known limitation: countries/regions crossing the antimeridian (±180°) like Russia may render with gaps.
