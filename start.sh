#!/bin/sh
# Seed the database if it doesn't exist yet
if [ ! -f /app/server/data/logistics.db ]; then
  echo "Seeding database..."
  node /app/server/scripts/seed.js
  echo "Database seeded."
fi
# Start the server
exec node /app/server/dist/index.js
