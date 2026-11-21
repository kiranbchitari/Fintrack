/* Fintrack core: statement reading, categories, duplicates, recurring.
   No AI. Plain rules. Shared by the app (index.html) and the tests (tests.html). */
"use strict";
let notify = m => console.warn(m);
/* ================= storage ================= */
const MEM = {};
const store = window.PL_TEST ? { get: (k, d) => k in MEM ? JSON.parse(MEM[k]) : d, set: (k, v) => { MEM[k] = JSON.stringify(v); } } : {
  get(k, d){ try { const v = localStorage.getItem("ft_" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v){ try { localStorage.setItem("ft_" + k, JSON.stringify(v)); } catch (e) { notify("Couldn't save on this device: " + e.message); } }
};
let TX = store.get("tx", []);              // all transactions
let PW = store.get("pw", []);
// How saved PDF passwords are kept. The Android app replaces this with the phone's encrypted keystore.
let savePw = () => store.set("pw", PW);              // saved PDF passwords [{pw, label, used}]
let RULES = store.get("rules", {});        // payeeKey -> category (taught by you)
let SET = Object.assign({ me: "", family: "", small: 200, lock: false }, store.get("settings", {}));
let IMPORTS = store.get("imports", []);
// Where everything is saved. A browser uses its own storage; the Android app swaps in its encrypted database.
let persist = () => { store.set("tx", TX); store.set("rules", RULES); store.set("settings", SET); store.set("imports", IMPORTS); };
const save = () => persist();

/* ================= formatting ================= */
const inr = n => (n < 0 ? "−₹" : "₹") + Math.round(Math.abs(n)).toLocaleString("en-IN");
const short = n => { n = Math.abs(n); return n >= 1e5 ? "₹" + (n / 1e5).toFixed(n >= 1e6 ? 0 : 1) + "L" : n >= 1e3 ? "₹" + (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "k" : "₹" + Math.round(n); };
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fdate = d => `${+d.slice(8)} ${MON[+d.slice(5,7)-1]}`;
const fmonth = m => `${MON[+m.slice(5)-1]} ${m.slice(0,4)}`;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const today = () => { const x = new Date(); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2; };

/* ================= statement codes (Indian banks) ================= */
// Channel = how the money moved. Matched on the raw narration.
const CHANNELS = [
  ["UPI",      /\bUPI\b|UPI[-\/]/i],
  ["Auto-debit", /\b(ACH|NACH|ECS|SI|MANDATE)\b|ACH[-\s]?(DR|D-)|ACHDr|NACH|ECS\//i],
  ["NEFT",     /\bNEFT\b/i],
  ["IMPS",     /\bIMPS\b|\bMMT\b/i],
  ["RTGS",     /\bRTGS\b/i],
  ["Card",     /\b(POS|PUR|ECOM PUR|VPS|IPS|EDC)\b|DEBIT CARD|PCD\//i],
  ["Cash",     /\b(ATW|ATM|NWD|CWDR|CASH WDL|CSH|ATM_WDL)\b|CASH WITHDRAWAL|CASH DEP/i],
  ["Cheque",   /\b(CHQ|CLG|CHEQUE|INWARD CLG|TRF CHQ)\b/i],
  ["Bill pay", /\bBIL\b|BILLPAY|BBPS|Bharat Connect/i],
  ["Interest", /Int\.?\s?Pd|INTEREST|Int\.Coll/i],
  ["Transfer", /\b(INF|INFT|TPT|FT|TFR|SWEEP|AUTOSWEEP|BY TRANSFER|TO TRANSFER)\b/i],
];
const channelOf = d => (CHANNELS.find(([, r]) => r.test(d)) || ["Other"])[0];

// Who the money went to / came from
function payeeOf(desc, bank){
  let d = desc.replace(/\s+AT \d{5}.*$/i, "").replace(/\s+\d{10,}\s*$/, "");
  let m, vpa = (d.match(/[\w.\-]+@[\w.]+/) || [""])[0], kind = "";
  if ((m = d.match(/UPI\/(P2[AM])\/\d+\/([^/]+)\//i))) return { name: m[2], kind: m[1] === "P2M" ? "shop" : "person", vpa };
  if ((m = d.match(/UPI\/(?:DR|CR)\/\d+\/([^/]+)\/([^/]*)\/([^/\s]*(?:\s[^/\s]*)?)/i))) {
    const v = m[3].replace(/\s/g, "");
    return { name: m[1], kind: /paytm|bharatpe|gpay-|vyapar|^q\d|yespay|amzn0|sbipmopad|ppr\.|razorpay|cf\./i.test(v) ? "shop" : /^\d{10}$/.test(v) ? "person" : "", vpa: v };
  }
  if ((m = d.match(/^UPI-([^-]+)-([^-]+)/i))) return { name: m[1], kind: /^\d{10}@/.test(m[2]) ? "person" : "", vpa: m[2] };
  if ((m = d.match(/UPI\/\d+\/([^/]*)\/([^/]+@[^/]+)\//i))) return { name: m[2].split("@")[0], kind: "", vpa: m[2] };
  if ((m = d.match(/IMPS\/P2[AM]\/\d+\/([^/]+)\//i))) return { name: m[1], kind: "" };
  if ((m = d.match(/(?:NEFT|IMPS|RTGS)\/[^/]*\/([^/]+)\//i))) return { name: m[1], kind: "" };
  if ((m = d.match(/NEFT\*[^*]*\*[^*]*\*\s*([^*]+?)(?:\s+\d{6,}|$)/i))) return { name: m[1], kind: "" };
  if ((m = d.match(/(?:NEFT|IMPS|RTGS)\s*(?:CR|DR)?-[A-Z]{4}0\w{6}-([^-]+)/i))) return { name: m[1], kind: "" };
  if ((m = d.match(/NACH\w*\s+CT(\w+)/i))) return { name: m[1], kind: "mandate" };
  if ((m = d.match(/ACH[-\s]?(?:DR|CR|D|C)[-\s]+([A-Za-z][A-Za-z .&]*[A-Za-z])/i))) return { name: m[1].replace(/\s+(Int|IntDiv|FinDiv|Div)\d*$/i, ""), kind: "mandate" };
  if ((m = d.match(/(?:POS|PUR|ECOM PUR|VPS|IPS)[\s\/]+(?:\d+X*\d*[\s\/]+)?([A-Za-z][^\/]{2,30})/i))) return { name: m[1], kind: "shop" };
  if (/Int\.?\s?Pd|INTEREST/i.test(d)) return { name: "Savings interest", kind: "bank" };
  if (/ATM|ATW|NWD|CWDR|ATM_WDL/i.test(d)) return { name: "Cash withdrawal", kind: "cash" };
  const nm = d.replace(/^(WDL|DEP) TFR\s*/i, "").replace(/[\/\-]?\w*\d{6,}\w*/g, "").replace(/[\/\-*]+/g, " ").trim().slice(0, 40);
  return { name: nm || "Code " + d.trim().slice(0, 6) + "…", kind: "" };
}
const tidy = n => { n = n.replace(/\/?\s*Salary\b.*$/i, "").replace(/\s+/g, " ").trim().replace(/[\/\- ]+$/, ""); return /[a-z]/.test(n) && /[A-Z]/.test(n) ? n : n.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); };
// The paying bank's name is part of the bank text ("…/UPI/JIO PAYMENTS BANK"). It says nothing about the shop.
const stripBanks = d => d.replace(/\b(JIO|AIRTEL|FINO|PAYTM|NSDL|INDIA ?POST) PAYMENTS? BANK\w*( ?L\w*)?/gi, " ").replace(/PAID ?VIA ?C ?RED\w*( ?AND)?/gi, " ");
// One tidy name for well-known payees, however the bank shortened them
const CANON = [
  [/DMART|AVENUE SUPERMAR|AVENUE S\b|avenuesupe|pinedmart/i, "DMart"], [/AVENUE F|avenuefood/i, "DMart food court"], [/MAKEMYTR/i, "MakeMyTrip"],
  [/BHARTI A|AIRTEL/i, "Airtel"], [/POLICYBA/i, "Policybazaar"], [/UPSTOX/i, "Upstox"], [/GROWW|ICCL GROW/i, "Groww"], [/\bCRED\b|cred\.club/i, "CRED"],
  [/SWIGGY/i, "Swiggy"], [/ZOMATO/i, "Zomato"], [/REDBUS/i, "redBus"], [/MYJIO|jio@|JIO PREPAID/i, "Jio"], [/GOOGLE ?PLAY/i, "Google Play"],
  [/gpayrefund/i, "Google Pay refund"], [/VALVE/i, "Steam"], [/INDMONEY/i, "INDmoney"], [/CRADJ|REVERSAL/i, "UPI reversal"], [/DUNKIN/i, "Dunkin"],
  [/DOMINOS/i, "Domino's"], [/NAMMA BE|nammabenga/i, "Namma Metro"], [/MSRTC/i, "MSRTC"], [/nwkrtc/i, "NWKRTC"], [/BOOKMYSHOW/i, "BookMyShow"],
  [/AMAZON PAY/i, "Amazon Pay"], [/CTRAZORPAY/i, "Razorpay"], [/Int\.?\s?Pd|INTEREST (PAID|CREDIT)/i, "Savings interest"],
];
const pkey = n => n.toLowerCase().replace(/[^a-z]/g, "").slice(0, 10);

/* ================= categories ================= */
const CATS = {
  "Salary": ["income","#0f8a4a"], "Interest & dividends": ["income","#1baf7a"], "Refunds & cashback": ["income","#1baf7a"],
  "Investment returns": ["income","#1baf7a"], "Received from people": ["income","#1baf7a"], "Other income": ["income","#1baf7a"],
  "Food & dining": ["living","#eb6834"], "Groceries": ["living","#1baf7a"], "Shopping": ["living","#e87ba4"],
  "Travel & transport": ["living","#6250d6"], "Fuel": ["living","#c98500"], "Bills & recharges": ["living","#2a78d6"],
  "Subscriptions": ["living","#6250d6"], "Health": ["living","#e34948"], "Insurance": ["living","#256abf"],
  "Education": ["living","#1c5cab"], "Rent & housing": ["living","#8a5a2b"], "Taxes & govt": ["living","#52514e"],
  "Bank charges": ["living","#c43a3a"], "Credit card bills": ["living","#184f95"], "Loan EMI": ["living","#104281"],
  "Cash withdrawal": ["living","#7b8491"], "Local shops": ["living","#eda100"], "Other spending": ["living","#7b8491"],
  "Investments": ["invest","#008300"], "Family": ["family","#eb6834"], "Sent to people": ["people","#1baf7a"],
  "Own accounts": ["self","#7b8491"],
};
const R = (cat, re, dir) => ({ cat, re, dir });
const RULES_BUILTIN = [
  R("Salary", /SALARY|\bSAL\b|PAYROLL/i, "in"),
  R("Interest & dividends", /Int\.?\s?Pd|INTEREST|DIVIDEND|\bDIV\b|IntDiv|FINDIV|ACH-CR|ACH C-/i, "in"),
  R("Refunds & cashback", /REFUND|REVERSAL|REV-|CRADJ|CASHBACK|gpayrefund|RET-/i, "in"),
  R("Investment returns", /UPSTOX SECURITI|GROWWINV|ZERODHA|INDMONEY|REDEMPTION|Sale of Shares|CAMS|KFIN/i, "in"),
  R("Bank charges", /ANNUAL ?FEE|ANNUALFEE|(?<![A-Z])CHARGES|CHRG|\bCHG\b|SMS ALERT|MIN BAL|NON MAINT|ACH RET|ECS RET|RET CH|GST ON|INSUF/i, "out"),
  R("Investments", /GROWW|ZERODHA|UPSTOX|ICCL|INDIAN CLEARING|INDmoney|ANGEL ONE|KUVERA|PAYTM MONEY|MUTUAL FUND|\bSIP\b|\bNPS\b|\bPPF\b|BSE LTD|NSE CLEARING|Equitas.*NCX|NCX.*EQUITAS/i, "out"),
  R("Credit card bills", /\bCRED\b|cred\.club|CREDIT CARD|CC PAYMENT|CARD BILL|BILLDESK.*CARD/i, "out"),
  R("Loan EMI", /\bEMI\b|LOAN|BAJAJ FIN|HOME CREDIT|KREDITBEE|NAVI FIN/i, "out"),
  R("Insurance", /POLICYBAZ|PolicyBa|INSURANCE|\bLIC\b|HDFC LIFE|SBI LIFE|STAR HEALTH|ACKO|DIGIT INS|CTRAZORPAY/i, "out"),
  R("Taxes & govt", /CBDT|INCOME TAX|GST PAYMENT|CHALLAN|Khajane|UIDAI|PROTEAN|PASSPORT|EXAMINATION|MUNICIPAL|\bRTO\b/i, "out"),
  R("Subscriptions", /NETFLIX|HOTSTAR|SPOTIFY|PRIME VIDEO|YOUTUBE|GOOGLE PLAY|Google Play|APPLE\.COM|VALVE|STEAM|BOOKMYSHOW|ZEE5|SONYLIV|JIOCINEMA/i, "out"),
  R("Fuel", /PETROL|PETROLEUM|\bHPCL\b|\bBPCL\b|\bIOCL\b|INDIAN OIL|FUEL|FASTAG/i, "out"),
  R("Bills & recharges", /AIRTEL|BHARTI A|\bJIO\b|MYJIO|jio@|VODAFONE|\bVI\b|BSNL|AIR FIBER|ELECTRICITY|BESCOM|HESCOM|MSEDCL|TNEB|INDANE|BHARAT ?GAS|HP GAS|WATER BILL|BROADBAND|\bDTH\b|TATA PLAY|Bharat Connect|BBPS/i, "out"),
  R("Health", /MEDIC|PHARMA|PHARMACY|APOLLO|1MG|NETMEDS|PHARMEASY|HOSPITAL(?!ITY)|CLINIC|DENTAL|DIAGNOS|\bLAB\b|AYUR|AUSHADHI|LIFELINE/i, "out"),
  R("Education", /SCHOOL|COLLEGE|UNIVERSITY|TUITION|ACADEMY|UDEMY|COURSERA|BYJU|UNACADEMY/i, "out"),
  R("Rent & housing", /\bRENT\b|ESTATES|NOBROKER|SOCIETY|MAINTENANCE|HOUSING/i, "out"),
  R("Travel & transport", /MSRTC|KSRTC|NWKRTC|KADAMBA|IRCTC|REDBUS|MAKEMYTRIP|MakeMyTr|GOIBIBO|INDIGO|AIR INDIA|\bUBER\b|\bOLA\b|RAPIDO|\bMETRO\b|nammabenga|englishbmr|TRAVELS|AUTOMO|AUTO CENTRE/i, "out"),
  R("Food & dining", /ZOMATO|SWIGGY(?! ?INSTAMART)|DOMINOS|DUNKIN|JUBILANT|MCDONALD|\bKFC\b|PIZZA|CAFE|DHABA|HOTEL|RESTAURA|DINING|FOOD|SWEETS|BAKE|JUICE|IDLI|IDALI|CATER|HOSPITALITY|TAMARIND|DELICACY|COLDRINK|CRUNCHY/i, "out"),
  R("Groceries", /DMART|AVENUE SUPERMAR|avenuesupe|BIGBASKET|BLINKIT|ZEPTO|INSTAMART|JIOMART|KIRANA|PROVISION|DEPARTMENTAL|SUPERMARKET|GENERAL S|FRUIT|FRUTS|VEGETABLE|DAIRY|MILK|COCONUT|PATANJALI/i, "out"),
  R("Shopping", /AMAZON|FLIPKART|MYNTRA|AJIO|MEESHO|NYKAA|TEXTILE|FASHION|TRENDS|POTHYS|WESTSIDE|MAX RETAIL|PRETTY WOMAN|GARMENT|COLLECTION|MATCHING|SHOE|TAILOR|FANCY|GIVA|JEWEL|ELECTRONIC|COMMUNICATION|COMPUTERS|HOME DECOR|TRADING/i, "out"),
  R("Cash withdrawal", /ATM|ATW|NWD|CWDR|CASH WDL|ATM_WDL/i, "out"),
];
const words = s => s.split(/[,\n]/).map(w => w.trim()).filter(Boolean);

// Categories a shop would have. A word like "dmart" in a note to a PERSON doesn't make it a shop payment.
const SHOP_CATS = ["Food & dining","Groceries","Shopping","Health","Travel & transport","Fuel","Subscriptions","Refunds & cashback"];
const BIG = 10000;
// Sets t.cat, plus t.conf ("high" / "low") and t.why (the reason, shown to you)
function categorise(t){
  if (t.catSrc === "you") { t.conf = "high"; t.why = "You chose this"; return; }
  const k = pkey(t.payee), hay = stripBanks(t.desc) + " " + t.payee;
  const set = (cat, conf, why) => { t.cat = cat; t.conf = conf; t.why = why; };
  if (RULES[k] && (CATS[RULES[k]] || [])[0] && ((CATS[RULES[k]][0] === "income") === (t.dir === "in") || RULES[k] === "Own accounts" || RULES[k] === "Family")) { t.catSrc = "rule"; return set(RULES[k], "high", "You set this for " + t.payee); }
  t.catSrc = "auto";
  const me = words(SET.me), fam = words(SET.family), has = w => hay.toUpperCase().includes(w.toUpperCase());
  if (t.selfMatch) return set("Own accounts", "high", "The same amount left one of your accounts and reached another");
  if (me.some(has)) return set("Own accounts", "high", "Matches your own name in Settings");
  if (OWN.surname && t.kind !== "shop" && t.payee.toLowerCase().split(/[^a-z]+/).includes(OWN.surname)) return t.dir === "out" ? set("Family", "high", "Same surname as you") : set("Received from people", "high", "From family (same surname as you)");
  if (fam.some(has) && t.kind !== "shop") return t.dir === "out" ? set("Family", "high", "Matches a family name in Settings") : set("Received from people", "high", "From family (name in Settings)");
  // a shop word in a payment to/from a PERSON is just their note: remember it, don't trust it
  const noteHint = t.kind === "person" ? (RULES_BUILTIN.find(r => SHOP_CATS.includes(r.cat) && r.re.test(hay)) || {}).cat || "" : "";
  for (const r of RULES_BUILTIN) {
    if (r.dir !== t.dir || !r.re.test(hay)) continue;
    if (t.kind === "person" && SHOP_CATS.includes(r.cat)) break; // structure beats keywords
    return set(r.cat, "high", "Bank text matches " + r.cat);
  }
  if (t.dir === "out" && /UPSTOX|GROWW|INDmoney/i.test(hay)) return set("Investments", "high", "Investment platform");
  if (t.dir === "in") {
    if (t.kind === "person" || t.channel === "UPI") {
      const why = noteHint ? `From a person. The note mentions ${noteHint.toLowerCase()}, so it's likely them paying you back.` : t.amt >= BIG ? "Large amount from a person: repayment, loan or gift?" : "Money from a person over UPI";
      return set("Received from people", noteHint || t.amt >= BIG ? "low" : "high", why);
    }
    return set("Other income", "low", "Couldn't tell where this came from");
  }
  if (t.channel === "Card") return set("Shopping", "high", "Card payment at a shop");
  if (t.kind === "person") {
    const why = noteHint ? `Paid to a person, but the note mentions ${noteHint.toLowerCase()}` : t.amt >= BIG ? "Large amount to a person: loan, gift or payment?" : "UPI to a person";
    return set("Sent to people", noteHint || t.amt >= BIG ? "low" : "high", why);
  }
  if (/^Code /.test(t.payee)) return set("Other spending", "low", "The bank gave only a code, no name");
  if (t.kind === "shop" || t.channel === "UPI" && t.amt <= 2500) {
    if (t.amt <= 1000) return set("Local shops", "high", "Small payment to a shop");
    if (t.amt <= 2500) return set("Local shops", "low", "Unknown shop, bigger amount");
    return set("Other spending", "low", "Unknown shop, bigger amount");
  }
  if (t.channel === "UPI") return set("Sent to people", t.amt >= BIG ? "low" : "high", "UPI payment, not a known shop");
  return set("Other spending", "low", "Couldn't identify this payment");
}
const needsCheck = t => t.conf === "low" && !t.ok;
// Money that left one of your accounts and arrived in another (same amount, within 3 days)
const OWN = { surname: "", first: "" };
function matchOwnTransfers(){
  const outs = TX.filter(t => t.dir === "out" && t.kind !== "shop"), ins = TX.filter(t => t.dir === "in" && t.kind !== "shop");
  TX.forEach(t => t.selfMatch = false);
  const selfNames = new Set();
  for (const o of outs) {
    const ok = pkey(o.payee).slice(0, 5);
    const hit = ins.find(i => !i.selfMatch && i.acct !== o.acct && Math.abs(i.amt - o.amt) < 0.01 && Math.abs(days(o.date, i.date)) <= 3 && pkey(i.payee).slice(0, 5) === ok && ok.length === 5);
    if (hit) { o.selfMatch = hit.selfMatch = true; selfNames.add(pkey(o.payee).slice(0, 6)); selfNames.add(pkey(hit.payee).slice(0, 6)); }
  }
  // the same name elsewhere (e.g. your account at a bank you haven't added) is you too
  TX.forEach(t => { if (!t.selfMatch && t.kind !== "shop" && pkey(t.payee).length >= 5 && selfNames.has(pkey(t.payee).slice(0, 6)) && t.channel !== "Auto-debit") t.selfMatch = true; });
  // your surname = last word of your own name as it appears in your own transfers; used to spot family
  const mine = TX.filter(t => t.selfMatch).map(t => t.payee.toLowerCase().split(/[^a-z]+/).filter(Boolean)).filter(w => w.length >= 2).sort((a, b) => b.join("").length - a.join("").length)[0];
  OWN.surname = mine && mine[mine.length - 1].length >= 4 ? mine[mine.length - 1] : "";
  OWN.first = mine && mine[0].length >= 3 ? mine[0][0].toUpperCase() + mine[0].slice(1) : "";
}
// Banks cut names short ("RATNA B", "SNEHAL JA"). If a short name is the start of exactly one longer name, they are the same payee.
function mergeNames(){
  const norm = n => n.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  const names = [...new Set(TX.map(t => t.payee))].map(n => [n, norm(n)]).filter(x => x[1]);
  const alias = {};
  for (const [name, k] of names) {
    if (k.length < 6 || (k.length < 8 && !k.includes(" "))) continue;
    const longer = names.filter(([n2, k2]) => k2.length > k.length && k2.startsWith(k));
    if (!longer.length) continue;
    const best = longer.reduce((a, b) => b[1].length > a[1].length ? b : a);
    if (longer.every(([, k2]) => best[1].startsWith(k2))) alias[name] = best[0];
  }
  TX.forEach(t => { if (alias[t.payee]) t.payee = alias[t.payee]; });
}
function recategoriseAll(){
  TX.forEach(t => {
    const p = payeeOf(t.desc, t.bank), clean = stripBanks(t.desc);
    const cn = p.kind !== "person" && CANON.find(c => c[0].test(clean));
    t.payee = cn ? cn[1] : tidy(p.name); t.kind = p.kind; t.channel = channelOf(t.desc);
  });
  mergeNames(); matchOwnTransfers(); TX.forEach(categorise); save();
}

/* ================= PDF reading ================= */
const DATE_RE = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$|^(\d{1,2})[\s\-]([A-Za-z]{3})[\s\-,]*(\d{2,4})$/;
const AMT_RE = /^-?[\d,]+\.\d{2}(\s?(Cr|Dr))?$/i;
const STOP_RE = /computergenerated|endofstatement|^pageno|statementof|statementsummary|transactiontotal|closingbalance|openingbalance|contentsofthis|registeredoffice|generatedon|^legends|systemgenerated|^\*/;
const IFSC_BANK = { HDFC:"HDFC", UTIB:"Axis", SBIN:"SBI", ICIC:"ICICI", KKBK:"Kotak", FDRL:"Federal", IDFB:"IDFC First", YESB:"Yes Bank", PUNB:"PNB", BARB:"Bank of Baroda", CNRB:"Canara", UBIN:"Union Bank", ESFB:"Equitas", INDB:"IndusInd", AUBL:"AU Bank", BKID:"Bank of India", IOBA:"IOB", MAHB:"Bank of Maharashtra" };

function parseDate(s){
  const m = s.match(DATE_RE); if (!m) return null;
  let d, mo, y;
  if (m[1]) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else { d = +m[4]; mo = MON.findIndex(x => x.toLowerCase() === m[5].toLowerCase()) + 1; y = +m[6]; if (!mo) return null; }
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}
const amtVal = s => parseFloat(s.replace(/,|\s?(Cr|Dr)$/gi, ""));

async function openPdf(buf, askPassword){
  const tries = [null, ...PW.slice().sort((a, b) => (b.used || 0) - (a.used || 0)).map(p => p.pw)];
  for (const pw of tries) {
    try { return { doc: await pdfjsLib.getDocument({ data: buf.slice(0), password: pw || undefined }).promise, pw }; }
    catch (e) { if (e.name !== "PasswordException") throw e; }
  }
  let wrong = false;
  for (;;) {
    const ans = await askPassword(wrong);
    if (!ans) return null;
    try { const doc = await pdfjsLib.getDocument({ data: buf.slice(0), password: ans.pw }).promise; return { doc, pw: ans.pw, remember: ans.remember, fresh: true }; }
    catch (e) { if (e.name !== "PasswordException") throw e; wrong = true; }
  }
}

async function readLines(doc){
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p), tc = await page.getTextContent();
    const items = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5], w: i.width }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const it of items) {
      const L = lines.find(l => Math.abs(l.y - it.y) < 3);
      if (L) L.items.push(it); else lines.push({ y: it.y, items: [it] });
    }
    lines.forEach(l => { l.items.sort((a, b) => a.x - b.x); l.text = l.items.map(i => i.s).join(" "); });
    lines.sort((a, b) => b.y - a.y);
    pages.push(lines);
  }
  return pages;
}

function findHeader(lines){
  for (let i = 0; i < lines.length; i++) {
    const n = lines[i].text.toLowerCase().replace(/\s/g, "");
    if (/balance/.test(n) && /date/.test(n) && /(withdrawal|debit|dr\b|deposit|credit)/.test(n)) return i;
  }
  return -1;
}
function columnsFrom(line){
  const cols = [];
  const role = s => { s = s.toLowerCase().replace(/[\s.]/g, "");
    if (/value/.test(s)) return "vdate";
    if (/date/.test(s)) return "date";
    if (/narration|description|particulars|details|remarks/.test(s)) return "desc";
    if (/chq|cheque|ref/.test(s)) return "ref";
    if (/withdraw|debit|^dr$|paidout/.test(s)) return "debit";
    if (/deposit|credit|^cr$|paidin/.test(s)) return "credit";
    if (/balance/.test(s)) return "balance";
    return null; };
  for (const it of line.items) { const r = role(it.s); if (r && !cols.find(c => c.role === r)) cols.push({ role: r, x: it.x, r: it.x + it.w }); }
  cols.sort((a, b) => a.x - b.x);
  return cols.find(c => c.role === "date") && cols.find(c => c.role === "balance") ? cols : null;
}
function colOf(cols, it){ // left-aligned text: the column whose start is the last one <= item start
  let c = cols[0]; for (const k of cols) if (it.x >= k.x - 6) c = k; return c.role;
}

async function parseStatement(doc){
  const pages = await readLines(doc);
  // bank + account from the text before the first table header
  const p0 = pages[0], h0 = findHeader(p0);
  const head = p0.slice(0, h0 < 0 ? 40 : h0).map(l => l.text).join("\n");
  const ifsc = (head.match(/\b([A-Z]{4})0[A-Z0-9]{6}\b/) || [])[1];
  let bank = IFSC_BANK[ifsc] || (/State Bank of India|\bSBI\b/i.test(head) ? "SBI" : /HDFC/i.test(head) ? "HDFC" : /Axis/i.test(head) ? "Axis" : /ICICI/i.test(head) ? "ICICI" : /Kotak/i.test(head) ? "Kotak" : "Bank");
  if (/State Bank of India/i.test(head)) bank = "SBI";
  const acm = head.replace(/\s/g, "").match(/(?:AccountNo|AccountNumber|A\/cNo|A\/c-|A\/c:|AccountNo\.)[:.\-]*([0-9xX*]{6,})/i) || head.match(/Account No[^0-9xX]*([0-9xX*]{6,})/i);
  const acct = acm ? acm[1].slice(-4) : "????";

  // 1. column headings (first page that has them)
  let cols = null;
  for (const lines of pages) { const hi = findHeader(lines); if (hi >= 0 && (cols = columnsFrom(lines[hi]))) break; }
  if (!cols) return { bank, acct, rows: [], issues: [] };
  const amtCols = cols.filter(c => ["debit", "credit", "balance"].includes(c.role)).map(c => ({ ...c, c: (c.x + c.r) / 2 }));
  const textLimit = Math.min(...amtCols.map(c => c.x)) - 4;
  const descCol = cols.find(c => c.role === "desc");
  const refCol0 = cols.find(c => c.role === "ref"), refCol = refCol0 && descCol && refCol0.x > descCol.x ? refCol0 : null; // only a ref column to the right of the description
  const dateTok = it => { const ds = it.s.split(/\s+/)[0]; return parseDate(ds) ? { d: parseDate(ds), right: it.x + it.w * (ds.length / it.s.length), rest: it.s.slice(ds.length).trim() } : null; };
  // 2. learn where descriptions start: just right of the date column(s), measured from the data
  const rights = [];
  for (const lines of pages) for (const L of lines) {
    const f = L.items[0], t = f && dateTok(f);
    if (!t || !L.items.some(it => AMT_RE.test(it.s))) continue;
    let r = t.rest ? null : t.right;
    for (const it of L.items.slice(1)) { if (r == null) break; const t2 = dateTok(it); if (t2 && !t2.rest && it.x < textLimit) r = t2.right; else break; }
    rights.push(r == null ? t.right : r);
  }
  const dateRight = rights.length ? median(rights) : cols[0].r;
  const isDesc = it => it.x >= dateRight - 6 && it.x < textLimit && !AMT_RE.test(it.s) && !parseDate(it.s) && !(refCol && it.x >= refCol.x - 15 && /^[A-Z0-9]{9,}$/i.test(it.s) && /\d{6,}/.test(it.s));
  const amtRole = it => amtCols.reduce((a, c) => Math.abs(c.c - (it.x + it.w / 2)) < Math.abs(a.c - (it.x + it.w / 2)) ? c : a).role;

  let mode = null, cur = null, pending = [], prevBal = null;
  const out = [], issues = [];
  outer:
  for (const lines of pages) {
    const hi = findHeader(lines);
    const start = hi >= 0 ? hi + 1 : 0;
    if (!mode) { // does a description start above its date ("before") or on/after it ("after")?
      mode = "after";
      for (let i = start; i < Math.min(lines.length, start + 6); i++) {
        const L = lines[i];
        if (dateTok(L.items[0]) && L.items[0].x < dateRight) break;
        if (STOP_RE.test(L.text.toLowerCase().replace(/\s/g, "")) || L.items.some(it => AMT_RE.test(it.s))) continue;
        if (L.items.every(isDesc)) { mode = "before"; break; }
      }
    }
    for (let i = start; i < lines.length; i++) {
      const L = lines[i], flat = L.text.toLowerCase().replace(/\s/g, "");
      if (/transactiontotal|endofstatement|statementsummary/.test(flat)) break outer;
      if (STOP_RE.test(flat)) { if (mode === "after") cur = null; pending = []; continue; }
      const first = L.items[0], dt = first && first.x < dateRight ? dateTok(first) : null;
      const amts = L.items.filter(it => AMT_RE.test(it.s) && it.x + it.w > textLimit - 40).map(it => ({ v: amtVal(it.s), role: amtRole(it) }));
      if (dt && amts.length) {
        const descParts = dt.rest ? [dt.rest] : [];
        L.items.slice(1).forEach(it => { if (isDesc(it)) descParts.push(it.s); });
        const balA = amtCols.find(c => c.role === "balance") ? amts[amts.length - 1] : null;
        const a = amts.filter(x => x !== balA && x.v !== 0)[0] || amts.find(x => x !== balA);
        if (!a) { pending = []; continue; }
        const bal = balA ? balA.v : null;
        let dir = a.role === "credit" ? "in" : "out";
        if (prevBal != null && bal != null) {
          if (Math.abs(prevBal + a.v - bal) < 0.02) dir = "in"; else if (Math.abs(prevBal - a.v - bal) < 0.02) dir = "out"; else issues.push(dt.d);
        }
        prevBal = bal;
        cur = { date: dt.d, desc: [...(mode === "before" ? pending : []), ...descParts].join(" "), amt: a.v, dir, bal };
        out.push(cur); pending = [];
        if (mode === "before") cur = null;
        continue;
      }
      if (amts.length) { pending = []; if (mode === "after") cur = null; continue; } // opening balance and similar
      const txt = L.items.filter(isDesc).map(it => it.s);
      if (!txt.length || txt.length !== L.items.length) continue;
      if (mode === "before") pending.push(txt.join(" "));
      else if (cur) cur.desc += (/^[-\/]/.test(txt[0]) || /[-\/]$/.test(cur.desc) ? "" : " ") + txt.join(" ");
    }
  }
  return { bank, acct, rows: out, issues };
}


async function importBuffer(name, buf, ask){
  const o = await openPdf(buf, ask);
  if (!o) return null;
  const st = await parseStatement(o.doc);
  if (o.pw) {
    const ex = PW.find(p => p.pw === o.pw);
    if (ex) { ex.used = Date.now(); ex.label = ex.label || st.bank + " ••" + st.acct; }
    else if (o.remember) PW.push({ pw: o.pw, label: st.bank + " ••" + st.acct, used: Date.now() });
    savePw();
  }
  if (!st.rows.length) throw new Error("No transactions found. This statement layout isn't supported yet.");
  return addStatement(st, name);
}
// Adds a parsed statement {bank, acct, rows:[{date, desc, amt, dir, bal}]}, skipping rows already added.
function addStatement(st, name){
  const have = new Set(TX.map(t => t.id));
  let added = 0, dup = 0;
  const seenInFile = {};
  for (const r of st.rows) {
    const base = [st.bank, st.acct, r.date, r.amt.toFixed(2), r.dir].join("|");
    // with a running balance, the balance tells identical payments apart; without one, number them within this statement
    const id = r.bal != null ? base + "|" + r.bal.toFixed(2) : base + "|#" + (seenInFile[base] = (seenInFile[base] || 0) + 1);
    if (have.has(id)) { dup++; continue; }
    have.add(id);
    TX.push({ id, bank: st.bank, acct: st.acct, date: r.date, desc: r.desc, amt: r.amt, dir: r.dir, bal: r.bal ?? null, file: name, cat: "", catSrc: "" });
    added++;
  }
  TX.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  IMPORTS.push({ name, bank: st.bank, acct: st.acct, added, dup, at: today() });
  recategoriseAll();
  return { bank: st.bank, acct: st.acct, added, dup, issues: (st.issues || []).length };
}

/* ================= recurring detection (no AI: date gaps + amounts) ================= */
const FREQ = [["Weekly",7,2],["Every 2 weeks",14,3],["Monthly",30,7],["Every 2 months",61,10],["Quarterly",91,14],["Every 6 months",182,20],["Yearly",365,25]];
const BILLISH = ["Credit card bills","Bills & recharges","Insurance","Subscriptions","Loan EMI","Rent & housing","Investments","Salary","Interest & dividends","Family","Education","Investment returns"];
function detectRecurring(){
  const groups = {};
  for (const t of TX) {
    if (t.cat === "Own accounts") continue;
    const mand = t.channel === "Auto-debit";
    const key = [t.dir, mand ? "M" : "", pkey(t.payee), mand ? Math.round(t.amt / 500) : ""].join("|");
    (groups[key] = groups[key] || []).push(t);
  }
  const lastDate = TX.length ? TX[TX.length - 1].date : null;
  const mIndex = d => +d.slice(0, 4) * 12 + +d.slice(5, 7) - 1;
  const res = [];
  for (const g of Object.values(groups)) {
    const byDay = {}; g.forEach(t => (byDay[t.date] = (byDay[t.date] || 0) + t.amt));
    const dates = Object.keys(byDay).sort();
    if (dates.length < 3) continue;
    const cat = g[g.length - 1].cat, mand = g[0].channel === "Auto-debit", billish = mand || BILLISH.includes(cat);
    const amtsD = dates.map(d => byDay[d]), fixedD = Math.max(...amtsD) / Math.min(...amtsD) <= 1.12;
    let f = null, amts = amtsD, perMonth = null;
    // (a) calendar test: shows up in most months of its span (handles twice-a-month SIPs, card bills on varying dates)
    const byM = {}; dates.forEach(d => byM[mIndex(d)] = (byM[mIndex(d)] || 0) + byDay[d]);
    const ms = Object.keys(byM).map(Number).sort((a, b) => a - b), span = ms[ms.length - 1] - ms[0] + 1;
    if (ms.length >= 3 && ms.length / span >= .75 && dates.length / ms.length <= 2.5 && (billish || fixedD)) { f = FREQ[2]; perMonth = ms.map(m => byM[m]); amts = perMonth; }
    // (b) gap test: weekly, quarterly, yearly…
    if (!f) {
      const gaps = dates.slice(1).map((d, i) => days(dates[i], d)), m = median(gaps);
      const ff = FREQ.find(([, d, tol]) => Math.abs(m - d) <= tol);
      if (ff && gaps.filter(x => Math.abs(x - ff[1]) <= ff[2] * 1.6).length / gaps.length >= .7 && (billish || fixedD)) f = ff;
    }
    if (!f) continue;
    const typ = median(amts), fixed = Math.max(...amts) / Math.min(...amts) <= 1.12;
    if (!fixed && !billish && typ < 1000) continue;
    const last = dates[dates.length - 1];
    const dom = Math.round(median(dates.map(d => +d.slice(8))));
    let next = addDays(last, f[1]);
    if (f[1] === 30) { const n = new Date(last); n.setUTCMonth(n.getUTCMonth() + 1, Math.min(dom, 28)); next = n.toISOString().slice(0, 10); }
    const active = days(last, lastDate) <= f[1] * 1.5 + f[2];
    const lastAmt = amts[amts.length - 1], prevTyp = median(amts.slice(0, -1));
    res.push({ payee: g[g.length - 1].payee, cat, dir: g[0].dir, channel: g[0].channel, freq: f[0], period: f[1], n: dates.length,
      typ, fixed, total: g.reduce((a, t) => a + t.amt, 0), last, next, active, monthly: typ * 30 / f[1],
      change: fixed && lastAmt > prevTyp * 1.05 ? lastAmt - prevTyp : 0, tx: g });
  }
  return res.sort((a, b) => b.monthly - a.monthly);
}
function frequentPlaces(){
  const g = {};
  TX.filter(t => t.dir === "out" && CATS[t.cat]?.[0] === "living" && t.amt <= 1000).forEach(t => { const k = pkey(t.payee); (g[k] = g[k] || []).push(t); });
  return Object.values(g).filter(a => a.length >= 6).map(a => ({ payee: a[0].payee, n: a.length, total: a.reduce((s, t) => s + t.amt, 0), cat: a[0].cat })).sort((a, b) => b.n - a.n).slice(0, 6);
}


/* ================= numbers for the dashboards ================= */
const grpOf = t => (CATS[t.cat] || ["living"])[0];
const EARNED = ["Salary", "Interest & dividends", "Other income"];
// What really happened in a set of transactions (own-account moves ignored)
function flow(rows){
  const sum = f => rows.filter(f).reduce((a, t) => a + t.amt, 0);
  const income = sum(t => t.dir === "in" && EARNED.includes(t.cat));
  const refunds = sum(t => t.cat === "Refunds & cashback");
  const spent = Math.max(0, sum(t => t.dir === "out" && grpOf(t) === "living") - refunds);
  const invested = sum(t => t.dir === "out" && grpOf(t) === "invest"), withdrawn = sum(t => t.cat === "Investment returns");
  const family = sum(t => t.cat === "Family"), people = sum(t => t.cat === "Sent to people"), received = sum(t => t.cat === "Received from people");
  return { income, spent, refunds, invested, withdrawn, family, people, received, saved: income - spent, rate: income ? (income - spent) / income : null };
}
const monthsOf = () => [...new Set(TX.map(t => t.date.slice(0, 7)))].sort();
const inMonth = m => TX.filter(t => t.date.startsWith(m));
// Total balance across accounts on each day that had a transaction
function balanceSeries(){
  const acct = t => t.bank + "|" + t.acct, last = {}, first = {};
  TX.forEach(t => { if (t.bal != null && !(acct(t) in first)) first[acct(t)] = t.bal + (t.dir === "out" ? t.amt : -t.amt); });
  Object.assign(last, first); // before an account's first transaction, use its opening balance
  const out = []; let i = 0;
  const dates = [...new Set(TX.map(t => t.date))];
  for (const d of dates) {
    while (i < TX.length && TX[i].date === d) { if (TX[i].bal != null) last[acct(TX[i])] = TX[i].bal; i++; }
    out.push({ date: d, total: Object.values(last).reduce((a, b) => a + b, 0) });
  }
  return out;
}
// Running total of living costs through a month, one value per day
function paceSeries(m){
  const dim = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5), 0)).getUTCDate(), a = new Array(dim).fill(0);
  inMonth(m).forEach(t => { if (t.dir === "out" && grpOf(t) === "living") a[+t.date.slice(8) - 1] += t.amt; });
  for (let i = 1; i < dim; i++) a[i] += a[i - 1];
  return a;
}
// Payments much larger than usual for the same payee
function unusual(rows){
  const by = {};
  TX.filter(t => t.dir === "out" && grpOf(t) === "living").forEach(t => (by[pkey(t.payee)] = by[pkey(t.payee)] || []).push(t.amt));
  return rows.filter(t => t.dir === "out" && grpOf(t) === "living" && (by[pkey(t.payee)] || []).length >= 4 && t.amt >= 2000 && t.cat !== "Credit card bills" && t.amt > 3 * median(by[pkey(t.payee)]));
}

/* ================= backup and restore ================= */
function makeBackup(includePasswords){
  const b = { app: "fintrack", version: 1, exported: today(),
    tx: TX.map(t => ({ id: t.id, bank: t.bank, acct: t.acct, date: t.date, desc: t.desc, amt: t.amt, dir: t.dir, bal: t.bal, file: t.file, ...(t.catSrc === "you" ? { cat: t.cat, catSrc: "you" } : {}), ...(t.ok ? { ok: true } : {}) })),
    rules: RULES, settings: SET, imports: IMPORTS };
  if (includePasswords) b.passwords = PW;
  return b;
}
// Merges a backup into what is already here. Nothing existing is removed or overwritten.
function restoreBackup(b){
  if (!b || !["fintrack", "paisa-ledger"].includes(b.app) || !Array.isArray(b.tx)) throw new Error("This isn't a Fintrack backup file.");
  const okRow = t => t && typeof t.id === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.date) && typeof t.amt === "number" && isFinite(t.amt) && (t.dir === "in" || t.dir === "out") && typeof t.desc === "string";
  const bad = b.tx.filter(t => !okRow(t)).length;
  if (bad) throw new Error(`The backup is damaged (${bad} unreadable rows). Nothing was changed.`);
  const have = new Set(TX.map(t => t.id)); let added = 0, skipped = 0, rules = 0;
  for (const t of b.tx) {
    if (have.has(t.id)) { skipped++; continue; }
    have.add(t.id);
    TX.push({ id: t.id, bank: String(t.bank || "Bank"), acct: String(t.acct || "????"), date: t.date, desc: t.desc, amt: t.amt, dir: t.dir, bal: typeof t.bal === "number" ? t.bal : null, file: String(t.file || "backup"),
      cat: t.catSrc === "you" && CATS[t.cat] ? t.cat : "", catSrc: t.catSrc === "you" && CATS[t.cat] ? "you" : "", ...(t.ok ? { ok: true } : {}) });
    added++;
  }
  for (const [k, c] of Object.entries(b.rules || {})) if (!RULES[k] && CATS[c]) { RULES[k] = c; rules++; }
  if (b.settings) { if (!SET.me && typeof b.settings.me === "string") SET.me = b.settings.me; if (!SET.family && typeof b.settings.family === "string") SET.family = b.settings.family; }
  let pws = 0;
  for (const p of Array.isArray(b.passwords) ? b.passwords : []) if (p && typeof p.pw === "string" && !PW.find(x => x.pw === p.pw)) { PW.push({ pw: p.pw, label: String(p.label || ""), used: 0 }); pws++; }
  if (pws) savePw();
  TX.sort((a, b2) => a.date < b2.date ? -1 : a.date > b2.date ? 1 : 0);
  if (added) IMPORTS.push({ name: "Backup from " + (b.exported || "?"), bank: "Backup", acct: "", added, dup: skipped, at: today() });
  recategoriseAll();
  return { added, skipped, rules, passwords: pws };
}
