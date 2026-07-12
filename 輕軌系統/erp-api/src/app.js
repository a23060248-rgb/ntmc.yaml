const express = require("express");
const cors = require("cors");
const fs = require("node:fs");
const path = require("node:path");
const { query } = require("./db");
const { errorHandler } = require("./middleware/errorHandler");
const materialsRouter = require("./routes/materials");
const inventoryRouter = require("./routes/inventory");
const warehousesRouter = require("./routes/warehouses");
const assetsRouter = require("./routes/assets");
const equipmentAliasRouter = require("./routes/equipmentAlias");
const referenceOptionsRouter = require("./routes/referenceOptions");
const databaseViewerRouter = require("./routes/databaseViewer");
const dataAdminRouter = require("./routes/dataAdmin");
const workOrdersRouter = require("./routes/workOrders");
const masterDataRouter = require("./routes/masterData");
const dashboardRouter = require("./routes/dashboard");
const turnaroundRouter = require("./routes/turnaround");
const precheckSchedulesRouter = require("./routes/precheckSchedules");
const precheckWorkflowRouter = require("./routes/precheckWorkflow");
const pmTemplateMasterRouter = require("./routes/pmTemplateMaster");
const reportsRouter = require("./routes/reports");
const sessionRouter = require("./routes/session");
const { mutationAuditMiddleware, requestContextMiddleware } = require("./services/auditService");

const app = express();

const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use(cors({ origin: corsOrigin === "*" ? true : corsOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(requestContextMiddleware);
app.use(mutationAuditMiddleware);

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

app.use("/api/session", sessionRouter);
app.use(databaseViewerRouter);
app.use("/api/materials", materialsRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/warehouses", warehousesRouter);
app.use("/api/assets", assetsRouter);
app.use("/api/equipment-aliases", equipmentAliasRouter);
app.use("/api/reference-options", referenceOptionsRouter);
app.use("/api/db", dataAdminRouter);
app.use("/api/work-orders", workOrdersRouter);
app.use("/api/master-data/pm-template-studio", pmTemplateMasterRouter);
app.use("/api/master-data", masterDataRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/turnaround", turnaroundRouter);
app.use("/api/precheck", precheckSchedulesRouter);
app.use("/api/precheck", precheckWorkflowRouter);
app.use("/api/reports", reportsRouter);

const frontendIndex = process.env.FRONTEND_INDEX_PATH ||
  path.resolve(__dirname, "..", "..", "frontend", "dist", "index.html");
if (String(process.env.SERVE_FRONTEND || "true").toLowerCase() !== "false" && fs.existsSync(frontendIndex)) {
  app.get(["/", "/index.html"], (req, res) => res.sendFile(frontendIndex));
}

app.use((req, res) => {
  res.status(404).json({ error: { message: "Route not found" } });
});

app.use(errorHandler);

module.exports = app;
