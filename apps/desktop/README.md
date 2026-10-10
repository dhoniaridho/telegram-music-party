# Music Party desktop

The desktop app opens YouTube Music in one window and loads the existing party content script into a persistent session. Room creation, joining, room settings, invite sharing, and server settings are available from YouTube Music’s sidebar. The dashboard is available through the configured server URL in a browser.

By default, the desktop app runs its bundled local server and opens a Cloudflare Quick Tunnel. The temporary `trycloudflare.com` URL changes between runs and works only while the app and tunnel are running. Share a room invite from **Room Settings** in YouTube Music’s sidebar. Quick Tunnels are intended for testing and development; for a permanent address, configure a hosted HTTPS server in **Server Settings**.

In YouTube Music, open **Room Settings** and choose **Copy invite link** to share a room. Opening the link joins the room automatically; if the visitor has no saved handle, the dashboard assigns a guest handle.

The local server uses SQLite data under the app's user data directory. Use **Telegram Settings** in YouTube Music’s sidebar to set the optional `TELEGRAM_BOT_TOKEN`; changing it restarts the bundled server when active. The token is saved in the app's per-user settings file with owner-only permissions on macOS and Linux. If the app starts with `TELEGRAM_BOT_TOKEN` in its environment and no saved token, that value is filled into Telegram Settings. This configures only the local server. For a hosted server, set the token in that server's environment.

## Develop

From the repository root (builds the extension and server first):

```sh
pnpm install
pnpm desktop:dev
```

## Package for this operating system

```sh
pnpm desktop:package
```

Forge creates installers in `apps/desktop/out/make`. macOS creates a DMG and ZIP, Windows creates a Squirrel installer and ZIP, and Linux creates a DEB and ZIP. Builds are native to the machine that runs them; use the release workflow to produce all three platforms.

The package step builds the browser extension and bundles a precompiled Ghostery ads filter. At runtime the blocker is enabled before either remote page is opened. Filter lists are fixed at package build time, so rebuild the app to include later filter updates. Ads delivered through first-party video streams may still appear.

Desktop release builds are attached to GitHub releases for version tags. They are unsigned; macOS distribution outside local development needs signing and notarization, and Windows may show a publisher warning until a signing certificate is configured.
