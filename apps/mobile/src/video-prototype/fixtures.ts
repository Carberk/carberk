// SHA-256 covers each committed JSON file's exact UTF-8 bytes, including its final LF.
import short from "./fixtures/clip-45.json";
import boundary from "./fixtures/clip-90.json";
import long from "./fixtures/clip-120.json";

export type SyntheticClip = {
  kind: "synthetic-storyboard-v1";
  id: string;
  durationSeconds: number;
  sha256: string;
  frames: readonly { atSeconds: number; carX: number }[];
};

export const SYNTHETIC_CLIPS: readonly SyntheticClip[] = [
  { ...short, kind: "synthetic-storyboard-v1", id: "clip-45", sha256: "7618658df4583d6fe78fdb2908ad82433160aab6856a6d520e9b00626a6b251f" },
  { ...boundary, kind: "synthetic-storyboard-v1", id: "clip-90", sha256: "3c0647ce067b71b7699e18ca3b5c4fb978356158ed987d526fe74b9a412b067d" },
  { ...long, kind: "synthetic-storyboard-v1", id: "clip-120", sha256: "157bef55c50343fbef57d6cde6c4cdf9a85c709e5e6b51b0a0edbf20745fff5e" },
];
