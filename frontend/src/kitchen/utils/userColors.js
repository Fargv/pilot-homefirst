const COLOR_PALETTE = [
  { background: "#E0E7FF", text: "#3730A3" },
  { background: "#DBEAFE", text: "#1E40AF" },
  { background: "#D1FAE5", text: "#065F46" },
  { background: "#FEF3C7", text: "#92400E" },
  { background: "#FDE68A", text: "#92400E" },
  { background: "#FCE7F3", text: "#9D174D" },
  { background: "#EDE9FE", text: "#5B21B6" },
  { background: "#F3E8FF", text: "#6B21A8" }
];

const UNASSIGNED_COLOR = { background: "#F2F4F7", text: "#667085", border: "#D0D5DD" };

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getUserColor(key) {
  if (!key) {
    return UNASSIGNED_COLOR;
  }
  const index = hashString(String(key)) % COLOR_PALETTE.length;
  return COLOR_PALETTE[index];
}

export function getUnassignedColor() {
  return UNASSIGNED_COLOR;
}
