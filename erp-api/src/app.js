const express = require("express");
const cors = require("cors");
const path = require("path");
const { query } = require("./db");
const { errorHandler } = require("./middleware/errorHandler");
const materialsRouter = require("./routes/materials");
const inventoryRouter = require("./routes/inventory");
const warehousesRouter = require("./routes/warehouses");
const databaseViewerRouter = require("./routes/databaseViewer");

const app = express();

const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use(cors({ origin: corsOrigin === "*" ? true : corsOrigin }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "erp-api",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/health/db", async (req, res, next) => {
  try {
    const result = await query("select now() as database_time");
    res.json({ ok: true, databaseTime: result.rows[0].database_time });
  } catch (error) {
    next(error);
  }
});

app.get(["/precheck", "/precheck-system"], (req, res) => {
  res.sendFile(path.resolve(__dirname, "../../預檢工單系統_物料表調整版.html"));
});

app.use(databaseViewerRouter);
app.use("/api/materials", materialsRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/warehouses", warehousesRouter);

app.use((req, res) => {
  res.status(404).json({ error: { message: "Route not found" } });
});

app.use(errorHandler);

module.exports = app;
