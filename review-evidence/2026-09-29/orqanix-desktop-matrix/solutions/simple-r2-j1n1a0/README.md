# Repair an invoice line total

Fix lineTotal(priceCents, quantity, discountBps=0) in src/pricing.mjs. All inputs must be safe integers: priceCents and quantity are nonnegative, discountBps is 0..10000. Invalid input or an unsafe integer intermediate priceCents*quantity or product*(10000-discountBps) throws RangeError. Return Math.floor(product*(10000-discountBps)/10000). Zero quantity and full discount return zero. Keep the named export. Write report.json with {"summary": a short explanation string, "examples":[{"id":"zero","input":[1250,0,0],"expected":0},{"id":"rounding","input":[199,3,1250],"expected":522}]}. Explain the change and run the available tests.
All evidence is synthetic and supplied locally; no external research is needed. Read README.md for the workspace contract. Choose whatever available tools help. Only modify the listed permitted files; do not install dependencies, change settings, commit, push or run background processes. Report actual test results; do not claim an unavailable check passed.

Permitted modified files: src/pricing.mjs, report.json. All other fixture files are inputs. Read-only exploration commands (including ls, cat, sed, rg, git status and git diff) are allowed within this workspace. Public verification: node --test tests/public.test.mjs. You can run additional bounded local checks of the permitted implementation files. Do not access files outside this workspace.

report.json follows the schema stated in the task prompt. Its explanation is retained for human review, not automatically graded for meaning.
