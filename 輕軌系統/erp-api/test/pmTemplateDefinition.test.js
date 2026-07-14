const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeAttachmentList } = require("../src/services/pmTemplateDefinition");

test("seat map attachment keeps stable codes and structured rows", () => {
  const [attachment] = normalizeAttachmentList([{
    attachmentCode: "p1-seat",
    attachmentName: "座椅確認圖",
    attachmentType: "SEAT_MAP",
    schemaJson: { modules: [{ code: "M1", rows: [["S", "P", null]] }] },
  }]);
  assert.equal(attachment.attachmentCode, "P1-SEAT");
  assert.equal(attachment.schemaVersion, 1);
  assert.deepEqual(attachment.schemaJson.modules[0].rows[0], ["S", "P", null]);
});

test("template attachment keeps its published library version reference", () => {
  const [attachment] = normalizeAttachmentList([{
    definitionVersionId: "attachment-version-1",
    attachmentCode: "P1-SEAT",
    attachmentName: "座椅確認圖",
    attachmentType: "SEAT_MAP",
    schemaJson: { modules: [{ code: "M1", rows: [["S"]] }] },
  }]);
  assert.equal(attachment.definitionVersionId, "attachment-version-1");
});

test("measurement attachment rejects an inverted numeric range", () => {
  assert.throws(() => normalizeAttachmentList([{
    attachmentCode: "P1-BRAKE",
    attachmentName: "煞車量測",
    attachmentType: "MEASUREMENT_TABLE",
    schemaJson: {
      points: [{ key: "M1", label: "模組 1" }],
      fields: [{ key: "gap", label: "空氣隙", min: 9, max: 6 }],
    },
  }]), /最小值不可大於最大值/);
});

test("attachment list rejects duplicate attachment codes", () => {
  const base = {
    attachmentName: "一般附件",
    attachmentType: "OTHER",
    schemaJson: {},
  };
  assert.throws(() => normalizeAttachmentList([
    { ...base, attachmentCode: "P1-A" },
    { ...base, attachmentCode: "p1-a" },
  ]), /附件代碼重複/);
});
