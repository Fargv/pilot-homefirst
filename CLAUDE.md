## Catalog recipe agent

When creating or editing catalog pack recipes, follow the Guided Cooking Mode rules in this order:

1. Build the **general ingredients list** first (structured quantities — amount, unit, scalable, originalText).
2. Create **structured steps** (order, title, text, hasTimer, durationSeconds, timerLabel).
3. Add **`ingredientRefs`** to each step — only names that exist in the general ingredient list, no quantities inside refs.

Key rules:
- `baseServings` always set (default 4)
- `ingredientRefs` = only ingredients physically used in that step
- Never store quantities in `ingredientRefs` — quantities live on the general ingredient
- If a step uses an ingredient not in the list, add it to the list first
- After any update, report: recipes changed, ingredients added, refs added, anything needing review

Full rules: `~/.claude/projects/C--APPS-pilot-homefirst/memory/catalog_recipe_rules.md`

After every new pack: run `node backend/scripts/seedCatalog.js`

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
