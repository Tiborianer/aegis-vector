#!/bin/zsh
# Offline preparation only: never generate commercial assets with macOS system voices.
set -euo pipefail
project_root=${0:A:h:h}
python_bin=${AEGIS_RADIO_PYTHON:-python3}
# Requires numpy and soundfile; approved MP3 masters live in assets/audio/voice-v2.
# Exact provider settings and seeds: docs/audio/radio-v2-production.json.
"$python_bin" "$project_root/scripts/prepare-radio-v2.py"
node "$project_root/scripts/verify-radio-audio.mjs" "$project_root/public"
