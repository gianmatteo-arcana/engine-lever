#!/bin/bash
echo "Starting server without watch mode..."
echo "This prevents restarts during long API calls"
npm run build && node dist/index.js
