"use client";

// Who is signed in, signing out, and (for owners) who may use the shop. Not in the mockup: the app's own page,
// drawn with the mockup's cards, fields and lists. Anyone, an owner too, can be given a Google account, or a username and
// password made here (lib/usernames.ts); a member with a username works on the quick calculator and the sales sheet only.
import { useState } from "react";
import { createLogin } from "@/lib/firebase";
import { initialOf } from "@/lib/format";
import { USERNAME, loginError, shownName, usernameEmail, usernameOf } from "@/lib/usernames";
import { Icon } from "../icons";
import { useMembers, useSaleBook, type Role } from "../store";
import { Tabs } from "../ui";

const ROLE: Record<Role, string> = { owner: "ម្ចាស់ហាង", member: "អ្នកប្រើ", viewer: "អ្នកមើល" };
// What each role may do, beside the role picker.
const ROLE_HELP: Record<Role, string> = {
  member: "បញ្ចូល និងកែទិន្នន័យបានគ្រប់ទំព័រ",
  owner: "ដូចអ្នកប្រើ ហើយបន្ថែម ឬដកអ្នកប្រើបាន",
  viewer: "មើលតែតារាងលក់ប៉ុណ្ណោះ · មិនអាចបញ្ចូល កែ ឬលុប",
};
// A member who signs in with a username (store.tsx salesOnly): every right, on these two pages only.
const SALES_ONLY = "តែគណនារហ័ស និងតារាងលក់";
const SALES_ONLY_HELP = `បញ្ចូល កែ និងលុបបានគ្រប់យ៉ាង ${SALES_ONLY} · មិនឃើញទំព័រផ្សេង`;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Login = "google" | "username";

// The people list shows its first SHOW rows and scrolls for the rest: it is capped at the height of those rows,
// borders included (offsetTop ignores the list's scrolling). Measured again on every render (people added, removed or
// changed) and when the list changes width, since rows wrap to two lines on a phone.
const SHOW = 5;
function capRows(ul: HTMLUListElement) {
  const fit = () => {
    const capped = ul.children.length > SHOW;
    ul.classList.toggle("is-capped", capped); // first, as its padding changes where the rows wrap
    const first = ul.firstElementChild as HTMLElement | null;
    const last = ul.children[SHOW - 1] as HTMLElement | undefined;
    ul.style.maxHeight = capped && first && last ? `${last.offsetTop + last.offsetHeight - first.offsetTop + ul.offsetHeight - ul.clientHeight}px` : "";
  };
  fit();
  let width = ul.clientWidth;
  const watch = new ResizeObserver(() => {
    if (ul.clientWidth === width) return; // its own height change, from fit
    width = ul.clientWidth;
    fit();
  });
  watch.observe(ul);
  return () => watch.disconnect();
}

export default function AccountPage() {
  const { state, access, signOut, addMember, removeMember, setViewerSeller } = useSaleBook();
  // A seller's name with their code, for a viewer limited to that seller ("បងណា (ហេង)").
  const sellerLabel = (code: string) => {
    const s = state.sellers.find((x) => x.code === code);
    return s ? `${s.name} (${s.code})` : code;
  };
  const owner = access.role === "owner";
  const members = useMembers(owner);
  const [role, setRole] = useState<Role>("member");
  // How the new person signs in, whatever their role: their Google account, or a username and password made here.
  const [login, setLogin] = useState<Login>("google");
  const byUsername = login === "username";
  // A viewer may see every seller's orders, or one seller's only (their code; "" = every seller).
  const [seller, setSeller] = useState("");
  const onlySeller = role === "viewer" ? seller : "";
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const u = username.trim().toLowerCase();
    let target: string;
    if (byUsername) {
      if (!USERNAME.test(u)) return setError("ឈ្មោះអ្នកប្រើ៖ អក្សរឡាតាំង ឬលេខ 3–20 តួ (អាចមាន . _ -)");
      if (password.length < 6) return setError("ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ 6 តួ");
      target = usernameEmail(u);
    } else {
      target = email.trim().toLowerCase();
      if (!EMAIL.test(target) || usernameOf(target)) return setError("បញ្ចូលអ៊ីមែល Google ឲ្យត្រឹមត្រូវ");
    }
    if (members?.some((m) => m.email === target)) return setError(byUsername ? "ឈ្មោះអ្នកប្រើនេះមានសិទ្ធិរួចហើយ" : "អ៊ីមែលនេះមានសិទ្ធិរួចហើយ");
    setError("");
    setBusy(true);
    try {
      // The login first: if the username is someone else's, no access is given.
      if (byUsername) await createLogin(target, password);
      await addMember(target, role, onlySeller || undefined);
      setEmail("");
      setUsername("");
      setPassword("");
      setShowPassword(false);
      const scope = onlySeller ? ` · មើលតែ ${sellerLabel(onlySeller)}` : byUsername && role === "member" ? ` · ${SALES_ONLY}` : "";
      setNote(
        byUsername
          ? `បានបង្កើតគណនី «${u}» · ${ROLE[role]}${scope} · ចូលនៅទំព័រចូល ដោយឈ្មោះ «${u}» និងពាក្យសម្ងាត់ដែលបានកំណត់។`
          : `បានបន្ថែម ${target} · ${ROLE[role]}${scope} · ពេលចូលដោយ Google អាចប្រើបានភ្លាម។`,
      );
    } catch (err) {
      setError(loginError(err));
    } finally {
      setBusy(false);
    }
  }

  const changed = () => {
    setError("");
    setNote("");
  };

  return (
    <>
      <header className="page-head">
        <div className="stack">
          <span className="eyebrow">{shownName(access.email)}</span>
          <h1>គណនី</h1>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-outline" onClick={() => void signOut()}>
            <Icon name="logout" />
            ចេញពីគណនី
          </button>
        </div>
      </header>

      <section className="card" style={{ maxWidth: 720 }}>
        <div className="card-head">
          <div className="stack">
            <h2>អ្នកដែលអាចប្រើសៀវភៅលក់</h2>
            <span className="sub">ចូលដោយគណនី Google ឬឈ្មោះអ្នកប្រើ · តែអ្នកក្នុងបញ្ជីនេះប៉ុណ្ណោះ ដែលប្រើបាន</span>
          </div>
          <span className="chip chip-accent">{access.role ? ROLE[access.role] : ""}</span>
        </div>

        {!owner ? (
          <p className="muted" style={{ margin: 0 }}>
            តែម្ចាស់ហាងប៉ុណ្ណោះ ដែលបន្ថែម ឬដកអ្នកប្រើបាន។
          </p>
        ) : (
          <>
            <form noValidate onSubmit={add} className="member-form">
              <div className="member-form-row">
                <label htmlFor="member-role">សិទ្ធិ</label>
                <select
                  className="select"
                  id="member-role"
                  style={{ width: "auto", minWidth: 200 }}
                  value={role}
                  onChange={(e) => {
                    setRole(e.target.value as Role);
                    changed();
                  }}
                >
                  {(["member", "viewer", "owner"] as const).map((r) => (
                    <option key={r} value={r}>
                      {ROLE[r]}
                    </option>
                  ))}
                </select>
                <span className="sub">{byUsername && role === "member" ? SALES_ONLY_HELP : ROLE_HELP[role]}</span>
              </div>
              <div className="member-form-row">
                <span id="member-login-label">ចូលដោយ</span>
                <Tabs<Login>
                  labelledBy="member-login-label"
                  value={login}
                  onPick={(l) => {
                    setLogin(l);
                    changed();
                  }}
                  items={[
                    { key: "google", label: "Gmail" },
                    { key: "username", label: "ឈ្មោះ និងពាក្យសម្ងាត់" },
                  ]}
                />
              </div>
              {role === "viewer" && (
                <div className="member-form-row">
                  <label htmlFor="member-seller">មើលទិន្នន័យ</label>
                  <select
                    className="select"
                    id="member-seller"
                    style={{ width: "auto", minWidth: 200 }}
                    value={seller}
                    onChange={(e) => {
                      setSeller(e.target.value);
                      changed();
                    }}
                  >
                    <option value="">អ្នកលក់ទាំងអស់</option>
                    {state.sellers.map((s) => (
                      <option key={s.code} value={s.code}>
                        តែ {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                  <span className="sub">{seller ? `ឃើញតែការបញ្ជាទិញកូដ ${seller}1, ${seller}2 …` : "ឃើញការបញ្ជាទិញរបស់អ្នកលក់គ្រប់គ្នា"}</span>
                </div>
              )}
              <div className="member-form-fields">
                {byUsername ? (
                  <>
                    <label className="field" htmlFor="member-username">
                      ឈ្មោះអ្នកប្រើ
                      <input
                        className="input"
                        id="member-username"
                        type="text"
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        maxLength={20}
                        placeholder="ឧ. dara"
                        value={username}
                        aria-invalid={error ? true : undefined}
                        aria-describedby="member-error"
                        onChange={(e) => {
                          setUsername(e.target.value);
                          changed();
                        }}
                      />
                    </label>
                    <div className="field">
                      <span className="field-head">
                        <label htmlFor="member-password">ពាក្យសម្ងាត់</label>
                        <button type="button" className="field-link" onClick={() => setShowPassword((v) => !v)}>
                          {showPassword ? "លាក់" : "បង្ហាញ"}
                        </button>
                      </span>
                      <input
                        className="input"
                        id="member-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="យ៉ាងហោចណាស់ 6 តួ"
                        value={password}
                        aria-describedby="member-error"
                        onChange={(e) => {
                          setPassword(e.target.value);
                          changed();
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <label className="field member-email" htmlFor="member-email">
                    អ៊ីមែល Google
                    <input
                      className="input"
                      id="member-email"
                      type="email"
                      autoComplete="off"
                      placeholder="ឧ. name@gmail.com"
                      value={email}
                      aria-invalid={error ? true : undefined}
                      aria-describedby="member-error"
                      onChange={(e) => {
                        setEmail(e.target.value);
                        changed();
                      }}
                    />
                  </label>
                )}
                <div className="field">
                  <span aria-hidden="true">&nbsp;</span>
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    <Icon name="plus" size={16} />
                    {byUsername ? "បង្កើតគណនី" : "បន្ថែម"}
                  </button>
                </div>
              </div>
            </form>
            {error && (
              <span className="field-error" id="member-error" role="alert" style={{ marginTop: -8 }}>
                {error}
              </span>
            )}
            {note && !error && (
              <p className="t-accent" role="status" style={{ margin: "-8px 0 0", fontSize: 13 }}>
                {note}
              </p>
            )}
            <ul className="member-list" ref={(ul) => (ul ? capRows(ul) : undefined)}>
              {(members ?? []).map((m) => {
                const name = usernameOf(m.email);
                return (
                  <li key={m.email}>
                    <span className="avatar" aria-hidden="true">
                      {initialOf(name ?? (m.data.name || m.email)).toUpperCase()}
                    </span>
                    <span className="stack">
                      <span className="strong">{name ?? m.email}</span>
                      <span className="sub">
                        {ROLE[m.data.role]}
                        {m.data.role === "viewer" ? (m.data.seller ? ` · មើលតែ ${sellerLabel(m.data.seller)}` : " · មើលអ្នកលក់ទាំងអស់") : ""}
                        {m.data.role === "member" && name ? ` · ${SALES_ONLY}` : ""}
                        {name ? " · ចូលដោយឈ្មោះ និងពាក្យសម្ងាត់" : ""}
                        {m.email === access.email ? " · អ្នក" : ""}
                      </span>
                    </span>
                    {m.data.role === "viewer" && (
                      // Which seller this viewer sees, changed in place; it applies at once, even while they are signed in.
                      <select
                        className="select member-seller"
                        aria-label={`មើលទិន្នន័យ · ${name ?? m.email}`}
                        title="មើលទិន្នន័យ"
                        value={m.data.seller ?? ""}
                        onChange={async (e) => {
                          const next = e.target.value;
                          try {
                            await setViewerSeller(m.email, next, m.data.seller ?? "");
                            setError("");
                            setNote(`${name ?? m.email} · ${next ? `មើលតែ ${sellerLabel(next)}` : "មើលអ្នកលក់ទាំងអស់"}។`);
                          } catch (err) {
                            setError(err instanceof Error ? err.message : String(err));
                          }
                        }}
                      >
                        <option value="">អ្នកលក់ទាំងអស់</option>
                        {m.data.seller && !state.sellers.some((s) => s.code === m.data.seller) && <option value={m.data.seller}>តែ {m.data.seller}</option>}
                        {state.sellers.map((s) => (
                          <option key={s.code} value={s.code}>
                            តែ {s.name} ({s.code})
                          </option>
                        ))}
                      </select>
                    )}
                    {m.email !== access.email && (
                      <button
                        type="button"
                        className="row-btn is-danger"
                        aria-label={`ដក ${name ?? m.email}`}
                        onClick={async () => {
                          try {
                            await removeMember(m.email, m.data.role);
                            setError("");
                            setNote(
                              name
                                ? `បានដក «${name}» · គាត់មិនអាចប្រើសៀវភៅលក់ទៀតទេ · ឈ្មោះនេះនៅតែជាប់ ហើយបន្ថែមវិញបាន ដោយពាក្យសម្ងាត់ដដែល។`
                                : `បានដក ${m.email} · គាត់មិនអាចប្រើសៀវភៅលក់ទៀតទេ។`,
                            );
                          } catch (err) {
                            setError(err instanceof Error ? err.message : String(err));
                          }
                        }}
                      >
                        <Icon name="trash" size={14} />
                        ដក
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
