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

  if (value.endsWith("ces")) return value.slice(0, -3) + "z"; // luces -> luz
  if (value.endsWith("es")) return value.slice(0, -2); // tomates -> tomate (heurística simple)
  if (value.endsWith("s")) return value.slice(0, -1); // patatas -> patata

  return value;
}

export function normalizeIngredientList(list = []) {
  return list
    .map((item) => {
      const displayName = String(item?.displayName || item?.name || item || "").trim();
      const canonicalName = String(item?.canonicalName || normalizeIngredientName(displayName)).trim();
      const ingredientId = item?.ingredientId || undefined;
      if (!displayName || !canonicalName) return null;
      return {
        displayName,
        canonicalName,
        ...(ingredientId ? { ingredientId } : {})
      };
    })
    .filter(Boolean);
}
