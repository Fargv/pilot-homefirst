# Personalization contract v1

The optional `personalization` object belongs to a dish template and to an installed `KitchenDish`. Historical records may omit it. `schemaVersion` is currently `1`; an unsupported version is not interpreted as version 1.

Required fields:

- `schemaVersion`: integer `1`.
- `mealSlots`: a non-empty unique array containing `lunch` and/or `dinner`. This metadata is independent of the legacy `isDinner` flag.
- `ingredientsComplete`: `unknown`, `complete`, or `incomplete`. Missing or incomplete ingredient lists must never be treated as complete.
- `baseServings`: positive number, or `null` when unknown.
- `provenance`: `{ source, sourceVersion, contentHash }`, where `contentHash` is `sha256:` followed by 64 hexadecimal characters.

Optional fields are `times` (`prepMinutes`, `cookMinutes`, and/or `totalMinutes`, each a non-negative number), and `requiredEquipment` (array of non-empty strings).

`assessments` can contain extensible `allergens` and `diets` maps keyed by stable identifiers. Each entry is `{ status }`, where status is `unknown`, `compatible`, or `incompatible`. `unknown` is explicit and may omit evidence. A known status requires `evidence: { assessmentId, source, sourceVersion, contentHash, assessedAt }`; the content hash uses the same SHA-256 form and assessedAt is an ISO timestamp. Allergen entries also need an explicit `crossContact` assessment before they can satisfy a hard restriction; unknown cross-contact excludes the recipe.

Evidence fields alone are not verification. The pure hard-restriction evaluator admits a recipe only when ingredients are explicitly complete, the assessment and provenance hashes match the caller-supplied hash of the current recipe content, and an injected trusted `verifyEvidence` function confirms each assessment (including allergen cross-contact evidence). That verifier is the trust boundary and must validate authority, freshness, and revocation against the actual evidence source; absent verifier means exclude. Edits to recipe content invalidate prior assessments through the content hash. `incompatible`, unknown, incomplete ingredients, missing evidence, unknown cross-contact, stale content, or unverified assessments exclude the recipe. With no hard restrictions, missing historical metadata does not exclude a recipe. The evaluator is intentionally not connected to the planner in this increment.

Run the read-only local coverage report with `npm run audit:personalization --prefix backend`. It scans versioned files in `backend/catalog-packs` and does not write to them.
