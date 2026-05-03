import { useState, useEffect, useRef } from "react";

const MEMBERS = ["พี่เก้", "พี่จิ้บ", "พี่เฟิร์น", "ข้าว"];
const N = MEMBERS.length;

const COLORS = {
  "พี่เก้":    "#6366f1",
  "พี่จิ้บ":   "#ec4899",
  "พี่เฟิร์น": "#10b981",
  "ข้าว":     "#f59e0b",
};

const DEFAULT_DATA = {
  expenses: [
    { id: 1, desc: "ตั๋วเครื่องบิน", amount: 12494, paidBy: "พี่เก้" },
    { id: 2, desc: "ค่าที่พัก",       amount: 17813, paidBy: "ข้าว"  },
  ],
  paidBack: { "1": {}, "2": {} },
  nextId: 3,
};

const API = "https://jsonblob.com/api/jsonBlob";
const fmt = (n) => n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// Use URL hash (#bin=xxx) — works everywhere including CodeSandbox
function getBinIdFromHash() {
  const hash = window.location.hash.replace("#", "");
  const params = new URLSearchParams(hash);
  return params.get("bin") || null;
}

function setBinIdInHash(id) {
  window.location.hash = `bin=${id}`;
}

function computeRawDebts(expenses, paidBack) {
  const raw = {};
  MEMBERS.forEach((a) => { raw[a] = {}; MEMBERS.forEach((b) => { raw[a][b] = []; }); });
  expenses.forEach((e) => {
    const share = e.amount / N;
    MEMBERS.forEach((m) => {
      if (m === e.paidBy) return;
      raw[m][e.paidBy].push({ desc: e.desc, amount: share, paid: !!paidBack[String(e.id)]?.[m] });
    });
  });
  return raw;
}

function computeNet(raw) {
  const results = [];
  const seen = new Set();
  MEMBERS.forEach((a) => {
    MEMBERS.forEach((b) => {
      if (a === b) return;
      const key = [a, b].sort().join("|");
      if (seen.has(key)) return;
      seen.add(key);
      const aItems = raw[a][b].filter(x => !x.paid);
      const bItems = raw[b][a].filter(x => !x.paid);
      const net = aItems.reduce((s, x) => s + x.amount, 0) - bItems.reduce((s, x) => s + x.amount, 0);
      if (Math.abs(net) < 1) return;
      const from = net > 0 ? a : b;
      const to   = net > 0 ? b : a;
      results.push({
        from, to, net: Math.abs(net),
        fromItems: net > 0 ? aItems : bItems,
        toItems:   net > 0 ? bItems : aItems,
      });
    });
  });
  return results;
}

export default function App() {
  const [binId, setBinId]         = useState(null);
  const [expenses, setExpenses]   = useState([]);
  const [paidBack, setPaidBack]   = useState({});
  const [nextId, setNextId]       = useState(3);
  const [loading, setLoading]     = useState(true);
  const [saveState, setSaveState] = useState("saved"); // saved | unsaved | saving | error
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({ desc: "", amount: "", paidBy: MEMBERS[0] });
  const [openNet, setOpenNet]     = useState({});
  const [showShare, setShowShare] = useState(false);
  const [copied, setCopied]       = useState(false);
  const isFirstRender             = useRef(true);

  // ── Load or create bin on mount ──────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const idFromHash = getBinIdFromHash();
      if (idFromHash) {
        try {
          const res = await fetch(`${API}/${idFromHash}`, { headers: { Accept: "application/json" } });
          if (!res.ok) throw new Error("not found");
          const data = await res.json();
          setExpenses(data.expenses ?? DEFAULT_DATA.expenses);
          setPaidBack(data.paidBack ?? DEFAULT_DATA.paidBack);
          setNextId(data.nextId     ?? DEFAULT_DATA.nextId);
          setBinId(idFromHash);
          setSaveState("saved");
        } catch {
          setSaveState("error");
        }
      } else {
        // Create fresh bin
        try {
          const res = await fetch(API, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(DEFAULT_DATA),
          });
          const loc   = res.headers.get("Location") || "";
          const newId = loc.split("/").pop();
          if (!newId) throw new Error("no id returned");
          setExpenses(DEFAULT_DATA.expenses);
          setPaidBack(DEFAULT_DATA.paidBack);
          setNextId(DEFAULT_DATA.nextId);
          setBinId(newId);
          setBinIdInHash(newId);
          setSaveState("saved");
        } catch {
          // Work offline without saving
          setExpenses(DEFAULT_DATA.expenses);
          setPaidBack(DEFAULT_DATA.paidBack);
          setNextId(DEFAULT_DATA.nextId);
          setSaveState("unsaved");
        }
      }
      setLoading(false);
    })();
  }, []);

  // Mark unsaved on data change
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (!loading) setSaveState("unsaved");
  }, [expenses, paidBack]);

  // ── Manual save ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!binId || saveState === "saving") return;
    setSaveState("saving");
    try {
      await fetch(`${API}/${binId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ expenses, paidBack, nextId }),
      });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  // ── Mutations ────────────────────────────────────────────────────────────
  const togglePaidBack = (expId, member) => {
    const key = String(expId);
    setPaidBack(p => ({ ...p, [key]: { ...p[key], [member]: !p[key]?.[member] } }));
  };

  const addExpense = () => {
    if (!form.desc || !form.amount) return;
    const id = nextId;
    setExpenses(p => [...p, { id, desc: form.desc, amount: parseFloat(form.amount), paidBy: form.paidBy }]);
    setPaidBack(p => ({ ...p, [String(id)]: {} }));
    setNextId(n => n + 1);
    setForm({ desc: "", amount: "", paidBy: MEMBERS[0] });
    setShowForm(false);
  };

  const deleteExpense = (id) => {
    setExpenses(p => p.filter(e => e.id !== id));
    setPaidBack(p => { const n = { ...p }; delete n[String(id)]; return n; });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const total     = expenses.reduce((s, e) => s + e.amount, 0);
  const perPerson = total / N;
  const raw       = computeRawDebts(expenses, paidBack);
  const netList   = computeNet(raw);

  const saveBtnCfg = {
    saved:   { bg: "#e8f5e9", color: "#388e3c", label: "✓ บันทึกแล้ว",  disabled: true  },
    unsaved: { bg: "#1a1a1a", color: "#fff",     label: "💾 บันทึก",     disabled: false },
    saving:  { bg: "#555",    color: "#fff",     label: "กำลังบันทึก…",  disabled: true  },
    error:   { bg: "#ffebee", color: "#c62828",  label: "⚠ ลองใหม่",    disabled: false },
  }[saveState];

  if (loading) return (
    <div style={{ fontFamily: "'DM Sans','Noto Sans Thai',sans-serif", display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#bbb", fontSize: 14 }}>
      กำลังโหลด...
    </div>
  );

  return (
    <div style={{ fontFamily: "'DM Sans','Noto Sans Thai',sans-serif", background: "#f5f4f1", minHeight: "100vh", padding: "28px 16px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        .card{background:#fff;border-radius:18px;padding:20px;margin-bottom:14px;box-shadow:0 1px 4px rgba(0,0,0,0.06);}
        .sec{font-size:10px;font-weight:700;color:#bbb;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;}
        .tag{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:20px;font-size:11.5px;font-weight:600;color:#fff;}
        .inp{width:100%;border:1.5px solid #e8e8e8;border-radius:10px;padding:10px 12px;font-size:14px;outline:none;transition:border .15s;font-family:inherit;background:#fff;}
        .inp:focus{border-color:#1a1a1a;}
        .xbtn{background:none;border:none;color:#d8d8d8;cursor:pointer;font-size:18px;padding:0 4px;border-radius:6px;line-height:1;}
        .xbtn:hover{color:#ff4444;}
        .person-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;border:1.5px solid;transition:all .15s;user-select:none;}
        .person-chip.paid{color:#fff;border-color:transparent;}
        .person-chip.unpaid{background:#fff;color:#888;border-color:#e5e5e5;}
        .person-chip.unpaid:hover{border-color:#aaa;color:#444;}
        .net-block{border-radius:13px;overflow:hidden;margin-bottom:10px;border:1.5px solid #f0f0f0;}
        .net-header{display:flex;align-items:center;gap:8px;padding:12px 14px;cursor:pointer;background:#fafafa;transition:background .15s;}
        .net-header:hover{background:#f3f3f3;}
        .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
        .net-body{padding:0 14px 12px;}
        .breakdown-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f5f5f5;font-size:12.5px;}
        .breakdown-row:last-child{border-bottom:none;}
        .net-total-row{display:flex;justify-content:space-between;padding:9px 0 0;margin-top:4px;border-top:1.5px solid #efefef;}
        .chevron{font-size:10px;color:#ccc;transition:transform .2s;}
        .chevron.open{transform:rotate(180deg);}
      `}</style>

      <div style={{ maxWidth: 480, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
            <h1 style={{ fontSize: 21, fontWeight: 600 }}>✈️ ค่าใช้จ่ายทริป</h1>
            <button onClick={() => setShowShare(s => !s)}
              style={{ background: "none", border: "1.5px solid #e5e5e5", borderRadius: 10, padding: "5px 12px", fontSize: 12.5, color: "#666", cursor: "pointer", fontFamily: "inherit" }}>
              🔗 แชร์
            </button>
          </div>
          <p style={{ fontSize: 12, color: "#bbb" }}>{MEMBERS.join(" · ")}</p>
        </div>

        {/* Share box */}
        {showShare && (
          <div className="card">
            <div className="sec">แชร์ให้เพื่อน</div>
            <p style={{ fontSize: 12.5, color: "#777", marginBottom: 10 }}>ส่งลิงก์นี้ให้ทุกคน — เปิดแล้วเห็นและแก้ไขข้อมูลร่วมกันได้เลย</p>
            <div style={{ background: "#f5f4f1", borderRadius: 10, padding: "10px 12px", fontSize: 11.5, color: "#555", wordBreak: "break-all", lineHeight: 1.6 }}>
              {window.location.href}
            </div>
            <button onClick={copyLink}
              style={{ marginTop: 10, border: "none", background: copied ? "#e8f5e9" : "#1a1a1a", color: copied ? "#388e3c" : "#fff", borderRadius: 9, padding: "10px 16px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", transition: "all .2s", width: "100%", fontWeight: 500 }}>
              {copied ? "✓ คัดลอกแล้ว" : "คัดลอกลิงก์"}
            </button>
          </div>
        )}

        {/* Totals */}
        <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: "#bbb", marginBottom: 3 }}>รวมทั้งหมด</div>
            <div style={{ fontSize: 26, fontWeight: 600 }}>฿{fmt(total)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#bbb", marginBottom: 3 }}>คนละ</div>
            <div style={{ fontSize: 18, fontWeight: 500, color: "#555" }}>฿{fmt(perPerson)}</div>
          </div>
        </div>

        {/* Net settlements */}
        <div className="card">
          <div className="sec">สรุปยอดที่ยังค้างโอน</div>
          {netList.length === 0 ? (
            <div style={{ textAlign: "center", color: "#ccc", fontSize: 13.5, padding: "8px 0" }}>✓ เคลียร์หมดแล้ว 🎉</div>
          ) : netList.map((s) => {
            const key = `${s.from}-${s.to}`;
            const isOpen = openNet[key];
            return (
              <div className="net-block" key={key}>
                <div className="net-header" onClick={() => setOpenNet(p => ({ ...p, [key]: !p[key] }))}>
                  <div className="dot" style={{ background: COLORS[s.from] }} />
                  <span style={{ fontSize: 13.5, fontWeight: 500 }}>{s.from}</span>
                  <span style={{ color: "#ccc", fontSize: 12 }}>→</span>
                  <div className="dot" style={{ background: COLORS[s.to] }} />
                  <span style={{ fontSize: 13.5, fontWeight: 500 }}>{s.to}</span>
                  <span style={{ marginLeft: "auto", fontSize: 15, fontWeight: 700, marginRight: 8 }}>฿{fmt(s.net)}</span>
                  <span className={`chevron ${isOpen ? "open" : ""}`}>▼</span>
                </div>
                {isOpen && (
                  <div className="net-body">
                    <div style={{ paddingTop: 10 }}>
                      {[...s.fromItems.map(x => ({ ...x, offset: false })), ...s.toItems.map(x => ({ ...x, offset: true }))].map((r, i) => (
                        <div className="breakdown-row" key={i} style={{ color: r.offset ? "#c0c0c0" : "#333" }}>
                          <span style={{ textDecoration: r.offset ? "line-through" : "none" }}>{r.offset ? "หัก " : ""}{r.desc}</span>
                          <span style={{ fontWeight: 600 }}>{r.offset ? "−" : "+"}฿{fmt(r.amount)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="net-total-row">
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: "#666" }}>ยอดสุทธิ</span>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>฿{fmt(s.net)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Expense list */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div className="sec" style={{ margin: 0 }}>รายการ</div>
            <button onClick={() => setShowForm(s => !s)}
              style={{ border: "none", background: "#1a1a1a", color: "#fff", borderRadius: 10, padding: "6px 13px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
              {showForm ? "ยกเลิก" : "+ เพิ่ม"}
            </button>
          </div>

          {showForm && (
            <div style={{ background: "#fafafa", borderRadius: 12, padding: 14, marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <input className="inp" placeholder="ชื่อรายการ" value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })} />
              <input className="inp" placeholder="จำนวนเงิน (บาท)" type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
              <select className="inp" value={form.paidBy} onChange={e => setForm({ ...form, paidBy: e.target.value })}>
                {MEMBERS.map(m => <option key={m}>{m}</option>)}
              </select>
              <button onClick={addExpense}
                style={{ border: "none", background: "#1a1a1a", color: "#fff", borderRadius: 10, padding: 10, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                เพิ่มรายการ
              </button>
            </div>
          )}

          {expenses.length === 0 && <div style={{ textAlign: "center", color: "#ccc", padding: 20, fontSize: 13 }}>ยังไม่มีรายการ</div>}

          {expenses.map((e, i) => {
            const share     = e.amount / N;
            const debtors   = MEMBERS.filter(m => m !== e.paidBy);
            const paidCount = debtors.filter(m => paidBack[String(e.id)]?.[m]).length;
            const allPaid   = paidCount === debtors.length;
            return (
              <div key={e.id} style={{ borderTop: i > 0 ? "1px solid #f2f2f2" : "none", paddingTop: i > 0 ? 14 : 0, marginTop: i > 0 ? 14 : 0 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: allPaid ? "#c0c0c0" : "#1a1a1a", textDecoration: allPaid ? "line-through" : "none" }}>
                        {e.desc}
                      </span>
                      <span className="tag" style={{ background: COLORS[e.paidBy] }}>{e.paidBy} จ่าย</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#bbb", marginBottom: 10 }}>฿{fmt(e.amount)} · คนละ ฿{fmt(share)}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {debtors.map(m => {
                        const done = !!paidBack[String(e.id)]?.[m];
                        return (
                          <button key={m} className={`person-chip ${done ? "paid" : "unpaid"}`}
                            style={done ? { background: COLORS[m], borderColor: COLORS[m] } : {}}
                            onClick={() => togglePaidBack(e.id, m)}>
                            {done && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                            {m}
                          </button>
                        );
                      })}
                    </div>
                    {paidCount > 0 && (
                      <div style={{ fontSize: 11, color: "#bbb", marginTop: 7 }}>
                        {allPaid ? "✓ ทุกคนจ่ายแล้ว" : `จ่ายแล้ว ${paidCount}/${debtors.length} คน`}
                      </div>
                    )}
                  </div>
                  <button className="xbtn" onClick={() => deleteExpense(e.id)} style={{ marginTop: 2 }}>×</button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Save button */}
        <button onClick={handleSave} disabled={saveBtnCfg.disabled}
          style={{
            width: "100%", border: "none", borderRadius: 14, padding: "15px",
            fontSize: 15, fontWeight: 600, fontFamily: "inherit",
            cursor: saveBtnCfg.disabled ? "default" : "pointer",
            background: saveBtnCfg.bg, color: saveBtnCfg.color,
            transition: "all .2s", marginBottom: 16,
          }}>
          {saveBtnCfg.label}
        </button>

        <div style={{ textAlign: "center", fontSize: 11, color: "#ccc", marginBottom: 24 }}>
          กด 🔗 แชร์ เพื่อส่งลิงก์ให้เพื่อน
        </div>
      </div>
    </div>
  );
}
