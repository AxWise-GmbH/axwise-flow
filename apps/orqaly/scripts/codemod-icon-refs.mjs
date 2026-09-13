/**
 * codemod-icon-refs - dev tooling (NOT shipped).
 *
 * Routes "icon component reference" renders through <AppIcon fallback={...}> so they
 * follow the icon-set selector. AppIcon recovers the name from the component via the
 * reverse map, so no explicit name is needed. Two shapes:
 *
 *   <tab.icon ATTRS/>            ->  <AppIcon fallback={tab.icon} ATTRS/>
 *   const Icon = cfg.icon;       (unchanged)
 *   <Icon ATTRS/>                ->  <AppIcon fallback={Icon} ATTRS/>
 *
 * Only local consts whose initialiser is clearly an icon (a `.icon`/`.Icon` member, an
 * `*ICON*`-map lookup, or an `*Icon` identifier) are treated as icon vars.
 *
 * Usage: npx jscodeshift -t scripts/codemod-icon-refs.mjs --parser=babel --extensions=jsx <files>
 */
import path from 'node:path';

const SKIP = /(\/components\/icons\/|\.test\.)/;
const isIconProp = (n) => n === 'icon' || n === 'Icon' || /Icon$/.test(n);

export default function transformer(file, api) {
  if (SKIP.test(file.path)) return file.source;
  const j = api.jscodeshift;
  const root = j(file.source);
  let changed = false;

  const initIsIcon = (node) => {
    if (!node) return false;
    if (node.type === 'MemberExpression') {
      if (!node.computed && node.property.type === 'Identifier' && isIconProp(node.property.name))
        return true;
      if (node.computed && node.object.type === 'Identifier' && /ICON|Icon/.test(node.object.name))
        return true;
      return false;
    }
    if (node.type === 'LogicalExpression') return initIsIcon(node.left) || initIsIcon(node.right);
    if (node.type === 'ConditionalExpression')
      return initIsIcon(node.consequent) || initIsIcon(node.alternate);
    if (node.type === 'Identifier') return /Icon$/.test(node.name);
    return false;
  };

  // 1. Collect capitalised local vars that hold an icon component.
  const iconVars = new Set();
  root.find(j.VariableDeclarator).forEach((p) => {
    const { id, init } = p.node;
    if (id && id.type === 'Identifier' && /^[A-Z]/.test(id.name) && initIsIcon(init)) {
      iconVars.add(id.name);
    }
  });

  const jsxObjToExpr = (node) => {
    if (node.type === 'JSXIdentifier') return j.identifier(node.name);
    if (node.type === 'JSXMemberExpression')
      return j.memberExpression(jsxObjToExpr(node.object), j.identifier(node.property.name));
    return null;
  };

  // 2. Rewrite the two JSX shapes.
  root.find(j.JSXOpeningElement).forEach((p) => {
    const nameNode = p.node.name;
    let fallbackExpr = null;

    if (nameNode.type === 'JSXMemberExpression' && isIconProp(nameNode.property.name)) {
      const obj = jsxObjToExpr(nameNode.object);
      if (obj) fallbackExpr = j.memberExpression(obj, j.identifier(nameNode.property.name));
    } else if (nameNode.type === 'JSXIdentifier' && iconVars.has(nameNode.name)) {
      fallbackExpr = j.identifier(nameNode.name);
    }
    if (!fallbackExpr) return;

    p.node.name = j.jsxIdentifier('AppIcon');
    p.node.attributes.unshift(
      j.jsxAttribute(j.jsxIdentifier('fallback'), j.jsxExpressionContainer(fallbackExpr))
    );
    changed = true;
    const parent = p.parentPath.node;
    if (parent.closingElement) parent.closingElement.name = j.jsxIdentifier('AppIcon');
  });

  if (!changed) return file.source;

  // 3. Ensure an AppIcon import (correctly relative).
  const has = root
    .find(j.ImportDeclaration)
    .some((p) => /\/icons\/AppIcon$/.test(p.node.source.value));
  if (!has) {
    const target = path.resolve(process.cwd(), 'src/components/icons/AppIcon');
    let rel = path
      .relative(path.dirname(path.resolve(process.cwd(), file.path)), target)
      .split(path.sep)
      .join('/');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    const decl = j.importDeclaration(
      [j.importDefaultSpecifier(j.identifier('AppIcon'))],
      j.literal(rel)
    );
    const imports = root.find(j.ImportDeclaration);
    if (imports.size() > 0) j(imports.at(imports.size() - 1).get()).insertAfter(decl);
    else root.get().node.program.body.unshift(decl);
  }

  return root.toSource({ quote: 'single' });
}
