// The two programmes' names as they read on screen: "AI Kickstarter" and
// "AI Generalist". The title is data — Program.title, and the batch names
// built from it — so what a student sees is whatever the database says, and
// a rename is a data change (scripts/renameProgrammes.js), not a UI change.
//
// A database seeded before the rename still carries the bare "Kickstarter",
// so every lookup by title goes through titleQuery(), which matches either
// spelling. Without that, a seed run against an already-renamed database
// would fail to find the programme and quietly create a second one.
export const PROGRAMME_TITLES = {
  kickstarter: 'AI Kickstarter',
  generalist: 'AI Generalist',
};

/** "AI Kickstarter" → "Kickstarter"; anything else unchanged. */
export const bareTitle = (title) => String(title || '').replace(/^AI\s+/i, '').trim();

/** "Kickstarter" or "AI Kickstarter" → "AI Kickstarter". */
export const brandedTitle = (title) => {
  const bare = bareTitle(title);
  return bare ? `AI ${bare}` : String(title || '');
};

/** A Mongo filter that finds the programme under either spelling. */
export const titleQuery = (title) => {
  const bare = bareTitle(title);
  return { title: { $in: [`AI ${bare}`, bare] } };
};
