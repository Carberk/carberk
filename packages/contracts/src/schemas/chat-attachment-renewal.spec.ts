import { expect, it } from "vitest";

import { RenewChatAttachmentRequestSchema, RenewChatAttachmentResponseSchema } from "./conversations";

it("retains the same chat key and declared metadata without accepting caller authority", () => {
  const body = { key: "chat-attachments/conversation/11111111-1111-4111-8111-111111111111/original.webp", contentType: "image/webp", sizeBytes: 86 };
  expect(RenewChatAttachmentRequestSchema.parse(body)).toEqual(body);
  for (const extra of [{ contentType: "image/jpeg" }, { sizeBytes: 0 }, { sizeBytes: 5242881 }, { etag: "completed" }, { uploadUrl: "https://other.test" }]) {
    expect(RenewChatAttachmentRequestSchema.safeParse({ ...body, ...extra }).success).toBe(false);
  }
});

it("reports present bytes without upload authority or an assertion that the image is usable", () => {
  expect(RenewChatAttachmentResponseSchema.parse({ state: "present", key: "key" })).toEqual({ state: "present", key: "key" });
  expect(RenewChatAttachmentResponseSchema.safeParse({ state: "present", key: "key", uploadUrl: "https://storage.test" }).success).toBe(false);
  expect(RenewChatAttachmentResponseSchema.safeParse({ state: "upload_required", key: "key", uploadUrl: "https://storage.test", expiresIn: 600,
    maxSizeBytes: 5242880, headers: { "content-type": "image/webp" } }).success).toBe(false);
});
