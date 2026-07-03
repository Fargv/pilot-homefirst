(() => {
  const stage = document.querySelector(".stage");
  const scenes = Array.from(document.querySelectorAll(".scene"));
  const progressBar = document.querySelector(".progress span");
  const audio = document.getElementById("soundtrack");
  const params = new URLSearchParams(window.location.search);
  const version = params.get("version") === "teaser" ? "teaser" : "full";
  const duration = Number(stage.dataset[version === "teaser" ? "durationTeaser" : "durationFull"]);
  const sceneMapFull = [
    { id: "hero", start: 0, end: 7 },
    { id: "problem", start: 7, end: 15 },
    { id: "plan", start: 15, end: 25 },
    { id: "recipes", start: 25, end: 34 },
    { id: "shopping", start: 34, end: 43 },
    { id: "family", start: 43, end: 50 },
    { id: "final", start: 50, end: 54 },
  ];
  const sceneMapTeaser = [
    { id: "hero", start: 0, end: 4 },
    { id: "plan", start: 4, end: 8 },
    { id: "shopping", start: 8, end: 12 },
    { id: "final", start: 12, end: 15 },
  ];
  const sceneMap = version === "teaser" ? sceneMapTeaser : sceneMapFull;
  let startedAt = performance.now();
  let audioStarted = false;

  function startAudio() {
    if (!audio || audioStarted) return;
    audio.volume = 0.72;
    const attempt = audio.play();
    if (attempt?.catch) {
      attempt.catch(() => {
        document.body.classList.add("audio-blocked");
      });
    }
    audioStarted = true;
  }

  function setScene(t) {
    const active = sceneMap.find((scene) => t >= scene.start && t < scene.end) || sceneMap[sceneMap.length - 1];
    for (const node of scenes) {
      const id = node.dataset.scene;
      const meta = sceneMap.find((scene) => scene.id === id);
      node.classList.toggle("is-active", id === active.id);
      node.classList.toggle("is-past", Boolean(meta && t >= meta.end));
    }
  }

  function tick(now) {
    const elapsed = (now - startedAt) / 1000;
    const t = elapsed % duration;
    setScene(t);
    stage.style.setProperty("--progress", String(t / duration));
    if (progressBar) {
      progressBar.style.width = `${(t / duration) * 100}%`;
    }
    requestAnimationFrame(tick);
  }

  function boot() {
    startAudio();
    setScene(0);
    requestAnimationFrame(tick);
  }

  window.LunchfyTutorial = {
    version,
    duration,
    restart() {
      startedAt = performance.now();
      if (audio) audio.currentTime = 0;
      startAudio();
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
