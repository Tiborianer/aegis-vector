# Aegis Vector · Two Pilots

## 1. Share a keyboard

On the [public game](https://tiborianer.github.io/aegis-vector/), choose **Two Pilots**. On a Mac with the game checkout and dependencies installed, you can also double-click **Play Local Co-op.command** in the game folder. Choose **Start local co-op**, pick a kit for each fighter, then mark both ready. From a running game, open **Two Pilots** on the title screen. Choose the difficulty on the title screen before starting a new squad. **Resume local co-op** restores the last squad save for that browser and game address.

| | Move | Hold to fire | EMP |
| --- | --- | --- | --- |
| P1 · Kestrel | W A S D | F | G |
| P2 · Wingmate | Arrow keys | J | K |

The preflight **Test keyboard** button shows both jets responding. Try both diagonals and both fire keys together. The indicator for each key lights when the keyboard sends it. Use **Remap P1** or **Remap P2** if a combination is unreliable on your keyboard. In the hangar, the same movement keys select an option, Fire confirms and EMP backs out of a ready selection. Both players can also click their own panel. P or Escape pauses the shared local flight.

### What changes with two pilots

| Game decision | How it plays |
| --- | --- |
| Fighter identity | P1 has a cyan marker. P2 has an amber marker, twin markings and amber exhaust on a free Kestrel. Both have the same flight envelope. Either pilot can choose either starter kit, including matching kits. |
| Weapons | Precision combines ARC and a forward LANCE. Coverage combines ARC and a WING drone. Holding Fire operates the equipped weapons. Each pilot owns their EMP charges, weapon levels and upgrade effects. |
| Shared playfield | Both pilots can use the whole screen and pass through one another. Friendly weapons leave the other fighter unharmed. The shared score, mission clock, objectives and bosses stay visible. Each pilot has their own hull, shield and EMP readouts. |
| Enemy balance | Ordinary enemies retain their health. Once the first Coastal armament carrier appears, eligible normal waves may add one light scout while both pilots are flying. Later missions use the same rule from their first eligible wave. Elite health starts at 1.25× the solo tuning and command/boss health at 1.65×. The Crown’s six turrets scale with its hull. Losing a pilot suspends new co-op escorts. |
| One fighter destroyed | The cockpit ejects from the broken fighter and settles at the rescue beacon. The surviving pilot keeps flying. Stay within the beacon for 1.5 continuous seconds to bring the other pilot back with one hull, one shield and two seconds of protection. Each pilot gets one field rescue between waypoints. Crossing the next waypoint brings a downed pilot back and renews the rescue. The next mission also launches both fighters. |
| Both fighters destroyed | The host or local player can retry from the last secured waypoint. Each pilot’s gear and spent one-shot protections are restored according to that pilot’s checkpoint. Before the first waypoint, the squad retries from mission start. |
| Earnings and upgrades | A team payout of 80 credits gives **80 to each pilot**. Each has a separate wallet. Carrier drops give each pilot a choice, with unclaimed options waiting in the hangar. Routine utility pickups go to the collector. Each panel has its own shop, modifications, sortie module, respec and ready button. |
| Route choices | P1 chooses Minefield or Aurora after Coastal. P2 chooses Stormbreak or Graveyard after Fortress. Both take the same route through seven missions. The four route combinations together cover nine locations. |
| Progress | Co-op uses its own campaign, story archive and high score. In a network room, the host stores the squad. To resume, use the same host browser and address where the squad was saved. |

## 2. Play on the same Wi-Fi or LAN

With internet access, open [Two Pilots](https://tiborianer.github.io/aegis-vector/#two-pilots), select **Create private room** and send the invite to the second computer. The guest selects **Join private room**. Wi-Fi and Ethernet both work. The hosting account is only for maintaining the service.

For a game that stays entirely on your local network, use the LAN launcher.

1. On the host Mac, double-click **Host LAN Co-op.command**. On Windows with the project and Node installed, use **Host LAN Co-op.cmd**. Leave the terminal open during play.
2. Choose **Create private room**. If a squad save exists on this address, the checkbox lets the host continue it.
3. Send the displayed private invite to the second computer. The guest opens it in a browser and clicks **Join private room**. The guest needs only the link.
4. On separate keyboards, either player can use WASD or arrows, Space or Z to fire, and X or Shift for EMP. Each computer controls one seat. Either pilot can pause. After a guest disconnect the host pauses a running sortie and holds the seat for 30 seconds. The guest can return in the same browser tab.

The shared-keyboard launcher listens on loopback, port 4187. The LAN launcher listens on the host network interfaces, port 4188. On a host with several network adapters, use `AEGIS_LAN_ADDRESS` to choose the Wi-Fi IPv4 address shown in the guest link. The guest must be able to reach that address and port on the local network. Guest-isolated Wi-Fi can prevent this.

## 3. Play over the internet

The host opens the [GitHub game](https://tiborianer.github.io/aegis-vector/#two-pilots), chooses **Create private room** and sends the resulting invite to the guest. The guest opens the invite and chooses **Join private room**. Each pilot chooses a kit and marks their own fighter ready. Keep the host's game tab open during the flight. Unused invites expire after ten minutes. Rooms have two seats and require no game accounts. If the guest disconnects, the same tab can reclaim its seat for 30 seconds.

The repository includes the game server and relay. A reachable HTTPS service is required for play between homes. For a single-site installation, stage the game once on the server and run the following from the game folder behind an HTTPS reverse proxy. Replace the example origin with the actual game origin.

```sh
npm ci
npm run build
npm run web:stage
AEGIS_ALLOWED_ORIGINS=https://game.example PORT=4188 npm run coop:internet
```

Route HTTPS requests for the game and WebSocket upgrades for `/coop/socket` to the service. The default internet bind is loopback. A separate container network can use `AEGIS_BIND` to choose its listening interface. To terminate TLS directly in Node, set both `AEGIS_TLS_CERT` and `AEGIS_TLS_KEY` to files managed by the operator. If the staging destination already exists, choose a fresh folder with `node scripts/web-stage.mjs dist <new-folder>` and point `AEGIS_WEB_DIR` to it.

For an existing static HTTPS game website, run `npm run coop:relay` with `AEGIS_ALLOWED_ORIGINS` set to that website’s origin. Build the frontend with `VITE_COOP_RELAY=wss://relay.example/coop/socket` or enter that address under **Internet relay address**. When hosting from a local game page with a public relay, enter the publicly reachable **Public game address** as well. For GitHub Pages, set the repository Actions variable `VITE_COOP_RELAY` to the public WSS endpoint and run the Pages deployment. The guest’s invite contains the game address and the relay choice. The service handles private rooms and forwards traffic. The host’s game decides damage, pickups, purchases, routes and checkpoints.

### Host the room service for the GitHub game

The public game uses **Cloudflare Workers Free**. The game and artwork load from GitHub Pages. Cloudflare forwards the pilots' live controls and game updates. Reaching a Free quota can interrupt rooms until the quota resets. A Workers Free account can run this setup without a card. [Free-plan behavior](https://developers.cloudflare.com/durable-objects/platform/pricing/)

The Worker configuration is in `wrangler.jsonc`. It creates one SQLite-backed Durable Object namespace supported on Free. Both the Worker and LAN server use `server/coop/room-hub.mjs` to enforce the same invite, seat and reconnection rules. The Worker holds the active sockets in memory and the host browser keeps the campaign save.

To maintain it, sign in to the hosting account with Wrangler, confirm **Workers plans → Free → Current plan**, and run `npx wrangler@4 deploy` from the game root after room-service changes. Test with `node scripts/qa-room-service.mjs https://aegis-vector-rooms.aegis-vector.workers.dev`. GitHub builds use the repository Actions variable `VITE_COOP_RELAY`. Its value is `wss://aegis-vector-rooms.aegis-vector.workers.dev/coop/socket`. When changing the address, redeploy GitHub Pages and run the hosted room test below.

### Optional Render installation

The repository includes a Render Blueprint for one free Node web service in Singapore. It runs the relay by itself, accepts browser connections from the game's GitHub Pages origin and checks its health at `/coop/config`. The game, artwork and campaign saves stay with the existing game and players. [Render setup](https://render.com/deploy?repo=https://github.com/Tiborianer/aegis-vector)

1. Review the Blueprint and the workspace billing terms before deploying. Render can require a card even on Free, and traffic beyond the included allowance can incur charges. Record the assigned HTTPS address. [Render's bandwidth billing](https://render.com/docs/outbound-bandwidth)
2. Open `/coop/config` at that address. Check for game `aegis-vector`, protocol `1` and scope `internet`.
3. In the game's GitHub repository, open **Settings → Secrets and variables → Actions → Variables**. Set `VITE_COOP_RELAY` to `wss://` followed by the assigned hostname and `/coop/socket`. Run **Actions → Deploy Aegis Vector → Run workflow**.
4. From the published **Two Pilots** screen, create a room and open its invite in a different browser. The first connection can take about a minute after the Free instance goes idle. The lobby retries while it wakes. [Render free service behavior](https://render.com/docs/free)

## Verification and acceptance

| Stage | Automated coverage | Remaining playtest |
| --- | --- | --- |
| Shared keyboard | Browser movement and manual fire for each seat, six simultaneously held keys, independent EMP, field rescue, waypoint rejoin, wipe and retry, split shopping, refresh, survivor extraction, both route captains and an accelerated seven-mission ending. Campaign model tests exercise every route pair at Cadet, Pilot and Ace. | Play with two people on the intended physical keyboard. Compare ordinary-wave crowding and boss clear times using the same difficulty and kits. |
| LAN | Two independent Chrome sessions join the release, control only their own seat, fly together, pause, reconnect, purchase different upgrades, choose the second fork and launch Stormbreak. Private-room tests cover admission, expiration, third-seat rejection and host departure. | Repeat on two physical computers on the same Wi-Fi and check the host’s firewall prompt and keyboard feel. |
| Internet | The public service test creates a private room, passes messages in both directions and restores the guest seat. The browser test uses the public GitHub lobby and its configured Cloudflare address. A separate local test adds 152 ms of round-trip delay and drops every hundredth world snapshot. | Play from two physical computers on different internet connections to assess keyboard feel and long-distance latency. |

### Repeat the checks

Run `npm test`, `npm run desktop:test`, `npm run web:test` and `npm run coop:test`. Run `npm run coop:prepare` to build and verify the release used by both launchers. The launcher reuses a release while the source and approved runtime assets match it.

The browser checks use Playwright and Chrome. Make the `playwright` package available to Node, then run from the game root.

| Check | Service | Command |
| --- | --- | --- |
| Shared keyboard | Start `npm run dev -- --port 4197` | `node scripts/qa-coop.mjs` |
| Network rooms | Run `PORT=4198 AEGIS_BIND=127.0.0.1 AEGIS_LAN_ADDRESS=127.0.0.1 node server/coop/start.mjs` with a staged release | `node scripts/qa-coop-network.mjs` |
| Encrypted relay | Provide the staged game directory with `AEGIS_WEB_DIR`. The check starts its own loopback listeners and uses OpenSSL to generate a temporary certificate. | `node scripts/qa-coop-relay.mjs` |
| Hosted rooms | Set `AEGIS_EXPECT_PUBLIC_RELAY` to the deployed WSS address. The check opens the GitHub game and verifies the default address, private invite, guest flight and reconnection with two independent browsers. | `node scripts/qa-coop-network.mjs` |
| Published game | Run against the public game after deployment. Set `AEGIS_EXPECT_REVISION` to the full commit ID to check the deployed version. | `node scripts/qa-coop-release.mjs https://tiborianer.github.io/aegis-vector/` |

The local browser check uses development controls to cause damage and shorten completed missions. It still crosses the ordinary mission, rescue, failure, story and hangar screens. The network checks use the production build and include a saved hangar fixture to exercise the second route fork.
