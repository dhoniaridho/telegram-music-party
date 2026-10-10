# Telegram Music Party

A Telegram bot that allows users to play music from different sources like Spotify and soon Youtube, and control the playback in a group chat.
## Feature
- Room music party
- Add queue from telegram
- Room creation by run telegram command
- Youtube music control

## How to Use this Bot
- Add the Telegram bot configured for your deployment to your group.
- Run the command /register in the group chat.
- Install [YT Music Party](https://addons.mozilla.org/en-US/firefox/addon/yt-music-party/) from firefox
- Input the code displayed in the extension to link the extension to the bot.
- Click the "Join" button in the extension to join the group chat.

## How to Add Queue
- Mention the bot's current username in the group chat, followed by a music search (e.g. `@your_bot_name Shape of You`).
- Bot will display the results of the search. Click the "Add to queue" button next to the desired result.
- Then, run the command /play in the group chat to play the music from the queue.

## Available Command
- **/start**: Show instructions
- **/register**: Register chat to party
- **/play**: Play a music
- **/pause**: You know this
- **/devices**: List all device joined
- **/queue**: Queue list
- **/unregister**: Leave from party


## Technologies:
- Telegram API (telegraf)
- NodeJS
- Typescript
- RxJS
- Prisma ORM
- Postgre SQL
- NestJS

## Releases

Every push to `main` builds and publishes the backend container for Linux AMD64 and ARM64 to GitHub Container Registry with the `main` and `latest` tags. Pushing a Git tag also publishes a versioned image and creates a GitHub Release with generated notes.

```sh
git tag v1.0.0
git push origin v1.0.0
```

The images will be available as `ghcr.io/<owner>/<repository>:main`, `:latest`, and (for tagged releases) `:v1.0.0`.

## Desktop app

The Electron app combines YouTube Music, the party dashboard, the bundled local API server, and a preconfigured ad blocker. See [apps/desktop/README.md](apps/desktop/README.md) for development and packaging instructions.

## Storage

By default, the backend stores data in SQLite at `apps/backend/prisma/local.db` and uses an in-memory cache. Copy `apps/backend/.env.example` to `apps/backend/.env` to customize the setup.

To use PostgreSQL, set `DATABASE_PROVIDER=postgresql` and `DATABASE_URL`. To use Redis, set `REDIS_URL`. If Redis is configured but cannot connect, the backend falls back to the in-memory cache.
