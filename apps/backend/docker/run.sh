#!/bin/sh

# Apply the selected database's migrations
node scripts/migrate-deploy.cjs

# Run the app
node dist/main.js
