import type { SyntheticClip } from "../../fixtures";
import type { LocalVideoAdapter } from "../../localAdapter";
import type { PreparedClip, VideoSelection } from "../../state";

/** Controllable local processing boundary, shared by feature behavior tests. */
export class FakeLocalVideoAdapter implements LocalVideoAdapter {
  output: PreparedClip = {
    kind: "prepared-descriptor-v1", descriptorUtf8: "fake-prepared-descriptor-v1\n", sizeBytes: 28,
    sha256: "d9ef07d638d9f6810295a9820ba62eb33fd61cb1a542a5e498dcff3cb82f1d49",
  };
  preparationError = false;
  uploadError = false;
  progressSteps = [17, 63, 100];
  deferred: Promise<PreparedClip> | null = null;
  staged = new Set<PreparedClip>();
  async prepare(_source: SyntheticClip, _selection: VideoSelection) {
    if (this.preparationError) throw new Error("SYNTHETIC_PREPARATION_FAILURE");
    const output = this.deferred ? await this.deferred : this.output;
    this.staged.add(output);
    return output;
  }
  uploadChunk(prepared: PreparedClip, confirmedPercent: number) {
    if (this.uploadError) throw new Error("SYNTHETIC_UPLOAD_FAILURE");
    if (!this.staged.has(prepared)) throw new Error("PREPARED_OUTPUT_REQUIRED");
    return this.progressSteps.find((step) => step > confirmedPercent) ?? 100;
  }
  discard(prepared: PreparedClip) { this.staged.delete(prepared); }
}
