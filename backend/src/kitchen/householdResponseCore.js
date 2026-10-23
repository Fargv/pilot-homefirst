export async function resolveHouseholdLicenseForResponse({
  household,
  license = null,
  usage = null,
  countUsage,
  buildLicenseSummary
}) {
  if (license) return license;
  const resolvedUsage = usage || await countUsage(household?._id);
  return buildLicenseSummary(household, resolvedUsage);
}
