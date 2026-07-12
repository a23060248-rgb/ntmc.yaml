import { describe, expect, it } from "vitest";
import { encodeHeaderValue } from "./client";

describe("API preview headers", () => {
  it("encodes a Chinese display name as an HTTP-safe value", () => {
    const encoded = encodeHeaderValue("系統管理員");

    expect(encoded).toMatch(/^[\x00-\x7F]+$/);
    expect(decodeURIComponent(encoded)).toBe("系統管理員");
  });
});
