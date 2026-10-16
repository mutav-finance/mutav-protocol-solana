#!/bin/zsh
# Final assembly: 3.0 s logo sting (+SFX) then the pro cut (+3.0 s offset), optional music bed, -14 LUFS.
# usage: tools/assemble.sh <out.mp4> [sfx.mp3] [music.mp3]
cd "${0:A:h}/.."
OUT=${1:-out/mutav-demo-v1.mp4}; SFX=${2:-../music/sfx-b-elegant-logo-reveal.mp3}; MUS=$3
STING=../intro/out/logo-sting.mp4; MAIN=out/procut.mp4
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $MAIN)
if [[ -n "$MUS" ]]; then
  # music: 0.14 base, out at refusal (main 46.3 -> +3), silent to 55.5+3, back 58.5..59.5, lift on close, fade out
  T=$((D+3)); MVOL="volume='if(lt(t,49.0),0.14,if(lt(t,49.3),0.14*(49.3-t)/0.3,if(lt(t,56.8),0,if(lt(t,57.8),0.14*(t-56.8),if(lt(t,$T-11.4),0.14,if(lt(t,$T-2),0.19,0.19*max(0,($T-t)/2)))))))':eval=frame"
  FC="[1:a]atrim=0:3.0,afade=t=out:st=2.4:d=0.6,volume=0.64,aresample=48000,aformat=channel_layouts=stereo[s];
[2:a]aresample=48000,aformat=channel_layouts=stereo,adelay=3000|3000,asplit=2[v][key];
[3:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:$((D+3)),asetpts=N/SR/TB,${MVOL}[m];
[m][key]sidechaincompress=threshold=0.02:ratio=10:attack=20:release=350[md];
anoisesrc=color=pink:amplitude=0.001:sample_rate=48000,aformat=channel_layouts=stereo,atrim=0:$((D+3))[rt];[s][v][md][rt]amix=inputs=4:normalize=0:duration=longest,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]"
  ffmpeg -hide_banner -loglevel error -y -i $STING -i $SFX -i $MAIN -stream_loop -1 -i $MUS -filter_complex "[0:v][2:v]concat=n=2:v=1:a=0[vv];$FC" -map "[vv]" -map "[a]" -c:v libx264 -crf 18 -preset medium -c:a aac -b:a 192k -ar 48000 -movflags +faststart $OUT
else
  FC="[1:a]atrim=0:3.0,afade=t=out:st=2.4:d=0.6,volume=0.64,aresample=48000,aformat=channel_layouts=stereo[s];
[2:a]aresample=48000,aformat=channel_layouts=stereo,adelay=3000|3000[v];
anoisesrc=color=pink:amplitude=0.001:sample_rate=48000,aformat=channel_layouts=stereo,atrim=0:$((D+3))[rt];[s][v][rt]amix=inputs=3:normalize=0:duration=longest,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]"
  ffmpeg -hide_banner -loglevel error -y -i $STING -i $SFX -i $MAIN -filter_complex "[0:v][2:v]concat=n=2:v=1:a=0[vv];$FC" -map "[vv]" -map "[a]" -c:v libx264 -crf 18 -preset medium -c:a aac -b:a 192k -ar 48000 -movflags +faststart $OUT
fi
echo "→ $OUT ($(ffprobe -v error -show_entries format=duration -of csv=p=0 $OUT)s)"
