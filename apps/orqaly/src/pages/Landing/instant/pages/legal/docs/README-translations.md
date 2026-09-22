Each translation is a copy of `<slug>.json` with the same JSON shape (same blocks, ids, `only`, `needs`, `meta.slug`, `effective` and `version`), with only the words translated; keep every `{company.x}` token and every markdown link target `[…](/instant/legal/…)` exactly as written.
Put it in a folder named for the language code the site uses (`de/privacy.json`, `zh-CN/terms.json`); a document without one shows its English text.
The English files in this folder are the binding texts; a translated page says so and links to the English one.
