#!/bin/zsh
# Cuts the pro-cut video shots. Operator takes (F3/F6/F7) are cropped from takes/raw just inside the debug glow
# (glow <= 4/255 at x>=34, 388<=y<=1758; left-biased so left-aligned text like the refusal message stays whole);
# the reserve takes (S1 v2, S5) have no debug glow, so they are re-cropped from takes/raw to keep the pilot banner and left margin.
cd "${0:A:h}/.."
T=../takes; O=assets/clips; mkdir -p $O
enc=(-c:v libx264 -preset slow -crf 15 -pix_fmt yuv420p -r 30 -an -threads 4 -movflags +faststart)
hi(){ ffmpeg -hide_banner -loglevel error -y -ss $2 -t $3 -i $T/raw/$1.mov -vf "crop=2436:1370:34:388,scale=1920:1080:flags=lanczos${4:+,$4}" $enc $O/$5.mp4 && echo "$5 ok"; }
s5(){ ffmpeg -hide_banner -loglevel error -y -ss $2 -t $3 -i $T/raw/$1.mov -vf "crop=2375:1336:34:422,scale=1920:1080:flags=lanczos${5:+,$5}" $enc $O/$4.mp4 && echo "$4 ok"; }  # S5: glow appears mid-take; crop below the banner
raw(){ ffmpeg -hide_banner -loglevel error -y -ss $2 -t $3 -i $T/raw/$1.mov -vf "crop=2552:1436:8:354,scale=1920:1080:flags=lanczos" $enc $O/$4.mp4 && echo "$4 ok"; }
raw 181520-S1-reserve-overview-v2 4.0 10.0 f1
hi 181112-F3-register-ana 1.0 3.4 "tpad=stop_mode=clone:stop_duration=4.1" f3a
hi 181112-F3-register-ana 15.5 3.1 "" f3b
s5 181601-S5-reserve-coverage 1.0 5.0 f5a "tpad=stop_mode=clone:stop_duration=6.0"
s5 181601-S5-reserve-coverage 21.0 5.9 f5b
hi 183311-F6-refusal-app-v2 0.0 6.5 "tpad=start_mode=clone:start_duration=1.2" f6a  # v3: 1.2 s first-frame hold, slot 38.8-46.5 (insert-coverage cut to 1.8 s)
hi 183311-F6-refusal-app-v2 17.5 8.5 "" f6b
hi 183358-F7-claim-cycle 0.5 2.5 "" f7a
hi 183358-F7-claim-cycle 12.5 3.5 "tpad=stop_mode=clone:stop_duration=2.4" f7b
hi 183358-F7-claim-cycle 59.0 3.4 "" f7c
hi 183358-F7-claim-cycle 65.0 2.5 "" f7d
hi 183358-F7-claim-cycle 78.25 2.2 "" f7e  # v3 audit P1: in 0.25 s later (skips the half-drawn layout), slot 72.7-74.8
