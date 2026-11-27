# Friends hangar release

The friends page is served at `/aegis-vector/friends/`. It has its own entry point and flight bundle. The public game's homepage, JavaScript and styles are built separately.

To update this folder, run `npm run build:friends` in the private Aegis Vector workspace. Copy `index.html`, the four current files in `assets/` and the three finishes under `graphics-v2/liveries/` from `outputs/friends-game-build/`. Replace the prior hashed bundles together with their entry page. Configure the build with the Aegis Vector Development sandbox project's browser publishable settings and the `livery-pack` offer.

`npm run web:stage` stages the friends files under `web-dist/friends/` with the 196 media paths in `shared-media.json` and the third-party notices. This list records the media used by the published friends client. Refresh it alongside a new friends flight bundle when its media change. Each invited player signs in through Supabase Auth. The existing Edge Function checks the private invitations table and creates Stripe sandbox checkout sessions. Keep pilot identities, passwords and server keys outside the repository.
