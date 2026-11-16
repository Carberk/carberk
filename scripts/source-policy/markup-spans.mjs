export function commentSpan(source, startOffset, endOffset, exception = false) {
  const position = (offset) => {
    const prefix = source.slice(0, offset);
    return { line: prefix.split("\n").length, column: offset - prefix.lastIndexOf("\n") - 1 };
  };
  return { startOffset, endOffset, start: position(startOffset), end: position(endOffset),
    raw: source.slice(startOffset, endOffset), exception };
}

export function embeddedResult({ source, content, offsets, fileType, path, adapters, result }) {
  const adapter = adapters[fileType];
  if (!adapter) {
    result.deferred.push({ fileType, path, startOffset: offsets[0], endOffset: offsets.at(-1), reason: "adapter unavailable" });
    return;
  }
  const nested = adapter({ source: content, path, fileType, adapters });
  for (const comment of nested.comments) {
    if (!Number.isInteger(comment.startOffset) || !Number.isInteger(comment.endOffset) ||
      comment.startOffset < 0 || comment.endOffset > content.length || comment.endOffset < comment.startOffset) {
      throw new Error(`${path}: embedded adapter must return UTF-16 offsets`);
    }
    const end = comment.endOffset > comment.startOffset ? offsets[comment.endOffset - 1] + 1 : offsets[comment.endOffset];
    const span = commentSpan(source, offsets[comment.startOffset], end, comment.exception);
    result.comments.push(span);
  }
  for (const deferred of nested.deferred ?? []) {
    result.deferred.push({ ...deferred, startOffset: offsets[deferred.startOffset], endOffset: offsets[deferred.endOffset] });
  }
}
