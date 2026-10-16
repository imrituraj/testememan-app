#!/usr/bin/env bash
# TestMeMan macOS Assessment App - Native App Terminator
# Safely terminates unauthorized candidate apps without harming macOS system daemons or the client itself.

echo "=========================================================="
echo "  TestMeMan macOS OA Process Lockdown Initiated"
echo "=========================================================="

APPS=(
  "Google Chrome" "Safari" "Brave Browser" "Arc" "Microsoft Edge" "firefox" "Opera" "Vivaldi" "Tor Browser"
  "Discord" "Slack" "Telegram" "WhatsApp" "zoom.us" "Microsoft Teams" "Skype" "Cisco Webex Meetings" "Messages" "FaceTime" "Screen Sharing"
  "AnyDesk" "TeamViewer" "Parsec" "rustdesk" "Microsoft Remote Desktop" "VNC Viewer"
  "ChatGPT" "Claude" "Notes" "Stickies" "TextEdit" "Sublime Text" "pycharm" "idea"
  "QuickTime Player" "OBS" "ScreenFlow" "CleanShot X" "Kap"
)

COUNT=0

for APP in "${APPS[@]}"; do
  # Use exact match (-x) on executable names to avoid killing system daemons like CodeSigningHelper or TrialArchivingService
  PIDS=$(pgrep -x "$APP" 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    osascript -e "tell application \"$APP\" to quit" >/dev/null 2>&1 || true
    for PID in $PIDS; do
      if [ "$PID" != "$$" ] && [ "$PID" != "$PPID" ]; then
        kill -9 "$PID" >/dev/null 2>&1 || true
      fi
    done
    echo "  [CLOSED] Terminated: $APP"
    COUNT=$((COUNT + 1))
  fi
done

echo "----------------------------------------------------------"
echo "  Lockdown complete. Terminated $COUNT unauthorized application(s)."
echo "=========================================================="

