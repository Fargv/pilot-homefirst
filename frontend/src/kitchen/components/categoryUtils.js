export const emptyCategory = { _id: "", name: "", colorBg: "#E8F1FF", colorText: "#1D4ED8" };

export const PASTEL_PALETTE = [
  { colorBg: "#E8F1FF", colorText: "#1D4ED8" },
  { colorBg: "#FFE8E5", colorText: "#B42318" },
  { colorBg: "#E7F8EE", colorText: "#027A48" },
  { colorBg: "#FFF4D6", colorText: "#8A6A00" },
  { colorBg: "#F3E8FF", colorText: "#6D28D9" },
  { colorBg: "#FFE8F1", colorText: "#BE185D" },
  { colorBg: "#E0F2FE", colorText: "#0369A1" },
  { colorBg: "#F2F4F7", colorText: "#344054" }
];

export const resolveCategoryColors = (category) => {
  if (!category) return emptyCategory;
  const seed = `${category.name || ""}${category._id || ""}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }
  const palette = PASTEL_PALETTE[Math.abs(hash) % PASTEL_PALETTE.length];
  return {
    colorBg: palette.colorBg,
    colorText: palette.colorText
  };
};
