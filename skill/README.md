# Skill `dwg`

`dwg/` is the Claude skill for this CLI (German instructions). `node install.mjs` copies it to
`~/.claude/skills/dwg`, so every Claude Code session knows dwg and where this repo lives.

`dwg.zip` is the same skill packaged for Claude Desktop or claude.ai (Settings → Capabilities → Skills → Upload
skill).

Rebuild the zip after changing the skill (from this folder):

```bash
python3 -c "import zipfile,os; z=zipfile.ZipFile('dwg.zip','w',zipfile.ZIP_DEFLATED); [z.write(os.path.join(r,f)) for r,_,fs in os.walk('dwg') for f in fs]; z.close()"
```
