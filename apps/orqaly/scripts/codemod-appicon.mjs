/**
 * codemod-appicon — dev tooling (NOT shipped, NOT imported by the app).
 *
 * jscodeshift transform that routes direct MUI icon JSX through <AppIcon> so the
 * icon-set selector can swap it at runtime. Unmapped names fall back to MUI, so
 * the change is behaviour-preserving in the default ("mui") set.
 *
 * Per file it:
 *   1. Finds default imports from '@mui/icons-material/<Name>'.
 *   2. Rewrites `<XIcon ... />` JSX -> `<AppIcon name="X" fallback={XIcon} ... />`.
 *   3. Leaves reference-passing (`icon={XIcon}`, `FallbackIcon: XIcon`, icon maps)
 *      untouched — those already flow through AppIcon-aware consumers or stay on MUI.
 *   4. Adds a correctly-relative AppIcon import, keeping the MUI import as fallback.
 *
 * Skips files that must keep raw MUI: the icon components themselves, the icon
 * showcase pages, Landing (public marketing), and test files.
 *
 * Usage (jscodeshift is fetched by npx, not a project dep):
 *   npx jscodeshift -t scripts/codemod-appicon.mjs --parser=babel --extensions=jsx,js src
 *
 * Always run `npm run lint` + `npm run test` + `npm run build` after.
 */
import path from 'node:path';

const SKIP = /(\/components\/icons\/|\/pages\/IconLibrary\/|\/Landing\/|\.test\.)/;

export default function transformer(file, api) {
  if (SKIP.test(file.path)) return file.source;

  const j = api.jscodeshift;
  const root = j(file.source);

  // local import name -> MUI icon module name (e.g. HomeRoundedIcon -> HomeRounded)
  const muiIcons = new Map();
  root
    .find(j.ImportDeclaration)
    .filter((p) => /^@mui\/icons-material\/[A-Za-z0-9]+$/.test(p.node.source.value))
    .forEach((p) => {
      const def = p.node.specifiers.find((s) => s.type === 'ImportDefaultSpecifier');
      if (!def) return;
      const moduleName = p.node.source.value.split('/').pop();
      muiIcons.set(def.local.name, moduleName);
    });

  if (muiIcons.size === 0) return file.source;

  let changed = false;

  root.find(j.JSXOpeningElement).forEach((p) => {
    const nameNode = p.node.name;
    if (nameNode.type !== 'JSXIdentifier') return; // skip <Ns.Icon/>, <Comp/>
    const moduleName = muiIcons.get(nameNode.name);
    if (!moduleName) return;

    const fallbackLocal = nameNode.name;
    p.node.name = j.jsxIdentifier('AppIcon');
    p.node.attributes.unshift(
      j.jsxAttribute(j.jsxIdentifier('name'), j.literal(moduleName)),
      j.jsxAttribute(
        j.jsxIdentifier('fallback'),
        j.jsxExpressionContainer(j.identifier(fallbackLocal))
      )
    );
    changed = true;

    const parent = p.parentPath.node;
    if (parent.closingElement && parent.closingElement.name.name === fallbackLocal) {
      parent.closingElement.name = j.jsxIdentifier('AppIcon');
    }
  });

  if (!changed) return file.source;

  // Add a single, correctly-relative AppIcon import.
  const already = root
    .find(j.ImportDeclaration)
    .some((p) => /\/icons\/AppIcon$/.test(p.node.source.value));
  if (!already) {
    const target = path.resolve(process.cwd(), 'src/components/icons/AppIcon');
    let rel = path.relative(path.dirname(path.resolve(process.cwd(), file.path)), target);
    rel = rel.split(path.sep).join('/');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    const decl = j.importDeclaration(
      [j.importDefaultSpecifier(j.identifier('AppIcon'))],
      j.literal(rel)
    );
    // Place after the last existing import to keep import grouping sane.
    const imports = root.find(j.ImportDeclaration);
    if (imports.size() > 0) {
      j(imports.at(imports.size() - 1).get()).insertAfter(decl);
    } else {
      root.get().node.program.body.unshift(decl);
    }
  }

  return root.toSource({ quote: 'single' });
}
