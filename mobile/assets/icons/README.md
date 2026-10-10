# FitQuest Lucide assets

Exact upstream Lucide outline paths from `lucide-static@1.55.0`, downloaded from the official npm registry. Package integrity: `sha512-h18lunTFsIJWnY0FMRPjXeO9KcAtNi7fDqtqgWHOFbssfgUWsctn/pA7bpiyrd4g1DuBOJ24CsRnPfkYblwm/A==`.

`source/` preserves the original SVGs. PNGs are local alpha masks exported at 20 and 24 points, each at 1x/2x/3x. Rendering uses the same paths, rounded caps/joins, black stroke and `stroke-width="1.8"`; only SVG width/height change to the target pixel dimensions. Exports were produced with Sharp 0.35.5. At runtime React Native Image selects the density variant and tints the mask; there is no remote fetching, font or added native module. [`mobile/src/components/Icon.tsx`](../../src/components/Icon.tsx) explicitly imports this finite set, which is also embedded in standalone preview build 3.

To reproduce an export with Sharp, replace SVG `currentColor` with `#000000` and `stroke-width="2"` with `stroke-width="1.8"`, set SVG width and height to point-size times density, and run `sharp(Buffer.from(svg)).png().toFile(output)`. Keep the viewBox, paths and rounded caps/joins unchanged. Name density variants `name-20.png`, `name-20@2x.png`, `name-20@3x.png` (likewise 24).

Keep the complete upstream [LICENSE](LICENSE), including ISC and Feather-derived MIT notices, with redistributed assets. The project MIT selection is unchanged.
