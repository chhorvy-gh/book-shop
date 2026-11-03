# សៀវភៅលក់ · Chhorvy Sales Book

The sales book from `../mockup`, as a real app: weekly sales sheets per mart, profit by seller, weekly payouts,
the monthly summary, month-end settlement and pay-later notes, in Khmer. Several people can use it at once from
computers and phones; everything is saved in Firebase.

- **Front end:** Next.js 16 (App Router) · React 19 · TypeScript. The pages use the mockup's own markup and
  stylesheet (`app/mockup.css` is `mockup/assets/styles.css` unchanged), so they look exactly like the mockup.
- **Back end:** Firebase — Firestore for the data, Authentication with Google sign-in, security rules in
  `firestore.rules`.

## Run it

```bash
npm install
npm run dev            # http://localhost:3000, against the Firebase project in .env.local
```

The first Google account to sign in to an empty shop becomes its **owner** (it is offered «ធ្វើជាម្ចាស់ហាង»).
The owner then adds other people's Google emails on the **គណនី (Account)** page; nobody else can see or change
anything. A new shop starts empty: create the first month, or load the mockup's sample week to try things.

### Locally, without touching the real project

```bash
npm run emulators      # Firestore + Auth emulators (Emulator UI: http://127.0.0.1:4000)
npm run dev:emulators  # the app, talking to the emulators
```

The emulators need Java (the Firebase CLI here is 13.x, which works with Java 17; with JDK 21 installed you can move
to the latest `firebase-tools`). Google sign-in on the emulators shows a page to make up a test account.

## Configuration

`.env.local` (not committed; see `.env.example`) holds the Firebase web app config. These values are public — the
security rules decide who may read and write.

| Variable | |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` … `_APP_ID` | Firebase console → Project settings → Your apps → Web app |
| `NEXT_PUBLIC_FIREBASE_DATABASE_ID` | `default` for this project's database (empty for the usual `(default)`) |
| `NEXT_PUBLIC_USE_FIREBASE_EMULATORS` | `true` to use the local emulators |

## Deploy

1. **Security rules** (once, and after changing `firestore.rules`): `npm run deploy:rules`
   (after `npx firebase login`).
2. **The app** on Vercel: import the GitHub repository, add the `NEXT_PUBLIC_FIREBASE_*` variables from
   `.env.local` under Settings → Environment Variables, and deploy. Then add the Vercel domain
   (e.g. `book-shop.vercel.app`) in Firebase console → Authentication → Settings → **Authorized domains**, or Google
   sign-in will refuse it.

## How it is put together

```
app/                      routes; app/(book)/ shares the sidebar, app/entry/ is the phone page
  mockup.css              the mockup's stylesheet, unchanged
  app.css                 what the app adds (fonts, sign-in screens, account page)
components/
  store.tsx               the book: Google sign-in, membership, Firestore listeners → one state, every write
  Gate.tsx                sign-in / claim the shop / no access, and the "could not save" banner
  Shell.tsx               the sidebar (the mockup's renderNav) and the welcome card for an empty shop
  PeriodBar.tsx  ui.tsx  icons.tsx  dialogs/   pieces the pages share, in the mockup's markup
  <page>/                 one folder per page
lib/
  firebase.ts             the Firebase app (offline cache on; emulators when asked)
  db.ts                   Firestore documents and writes
  types.ts  periods.ts  orders.ts  format.ts  export.ts  logic/   the book's rules, independent of Firebase
  sample.ts  sample-data.ts                     the mockup's sample week, loadable from the welcome card
firestore.rules           who may read and write what
```

### Data in Firestore

| Path | Holds |
| --- | --- |
| `settings/shop` | exchange rate, share %, marts and their names, sellers |
| `months/{2026-10}` | the month's weeks and dates; when closed, each seller's weekly payouts |
| `weeks/{2026-10-3}` | that week's payout sheet (deduct / add / paid), adjustments, code numbers used before |
| `orders/{id}` | one order: week, mart, number, code, cost, sale, status, item lists |
| `notes/{id}` | one pay-later note |
| `settlements/{2026-10}` | the month-end sheet and the monthly summary's «ដក» |
| `members/{email}` | who may use the shop (owner / member) |

The app loads the orders of the month on screen and of every month not closed yet, plus all unpaid orders; a closed
month keeps its totals on its month document, so older months never need to be loaded again.

### Differences from the mockup

- Everything is saved and shared: payout, the monthly «ដក», the month-end sheet and closing a month persist (the
  mockup kept them only while a page was open), and every device sees changes as they happen.
- Profit by seller is worked out from the orders (the mockup typed seller lines in by hand).
- The phone entry page saves real orders; due dates on the notes page count from today.
- Sign-in and the account page are the app's own, drawn with the mockup's styles.
