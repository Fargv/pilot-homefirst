export function buildPackUnlockIdempotencyKey(householdId, packId) {
  return `pack-unlock:${householdId}:${packId}`;
}

export async function unlockPackWithBites({ householdId, pack, spendBites, upsertOwnership }) {
  const idempotencyKey = buildPackUnlockIdempotencyKey(householdId, pack._id);
  const { wallet } = await spendBites(
    householdId,
    pack.bitesCost,
    `Desbloquear pack: ${pack.title}`,
    {
      idempotencyKey,
      packId: String(pack._id),
      packTitle: pack.title
    }
  );

  // The wallet claim is deliberately completed before delivery. If this write
  // fails, a retry reuses the same key and recovers the delivery without a
  // second charge.
  const ownership = await upsertOwnership();
  return { ownership, wallet, idempotencyKey };
}
