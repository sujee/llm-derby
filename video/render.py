"""Render LLM Derby demo videos from Screen Studio exports.

For each video: an edited core (speed-ups, cuts, lower thirds, jump-cut transitions), then
  <out>-vN-1080p.mp4                  master, recording width x 1080, with intro and end cards
  <out>-vN-social-1080p.mp4           1920x1080, recording centered on the app background
  <out>-vN-short-1080p-vertical.mp4   1080x1920 YouTube Short, branded frame around the recording
With --4k every size doubles (e.g. 3840x2160) and the names say 4k instead of 1080p.

Cards are HTML pages in cards/, screenshotted with headless Chrome into cards/out/.
Outputs go to the repo's tmp/ (git-ignored), or $LLM_DERBY_OUT.

Usage:
  python3 video/render.py <video> [--4k] [master|social|short ...]
  python3 video/render.py --list

Needs ffmpeg and Google Chrome. Sources are read from $LLM_DERBY_STUDIO
(default: ~/Screen Studio Projects).
"""
import hashlib
import os
import subprocess
import sys
from urllib.parse import quote

HERE = os.path.dirname(os.path.abspath(__file__))
CARD_SRC = os.path.join(HERE, 'cards')
CARD_OUT = os.path.join(CARD_SRC, 'out')
OUT = os.environ.get('LLM_DERBY_OUT', os.path.join(os.path.dirname(HERE), 'tmp'))
STUDIO = os.environ.get('LLM_DERBY_STUDIO', os.path.expanduser('~/Screen Studio Projects'))
CHROME = os.environ.get('CHROME', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
N = 'settb=AVTB,fps=30,format=yuv420p'
XF = 0.6  # jump-cut crossfade (s)
S = 1  # output scale: 1 = HD (1080p), 2 = 4K. Layout numbers below are in HD pixels.

# Times: `edits` are source seconds (start, end or None, speed). `overlays` and `jumps` are on the
# edited timeline. Overlays are (page, query, start, duration) lower thirds from cards/lower.html.
VIDEOS = {
    'qwen': dict(
        src='llm-derby-qwen-astra-sonnet-1-v1-4k.mp4', out='llm-derby-qwen-astra-sonnet-1', ver=7, w=1780,
        models=['Qwen3.8-27B', 'gpt-6-astra', 'claude-sonnet-5-5'], fmt='Best of 3', intro_matchup=True,
        edits=[(0, 7, 1), (7, 12, 2.5), (12, 32.9, 1), (37.0667, None, 1)],
        overlays=[('lower.html', '', 22, 4.5), ('lower.html', 'round=2/3', 37.1033, 3.5), ('lower.html', 'round=3/3', 47.3033, 3.5)],
        jumps=[23.3333, 29.9, 43.5333, 54.8], intro_len=3.5),
    'tf': dict(
        src='llm-derby-token-factory-models-2-v1-4k.mp4', out='llm-derby-token-factory-models-2', ver=3, w=1780,
        models=['DeepSeek-V4.1-Flash', 'Qwen3.8-27B', 'GLM-5.3', 'MiniMax-M3'], fmt='Single race · all on Nebius Token Factory',
        intro_matchup=True, edits=[(0, None, 1)], overlays=[], jumps=[26.1], intro_len=3.5),
    'd1': dict(
        src='llm-derby-1-v1.mp4', out='llm-derby-1', ver=3, w=1548,
        models=['DeepSeek-V4.1-Flash', 'GLM-5.3', 'Qwen3.8-27B'], fmt='Best of 3', intro_matchup=False,
        edits=[(0, None, 1)], overlays=[], jumps=[33.2, 44.9333, 57.5333, 61.2333], intro_len=3.0),
}


def run(args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], check=True)


def probe(path, entry):
    return subprocess.run(['ffprobe', '-v', 'error', '-show_entries', entry, '-of', 'csv=p=0', path],
                          capture_output=True, text=True).stdout.strip()


def fmt(x):
    return f'{x:.4f}'


def shot(page, query, w, h, transparent=False):
    """Screenshot cards/<page>?<query> laid out at w x h CSS px (S device px each) and return the PNG path."""
    os.makedirs(CARD_OUT, exist_ok=True)
    tag = hashlib.sha1(query.encode()).hexdigest()[:8]
    path = os.path.join(CARD_OUT, f'{page.removesuffix(".html")}-{tag}-{w * S}x{h * S}.png')
    args = [CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', f'--force-device-scale-factor={S}',
            f'--window-size={w},{h}', f'--screenshot={path}', f'file://{os.path.join(CARD_SRC, page)}?{query}']
    if transparent:
        args.insert(1, '--default-background-color=00000000')
    subprocess.run(args, check=True, capture_output=True)
    if not os.path.exists(path):
        sys.exit(f'Chrome did not write {path}')
    return path


def cards(v):
    """Render every card this video needs."""
    w = v['w']
    matchup = f'm={quote("|".join(v["models"]))}&fmt={quote(v["fmt"])}'
    intro_q = f'card=intro&{matchup}' if v['intro_matchup'] else 'card=intro'
    return dict(
        intro=shot('card.html', intro_q, w, 1080),
        intro_social=shot('card.html', intro_q, 1920, 1080),
        end=shot('card.html', 'card=end', w, 1080),
        end_social=shot('card.html', 'card=end', 1920, 1080),
        end_short=shot('card.html', 'card=end&u=1', 1080, 1920),
        short=shot('card.html', f'card=short&u=1&{matchup}', 1080, 1920),
        bg=shot('card.html', 'card=bg', 1920, 1080),
        chip=shot('chip.html', '', w, 1080, transparent=True),
        overlays=[shot(page, q, w, 1080, transparent=True) for page, q, _, _ in v['overlays']],
    )


def core(v, c):
    """Edited recording at (w x 1080) * S with lower thirds and jump transitions. Returns (path, duration)."""
    src = os.path.join(STUDIO, v['src'])
    dur = float(probe(src, 'format=duration'))
    has_audio = 'audio' in probe(src, 'stream=codec_type')
    edits = [(s, dur if e is None else e, sp) for s, e, sp in v['edits']]
    length = sum((e - s) / sp for s, e, sp in edits)
    w = v['w']
    inputs = ['-i', src]

    def add_input(*args):
        inputs.extend(args)
        return sum(1 for a in inputs if a == '-i') - 1

    f = []
    # 1. Edit list: trims, speed-ups, concat. Micro audio fades where the source isn't contiguous.
    k = len(edits)
    f.append(f'[0:v]scale={w * S}:{1080 * S}:flags=lanczos,{N},split={k}' + ''.join(f'[ve{i}]' for i in range(k)))
    for i, (s, e, sp) in enumerate(edits):
        f.append(f'[ve{i}]trim={fmt(s)}:{fmt(e)},setpts=(PTS-STARTPTS)/{sp},{N}[vs{i}]')
    f.append(''.join(f'[vs{i}]' for i in range(k)) + f'concat=n={k}:v=1:a=0,{N}[cat]')
    if has_audio:
        f.append(f'[0:a]asplit={k}' + ''.join(f'[ae{i}]' for i in range(k)))
        for i, (s, e, sp) in enumerate(edits):
            a = f'[ae{i}]atrim={fmt(s)}:{fmt(e)},asetpts=PTS-STARTPTS'
            if sp != 1:
                a += f',atempo={sp}'
            if i > 0 and edits[i - 1][1] != s:
                a += ',afade=t=in:d=0.02'
            if i < k - 1 and edits[i + 1][0] != e:
                a += f',afade=t=out:st={fmt((e - s) / sp - 0.02)}:d=0.02'
            f.append(a + f'[as{i}]')
        f.append(''.join(f'[as{i}]' for i in range(k)) + f'concat=n={k}:v=0:a=1[acat]')
    else:
        idx = add_input('-f', 'lavfi', '-t', fmt(length), '-i', 'anullsrc=r=48000:cl=stereo')
        f.append(f'[{idx}:a]anull[acat]')
    # Game sounds are quiet in the recordings: +10 dB, fade out at the end.
    f.append(f'[acat]volume=10dB,afade=t=out:st={fmt(length - 0.6)}:d=0.6,aresample=48000[aout]')

    # 2. Lower thirds: slide up 40px and fade in/out.
    cur = 'cat'
    for j, ((_, _, t, d), png) in enumerate(zip(v['overlays'], c['overlays'])):
        idx = add_input('-loop', '1', '-i', png)
        e = t + d
        f.append(f'[{idx}]format=rgba,fade=in:st={fmt(t)}:d=0.35:alpha=1,fade=out:st={fmt(e - 0.35)}:d=0.35:alpha=1[ol{j}]')
        f.append(f"[{cur}][ol{j}]overlay=x=0:y='if(lt(t,{fmt(t + 0.35)}),{40 * S}*(1-(t-{fmt(t)})/0.35),0)':eval=frame:shortest=1:"
                 f"enable='between(t,{fmt(t)},{fmt(e)})'[olv{j}]")
        cur = f'olv{j}'

    # 3. Jump cuts: hold each side's edge frame for XF/2 and crossfade over XF, so the timeline
    #    length (and every later overlay) is unchanged. A "Fast-forward" chip shows around each one.
    jumps = v['jumps']
    if jumps:
        bounds = [0, *jumps, length]
        n = len(bounds) - 1
        f.append(f'[{cur}]split={n}' + ''.join(f'[js{i}]' for i in range(n)))
        for i in range(n):
            pad = ([f'start_mode=clone:start_duration={XF / 2}'] if i > 0 else []) + \
                  ([f'stop_mode=clone:stop_duration={XF / 2}'] if i < n - 1 else [])
            tp = f',tpad={":".join(pad)}' if pad else ''
            f.append(f'[js{i}]trim={fmt(bounds[i])}:{fmt(bounds[i + 1])},setpts=PTS-STARTPTS{tp},{N}[jp{i}]')
        cur = 'jp0'
        for i in range(1, n):
            f.append(f'[{cur}][jp{i}]xfade=transition=fade:duration={XF}:offset={fmt(jumps[i - 1] - XF / 2)},{N}[jx{i}]')
            cur = f'jx{i}'
        idx = add_input('-loop', '1', '-i', c['chip'])
        f.append(f'[{idx}]format=rgba,split={len(jumps)}' + ''.join(f'[ch{i}]' for i in range(len(jumps))))
        for i, t in enumerate(jumps):
            a, b = t - 0.5, t + 0.9
            f.append(f'[ch{i}]fade=in:st={fmt(a)}:d=0.25:alpha=1,fade=out:st={fmt(b - 0.25)}:d=0.25:alpha=1[chf{i}]')
            f.append(f"[{cur}][chf{i}]overlay=shortest=1:enable='between(t,{fmt(a)},{fmt(b)})'[chv{i}]")
            cur = f'chv{i}'
    f.append(f'[{cur}]{N}[vout]')

    path = os.path.join(OUT, f'.core-{v["out"]}-{S}x.mkv')
    run([*inputs, '-filter_complex', ';'.join(f), '-map', '[vout]', '-map', '[aout]', '-t', fmt(length),
         '-c:v', 'libx264', '-preset', 'fast', '-crf', '12', '-c:a', 'pcm_s16le', path])
    return path, float(probe(path, 'format=duration'))


def finish(v, c, core_path, L, kind):
    w = v['w']
    res = '4k' if S == 2 else '1080p'
    if kind == 'master':
        I, fi, E, fo, intro, end = v['intro_len'], 0.5, 4.5, 0.6, c['intro'], c['end']
        name = f'{v["out"]}-v{v["ver"]}-{res}.mp4'
    elif kind == 'social':
        I, fi, E, fo, intro, end = 2.5, 0.4, 4.0, 0.6, c['intro_social'], c['end_social']
        name = f'{v["out"]}-v{v["ver"]}-social-{res}.mp4'
    else:  # short: the branded frame is on screen from the first frame, so no intro card
        I, fi, E, fo, intro, end = 0, 0, 3.5, 0.5, None, c['end_short']
        name = f'{v["out"]}-v{v["ver"]}-short-{res}-vertical.mp4'
    start = I - fi
    total = start + L - fo + E
    f = []
    if kind == 'short':
        inputs = ['-i', core_path, '-loop', '1', '-i', c['short'], '-loop', '1', '-t', fmt(E), '-i', end]
        vh = round(1080 * S * 1080 / w / 2) * 2  # recording scaled to the frame width, centered in the 630..1285 band
        f.append(f'[1]{N}[bg];[0:v]scale={1080 * S}:{vh}:flags=lanczos,{N}[sv];'
                 f'[bg][sv]overlay=0:{630 * S + (655 * S - vh) // 2}:shortest=1,{N}[b]')
        f.append(f'[2]{N}[c];[b][c]xfade=transition=fade:duration={fo}:offset={fmt(L - fo)}[v]')
        f.append(f'[0:a]apad=whole_dur={fmt(total)}[au]')
    else:
        inputs = ['-loop', '1', '-t', fmt(I), '-i', intro, '-i', core_path, '-loop', '1', '-t', fmt(E), '-i', end]
        if kind == 'social':
            inputs += ['-loop', '1', '-i', c['bg']]
            f.append(f'[3]{N}[bg];[1:v]{N}[raw];[bg][raw]overlay={(1920 - w) // 2 * S}:0:shortest=1[b0]')
        else:
            f.append(f'[1:v]{N}[b0]')
        f.append(f'[0]{N}[a];[2]{N}[c];[a][b0]xfade=transition=fade:duration={fi}:offset={fmt(start)}[ab]')
        f.append(f'[ab][c]xfade=transition=fade:duration={fo}:offset={fmt(start + L - fo)}[v]')
        f.append(f'[1:a]adelay={int(start * 1000)}:all=1,apad=whole_dur={fmt(total)}[au]')
    out = os.path.join(OUT, name)
    run([*inputs, '-filter_complex', ';'.join(f), '-map', '[v]', '-map', '[au]', '-t', fmt(total),
         '-c:v', 'libx264', '-preset', 'slow' if S == 1 else 'medium', '-crf', '18' if kind == 'master' else '20',
         '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out])
    size = probe(out, 'stream=width,height').splitlines()[0].replace(',', 'x')
    print(f'{name}: {size}, {float(probe(out, "format=duration")):.1f}s', flush=True)


def main():
    if len(sys.argv) < 2 or sys.argv[1] == '--list':
        for key, v in VIDEOS.items():
            print(f'{key:6} {v["src"]} -> {v["out"]}-v{v["ver"]}')
        return
    global S
    args = sys.argv[2:]
    if '--4k' in args:
        S = 2
        args.remove('--4k')
    v = VIDEOS[sys.argv[1]]
    kinds = args or ['master', 'social', 'short']
    os.makedirs(OUT, exist_ok=True)
    c = cards(v)
    path, L = core(v, c)
    try:
        for kind in kinds:
            finish(v, c, path, L, kind)
    finally:
        os.remove(path)


if __name__ == '__main__':
    main()
