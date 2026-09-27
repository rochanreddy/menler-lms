// A person's name read off their email address, or '' when the address does
// not spell one out.
//
// Accounts are often made from an email alone (a batch's "New paid student"
// box had no name field at all), and a student with no name is a row of "-"
// on the admin's list, "Dear ," on their welcome mail and a blank line on a
// certificate. Most institutional addresses are the name already:
// vanshika.madan26m@iimranchi.ac.in is Vanshika Madan, with a cohort tag on
// the end. So that is read back, and nothing else.
//
// It declines rather than guesses. aryaagrim13@gmail.com could be "Arya
// Agrim" or "Aryaa Grim", and a wrong name printed on a certificate is worse
// than an empty one the admin can see is empty. Only an address split into
// two to four words by a dot, underscore or hyphen is read; a trailing number
// and the letters after it ("madan26m", "j2007") are the cohort or the year,
// not the name.
const TAG = /\d+[a-z]{0,3}$/; // "26m", "26b", "2007", "13"

export function nameFromEmail(email) {
  const local = String(email || '').toLowerCase().trim().split('@')[0].split('+')[0];
  const parts = local.split(/[._-]+/).map((p) => p.replace(TAG, '')).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return '';
  if (!parts.every((p) => /^[a-z]+$/.test(p))) return '';
  // "a.b" is two initials, not a name.
  if (!parts.some((p) => p.length > 1)) return '';
  return parts.map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');
}

// What a new account is called: the name the admin typed, else the one its
// email spells, else nothing.
export const nameForNewAccount = (fullName, email) => String(fullName || '').trim() || nameFromEmail(email);
