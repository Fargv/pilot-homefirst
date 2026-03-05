const COLOR_PALETTE = [
  { id: "lavender", label: "Lavanda", background: "#E9E4FF", text: "#4C3B91" },
  { id: "mint", label: "Menta", background: "#DDF8EC", text: "#1E6B52" },
  { id: "coral", label: "Coral", background: "#FFDCD6", text: "#9A3A2E" },
  { id: "sky", label: "Cielo", background: "#D9EEFF", text: "#1D4C7A" },
  { id: "sand", label: "Arena", background: "#F7EEDB", text: "#7A6440" },
  { id: "butter", label: "Mantequilla", background: "#FFF4C7", text: "#7A5A00" },
  { id: "ocean", label: "Oceano", background: "#D8F4F7", text: "#0F5F6A" },
  { id: "rose", label: "Rosa", background: "#FFE2EC", text: "#8C3358" }
];

const USER_COLOR_OVERRIDES_KEY = "kitchen_user_color_overrides";

const UNASSIGNED_COLOR = { background: "#F2F4F7", text: "#667085", border: "#D0D5DD" };

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function readOverrides() {
  try {
    const raw = localStorage.getItem(USER_COLOR_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeOverrides(nextOverrides) {
  localStorage.setItem(USER_COLOR_OVERRIDES_KEY, JSON.stringify(nextOverrides));
}

export function getUserColor(key) {
  if (!key) {
    return UNASSIGNED_COLOR;
  }
  const overrides = readOverrides();
  const selectedId = overrides[String(key)];
  if (selectedId) {
    const selected = COLOR_PALETTE.find((color) => color.id === selectedId);
    if (selected) return selected;
  }
  const index = hashString(String(key)) % COLOR_PALETTE.length;
  return COLOR_PALETTE[index];
}

export function getUserColorById(colorId, fallbackKey) {
  const safeColorId = String(colorId || "").trim().toLowerCase();
  if (safeColorId) {
    const selected = COLOR_PALETTE.find((color) => color.id === safeColorId);
    if (selected) return selected;
  }
  return getUserColor(fallbackKey);
}

export function getUnassignedColor() {
  return UNASSIGNED_COLOR;
}

export function getColorPalette() {
  return COLOR_PALETTE;
}

export function getUserColorPreference(userId) {
  if (!userId) return "";
  const overrides = readOverrides();
  return overrides[String(userId)] || "";
}

export function setUserColorPreference(userId, colorId) {
  if (!userId) return;
  const overrides = readOverrides();
  if (!colorId) {
    delete overrides[String(userId)];
  } else {
    overrides[String(userId)] = colorId;
  }
  writeOverrides(overrides);
}
