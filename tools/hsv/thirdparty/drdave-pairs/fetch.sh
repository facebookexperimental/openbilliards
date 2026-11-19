#!/bin/sh

# Copyright (c) Meta Platforms, Inc. and affiliates.

# Fetch the Dr. Dave matched-english cushion clips from Wayback id_ mirrors
# (billiards.colostate.edu 403-blocks datacenter IPs; the /web/<ts>id_/ raw
# mirrors serve the mp4s fine).  /web/2024id_/ redirects to the nearest
# 2024 capture.  Then extract PNG frames for the measurement scripts.
#
# Usage: SSL_CERT_FILE=/etc/ssl/cert.pem sh fetch.sh
set -e
cd "$(dirname "$0")"
mkdir -p videos frames
base="https://billiards.colostate.edu"
files="
high_speed_videos/HSV6-6_bank_fast_left.mp4
high_speed_videos/HSV6-7_bank_fast_right.mp4
high_speed_videos/HSV6-8_bank_slow_left.mp4
high_speed_videos/HSV6-9_bank_slow_right.mp4
high_speed_videos/HSV6-10_cue_bank_straight_right.mp4
high_speed_videos/HSV6-11_cue_bank_angled_left.mp4
high_speed_videos/HSV6-12_cue_bank_angled_right.mp4
high_speed_videos/new/HSVA-26_kick_with_English.mp4
high_speed_videos/new/HSVA-27_small_angle_kick_with_reverse_English.mp4
high_speed_videos/new/HSVA-28_small_angle_kick_with_running_English.mp4
high_speed_videos/new/HSVA-68_kick_shot_with_running-English_slow.mp4
high_speed_videos/new/HSVA-69_kick_shot_with_running-English_fast.mp4
high_speed_videos/new/HSVA-70_kick_shot_with_reverse-English_slow.mp4
high_speed_videos/new/HSVA-71_kick_shot_with_reverse-English_fast.mp4
"
for f in $files; do
  n=$(basename "$f")
  [ -s "videos/$n" ] || curl -sSL -A "Mozilla/5.0" -o "videos/$n" \
    "https://web.archive.org/web/2024id_/$base/$f"
  ffprobe -v error -select_streams v:0 \
    -show_entries stream=width,height,nb_frames -of csv=p=0 "videos/$n"
  d="frames/${n%.mp4}"
  [ -d "$d" ] || { mkdir -p "$d"; ffmpeg -v error -i "videos/$n" "$d/%04d.png"; }
done
# Pipeline: python3 ocr_osd.py frames out && python3 measure_pairs.py frames out
#           && python3 pair_tables.py out
