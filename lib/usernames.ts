// Viewers can sign in with a username and password instead of Google. Firebase Auth needs an email address, so the
// username "dara" is the address dara@viewer.salebook.invalid: ".invalid" is reserved (RFC 2606), so no mail can ever
// go there. firestore.rules lets these unverified addresses in as viewers only.
export const USERNAME_DOMAIN = "viewer.salebook.invalid";
// Latin letters and digits (with . _ -), 3–20 long: what Firebase accepts before the @.
export const USERNAME = /^[a-z0-9][a-z0-9._-]{2,19}$/;

export const usernameEmail = (username: string) => `${username.trim().toLowerCase()}@${USERNAME_DOMAIN}`;

// The username of a username login's address, or null for any other address.
export const usernameOf = (email: string) => (email.endsWith(`@${USERNAME_DOMAIN}`) ? email.slice(0, -USERNAME_DOMAIN.length - 1) : null);

// How someone is shown: the username for a username login, otherwise the email.
export const shownName = (email: string) => usernameOf(email) ?? email;

// Firebase's sign-in and sign-up errors, in Khmer.
export function loginError(e: unknown) {
  const code = (e as { code?: string }).code ?? "";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-login-credentials"].includes(code))
    return "ឈ្មោះអ្នកប្រើ ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ";
  if (code === "auth/email-already-in-use") return "ឈ្មោះអ្នកប្រើនេះមានរួចហើយ · ជ្រើសឈ្មោះផ្សេង";
  if (code === "auth/weak-password") return "ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ 6 តួ";
  if (code === "auth/invalid-email") return "ឈ្មោះអ្នកប្រើមិនត្រឹមត្រូវ";
  if (code === "auth/too-many-requests") return "ព្យាយាមច្រើនដងពេក · សូមរង់ចាំបន្តិច ហើយសាកម្តងទៀត";
  if (code === "auth/network-request-failed") return "គ្មានអ៊ីនធឺណិត · សូមពិនិត្យការតភ្ជាប់";
  if (code === "auth/operation-not-allowed")
    return "Firebase មិនទាន់បើកការចូលដោយពាក្យសម្ងាត់ · Authentication → Sign-in method → Email/Password";
  return e instanceof Error ? e.message : String(e);
}
