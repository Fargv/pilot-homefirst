# Auditoría de ingredientes de catálogo

Herramienta de solo lectura para comparar los 13 packs de `catalog-packs/` con `dish.recipe.ingredients` y los 5 platos bootstrap configurados en `src/kitchen/bootstrap/masterDishes.js`.

Ejecutar desde la raíz del repositorio:

```bash
npm --prefix backend run audit:catalog-ingredients
npm --prefix backend run audit:catalog-ingredients -- --text
```

La salida JSON y texto se construye ordenando archivos, índices y categorías; no se escriben JSON, MongoDB ni informes. La normalización elimina diferencias de mayúsculas, acentos, puntuación, espacios y plurales solo durante la comparación.

`exact_canonical` es igualdad tras normalizar; `variant` solo admite diferencias descriptivas seguras; `pantry_candidate` marca únicamente sal, pimienta, aceite y especias genéricas que aparecen solo en receta. Aceite de sésamo, mantequilla, salsa de soja, vinagre y caldo no se excluyen. `inconsistency` indica una diferencia no segura y `manual_review` una alternativa/ambigüedad o un master sin receta. Los duplicados se informan por plato y no se fusionan.
