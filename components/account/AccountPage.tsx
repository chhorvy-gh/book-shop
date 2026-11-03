"use client";

// Who is signed in, signing out, and (for owners) who may use the shop. Not in the mockup: the app's own page,
// drawn with the mockup's cards, fields and lists.
import { useState } from "react";
import { setMember, removeMember } from "@/lib/db";
import { firebase } from "@/lib/firebase";
import { initialOf } from "@/lib/format";
import { Icon } from "../icons";
import { useMembers, useSaleBook } from "../store";
import { Tabs } from "../ui";

const ROLE = { owner: "ម្ចាស់ហាង", member: "អ្នកប្រើ" } as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AccountPage() {
  const { access, signOut } = useSaleBook();
  const owner = access.role === "owner";
  const members = useMembers(owner);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "owner">("member");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const v = email.trim().toLowerCase();
    if (!EMAIL.test(v)) return setError("បញ្ចូលអ៊ីមែល Google ឲ្យត្រឹមត្រូវ");
    if (members?.some((m) => m.email === v)) return setError("អ៊ីមែលនេះមានសិទ្ធិរួចហើយ");
    setError("");
    try {
      await setMember(firebase().db, v, role, access.email);
      setEmail("");
      setNote(`បានបន្ថែម ${v} · ${ROLE[role]} · ពេលចូលដោយ Google អាចប្រើបានភ្លាម។`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <header className="page-head">
        <div className="stack">
          <span className="eyebrow">{access.email}</span>
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
            <span className="sub">ចូលដោយគណនី Google · តែអ៊ីមែលក្នុងបញ្ជីនេះប៉ុណ្ណោះ ដែលមើល និងកែទិន្នន័យបាន</span>
          </div>
          <span className="chip chip-accent">{access.role ? ROLE[access.role] : ""}</span>
        </div>

        {!owner ? (
          <p className="muted" style={{ margin: 0 }}>
            តែម្ចាស់ហាងប៉ុណ្ណោះ ដែលបន្ថែម ឬដកអ្នកប្រើបាន។
          </p>
        ) : (
          <>
            <form noValidate onSubmit={add} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, alignItems: "end" }}>
              <label className="field" htmlFor="member-email" style={{ gridColumn: "span 2" }}>
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
                    setError("");
                  }}
                />
              </label>
              <div className="field">
                <span id="member-role-label">សិទ្ធិ</span>
                <Tabs
                  labelledBy="member-role-label"
                  value={role}
                  onPick={setRole}
                  items={[
                    { key: "member", label: ROLE.member },
                    { key: "owner", label: ROLE.owner },
                  ]}
                  style={{ alignSelf: "flex-start" }}
                />
              </div>
              <button type="submit" className="btn btn-primary">
                <Icon name="plus" size={16} />
                បន្ថែម
              </button>
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
            <ul className="member-list">
              {(members ?? []).map((m) => (
                <li key={m.email}>
                  <span className="avatar" aria-hidden="true">
                    {initialOf(m.data.name || m.email).toUpperCase()}
                  </span>
                  <span className="stack">
                    <span className="strong">{m.email}</span>
                    <span className="sub">
                      {ROLE[m.data.role]}
                      {m.email === access.email ? " · អ្នក" : ""}
                    </span>
                  </span>
                  {m.email !== access.email && (
                    <button
                      type="button"
                      className="row-btn is-danger"
                      aria-label={`ដក ${m.email}`}
                      onClick={async () => {
                        try {
                          await removeMember(firebase().db, m.email);
                          setNote(`បានដក ${m.email} · គាត់មិនអាចប្រើសៀវភៅលក់ទៀតទេ។`);
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
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
