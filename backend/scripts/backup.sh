#!/bin/bash
# Varco Call Centre - PostgreSQL Backup Script
# Usage: ./backup.sh
# Schedule: Add to crontab: 0 2 * * * /path/to/backup.sh

set -e

# Load environment variables
if [ -f "$(dirname "$0")/../.env" ]; then
  export $(grep -v '^#' "$(dirname "$0")/../.env" | xargs)
fi

BACKUP_DIR="${BACKUP_DIR:-/var/backups/varco-callcentre}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql.gz"
RETENTION_DAYS=30

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "🔵 Starting backup at $(date)..."

# Run pg_dump and compress
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
  SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
  echo "✅ Backup completed: $BACKUP_FILE ($SIZE)"
else
  echo "❌ Backup failed!"
  exit 1
fi

# Remove backups older than RETENTION_DAYS
find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete
echo "🧹 Cleaned up backups older than $RETENTION_DAYS days"

# List recent backups
echo "📁 Recent backups:"
ls -lh "$BACKUP_DIR" | tail -10

echo "✅ Done at $(date)"
