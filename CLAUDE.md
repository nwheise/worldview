# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## IMPORTANT INSTRUCTIONS FOR CLAUDE
- Claude must never work directly on main branch. Always use a feature branch.
- Claude must always update the CLAUDE.md and README.md files when committing changes.
- Claude must never try to deploy changes from any branch except for main.

## Commands

```bash
npm run dev      # Start Vite dev server (http://localhost:5173)
npm run build    # Production build → dist/
npm run preview  # Serve production build locally
npm run deploy   # Build and deploy to GitHub Pages (gh-pages branch)
```

No test suite exists.

## Architecture

TheTrueSize3D is a vanilla JS + Three.js app with no framework. `src/main.js` (`TheTrueSize3DApp` class) is the orchestrator — it instantiates everything else and wires up events.

**Data pipeline:**
- `CountryLoader.js` fetches `world-atlas@2` TopoJSON (50m resolution) from `public/data/countries-50m.json` (bundled with the site) and converts it to GeoJSON using a custom arc-stitching parser (delta-decode → stitch → GeoJSON features).
- `SubdivisionLoader.js` fetches Natural Earth 50m admin1 GeoJSON (~2.3 MB) from `public/data/ne_50m_admin_1_states_provinces.geojson` (bundled with the site). Both loaders are fetched in parallel; subdivision failure is non-fatal.
- Data files are stored in `public/data/` so they are served from the same origin. URLs use `import.meta.env.BASE_URL` to work correctly in both dev and GitHub Pages.
- `CountrySelector.js` holds a unified `items` list of `{ id, name, displayName, getFeature }` — countries and admin1 subdivisions share one search field.

**Rendering:**
- `Globe.js` manages the Three.js scene (camera, renderer, OrbitControls, lighting). Globe sphere is radius **5.0**. Country polygons are filled with deterministic colors (keyed by `properties.name`, stored in `countryColorMap`) and rendered with black outlines at radius **5.011**. Admin1 subdivision borders are drawn at radius **5.012** as dark-gray lines. Polygons are triangulated using a tangent-plane projection (3D points projected onto a plane at the polygon centroid) and then subdivided to follow sphere curvature. This handles polar polygons (like Antarctica) whose coordinates span the full longitude range. `countryFillMeshes` and `subdivisionHitMeshes` arrays are raycasted on `mousemove` for hover tooltips; raycasting also checks the globe sphere to suppress hits on the far (occluded) side.
- `CountryOverlay.js` manages up to **3 independent overlay slots** (red/blue/green), each a separate `THREE.Group`. Each slot stores `originalCentroidDir` (fixed unit vector of the country centroid in world space) and `displayNDC` (screen-space NDC position, `THREE.Vector2`). Each frame `update()` re-projects `displayNDC` against the globe sphere via analytic ray–sphere intersection using the current camera — this makes overlays fixed to screen position rather than world position, so the globe rotates underneath. User rotation via the compass dial is applied as a negated angle around the camera direction vector (`makeRotationAxis(cameraDir, -userRotation)`). Fill meshes carry `userData.slotIndex` for drag raycasting.
- The controls panel (top-left) contains the title/help-button header, inline help panel, per-slot search rows, and the attribution footer. The info/attribution links are at the bottom of the controls panel.

**Compass dial (index.html + main.js):**
- The draggable SVG compass has `#compass-outer` (the rotating ring with N/E/S/W labels) and a static center dot. Dragging rotates `#compass-outer` by `deg` and calls `overlay.setRotation(radians)`.

**Coordinate math** (`src/utils/geoUtils.js`):
- `latLonToVector3(lat, lon, radius)` — standard spherical → Cartesian. All GeoJSON coordinates are WGS84 `[lon, lat]`.

## Key Patterns

- All geo data classes follow the same pattern: `load()` (async fetch + parse), `getXList()` (returns sorted `{id, name, displayName}`), `getXById(id)`.
- `CountryOverlay._localFrame(dir)` computes a `{right, up, forward}` tangent frame at any point on the unit sphere — used to align the overlay to the camera.
- Overlay drag: `mousedown` on an overlay fill mesh sets `draggingSlot` and disables OrbitControls. `mousemove` calls `overlay.setDisplayNDC(slotIndex, mouse)` with raw NDC. `mouseup` re-enables OrbitControls. `CountryOverlay.update()` handles the NDC→world projection internally.
- Known limitation: countries/regions crossing the antimeridian (±180°) like Russia may render with gaps.
