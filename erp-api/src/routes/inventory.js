const express = require("express");
const { query, withTransaction } = require("../db");
const { asyncHandler, httpError } = require("../middleware/errorHandler");

const router = express.Router();

const STOCK_STATUSES = new Set(["AVAILABLE", "ISSUED", "IN_USE", "QUARANTINE", "REPAIR", "SCRAPPED"]);
const MOVEMENT_CONFIG = {
  ISSUE: {
    sourceWarehouseCode: "TH-CENTER",
    destinationWarehouseCode: "TH-SUB",
    sourceStockStatus: "AVAILABLE",
    destinationStockStatus: "ISSUED"
  },
  RETURN: {
    sourceWarehouseCode: "TH-SUB",
    destinationWarehouseCode: "TH-CENTER",
    sourceStockStatus: "ISSUED",
    destinationStockStatus: "AVAILABLE"
  },
  TRANSFER: {
    sourceWarehouseCode: "TH-CENTER",
    destinationWarehouseCode: "TH-SUB",
    sourceStockStatus: "AVAILABLE",
    destinationStockStatus: null
  }
};

function parseLimit(value, fallback = 50, max = 500) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function parseOffset(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function cleanText(value) {
  const text = String(value === undefined || value === null ? "" : value).trim();
  return text || null;
}

function normalizeCode(value) {
  return cleanText(value) ? cleanText(value).toUpperCase() : null;
}

function normalizePartNo(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeMovementType(value) {
  const movementType = normalizeCode(value);
  if (!movementType || !MOVEMENT_CONFIG[movementType]) {
    throw httpError(400, "movementType must be ISSUE, RETURN, or TRANSFER");
  }
  return movementType;
}

function normalizeStockStatus(value, fallback, fieldName) {
  const stockStatus = normalizeCode(value) || fallback;
  if (!STOCK_STATUSES.has(stockStatus)) {
    throw httpError(400, `${fieldName} is invalid`);
  }
  return stockStatus;
}

function requirePositiveQty(value) {
  const qty = Number(value);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw httpError(400, "qty must be greater than 0");
  }
  return qty;
}

function normalizeSiteCode(value) {
  const siteCode = normalizeCode(value) || "D";
  if (!["D", "K"].includes(siteCode)) {
    throw httpError(400, "siteCode must be D or K");
  }
  return siteCode;
}

async function findMaterial(client, partNo) {
  const result = await client.query(
    `
      SELECT id, part_no, material_name, unit
      FROM material
      WHERE part_no = $1 AND is_active = true
    `,
    [partNo]
  );

  if (!result.rowCount) {
    throw httpError(404, "material not found");
  }

  return result.rows[0];
}

async function findWarehouse(client, warehouseCode, fieldName) {
  const result = await client.query(
    `
      SELECT id, warehouse_code, warehouse_name, location_type, default_stock_status
      FROM warehouse
      WHERE warehouse_code = $1 AND is_active = true
    `,
    [warehouseCode]
  );

  if (!result.rowCount) {
    throw httpError(404, `${fieldName} warehouse not found`);
  }

  return result.rows[0];
}

async function findWorkOrderId(client, workOrderNo) {
  if (!workOrderNo) return null;
  const result = await client.query(
    `
      SELECT id
      FROM work_order
      WHERE work_order_no = $1 AND deleted_at IS NULL
    `,
    [workOrderNo]
  );

  if (!result.rowCount) {
    throw httpError(404, "workOrderNo not found");
  }

  return result.rows[0].id;
}

async function findWarehouseBin(client, { warehouseId, materialId, stockStatus, binCode, required, fieldName }) {
  if (binCode) {
    const result = await client.query(
      `
        SELECT id, bin_code
        FROM warehouse_bin
        WHERE warehouse_id = $1 AND upper(bin_code) = $2 AND is_active = true
      `,
      [warehouseId, binCode.toUpperCase()]
    );

    if (!result.rowCount) {
      throw httpError(404, `${fieldName} bin not found`);
    }

    return result.rows[0];
  }

  const preferred = await client.query(
    `
      SELECT wb.id, wb.bin_code
      FROM warehouse_bin wb
      JOIN inventory_bin_balance ibb ON ibb.warehouse_bin_id = wb.id
      WHERE wb.warehouse_id = $1
        AND wb.is_active = true
        AND ibb.material_id = $2
        AND ibb.stock_status = $3
        AND ibb.qty > 0
      ORDER BY ibb.qty DESC, wb.bin_code
      LIMIT 1
    `,
    [warehouseId, materialId, stockStatus]
  );

  if (preferred.rowCount) return preferred.rows[0];

  const fallback = await client.query(
    `
      SELECT id, bin_code
      FROM warehouse_bin
      WHERE warehouse_id = $1 AND is_active = true
      ORDER BY bin_code
      LIMIT 1
    `,
    [warehouseId]
  );

  if (fallback.rowCount) return fallback.rows[0];
  if (required) throw httpError(404, `${fieldName} bin not found`);
  return null;
}

async function currentWarehouseQty(client, materialId, warehouseId, stockStatus) {
  const result = await client.query(
    `
      SELECT COALESCE(qty, 0) AS qty
      FROM inventory_balance
      WHERE material_id = $1 AND warehouse_id = $2 AND stock_status = $3
    `,
    [materialId, warehouseId, stockStatus]
  );
  return Number(result.rows[0] ? result.rows[0].qty : 0);
}

async function currentBinQty(client, materialId, warehouseId, warehouseBinId, stockStatus) {
  if (!warehouseBinId) return null;
  const result = await client.query(
    `
      SELECT COALESCE(qty, 0) AS qty
      FROM inventory_bin_balance
      WHERE material_id = $1
        AND warehouse_id = $2
        AND warehouse_bin_id = $3
        AND stock_status = $4
    `,
    [materialId, warehouseId, warehouseBinId, stockStatus]
  );
  return Number(result.rows[0] ? result.rows[0].qty : 0);
}

async function assertEnoughStock(client, { materialId, warehouse, bin, stockStatus, qty }) {
  const warehouseQty = await currentWarehouseQty(client, materialId, warehouse.id, stockStatus);
  if (warehouseQty < qty) {
    throw httpError(409, `insufficient ${warehouse.warehouse_code} ${stockStatus} stock`, {
      availableQty: warehouseQty,
      requestedQty: qty
    });
  }

  const binQty = await currentBinQty(client, materialId, warehouse.id, bin && bin.id, stockStatus);
  if (binQty !== null && binQty < qty) {
    throw httpError(409, `insufficient ${warehouse.warehouse_code}/${bin.bin_code} ${stockStatus} stock`, {
      availableQty: binQty,
      requestedQty: qty
    });
  }
}

async function applyWarehouseDelta(client, materialId, warehouseId, stockStatus, delta) {
  const result = await client.query(
    `
      INSERT INTO inventory_balance (material_id, warehouse_id, stock_status, qty)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (material_id, warehouse_id, stock_status)
      DO UPDATE SET qty = inventory_balance.qty + EXCLUDED.qty, updated_at = now()
      RETURNING qty
    `,
    [materialId, warehouseId, stockStatus, delta]
  );

  if (Number(result.rows[0].qty) < 0) {
    throw httpError(409, "inventory balance cannot be negative");
  }
}

async function applyBinDelta(client, materialId, warehouseId, warehouseBinId, stockStatus, delta) {
  if (!warehouseBinId) return;
  const result = await client.query(
    `
      INSERT INTO inventory_bin_balance (material_id, warehouse_id, warehouse_bin_id, stock_status, qty)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (material_id, warehouse_id, warehouse_bin_id, stock_status)
      DO UPDATE SET qty = inventory_bin_balance.qty + EXCLUDED.qty, updated_at = now()
      RETURNING qty
    `,
    [materialId, warehouseId, warehouseBinId, stockStatus, delta]
  );

  if (Number(result.rows[0].qty) < 0) {
    throw httpError(409, "inventory bin balance cannot be negative");
  }
}

async function recordTransaction(client, values) {
  await client.query(
    `
      INSERT INTO inventory_transaction (
        inventory_document_id,
        inventory_document_line_id,
        material_id,
        warehouse_id,
        warehouse_bin_id,
        stock_status,
        qty_change,
        transaction_type,
        work_order_id,
        custodian_name,
        note
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    values
  );
}

async function createInventoryMovement(body, forcedMovementType) {
  const movementType = forcedMovementType || normalizeMovementType(body.movementType);
  const config = MOVEMENT_CONFIG[movementType];
  const partNo = normalizePartNo(body.partNo);
  if (!partNo) throw httpError(400, "partNo is required");

  const qty = requirePositiveQty(body.qty);
  const siteCode = normalizeSiteCode(body.siteCode);
  const sourceWarehouseCode = normalizeCode(body.sourceWarehouseCode) || config.sourceWarehouseCode;
  const destinationWarehouseCode = normalizeCode(body.destinationWarehouseCode) || config.destinationWarehouseCode;
  const sourceStockStatus = normalizeStockStatus(body.sourceStockStatus, config.sourceStockStatus, "sourceStockStatus");
  const destinationStatusFallback = config.destinationStockStatus || null;
  const note = cleanText(body.note);
  const custodianName = cleanText(body.custodianName);
  const workOrderNo = cleanText(body.workOrderNo);

  return withTransaction(async (client) => {
    const material = await findMaterial(client, partNo);
    const sourceWarehouse = await findWarehouse(client, sourceWarehouseCode, "source");
    const destinationWarehouse = await findWarehouse(client, destinationWarehouseCode, "destination");
    const destinationStockStatus = normalizeStockStatus(
      body.destinationStockStatus,
      destinationStatusFallback || destinationWarehouse.default_stock_status || sourceStockStatus,
      "destinationStockStatus"
    );
    const workOrderId = await findWorkOrderId(client, workOrderNo);
    const sourceBin = await findWarehouseBin(client, {
      warehouseId: sourceWarehouse.id,
      materialId: material.id,
      stockStatus: sourceStockStatus,
      binCode: cleanText(body.sourceBinCode),
      required: false,
      fieldName: "source"
    });
    const destinationBin = await findWarehouseBin(client, {
      warehouseId: destinationWarehouse.id,
      materialId: material.id,
      stockStatus: destinationStockStatus,
      binCode: cleanText(body.destinationBinCode),
      required: false,
      fieldName: "destination"
    });

    const sameTarget =
      sourceWarehouse.id === destinationWarehouse.id &&
      (sourceBin && sourceBin.id) === (destinationBin && destinationBin.id) &&
      sourceStockStatus === destinationStockStatus;

    if (sameTarget) {
      throw httpError(400, "source and destination cannot be the same");
    }

    await assertEnoughStock(client, {
      materialId: material.id,
      warehouse: sourceWarehouse,
      bin: sourceBin,
      stockStatus: sourceStockStatus,
      qty
    });

    const documentNoResult = await client.query(
      "SELECT next_document_no('I', CURRENT_DATE, $1, 'MAT') AS document_no",
      [siteCode]
    );
    const documentNo = documentNoResult.rows[0].document_no;
    const documentResult = await client.query(
      `
        INSERT INTO inventory_document (
          document_no,
          movement_type,
          document_status,
          document_date,
          site_code,
          source_warehouse_id,
          destination_warehouse_id,
          work_order_id,
          applied_at,
          note
        )
        VALUES ($1, $2, 'APPLIED', CURRENT_DATE, $3, $4, $5, $6, now(), $7)
        RETURNING id, document_no, movement_type, document_status, document_date, site_code, applied_at, note
      `,
      [documentNo, movementType, siteCode, sourceWarehouse.id, destinationWarehouse.id, workOrderId, note]
    );
    const document = documentResult.rows[0];
    const lineResult = await client.query(
      `
        INSERT INTO inventory_document_line (
          inventory_document_id,
          line_no,
          material_id,
          from_warehouse_id,
          from_warehouse_bin_id,
          from_stock_status,
          to_warehouse_id,
          to_warehouse_bin_id,
          to_stock_status,
          qty,
          unit,
          line_status,
          note
        )
        VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'APPLIED', $11)
        RETURNING id, line_no, qty, unit, from_stock_status, to_stock_status, line_status, note
      `,
      [
        document.id,
        material.id,
        sourceWarehouse.id,
        sourceBin && sourceBin.id,
        sourceStockStatus,
        destinationWarehouse.id,
        destinationBin && destinationBin.id,
        destinationStockStatus,
        qty,
        material.unit,
        note
      ]
    );
    const line = lineResult.rows[0];

    await applyWarehouseDelta(client, material.id, sourceWarehouse.id, sourceStockStatus, -qty);
    await applyBinDelta(client, material.id, sourceWarehouse.id, sourceBin && sourceBin.id, sourceStockStatus, -qty);
    await applyWarehouseDelta(client, material.id, destinationWarehouse.id, destinationStockStatus, qty);
    await applyBinDelta(client, material.id, destinationWarehouse.id, destinationBin && destinationBin.id, destinationStockStatus, qty);

    await recordTransaction(client, [
      document.id,
      line.id,
      material.id,
      sourceWarehouse.id,
      sourceBin && sourceBin.id,
      sourceStockStatus,
      -qty,
      `${movementType}_OUT`,
      workOrderId,
      custodianName,
      note
    ]);
    await recordTransaction(client, [
      document.id,
      line.id,
      material.id,
      destinationWarehouse.id,
      destinationBin && destinationBin.id,
      destinationStockStatus,
      qty,
      `${movementType}_IN`,
      workOrderId,
      custodianName,
      note
    ]);

    return {
      document,
      line,
      material: {
        id: material.id,
        partNo: material.part_no,
        materialName: material.material_name,
        unit: material.unit
      },
      source: {
        warehouseCode: sourceWarehouse.warehouse_code,
        warehouseName: sourceWarehouse.warehouse_name,
        binCode: sourceBin && sourceBin.bin_code,
        stockStatus: sourceStockStatus
      },
      destination: {
        warehouseCode: destinationWarehouse.warehouse_code,
        warehouseName: destinationWarehouse.warehouse_name,
        binCode: destinationBin && destinationBin.bin_code,
        stockStatus: destinationStockStatus
      }
    };
  });
}

async function movementResponse(req, res, movementType) {
  const movement = await createInventoryMovement(req.body || {}, movementType);
  res.status(201).json({ movement });
}

router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const limit = parseLimit(req.query.limit);
    const offset = parseOffset(req.query.offset);
    const values = [];
    const filters = [];

    if (req.query.search) {
      values.push(`%${String(req.query.search).trim()}%`);
      filters.push(`(part_no ILIKE $${values.length} OR material_name ILIKE $${values.length})`);
    }

    if (req.query.needPurchase === "true") {
      filters.push("stock_advice = '需請購'");
    }

    const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    values.push(limit);
    const limitIndex = values.length;
    values.push(offset);
    const offsetIndex = values.length;

    const result = await query(
      `
        SELECT *
        FROM v_material_stock_summary
        ${whereSql}
        ORDER BY part_no
        LIMIT $${limitIndex} OFFSET $${offsetIndex}
      `,
      values
    );

    res.json({ items: result.rows, page: { limit, offset } });
  })
);

router.get(
  "/locations",
  asyncHandler(async (req, res) => {
    const limit = parseLimit(req.query.limit);
    const offset = parseOffset(req.query.offset);
    const values = [];
    const filters = [];

    if (req.query.partNo) {
      values.push(String(req.query.partNo).trim().toUpperCase());
      filters.push(`part_no = $${values.length}`);
    }

    if (req.query.stockStatus) {
      values.push(String(req.query.stockStatus).trim().toUpperCase());
      filters.push(`stock_status = $${values.length}`);
    }

    if (req.query.locationType) {
      values.push(String(req.query.locationType).trim().toUpperCase());
      filters.push(`location_type = $${values.length}`);
    }

    const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    values.push(limit);
    const limitIndex = values.length;
    values.push(offset);
    const offsetIndex = values.length;

    const result = await query(
      `
        SELECT *
        FROM v_material_location_balance
        ${whereSql}
        ORDER BY part_no, warehouse_name, bin_code, stock_status
        LIMIT $${limitIndex} OFFSET $${offsetIndex}
      `,
      values
    );

    res.json({ items: result.rows, page: { limit, offset } });
  })
);

router.get(
  "/statuses",
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          stock_status,
          count(*)::int AS line_count,
          COALESCE(sum(qty), 0) AS total_qty
        FROM inventory_balance
        GROUP BY stock_status
        ORDER BY stock_status
      `
    );

    res.json({ items: result.rows });
  })
);

router.post(
  "/movements",
  asyncHandler(async (req, res) => {
    await movementResponse(req, res);
  })
);

router.post(
  "/issue",
  asyncHandler(async (req, res) => {
    await movementResponse(req, res, "ISSUE");
  })
);

router.post(
  "/return",
  asyncHandler(async (req, res) => {
    await movementResponse(req, res, "RETURN");
  })
);

router.post(
  "/transfer",
  asyncHandler(async (req, res) => {
    await movementResponse(req, res, "TRANSFER");
  })
);

module.exports = router;
