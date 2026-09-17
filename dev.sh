#!/usr/bin/env bash
set -e

# Change directory to project root
cd "$(dirname "$0")"

# Colors for terminal output
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${CYAN}${BOLD}"
echo "============================================================"
echo "    🛸 DJI TELLO SIMULATOR - DEV MODE (VITE + UDP)          "
echo "============================================================"
echo -e "${NC}"

# Check dependencies
if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}>> Installing dependencies...${NC}"
  npm install
fi

# Detect primary local LAN IP
PRIMARY_IP=$(node -e "
const os = require('os');
const ifaces = os.networkInterfaces();
let found = null;
for (const dev in ifaces) {
  for (const d of ifaces[dev]) {
    if (d.family === 'IPv4' && !d.internal && !dev.includes('docker') && !dev.includes('br-')) {
      found = d.address;
      break;
    }
  }
  if (found) break;
}
if (!found) {
  for (const dev in ifaces) {
    for (const d of ifaces[dev]) {
      if (d.family === 'IPv4' && !d.internal) {
        found = d.address;
        break;
      }
    }
    if (found) break;
  }
}
console.log(found || '127.0.0.1');
" 2>/dev/null || echo "127.0.0.1")

VITE_PORT=3000
CMD_PORT=8889
STATE_PORT=8890
VIDEO_PORT=11111

LOCAL_URL="http://localhost:${VITE_PORT}"
NETWORK_URL="http://${PRIMARY_IP}:${VITE_PORT}"

echo -e "${GREEN}${BOLD}>> DEV SERVER STARTING...${NC}"
echo ""
echo -e "  ${BOLD}🌐 EXPOSED WEB 3D SIMULATOR LINKS:${NC}"
echo -e "     Local Link:   ${CYAN}${BOLD}${LOCAL_URL}${NC}"
echo -e "     Network Link: ${CYAN}${BOLD}${NETWORK_URL}${NC}"
echo ""
echo -e "  ${BOLD}📱 MOBILE APP CONNECTION SETTINGS:${NC}"
echo -e "     Drone IP:     ${YELLOW}${BOLD}${PRIMARY_IP}${NC}"
echo -e "     Control Port: ${YELLOW}${BOLD}${CMD_PORT}${NC} (UDP)"
echo -e "     State Port:   ${YELLOW}${BOLD}${STATE_PORT}${NC} (UDP)"
echo -e "     Video Port:   ${YELLOW}${BOLD}${VIDEO_PORT}${NC} (UDP)"
echo ""
echo -e "${CYAN}============================================================${NC}"
echo -e "${BLUE}Starting Vite & UDP Backend... (Press Ctrl+C to stop)${NC}\n"

# Try opening browser automatically if running in graphical environment
if [ -n "$DISPLAY" ] || [ -n "$WAYLAND_DISPLAY" ]; then
  (sleep 1.8 && {
    if command -v xdg-open >/dev/null 2>&1; then
      xdg-open "$LOCAL_URL" >/dev/null 2>&1
    elif command -v open >/dev/null 2>&1; then
      open "$LOCAL_URL" >/dev/null 2>&1
    fi
  }) &
fi

# Run concurrent dev environment
exec npm run dev
