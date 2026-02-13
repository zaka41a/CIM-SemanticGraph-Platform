#!/bin/bash

# Script to release stale TDB2 lock file
# Usage: ./release-tdb-lock.sh

TDB_DIR="${HOME}/.cim-platform/tdb2"
LOCK_FILE="${TDB_DIR}/tdb.lock"

echo "Checking for TDB2 lock file..."

if [ ! -f "$LOCK_FILE" ]; then
    echo "No lock file found at: $LOCK_FILE"
    exit 0
fi

echo "Lock file found: $LOCK_FILE"
echo "Lock file age: $(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$LOCK_FILE" 2>/dev/null || stat -c "%y" "$LOCK_FILE" 2>/dev/null || echo "unknown")"

# Check if any Java process is using the TDB directory
JAVA_PROCESSES=$(ps aux | grep -i java | grep -v grep | wc -l | tr -d ' ')

if [ "$JAVA_PROCESSES" -gt 0 ]; then
    echo "Warning: Java processes are running. Make sure the application is stopped."
    read -p "Do you want to remove the lock file anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 1
    fi
fi

echo "Removing lock file..."
rm -f "$LOCK_FILE"

if [ $? -eq 0 ]; then
    echo "✓ Lock file removed successfully"
    echo "You can now start the application."
else
    echo "✗ Failed to remove lock file"
    echo "You may need to run with sudo or check file permissions"
    exit 1
fi
