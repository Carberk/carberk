import { spawnSync } from "node:child_process";
import { commentSpan } from "./markup-spans.mjs";

const tokenize = `
source = STDIN.binmode.read.force_encoding(Encoding::UTF_8)
abort "invalid Ruby syntax" unless Ripper.sexp(source)
events = [:on_comment, :on_embdoc_beg, :on_embdoc_end]
Ripper.lex(source).each do |position, event, text, _state|
  puts [*position, event, [text].pack("m0")].join("\\t") if events.include?(event)
end
`;

export function parseRuby({ path, source }) {
  const bomLength = Number(source.startsWith("\uFEFF"));
  const input = source.slice(bomLength);
  const run = spawnSync("ruby", ["--disable-gems", "-rripper", "-e", tokenize], {
    input, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 10_000,
    env: { ...process.env, RUBYOPT: "", RUBYLIB: "" },
  });
  if (run.error || run.status !== 0) throw new Error(`${path}: Ruby parse failed: ${run.error?.message ?? run.stderr.trim()}`);

  const lines = input.split("\n");
  let position = bomLength;
  const lineStarts = lines.map((line) => {
    const start = position;
    position += line.length + 1;
    return start;
  });
  const comments = [];
  let blockStart;
  for (const token of run.stdout.split("\n").filter(Boolean)) {
    const [row, byteColumn, event, encoded] = token.split("\t");
    const index = Number(row) - 1;
    const column = Buffer.from(lines[index]).subarray(0, Number(byteColumn)).toString("utf8").length;
    const start = lineStarts[index] + column;
    const text = Buffer.from(encoded, "base64").toString("utf8");
    const raw = text.replace(/\r?\n$/, "");
    const end = start + raw.length;
    if (!source.startsWith(text, start)) throw new Error(`${path}: Ruby token offset could not be mapped`);
    if (event === "on_embdoc_beg") {
      blockStart = start;
    } else if (event === "on_embdoc_end") {
      if (blockStart === undefined) throw new Error(`${path}: Ruby block comment start is missing`);
      comments.push(commentSpan(source, blockStart, end));
      blockStart = undefined;
    } else {
      const shebang = /\.rb$/i.test(path) && start === 0 && /^#!(?:\/usr\/bin\/env ruby|\/usr\/(?:local\/)?bin\/ruby)$/.test(raw) && !text.endsWith("\r\n");
      comments.push(commentSpan(source, start, end, shebang));
    }
  }
  if (blockStart !== undefined) throw new Error(`${path}: Ruby block comment end is missing`);
  return { comments, deferred: [] };
}
