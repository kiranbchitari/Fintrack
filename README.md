# Fintrack

An Android app that reads your bank statement PDFs on the phone and shows where your money goes.

- **No AI.** Everything is done with fixed rules you can read in `www/core.js`.
- **Nothing is uploaded.** Statements, transactions and passwords stay on the device. Android cloud backup of app data is switched off.
- **Encrypted on the phone.** Transactions live in an encrypted SQLite database (SQLCipher); PDF passwords in the Android Keystore. An optional app lock asks for fingerprint or the phone's screen lock.
- **Works offline.** Fonts, the PDF reader and all icons are bundled.

## What it does

- Add one or more statement PDFs (tested with Axis, SBI and HDFC savings accounts). It asks for the PDF password, can remember it in the phone's encrypted keystore, and asks again if it stops working.
- Only new transactions are added. Overlapping or repeated statements are skipped row by row.
- Every row is checked against the bank's running balance.
- Categories come from the bank's own codes first (UPI P2A/P2M, NACH, NEFT, card, ATM), then keywords. Unsure ones go to a "Please check" list with the reason. Correct a payee once and it is remembered.
- Transfers between your own accounts and payments to family (same surname) are found automatically.
- Recurring payments: auto-debits, bills, SIPs, salary, with next expected date, "stopped?" and price-rise flags.
- Overview and Reports: balance trend, how much of your income you keep, spending pace against last month, earned vs spent, category donut, day-by-day calendar, weekday pattern, biggest payments, money with people.
- Backup to one file and restore from it. Restoring never deletes or overwrites.

## Project layout

| Path | What it is |
|---|---|
| `www/core.js` | Statement reading, categories, duplicates, recurring, dashboard numbers, backup. Shared by the app and the tests. |
| `www/index.html` | The screens. Also holds the Android bridge: encrypted database, app lock, share sheet, keystore, back button. In a plain browser it falls back to browser storage. |
| `www/icons.js`, `www/logos/` | Category icons and brand logos. See the note on logos below. |
| `www/tests.js`, `www/tests.html` | Rule tests. Sample bank lines use made-up names and numbers. |
| `android/` | The Android project (Capacitor 8). |

## Run it

```bash
npm install
npm test          # rule tests, no browser needed
npm run serve     # try it in a browser at http://localhost:8765
```

Build the Android app (needs Android Studio, which provides the SDK and Java):

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
npm run build     # tests, sync web files, build android/app/build/outputs/apk/debug/app-debug.apk
```

Or open the `android` folder in Android Studio and press Run.

For a small file to put on your own phone (about 5 MB, 64-bit ARM phones only):

```bash
npm run apk       # writes dist/Fintrack.apk
```

It is signed with the Android debug key, which is fine for personal use. A Play Store release needs its own signing key in `android/app/build.gradle`.

After changing anything in `www/`, run `npm run sync` before building so the Android project picks it up.

## Changing the rules

Add a sample bank line and its expected result to `www/tests.js`, change the rule in `www/core.js`, and run `npm test`. A red line means the change broke something that used to work.

## Brand logos

`www/logos/` holds logo images taken from each brand's own website, and `www/icons.js` holds marks from Simple Icons (CC0). They are the brands' trademarks. That is fine for personal use; check each brand's rules, or switch those brands back to initials badges in `www/icons.js`, before publishing the app.

## Never commit

Bank statements, backups and exports. `.gitignore` blocks `*.pdf`, `*.csv`, `*.xlsx` and backup files.
