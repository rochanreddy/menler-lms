import mongoose from 'mongoose';

// The LMS roles. A user has exactly one. This list is the single source of
// truth for role-based access: requireRole() gates routes against it, admin
// provisioning validates against it, and any account whose role falls outside
// it (e.g. a retired 'partner') is denied at login.
export const ROLES = ['student', 'mentor', 'admin'];

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: '' },
    fullName: { type: String, default: '' },
    phone: { type: String, default: '' },

    role: { type: String, enum: ROLES, default: 'student', index: true },

    education: { type: mongoose.Schema.Types.Mixed, default: {} },     // { degree, institution, year }
    professional: { type: mongoose.Schema.Types.Mixed, default: {} },  // { title, company, experience }
    resumeUrl: { type: String, default: '' },

    /* The line printed under this person's name where they sign a certificate,
       e.g. "AI Generalist, Ex-Microsoft | Mentor, Menler".
       Its own field rather than something composed from `professional`,
       because the two are not the same sentence: a profile records a job, a
       certificate records the standing in which somebody signed. Composing it
       also cannot be reversed — an admin correcting the printed line would
       have to have it split back into title and company, and there is no
       honest way to do that. Empty falls back to the composed form. */
    certificateRole: { type: String, default: '' },

    batchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Batch' }],

    // Last authenticated request, stamped (throttled) by requireAuth. Drives the
    // inactivity signal in at-risk detection. Null = never seen since this was
    // added, which the scorer treats as "unknown" rather than "inactive".
    lastActiveAt: { type: Date, default: null },

    emailVerified: { type: Boolean, default: false },
    // The high-entropy ticket that actually authorises a password change. It is
    // never emailed: /auth/verify-otp mints it once the code below checks out,
    // and /auth/reset spends it.
    resetTokenHash: { type: String, default: '' },
    resetExpires: { type: Date, default: null },

    // The six-digit code that IS emailed. Separate from the ticket because a
    // six-digit secret is only safe while it is short-lived and guess-limited:
    // `resetOtpAttempts` is what stops someone walking the million possible
    // codes, and it is stored per-code rather than per-IP so a distributed
    // attempt is counted the same as a local one.
    resetOtpHash: { type: String, default: '' },
    resetOtpExpires: { type: Date, default: null },
    resetOtpAttempts: { type: Number, default: 0 },

    // Set when an admin provisions/resets the account: the user must set their
    // own password before they can use the app.
    mustChangePassword: { type: Boolean, default: false },

    // Bumped on password reset so tokens signed before it (an already-stolen
    // access or refresh token) stop verifying. See utils/token.js and
    // middleware/auth.js.
    tokenVersion: { type: Number, default: 0 },

    // Admin moderation controls. lms=true locks the account out of the whole
    // app (login + every API call); batchIds hides specific cohorts/courses;
    // moduleIds hides specific curriculum modules; assignmentIds hides specific
    // assignments/projects. Admins are never blockable — enforced in the
    // routes, not here.
    blocked: {
      lms: { type: Boolean, default: false },
      batchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Batch' }],
      moduleIds: [{ type: mongoose.Schema.Types.ObjectId }], // Program.modules subdoc ids
      assignmentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' }],
      reason: { type: String, default: '' },
      at: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    email: this.email,
    full_name: this.fullName,
    phone: this.phone,
    role: this.role,
    education: this.education,
    professional: this.professional,
    resume_url: this.resumeUrl,
    batch_ids: (this.batchIds || []).map((b) => b.toString()),
    email_verified: this.emailVerified,
    must_change_password: this.mustChangePassword,
    blocked: {
      lms: !!this.blocked?.lms,
      batch_ids: (this.blocked?.batchIds || []).map(String),
      module_ids: (this.blocked?.moduleIds || []).map(String),
      assignment_ids: (this.blocked?.assignmentIds || []).map(String),
      reason: this.blocked?.reason || '',
      at: this.blocked?.at || null,
    },
    last_active_at: this.lastActiveAt,
    created_at: this.createdAt,
  };
};

// IMPORTANT: explicit 'lms_users' collection so this NEVER collides with the
// marketing site's 'users' collection in the shared Atlas database.
export const User = mongoose.model('User', userSchema, 'lms_users');
