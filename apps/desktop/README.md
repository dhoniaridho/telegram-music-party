# Music Party desktop

The desktop app provides one window for YouTube Music and the party dashboard. It bundles the Nest API server with SQLite storage, and loads the existing party content script into a persistent YouTube Music session. Sign-in and room settings survive app restarts. When a room is joined, open **Room Settings** from YouTube Music’s sidebar to change room controls without switching to the dashboard tab.

By default, the dashboard and extension connect to the public server at `https://party.dhoniaridho.com`, so new rooms can be shared with other listeners. Use **Server** in the app toolbar to switch to the bundled local server at `http://127.0.0.1:3417` or another hosted HTTPS server. The selected URL is saved between launches. Rooms created on the local server stay private to this computer.

In YouTube Music, open **Room Settings** and choose **Copy invite link** to share a room. Opening the link joins the room automatically; if the visitor has no saved handle, the dashboard assigns a guest handle.

The local server uses SQLite data under the app's user data directory. In **Server** settings, enter the optional Telegram bot token used by `TELEGRAM_BOT_TOKEN`; changing it restarts the bundled server. The token is saved in the app's per-user settings file with owner-only permissions on macOS and Linux. If the app starts with `TELEGRAM_BOT_TOKEN` in its environment and no saved token, that value is filled into the setting. This configures only the local server. For a hosted server, set the token in that server's environment.

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
