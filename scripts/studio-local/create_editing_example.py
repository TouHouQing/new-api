"""Package owned local inference footage and an original tutorial soundtrack."""
import argparse
import subprocess
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ffmpeg', required=True)
    parser.add_argument('--image', type=Path)
    parser.add_argument('--video', type=Path)
    args = parser.parse_args()
    output = Path(__file__).resolve().parents[2] / 'web' / 'public' / 'studio-example'
    output.mkdir(parents=True, exist_ok=True)
    if bool(args.image) != bool(args.video):
        parser.error('Provide both owned source files, or use the packaged example')
    if args.image and args.video:
        sources = [
            ['-loop', '1', '-i', str(args.image), '-vf', 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,zoompan=z=1.02+on*0.0004:x=iw/2-iw/zoom/2:y=ih/2-ih/zoom/2:d=72:s=640x360:fps=24'],
            ['-i', str(args.video), '-vf', 'scale=800:480:force_original_aspect_ratio=increase,crop=640:360:80:70,tpad=stop_mode=clone:stop_duration=2', '-r', '24'],
        ]
        for index, source in enumerate(sources, 1):
            subprocess.run([args.ffmpeg, '-nostdin', '-v', 'error', '-y', *source, '-t', '3', '-c:v', 'libx264', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(output / f'shot-{index}.mp4')], check=True)
    elif not all((output / f'shot-{index}.mp4').is_file() for index in [1, 2]):
        parser.error('The packaged footage is missing; supply owned image and video sources')
    melody = r'aevalsrc=0.06*sin(2*PI*261.626*t)*exp(-4*mod(t\,0.5))+0.04*sin(2*PI*329.628*t)*exp(-4*mod(t+0.2\,0.5))+0.03*sin(2*PI*392*t)*exp(-3*mod(t+0.4\,0.5)):d=6:s=44100'
    subprocess.run([args.ffmpeg, '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', melody, '-af', 'afade=t=in:d=0.5,afade=t=out:st=5:d=1', '-c:a', 'libmp3lame', '-y', str(output / 'music.mp3')], check=True)
    print('Two packaged local AI shots and an original six-second tutorial soundtrack are ready.')


if __name__ == '__main__':
    main()
