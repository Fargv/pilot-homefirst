export function parseCleanupFlags(argv) {
  const apply = argv.includes("--apply");
  const dryRun = argv.includes("--dry-run");
  const confirm = argv.includes("--confirm");
  if (apply === dryRun) {
    throw new Error("Usa exactamente un modo: --dry-run o --apply (son mutuamente excluyentes).");
  }
  if (apply && !confirm) {
    throw new Error("El modo --apply requiere confirmación explícita con --confirm.");
  }
  return { mode: apply ? "apply" : "dry-run", confirm };
}
