# Radio voice files

The production pack contains ten mandatory mono, 22.05kHz, 16-bit PCM WAV files. ECHO-7 uses Samantha at 195–205 words per minute; Rook uses Daniel at 185 words per minute. Regenerate them with `scripts/generate-radio-voices.sh` and process them with `scripts/process-radio-voice.py`.

Runtime playback applies a central −6dB trim after per-file loudness correction. The Voice slider remains independent, subtitles remain available at zero Voice volume, and radio never changes the music gain or playback position.
