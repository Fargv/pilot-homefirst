import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { sendTestEmail } from "./mailer.js";
import kitchenRouter from "./kitchen/index.js";
import weekRoutes from "./kitchen/routes/weeks.js";
import categoriesRouter from "./kitchen/routes/categories.js";
import kitchenIngredientsRouter from "./kitchen/routes/kitchenIngredients.js";
import usersRouter from "./users/index.js";
import adminRouter from "./kitchen/routes/admin.js";
import testEmailRouter from "./routes/testEmail.js";
import authRoutes from "./kitchen/routes/auth.js";
import internalPushRouter from "./routes/internalPush.js";
import subscriptionRouter from "./routes/subscription.js";

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ ok: true, env: config.nodeEnv, time: new Date().toISOString() });
});

app.get("/invite/:token", (req, res) => {
  const frontendBaseUrl = String(config.frontendUrl || "").replace(/\/$/, "");
  return res.redirect(302, `${frontendBaseUrl}/invite/${req.params.token}`);
});

app.post("/api/email/test", async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ ok: false, error: "Falta 'to' en body" });

    const messageId = await sendTestEmail({ to });
    res.json({ ok: true, messageId });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.use("/api/kitchen", kitchenRouter);
app.use("/api/weeks", weekRoutes);
app.use("/weeks", weekRoutes);
app.use("/api/admin", adminRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/kitchenIngredients", kitchenIngredientsRouter);
app.use("/api/users", usersRouter);
app.use("/api/auth", authRoutes);
app.use("/api/subscription", subscriptionRouter);
app.use("/api", testEmailRouter);
app.use("/api/internal/push", internalPushRouter);

connectDb()
  .then(() => {
    const PORT = process.env.PORT || config.port || 3000;

app.listen(PORT, () => {
  console.log(`🚀 API escuchando en :${PORT}`);
});
  })
  .catch((e) => {
    console.error("❌ Error conectando DB", e);
    process.exit(1);
  });
