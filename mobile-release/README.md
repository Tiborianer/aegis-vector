# Coastal Intercept phone playtest

The 12-second encounter opens in landscape. Pick Drag or Stick, tap Fly, and bank an ARC charge while dodging the Interceptor. [Play Coastal Intercept](https://tiborianer.github.io/aegis-vector/mobile/)

To prepare another build, run `npm ci` and `npm run mobile:pages` in the Aegis Vector mobile development checkout. Copy the files listed in `outputs/mobile-pages-release/manifest.json` and the manifest into this directory. Remove any bundles retired by the new manifest.

In this release checkout, `npm run build` followed by `npm run web:stage` verifies the listed SHA-256 digests and stages the encounter at `web-dist/mobile/`. GitHub Pages deploys the staged site.
