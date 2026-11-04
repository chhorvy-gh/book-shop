"use client";

// Before any page: sign in with Google, then be a member of the shop. The first person in an empty shop claims it.
// Also shows a failed save at the bottom of the screen, on every page.
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Brand } from "./Shell";
import { Icon } from "./icons";
import { SALES_HOME, pagesOf, useSaleBook } from "./store";
import { Loading } from "./ui";

// A login limited to some pages (a viewer, a sales-only member) that opens any other page (a link, a bookmark, the
// overview after signing in) goes to the sales sheet.
function ToSalesHome() {
  const router = useRouter();
  useEffect(() => router.replace(SALES_HOME), [router]);
  return <Loading />;
}

// The other way in, for anyone given a username and password on the account page.
function UsernameSignIn() {
  const { signInWithUsername } = useSaleBook();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="gate-form"
      noValidate
      aria-label="ចូលដោយឈ្មោះអ្នកប្រើ"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        if (!username.trim() || !password) return setError("បញ្ចូលឈ្មោះអ្នកប្រើ និងពាក្យសម្ងាត់");
        setBusy(true);
        const failed = await signInWithUsername(username, password);
        // Signed in: the gate moves on by itself. Otherwise say why.
        setBusy(false);
        setError(failed);
      }}
    >
      <input
        className="input"
        type="text"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="ឈ្មោះអ្នកប្រើ"
        aria-label="ឈ្មោះអ្នកប្រើ"
        value={username}
        onChange={(e) => {
          setUsername(e.target.value);
          setError("");
        }}
      />
      <input
        className="input"
        type="password"
        autoComplete="current-password"
        placeholder="ពាក្យសម្ងាត់"
        aria-label="ពាក្យសម្ងាត់"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setError("");
        }}
      />
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        ចូល
      </button>
    </form>
  );
}

function GateCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="gate">
      <div className="gate-card">
        <Brand />
        {children}
      </div>
    </div>
  );
}

function SaveError() {
  const { error, clearError } = useSaleBook();
  if (!error) return null;
  return (
    <div className="save-error" role="alert">
      <div className="banner">
        <Icon name="alert" size={20} />
        <span className="stack" style={{ flex: 1, lineHeight: 1.5 }}>
          <span className="strong">មិនអាចរក្សាទុកបានទេ</span>
          <span style={{ fontSize: 12 }}>{error}</span>
        </span>
        <button type="button" className="row-btn" onClick={clearError} aria-label="បិទ">
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  );
}

export default function Gate({ children }: { children: React.ReactNode }) {
  const { access, ready, signIn, signOut, claimShop } = useSaleBook();
  const pathname = usePathname();
  const out = (
    <button type="button" className="btn btn-default" onClick={() => void signOut()}>
      <Icon name="logout" size={16} />
      ចេញ ហើយប្រើគណនីផ្សេង
    </button>
  );

  let body: React.ReactNode;
  if (access.status === "loading" || (access.status === "member" && !ready)) {
    body = <Loading />;
  } else if (access.status === "signedOut") {
    body = (
      <GateCard>
        <h1>ចូលប្រើសៀវភៅលក់</h1>
        <p>ចូលដោយគណនី Google របស់អ្នក</p>
        <button type="button" className="btn btn-outline" onClick={() => void signIn()}>
          <Icon name="google" />
          ចូលដោយ Google
        </button>
        <div className="gate-or">
          <span>ឬ ចូលដោយឈ្មោះអ្នកប្រើ</span>
        </div>
        <UsernameSignIn />
      </GateCard>
    );
  } else if (access.status === "unclaimed") {
    body = (
      <GateCard>
        <h1>ហាងនេះមិនទាន់មានម្ចាស់</h1>
        <p>
          អ្នកជាមនុស្សដំបូងដែលចូល · ធ្វើជាម្ចាស់ហាង ដើម្បីចាប់ផ្តើម។ ក្រោយមក ម្ចាស់ហាងបន្ថែមអ្នកផ្សេងទៀត នៅទំព័រគណនី។
        </p>
        <span className="sub">
          <b>{access.email}</b>
        </span>
        <button type="button" className="btn btn-primary" onClick={() => void claimShop()}>
          ធ្វើជាម្ចាស់ហាង
        </button>
        {out}
      </GateCard>
    );
  } else if (access.status === "locked") {
    body = (
      <GateCard>
        <h1>មូលដ្ឋានទិន្នន័យមិនទាន់រៀបចំរួច</h1>
        <p>
          Firebase មិនទាន់អនុញ្ញាតឲ្យកម្មវិធីអាន ឬសរសេរទិន្នន័យទេ · ម្ចាស់គម្រោងត្រូវដាក់ច្បាប់សុវត្ថិភាព (firestore.rules) ក្នុង Firebase console → Firestore → Rules ហើយចុច Publish។
        </p>
        <span className="sub">
          <b>{access.email}</b>
        </span>
        {access.detail && (
          <span className="sub" style={{ fontSize: 11, wordBreak: "break-word" }}>
            {access.detail}
          </span>
        )}
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          សាកម្តងទៀត
        </button>
        {out}
      </GateCard>
    );
  } else if (access.status === "noAccess") {
    body = (
      <GateCard>
        <h1>គណនីនេះមិនទាន់មានសិទ្ធិ</h1>
        <p>សុំម្ចាស់ហាងបន្ថែមអ៊ីមែលនេះ នៅទំព័រគណនី។ ពេលបន្ថែមរួច ទំព័រនេះបើកដោយខ្លួនឯង។</p>
        <span className="sub">
          <b>{access.email}</b>
        </span>
        {out}
      </GateCard>
    );
  } else if (pagesOf(access)?.includes(pathname) === false) {
    body = <ToSalesHome />;
  } else {
    body = children;
  }

  return (
    <>
      {body}
      <SaveError />
    </>
  );
}
