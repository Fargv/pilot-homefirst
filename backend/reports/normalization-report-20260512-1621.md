# Lunchfy normalization report 20260512-1621

Mode: dry-run

## Summary

- Ingredients analyzed: 289
- Duplicate ingredient groups: 4
- Ingredients missing categoryId: 0
- Dish ingredient refs to update: 0
- Catalog ingredient refs to update: 0
- Ingredients to create: 0
- Dish categories to assign: 0
- Manual review items: 29
- Skipped unsafe items: 0

## Duplicate ingredient groups

- pan brioche: preferred Pan Brioche (69979a897235b4707c913481)
  - Pan Brioche (69986c2f6a13bb1a6e2f7955) category=699b7eec8deb38b04dd30163 usage=0
  - Pan Brioche (69979a897235b4707c913481) category=699b7eec8deb38b04dd30163 usage=3
- queso en loncha: preferred Queso en Lonchas (69979aab7235b4707c913495)
  - Queso en Lonchas (69986c1e6a13bb1a6e2f7944) category=699b7eec8deb38b04dd30162 usage=0
  - Queso en Lonchas (69979aab7235b4707c913495) category=699b7eec8deb38b04dd30162 usage=8
- pulpo: preferred Pulpo (697389abf38758705669ee09)
  - Pulpo (697389abf38758705669ee09) category=699b7eec8deb38b04dd30160 usage=0
  - Pulpo (69987decabe44e589730b34b) category=699b7eec8deb38b04dd30160 usage=0
- patata congeladas: preferred Patatas congeladas (6976317e8764694d965b99f9)
  - Patatas congeladas (6976317e8764694d965b99f9) category=699b7eec8deb38b04dd30165 usage=3
  - Patatas congeladas (699b81f88deb38b04dd3018d) category=699b7eec8deb38b04dd30165 usage=0

## Ingredients to create

- None

## Manual review

- missing_dish_category in kitchenDishes Gambones al Vapor at dishCategoryId: no safe dish category inference
- missing_dish_category in kitchenDishes Pato Laqueado at dishCategoryId: no safe dish category inference
- missing_master_ingredient in kitchenDishes Enchiladas verdes at ingredients.0: No existing master ingredient and no safe category inference.
- missing_master_ingredient in kitchenDishes Sopa de tortilla at ingredients.3: No existing master ingredient and no safe category inference.
- missing_master_ingredient in kitchenDishes Burritos de ternera at ingredients.3: No existing master ingredient and no safe category inference.
- missing_master_ingredient in kitchenDishes Fajitas de pollo at ingredients.0: No existing master ingredient and no safe category inference.
- missing_dish_category in kitchenDishes Gambas al ajillo at dishCategoryId: no safe dish category inference
- missing_master_ingredient in kitchenDishes Caldo de Navidad con galets at ingredients.0: No existing master ingredient and no safe category inference.
- missing_dish_category in kitchenDishes Langostinos a la plancha at dishCategoryId: no safe dish category inference
- missing_master_ingredient in kitchenDishes Langostinos a la plancha at ingredients.0: No existing master ingredient and no safe category inference.
- missing_master_ingredient in kitchenDishes Besugo al horno at ingredients.0: No existing master ingredient and no safe category inference.
- missing_master_ingredient in kitchenDishes Besugo al horno at ingredients.6: No existing master ingredient and no safe category inference.
- missing_master_ingredient in kitchenDishes Cordero asado al horno at ingredients.5: No existing master ingredient and no safe category inference.
- missing_master_ingredient in kitchenDishes Pavo relleno de Navidad at ingredients.0: No existing master ingredient and no safe category inference.
- missing_master_ingredient in kitchenDishes Pavo relleno de Navidad at ingredients.2: No existing master ingredient and no safe category inference.
- missing_master_ingredient in kitchenDishes Pavo relleno de Navidad at ingredients.3: No existing master ingredient and no safe category inference.
- missing_master_ingredient in kitchenDishes Pavo relleno de Navidad at ingredients.7: No existing master ingredient and no safe category inference.
- missing_master_ingredient in catalogPacks mexican-pack-vol1 / Enchiladas verdes at dishes.1.ingredients.0: No existing master ingredient and no safe category inference.
- missing_master_ingredient in catalogPacks mexican-pack-vol1 / Sopa de tortilla at dishes.4.ingredients.3: No existing master ingredient and no safe category inference.
- missing_master_ingredient in catalogPacks mexican-pack-vol1 / Burritos de ternera at dishes.6.ingredients.3: No existing master ingredient and no safe category inference.
- missing_master_ingredient in catalogPacks mexican-pack-vol1 / Fajitas de pollo at dishes.9.ingredients.0: No existing master ingredient and no safe category inference.
- missing_master_ingredient in catalogPacks navidad-espanola-vol1 / Caldo de Navidad con galets at dishes.0.ingredients.0: No existing master ingredient and no safe category inference.
- missing_master_ingredient in catalogPacks navidad-espanola-vol1 / Langostinos a la plancha at dishes.1.ingredients.0: No existing master ingredient and no safe category inference.
- missing_master_ingredient in catalogPacks navidad-espanola-vol1 / Besugo al horno at dishes.2.ingredients.6: No existing master ingredient and no safe category inference.
- missing_master_ingredient in catalogPacks navidad-espanola-vol1 / Cordero asado al horno at dishes.3.ingredients.5: No existing master ingredient and no safe category inference.
- missing_master_ingredient in catalogPacks navidad-espanola-vol1 / Pavo relleno de Navidad at dishes.4.ingredients.0: No existing master ingredient and no safe category inference.
- missing_master_ingredient in catalogPacks navidad-espanola-vol1 / Pavo relleno de Navidad at dishes.4.ingredients.2: No existing master ingredient and no safe category inference.
- missing_master_ingredient in catalogPacks navidad-espanola-vol1 / Pavo relleno de Navidad at dishes.4.ingredients.3: No existing master ingredient and no safe category inference.
- missing_master_ingredient in catalogPacks navidad-espanola-vol1 / Pavo relleno de Navidad at dishes.4.ingredients.7: No existing master ingredient and no safe category inference.

## Safety notes

- No records are deleted, archived, or published by this script.
- Apply mode writes only planned ID/category/display metadata updates and creates safe master ingredients.
- Ambiguous or unsafe items remain untouched and are written to the manual review file.
