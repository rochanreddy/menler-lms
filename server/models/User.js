import mongoose from 'mongoose';

// The four LMS roles from the canvas. A user has exactly one.
export const ROLES = ['student', 'mentor', 'admin', 'partner'];

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
    company: { type: String, default: '' }, // partner (B2B) only

    batchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Batch' }],

    // Last authenticated request, stamped (throttled) by requireAuth. Drives the
    // inactivity signal in at-risk detection. Null = never seen since this was
    // added, which the scorer treats as "unknown" rather than "inactive".
    lastActiveAt: { type: Date, default: null },

    emailVerified: { type: Boolean, default: false },
    resetTokenHash: { type: String, default: '' },
    resetExpires: { type: Date, default: null },

    // Set when an admin provisions/resets the account: the user must set their
    // own password before they can use the app.
    mustChangePassword: { type: Boolean, default: false },
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
    company: this.company,
    batch_ids: (this.batchIds || []).map((b) => b.toString()),
    email_verified: this.emailVerified,
    must_change_password: this.mustChangePassword,
  };
};

// IMPORTANT: explicit 'lms_users' collection so this NEVER collides with the
// marketing site's 'users' collection in the shared Atlas database.
export const User = mongoose.model('User', userSchema, 'lms_users');
