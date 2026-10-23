# PBIR schemas (vendored)

The JSON schemas `dwg validate` checks reports against, copied from
[microsoft/json-schemas](https://github.com/microsoft/json-schemas) (MIT, see [LICENSE](LICENSE)), branch `main`
as of 2026-10-23 (commit 5e1199a). Paths mirror `https://developer.microsoft.com/json-schemas/`.

dwg reads these files first, so validation works offline. A schema version that is not here is fetched from the
GitHub mirror once and cached in `pbip/test/.schema-cache/` (not committed).
