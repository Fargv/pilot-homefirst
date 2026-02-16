import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { sendTestEmail } from "./mailer.js";
import kitchenRouter from "./kitchen/index.js";
import categoriesRouter from "./kitchen/routes/categories.js";
import kitchenIngredientsRouter from "./kitchen/routes/kitchenIngredients.js";
import usersRouter from "./users/index.js";
import adminRouter from "./kitchen/routes/admin.js";

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ ok: true, env: config.nodeEnv, time: new Date().toISOString() });
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
app.use("/api/admin", adminRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/kitchenIngredients", kitchenIngredientsRouter);
app.use("/api/users", usersRouter);

connectDb()
  .then(() => {
    app.listen(config.port, () => console.log(`🚀 API escuchando en :${config.port}`));
  })
  .catch((e) => {
    console.error("❌ Error conectando DB", e);
    process.exit(1);
  });
