from __future__ import annotations

import json
import math
import subprocess
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from moviepy import (
    AudioFileClip,
    CompositeAudioClip,
    CompositeVideoClip,
    ImageClip,
    VideoFileClip,
    concatenate_videoclips,
)


ROOT = Path(__file__).resolve().parent
SOURCE_DIR = Path(r"C:\APPS")
OUT = ROOT / "homefirst_tutorial_guiado_vertical.mp4"
TMP_OUT = ROOT / "homefirst_tutorial_guiado_vertical.tmp.mp4"
MUSIC = ROOT / "homefirst_tutorial_music.wav"
VOICE_DIR = ROOT / "voiceover"

W, H = 1080, 1920
FPS = 30
PHONE_W = 770
PHONE_H = 1370
PHONE_X = (W - PHONE_W) // 2
PHONE_Y = 322


SCENES = [
    {
        "kind": "intro",
        "duration": 5.0,
        "step": "HomeFirst",
        "title": "Organiza comidas, compra y cocina sin improvisar",
        "caption": "Un recorrido claro por el flujo principal de la app.",
        "voice": "HomeFirst te ayuda a organizar la semana, preparar la lista de la compra y cocinar siguiendo cada receta paso a paso.",
    },
    {
        "source": "Multimedia1.mp4",
        "start": 0,
        "end": 22,
        "speed": 1.05,
        "step": "1",
        "title": "Planifica la semana",
        "caption": "Elige el día, añade platos y deja cada comida colocada en el calendario.",
        "voice": "Primero entras en planificación. Desde aquí eliges el día de la semana y añades los platos que quieres preparar.",
    },
    {
        "source": "Multimedia1.mp4",
        "start": 25,
        "end": 45,
        "speed": 1.05,
        "step": "2",
        "title": "Programa o cocina al momento",
        "caption": "Cada receta se puede guardar para otro día o abrir directamente para cocinar.",
        "voice": "En cocina tienes tus recetas disponibles. Puedes programarlas en el calendario o empezar a cocinarlas en ese momento.",
    },
    {
        "source": "Multimedia1.mp4",
        "start": 68,
        "end": 88,
        "speed": 1.05,
        "step": "3",
        "title": "La lista se genera sola",
        "caption": "Ingredientes agrupados por secciones, cantidades editables y compra confirmada.",
        "voice": "Cuando la semana está lista, la app prepara automáticamente la lista de la compra con ingredientes agrupados y cantidades editables.",
    },
    {
        "source": "Multimedia1.mp4",
        "start": 90,
        "end": 124.5,
        "speed": 1.15,
        "step": "4",
        "title": "Instala packs de recetas",
        "caption": "Explora dietas, menús y colecciones para ampliar tu biblioteca.",
        "voice": "En el catálogo puedes instalar packs de recetas, menús y dietas. Así amplías la biblioteca sin tener que crear todo desde cero.",
    },
    {
        "source": "Multimedia2.mp4",
        "start": 0,
        "end": 43.8,
        "speed": 1.05,
        "step": "5",
        "title": "Cocina paso a paso",
        "caption": "Raciones ajustables, ingredientes por paso, temporizadores y progreso visible.",
        "voice": "Al abrir una receta, puedes ajustar las raciones y seguir la elaboración paso a paso, con ingredientes, temporizadores y progreso en pantalla.",
    },
    {
        "kind": "outro",
        "duration": 6.0,
        "step": "Listo",
        "title": "Menos lío. Más cocina hecha.",
        "caption": "Planifica, compra y cocina desde una sola app.",
        "voice": "HomeFirst une planificación, compra y cocina en un flujo sencillo para que sepas siempre qué toca preparar.",
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
            pass
    return ImageFont.load_default()


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in text.split():
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


def background() -> Image.Image:
    img = Image.new("RGB", (W, H), (251, 244, 239))
    draw = ImageDraw.Draw(img)
    for y in range(H):
        r = int(252 - 10 * y / H)
        g = int(246 - 16 * y / H)
        b = int(241 - 10 * y / H)
        draw.line((0, y, W, y), fill=(r, g, b))
    draw.rectangle((0, 0, W, 240), fill=(255, 249, 245))
    draw.rectangle((0, H - 235, W, H), fill=(255, 249, 245))
    return img


def card_layer(step: str, title: str, caption: str) -> ImageClip:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    title_font = font(52, True)
    caption_font = font(31)
    small_font = font(28, True)

    draw.rounded_rectangle((54, 64, W - 54, 254), radius=26, fill=(255, 255, 255, 235), outline=(196, 62, 68, 55), width=2)
    draw.rounded_rectangle((82, 96, 190, 148), radius=26, fill=(183, 43, 48, 255))
    step_text = f"Paso {step}" if step.isdigit() else step
    step_box = draw.textbbox((0, 0), step_text, font=small_font)
    draw.text((136 - (step_box[2] - step_box[0]) / 2, 106), step_text, font=small_font, fill=(255, 255, 255, 255))
    for i, line in enumerate(wrap(draw, title, title_font, 780)):
        draw.text((214, 86 + i * 58), line, font=title_font, fill=(35, 26, 25, 255))

    draw.rounded_rectangle((64, H - 202, W - 64, H - 70), radius=28, fill=(255, 255, 255, 238), outline=(196, 62, 68, 45), width=2)
    draw.rounded_rectangle((90, H - 174, 100, H - 98), radius=5, fill=(183, 43, 48, 255))
    for i, line in enumerate(wrap(draw, caption, caption_font, 840)):
        draw.text((124, H - 174 + i * 38), line, font=caption_font, fill=(76, 54, 52, 255))
    return ImageClip(np.array(img))


def phone_frame() -> ImageClip:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((PHONE_X - 12, PHONE_Y + 10, PHONE_X + PHONE_W + 12, PHONE_Y + PHONE_H + 28), 46, fill=(79, 38, 36, 72))
    shadow = shadow.filter(ImageFilter.GaussianBlur(24))
    img.alpha_composite(shadow)
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((PHONE_X - 18, PHONE_Y - 18, PHONE_X + PHONE_W + 18, PHONE_Y + PHONE_H + 18), 54, fill=(38, 33, 34, 255))
    draw.rounded_rectangle((PHONE_X - 8, PHONE_Y - 8, PHONE_X + PHONE_W + 8, PHONE_Y + PHONE_H + 8), 42, fill=(255, 255, 255, 255))
    draw.rounded_rectangle((PHONE_X, PHONE_Y, PHONE_X + PHONE_W, PHONE_Y + PHONE_H), 34, fill=(255, 247, 243, 255))
    return ImageClip(np.array(img))


def fit_phone(clip: VideoFileClip) -> VideoFileClip:
    scale = min(PHONE_W / clip.w, PHONE_H / clip.h)
    resized = clip.resized(scale)
    return resized.with_position((PHONE_X + (PHONE_W - resized.w) / 2, PHONE_Y + (PHONE_H - resized.h) / 2)).with_fps(FPS)


def make_solid_scene(scene: dict) -> CompositeVideoClip:
    base = ImageClip(np.array(background())).with_duration(scene["duration"])
    decor = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(decor)
    draw.rounded_rectangle((120, 420, W - 120, 1180), 54, fill=(255, 255, 255, 220), outline=(196, 62, 68, 45), width=2)
    draw.ellipse((W // 2 - 78, 520, W // 2 + 78, 676), fill=(255, 248, 244, 255), outline=(183, 43, 48, 90), width=3)
    draw.text((W // 2 - 36, 568), "HF", font=font(42, True), fill=(183, 43, 48, 255))
    for i, line in enumerate(wrap(draw, scene["title"], font(68, True), 720)):
        bbox = draw.textbbox((0, 0), line, font=font(68, True))
        draw.text(((W - (bbox[2] - bbox[0])) / 2, 760 + i * 82), line, font=font(68, True), fill=(34, 26, 25, 255))
    for i, line in enumerate(wrap(draw, scene["caption"], font(34), 720)):
        bbox = draw.textbbox((0, 0), line, font=font(34))
        draw.text(((W - (bbox[2] - bbox[0])) / 2, 1010 + i * 46), line, font=font(34), fill=(92, 64, 60, 255))
    return CompositeVideoClip([base, ImageClip(np.array(decor)).with_duration(scene["duration"])], size=(W, H))


def make_video_scene(scene: dict) -> CompositeVideoClip:
    source = VideoFileClip(str(SOURCE_DIR / scene["source"])).subclipped(scene["start"], scene["end"])
    source = source.with_speed_scaled(scene["speed"])
    screen = fit_phone(source)
    dur = screen.duration
    base = ImageClip(np.array(background())).with_duration(dur)
    frame = phone_frame().with_duration(dur)
    labels = card_layer(scene["step"], scene["title"], scene["caption"]).with_duration(dur)
    return CompositeVideoClip([base, frame, screen, labels], size=(W, H)).with_duration(dur)


def generate_voice(text: str, out: Path) -> None:
    if out.exists() and out.stat().st_size > 1000:
        return
    out.parent.mkdir(exist_ok=True)
    ps = f"""
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice('Microsoft Helena Desktop')
$s.Rate = -1
$s.Volume = 100
$s.SetOutputToWaveFile({json.dumps(str(out))})
$s.Speak({json.dumps(text)})
$s.Dispose()
"""
    subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )


def make_music(duration: float, path: Path) -> None:
    sr = 44100
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    audio = np.zeros_like(t)
    chords = [(196, 246.94, 293.66), (174.61, 220, 261.63), (207.65, 261.63, 329.63), (146.83, 196, 246.94)]
    bar = 3.2
    for idx, chord in enumerate(chords * (int(duration / (bar * 4)) + 2)):
        start = idx * bar
        mask = (t >= start) & (t < min(duration, start + bar))
        local = t[mask] - start
        env = np.minimum(local / 0.25, 1) * np.minimum((bar - local) / 0.45, 1)
        for freq in chord:
            audio[mask] += 0.045 * np.sin(2 * np.pi * freq * t[mask]) * env
        audio[mask] += 0.025 * np.sin(2 * np.pi * (chord[0] / 2) * t[mask]) * env
    fade = int(sr * 1.6)
    audio[:fade] *= np.linspace(0, 1, fade)
    audio[-fade:] *= np.linspace(1, 0, fade)
    pcm = (np.tanh(audio) * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sr)
        wav.writeframes(pcm.tobytes())


def main() -> None:
    if TMP_OUT.exists():
        TMP_OUT.unlink()
    clips = []
    scene_starts = []
    cursor = 0.0
    for scene in SCENES:
        clip = make_solid_scene(scene) if scene.get("kind") in {"intro", "outro"} else make_video_scene(scene)
        clips.append(clip)
        scene_starts.append(cursor)
        cursor += clip.duration

    video = concatenate_videoclips(clips, method="compose")
    make_music(video.duration, MUSIC)

    audio_layers = [AudioFileClip(str(MUSIC)).with_duration(video.duration).with_volume_scaled(0.13)]
    for index, scene in enumerate(SCENES):
        voice_path = VOICE_DIR / f"scene_{index + 1:02d}.wav"
        generate_voice(scene["voice"], voice_path)
        voice = AudioFileClip(str(voice_path)).with_start(scene_starts[index] + 0.35).with_volume_scaled(1.0)
        audio_layers.append(voice)
    video = video.with_audio(CompositeAudioClip(audio_layers).with_duration(video.duration))

    video.write_videofile(
        str(TMP_OUT),
        fps=FPS,
        codec="libx264",
        audio_codec="aac",
        bitrate="5000k",
        preset="ultrafast",
        threads=4,
        logger="bar",
    )
    TMP_OUT.replace(OUT)
    video.close()
    for clip in clips:
        clip.close()
    for layer in audio_layers:
        layer.close()


if __name__ == "__main__":
    main()
