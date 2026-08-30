#!/usr/bin/env node
/**
 * Design-system linter.
 *
 * Errors when a page re-introduces a literal design value instead of using a
 * token or a primitive. This is the mechanical half of the rule in CLAUDE.md:
 * tokens -> primitives -> patterns -> pages, one direction only.
 *
 *   node scripts/lint-design-system.mjs              # whole repo
 *   node scripts/lint-design-system.mjs <files...>   # only these (pre-commit)
 *
 * Exits 1 if anything is found, so it works as a gate.
 *
 * Deliberately dependency-free. The project has no ESLint, and adding it plus
 * a plugin to enforce four regexes is a worse trade than one file that any
 * Node can run.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/** Where literals are forbidden. */
const ENFORCED = [join('src', 'pages'), join('src', 'features')];
/** Where they are the whole point. */
const EXEMPT = [join('src', 'styles'), join('src', 'components', 'ui')];

const RULES = [
  {
    id: 'no-raw-hex',
    // Colour literals. Tokens carry the palette; a page naming a colour means
    // the palette just forked.
    test: /#[0-9a-fA-F]{3,8}\b/g,
    message: 'raw hex colour — use a colour token',
  },
  {
    id: 'no-color-function',
    test: /\b(rgba?|hsla?)\s*\(/g,
    message: 'rgb()/hsl() colour — use a colour token',
  },
  {
    id: 'no-px-typography-or-spacing',
    // React serialises unitless numbers to px, so `marginTop: 18` is a px
    // value even though no unit is written. Both forms are caught.
    test: /\b(fontSize|lineHeight|letterSpacing|margin|marginTop|marginBottom|marginLeft|marginRight|padding|paddingTop|paddingBottom|paddingLeft|paddingRight|gap|rowGap|columnGap|borderRadius)\s*:\s*(['"]?-?\d+(\.\d+)?px['"]?|-?\d+(\.\d+)?)\s*[,}]/g,
    message: 'px font-size / spacing / radius — use a spacing, type or radius token',
  },
  {
    id: 'no-font-family',
    test: /\b(fontFamily\s*:|font-family\s*:)/g,
    message: 'font-family declaration — use --font-ui / --font-heading / --font-reading / --font-mono',
  },
  {
    id: 'no-tailwind-arbitrary',
    // A no-op today: the project does not use Tailwind. Kept so the ban is
    // already in force the day someone adds it.
    test: /class(Name)?\s*=\s*["'`][^"'`]*\[[^\]]+\][^"'`]*["'`]/g,
    message: 'Tailwind arbitrary value — add a token instead',
  },
];

/** Strip comments so a rule written in prose is not itself a violation. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(jsx?|css)$/.test(full)) out.push(full);
  }
  return out;
}

function isEnforced(file) {
  const rel = relative(ROOT, file);
  if (EXEMPT.some((e) => rel.startsWith(e + sep) || rel === e)) return false;
  return ENFORCED.some((e) => rel.startsWith(e + sep));
}

const argv = process.argv.slice(2);
const files = (argv.length ? argv.map((f) => join(process.cwd(), f)) : walk(join(ROOT, 'src')))
  .filter((f) => {
    try { return statSync(f).isFile() && isEnforced(f); } catch { return false; }
  });

let count = 0;
for (const file of files) {
  const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      rule.test.lastIndex = 0;
      let m;
      while ((m = rule.test.exec(line)) !== null) {
        count += 1;
        console.log(`${relative(ROOT, file)}:${i + 1}  ${rule.id}  ${rule.message}\n    ${m[0].trim()}`);
      }
    }
  });
}

console.log(
  count === 0
    ? `\ndesign-system: clean (${files.length} enforced file${files.length === 1 ? '' : 's'})`
    : `\ndesign-system: ${count} violation${count === 1 ? '' : 's'} in ${files.length} enforced files`,
);
process.exit(count === 0 ? 0 : 1);
