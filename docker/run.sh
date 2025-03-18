#!/bin/sh

# Migrate the database
npx prisma migrate deploy

# Run the app
node dist/main.js
