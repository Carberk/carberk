import { beforeEach, expect, it, vi } from "vitest";

import { renderMobile, fireEvent, act } from "../../test/render";

import { PrivateDocumentAction } from "./PrivateDocumentAction";
const native = vi.hoisted(() => ({ files: [] as { deleted: boolean; bytes: Uint8Array | null }[], shared: [] as string[], available: true }));
vi.mock("expo-file-system", () => ({ Paths: { cache: "file:///cache" }, File: class { uri = "file:///cache/synthetic.pdf"; private record = { deleted: false, bytes: null as Uint8Array | null }; constructor() { native.files.push(this.record); } create() {} write(value: Uint8Array) { this.record.bytes = value; } delete() { this.record.deleted = true; } } }));
vi.mock("expo-sharing", () => ({ isAvailableAsync: async () => native.available, shareAsync: async (uri: string) => { native.shared.push(uri); } }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "synthetic" }));
beforeEach(() => { native.files = []; native.shared = []; native.available = true; });
it("hands authenticated bytes to the native document sheet and deletes the temporary file afterward", async () => {
 const bytes = new Uint8Array([37,80,68,70]);
 const screen = await renderMobile(<PrivateDocumentAction download={async () => bytes} label="Open or save PDF" busyLabel="Opening" errorLabel="Retry PDF"/>);
 await fireEvent.press(screen.getByRole("button", { name: "Open or save PDF" })); await screen.findByRole("button", { name: "Open or save PDF" });
 expect(native.shared).toEqual(["file:///cache/synthetic.pdf"]); expect(native.files[0]?.bytes).toEqual(bytes); expect(native.files[0]?.deleted).toBe(true);
});
it("does not write or share a late private download after the owning view closes", async () => {
 let complete!: (bytes: Uint8Array) => void; const pending = new Promise<Uint8Array>(resolve => { complete = resolve; });
 const screen = await renderMobile(<PrivateDocumentAction download={() => pending} label="Open PDF" busyLabel="Opening" errorLabel="Retry PDF"/>);
 await fireEvent.press(screen.getByRole("button", { name: "Open PDF" })); await screen.unmount();
 await act(async () => { complete(new Uint8Array([1])); }); expect(native.shared).toEqual([]); expect(native.files).toEqual([]);
});
