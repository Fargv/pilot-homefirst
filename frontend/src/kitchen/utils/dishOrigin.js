function getObjectId(value) {
  if (!value) return null;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

export function isDishFromCatalog(dish) {
  if (!dish || dish.scope !== "household") return false;
  return dish.source === "catalog" || Boolean(dish.sourcePackId);
}

export function isUserCreatedDish(dish) {
  if (!dish) return false;
  return dish.scope === "household" && !isDishFromCatalog(dish);
}

export function getDishOrigin(dish) {
  const originalDishId = getObjectId(dish?.masterId);
  if (!dish) {
    return { type: "user", label: "Propio", canRevert: false, originalDishId: null };
  }
  if (dish.scope === "override") {
    return {
      type: "override",
      label: "Modificado",
      canRevert: Boolean(originalDishId),
      originalDishId
    };
  }
  if (isDishFromCatalog(dish)) {
    const templateId = String(dish.sourceDishTemplateId || "").trim();
    if (dish.userModified) {
      return {
        type: "override",
        label: "Modificado",
        canRevert: Boolean(dish.sourcePackId && templateId),
        originalDishId: templateId || null
      };
    }
    return {
      type: "catalog",
      label: "Catalogo",
      canRevert: false,
      originalDishId: templateId || null
    };
  }
  if (dish.scope === "master") {
    return { type: "master", label: "Master", canRevert: false, originalDishId: getObjectId(dish._id) };
  }
  return { type: "user", label: "Propio", canRevert: false, originalDishId: null };
}
