#!/bin/zsh
# Final: render -> cut the 58.0-61.5 VO-silent span (video) / 57.9-61.4 (audio) -> assemble (sting+SFX+music) -> out/mutav-demo-final.mp4
cd "${0:A:h}/.."
set -e
node tools/build.mjs >/dev/null
npx --yes hyperframes@0.8.150 render --workers 2 --fps 30 --output out/procut-base.mp4
cp out/procut-base.mp4 out/procut-uncut.mp4
ffmpeg -hide_banner -loglevel error -y -i out/procut-uncut.mp4 -filter_complex "
[0:v]trim=0:58.0,setpts=PTS-STARTPTS[v1];[0:v]trim=start=61.5,setpts=PTS-STARTPTS[v2];[v1][v2]concat=n=2:v=1:a=0[v];
[0:a]atrim=0:57.9,asetpts=PTS-STARTPTS[a1];[0:a]atrim=start=61.4,asetpts=PTS-STARTPTS[a2];[a1][a2]concat=n=2:v=0:a=1[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -crf 16 -preset medium -r 30 -c:a pcm_s16le -ar 48000 out/procut-cut.mov
ffmpeg -hide_banner -loglevel error -y -i out/procut-cut.mov -c:v copy -c:a aac -b:a 256k out/procut.mp4
zsh tools/assemble.sh out/mutav-demo-final.mp4 ../music/sfx-b-elegant-logo-reveal.mp3 ../music/2-lofi-bossa-electronic-loop.mp3
