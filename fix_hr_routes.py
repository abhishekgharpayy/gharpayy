import re

path = r"server\src\modules\hr\routes.ts"
with open(path, "r", encoding="utf-8") as f:
    c = f.read()

# Replace user._id and user!._id
c = re.sub(r'user!?\._id', lambda m: m.group(0).replace('_id', 'sub'), c)
c = re.sub(r'req\.user!?\._id', lambda m: m.group(0).replace('_id', 'sub'), c)

# Fix ulid imports
c = c.replace('const { ulid } = await import("ulid");', '')
if 'import { ulid } from "../../../../src/contracts/ids.js";' not in c:
    c = 'import { ulid } from "../../../../src/contracts/ids.js";\n' + c

with open(path, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
