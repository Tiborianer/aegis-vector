# Browser release procedure

The public browser game is deployed to https://tiborianer.github.io/aegis-vector/ from `main` by `.github/workflows/deploy-pages.yml`. A browser publication is separate from Steam onboarding, native Windows validation and store release approval.

## Checked production package

Run `npm test`, `npm run desktop:test`, `npm run web:test` and `npm run build`. The build checks actual atlas pixels and hashes, current ship/module contracts, all six approved additional mission scores, eleven active radio recordings, story images, icons, branding and the intro MP4.

Run `npm run verify:graphics` locally to additionally verify the private 3D models and environment masters. Routine CI uses the same shipping-pixel checks with `--runtime-only`, so authoring files and reference libraries do not need to enter the public repository.

Run `npm run web:stage` in a fresh build checkout. It copies the 170 explicit active assets, built JS/CSS, entry page and third-party notices into `web-dist`, and records the commit in `release.json`. It deliberately excludes retired voice packs, older music takes, unused story artwork, review pages, source maps and working files. The originals remain on disk. Staging rejects an existing destination; choose a new output path instead of deleting user files. Optional form: `npm run web:stage -- dist /absolute/path/to/new-staging-folder`.

GitHub Actions uploads only `web-dist`, never the unfiltered `dist` or `public` tree. Historical repository files are not removed or rewritten by this process.

## Release verification

- Confirm the workflow for the intended commit finishes successfully.
- Fetch the live `release.json` and compare its revision to the commit; a successful push alone is not proof of deployment.
- Check the public menu, opening video, gameplay, pause/resume and Mission Lab using the deployed URL.
- Verify current media respond successfully and the intro supports byte-range playback.
- Check a retained old voice and an internal review URL return 404 in the new website.
- Keep browser smoke-test scope separate from a full campaign/platform acceptance test.

## Current limitations

The two story-specific music beds (`story-discovery` and `story-revelation`) still use their declared hangar soundtrack fallback. Do not describe them as completed bespoke scores. Steam rights, account and native-platform gates remain in `docs/steam`; browser deployment does not claim those checks are complete.

Publishing game changes does not authorize social posts, advertising spend or new third-party generation. Marketing plans and working review outputs remain separate from the website package.
