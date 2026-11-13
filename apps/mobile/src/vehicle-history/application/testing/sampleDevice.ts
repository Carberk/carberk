/** Filesystem boundary substitute; the feature and native adapter both execute. */
export const sampleDevice = {
  files: new Map<string, string>(),
  failure: false,
  hold: undefined as Promise<void> | undefined,
  reset() { this.files.clear(); this.failure = false; this.hold = undefined; },
};
export const sampleFileSystem = {
  documentDirectory: "file:///documents/",
  async writeAsStringAsync(uri: string, content: string) {
    if (sampleDevice.hold) await sampleDevice.hold;
    if (sampleDevice.failure) throw new Error("ENOSPC");
    sampleDevice.files.set(uri, content);
  },
  async readAsStringAsync(uri: string) { return sampleDevice.files.get(uri); },
};
