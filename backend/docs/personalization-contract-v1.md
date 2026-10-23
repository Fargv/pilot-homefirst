# Personalization contract v1

The optional `personalization` object belongs to a dish template and to an installed `KitchenDish`. Historical records may omit it. `schemaVersion` is currently `1`; an unsupported version is not interpreted as version 1.

Required fields:

- `schemaVersion`: integer `1`.
- `mealSlots`: a non-empty unique array containing `lunch` and/or `dinner`. This metadata is independent of the legacy `isDinner` flag.
- `ingredientsComplete`: `unknown`, `complete`, or `incomplete`. Missing or incomplete ingredient lists must never be treated as complete.
- `baseServings`: positive number, or `null` when unknown.
- `provenance`: `{ source, sourceVersion, contentHash }`, where `contentHash` is `sha256:` followed by 64 hexadecimal characters.

Optional fields are `times` (`prepMinutes`, `cookMinutes`, and/or `totalMinutes`, each a non-negative number), and `requiredEquipment` (array of non-empty strings).

`assessments` can contain extensible `allergens` and `diets` maps keyed by stable identifiers. Each entry is `{ status }`, where status is `unknown`, `compatible`, or `incompatible`. `unknown` is explicit and may omit evidence. A known status requires `evidence: { source, sourceVersion, contentHash, assessedAt }`; the content hash uses the same SHA-256 form and assessedAt is an ISO timestamp. No ingredient, category, pack, name, or legacy dinner flag is used to infer these assessments.

The hard-restriction evaluator admits a recipe only when every requested restriction has a valid, evidenced `compatible` assessment. `incompatible`, unknown, missing, or malformed assessments exclude the recipe. With no hard restrictions, missing historical metadata does not exclude a recipe. The evaluator is intentionally not connected to the planner in this increment.

Run the read-only local coverage report with `npm run audit:personalization --prefix backend`. It scans versioned files in `backend/catalog-packs` and does not write to them.
