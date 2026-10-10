# FitQuest brand artwork

`source-v3.png` is the owner's selected v3 Design artwork, copied byte-for-byte: opaque 1254 × 1254 sRGB PNG. Preserve its white Q, lime diagonal, cobalt gradient, padding and finish. No alternative artwork, recoloring, cropping or baked-in iOS corner mask is used.

`app-icon.png` is the square, opaque 1024 × 1024 build export referenced by `mobile/app.json`. Expo's managed iOS prebuild creates the native app-icon catalog from this file. The home-screen icon requires an updated native binary; Metro reload only delivers the in-app mark and UI icons.

`mark.png`, `mark@2x.png` and `mark@3x.png` are 36-point header exports at 36/72/108 pixels. React Native selects the device-density variant. They are never tinted. The header groups the mark and existing wordmark under a single accessible “FitQuest” label.

Exports use Sharp 0.35.5 with `resize(size, size, { kernel: 'lanczos3' }).removeAlpha().png()`. Resize the complete source square, preserving composition. No runtime or native dependency was added. The project MIT license is unchanged.
