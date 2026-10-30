import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

// This path is shared by all four canonical modules. No resolve/load hook.
const runtimeId = fileURLToPath(new URL("./b5-observation-runtime.mjs", import.meta.url));
const runtimeImport = `import { observeCase as __b5ObserveCase, observeOuter as __b5ObserveOuter, emitFrozen as __b5EmitFrozen, begin as __b5Begin, step as __b5Step, close as __b5Close } from ${JSON.stringify(runtimeId)};\n`;
const sha = value => createHash("sha256").update(value).digest("hex");
const fail = () => { throw new Error("B5_OBSERVATION_SOURCE_ANCHOR_OR_ID_MISMATCH"); };

// Offsets count original UTF-8 bytes. Every anchor must occur exactly once.
const modules = [
  {
    "file": "../src/jobs/diagnostics/SafeReplacementScheduling.spec.ts",
    "sha256": "d6cf8dc5e5bcd293776bb78b0f445ba29a0c02b1c846bbb93493f7bc8e1f5f94",
    "insertions": [
      {
        "label": "runtime-import",
        "anchor": "import { createHash, randomUUID } from \"node:crypto\";\n",
        "edge": "before",
        "offset": 0,
        "text": null
      },
      {
        "label": "case-enter",
        "anchor": "async issuedLocale => {",
        "edge": "after",
        "offset": 1510,
        "text": "\n  return __b5ObserveCase(issuedLocale, async __b5Observation => {"
      },
      {
        "label": "outer-phase",
        "anchor": "  const phase = (next: Phase) => {",
        "edge": "after",
        "offset": 2059,
        "text": "\n    __b5ObserveOuter(next);"
      },
      {
        "label": "failure-freeze",
        "anchor": "  onTestFailed(() => {",
        "edge": "after",
        "offset": 2258,
        "text": "\n    __b5EmitFrozen(__b5Observation, \"failure\");"
      },
      {
        "label": "case-exit",
        "anchor": "  expect(await db.diagnosticPdfArtifact.findMany({ where: { reportId: id(2), rendererVersion: \"v1-erased-lineage\" } })).toEqual(replacements);\n",
        "edge": "after",
        "offset": 6958,
        "text": "  });\n"
      }
    ]
  },
  {
    "file": "../src/jobs/diagnostics/DiagnosticPdfRenderer.ts",
    "sha256": "56cadc7ed652de1293e1d7d65523935e71c5443e2777592e11f7620a69aa74be",
    "insertions": [
      {
        "label": "runtime-import",
        "anchor": "import fontkit from \"@pdf-lib/fontkit\";\n",
        "edge": "before",
        "offset": 0,
        "text": null
      },
      {
        "label": "render-enter",
        "anchor": "export async function renderDiagnosticPdf(input: DiagnosticPdfInput, fonts: DiagnosticPdfFonts): Promise<Uint8Array> {",
        "edge": "after",
        "offset": 5572,
        "text": "\n  const __b5Frame = __b5Begin(\"render-create\");\n  let __b5Failed = false;\n  try {"
      },
      {
        "label": "render-exit",
        "anchor": "  return bytes;\n",
        "edge": "after",
        "offset": 12747,
        "text": "  } catch (__b5OriginalError) {\n    __b5Failed = true;\n    throw __b5OriginalError;\n  } finally {\n    __b5Close(__b5Frame, __b5Failed);\n  }\n"
      },
      {
        "label": "before-fonts",
        "anchor": "  const regular = await pdf.embedFont(fonts.regular, { subset: true, features: { kern: false, mark: false, mkmk: false } });",
        "edge": "before",
        "offset": 6086,
        "text": "  __b5Step(__b5Frame, \"render-fonts\");\n"
      },
      {
        "label": "after-fonts",
        "anchor": "const bold = await pdf.embedFont(fonts.bold, { subset: true, features: { kern: false, mark: false, mkmk: false } });",
        "edge": "after",
        "offset": 6329,
        "text": "\n  __b5Step(__b5Frame, \"render-layout\");"
      },
      {
        "label": "before-save",
        "anchor": "  const bytes = await pdf.save();",
        "edge": "before",
        "offset": 12611,
        "text": "  __b5Step(__b5Frame, \"render-save\");\n"
      }
    ]
  },
  {
    "file": "../src/jobs/diagnostics/testing/readDiagnosticPdfText.ts",
    "sha256": "247d1c3367983a5bb6bc406d8cf9a530b5d53e662060303bf4367e3b56e2d083",
    "insertions": [
      {
        "label": "runtime-import",
        "anchor": "import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from \"pdf-lib\";\n",
        "edge": "before",
        "offset": 0,
        "text": null
      },
      {
        "label": "parser-enter",
        "anchor": "export async function readDiagnosticPdfText(bytes: Uint8Array): Promise<string> {",
        "edge": "after",
        "offset": 337,
        "text": "\n  const __b5Frame = __b5Begin(\"parse-load\");\n  let __b5Failed = false;\n  try {"
      },
      {
        "label": "parser-exit",
        "anchor": "  return result.join(\"\\n\");\n",
        "edge": "after",
        "offset": 2814,
        "text": "  } catch (__b5OriginalError) {\n    __b5Failed = true;\n    throw __b5OriginalError;\n  } finally {\n    __b5Close(__b5Frame, __b5Failed);\n  }\n"
      },
      {
        "label": "page-fonts",
        "anchor": "  for (const page of pdf.getPages()) {",
        "edge": "after",
        "offset": 444,
        "text": "\n    __b5Step(__b5Frame, \"parse-font-maps\");"
      },
      {
        "label": "page-content",
        "anchor": "    const contents = page.node.Contents();",
        "edge": "before",
        "offset": 1684,
        "text": "    __b5Step(__b5Frame, \"parse-content\");\n"
      }
    ]
  },
  {
    "file": "../src/jobs/diagnostics/DiagnosticArtifactWorker.ts",
    "sha256": "1eb1f632eb592d16073d78eaff36c4ccefa04878e08e66412aad75635daad102",
    "insertions": [
      {
        "label": "runtime-import",
        "anchor": "import { createHash } from \"node:crypto\";\n",
        "edge": "before",
        "offset": 0,
        "text": null
      },
      {
        "label": "current-enter",
        "anchor": "  private async current(tx: Tx, artifact: Artifact): Promise<D.DiagnosticReleasedSnapshot | null> {",
        "edge": "after",
        "offset": 2107,
        "text": "\n  const __b5Frame = __b5Begin(\"worker-current\");\n  let __b5Failed = false;\n  try {"
      },
      {
        "label": "current-exit",
        "anchor": "    return { ...parsed.data, report: projection.report };\n",
        "edge": "after",
        "offset": 3006,
        "text": "  } catch (__b5OriginalError) {\n    __b5Failed = true;\n    throw __b5OriginalError;\n  } finally {\n    __b5Close(__b5Frame, __b5Failed);\n  }\n"
      },
      {
        "label": "cleanup-enter",
        "anchor": "  async cleanup(): Promise<number> {",
        "edge": "after",
        "offset": 19399,
        "text": "\n  const __b5Frame = __b5Begin(\"worker-cleanup\");\n  let __b5Failed = false;\n  try {"
      },
      {
        "label": "cleanup-exit",
        "anchor": "    return completed;\n",
        "edge": "after",
        "offset": 26079,
        "text": "  } catch (__b5OriginalError) {\n    __b5Failed = true;\n    throw __b5OriginalError;\n  } finally {\n    __b5Close(__b5Frame, __b5Failed);\n  }\n"
      }
    ]
  }
].map(entry => ({ ...entry, id: fileURLToPath(new URL(entry.file, import.meta.url)) }));

export function b5ObservationPlugin() {
  return {
    name: "b5-hosted-observation",
    enforce: "pre",
    transform(code, id) {
      // Recognize query, file-URL, /@fs/, relative, encoded and JS spellings,
      // but accept only the exact canonical absolute TS identity below.
      let clean;
      try { clean = decodeURIComponent(id).replaceAll("\\", "/").split(/[?#]/, 1)[0]; } catch { return fail(); }
      const original = Buffer.from(code, "utf8");
      const digest = sha(original);
      const entry = modules.find(item => {
        const name = item.file.slice(item.file.lastIndexOf("/") + 1);
        const stem = name.slice(0, -3);
        return digest === item.sha256 || clean === name || clean === stem || clean.endsWith("/" + name) || clean.endsWith("/" + stem) || clean.endsWith("/" + stem + ".js");
      });
      if (!entry) return null;
      if (id !== entry.id) return fail();
      if (digest !== entry.sha256) return fail();
      const edits = entry.insertions.map(insertion => {
        const anchor = Buffer.from(insertion.anchor, "utf8");
        const start = original.indexOf(anchor);
        if (start < 0 || original.indexOf(anchor, start + 1) !== -1) return fail();
        const offset = start + (insertion.edge === "after" ? anchor.length : 0);
        if (offset !== insertion.offset) return fail();
        return { offset, bytes: Buffer.from(insertion.text === null ? runtimeImport : insertion.text, "utf8") };
      }).sort((a, b) => a.offset - b.offset);
      const chunks = [];
      let previous = 0;
      for (const [index, edit] of edits.entries()) {
        if (index && edit.offset <= edits[index - 1].offset) return fail();
        chunks.push(original.subarray(previous, edit.offset), edit.bytes);
        previous = edit.offset;
      }
      chunks.push(original.subarray(previous));
      return { code: Buffer.concat(chunks).toString("utf8"), map: null };
    },
  };
}
