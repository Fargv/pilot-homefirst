import express from "express";
import bcrypt from "bcryptjs";
import { KitchenUser } from "../models/KitchenUser.js";
import { Household } from "../models/Household.js";
import { KitchenWeekPlan } from "../models/KitchenWeekPlan.js";
import { Category } from "../models/Category.js";
import { HiddenMaster } from "../models/HiddenMaster.js";
import { KitchenDish } from "../models/KitchenDish.js";
import { KitchenIngredient } from "../models/KitchenIngredient.js";
import { KitchenShoppingList } from "../models/KitchenShoppingList.js";
import { KitchenSwap } from "../models/KitchenSwap.js";
import { Store } from "../models/Store.js";
import { ShoppingTrip } from "../models/ShoppingTrip.js";
import { Invitation } from "../models/Invitation.js";
import { KitchenAuditLog } from "../models/KitchenAuditLog.js";
import { requireAuth, requireRole } from "../middleware.js";
import {
  buildDisplayName,
  isValidEmail,
  normalizeEmail,
  normalizeRole,
  normalizeInitials,
  normalizeColorId
} from "../../users/utils.js";
import { buildScopedFilter, getEffectiveHouseholdId, handleHouseholdError } from "../householdScope.js";

const router = express.Router();

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function unassignFutureCookSlots({ householdId, userId }) {
  const todayStart = startOfTodayUtc();
  const result = await KitchenWeekPlan.updateMany(
    { householdId },
    {
      $set: {
        "days.$[day].cookUserId": null
      }
    },
    {
      arrayFilters: [
        {
          "day.cookUserId": userId,
          "day.date": { $gte: todayStart }
        }
      ]
    }
  );
  return {
    matchedCount: Number(result.matchedCount || 0),
    modifiedCount: Number(result.modifiedCount || 0)
  };
}

async function deleteHouseholdScopedData(householdId) {
  const operations = await Promise.all([
    Invitation.deleteMany({ householdId }),
    KitchenShoppingList.deleteMany({ householdId }),
    KitchenWeekPlan.deleteMany({ householdId }),
    KitchenSwap.deleteMany({ householdId }),
    KitchenDish.deleteMany({ householdId }),
    KitchenIngredient.deleteMany({ householdId }),
    Category.deleteMany({ householdId }),
    HiddenMaster.deleteMany({ householdId }),
    Store.deleteMany({ householdId, scope: "household" }),
    ShoppingTrip.deleteMany({ householdId }),
    KitchenAuditLog.deleteMany({ householdId }),
    KitchenUser.deleteMany({ householdId }),
    Household.deleteOne({ _id: householdId })
  ]);
  return {
    invitationsDeleted: Number(operations[0].deletedCount || 0),
    shoppingListsDeleted: Number(operations[1].deletedCount || 0),
    weekPlansDeleted: Number(operations[2].deletedCount || 0),
    swapsDeleted: Number(operations[3].deletedCount || 0),
    dishesDeleted: Number(operations[4].deletedCount || 0),
    ingredientsDeleted: Number(operations[5].deletedCount || 0),
    categoriesDeleted: Number(operations[6].deletedCount || 0),
    hiddenMastersDeleted: Number(operations[7].deletedCount || 0),
    storesDeleted: Number(operations[8].deletedCount || 0),
    shoppingTripsDeleted: Number(operations[9].deletedCount || 0),
    auditLogsDeleted: Number(operations[10].deletedCount || 0),
    usersDeleted: Number(operations[11].deletedCount || 0),
    householdDeleted: Number(operations[12].deletedCount || 0)
  };
}

async function buildDeleteProfilePreview(currentUser, effectiveHouseholdId) {
  const household = await Household.findById(effectiveHouseholdId).select("_id name ownerUserId").lean();
  if (!household) {
    const error = new Error("No encontramos el hogar activo.");
    error.statusCode = 404;
    throw error;
  }

  const users = await KitchenUser.find(buildScopedFilter(effectiveHouseholdId, {}))
    .select("_id displayName email role hasLogin isPlaceholder")
    .lean();

  const owners = users.filter((user) => user.role === "owner");
  const isCurrentOwner = currentUser.role === "owner";
  const ownersExcludingCurrent = owners.filter((user) => String(user._id) !== String(currentUser._id));
  const promotableCandidates = users.filter((user) =>
    String(user._id) !== String(currentUser._id)
    && Boolean(user.email)
    && user.hasLogin !== false
    && user.isPlaceholder !== true
  );

  const isOnlyOwner = isCurrentOwner && owners.length === 1;
  const mustTransferOwner = isOnlyOwner && promotableCandidates.length > 0;
  const willDeleteHousehold = isOnlyOwner && promotableCandidates.length === 0;

  return {
    household: {
      id: household._id,
      name: household.name || "Mi household"
    },
    isOwner: isCurrentOwner,
    isOnlyOwner,
    ownersCount: owners.length,
    mustTransferOwner,
    willDeleteHousehold,
    promotableCandidates: promotableCandidates.map((user) => ({
      id: user._id,
      displayName: user.displayName,
      email: user.email,
      role: user.role
    })),
    destructiveScope: willDeleteHousehold
      ? [
        "household",
        "usuarios del household",
        "platos del household",
        "ingredientes del household",
        "semanas/planes del household",
        "categorias household/override",
        "listas de compra",
        "invitaciones"
      ]
      : ["solo tu cuenta del household", "reasignaciones futuras de cocina (cookUserId -> null)"]
  };
}

router.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const users = await KitchenUser.find(buildScopedFilter(effectiveHouseholdId, {})).sort({ createdAt: 1 });
    res.json({ ok: true, users: users.map((user) => user.toSafeJSON()) });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudieron cargar los usuarios." });
  }
});

router.get("/members", requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const users = await KitchenUser.find(buildScopedFilter(effectiveHouseholdId, {})).sort({ createdAt: 1 });
    res.json({ ok: true, users: users.map((user) => user.toSafeJSON()) });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudieron cargar los miembros." });
  }
});

router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { email, password, firstName, lastName, name, displayName } = req.body;
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password) {
      return res.status(400).json({ ok: false, error: "Email y contraseña son obligatorios." });
    }
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ ok: false, error: "El email no es válido." });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ ok: false, error: "La contraseña debe tener al menos 8 caracteres." });
    }

    const exists = await KitchenUser.findOne({ email: normalizedEmail });
    if (exists) return res.status(409).json({ ok: false, error: "El email ya está registrado." });

    const safeDisplayName = buildDisplayName({ firstName, lastName, name, displayName });
    if (!safeDisplayName) {
      return res.status(400).json({ ok: false, error: "El nombre es obligatorio." });
    }

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await KitchenUser.create({
      username: normalizedEmail,
      email: normalizedEmail,
      firstName: firstName ? String(firstName).trim() : undefined,
      lastName: lastName ? String(lastName).trim() : undefined,
      displayName: safeDisplayName,
      initials: normalizeInitials(req.body?.initials, safeDisplayName),
      colorId: normalizeColorId(req.body?.colorId),
      type: "user",
      hasLogin: true,
      role: normalizeRole(req.body.role),
      householdId: effectiveHouseholdId,
      passwordHash
    });

    return res.status(201).json({ ok: true, user: user.toSafeJSON() });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo crear el usuario." });
  }
});

router.patch("/me", requireAuth, async (req, res) => {
  try {
    const safeDisplayName = buildDisplayName({
      firstName: req.body?.firstName,
      lastName: req.body?.lastName,
      displayName: req.body?.displayName,
      name: req.body?.displayName
    });
    if (!safeDisplayName) {
      return res.status(400).json({ ok: false, error: "El nombre para mostrar es obligatorio." });
    }

    req.kitchenUser.displayName = safeDisplayName;
    req.kitchenUser.firstName = req.body?.firstName ? String(req.body.firstName).trim() : req.kitchenUser.firstName;
    req.kitchenUser.lastName = req.body?.lastName ? String(req.body.lastName).trim() : req.kitchenUser.lastName;
    req.kitchenUser.initials = normalizeInitials(req.body?.initials, safeDisplayName);
    req.kitchenUser.colorId = normalizeColorId(req.body?.colorId);
    await req.kitchenUser.save();

    return res.json({ ok: true, user: req.kitchenUser.toSafeJSON() });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo actualizar el perfil." });
  }
});

router.get("/me/delete-preview", requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const preview = await buildDeleteProfilePreview(req.kitchenUser, effectiveHouseholdId);
    return res.json({ ok: true, preview });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    const statusCode = Number(error?.statusCode || 500);
    if (statusCode >= 400 && statusCode < 500) {
      return res.status(statusCode).json({ ok: false, error: error.message || "No se pudo preparar la vista previa." });
    }
    return res.status(500).json({ ok: false, error: "No se pudo preparar la vista previa de eliminación." });
  }
});

router.delete("/me", requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const preview = await buildDeleteProfilePreview(req.kitchenUser, effectiveHouseholdId);

    if (preview.mustTransferOwner) {
      const promoteUserId = String(req.body?.promoteUserId || "").trim();
      if (!promoteUserId) {
        return res.status(400).json({
          ok: false,
          error: "Debes seleccionar otro usuario con email para transferir el rol Owner.",
          code: "OWNER_TRANSFER_REQUIRED",
          preview
        });
      }
      const promoteTarget = await KitchenUser.findOne(
        buildScopedFilter(effectiveHouseholdId, { _id: promoteUserId })
      );
      if (!promoteTarget || !promoteTarget.email || promoteTarget.hasLogin === false || promoteTarget.isPlaceholder) {
        return res.status(400).json({
          ok: false,
          error: "El usuario seleccionado no es válido para ser Owner.",
          code: "INVALID_OWNER_TRANSFER_TARGET",
          preview
        });
      }

      promoteTarget.role = "owner";
      await promoteTarget.save();

      await Household.updateOne(
        { _id: effectiveHouseholdId },
        { $set: { ownerUserId: promoteTarget._id } }
      );
    } else if (preview.willDeleteHousehold) {
      if (req.body?.confirmDeleteHousehold !== true) {
        return res.status(400).json({
          ok: false,
          error: "Debes confirmar explícitamente la eliminación del household completo.",
          code: "HOUSEHOLD_DELETE_CONFIRMATION_REQUIRED",
          preview
        });
      }

      const stats = await deleteHouseholdScopedData(effectiveHouseholdId);
      return res.json({
        ok: true,
        deleted: "household",
        stats
      });
    }

    const unassignResult = await unassignFutureCookSlots({
      householdId: effectiveHouseholdId,
      userId: req.kitchenUser._id
    });

    if (preview.isOwner) {
      const replacementOwner = await KitchenUser.findOne(
        buildScopedFilter(effectiveHouseholdId, {
          role: "owner",
          _id: { $ne: req.kitchenUser._id }
        })
      )
        .select("_id")
        .lean();
      if (replacementOwner?._id) {
        await Household.updateOne(
          { _id: effectiveHouseholdId, ownerUserId: req.kitchenUser._id },
          { $set: { ownerUserId: replacementOwner._id } }
        );
      }
    }

    await KitchenUser.deleteOne({ _id: req.kitchenUser._id });

    return res.json({
      ok: true,
      deleted: "user",
      unassignedFutureCookSlots: unassignResult
    });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo eliminar el perfil." });
  }
});

router.put("/me/password", requireAuth, async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ ok: false, error: "Debes enviar la contraseña actual y la nueva." });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ ok: false, error: "La nueva contraseña debe tener al menos 8 caracteres." });
    }
    if (!req.kitchenUser.passwordHash) {
      return res.status(400).json({ ok: false, error: "Esta cuenta no tiene contraseña local activa." });
    }

    const passwordOk = await bcrypt.compare(currentPassword, req.kitchenUser.passwordHash);
    if (!passwordOk) {
      return res.status(401).json({ ok: false, error: "La contraseña actual no es correcta." });
    }

    req.kitchenUser.passwordHash = await bcrypt.hash(newPassword, 10);
    await req.kitchenUser.save();
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo actualizar la contraseña." });
  }
});

router.put("/members/:id", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const member = await KitchenUser.findOne(buildScopedFilter(effectiveHouseholdId, { _id: req.params.id }));
    if (!member) {
      return res.status(404).json({ ok: false, error: "No encontramos al miembro." });
    }
    const nextRole = req.body?.role ? normalizeRole(req.body.role) : member.role;
    if (req.body?.role) {
      member.role = nextRole;
    }
    if (req.body?.displayName) {
      const nextDisplayName = buildDisplayName({
        displayName: req.body.displayName,
        name: req.body.displayName
      });
      if (!nextDisplayName) {
        return res.status(400).json({ ok: false, error: "El nombre para mostrar no es válido." });
      }
      member.displayName = nextDisplayName;
      member.initials = normalizeInitials(req.body?.initials, nextDisplayName);
    } else if (typeof req.body?.initials !== "undefined") {
      member.initials = normalizeInitials(req.body?.initials, member.displayName);
    }
    if (typeof req.body?.colorId !== "undefined") {
      member.colorId = normalizeColorId(req.body?.colorId);
    }

    await member.save();
    return res.json({ ok: true, user: member.toSafeJSON() });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo actualizar el miembro." });
  }
});

router.delete("/members/:id", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const member = await KitchenUser.findOne(buildScopedFilter(effectiveHouseholdId, { _id: req.params.id }));
    if (!member) {
      return res.status(404).json({ ok: false, error: "No encontramos al miembro." });
    }
    if (String(member._id) === String(req.kitchenUser._id)) {
      return res.status(400).json({ ok: false, error: "No puedes eliminar tu propia cuenta del hogar." });
    }

    await KitchenUser.deleteOne({ _id: member._id });
    return res.json({ ok: true });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo eliminar el miembro." });
  }
});

export default router;
