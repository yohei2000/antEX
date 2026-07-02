# Asset Pipeline

Current runtime assets are mixed. The world is still composed from placed scene objects, but the key materials now use AI-generated 512px texture tiles in `public/assets/generated/`: soil, moss/damp ground, sand, gravel, stone surface, and water surface. Terrain patches, water pools, and stone surface details use seeded irregular blob meshes instead of visible circle or ellipse plates. Stone groups, water pools, terrain rises, food, and construction visuals remain individual scene objects rather than a single baked map image. Branch obstacle meshes exist in legacy code but are not placed in the normal map because they can snag ant movement. There are no GLB/KTX2/HDR files in the shipping path yet.

## When Adding Assets

- Use GLB for authored meshes.
- Prefer Meshopt compression for general GLB delivery.
- Use Draco only when static mesh bandwidth dominates and decode cost is acceptable.
- Convert large color textures to KTX2/BasisU.
- Keep normal, roughness, metalness, and AO maps in linear color space.
- Keep mobile texture variants under separate manifest entries instead of replacing desktop assets in place.

## Manifest Direction

Add a small manifest before introducing more than a few files:

```js
export const ASSETS = {
  critical: [],
  lazy: [],
};
```

Critical assets should finish before first interaction. Lazy assets should load after the colony is interactive.
