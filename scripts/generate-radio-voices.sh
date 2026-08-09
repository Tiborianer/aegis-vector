#!/bin/zsh
set -euo pipefail

project_root=${0:A:h:h}
work_dir=$(mktemp -d /tmp/aegis-radio-voices.XXXXXX)
python_bin=${AEGIS_RADIO_PYTHON:-python3}
missing_only=false
if [[ ${1:-} == "--missing" ]]; then
  missing_only=true
fi
trap 'rm -rf "$work_dir"' EXIT

generate_voice() {
  local filename=$1 voice=$2 rate=$3 phrase=$4 seed=$5
  local destination="$project_root/public/audio/voice/$filename.wav"
  if $missing_only && [[ -s "$destination" ]]; then
    print "Keeping existing $filename.wav"
    return
  fi
  /usr/bin/say -v "$voice" -r "$rate" -o "$work_dir/$filename.aiff" "$phrase"
  /usr/bin/afconvert -f WAVE -d LEI16@22050 -c 1 "$work_dir/$filename.aiff" "$work_dir/$filename-raw.wav"
  "$python_bin" "$project_root/scripts/process-radio-voice.py" "$work_dir/$filename-raw.wav" "$destination" "$seed"
  print "Generated $filename.wav"
}

generate_voice shield-down Samantha 205 "Shield down." 7101
generate_voice hull-critical Samantha 195 "Hull critical." 7102
generate_voice shield-restored Samantha 200 "Shields restored." 7103
generate_voice emp-ready Samantha 200 "EMP ready." 7104
generate_voice arc-upgraded Daniel 185 "ARC cannon upgraded." 7201
generate_voice nova-upgraded Daniel 185 "NOVA missiles upgraded." 7202
generate_voice lance-upgraded Daniel 185 "LANCE laser upgraded." 7203
generate_voice wing-upgraded Daniel 185 "WING drones upgraded." 7204
generate_voice ion-upgraded Daniel 185 "ION conductor upgraded." 7205
generate_voice aegis-upgraded Daniel 185 "Aegis capacity upgraded." 7206

node "$project_root/scripts/verify-radio-audio.mjs" "$project_root/public"
