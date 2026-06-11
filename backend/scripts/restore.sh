#!/bin/bash
# Varco Call Centre - PostgreSQL Restore Script
# Usage: ./restore.sh <backup_file.sql.gz>

set -e

if [ -z "$1" ]; then
  echo "Usage: ./restore.sh <backup_file.sql.gz>"
  echo "Available backups:"
  ls -lh "${BACKUP_DIR:-/var/backups/varco-callcentre}"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Backup file not found: $BACKUP_FILE"
  exit 1
fi

# Load environment variables
if [ -f "$(dirname "$0")/../.env" ]; then
  export $(grep -v '^#' "$(dirname "$0")/../.env" | xargs)
fi

echo "⚠️  WARNING: This will overwrite the current database!"
echo "Database: $DATABASE_URL"
echo "Backup: $BACKUP_FILE"
read -p "Are you sure? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Restore cancelled."
  exit 0
fi

echo "🔵 Starting restore at $(date)..."

# Decompress and restore
gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL"

if [ $? -eq 0 ]; then
  echo "✅ Restore completed successfully at $(date)"
else
  echo "❌ Restore failed!"
  exit 1
fi
