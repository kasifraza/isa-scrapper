# Data Parsing Rules

## Unicode — Never Escape

When writing JSON output, **always** set `ensure_ascii=False` (or your language's equivalent). Do **not** allow the serializer to escape Unicode characters into `\uXXXX` sequences.

**Python — must use:**
```python
json.dump(data, file, indent=2, ensure_ascii=False)
json.dumps(data, indent=2, ensure_ascii=False)
```

**Node.js — must use:**
```js
JSON.stringify(data, null, 2)  // native JSON handles UTF-8 by default
```

**Why:** Escaped Unicode (`–`, `é`, `ا`, etc.) breaks grep, diff, readability, and downstream tooling. The file should be human-readable — real characters, not escape codes.

## Before submitting

Run this check — if it finds any `\u` escapes in string values, reject the file:

```bash
grep -n '\\\\u00' data.json && echo "FAIL: Unicode escapes found" || echo "PASS"
```
