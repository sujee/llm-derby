# Demo videos

Turns Screen Studio recordings of LLM Derby into finished demo videos. This isn't part of the app.

```bash
python3 video/render.py --list         # videos it knows about
python3 video/render.py qwen           # master, social and short
python3 video/render.py tf short       # just the YouTube Short
```

Needs `ffmpeg` and Google Chrome. Sources are read from `~/Screen Studio Projects` (override with `LLM_DERBY_STUDIO`), and outputs go to the git-ignored `tmp/` (override with `LLM_DERBY_OUT`).

## Outputs

| File | Size | Use |
| --- | --- | --- |
| `<name>-vN.mp4` | recording width × 1080 | Blog / README, with intro and end cards |
| `<name>-vN-social.mp4` | 1920 × 1080 | X / LinkedIn: the recording centered on the app background, shorter intro |
| `<name>-vN-short.mp4` | 1080 × 1920 | YouTube Short: branded header and URL around the recording, vertical end card |

## Editing a video

Each video is one entry in `VIDEOS` in `render.py`:

- `edits`: source ranges to keep, with an optional speed-up, e.g. `(7, 12, 2.5)`. A gap between ranges is a cut.
- `overlays`: lower thirds from `cards/lower.html` (`round=2/3` makes a round label), at times on the edited timeline.
- `jumps`: times on the edited timeline where the recording skips ahead. Each gets a crossfade and a "⏩ Fast-forward" chip, without changing the length.
- `models` and `fmt`: the matchup chips on the intro card and the Short.

Raise `ver` for each new round of changes, so earlier versions aren't overwritten.

## Cards

The cards are HTML pages in `cards/`, styled like the app and screenshotted with headless Chrome into `cards/out/` (git-ignored) on every run:

- `card.html`: the intro (`card=intro`, with `m=A|B|C` and `fmt=` for the matchup), end (`card=end`), Shorts frame (`card=short`) and plain background (`card=bg`). `u=` sets the scale for vertical cards.
- `lower.html`: the "Questions range from Easy › Medium › Hard › Expert" lower third, or a round label with `round=2/3`.
- `chip.html`: the "⏩ Fast-forward" chip.

Open a page in a browser to preview it, for example `cards/card.html?card=end`.
