"use strict";
const results = [];
let group = "";
function check(name, cond, detail){ results.push({ group, name, pass: !!cond, detail: cond ? "" : detail }); }
function reset(){ TX.length = 0; RULES = {}; NAMES = {}; SET = { me: "", family: "", small: 200 }; IMPORTS.length = 0; }
const row = (date, desc, amt, dir, bal = null) => ({ date, desc, amt, dir, bal });
function one(desc, dir, amt, bank = "Axis"){ reset(); addStatement({ bank, acct: "1111", rows: [row("2026-03-10", desc, amt, dir, 1000)] }, "t"); return TX[0]; }
function expectCat(label, desc, dir, amt, cat, extra = {}, bank){
  const t = one(desc, dir, amt, bank);
  check(label, t.cat === cat && Object.entries(extra).every(([k, v]) => t[k] === v),
    `got ${t.cat}${Object.keys(extra).map(k => `, ${k}=${t[k]}`).join("")} (payee "${t.payee}", why: ${t.why})`);
}

/* ---------- 1. categories from real-world bank text (anonymised) ---------- */
group = "Categories";
expectCat("Big UPI to a person → Sent to people, flagged to check", "UPI/P2A/111122223333/RAVI KUMAR /Paymen/ICICI Bank", "out", 50000, "Sent to people", { conf: "low" });
expectCat("Person paying back the same amount is NOT a refund", "UPI/P2A/111122223334/RAVI KUM/ICIC/Payment/", "in", 50000, "Received from people");
expectCat("Note 'dmart' from a person → received money, flagged", "UPI/P2A/111122223335/MEENA SHA/UBIN/dmart an/", "in", 1160, "Received from people", { conf: "low" });
expectCat("Shop word in a note to a person doesn't make it a shop", "UPI/P2A/111122223336/MEENA SHARMA /UPI/UNION BANK OF INDIA/pothys", "out", 2000, "Sent to people");
expectCat("DMart over UPI → Groceries", "UPI/P2M/111122223337/AVENUE SUPERMARTS LTD/Paymen/HDFC BANK LTD", "out", 1207, "Groceries");
expectCat("Zomato → Food", "UPI/P2M/111122223338/ZOMATO LIMITED /UPI/AXIS BANK", "out", 286.65, "Food & dining");
expectCat("SIP auto-debit → Investments", "ACH-DR-Indian Clearing Corp- 0000ABCDEFGHIJK260", "out", 20000, "Investments", { channel: "Auto-debit", payee: "Indian Clearing Corp" });
expectCat("Insurance NACH → Insurance", "DEBIT ACHDr NACH00000000012345 CTRAZORPAY", "out", 933, "Insurance", { payee: "Razorpay" }, "SBI");
expectCat("Salary credit", "ACME CONSUL/Salary Mar2026", "in", 150000, "Salary");
expectCat("Savings interest", "SB:XXXX1234:Int.Pd:01-01-2026 to 31-03-2026", "in", 1833, "Interest & dividends");
expectCat("Dividend", "ACH-CR-ASIANPAINTSFINDIV-NACH- 663821-663821", "in", 299, "Interest & dividends");
expectCat("Small Paytm QR (SBI) → Local shops", "WDL TFR UPI/DR/600000000001/MAHESH B/YESB/paytm.s1ey/UPI 0097696162090 AT 01727 ACB TOWN", "out", 65, "Local shops", { kind: "shop" }, "SBI");
expectCat("'PAID VIA CRED' (HDFC) is a UPI app, not a card bill", "UPI-RAVI KUMAR-RAVI@OKAXIS-UTIB0003653-644424180310-PAID VIA CRED AND", "out", 50000, "Sent to people", {}, "HDFC");
expectCat("CRED payment → Credit card bills", "UPI/P2M/111122223339/CRED Club /paymen/AXIS BANK", "out", 2993.03, "Credit card bills");
expectCat("Bounced auto-debit charge → Bank charges", "ECS/ACH RET CH Razorpay NACH FAIL INSUF BAL SBIN7011712210025029", "out", 233.38, "Bank charges", {}, "SBI");
expectCat("Debit card annual fee → Bank charges", "DEBIT CARD ANNUAL FEE-JUN-2026-EPR2717048902532", "out", 590, "Bank charges", {}, "HDFC");
expectCat("Google Pay refund → Refunds", "DEP TFR UPI/CR/340353672876/Google I/utib/gpayrefund/UPI 0097734162099 AT 01727 ACB TOWN", "in", 490.72, "Refunds & cashback", {}, "SBI");
expectCat("Broker payout → Investment returns", "DEP TFR NEFT*HDFC0000240*HDFCH00942504664* UPSTOX SECURITI 0099509044300 AT 01727 ACB TOWN", "in", 29463.3, "Investment returns", {}, "SBI");
expectCat("Petrol pump → Fuel", "UPI/P2M/111122223340/Om Sai Petroleum /UPI/YES BANK LIMITED YBS", "out", 1200, "Fuel");
expectCat("Airtel recharge → Bills", "WDL TFR UPI/DR/602314200983/BHARTI A/AIRP/airtelprep/Paym 0097694162092 AT 01727 ACB TOWN", "out", 99, "Bills & recharges", {}, "SBI");
expectCat("Bus ticket → Travel", "WDL TFR UPI/DR/629925671641/NIPANI D/AIRP/nwkrtc.nip/Upi 0097690162095 AT 01727 ACB TOWN", "out", 47, "Travel & transport", {}, "SBI");
expectCat("Code-only credit → Other income, flagged", "M220916073947O34BJXCJAOMF6XR19", "in", 2570.95, "Other income", { conf: "low" });
expectCat("Short words don't match inside names (OLA in SOLAPURE)", "UPI/P2A/258719869603/GULJAR EENUS SOLAPURE/Paymen/ESAF SMALL FINANCE B", "out", 300, "Sent to people", { conf: "high" });
expectCat("Shop paid through 'JIO PAYMENTS BANK' is not a Jio bill", "UPI/P2M/111122223342/Trends Kolhapur 8079/UPI/JIO PAYMENTS BANK", "out", 2246, "Shopping");
expectCat("Bus paid through 'AIRTEL PAYMENTS BANK' is not an Airtel bill", "UPI/P2M/111122223343/MSRTC /UPI/AIRTEL PAYMENTS BANK", "out", 230, "Travel & transport", { payee: "MSRTC" });
expectCat("'Hospitality' is a restaurant, not a hospital", "UPI/P2M/111122223344/S SQUARE HOSPITALITY /UPI/CANARA BANK", "out", 570, "Food & dining");
expectCat("IMPS payout shows the sender's name, not a number", "IMPS/P2A/614914123805/GROWWINV/ICICIB AN/IMPS/9163667541119229491", "in", 153996.2, "Investment returns", { payee: "Groww" });
expectCat("Shortened shop names get one tidy name", "WDL TFR UPI/DR/600408258372/AVENUE S/ICIC/pinedmartk/UPI 0097690162095 AT 01727 ACB TOWN", "out", 427, "Groceries", { payee: "DMart" }, "SBI");
expectCat("'Recharges' is a bill, not a bank charge", "UPI/P2M/111122223345/Jio Prepaid Recharges/UPI/AXIS BANK", "out", 299, "Bills & recharges");
expectCat("Income tax → Taxes", "UPI/P2M/111122223341/CBDT TIN 2 0/UPI/AXIS BANK", "out", 2680, "Taxes & govt");

/* ---------- 2. your own accounts ---------- */
group = "Transfers between your own accounts";
reset();
addStatement({ bank: "Axis", acct: "1111", rows: [row("2026-01-07", "UPI/P2A/637313322502/RAVI K SHARMA /Paid v/State Bank Of India", 50000, "out", 600000)] }, "a");
addStatement({ bank: "SBI", acct: "2222", rows: [row("2026-01-07", "DEP TFR UPI/CR/637313322502/RAVI K /UTIB/9999999999/Paid 0097735162098 AT 01727 ACB TOWN", 50000, "in", 55000)] }, "b");
check("Axis → SBI same name, amount and day: both are your own transfer", TX.every(t => t.cat === "Own accounts"), TX.map(t => t.cat).join(", "));
addStatement({ bank: "SBI", acct: "2222", rows: [row("2026-02-03", "WDL TFR UPI/DR/600701737260/RAVI K./FDRL/9999999999/Towa 0097693162093 AT 01727 ACB TOWN", 20000, "out", 35000)] }, "c");
check("Same name to a bank you haven't added is also you", TX.find(t => t.date === "2026-02-03").cat === "Own accounts", TX.find(t => t.date === "2026-02-03").cat);
reset();
addStatement({ bank: "Axis", acct: "1111", rows: [row("2026-07-17", "UPI/P2M/656469333906/UPSTOX SECURITIES/UPI/HDFC BANK", 10000, "out", 500000)] }, "a");
addStatement({ bank: "SBI", acct: "2222", rows: [row("2026-07-17", "DEP TFR UPI/CR/111/SURESH P/ICIC/9876543210/UPI", 10000, "in", 20000)] }, "b");
check("Same amount but different names is NOT an own transfer", !TX.some(t => t.cat === "Own accounts"), TX.map(t => t.cat).join(", "));

/* ---------- 3. duplicates and overlapping statements ---------- */
group = "Duplicates and overlaps";
const jan = [row("2026-01-02", "UPI/P2M/1/ZOMATO LIMITED /UPI/AXIS BANK", 200, "out", 9800), row("2026-01-02", "UPI/P2M/2/ZOMATO LIMITED /UPI/AXIS BANK", 200, "out", 9600), row("2026-01-20", "ACME CONSUL/Salary Jan2026", 50000, "in", 59600)];
const feb = [row("2026-02-05", "UPI/P2M/3/AVENUE SUPERMARTS LTD/Paymen/HDFC BANK LTD", 1000, "out", 58600)];
reset();
let r = addStatement({ bank: "Axis", acct: "1111", rows: jan }, "jan");
check("Two identical ₹200 payments on one day are both kept (balance differs)", r.added === 3, `added ${r.added}`);
r = addStatement({ bank: "Axis", acct: "1111", rows: jan }, "jan again");
check("Adding the same statement again adds nothing", r.added === 0 && r.dup === 3, `added ${r.added}, skipped ${r.dup}`);
r = addStatement({ bank: "Axis", acct: "1111", rows: [...jan, ...feb] }, "jan-feb");
check("Overlapping Jan–Feb statement adds only February", r.added === 1 && r.dup === 3 && TX.length === 4, `added ${r.added}, skipped ${r.dup}, total ${TX.length}`);
r = addStatement({ bank: "SBI", acct: "2222", rows: jan }, "other bank");
check("Same rows in a different account are not duplicates", r.added === 3, `added ${r.added}`);
// statements with no running balance
reset();
const nb = [row("2026-03-01", "UPI/P2M/9/TEA STALL /UPI/YES BANK", 20, "out"), row("2026-03-01", "UPI/P2M/9/TEA STALL /UPI/YES BANK", 20, "out")];
r = addStatement({ bank: "Card", acct: "9999", rows: nb }, "nb1");
check("No balance column: two identical teas on one day are both kept", r.added === 2, `added ${r.added}`);
r = addStatement({ bank: "Card", acct: "9999", rows: nb }, "nb2");
check("No balance column: same statement again adds nothing", r.added === 0, `added ${r.added}`);
r = addStatement({ bank: "Card", acct: "9999", rows: [...nb, row("2026-03-01", "UPI/P2M/9/TEA STALL /UPI/YES BANK", 20, "out")] }, "nb3");
check("No balance column: a third identical tea in a newer statement is added once", r.added === 1 && TX.length === 3, `added ${r.added}, total ${TX.length}`);

/* ---------- 4. recurring payments ---------- */
group = "Recurring payments";
reset();
const mk = [];
const months = ["01","02","03","04","05","06","07","08","09","10","11"];
months.forEach((m, i) => {
  mk.push(row(`2026-${m}-25`, "DEBIT ACHDr NACH00000000012345 CTRAZORPAY", 933, "out"));
  mk.push(row(`2026-${m}-01`, "ACH-DR-Indian Clearing Corp- 0000ABC" + i, 20000, "out"));
  mk.push(row(`2026-${m}-15`, "ACH-DR-Indian Clearing Corp- 0000XYZ" + i, 30000, "out"));
  mk.push(row(`2026-${m}-${String(14 + (i % 5)).padStart(2, "0")}`, "UPI/P2M/77/CRED Club /paymen/AXIS BANK", 2000 + i * 900, "out"));
  mk.push(row(`2026-${m}-02`, `ACME CONSUL/Salary ${m}`, 150000 + i * 300, "in"));
  if (i < 4) mk.push(row(`2026-${m}-10`, "UPI/P2M/55/NETFLIX COM /UPI/HDFC BANK", 649, "out"));
});
for (let k = 0; k < 30; k++) mk.push(row(`2026-${months[k % 11]}-${String(1 + (k * 7) % 27).padStart(2, "0")}`, "UPI/P2M/66/RAJU TEA STALL /UPI/YES BANK", 20, "out"));
addStatement({ bank: "Axis", acct: "1111", rows: mk.sort((a, b) => a.date < b.date ? -1 : 1) }, "rec");
const rec = detectRecurring(), find = (p, amt) => rec.find(x => x.payee.toLowerCase().includes(p) && (!amt || Math.abs(x.typ - amt) < 1));
check("Monthly NACH insurance found, fixed amount, next due on the 25th", find("razorpay")?.freq === "Monthly" && find("razorpay").fixed && find("razorpay").next.endsWith("-25"), JSON.stringify(find("razorpay") && { f: find("razorpay").freq, next: find("razorpay").next }));
check("Two SIPs from the same company (₹20k and ₹30k) found separately", !!find("indian clearing", 20000) && !!find("indian clearing", 30000), rec.map(x => x.payee + " " + x.typ).join("; "));
check("Card bill on varying dates and amounts is monthly, 'amount varies'", find("cred")?.freq === "Monthly" && !find("cred").fixed, JSON.stringify(find("cred") && { f: find("cred").freq, fixed: find("cred").fixed }));
check("Salary found as regular money coming in", find("acme")?.dir === "in", rec.map(x => x.payee).join(", "));
check("Netflix that stopped after April is marked stopped", find("netflix") && !find("netflix").active, JSON.stringify(find("netflix") && { active: find("netflix").active, last: find("netflix").last }));
check("Daily tea stall is NOT a recurring bill", !find("tea"), "tea stall was listed as recurring");
check("…but it shows up under places you pay often", frequentPlaces().some(f => /tea/i.test(f.payee)), JSON.stringify(frequentPlaces()));

/* ---------- 5. learning from you ---------- */
group = "Learning from your corrections";
reset();
addStatement({ bank: "Axis", acct: "1111", rows: [row("2026-04-01", "UPI/P2A/1/RAVI KUMAR /Paymen/ICICI Bank", 5000, "out", 1000), row("2026-05-01", "UPI/P2A/2/RAVI KUMAR /Paymen/ICICI Bank", 5000, "out", 900)] }, "x");
RULES[pkey("Ravi Kumar")] = "Family"; recategoriseAll();
check("'Always use Family for Ravi Kumar' applies to every Ravi payment", TX.every(t => t.cat === "Family" && t.conf === "high"), TX.map(t => t.cat).join(", "));
addStatement({ bank: "Axis", acct: "1111", rows: [row("2026-06-01", "UPI/P2A/3/RAVI KUMAR /Paymen/ICICI Bank", 5000, "out", 800)] }, "y");
check("…and to new statements added later", TX[TX.length - 1].cat === "Family", TX[TX.length - 1].cat);
reset(); SET.family = "SHARMA";
addStatement({ bank: "Axis", acct: "1111", rows: [row("2026-04-01", "UPI/P2A/1/MEENA SHARMA /UPI/UNION BANK", 3000, "out", 1000)] }, "z");
check("Family surname in Settings → Family", TX[0].cat === "Family", TX[0].cat);


/* ---------- 6. names, family, numbers, backup ---------- */
group = "Shortened names and family";
reset();
addStatement({ bank: "Axis", acct: "1111", rows: [
  row("2026-01-05", "UPI/P2A/1/RAVI K SHARMA /Paid v/State Bank Of India", 20000, "out", 500000),
  row("2026-02-01", "UPI/P2A/2/MEENA B SHARMA /Paymen/HDFC BANK LTD", 15000, "out", 485000),
  row("2026-02-10", "UPI/P2A/3/ANIL VERMA /Paymen/ICICI Bank", 9000, "out", 476000),
  row("2026-03-01", "UPI/P2A/4/ANIL VER/ICIC/Payment/", 9000, "in", 485000) ] }, "a");
addStatement({ bank: "SBI", acct: "2222", rows: [
  row("2026-01-05", "DEP TFR UPI/CR/1/RAVI K /UTIB/9999999999/Paid 0097735162098 AT 01727 ACB TOWN", 20000, "in", 30000),
  row("2026-02-15", "WDL TFR UPI/DR/5/MEENA B /HDFC/8888888888/Paym 0097690162095 AT 01727 ACB TOWN", 5000, "out", 25000) ] }, "b");
const meena = TX.filter(t => /MEENA/i.test(t.desc));
check("'MEENA B' and 'MEENA B SHARMA' become one person", new Set(meena.map(t => t.payee)).size === 1 && meena[0].payee === "Meena B Sharma", meena.map(t => t.payee).join(" | "));
check("Same surname as you → Family, without any setup", meena.every(t => t.cat === "Family"), meena.map(t => t.cat + " (" + t.why + ")").join(" | "));
const anil = TX.filter(t => /ANIL/i.test(t.desc));
check("'ANIL VER' (credit) is matched to 'Anil Verma' (debit)", new Set(anil.map(t => t.payee)).size === 1, anil.map(t => t.payee).join(" | "));
check("A different surname is not family", anil.every(t => t.cat !== "Family"), anil.map(t => t.cat).join(" | "));
reset();
addStatement({ bank: "Axis", acct: "1111", rows: [row("2026-01-05", "UPI/P2M/1/SANTOSH /UPI/YES BANK", 50, "out", 900), row("2026-01-06", "UPI/P2M/2/SANTOSH SHIDALALI /UPI/YES BANK", 60, "out", 840), row("2026-01-07", "UPI/P2M/3/SANTOSH MASTIHOLIMATH /UPI/YES BANK", 70, "out", 770)] }, "c");
check("An ambiguous short name (two possible matches) is left alone", TX[0].payee === "Santosh", TX[0].payee);

group = "Dashboard numbers";
reset();
addStatement({ bank: "Axis", acct: "1111", rows: [
  row("2026-04-02", "ACME CONSUL/Salary Mar2026", 100000, "in", 150000),
  row("2026-04-05", "UPI/P2M/1/ZOMATO LIMITED /UPI/AXIS BANK", 1000, "out", 149000),
  row("2026-04-06", "UPI/P2M/2/AVENUE SUPERMARTS LTD/Paymen/HDFC BANK LTD", 9000, "out", 140000),
  row("2026-04-08", "DEP TFR UPI/CR/3/Google I/utib/gpayrefund/UPI", 500, "in", 140500),
  row("2026-04-10", "ACH-DR-Indian Clearing Corp- 0000ABC", 20000, "out", 120500),
  row("2026-04-12", "UPI/P2A/4/ANIL VERMA /Paymen/ICICI Bank", 5000, "out", 115500),
  row("2026-04-20", "UPI/P2A/5/ANIL VER/ICIC/Payment/", 5000, "in", 120500) ] }, "f");
const fw = flow(TX);
check("Earned counts salary only (not refunds or money back from people)", fw.income === 100000, "income " + fw.income);
check("Spent on living = shop payments minus refunds", fw.spent === 9500, "spent " + fw.spent);
check("Investments and money to people are kept out of spending", fw.invested === 20000 && fw.people === 5000 && fw.received === 5000, JSON.stringify(fw));
check("Kept = 90.5% of income", Math.abs(fw.rate - 0.905) < 1e-9, "rate " + fw.rate);
const bs = balanceSeries();
check("Balance trend ends at the latest balance", bs[bs.length - 1].total === 120500 && bs[0].total === 150000, JSON.stringify(bs.slice(0, 2)));
const ps = paceSeries("2026-04");
check("Spending pace adds up day by day", ps.length === 30 && ps[4] === 1000 && ps[5] === 10000 && ps[29] === 10000, ps.slice(3, 7).join(","));

group = "Backup and restore";
reset();
addStatement({ bank: "Axis", acct: "1111", rows: [row("2026-04-01", "UPI/P2A/1/RAVI KUMAR /Paymen/ICICI Bank", 5000, "out", 1000), row("2026-04-02", "UPI/P2M/2/ZOMATO LIMITED /UPI/AXIS BANK", 300, "out", 700)] }, "x");
RULES[pkey("Ravi Kumar")] = "Family"; TX[1].cat = "Shopping"; TX[1].catSrc = "you"; recategoriseAll();
const backup = JSON.parse(JSON.stringify(makeBackup(false)));
check("Backup holds every transaction and what you taught", backup.tx.length === 2 && backup.rules[pkey("Ravi Kumar")] === "Family" && !("passwords" in backup), JSON.stringify(Object.keys(backup)));
reset();
let rr = restoreBackup(backup);
check("Restore into an empty app brings everything back", rr.added === 2 && TX.length === 2 && TX.find(t => /RAVI/.test(t.desc)).cat === "Family", JSON.stringify(rr));
check("A category you set by hand survives backup and restore", TX.find(t => /ZOMATO/.test(t.desc)).cat === "Shopping", TX.find(t => /ZOMATO/.test(t.desc)).cat);
rr = restoreBackup(backup);
check("Restoring the same backup twice adds nothing", rr.added === 0 && rr.skipped === 2 && TX.length === 2, JSON.stringify(rr));
addStatement({ bank: "Axis", acct: "1111", rows: [row("2026-04-02", "UPI/P2M/2/ZOMATO LIMITED /UPI/AXIS BANK", 300, "out", 700), row("2026-04-03", "UPI/P2M/3/SWIGGY /UPI/AXIS BANK", 200, "out", 500)] }, "y");
check("After a restore, re-adding a statement still skips what is there", TX.length === 3, "total " + TX.length);
let threw = ""; try { restoreBackup({ app: "something-else", tx: [] }); } catch (e) { threw = e.message; }
check("A file that isn't a backup is refused", /isn't a Fintrack backup/.test(threw) && TX.length === 3, threw);
threw = ""; try { restoreBackup({ app: "fintrack", tx: [{ id: "x", date: "bad", amt: "1", dir: "out", desc: "" }] }); } catch (e) { threw = e.message; }
check("A damaged backup changes nothing", /damaged/.test(threw) && TX.length === 3, threw);


group = "Monthly commitments";
reset();
{
  const rows2 = [], mm = ["01","02","03","04","05","06","07","08","09","10","11"];
  mm.forEach((m, i) => {
    const old = i < 9;   // from October the bank prints a different collector name for the same mandates
    rows2.push(row(`2026-${m}-01`, old ? "ACH-DR-Indian Clearing Corp- 0000AAA" + i : "ACH-DR-GROWW INVEST TECH PR- WOWF" + i + "-UTIB70", 20000, "out"));
    rows2.push(row(`2026-${m}-15`, old ? "ACH-DR-Indian Clearing Corp- 0000BBB" + i : "ACH-DR-GROWW INVEST TECH PR- P2KF" + i + "-UTIB70", 30000, "out"));
    if (i >= 5) rows2.push(row(`2026-${m}-${i === 7 ? "17" : "15"}`, old ? "ACH-DR-Indian Clearing Corp- 0000CCC" + i : "ACH-DR-GROWW INVEST TECH PR- Q217" + i + "-UTIB70", 20000, "out"));
    rows2.push(row(`2026-${m}-25`, "DEBIT ACHDr NACH00000000012345 CTRAZORPAY", 933, "out"));
    rows2.push(row(`2026-${m}-${String(12 + (i % 6)).padStart(2, "0")}`, "UPI/P2M/77/CRED Club /paymen/AXIS BANK", [58, 2900, 6500, 80819, 1700, 4200][i % 6], "out"));
    rows2.push(row(`2026-${m}-20`, "UPI/P2A/88/MEENA SHARMA /UPI/UNION BANK", 15000, "out"));
  });
  addStatement({ bank: "Axis", acct: "1111", rows: rows2.sort((a, b) => a.date < b.date ? -1 : 1) }, "commit");
  const rc = detectRecurring(), sips = rc.filter(x => x.cat === "Investments");
  check("A SIP keeps going when the bank renames the collector (not 'stopped')", sips.length === 3 && sips.every(x => x.active), sips.map(x => `${x.payee} ${x.typ} ${x.active ? "active" : "stopped"} n=${x.n}`).join("; "));
  check("Same-amount SIPs on the 1st and the 15th are two commitments", sips.filter(x => x.typ === 20000).length === 2 && sips.filter(x => x.typ === 20000).every(x => x.fixed), sips.map(x => x.typ + (x.fixed ? " fixed" : " varies")).join("; "));
  check("A SIP date that slips by two days (15th to 17th) is still the same SIP", sips.some(x => x.typ === 20000 && x.n === 6), sips.map(x => x.typ + " n=" + x.n).join("; "));
  const cm = commitments();
  check("Monthly commitments = 20k + 30k + 20k SIPs + 933 insurance", Math.round(cm.fixed) === 70933, "fixed " + cm.fixed + " from " + cm.fixedItems.map(x => x.payee + " " + x.monthly).join(", "));
  check("A card bill that swings from 58 to 80,819 is not a fixed commitment", cm.variableItems.length === 1 && /cred/i.test(cm.variableItems[0].payee), cm.variableItems.map(x => x.payee).join(", "));
  check("Regular money to a person is not counted as a commitment", ![...cm.fixedItems, ...cm.variableItems].some(x => /meena/i.test(x.payee)), "included");
}


group = "Your own names for payees";
reset();
addStatement({ bank: "SBI", acct: "2222", rows: [
  row("2026-02-25", "DEBIT ACHDr NACH00000000012345 CTRAZORPAY", 933, "out", 5000), row("2026-03-25", "DEBIT ACHDr NACH00000000012345 CTRAZORPAY", 933, "out", 4000),
  row("2026-04-25", "DEBIT ACHDr NACH00000000012345 CTRAZORPAY", 933, "out", 3000), row("2026-04-26", "WDL TFR UPI/DR/1/MAHESH B/YESB/paytm.s1ey/UPI", 65, "out", 2935) ] }, "n");
renamePayee(TX[0], "Term insurance");
const rz = TX.filter(t => /RAZORPAY/.test(t.desc));
check("Renaming one payment renames every payment from that payee", rz.every(t => t.payee === "Term insurance" && t.auto === "Razorpay"), rz.map(t => t.payee + "/" + t.auto).join(" | "));
check("Other payees keep their names", TX[3].payee !== "Term insurance", TX[3].payee);
check("The category is unchanged by a rename", rz.every(t => t.cat === "Insurance"), rz.map(t => t.cat).join(" | "));
check("Recurring shows the new name", detectRecurring().some(x => x.payee === "Term insurance" && x.typ === 933), detectRecurring().map(x => x.payee).join(", "));
RULES[autoKey(TX[0])] = "Health"; recategoriseAll();
check("A category you teach after renaming still applies", rz.every(t => t.cat === "Health" && t.payee === "Term insurance"), rz.map(t => t.cat + "/" + t.payee).join(" | "));
addStatement({ bank: "SBI", acct: "2222", rows: [row("2026-05-25", "DEBIT ACHDr NACH00000000012345 CTRAZORPAY", 933, "out", 2002)] }, "n2");
check("New statements use your name too", TX[TX.length - 1].payee === "Term insurance", TX[TX.length - 1].payee);
const bk2 = JSON.parse(JSON.stringify(makeBackup(false)));
reset(); restoreBackup(bk2);
check("Your names survive backup and restore", TX.filter(t => /RAZORPAY/.test(t.desc)).every(t => t.payee === "Term insurance"), TX.map(t => t.payee).join(" | "));
renamePayee(TX[0], "");
check("Clearing the name goes back to the bank's name", TX[0].payee === "Razorpay" && !Object.keys(NAMES).length, TX[0].payee);

/* ---------- results ---------- */
const failed = results.filter(r => !r.pass).length;
const TEST_RESULTS = { total: results.length, failed, failures: results.filter(r => !r.pass) };
if (typeof document !== "undefined" && document.getElementById("sum")) {
  const sum = document.getElementById("sum");
  sum.textContent = failed ? `${failed} of ${results.length} tests failed` : `All ${results.length} tests passed`;
  sum.className = "sum " + (failed ? "bad" : "ok");
  const groups = [...new Set(results.map(r => r.group))];
  document.getElementById("out").innerHTML = groups.map(g => `<section><h2>${g}</h2>${results.filter(r => r.group === g).map(r => `<div class="t ${r.pass ? "ok" : "bad"}"><span class="m">${r.pass ? "✓" : "✗"}</span><span>${r.name.replace(/</g, "&lt;")}${r.pass ? "" : `<div class="d">${String(r.detail).replace(/</g, "&lt;")}</div>`}</span></div>`).join("")}</section>`).join("");
  window.TEST_RESULTS = TEST_RESULTS;
}
