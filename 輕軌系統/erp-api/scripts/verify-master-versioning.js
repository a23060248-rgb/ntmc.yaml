const assert = require("node:assert/strict");

const apiBase = process.env.REHEARSAL_API_URL || "http://127.0.0.1:3102/api";
const headers = {
  "content-type": "application/json",
  "x-user-role": "system_admin",
  "x-user-name": "Rehearsal Admin"
};

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(`${options.method || "GET"} ${path} returned ${response.status}: ${body?.error?.message || text}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function expectStatus(path, options, expected) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });
  assert.equal(response.status, expected, `${options.method || "GET"} ${path}`);
}

async function getFixtureIds() {
  const [materials, instruments, wis] = await Promise.all([
    request("/materials?search=REH-CONS-001&limit=5"),
    request("/master-data/instruments?search=REH-INST-001&limit=5"),
    request("/master-data/wi-documents?search=REH-WI-P1&limit=5")
  ]);
  assert.equal(materials.items.length, 1, "rehearsal material missing");
  assert.equal(instruments.items.length, 1, "rehearsal instrument missing");
  assert.equal(wis.items.length, 1, "rehearsal WI missing");
  return {
    materialId: materials.items[0].id,
    instrumentId: instruments.items[0].id,
    wiDocumentId: wis.items[0].id
  };
}

async function configureDraft(draft, fixture, suffix) {
  await request(`/master-data/pm-template-studio/${draft.id}/check-items`, {
    method: "PUT",
    body: JSON.stringify({
      items: [
        {
          section: "Rehearsal visual checks",
          sectionSortOrder: 1,
          itemNo: `REH-CHECK-${suffix}`,
          itemDescription: "Verify the rehearsal component is secure",
          checkType: "checkbox",
          defaultStatus: "未填",
          isRequired: true,
          sortOrder: 1
        },
        {
          section: "Rehearsal measurements",
          sectionSortOrder: 2,
          itemNo: `REH-MEASURE-${suffix}`,
          itemDescription: "Record rehearsal insulation resistance",
          checkType: "value",
          standardValue: "1-10",
          unit: "kOhm",
          defaultStatus: "未填",
          requiresValue: true,
          isRequired: true,
          minValue: 1,
          maxValue: 10,
          validationRule: "RANGE",
          sortOrder: 1
        }
      ]
    })
  });
  await request(`/master-data/pm-template-studio/${draft.id}/materials`, {
    method: "PUT",
    body: JSON.stringify({
      items: [{
        materialId: fixture.materialId,
        defaultQty: 2,
        defaultUnit: "EA",
        displayNote: "Rehearsal conditional material",
        sortOrder: 1,
        conditionCode: "AIR_FILTER_MODE",
        conditionOptions: [
          { code: "N/A", quantity: 0 },
          { code: "WASH", quantity: 1 },
          { code: "REPLACE", quantity: 2 }
        ],
        isRequired: false
      }]
    })
  });
  await request(`/master-data/pm-template-studio/${draft.id}/instruments`, {
    method: "PUT",
    body: JSON.stringify({ items: [{ instrumentId: fixture.instrumentId, sortOrder: 1, isRequired: true }] })
  });
  await request(`/master-data/pm-template-studio/${draft.id}/wi-documents`, {
    method: "PUT",
    body: JSON.stringify({ items: [{ wiDocumentId: fixture.wiDocumentId, sortOrder: 1, isRequired: true }] })
  });

  const form = await request("/precheck/form-templates", {
    method: "POST",
    body: JSON.stringify({
      pmTemplateId: draft.id,
      templateCode: `REH-P1-${suffix}`,
      templateName: `Rehearsal P1 ${suffix}`,
      versionNo: suffix,
      sourceFileName: `rehearsal-p1-${suffix}.docx`,
      storagePath: `rehearsal-p1-${suffix}.docx`,
      fileHash: "0".repeat(64),
      fileFormat: "DOCX"
    })
  });
  await request(`/precheck/form-templates/${form.item.id}/mappings`, {
    method: "PUT",
    body: JSON.stringify({
      mappings: [{
        fieldKey: "workOrderNo",
        sourcePath: "workOrderNo",
        wordTargetType: "PLACEHOLDER",
        wordTarget: "{{WORK_ORDER_NO}}",
        isRequired: true,
        sortOrder: 1
      }]
    })
  });
  await request(`/precheck/form-templates/${form.item.id}/publish`, {
    method: "POST",
    body: JSON.stringify({})
  });
  const published = await request(`/master-data/pm-template-studio/${draft.id}/publish`, {
    method: "POST",
    body: JSON.stringify({})
  });
  return published.item;
}

async function createRevision(source, fixture, label) {
  const cloned = await request(`/master-data/pm-template-studio/${source.id}/revisions`, {
    method: "POST",
    body: JSON.stringify({ versionNo: label })
  });
  return configureDraft(cloned.item, fixture, label);
}

async function createScheduleAndPackage(year, month, latestFinishDate) {
  const preview = await request("/precheck/imports/preview", {
    method: "POST",
    headers: { "x-user-role": "scheduler" },
    body: JSON.stringify({
      sourceFile: `rehearsal-master-version-${year}-${month}.json`,
      sourceYear: year,
      siteCode: "D",
      targetType: "VEHICLE",
      rows: [{
        trainNo: "101車",
        levels: { [String(month)]: "1M" },
        latestActualFinishDate: latestFinishDate
      }]
    })
  });
  await request(`/precheck/imports/${preview.batch.id}/apply`, {
    method: "POST",
    headers: { "x-user-role": "scheduler" },
    body: JSON.stringify({})
  });
  await request("/precheck/schedules/generate", {
    method: "POST",
    headers: { "x-user-role": "scheduler" },
    body: JSON.stringify({ startDate: `${year}-01-01` })
  });
  const schedules = await request(`/precheck/schedules?year=${year}&month=${month}&search=101&limit=20`);
  assert.equal(schedules.items.length, 1, `schedule ${year}-${month} missing`);
  const schedule = schedules.items[0];
  assert.ok(schedule.plannedStartDate, "generated schedule date missing");
  await request("/precheck/schedules/publish", {
    method: "POST",
    headers: { "x-user-role": "scheduler" },
    body: JSON.stringify({ ids: [schedule.id], reason: "Rehearsal template snapshot verification" })
  });
  const created = await request(`/precheck/schedules/${schedule.id}/work-order`, {
    method: "POST",
    headers: { "x-user-role": "scheduler" },
    body: JSON.stringify({ remark: "Rehearsal template snapshot verification" })
  });
  return request(`/precheck/packages/${encodeURIComponent(created.workOrderNo)}`);
}

function scheduleSlot(revisionNo) {
  const slot = Math.max(Number(revisionNo) - 1, 0);
  return {
    year: 2100 + Math.floor(slot / 12),
    month: (slot % 12) + 1
  };
}

function priorMonthDate(year, month) {
  return new Date(Date.UTC(year, month - 2, 10)).toISOString().slice(0, 10);
}

async function main() {
  const fixture = await getFixtureIds();
  const templates = await request("/master-data/pm-template-studio?search=P1&limit=100");
  const source = templates.items.find((item) => item.pm_code === "P1" && item.lifecycle_status === "PUBLISHED");
  assert.ok(source, "published P1 source missing");

  const stamp = Date.now();
  const version2 = await createRevision(source, fixture, `REH2-${stamp}`);
  const slot2 = scheduleSlot(version2.revision_no);
  const oldPackage = await createScheduleAndPackage(slot2.year, slot2.month, priorMonthDate(slot2.year, slot2.month));
  assert.equal(oldPackage.item.formSnapshot.pmTemplateId, version2.id);
  assert.equal(String(oldPackage.item.pmTemplateVersion), String(version2.version_no));

  await expectStatus(`/master-data/pm-template-studio/${version2.id}`, {
    method: "PATCH",
    body: JSON.stringify({ pmLabel: "Published templates cannot change" })
  }, 409);
  await expectStatus(`/master-data/pm-template-studio/${version2.id}`, { method: "DELETE" }, 404);

  const version3 = await createRevision(version2, fixture, `REH3-${stamp}`);
  const oldPackageAfterPublish = await request(`/precheck/packages/${encodeURIComponent(oldPackage.item.workOrderNo)}`);
  assert.equal(oldPackageAfterPublish.item.formSnapshot.pmTemplateId, version2.id, "existing order snapshot changed");

  const slot3 = scheduleSlot(version3.revision_no);
  const newPackage = await createScheduleAndPackage(slot3.year, slot3.month, priorMonthDate(slot3.year, slot3.month));
  assert.equal(newPackage.item.formSnapshot.pmTemplateId, version3.id, "new order did not receive latest template");

  console.log(JSON.stringify({
    ok: true,
    version2: { id: version2.id, versionNo: version2.version_no },
    version3: { id: version3.id, versionNo: version3.version_no },
    existingOrder: oldPackage.item.workOrderNo,
    newOrder: newPackage.item.workOrderNo
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
