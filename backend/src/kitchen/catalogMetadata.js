import crypto from "crypto";

export function normalizePersonalizationForHash(personalization) {
  return personalization === undefined ? null : personalization;
}

export function catalogMetadataHash(template, normalizeTemplate) {
  const normalized = normalizeTemplate(template);
  normalized.personalization = normalizePersonalizationForHash(template.personalization);
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function copyPersonalizationFromTemplate(template, dish) {
  if (template.personalization === undefined) delete dish.personalization;
  else dish.personalization = template.personalization;
  return dish;
}
