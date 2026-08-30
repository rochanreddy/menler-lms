# UI audit — Menler LMS

Before/after record for the design-system refactor. The "After" numbers are the
proof the work landed; anything that regresses them is a regression.

**This file did not previously exist.** The refactor brief assumed an audit doc
with a "Before" column, so the Before numbers here were measured from the
codebase at commit `c4a5298` (the state before the token layer was added), not
carried over from an earlier document.

Regenerate the counts with `cd client && npm run lint:ds`.

---

## Scope of the refactor so far

| Phase | State |
|---|---|
| Token layer (`src/styles/tokens.css`) | Done |
| Primitive layer (`src/components/ui/`) | Done — 15 of 16; Toast blocked |
| Auth slice migration | Done — 4 files |
| Remaining page slices | **Not started** — Student, Admin, Mentor, Shared |
| Enforcement (linter + hook) | Done |

---

## Auth slice — the migrated files

`Login.jsx` · `Register.jsx` · `ForcePasswordChange.jsx` · `Blocked.jsx`

| Metric | Before | After |
|---|---:|---:|
| Raw hex colours | 0 | **0** |
| Inline `style={{…}}` objects | 5 | **0** |
| px values inside inline styles | 5 | **0** |
| Raw `<input>` elements | 7 | **0** |
| Raw `<button>` elements | 7 | **2** |
| Linter violations | 5 | **0** |
| Lines | 240 | 332 |

The two remaining `<button>`s are deliberate: the password-reveal toggle (a
primitive-provided `.ui-input-action` slot, not page styling) and the
dev-only demo-account fill rows, which are gated behind `SHOW_DEMOS` and
stripped from a production build.

Line count went **up** by 92. That is expected and not a failure: the migration
added label association, help text, error wiring and loading states that the
original markup did not have. Fewer lines was never the goal.

---

## All pages — repo-wide

| Metric | Before | After | Note |
|---|---:|---:|---|
| Raw hex colours | 1 | 1 | `admin/StudentDetail.jsx:141`, unmigrated |
| Inline `style={{…}}` objects | 71 | 66 | −5, all from Auth |
| px values in inline styles | 52 | 47 | −5, all from Auth |
| Linter violations | 51 | **46** | −5, all from Auth |
| Files failing the linter | 21 | 17 | Auth's 4 now pass |

The repo-wide numbers barely move because only one of five slices is migrated.
**46 violations is the current debt, and it is the number to watch.** It cannot
grow: the pre-commit hook rejects any new one.

---

## Layer inventory

| Layer | Location | Size |
|---|---|---:|
| Tokens | `client/src/styles/tokens.css` | 97 tokens |
| Primitives | `client/src/components/ui/` | 21 files, 15 components |
| Patterns | `client/src/styles.css` | ~1900 lines, untouched |
| Pages | `client/src/pages/` | 21 files |

`styles.css` still holds 300 `font-size` declarations. It is the pattern layer
and was explicitly out of scope; it is not counted as debt above, but it is the
reason page migration is still possible without visual regression.

---

## Known gaps

These are recorded at the foot of `tokens.css` as well. None were papered over
with an invented value.

1. **`--destructive` on dark.** No dark red exists. Blocks the dark theme.
2. **Status and role on dark.** Every `-bg` is tuned for white.
3. **Toast auto-dismiss duration.** No source to derive from; Toast not built.
4. **Display sizes with no step:** 40px, 42px, 46px, 78px.
5. **UI sizes with no step:** 13px (48 uses), 13.5px (32), 14px (33), and five more.
6. **Radius 8/9/10px** (54 uses) all fall below `--radius-sm` (12px).
7. **Border 3px**, one use.
8. **Leading values** were derived from observed bands, not specified.

## Deviations from the original brief

- **`--ring` and `--muted` are named `--ring-color` and `--surface-muted`.**
  `styles.css` defines both with different meanings and loads last, so the
  shadcn spellings resolved to the wrong type and blanked every focus ring.
  Rename back once `styles.css` no longer defines them.
- **`Stack` was added** to the primitive set. Migrating the first page proved
  a form could not be expressed without it except through inline margins.
- **Disabled does not use the app's existing `--faint`**, which computes to
  2.18:1 against `--surface-muted` and fails the required 3:1.
