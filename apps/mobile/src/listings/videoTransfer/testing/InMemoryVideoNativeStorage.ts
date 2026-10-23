/** Native filesystem and small-record persistence boundaries, shared by adapter tests. */
export const videoNativeStorage = { values: new Map<string, string>(), files: new Map<string, Uint8Array>() };
export class VideoNativeFile {
  constructor(readonly uri: string) {}
  get exists() { return videoNativeStorage.files.has(this.uri); }
  get size() { return videoNativeStorage.files.get(this.uri)?.length ?? 0; }
  async bytes() { return videoNativeStorage.files.get(this.uri)?.slice() ?? new Uint8Array(); }
  open() {
    const uri = this.uri;
    return { offset: 0, close() {}, readBytes(length: number) { return videoNativeStorage.files.get(uri)?.slice(this.offset, this.offset + length) ?? new Uint8Array(); } };
  }
}
