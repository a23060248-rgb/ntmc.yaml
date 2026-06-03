const express = require("express");
const { query, withTransaction } = require("../db");
const { asyncHandler, httpError } = require("../middleware/errorHandler");

const router = express.Router();

// ⑤ 設備生命週期：任何狀態/位置改變，都在同一交易裡同時更新 asset 與寫入 asset_event。
// 送修另外寫 repair_record。確保「狀態變了、履歷卻沒記」不會發生。

function cleanText(value) {
  const text = String(value === undefined || value === null ? "" : value).trim();
  return text || null;
}

async function resolveUserId(client, value) {
  const text = cleanText(value);
  if (!text) return null;
  const result = await client.query(
    `SELECT id FROM app_user WHERE employee_no = $1 OR display_name = $1 LIMIT 1`,
    [text]
  );
  return result.rowCount ? result.rows[0].id : null;
}

async function resolveWorkOrderId(client, workOrderNo) {
  const text = cleanText(workOrderNo);
  if (!text) return null;
  const result = await client.query(
    `SELECT id FROM work_order WHERE work_order_no = $1 AND deleted_at IS NULL`,
    [text]
  );
  if (!result.rowCount) throw httpError(404, "workOrderNo not found");
  return result.rows[0].id;
}

async function resolvePositionId(client, positionCode) {
  const text = cleanText(positionCode);
  if (!text) return null;
  const result = await client.query(
    `SELECT id, train_id FROM vehicle_position WHERE position_code = $1`,
    [text]
  );
  if (!result.rowCount) throw httpError(404, "position_code not found");
  return result.rows[0];
}

async function resolveWarehouseId(client, warehouseCode) {
  const text = cleanText(warehouseCode);
  if (!text) return null;
  const result = await client.query(
    `SELECT id FROM warehouse WHERE warehouse_code = $1`,
    [text.toUpperCase()]
  );
  if (!result.rowCount) throw httpError(404, "warehouse_code not found");
  return result.rows[0].id;
}

async function resolveVendorId(client, vendorCode) {
  const text = cleanText(vendorCode);
  if (!text) return null;
  const result = await client.query(
    `SELECT id FROM vendor WHERE vendor_code = $1`,
    [text]
  );
  if (!result.rowCount) throw httpError(404, "vendor_code not found");
  return result.rows[0].id;
}

// 核心：在已開啟的交易內，更新 asset + 寫 asset_event + 同步坑位 current_asset_id
async function transitionAsset(client, assetId, opts) {
  const cur = await client.query("SELECT * FROM asset WHERE id = $1 FOR UPDATE", [assetId]);
  if (!cur.rowCount) throw httpError(404, "asset not found");
  const a = cur.rows[0];

  let toPositionId = opts.toPositionId || null;
  let toWarehouseId = opts.toWarehouseId || null;
  let toVendorId = opts.toVendorId || null;
  let toTrainId = a.current_train_id;

  // 位置三選一：坑位 / 倉庫 / 廠商；給了坑位就清掉倉庫與廠商
  if (toPositionId) {
    toTrainId = opts.toTrainId || a.current_train_id;
    toWarehouseId = null;
    toVendorId = null;
  } else if (toWarehouseId || toVendorId) {
    toTrainId = null;
  }

  const toStatus = opts.toStatus || a.current_status;

  const updated = await client.query(
    `
      UPDATE asset SET
        current_status      = $2,
        current_position_id = $3,
        current_warehouse_id= $4,
        current_vendor_id   = $5,
        current_train_id    = $6,
        last_work_order_id  = COALESCE($7, last_work_order_id),
        updated_at          = now()
      WHERE id = $1
      RETURNING *
    `,
    [assetId, toStatus, toPositionId, toWarehouseId, toVendorId, toTrainId, opts.workOrderId || null]
  );

  await client.query(
    `
      INSERT INTO asset_event (
        asset_id, event_type, from_status, to_status,
        from_position_id, to_position_id, work_order_id, related_asset_id,
        handled_by, approved_by, note
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `,
    [
      assetId,
      opts.eventType,
      a.current_status,
      toStatus,
      a.current_position_id,
      toPositionId,
      opts.workOrderId || null,
      opts.relatedAssetId || null,
      opts.handledBy || null,
      opts.approvedBy || null,
      opts.note || null
    ]
  );

  // 同步坑位裝用關係：舊坑位清空、新坑位掛上
  if (a.current_position_id && a.current_position_id !== toPositionId) {
    await client.query(
      `UPDATE vehicle_position SET current_asset_id = NULL, updated_at = now()
       WHERE id = $1 AND current_asset_id = $2`,
      [a.current_position_id, assetId]
    );
  }
  if (toPositionId) {
    await client.query(
      `UPDATE vehicle_position SET current_asset_id = $2, last_replace_at = now(), updated_at = now()
       WHERE id = $1`,
      [toPositionId, assetId]
    );
  }

  return updated.rows[0];
}

// 一般狀態轉移（裝/拆/回庫/報廢等都可用）
router.post(
  "/:assetId/transition",
  asyncHandler(async (req, res) => {
    const assetId = String(req.params.assetId || "").trim();
    const body = req.body || {};
    const eventType = cleanText(body.eventType);
    if (!assetId) throw httpError(400, "assetId is required");
    if (!eventType) throw httpError(400, "eventType is required");

    const asset = await withTransaction(async (client) => {
      const position = await resolvePositionId(client, body.positionCode);
      const opts = {
        eventType,
        toStatus: cleanText(body.toStatus),
        toPositionId: position ? position.id : null,
        toTrainId: position ? position.train_id : null,
        toWarehouseId: await resolveWarehouseId(client, body.warehouseCode),
        toVendorId: await resolveVendorId(client, body.vendorCode),
        workOrderId: await resolveWorkOrderId(client, body.workOrderNo),
        handledBy: await resolveUserId(client, body.handledBy),
        approvedBy: await resolveUserId(client, body.approvedBy),
        note: cleanText(body.note)
      };
      return transitionAsset(client, assetId, opts);
    });

    res.status(201).json({ asset });
  })
);

// 裝上車（便捷）：需要 positionCode
router.post(
  "/:assetId/install",
  asyncHandler(async (req, res) => {
    const assetId = String(req.params.assetId || "").trim();
    const body = req.body || {};
    if (!cleanText(body.positionCode)) throw httpError(400, "positionCode is required");

    const asset = await withTransaction(async (client) => {
      const position = await resolvePositionId(client, body.positionCode);
      return transitionAsset(client, assetId, {
        eventType: cleanText(body.eventType) || "上線",
        toStatus: cleanText(body.toStatus) || "上線使用",
        toPositionId: position.id,
        toTrainId: position.train_id,
        workOrderId: await resolveWorkOrderId(client, body.workOrderNo),
        handledBy: await resolveUserId(client, body.handledBy),
        note: cleanText(body.note)
      });
    });

    res.status(201).json({ asset });
  })
);

// 拆下（便捷）：預設進機廠待修區、狀態待修
router.post(
  "/:assetId/remove",
  asyncHandler(async (req, res) => {
    const assetId = String(req.params.assetId || "").trim();
    const body = req.body || {};

    const asset = await withTransaction(async (client) => {
      const warehouseId = await resolveWarehouseId(client, body.warehouseCode || "SHOP-REPAIR");
      return transitionAsset(client, assetId, {
        eventType: cleanText(body.eventType) || "下線",
        toStatus: cleanText(body.toStatus) || "待修",
        toWarehouseId: warehouseId,
        workOrderId: await resolveWorkOrderId(client, body.workOrderNo),
        handledBy: await resolveUserId(client, body.handledBy),
        note: cleanText(body.note)
      });
    });

    res.status(201).json({ asset });
  })
);

// 送修：狀態改送修中 + 寫 asset_event + 建 repair_record（同一交易）
router.post(
  "/:assetId/send-repair",
  asyncHandler(async (req, res) => {
    const assetId = String(req.params.assetId || "").trim();
    const body = req.body || {};

    const result = await withTransaction(async (client) => {
      const vendorId = await resolveVendorId(client, body.vendorCode);
      const workOrderId = await resolveWorkOrderId(client, body.workOrderNo);
      const handledBy = await resolveUserId(client, body.handledBy);
      const note = cleanText(body.note);

      const asset = await transitionAsset(client, assetId, {
        eventType: "送修",
        toStatus: "送修中",
        toVendorId: vendorId,
        workOrderId,
        handledBy,
        note
      });

      const repair = await client.query(
        `
          INSERT INTO repair_record (
            asset_id, work_order_id, vendor_id, rma_no, send_date,
            expected_return_date, repair_status, note
          )
          VALUES ($1,$2,$3,$4,COALESCE($5, CURRENT_DATE),$6,'已送修',$7)
          RETURNING id, send_date, expected_return_date, repair_status, rma_no
        `,
        [
          assetId,
          workOrderId,
          vendorId,
          cleanText(body.rmaNo),
          cleanText(body.sendDate),
          cleanText(body.expectedReturnDate),
          note
        ]
      );

      return { asset, repair: repair.rows[0] };
    });

    res.status(201).json(result);
  })
);

// 設備履歷（最新在前）
router.get(
  "/:assetId/events",
  asyncHandler(async (req, res) => {
    const assetId = String(req.params.assetId || "").trim();
    const result = await query(
      `
        SELECT
          e.id, e.event_type, e.from_status, e.to_status,
          e.from_position_id, e.to_position_id,
          e.work_order_id, wo.work_order_no,
          e.event_at, u.display_name AS handled_by_name, e.note
        FROM asset_event e
        LEFT JOIN work_order wo ON wo.id = e.work_order_id
        LEFT JOIN app_user u ON u.id = e.handled_by
        WHERE e.asset_id = $1
        ORDER BY e.event_at DESC, e.created_at DESC
      `,
      [assetId]
    );
    res.json({ items: result.rows });
  })
);

module.exports = router;
