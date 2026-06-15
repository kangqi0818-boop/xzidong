#!/bin/bash
cd "/Users/kangqi/Documents/x ins"
export PORT=3456
export PATH="/Users/kangqi/.local/bin:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:$PATH"
exec /Users/kangqi/.local/bin/node dist/server.js
