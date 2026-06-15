import mongoose from "mongoose";

// NEVER delete records from this collection — required for GDPR/LOPDGDD audit.
const ConsentRecordSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", required: true, index: true },
    termsAccepted: { type: Boolean, required: true },
    termsVersion: { type: String, default: "1.0" },
    privacyAccepted: { type: Boolean, required: true },
    privacyVersion: { type: String, default: "1.0" },
    acceptedAt: { type: Date, required: true },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
    source: { type: String, enum: ["signup", "gate"], default: "signup" }
  },
  { timestamps: true }
);

export const ConsentRecord = mongoose.model("ConsentRecord", ConsentRecordSchema);
