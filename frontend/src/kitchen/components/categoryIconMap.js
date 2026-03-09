import chickenIcon from "../../assets/category-icons/Chicken_tp.png";
import eggsIcon from "../../assets/category-icons/eggs_tp.png";
import fishIcon from "../../assets/category-icons/Fish_tp.png";
import legumesIcon from "../../assets/category-icons/Legumes_tp.png";
import meatIcon from "../../assets/category-icons/Meat_tp.png";
import pastaIcon from "../../assets/category-icons/Pasta_tp.png";
import riceIcon from "../../assets/category-icons/Rice_tp.png";
import sidesIcon from "../../assets/category-icons/Sides_tp.png";
import specialIcon from "../../assets/category-icons/Special_tp.png";
import vegetablesIcon from "../../assets/category-icons/Vegetables_tp.png";

const CATEGORY_ICON_BY_CODE = {
  carne: meatIcon,
  pollo_aves: chickenIcon,
  pescado: fishIcon,
  legumbres: legumesIcon,
  pasta: pastaIcon,
  arroz: riceIcon,
  verduras: vegetablesIcon,
  huevos: eggsIcon,
  guarniciones: sidesIcon,
  especial: specialIcon
};

const CATEGORY_CODE_ALIASES = {
  pollo: "pollo_aves",
  ave: "pollo_aves",
  aves: "pollo_aves",
  guarnicion: "guarniciones",
  especiales: "especial"
};

export function normalizeCategoryCode(rawValue) {
  return String(rawValue || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function resolveCategoryCode(category) {
  const candidates = [category?.code, category?.slug, category?.name];
  for (const value of candidates) {
    const normalized = normalizeCategoryCode(value);
    if (!normalized) continue;
    if (CATEGORY_ICON_BY_CODE[normalized]) return normalized;
    const alias = CATEGORY_CODE_ALIASES[normalized];
    if (alias && CATEGORY_ICON_BY_CODE[alias]) return alias;
  }
  return "";
}

export function getCategoryIconByCode(code) {
  const normalized = normalizeCategoryCode(code);
  return CATEGORY_ICON_BY_CODE[normalized] || null;
}
