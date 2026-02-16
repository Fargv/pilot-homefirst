import express from "express";
import authRoutes from "./routes/auth.js";
import dishRoutes from "./routes/dishes.js";
import weekRoutes from "./routes/weeks.js";
import shoppingRoutes from "./routes/shopping.js";
import swapRoutes from "./routes/swaps.js";
import userRoutes from "./routes/users.js";
import adminRoutes from "./routes/admin.js";

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/dishes", dishRoutes);
router.use("/weeks", weekRoutes);
router.use("/shopping", shoppingRoutes);
router.use("/swaps", swapRoutes);
router.use("/users", userRoutes);
router.use("/admin", adminRoutes);

export default router;
