#!/bin/bash

echo "🔍 Watching $(pwd) for changes..."
echo "Press Ctrl+C to stop"

fswatch -r . \
  --exclude ".git" \
  --exclude "node_modules" \
  --exclude ".DS_Store" \
  -o | while read change; do
    sleep 1
    if [ -n "$(git status --porcelain)" ]; then
      CHANGED=$(git status --porcelain | head -3 | awk '{print $2}' | tr '\n' ' ')
      git add .
      git commit -m "auto: $CHANGED$(date '+%H:%M:%S')"
      git push
      echo "✅ Pushed at $(date '+%H:%M:%S') → $CHANGED"
    fi
  done

