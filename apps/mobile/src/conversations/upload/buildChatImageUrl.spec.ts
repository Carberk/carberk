import { describe, it, expect, afterEach, vi } from "vitest";

const originalEnv = process.env;

describe("buildChatImageUrl", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("returns an empty string when EXPO_PUBLIC_MEDIA_URL is unset", async () => {
    delete process.env["EXPO_PUBLIC_MEDIA_URL"];
    const { buildChatImageUrl } = await import("./buildChatImageUrl");
    expect(buildChatImageUrl("abc.webp")).toBe("");
  });

  it("keeps the full presigned object key after the bucket", async () => {
    process.env["EXPO_PUBLIC_MEDIA_URL"] = "https://cdn.example.com";
    const { buildChatImageUrl } = await import("./buildChatImageUrl");
    expect(buildChatImageUrl("chat-attachments/conv-1/key/original.webp")).toBe(
      "https://cdn.example.com/chat-attachments/chat-attachments/conv-1/key/original.webp",
    );
  });

  it("supports legacy object keys without a chat namespace", async () => {
    process.env["EXPO_PUBLIC_MEDIA_URL"] = "https://cdn.example.com";
    const { buildChatImageUrl } = await import("./buildChatImageUrl");
    expect(buildChatImageUrl("conv-1/key/original.webp")).toBe(
      "https://cdn.example.com/chat-attachments/conv-1/key/original.webp",
    );
  });

  it("strips a trailing slash from the media URL", async () => {
    process.env["EXPO_PUBLIC_MEDIA_URL"] = "https://cdn.example.com/";
    const { buildChatImageUrl } = await import("./buildChatImageUrl");
    expect(buildChatImageUrl("chat-attachments/conv-1/key/original.webp")).toBe(
      "https://cdn.example.com/chat-attachments/chat-attachments/conv-1/key/original.webp",
    );
  });
  it.each(["http://media.example.com/photo.webp", "https://cdn.example.com/photo.webp"])(
    "preserves an already-public URL %s even without a media origin",
    async (url) => {
      delete process.env["EXPO_PUBLIC_MEDIA_URL"];
      const { buildChatImageUrl } = await import("./buildChatImageUrl");
      expect(buildChatImageUrl(url)).toBe(url);
    },
  );
});
