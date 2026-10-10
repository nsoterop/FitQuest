# FitQuest brand artwork

`source-v3.png` is the owner's selected v3 Design artwork, copied byte-for-byte: opaque 1254 × 1254 sRGB PNG. Preserve its white Q, lime diagonal, cobalt gradient, padding and finish. No alternative artwork, recoloring, cropping or baked-in iOS corner mask is used.

`app-icon.png` is the square, opaque 1024 × 1024 build export referenced by `mobile/app.json`. Expo's managed iOS prebuild creates the native app-icon catalog from this file. The home-screen icon requires an updated native binary. The standalone preview already bundles the opaque native icon and transparent header; Metro reload only delivers in-app JavaScript/assets to a development client. See [phone preview](../../../docs/guides/phone-preview.md).

`source-blue-transparent.png` is Design's October 10 `fitquest-mark-blue-transparent.png`, copied byte-for-byte: a 1254 × 1254 RGBA blue Q and lime diagonal with a transparent background. It is the source for the in-app header, preserving its complete square, padding, colors and finish.

`mark.png`, `mark@2x.png` and `mark@3x.png` are transparent 36-point header exports at 36/72/108 pixels. React Native selects the device-density variant. They are never tinted. The header groups the mark and existing wordmark under a single accessible “FitQuest” label.

Exports use Sharp 0.35.5 with `resize(size, size, { kernel: 'lanczos3' }).png()` for the transparent header source. The opaque native icon uses `source-v3.png` with the same resize followed by `.removeAlpha().png()`. Resize the complete source square, preserving composition. No runtime or native dependency was added. The project MIT license is unchanged.
