import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

const DEFAULT_INPUT_PATH = path.resolve(__dirname, "../exports/users.dev.json");
const CLERK_USERS_URL = "https://api.clerk.com/v1/users";

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT_PATH
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      args.input = path.resolve(process.cwd(), argv[index + 1] || "");
      index += 1;
    }
  }

  return args;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getPrimaryEmail(clerkUser) {
  const primary =
    clerkUser.email_addresses?.find((emailAddress) => emailAddress.id === clerkUser.primary_email_address_id)
    || clerkUser.email_addresses?.[0];
  return normalizeEmail(primary?.email_address);
}

async function fetchAllClerkUsers(secretKey) {
  const users = [];
  const limit = 500;
  let offset = 0;

  while (true) {
    const url = new URL(CLERK_USERS_URL);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json"
      }
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Clerk users API failed (${response.status}): ${JSON.stringify(body)}`);
    }

    const page = Array.isArray(body) ? body : body.data || [];
    users.push(...page);
    if (page.length < limit) break;
    offset += limit;
  }

  return users;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const secretKey = process.env.CLERK_SECRET_KEY;

  if (process.env.IMPORT_TO_DEV_INSTANCE !== "true") {
    throw new Error("Set IMPORT_TO_DEV_INSTANCE=true before validating a DEV Clerk import. Refusing to run against an unspecified Clerk instance.");
  }

  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY is required to validate imported users.");
  }

  const expectedUsers = JSON.parse(await fs.readFile(args.input, "utf8"));
  const clerkUsers = await fetchAllClerkUsers(secretKey);
  const clerkByExternalId = new Map();

  for (const clerkUser of clerkUsers) {
    if (clerkUser.external_id) {
      clerkByExternalId.set(String(clerkUser.external_id), clerkUser);
    }
  }

  const matched = [];
  const missing = [];
  const mismatched = [];

  for (const expected of expectedUsers) {
    const clerkUser = clerkByExternalId.get(String(expected.externalId));
    if (!clerkUser) {
      missing.push({
        externalId: expected.externalId,
        email: expected.email,
        reason: "external_id_not_found"
      });
      continue;
    }

    const actualEmail = getPrimaryEmail(clerkUser);
    if (actualEmail !== normalizeEmail(expected.email)) {
      mismatched.push({
        externalId: expected.externalId,
        expectedEmail: normalizeEmail(expected.email),
        actualEmail,
        clerkUserId: clerkUser.id
      });
      continue;
    }

    matched.push({
      externalId: expected.externalId,
      email: normalizeEmail(expected.email),
      clerkUserId: clerkUser.id
    });
  }

  console.log(JSON.stringify({
    expectedImportCount: expectedUsers.length,
    clerkUsersScanned: clerkUsers.length,
    matchedCount: matched.length,
    missingCount: missing.length,
    mismatchedCount: mismatched.length,
    missing,
    mismatched
  }, null, 2));

  if (missing.length || mismatched.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[clerk-dev-validate] Failed:", error);
  process.exitCode = 1;
});
