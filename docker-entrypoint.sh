#!/bin/sh
set -e

mkdir -p /app/data /app/.next/cache
chown -R nextjs:nodejs /app/data /app/.next/cache

exec su-exec nextjs "$@"
