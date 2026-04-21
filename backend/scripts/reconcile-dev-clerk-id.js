import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { KitchenUser } from "../src/kitchen/models/KitchenUser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

function parseArgs(argv) {
  const args = {
    email: "",
    clerkId: "",
    clear: false,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--email") {
      args.email = String(argv[index + 1] || "").trim().toLowerCase();
      index += 1;
    } else if (arg === "--clerk-id") {
      args.clerkId = String(argv[index + 1] || "").trim();
      index += 1;
    } else if (arg === "--clear") {
      args.clear = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mongodbUri = process.env.MONGODB_URI || process.env.MONGODB_URL;
  const isDev = process.env.NODE_ENV === "development" || process.env.APP_ENV === "development" || !process.env.NODE_ENV;

  if (!isDev) {
    throw new Error("This reconciliation utility is DEV-only.");
  }

  if (!mongodbUri) {
    throw new Error("MONGODB_URI or MONGODB_URL is required.");
  }

  if (!args.email) {
    throw new Error("Use --email user@example.com");
  }

  if (!args.clear && !args.clerkId) {
    throw new Error("Use --clerk-id user_xxx to assign a DEV Clerk ID, or --clear to remove the stale one.");
  }

  await mongoose.connect(mongodbUri, { serverSelectionTimeoutMS: 10000 });
  const user = await KitchenUser.findOne({ email: args.email });
  if (!user) {
    throw new Error(`No KitchenUser found for ${args.email}`);
  }

  const previousClerkId = user.clerkId || null;
  const nextClerkId = args.clear ? null : args.clerkId;

  if (args.dryRun) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      userId: user._id.toString(),
      email: user.email,
      previousClerkId,
      nextClerkId
    }, null, 2));
    return;
  }

  user.clerkId = nextClerkId;
  await user.save();
  console.log(JSON.stringify({
    ok: true,
    dryRun: false,
    userId: user._id.toString(),
    email: user.email,
    previousClerkId,
    nextClerkId: user.clerkId || null
  }, null, 2));
}

main()
  .catch((error) => {
    console.error("[reconcile-dev-clerk-id] Failed:", error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
