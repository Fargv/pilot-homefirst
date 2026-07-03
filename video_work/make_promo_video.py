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
OUT = ROOT / "homefirst_promo_vertical.mp4"
TMP_OUT = ROOT / "homefirst_promo_vertical.tmp.mp4"
MUSIC = ROOT / "homefirst_music_loop.wav"

W, H = 1080, 1920
FPS = 30


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def cover_resize(clip: VideoFileClip) -> VideoFileClip:
    scale = max(W / clip.w, H / clip.h)
    resized = clip.resized(scale)
    return resized.cropped(
        x_center=resized.w / 2,
        y_center=resized.h / 2,
        width=W,
        height=H,
    ).with_fps(FPS)


def rounded_rect(draw: ImageDraw.ImageDraw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def make_overlay(text: str, subtext: str | None = None, align: str = "top") -> ImageClip:
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    title_font = font(62, bold=True)
    sub_font = font(34)
    pad_x = 64
    max_width = W - pad_x * 2

    def wrap(value: str, fnt: ImageFont.FreeTypeFont) -> list[str]:
        words = value.split()
        lines: list[str] = []
        current = ""
        for word in words:
            trial = f"{current} {word}".strip()
            if draw.textbbox((0, 0), trial, font=fnt)[2] <= max_width:
                current = trial
            else:
                if current:
                    lines.append(current)
                current = word
        if current:
            lines.append(current)
        return lines

    lines = wrap(text, title_font)
    sub_lines = wrap(subtext, sub_font) if subtext else []
    line_h = 76
    sub_h = 46
    box_h = 56 + len(lines) * line_h + len(sub_lines) * sub_h + (18 if sub_lines else 0)
    y0 = 92 if align == "top" else H - box_h - 138
    x0, x1 = 42, W - 42

    rounded_rect(draw, (x0, y0, x1, y0 + box_h), 34, (255, 248, 244, 232), (178, 43, 47, 70), 2)
    accent_w = 10
    rounded_rect(draw, (x0 + 24, y0 + 28, x0 + 24 + accent_w, y0 + box_h - 28), 5, (183, 43, 48, 255))

    y = y0 + 32
    for line in lines:
        draw.text((x0 + 52, y), line, font=title_font, fill=(33, 24, 23, 255))
        y += line_h
    if sub_lines:
        y += 6
        for line in sub_lines:
            draw.text((x0 + 54, y), line, font=sub_font, fill=(103, 65, 62, 255))
            y += sub_h

    return ImageClip(np.array(overlay))


def make_logo_bug() -> ImageClip:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    x, y, s = W - 174, 74, 96
    draw.ellipse((x, y, x + s, y + s), fill=(255, 255, 255, 235), outline=(171, 225, 214, 255), width=5)
    draw.text((x + 27, y + 24), "HF", font=font(30, True), fill=(34, 122, 108, 255))
    return ImageClip(np.array(img))


def make_end_card(duration: float = 3.0) -> CompositeVideoClip:
    bg = Image.new("RGB", (W, H), (255, 247, 243))
    draw = ImageDraw.Draw(bg)
    for i in range(0, H, 18):
        tone = int(245 + 8 * math.sin(i / 95))
        draw.rectangle((0, i, W, i + 18), fill=(255, tone, 242))
    bg = bg.filter(ImageFilter.GaussianBlur(0.4))
    base = ImageClip(np.array(bg)).with_duration(duration)

    text = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(text)
    d.ellipse((W // 2 - 96, 430, W // 2 + 96, 622), fill=(255, 255, 255, 245), outline=(183, 43, 48, 60), width=3)
    d.text((W // 2 - 42, 484), "HF", font=font(54, True), fill=(183, 43, 48, 255))
    title = "Tu semana, organizada"
    subtitle = "Planifica, compra y cocina desde una sola app"
    cta = "Pruébala hoy"
    title_font = font(72, True)
    sub_font = font(36)
    cta_font = font(42, True)
    for value, fnt, y, color in [
        (title, title_font, 720, (34, 24, 23, 255)),
        (subtitle, sub_font, 830, (102, 65, 62, 255)),
    ]:
        bbox = d.textbbox((0, 0), value, font=fnt)
        d.text(((W - (bbox[2] - bbox[0])) / 2, y), value, font=fnt, fill=color)
    rounded_rect(d, (276, 1018, 804, 1134), 58, (183, 43, 48, 255))
    bbox = d.textbbox((0, 0), cta, font=cta_font)
    d.text(((W - (bbox[2] - bbox[0])) / 2, 1050), cta, font=cta_font, fill=(255, 255, 255, 255))
    return CompositeVideoClip([base, ImageClip(np.array(text)).with_duration(duration)], size=(W, H))


def make_music(duration: float, path: Path) -> None:
    sr = 44100
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    audio = np.zeros_like(t)
    bpm = 108
    beat = 60 / bpm
    chords = [
        (261.63, 329.63, 392.00),
        (220.00, 261.63, 329.63),
        (246.94, 293.66, 369.99),
        (196.00, 246.94, 329.63),
    ]
    bar = beat * 4
    for idx, chord in enumerate(chords * (int(duration / (bar * 4)) + 2)):
        start = idx * bar
        mask = (t >= start) & (t < min(duration, start + bar))
        local = t[mask] - start
        env = np.minimum(local / 0.08, 1.0) * np.minimum((bar - local) / 0.28, 1.0)
        for freq in chord:
            audio[mask] += 0.06 * np.sin(2 * np.pi * freq * t[mask]) * env
        bass_freq = chord[0] / 2
        audio[mask] += 0.08 * np.sin(2 * np.pi * bass_freq * t[mask]) * env

    rng = np.random.default_rng(7)
    for n in range(int(duration / beat) + 1):
        start = n * beat
        idx = (t >= start) & (t < start + 0.18)
        local = t[idx] - start
        audio[idx] += 0.28 * np.sin(2 * np.pi * 64 * local) * np.exp(-local * 26)
        hat_start = start + beat / 2
        idx = (t >= hat_start) & (t < hat_start + 0.05)
        local = t[idx] - hat_start
        audio[idx] += 0.035 * rng.normal(0, 1, idx.sum()) * np.exp(-local * 70)

    fade_len = int(sr * 1.0)
    audio[:fade_len] *= np.linspace(0, 1, fade_len)
    audio[-fade_len:] *= np.linspace(1, 0, fade_len)
    audio = np.tanh(audio * 1.3)
    pcm = (audio * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sr)
        wav.writeframes(pcm.tobytes())


def segment(path: str, start: float, end: float, speed: float, title: str, subtitle: str, align: str = "top"):
    clip = VideoFileClip(str(SOURCE_DIR / path)).subclipped(start, end).with_speed_scaled(speed)
    clip = cover_resize(clip)
    overlay = make_overlay(title, subtitle, align).with_duration(clip.duration)
    logo = make_logo_bug().with_duration(clip.duration)
    return CompositeVideoClip([clip, overlay, logo], size=(W, H)).with_duration(clip.duration)


def main() -> None:
    if TMP_OUT.exists():
        TMP_OUT.unlink()
    parts = [
        segment(
            "Multimedia1.mp4",
            0,
            22,
            3.2,
            "Planifica tus comidas",
            "Añade platos a cada día de la semana",
            "top",
        ),
        segment(
            "Multimedia1.mp4",
            25,
            45,
            3.0,
            "Recetas a tu medida",
            "Raciones, ingredientes y agenda en segundos",
            "bottom",
        ),
        segment(
            "Multimedia1.mp4",
            68,
            88,
            2.8,
            "Lista automática",
            "Todo lo que necesitas, agrupado para comprar",
            "top",
        ),
        segment(
            "Multimedia1.mp4",
            90,
            112,
            3.0,
            "Inspírate con packs",
            "Instala menús y recetas cuando quieras",
            "bottom",
        ),
        segment(
            "Multimedia2.mp4",
            0,
            43.8,
            2.5,
            "Cocina paso a paso",
            "Temporizador, ingredientes y progreso en pantalla",
            "top",
        ),
        make_end_card(3.0),
    ]
    video = concatenate_videoclips(parts, method="compose", padding=-0.12)
    make_music(video.duration, MUSIC)
    audio = AudioFileClip(str(MUSIC)).with_duration(video.duration).with_volume_scaled(0.35)
    video = video.with_audio(audio)
    video.write_videofile(
        str(TMP_OUT),
        fps=FPS,
        codec="libx264",
        audio_codec="aac",
        bitrate="4500k",
        preset="ultrafast",
        threads=4,
        logger="bar",
    )
    TMP_OUT.replace(OUT)
    video.close()
    audio.close()
    for part in parts:
        part.close()


if __name__ == "__main__":
    main()
