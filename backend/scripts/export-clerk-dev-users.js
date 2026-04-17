import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { KitchenUser } from "../src/kitchen/models/KitchenUser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

const DEFAULT_OUTPUT_PATH = path.resolve(__dirname, "../exports/users.dev.json");
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$(0[4-9]|[12]\d|3[01])\$[./A-Za-z0-9]{53}$/;

function parseArgs(argv) {
  const args = {
    mode: "dry-run",
    output: DEFAULT_OUTPUT_PATH,
    includeInactive: false,
    includePlaceholders: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") args.mode = "dry-run";
    if (arg === "--export") args.mode = "export";
    if (arg === "--include-inactive") args.includeInactive = true;
    if (arg === "--include-placeholders") args.includePlaceholders = true;
    if (arg === "--out") {
      args.output = path.resolve(process.cwd(), argv[index + 1] || "");
      index += 1;
    }
  }

  return args;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function splitName(user) {
  const firstName = String(user.firstName || "").trim();
  const lastName = String(user.lastName || "").trim();
  if (firstName || lastName) {
    return {
      firstName: firstName || undefined,
      lastName: lastName || undefined
    };
  }

  const displayName = String(user.displayName || "").trim();
  if (!displayName) return {};

  const parts = displayName.split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ")
  };
}

function addExclusion(exclusions, user, reason, details = {}) {
  exclusions.push({
    userId: user?._id?.toString?.() || "",
    email: normalizeEmail(user?.email),
    username: user?.username || "",
    displayName: user?.displayName || "",
    reason,
    ...details
  });
}

function buildClerkUser(user, normalizedEmail) {
  const { firstName, lastName } = splitName(user);
  return {
    userId: user._id.toString(),
    externalId: user._id.toString(),
    email: normalizedEmail,
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    passwordDigest: user.passwordHash,
    passwordHasher: "bcrypt"
  };
}

async function buildAudit({ includeInactive, includePlaceholders }) {
  const users = await KitchenUser.find({})
    .select("_id username email firstName lastName displayName passwordHash active hasLogin isPlaceholder type clerkId")
    .lean();
  const emailBuckets = new Map();

  for (const user of users) {
    const normalizedEmail = normalizeEmail(user.email);
    if (!normalizedEmail) continue;
    const bucket = emailBuckets.get(normalizedEmail) || [];
    bucket.push(user);
    emailBuckets.set(normalizedEmail, bucket);
  }

  const duplicateEmailBuckets = Array.from(emailBuckets.entries())
    .filter(([, bucket]) => bucket.length > 1)
    .map(([email, bucket]) => ({
      email,
      userIds: bucket.map((user) => user._id.toString())
    }));
  const duplicateEmails = new Set(duplicateEmailBuckets.map((bucket) => bucket.email));

  const eligible = [];
  const excluded = [];

  for (const user of users) {
    const normalizedEmail = normalizeEmail(user.email);
    const passwordHash = String(user.passwordHash || "").trim();

    if (!normalizedEmail) {
      addExclusion(excluded, user, "missing_email");
      continue;
    }

    if (!isValidEmail(normalizedEmail)) {
      addExclusion(excluded, user, "invalid_email");
      continue;
    }

    if (duplicateEmails.has(normalizedEmail)) {
      addExclusion(excluded, user, "duplicate_email", {
        conflictingUserIds: emailBuckets.get(normalizedEmail).map((candidate) => candidate._id.toString())
      });
      continue;
    }

    if (!passwordHash) {
      addExclusion(excluded, user, "missing_passwordHash");
      continue;
    }

    if (!BCRYPT_HASH_PATTERN.test(passwordHash)) {
      addExclusion(excluded, user, "malformed_bcrypt_hash");
      continue;
    }

    if (!includeInactive && user.active === false) {
      addExclusion(excluded, user, "inactive_user");
      continue;
    }

    if (!includePlaceholders && (user.isPlaceholder || user.type === "placeholder" || user.hasLogin === false)) {
      addExclusion(excluded, user, "placeholder_or_no_login");
      continue;
    }

    eligible.push(buildClerkUser(user, normalizedEmail));
  }

  const exclusionCounts = excluded.reduce((counts, item) => {
    counts[item.reason] = (counts[item.reason] || 0) + 1;
    return counts;
  }, {});

  return {
    summary: {
      totalUsersScanned: users.length,
      eligibleUsers: eligible.length,
      excludedUsers: excluded.length,
      duplicateEmailConflicts: duplicateEmailBuckets.length,
      missingPasswordHash: exclusionCounts.missing_passwordHash || 0,
      missingEmail: exclusionCounts.missing_email || 0,
      malformedBcryptHashes: exclusionCounts.malformed_bcrypt_hash || 0,
      inactiveUsers: exclusionCounts.inactive_user || 0,
      placeholderOrNoLoginUsers: exclusionCounts.placeholder_or_no_login || 0
    },
    duplicateEmailConflicts: duplicateEmailBuckets,
    exclusionCounts,
    excluded,
    eligible
  };
}

function printAudit(audit) {
  console.log(JSON.stringify({
    summary: audit.summary,
    exclusionCounts: audit.exclusionCounts,
    duplicateEmailConflicts: audit.duplicateEmailConflicts,
    excluded: audit.excluded
  }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mongodbUri = process.env.MONGODB_URI || process.env.MONGODB_URL;

  if (!mongodbUri) {
    throw new Error("MONGODB_URI is required. This script also accepts legacy MONGODB_URL and reads backend/.env by default.");
  }

  await mongoose.connect(mongodbUri, { serverSelectionTimeoutMS: 10000 });
  const audit = await buildAudit(args);
  printAudit(audit);

  if (args.mode === "export") {
    await fs.mkdir(path.dirname(args.output), { recursive: true });
    await fs.writeFile(args.output, `${JSON.stringify(audit.eligible, null, 2)}\n`, "utf8");
    console.log(`Exported ${audit.eligible.length} eligible DEV users to ${args.output}`);
  } else {
    console.log("Dry run only. Re-run with --export to write users.dev.json.");
  }
}

main()
  .catch((error) => {
    console.error("[clerk-dev-export] Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
