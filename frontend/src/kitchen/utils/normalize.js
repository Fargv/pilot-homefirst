export function normalizeIngredientName(value = "") {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";

  const noAccents = trimmed.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const noPunctuation = noAccents.replace(/[.,;:!¡¿?()\[\]{}"'`´]/g, "");
  const normalizedSpaces = noPunctuation.replace(/\s+/g, " ").trim();

  return singularize(normalizedSpaces);
}

function singularize(value) {
  if (value.length <= 3) return value;

  if (value.endsWith("ces")) return value.slice(0, -3) + "z";
  if (value.endsWith("es")) return value.slice(0, -2);
  if (value.endsWith("s")) return value.slice(0, -1);

  return value;
}
