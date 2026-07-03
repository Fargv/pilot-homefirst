from __future__ import annotations

import math
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from moviepy import (
    AudioFileClip,
    CompositeVideoClip,
    ImageClip,
    VideoFileClip,
    concatenate_videoclips,
)


ROOT = Path(__file__).resolve().parent
SOURCE_DIR = Path(r"C:\APPS")
OUT = ROOT / "homefirst_tutorial_pulido_vertical.mp4"
TMP_OUT = ROOT / "homefirst_tutorial_pulido_vertical.tmp.mp4"
MUSIC = ROOT / "homefirst_polished_music.wav"

W, H = 1080, 1920
FPS = 24

RED = (178, 43, 48, 255)
INK = (37, 27, 26, 255)
MUTED = (100, 70, 66, 255)
CREAM = (255, 249, 245, 255)


SCENES = [
    {
        "type": "card",
        "duration": 3.5,
        "kicker": "HOMEFIRST",
        "title": "Planifica. Compra. Cocina.",
        "body": "Un recorrido guiado por las funciones principales.",
    },
    {
        "type": "video",
        "source": "Multimedia1.mp4",
        "start": 0,
        "end": 22,
        "speed": 1.0,
        "step": "01",
        "title": "Planifica tu semana",
        "body": "Selecciona el día y añade platos al menú semanal.",
    },
    {
        "type": "video",
        "source": "Multimedia1.mp4",
        "start": 25,
        "end": 45,
        "speed": 1.0,
        "step": "02",
        "title": "Programa recetas",
        "body": "Guarda cada receta para otro día o empieza a cocinarla al momento.",
    },
    {
        "type": "video",
        "source": "Multimedia1.mp4",
        "start": 68,
        "end": 88,
        "speed": 1.0,
        "step": "03",
        "title": "Genera la lista de la compra",
        "body": "Los ingredientes aparecen agrupados por sección y con cantidades editables.",
    },
    {
        "type": "video",
        "source": "Multimedia1.mp4",
        "start": 90,
        "end": 99.5,
        "speed": 0.92,
        "step": "04",
        "title": "Descubre packs y menús",
        "body": "Explora dietas, menús y colecciones para ampliar tu biblioteca.",
    },
    {
        "type": "video",
        "source": "Multimedia2.mp4",
        "start": 0,
        "end": 43.8,
        "speed": 1.0,
        "step": "05",
        "title": "Cocina paso a paso",
        "body": "Ajusta raciones, sigue instrucciones, temporizadores e ingredientes por paso.",
    },
    {
        "type": "card",
        "duration": 4.0,
        "kicker": "LISTO",
        "title": "Todo el flujo en una sola app",
        "body": "Menú semanal, lista automática y recetas guiadas.",
    },
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    names = [
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
    ]
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in text.split():
        trial = f"{current} {word}".strip()
        width = draw.textbbox((0, 0), trial, font=fnt)[2]
        if width <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def gradient_background() -> Image.Image:
    img = Image.new("RGB", (W, H), (255, 248, 244))
    px = img.load()
    for y in range(H):
        for x in range(W):
            glow = 11 * math.sin((x + y) / 410)
            r = int(255 - 12 * y / H + glow * 0.15)
            g = int(249 - 19 * y / H + glow * 0.08)
            b = int(245 - 13 * y / H)
            px[x, y] = (max(230, min(255, r)), max(226, min(255, g)), max(222, min(255, b)))
    return img.filter(ImageFilter.GaussianBlur(0.6))


def fit_fullscreen(clip: VideoFileClip) -> VideoFileClip:
    scale = max(W / clip.w, H / clip.h)
    resized = clip.resized(scale)
    return resized.cropped(
        x_center=resized.w / 2,
        y_center=resized.h / 2,
        width=W,
        height=H,
    ).with_fps(FPS)


def overlay_layer(step: str, title: str, body: str) -> ImageClip:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    title_font = font(44, True)
    body_font = font(30)
    step_font = font(24, True)

    # Header pill. It is intentionally compact so the real app stays visible.
    draw.rounded_rectangle((42, 58, W - 42, 176), radius=28, fill=(255, 255, 255, 238), outline=(185, 55, 60, 58), width=2)
    draw.rounded_rectangle((72, 88, 156, 136), radius=24, fill=RED)
    draw.text((95, 96), step, font=step_font, fill=(255, 255, 255, 255))
    draw.text((184, 80), title, font=title_font, fill=INK)

    # Bottom explanation, above the app navigation.
    y0 = H - 270
    draw.rounded_rectangle((42, y0, W - 42, H - 122), radius=30, fill=(255, 255, 255, 240), outline=(185, 55, 60, 60), width=2)
    draw.rounded_rectangle((72, y0 + 30, 82, H - 154), radius=5, fill=RED)
    y = y0 + 30
    for line in wrap(draw, body, body_font, 845):
        draw.text((108, y), line, font=body_font, fill=MUTED)
        y += 40

    return ImageClip(np.array(img))


def card_scene(scene: dict) -> CompositeVideoClip:
    img = gradient_background().convert("RGBA")
    draw = ImageDraw.Draw(img)
    kicker_font = font(28, True)
    title_font = font(72, True)
    body_font = font(36)

    draw.rounded_rectangle((126, 504, W - 126, 1188), radius=44, fill=(255, 255, 255, 232), outline=(185, 55, 60, 50), width=2)
    draw.ellipse((W // 2 - 74, 596, W // 2 + 74, 744), fill=CREAM, outline=(185, 55, 60, 90), width=3)
    draw.text((W // 2 - 34, 642), "HF", font=font(40, True), fill=RED)

    kicker = scene["kicker"]
    kbox = draw.textbbox((0, 0), kicker, font=kicker_font)
    draw.text(((W - (kbox[2] - kbox[0])) / 2, 812), kicker, font=kicker_font, fill=RED)

    y = 872
    for line in wrap(draw, scene["title"], title_font, 690):
        box = draw.textbbox((0, 0), line, font=title_font)
        draw.text(((W - (box[2] - box[0])) / 2, y), line, font=title_font, fill=INK)
        y += 82

    y += 24
    for line in wrap(draw, scene["body"], body_font, 690):
        box = draw.textbbox((0, 0), line, font=body_font)
        draw.text(((W - (box[2] - box[0])) / 2, y), line, font=body_font, fill=MUTED)
        y += 48

    return CompositeVideoClip([ImageClip(np.array(img)).with_duration(scene["duration"])], size=(W, H))


def video_scene(scene: dict) -> CompositeVideoClip:
    raw = VideoFileClip(str(SOURCE_DIR / scene["source"])).subclipped(scene["start"], scene["end"])
    raw = raw.with_speed_scaled(scene["speed"])
    screen = fit_fullscreen(raw)
    overlay = overlay_layer(scene["step"], scene["title"], scene["body"]).with_duration(screen.duration)
    return CompositeVideoClip([screen, overlay], size=(W, H)).with_duration(screen.duration)


def make_music(duration: float, path: Path) -> None:
    sr = 44100
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    audio = np.zeros_like(t)
    bpm = 92
    beat = 60 / bpm
    chords = [
        (196.00, 246.94, 293.66, 392.00),
        (174.61, 220.00, 261.63, 349.23),
        (207.65, 261.63, 329.63, 415.30),
        (146.83, 196.00, 246.94, 293.66),
    ]
    bar = beat * 4
    for idx, chord in enumerate(chords * (int(duration / (bar * len(chords))) + 3)):
        start = idx * bar
        mask = (t >= start) & (t < min(duration, start + bar))
        local = t[mask] - start
        env = np.minimum(local / 0.18, 1) * np.minimum((bar - local) / 0.42, 1)
        for freq in chord:
            audio[mask] += 0.035 * np.sin(2 * np.pi * freq * t[mask]) * env
        audio[mask] += 0.045 * np.sin(2 * np.pi * (chord[0] / 2) * t[mask]) * env

    # Soft pulse, deliberately understated.
    for n in range(int(duration / beat) + 1):
        start = n * beat
        mask = (t >= start) & (t < start + 0.13)
        local = t[mask] - start
        audio[mask] += 0.055 * np.sin(2 * np.pi * 74 * local) * np.exp(-local * 28)

    fade = int(sr * 1.5)
    audio[:fade] *= np.linspace(0, 1, fade)
    audio[-fade:] *= np.linspace(1, 0, fade)
    pcm = (np.tanh(audio * 1.1) * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sr)
        wav.writeframes(pcm.tobytes())


def main() -> None:
    if TMP_OUT.exists():
        TMP_OUT.unlink()
    clips = [card_scene(scene) if scene["type"] == "card" else video_scene(scene) for scene in SCENES]
    video = concatenate_videoclips(clips, method="compose")
    make_music(video.duration, MUSIC)
    audio = AudioFileClip(str(MUSIC)).with_duration(video.duration).with_volume_scaled(0.22)
    video = video.with_audio(audio)
    video.write_videofile(
        str(TMP_OUT),
        fps=FPS,
        codec="libx264",
        audio_codec="aac",
        bitrate="6000k",
        preset="ultrafast",
        threads=4,
        logger="bar",
    )
    TMP_OUT.replace(OUT)
    video.close()
    audio.close()
    for clip in clips:
        clip.close()


if __name__ == "__main__":
    main()
