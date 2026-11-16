import ast
import io
import json
import re
import sys
import tokenize

request = json.load(sys.stdin)
source = request["source"]
tree = ast.parse(source, filename=request["path"], type_comments=True)
lines = source.split("\n")
lines = [line + "\n" for line in lines[:-1]] + lines[-1:]

def offset(position):
    row, column = position
    return len(("".join(lines[:row - 1]) + lines[row - 1][:column]).encode("utf-16-le")) // 2

def type_directive(token):
    raw = token.string
    if re.fullmatch(r"# type: ignore(?:\[[a-zA-Z0-9_-]+(?:, *[a-zA-Z0-9_-]+)*\])?", raw):
        return bool(lines[token.start[0] - 1][:token.start[1]].strip()) and any(
            item.lineno == token.start[0] for item in tree.type_ignores)
    if not raw.startswith("# type: "):
        return False
    annotation = raw[len("# type: "):]
    if not any(getattr(node, "type_comment", None) == annotation and
               node.lineno <= token.start[0] <= getattr(node, "end_lineno", node.lineno)
               for node in ast.walk(tree)):
        return False
    try:
        ast.parse(annotation, mode="func_type" if annotation.startswith("(") and "->" in annotation else "eval")
        return True
    except SyntaxError:
        return False

comments = []
for token in tokenize.generate_tokens(io.StringIO(source).readline):
    if token.type == tokenize.ERRORTOKEN and not token.string.isspace():
        raise SyntaxError("invalid Python token")
    if token.type != tokenize.COMMENT:
        continue
    raw = token.string
    exception = type_directive(token)
    if raw.startswith("#!"):
        exception = token.start == (1, 0) and request["executable"] and bool(re.fullmatch(
            r"#!(?:/usr/bin/env python3|/usr/bin/python3|/usr/local/bin/python3)", raw)) and not source.split("\n", 1)[0].endswith("\r")
    encoding = re.fullmatch(r"#(?: -\*-)? coding[:=] *([-\w.]+)(?: -\*-)?", raw)
    if encoding and token.start[1] == 0 and token.start[0] <= 2:
        first = lines[0].strip() if lines else ""
        header = token.start[0] == 1 or not first or first.startswith("#")
        codec = encoding[1].lower().replace("_", "-")
        exception = header and (codec in ("utf-8", "utf8") or codec == "ascii" and source.isascii())
    comments.append({"startOffset": offset(token.start), "endOffset": offset(token.end), "exception": exception})
print(json.dumps(comments))
