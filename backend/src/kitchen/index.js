import express from "express";
import authRoutes from "./routes/auth.js";
import dishRoutes from "./routes/dishes.js";
import weekRoutes from "./routes/weeks.js";
import shoppingRoutes from "./routes/shopping.js";
import swapRoutes from "./routes/swaps.js";
import userRoutes from "./routes/users.js";
import adminRoutes from "./routes/admin.js";
import householdRoutes from "./routes/household.js";
import dishCategoryRoutes from "./routes/dishCategories.js";
import pushRoutes from "./routes/push.js";
import catalogRoutes from "./routes/catalog.js";
import bitesRoutes from "./routes/bites.js";
import plansRoutes from "./routes/plans.js";
import onboardingRoutes from "./routes/onboarding.js";

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/dishes", dishRoutes);
router.use("/weeks", weekRoutes);
router.use("/shopping", shoppingRoutes);
router.use("/swaps", swapRoutes);
router.use("/users", userRoutes);
router.use("/admin", adminRoutes);
router.use("/household", householdRoutes);
router.use("/dish-categories", dishCategoryRoutes);
router.use("/push", pushRoutes);
router.use("/catalog", catalogRoutes);
router.use("/bites", bitesRoutes);
router.use("/plans", plansRoutes);
router.use("/onboarding", onboardingRoutes);

export default router;
