# Lunchfy Tutorial 9x16 Render Package

This ZIP is self-contained. It includes the main HTML, local CSS, local JS,
brand images, category images, a local WAV soundtrack, a compatibility
`support.js`, and the original `.dc.html` file for traceability.

## Main File

Open:

```text
index.html
```

The animation starts automatically. For the soundtrack to autoplay during
recording, launch Chrome or Edge with autoplay allowed:

```bash
chrome --autoplay-policy=no-user-gesture-required "file:///ABSOLUTE/PATH/index.html"
```

## Target Render Settings

- Format: vertical 9:16
- Viewport: 1080 x 1920
- Full version duration: 54 seconds
- Teaser duration: 15 seconds
- Full URL: `index.html`
- Teaser URL: `index.html?version=teaser`
- Frame rate recommendation: 30 fps
- Audio: `assets/music/lunchfy-loop.wav`

## Suggested MP4 Export Workflow

1. Open `index.html` in Chrome or Edge using the autoplay policy command above.
2. Set the capture/browser viewport to 1080 x 1920.
3. Record 54 seconds for the full version, or open `index.html?version=teaser`
   and record 15 seconds.
4. Export as MP4, H.264 video plus AAC audio.

If using OBS:

- Canvas: 1080 x 1920
- Output: 1080 x 1920
- FPS: 30
- Source: Browser or Window Capture
- Audio: capture browser/system audio

## Files Included

- `index.html`
- `support.js`
- `LunchfyScenes.jsx`
- `css/tutorial.css`
- `js/tutorial.js`
- `assets/brand/*.png`
- `assets/category-icons/*.png`
- `assets/music/lunchfy-loop.wav`
- `original/Lunchfy Tutorial 9x16.dc.html`

There are no remote imports and no CDN dependencies.
