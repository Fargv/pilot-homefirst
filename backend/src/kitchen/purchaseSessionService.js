import { PurchaseSession } from "./models/PurchaseSession.js";
import { KitchenShoppingList } from "./models/KitchenShoppingList.js";

export const OPEN_PURCHASE_SESSION_STATUSES = ["draft", "pending_confirmation"];

function uniqueObjectIds(values = []) {
  return Array.from(new Set(
    values
      .filter(Boolean)
      .map((value) => String(value))
  ));
}

async function syncSessionStoreToShoppingItems(sessionId, householdId, storeId) {
  const lists = await KitchenShoppingList.find({
    householdId,
    "items.purchaseSessionId": sessionId
  });

  if (!lists.length) return;

  await Promise.all(lists.map(async (list) => {
    let changed = false;
    list.items.forEach((item) => {
      if (String(item.purchaseSessionId || "") !== String(sessionId)) return;
      item.storeId = storeId || null;
      changed = true;
    });
    if (changed) {
      await list.save();
    }
  }));
}

export async function getLatestOpenPurchaseSession(householdId) {
  if (!householdId) return null;
  return PurchaseSession.findOne({
    householdId,
    status: { $in: OPEN_PURCHASE_SESSION_STATUSES }
  }).sort({ updatedAt: -1, createdAt: -1 });
}

export async function ensureOpenPurchaseSession({ householdId, weekStart, userId, storeId = null }) {
  let session = await getLatestOpenPurchaseSession(householdId);
  if (!session) {
    session = await PurchaseSession.create({
      householdId,
      weekStart,
      status: "draft",
      itemIds: [],
      storeId: storeId || null,
      createdByUserId: userId || null,
      updatedByUserId: userId || null
    });
    return session;
  }

  if (storeId && !session.storeId) {
    session.storeId = storeId;
    session.updatedByUserId = userId || session.updatedByUserId || null;
    await session.save();
  }

  return session;
}

export async function attachItemsToPurchaseSession({ householdId, weekStart, userId, items, storeId = null }) {
  const normalizedItems = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!normalizedItems.length) return null;

  const session = await ensureOpenPurchaseSession({ householdId, weekStart, userId, storeId });
  const nextItemIds = uniqueObjectIds([
    ...(session.itemIds || []),
    ...normalizedItems.map((item) => item.itemId || item._id)
  ]);

  session.itemIds = nextItemIds;
  if (storeId) {
    session.storeId = storeId;
  }
  session.updatedByUserId = userId || session.updatedByUserId || null;
  await session.save();

  normalizedItems.forEach((item) => {
    item.purchaseSessionId = session._id;
    if (session.storeId) {
      item.storeId = session.storeId;
    }
  });

  return session;
}

export async function detachItemsFromPurchaseSession({ userId, items }) {
  const normalizedItems = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!normalizedItems.length) return;

  const sessionIds = uniqueObjectIds(normalizedItems.map((item) => item.purchaseSessionId));
  if (!sessionIds.length) {
    normalizedItems.forEach((item) => {
      item.purchaseSessionId = null;
      item.storeId = null;
    });
    return;
  }

  const sessions = await PurchaseSession.find({ _id: { $in: sessionIds } });
  const sessionById = new Map(sessions.map((session) => [String(session._id), session]));

  normalizedItems.forEach((item) => {
    const session = sessionById.get(String(item.purchaseSessionId || ""));
    item.purchaseSessionId = null;
    item.storeId = null;
    if (!session) return;
    session.itemIds = (session.itemIds || []).filter(
      (value) => String(value) !== String(item.itemId || item._id || "")
    );
    session.updatedByUserId = userId || session.updatedByUserId || null;
  });

  await Promise.all(sessions.map(async (session) => {
    if ((session.itemIds || []).length === 0) {
      session.status = "cancelled";
      session.amount = null;
      session.completedAt = null;
      session.completedByUserId = null;
    }
    await session.save();
  }));
}

export async function markPurchaseSessionPendingConfirmation({ householdId, sessionId, userId }) {
  if (!sessionId) return null;
  const session = await PurchaseSession.findOne({
    _id: sessionId,
    householdId,
    status: { $in: OPEN_PURCHASE_SESSION_STATUSES }
  });
  if (!session) return null;

  session.status = "pending_confirmation";
  session.promptedAt = new Date();
  session.updatedByUserId = userId || session.updatedByUserId || null;
  await session.save();
  return session;
}

export async function completePurchaseSession({ householdId, sessionId, userId, storeId = null, amount }) {
  const session = await PurchaseSession.findOne({
    _id: sessionId,
    householdId,
    status: { $in: OPEN_PURCHASE_SESSION_STATUSES }
  });
  if (!session) return null;

  session.status = "completed";
  session.storeId = storeId || null;
  session.amount = amount;
  session.completedAt = new Date();
  session.completedByUserId = userId || null;
  session.updatedByUserId = userId || session.updatedByUserId || null;
  await session.save();

  await syncSessionStoreToShoppingItems(session._id, householdId, session.storeId || null);
  return session;
}

export async function updatePurchaseSessionStore({ householdId, sessionId, userId, storeId = null }) {
  if (!sessionId) return null;
  const session = await PurchaseSession.findOne({ _id: sessionId, householdId });
  if (!session) return null;

  session.storeId = storeId || null;
  session.updatedByUserId = userId || session.updatedByUserId || null;
  await session.save();
  await syncSessionStoreToShoppingItems(session._id, householdId, session.storeId || null);
  return session;
}

export async function getPendingPurchaseSessions(householdId) {
  if (!householdId) return [];
  return PurchaseSession.find({
    householdId,
    status: { $in: OPEN_PURCHASE_SESSION_STATUSES }
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();
}
