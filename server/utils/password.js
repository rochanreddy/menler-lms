import bcrypt from 'bcryptjs';

// One place for the work factor, because the literal was previously repeated
// at nine call sites and they have to agree.
//
// Cost 10, not 12. Each step up doubles the work, and this is `bcryptjs` —
// pure JavaScript, no native binding — so cost 12 costs ~750ms of CPU per
// verify. On a 0.1-vCPU instance a class of 18 signing in at once needs more
// than two minutes of CPU between them, and every one of them is holding a
// request open while it happens. Cost 10 is ~190ms and still sits comfortably
// above the OWASP floor for bcrypt.
export const BCRYPT_COST = 10;

export const hashPassword = (plain) => bcrypt.hash(String(plain), BCRYPT_COST);

// bcrypt encodes its cost in the hash itself, which is what lets an old
// cost-12 hash keep verifying after the constant above changes — and also what
// makes lowering the constant useless on its own: an existing account goes on
// costing 750ms a login forever. We never store the plaintext, so the one
// moment we can re-hash it is the instant someone successfully signs in and
// hands it to us. See the login route.
export function needsRehash(hash) {
  // Shape-check first. getRounds() does not throw on an empty or malformed
  // string — it just returns something that isn't the cost, which would read
  // as "needs rehashing" for a value that isn't a hash at all.
  if (typeof hash !== 'string' || !/^\$2[aby]\$\d\d\$/.test(hash)) return false;
  try {
    return bcrypt.getRounds(hash) !== BCRYPT_COST;
  } catch {
    return false;
  }
}

// The password every admin-provisioned account starts on. It is deliberately
// not random: the account carries `mustChangePassword`, so the temp password
// only has to survive being read out over the phone once before the user
// replaces it, and a random hex string mostly got mistyped.
export const DEFAULT_TEMP_PASSWORD = '123456789';
