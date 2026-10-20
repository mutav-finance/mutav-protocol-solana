#!/bin/zsh
# v2 (2026-10-12): the timer overlay is removed (it crowded the claim insert; the spine + the 1m 05s highlight carry it).
# Receipts and tx-rail were removed earlier. Nothing left to composite: copy the base render through unchanged.
cd "${0:A:h}/.."
ffmpeg -hide_banner -loglevel error -y -i out/procut-base.mp4 -map 0 -c copy -movflags +faststart out/procut.mp4
