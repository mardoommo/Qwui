import React, { useState, useEffect } from "react";
import logoImg from "./assets/logo.png";
import QRCode from "qrcode";
import QrBillDocument from "./QrBillDocument.jsx";
import BuchhaltungTab from "./BuchhaltungTab.jsx";
import { generateReceiptPdf } from "./pdfGenerator.js";
import {
  isValidSwissIban,
  buildSwissQrPayload,
  buildCreditorReference,
  formatReferenceDisplay,
} from "./qrbill.js";
import {
  Plus,
  Trash2,
  Printer,
  Mail,
  Building2,
  Users,
  FileText,
  History,
  ArrowLeft,
  Check,
  Loader2,
  MessageCircle,
  Wallet,
  Share2,
} from "lucide-react";

const KEYS = {
  company: "company-info",
  customers: "customers-list",
  receipts: "receipts-list",
};

const emptyCompany = {
  name: "",
  address: "",
  zipCity: "",
  email: "",
  phone: "",
  vatNumber: "",
  qrBill: { name: "", iban: "", street: "", houseNumber: "", postalCode: "", city: "", country: "CH" },
};
const emptyPerson = {
  name: "",
  address: "", // alte Freitext-Adresse, bleibt für bestehende Kunden erhalten
  street: "",
  houseNumber: "",
  postalCode: "",
  city: "",
  email: "",
  phone: "",
};

// Liefert Adresszeilen für die Anzeige: bevorzugt die neuen strukturierten
// Felder, fällt sonst auf die alte Freitext-Adresse zurück (für Kunden, die
// vor dieser Änderung angelegt wurden).
function personAddressLines(person) {
  if (!person) return [];
  const line1 = `${person.street || ""} ${person.houseNumber || ""}`.trim();
  const line2 = `${person.postalCode || ""} ${person.city || ""}`.trim();
  const structured = [line1, line2].filter(Boolean);
  if (structured.length) return structured;
  return person.address ? [person.address] : [];
}

function personHasAddress(person) {
  return !!(person && ((person.postalCode && person.city) || person.address));
}

function sanitizePhone(phone) {
  return (phone || "").replace(/[^\d]/g, "");
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function chf(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Nächste freie Quittungsnummer: höchste bisher vergebene Nummer + 1, statt
// receipts.length + 1 — sonst würden nach dem Löschen einer Quittung
// Nummern doppelt vergeben (z.B. Löschen von Nr. 0003 bei 5 Quittungen würde
// die nächste neue Quittung wieder auf 0004 setzen, obwohl das schon vergeben ist).
function nextReceiptNumber(receipts) {
  const maxNumber = receipts.reduce((max, r) => {
    const n = parseInt(r.number, 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return String(maxNumber + 1).padStart(4, "0");
}

function formatDateDE(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function dataUrlToUint8Array(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Erzeugt die fertigen PDF-Bytes für eine Quittung (inkl. QR-Rechnung, falls
// aktiviert). Eigenständig auf Modulebene, damit sowohl der Download-Button
// als auch der Teilen-Button (Web Share API) dieselbe Logik nutzen können.
async function buildReceiptPdfBytes(receipt) {
  let qrPngBytes = null;
  let referenceDisplay = "";
  let qrIban = "";
  let qrCreditor = {};

  if (receipt.qrBillEnabled) {
    const co = receipt.company || {};
    const qr = co.qrBill || {};
    qrIban = qr.iban || "";
    qrCreditor = {
      name: qr.name || co.name,
      street: qr.street,
      houseNumber: qr.houseNumber,
      postalCode: qr.postalCode,
      city: qr.city,
      country: qr.country || "CH",
    };
    const customer = receipt.customer || {};
    const debtor =
      customer.name && customer.postalCode && customer.city
        ? {
            name: customer.name,
            street: customer.street,
            houseNumber: customer.houseNumber,
            postalCode: customer.postalCode,
            city: customer.city,
            country: customer.country || "CH",
          }
        : null;

    const payload = buildSwissQrPayload({
      iban: qrIban,
      creditor: qrCreditor,
      amount: receipt.total,
      currency: "CHF",
      debtor,
      referenceText: receipt.number,
      message: `Quittung Nr. ${receipt.number}`,
    });

    const creditorReference = buildCreditorReference(receipt.number);
    referenceDisplay = formatReferenceDisplay(creditorReference);

    const dataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 0,
      width: 480,
      color: { dark: "#000000", light: "#ffffff" },
    });
    qrPngBytes = dataUrlToUint8Array(dataUrl);
  }

  const enrichedReceipt = { ...receipt, referenceDisplay, qrIban, qrCreditor };
  return generateReceiptPdf(enrichedReceipt, qrPngBytes);
}

export default function ReceiptApp() {
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("new");
  const [mode, setMode] = useState("form"); // 'form' | 'preview'
  const [saveStatus, setSaveStatus] = useState("");

  const [company, setCompany] = useState(emptyCompany);
  const [companyDraft, setCompanyDraft] = useState(emptyCompany);
  const [customers, setCustomers] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [currentReceipt, setCurrentReceipt] = useState(null);
  const [editingReceiptId, setEditingReceiptId] = useState(null);

  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [manualCustomer, setManualCustomer] = useState(emptyPerson);
  const [date, setDate] = useState(todayISO());
  const [items, setItems] = useState([{ id: uid(), description: "", amount: "" }]);
  const [note, setNote] = useState("");
  const [vatEnabled, setVatEnabled] = useState(false);
  const [qrBillEnabled, setQrBillEnabled] = useState(false);

  const [newCustomer, setNewCustomer] = useState(emptyPerson);

  useEffect(() => {
    (async () => {
      try {
        const c = await window.storage.get(KEYS.company);
        if (c && c.value) {
          const parsed = JSON.parse(c.value);
          setCompany(parsed);
          setCompanyDraft(parsed);
        }
      } catch (e) {}
      try {
        const cu = await window.storage.get(KEYS.customers);
        if (cu && cu.value) setCustomers(JSON.parse(cu.value));
      } catch (e) {}
      try {
        const r = await window.storage.get(KEYS.receipts);
        if (r && r.value) setReceipts(JSON.parse(r.value));
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  async function persist(key, value, setter) {
    setter(value);
    try {
      await window.storage.set(key, JSON.stringify(value), false);
    } catch (e) {
      console.error("Speichern fehlgeschlagen", e);
    }
  }

  async function saveCompany() {
    await persist(KEYS.company, companyDraft, setCompany);
    setSaveStatus("Firmendaten gespeichert");
    setTimeout(() => setSaveStatus(""), 2000);
  }

  async function addCustomer() {
    if (!newCustomer.name.trim()) return;
    const next = [...customers, { ...newCustomer, id: uid() }];
    await persist(KEYS.customers, next, setCustomers);
    setNewCustomer(emptyPerson);
  }

  async function saveManualCustomerToList() {
    if (!manualCustomer.name.trim()) return;
    const newEntry = { ...manualCustomer, id: uid() };
    const next = [...customers, newEntry];
    await persist(KEYS.customers, next, setCustomers);
    setSelectedCustomerId(newEntry.id);
    setManualCustomer(emptyPerson);
  }

  async function deleteCustomer(id) {
    const next = customers.filter((c) => c.id !== id);
    await persist(KEYS.customers, next, setCustomers);
    if (selectedCustomerId === id) setSelectedCustomerId("");
  }

  function updateItem(id, field, value) {
    setItems(items.map((it) => (it.id === id ? { ...it, [field]: value } : it)));
  }

  function addItem() {
    setItems([...items, { id: uid(), description: "", amount: "" }]);
  }

  function removeItem(id) {
    if (items.length === 1) return;
    setItems(items.filter((it) => it.id !== id));
  }

  const VAT_RATE = 0.081; // Normalsatz Schweiz für Dienstleistungen, Stand 2026

  const enteredSum = items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
  const total = round2(enteredSum);
  const netTotal = vatEnabled ? round2(total / (1 + VAT_RATE)) : total;
  const vatAmount = vatEnabled ? round2(total - netTotal) : 0;

  function resetForm() {
    setSelectedCustomerId("");
    setManualCustomer(emptyPerson);
    setDate(todayISO());
    setItems([{ id: uid(), description: "", amount: "" }]);
    setNote("");
    setVatEnabled(false);
    setQrBillEnabled(false);
  }

  function getActiveCustomer() {
    if (selectedCustomerId) {
      const c = customers.find((c) => c.id === selectedCustomerId);
      if (c) return c;
    }
    return manualCustomer;
  }

  const activeCustomer = getActiveCustomer();
  const validItems = items.filter((it) => it.description.trim() && Number(it.amount) > 0);
  const canCreate = activeCustomer.name.trim() && validItems.length > 0;
  const needsAddress = total >= 400;

  async function createReceipt() {
    if (!canCreate) return;

    if (editingReceiptId) {
      const existing = receipts.find((r) => r.id === editingReceiptId);
      const isQrBill = qrBillEnabled && isValidSwissIban(company.qrBill?.iban);
      const updated = {
        ...existing,
        date,
        customer: { ...activeCustomer },
        items: validItems,
        netTotal,
        vatEnabled,
        vatRate: VAT_RATE,
        vatAmount,
        total,
        qrBillEnabled: isQrBill,
        paid: isQrBill ? !!existing.paid : true,
        note,
        editedAt: new Date().toISOString(),
      };
      const next = receipts.map((r) => (r.id === editingReceiptId ? updated : r));
      await persist(KEYS.receipts, next, setReceipts);
      setCurrentReceipt(updated);
      setEditingReceiptId(null);
      setMode("preview");
      return;
    }

    const number = nextReceiptNumber(receipts);
    const isQrBill = qrBillEnabled && isValidSwissIban(company.qrBill?.iban);
    const receipt = {
      id: uid(),
      number,
      date,
      customer: { ...activeCustomer },
      items: validItems,
      netTotal,
      vatEnabled,
      vatRate: VAT_RATE,
      vatAmount,
      total,
      qrBillEnabled: isQrBill,
      paid: !isQrBill,
      note,
      company,
      createdAt: new Date().toISOString(),
    };
    const next = [...receipts, receipt];
    await persist(KEYS.receipts, next, setReceipts);
    setCurrentReceipt(receipt);
    setMode("preview");
  }

  function startEditReceipt(r) {
    const matchingCustomer = customers.find(
      (c) => c.name === r.customer.name && c.email === r.customer.email
    );
    if (matchingCustomer) {
      setSelectedCustomerId(matchingCustomer.id);
      setManualCustomer(emptyPerson);
    } else {
      setSelectedCustomerId("");
      setManualCustomer({
        name: r.customer.name || "",
        address: r.customer.address || "",
        street: r.customer.street || "",
        houseNumber: r.customer.houseNumber || "",
        postalCode: r.customer.postalCode || "",
        city: r.customer.city || "",
        email: r.customer.email || "",
        phone: r.customer.phone || "",
      });
    }
    setDate(r.date);
    setItems(r.items.map((it) => ({ ...it, id: uid() })));
    setNote(r.note || "");
    setVatEnabled(!!r.vatEnabled);
    setQrBillEnabled(!!r.qrBillEnabled);
    setEditingReceiptId(r.id);
    setMode("form");
    setTab("new");
  }


  async function deleteReceipt(id) {
    const next = receipts.filter((r) => r.id !== id);
    await persist(KEYS.receipts, next, setReceipts);
    if (currentReceipt && currentReceipt.id === id) {
      backToForm();
    }
  }

  async function togglePaid(id, paidValue) {
    const next = receipts.map((r) => (r.id === id ? { ...r, paid: paidValue } : r));
    await persist(KEYS.receipts, next, setReceipts);
    if (currentReceipt && currentReceipt.id === id) {
      setCurrentReceipt({ ...currentReceipt, paid: paidValue });
    }
  }

  function cancelEdit() {
    setEditingReceiptId(null);
    resetForm();
  }

  function openReceipt(r) {
    setCurrentReceipt(r);
    setMode("preview");
  }

  function backToForm() {
    setMode("form");
    setCurrentReceipt(null);
    setEditingReceiptId(null);
    resetForm();
  }

  function sendMail() {
    if (!currentReceipt) return;
    const to = currentReceipt.customer.email || "";
    const subject = encodeURIComponent(
      `Quittung Nr. ${currentReceipt.number} – ${currentReceipt.company.name || ""}`
    );
    const bodyLines = [
      `Guten Tag ${currentReceipt.customer.name}`,
      "",
      `Anbei erhalten Sie die Quittung Nr. ${currentReceipt.number} vom ${formatDateDE(
        currentReceipt.date
      )} über CHF ${chf(currentReceipt.total)}.`,
      "",
      "Bitte fügen Sie die PDF-Quittung dieser E-Mail als Anhang bei",
      "(Button „Drucken / Als PDF speichern“ → als PDF sichern → hier anhängen).",
      "",
      "Freundliche Grüsse",
      currentReceipt.company.name || "",
    ];
    const body = encodeURIComponent(bodyLines.join("\n"));
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  }

  function printReceipt() {
    const previousTitle = document.title;
    if (currentReceipt) {
      document.title = `Quittung ${currentReceipt.number} – ${currentReceipt.customer.name || ""}`.trim();
    }
    const restoreTitle = () => {
      document.title = previousTitle;
      window.removeEventListener("afterprint", restoreTitle);
    };
    window.addEventListener("afterprint", restoreTitle);
    window.print();
  }

  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [sharing, setSharing] = useState(false);

  // Web Share API (Level 2, Datei-Anhänge) nur nutzen, wenn der Browser sie
  // tatsächlich unterstützt (v.a. mobile Browser) — sonst bleibt es beim
  // bisherigen Weg über "PDF herunterladen" + manuell anhängen.
  const [canShareFiles, setCanShareFiles] = useState(false);
  useEffect(() => {
    try {
      const testFile = new File([""], "test.pdf", { type: "application/pdf" });
      setCanShareFiles(!!(navigator.canShare && navigator.canShare({ files: [testFile] })));
    } catch (e) {
      setCanShareFiles(false);
    }
  }, []);

  async function downloadPdf() {
    if (!currentReceipt) return;
    setGeneratingPdf(true);
    try {
      const pdfBytes = await buildReceiptPdfBytes(currentReceipt);
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Quittung_${currentReceipt.number}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      console.error(err);
      alert(`PDF-Erzeugung fehlgeschlagen: ${err.message}\n\nBitte nutze stattdessen 'Drucken'.`);
    } finally {
      setGeneratingPdf(false);
    }
  }

  // Teilt die Quittung direkt als PDF-Anhang über den nativen Teilen-Dialog
  // des Geräts (WhatsApp, Mail, etc.) — löst den manuellen Umweg über
  // "herunterladen, dann in der anderen App anhängen".
  async function sharePdf() {
    if (!currentReceipt) return;
    setSharing(true);
    try {
      const pdfBytes = await buildReceiptPdfBytes(currentReceipt);
      const file = new File([pdfBytes], `Quittung_${currentReceipt.number}.pdf`, {
        type: "application/pdf",
      });
      await navigator.share({
        files: [file],
        title: `Quittung Nr. ${currentReceipt.number}`,
        text: `Quittung Nr. ${currentReceipt.number} – CHF ${chf(currentReceipt.total)}`,
      });
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error(err);
        alert(`Teilen fehlgeschlagen: ${err.message}\n\nBitte nutze stattdessen 'PDF herunterladen'.`);
      }
    } finally {
      setSharing(false);
    }
  }

  function buildWhatsAppText(receipt) {
    const lines = [
      `*Quittung Nr. ${receipt.number}*`,
      receipt.company.name || "",
      "",
      `Datum: ${formatDateDE(receipt.date)}`,
      `Empfänger: ${receipt.customer.name}`,
      "",
      ...receipt.items.map((it) => `${it.description}: CHF ${chf(it.amount)}`),
      "",
    ];
    if (receipt.vatEnabled) {
      lines.push(
        `Netto: CHF ${chf(receipt.netTotal)}`,
        `MWST 8.1 %: CHF ${chf(receipt.vatAmount)}`,
        `*Total (inkl. MWST): CHF ${chf(receipt.total)}*`
      );
    } else {
      lines.push(`*Total: CHF ${chf(receipt.total)}*`);
    }
    if (receipt.note) lines.push("", `Notiz: ${receipt.note}`);
    lines.push("", "Betrag dankend erhalten.");
    if (receipt.company.name) lines.push(receipt.company.name);
    return lines.join("\n");
  }

  function sendWhatsApp() {
    if (!currentReceipt) return;
    const text = encodeURIComponent(buildWhatsAppText(currentReceipt));
    const phone = sanitizePhone(currentReceipt.customer.phone);
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (!loaded) {
    return (
      <div style={styles.loadingWrap}>
        <Loader2 className="animate-spin" size={20} color="#70747C" />
      </div>
    );
  }

  return (
    <div className="receipt-app" style={styles.appWrap}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .receipt-app { font-family: 'IBM Plex Sans', sans-serif; color: #16181D; }
        .mono { font-family: 'IBM Plex Mono', monospace; }
        .receipt-app input, .receipt-app textarea {
          font-family: 'IBM Plex Sans', sans-serif;
          border: 1px solid #DADDE1;
          padding: 8px 10px;
          font-size: 13px;
          outline: none;
          background: #fff;
          color: #16181D;
        }
        .receipt-app input:focus, .receipt-app textarea:focus { border-color: #E30613; }
        .navbtn { transition: background 0.12s ease; }
        .navbtn:hover { background: #F1F1EF; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-area { box-shadow: none !important; }
          .print-area:not(.qr-bill-page) { border: none !important; }
          .qr-bill-page { page-break-inside: avoid; break-inside: avoid; }
          .preview-wrap { padding: 0 !important; }
          @page { size: A4; margin: 0; }
        }
      `}</style>

      {mode === "form" && (
        <div style={styles.shell}>
          <nav className="no-print" style={styles.sidebar}>
            <div style={styles.brand}>
              <img src={logoImg} alt="Qwui Logo" style={styles.brandMark} />
              <div>
                <div style={styles.brandTitle}>Qwui</div>
                <div style={styles.brandSub}>Quittungen Schweiz</div>
              </div>
            </div>
            <NavItem icon={FileText} label="Neue Quittung" active={tab === "new"} onClick={() => setTab("new")} />
            <NavItem icon={Users} label="Kunden" active={tab === "customers"} onClick={() => setTab("customers")} />
            <NavItem icon={Building2} label="Firma" active={tab === "company"} onClick={() => setTab("company")} />
            <NavItem icon={History} label="Verlauf" active={tab === "history"} onClick={() => setTab("history")} />
            <NavItem icon={Wallet} label="Buchhaltung" active={tab === "accounting"} onClick={() => setTab("accounting")} />
          </nav>

          <main style={{ ...styles.main, ...(tab === "accounting" ? { maxWidth: 880 } : {}) }}>
            {tab === "new" && (
              <div style={styles.panel}>
                <Eyebrow>01 — Neue Quittung</Eyebrow>
                <h1 style={styles.h1}>
                  {editingReceiptId ? "Quittung bearbeiten" : "Neue Quittung erstellen"}
                </h1>
                {editingReceiptId && (
                  <div style={styles.editBanner}>
                    <span>
                      Du bearbeitest Quittung Nr.{" "}
                      <span className="mono">
                        {receipts.find((r) => r.id === editingReceiptId)?.number}
                      </span>
                      . Die Quittungsnummer bleibt dabei unverändert.
                    </span>
                    <button onClick={cancelEdit} style={styles.linkBtn}>
                      Abbrechen
                    </button>
                  </div>
                )}

                <FieldGroup label="Datum">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    style={{ width: 180 }}
                  />
                </FieldGroup>

                <FieldGroup label="Empfänger">
                  {customers.length > 0 && (
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => {
                        setSelectedCustomerId(e.target.value);
                        if (e.target.value) setManualCustomer(emptyPerson);
                      }}
                      style={styles.select}
                    >
                      <option value="">— gespeicherten Kunden wählen —</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {!selectedCustomerId && (
                    <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                      <input
                        placeholder="Name"
                        value={manualCustomer.name}
                        onChange={(e) => setManualCustomer({ ...manualCustomer, name: e.target.value })}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          placeholder="Strasse"
                          value={manualCustomer.street}
                          onChange={(e) => setManualCustomer({ ...manualCustomer, street: e.target.value })}
                          style={{ flex: 2 }}
                        />
                        <input
                          placeholder="Nr."
                          value={manualCustomer.houseNumber}
                          onChange={(e) => setManualCustomer({ ...manualCustomer, houseNumber: e.target.value })}
                          style={{ flex: 1 }}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          placeholder="PLZ"
                          value={manualCustomer.postalCode}
                          onChange={(e) => setManualCustomer({ ...manualCustomer, postalCode: e.target.value })}
                          style={{ flex: 1 }}
                        />
                        <input
                          placeholder="Ort"
                          value={manualCustomer.city}
                          onChange={(e) => setManualCustomer({ ...manualCustomer, city: e.target.value })}
                          style={{ flex: 2 }}
                        />
                      </div>
                      <input
                        placeholder="E-Mail"
                        value={manualCustomer.email}
                        onChange={(e) => setManualCustomer({ ...manualCustomer, email: e.target.value })}
                      />
                      <input
                        placeholder="Telefon (für WhatsApp, z.B. +41 79 123 45 67)"
                        value={manualCustomer.phone}
                        onChange={(e) => setManualCustomer({ ...manualCustomer, phone: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={saveManualCustomerToList}
                        disabled={!manualCustomer.name.trim()}
                        style={{ ...styles.secondaryBtn, opacity: manualCustomer.name.trim() ? 1 : 0.4 }}
                      >
                        <Plus size={14} /> Kunde speichern
                      </button>
                    </div>
                  )}
                  {needsAddress && !personHasAddress(activeCustomer) && (
                    <div style={styles.hint}>
                      Ab CHF 400 ist die Adresse des Käufers gesetzlich vorgeschrieben (OR Art. 958f).
                    </div>
                  )}
                </FieldGroup>

                <FieldGroup label="Leistungen">
                  <div style={{ display: "grid", gap: 8 }}>
                    {items.map((it, idx) => (
                      <div key={it.id} style={styles.itemRow}>
                        <input
                          placeholder="Beschreibung"
                          value={it.description}
                          onChange={(e) => updateItem(it.id, "description", e.target.value)}
                          style={{ flex: 1 }}
                        />
                        <div style={styles.amountWrap}>
                          <span className="mono" style={styles.chfLabel}>CHF</span>
                          <input
                            placeholder="0.00"
                            type="number"
                            step="0.01"
                            value={it.amount}
                            onChange={(e) => updateItem(it.id, "amount", e.target.value)}
                            className="mono"
                            style={{ width: 90, textAlign: "right" }}
                          />
                        </div>
                        <button
                          onClick={() => removeItem(it.id)}
                          style={styles.iconBtn}
                          disabled={items.length === 1}
                          aria-label="Position entfernen"
                        >
                          <Trash2 size={14} color={items.length === 1 ? "#CBCED2" : "#70747C"} />
                        </button>
                      </div>
                    ))}
                    <button onClick={addItem} style={styles.dashedBtn}>
                      <Plus size={14} /> Position hinzufügen
                    </button>
                  </div>

                  <button
                    onClick={() => setVatEnabled(!vatEnabled)}
                    style={styles.vatToggleRow}
                    type="button"
                  >
                    <span style={{ ...styles.vatSwitch, ...(vatEnabled ? styles.vatSwitchOn : {}) }}>
                      <span style={{ ...styles.vatSwitchKnob, ...(vatEnabled ? styles.vatSwitchKnobOn : {}) }} />
                    </span>
                    <span style={styles.vatToggleLabel}>
                      Mehrwertsteuerpflichtig <span style={styles.docMuted}>(Normalsatz 8.1 %)</span>
                    </span>
                  </button>

                  {vatEnabled ? (
                    <div style={styles.vatBreakdown}>
                      <div style={styles.vatBreakdownRow}>
                        <span>Netto</span>
                        <span className="mono">CHF {chf(netTotal)}</span>
                      </div>
                      <div style={styles.vatBreakdownRow}>
                        <span>MWST 8.1 %</span>
                        <span className="mono">CHF {chf(vatAmount)}</span>
                      </div>
                      <div style={styles.totalLine}>
                        <span>Total (inkl. MWST)</span>
                        <span className="mono" style={styles.totalAmount}>CHF {chf(total)}</span>
                      </div>
                    </div>
                  ) : (
                    <div style={styles.totalLine}>
                      <span>Total</span>
                      <span className="mono" style={styles.totalAmount}>CHF {chf(total)}</span>
                    </div>
                  )}

                  <button
                    onClick={() => setQrBillEnabled(!qrBillEnabled)}
                    style={styles.vatToggleRow}
                    type="button"
                  >
                    <span style={{ ...styles.vatSwitch, ...(qrBillEnabled ? styles.vatSwitchOn : {}) }}>
                      <span style={{ ...styles.vatSwitchKnob, ...(qrBillEnabled ? styles.vatSwitchKnobOn : {}) }} />
                    </span>
                    <span style={styles.vatToggleLabel}>
                      Bezahlbar per Rechnung <span style={styles.docMuted}>(QR-Einzahlungsschein)</span>
                    </span>
                  </button>

                  {qrBillEnabled && !isValidSwissIban(company.qrBill?.iban) && (
                    <div style={styles.hint}>
                      Dafür brauchst du eine gültige IBAN unter{" "}
                      <button
                        type="button"
                        onClick={() => setTab("company")}
                        style={{ ...styles.linkBtn, fontSize: 12 }}
                      >
                        Firma → QR-Rechnung
                      </button>
                      .
                    </div>
                  )}
                </FieldGroup>

                <FieldGroup label="Notiz (optional)">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    style={{ width: "100%", resize: "vertical" }}
                  />
                </FieldGroup>

                <button
                  onClick={createReceipt}
                  disabled={!canCreate}
                  style={{ ...styles.primaryBtn, opacity: canCreate ? 1 : 0.4 }}
                >
                  {editingReceiptId ? "Änderungen speichern" : "Quittung erstellen →"}
                </button>
              </div>
            )}

            {tab === "customers" && (
              <div style={styles.panel}>
                <Eyebrow>02 — Kunden</Eyebrow>
                <h1 style={styles.h1}>Kundenverwaltung</h1>

                <div style={{ display: "grid", gap: 8, maxWidth: 420 }}>
                  <input
                    placeholder="Name"
                    value={newCustomer.name}
                    onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      placeholder="Strasse"
                      value={newCustomer.street}
                      onChange={(e) => setNewCustomer({ ...newCustomer, street: e.target.value })}
                      style={{ flex: 2 }}
                    />
                    <input
                      placeholder="Nr."
                      value={newCustomer.houseNumber}
                      onChange={(e) => setNewCustomer({ ...newCustomer, houseNumber: e.target.value })}
                      style={{ flex: 1 }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      placeholder="PLZ"
                      value={newCustomer.postalCode}
                      onChange={(e) => setNewCustomer({ ...newCustomer, postalCode: e.target.value })}
                      style={{ flex: 1 }}
                    />
                    <input
                      placeholder="Ort"
                      value={newCustomer.city}
                      onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })}
                      style={{ flex: 2 }}
                    />
                  </div>
                  <input
                    placeholder="E-Mail"
                    value={newCustomer.email}
                    onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                  />
                  <input
                    placeholder="Telefon (für WhatsApp, z.B. +41 79 123 45 67)"
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  />
                  <button onClick={addCustomer} style={styles.secondaryBtn}>
                    <Plus size={14} /> Kunde speichern
                  </button>
                </div>

                <div style={{ marginTop: 24 }}>
                  {customers.length === 0 ? (
                    <EmptyState text="Noch keine Kunden gespeichert." />
                  ) : (
                    customers.map((c) => (
                      <div key={c.id} style={styles.listRow}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{c.name}</div>
                          {personAddressLines(c).map((l, i) => (
                            <div style={styles.muted} key={i}>{l}</div>
                          ))}
                          <div style={styles.muted}>{c.email}</div>
                          {c.phone && <div style={styles.muted}>{c.phone}</div>}
                        </div>
                        <button onClick={() => deleteCustomer(c.id)} style={styles.iconBtn}>
                          <Trash2 size={14} color="#70747C" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {tab === "company" && (
              <div style={styles.panel}>
                <Eyebrow>03 — Firma</Eyebrow>
                <h1 style={styles.h1}>Firmendaten</h1>
                <div style={{ display: "grid", gap: 8, maxWidth: 420 }}>
                  <input
                    placeholder="Firmenname"
                    value={companyDraft.name}
                    onChange={(e) => setCompanyDraft({ ...companyDraft, name: e.target.value })}
                  />
                  <input
                    placeholder="Strasse und Nr."
                    value={companyDraft.address}
                    onChange={(e) => setCompanyDraft({ ...companyDraft, address: e.target.value })}
                  />
                  <input
                    placeholder="PLZ Ort"
                    value={companyDraft.zipCity}
                    onChange={(e) => setCompanyDraft({ ...companyDraft, zipCity: e.target.value })}
                  />
                  <input
                    placeholder="E-Mail"
                    value={companyDraft.email}
                    onChange={(e) => setCompanyDraft({ ...companyDraft, email: e.target.value })}
                  />
                  <input
                    placeholder="Telefon"
                    value={companyDraft.phone}
                    onChange={(e) => setCompanyDraft({ ...companyDraft, phone: e.target.value })}
                  />
                  <input
                    placeholder="MWST-Nummer (optional, z.B. CHE-123.456.789 MWST)"
                    value={companyDraft.vatNumber}
                    onChange={(e) => setCompanyDraft({ ...companyDraft, vatNumber: e.target.value })}
                  />
                  <button onClick={saveCompany} style={styles.secondaryBtn}>
                    <Check size={14} /> Speichern
                  </button>
                  {saveStatus && <div style={styles.savedMsg}>{saveStatus}</div>}
                </div>

                <div style={{ marginTop: 32, maxWidth: 420 }}>
                  <div style={styles.fieldLabel}>QR-Rechnung (Einzahlungsschein)</div>
                  <div style={{ fontSize: 12, color: "#8B8F96", marginBottom: 12 }}>
                    Nötig, damit Kunden Quittungen per Banküberweisung mit Schweizer
                    QR-Code bezahlen können. Die Adresse muss laut aktueller
                    Vorgabe strukturiert (einzelne Felder) angegeben werden.
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    <input
                      placeholder="Name des Zahlungsempfängers (z.B. dein Privatname, falls das Konto nicht auf die Firma läuft)"
                      value={companyDraft.qrBill?.name || ""}
                      onChange={(e) =>
                        setCompanyDraft({
                          ...companyDraft,
                          qrBill: { ...(companyDraft.qrBill || {}), name: e.target.value },
                        })
                      }
                    />
                    <input
                      placeholder="IBAN (CH...)"
                      value={companyDraft.qrBill?.iban || ""}
                      onChange={(e) =>
                        setCompanyDraft({
                          ...companyDraft,
                          qrBill: { ...(companyDraft.qrBill || {}), iban: e.target.value },
                        })
                      }
                    />
                    {companyDraft.qrBill?.iban && (
                      <div
                        style={{
                          fontSize: 11,
                          color: isValidSwissIban(companyDraft.qrBill.iban) ? "#1D7A3C" : "#B00020",
                        }}
                      >
                        {isValidSwissIban(companyDraft.qrBill.iban)
                          ? "✓ Gültige Schweizer IBAN"
                          : "IBAN unvollständig oder ungültig (muss mit CH/LI beginnen, 21 Zeichen)"}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        placeholder="Strasse"
                        value={companyDraft.qrBill?.street || ""}
                        onChange={(e) =>
                          setCompanyDraft({
                            ...companyDraft,
                            qrBill: { ...(companyDraft.qrBill || {}), street: e.target.value },
                          })
                        }
                        style={{ flex: 2 }}
                      />
                      <input
                        placeholder="Nr."
                        value={companyDraft.qrBill?.houseNumber || ""}
                        onChange={(e) =>
                          setCompanyDraft({
                            ...companyDraft,
                            qrBill: { ...(companyDraft.qrBill || {}), houseNumber: e.target.value },
                          })
                        }
                        style={{ flex: 1 }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        placeholder="PLZ"
                        value={companyDraft.qrBill?.postalCode || ""}
                        onChange={(e) =>
                          setCompanyDraft({
                            ...companyDraft,
                            qrBill: { ...(companyDraft.qrBill || {}), postalCode: e.target.value },
                          })
                        }
                        style={{ flex: 1 }}
                      />
                      <input
                        placeholder="Ort"
                        value={companyDraft.qrBill?.city || ""}
                        onChange={(e) =>
                          setCompanyDraft({
                            ...companyDraft,
                            qrBill: { ...(companyDraft.qrBill || {}), city: e.target.value },
                          })
                        }
                        style={{ flex: 2 }}
                      />
                    </div>
                    <button onClick={saveCompany} style={styles.secondaryBtn}>
                      <Check size={14} /> Speichern
                    </button>
                  </div>
                </div>
              </div>
            )}

            {tab === "history" && (
              <div style={styles.panel}>
                <Eyebrow>04 — Verlauf</Eyebrow>
                <h1 style={styles.h1}>Bisherige Quittungen</h1>
                {receipts.length === 0 ? (
                  <EmptyState text="Noch keine Quittungen erstellt." />
                ) : (
                  [...receipts].reverse().map((r) => (
                    <div key={r.id} style={styles.listRow}>
                      <div>
                        <div style={{ fontWeight: 600 }}>
                          Nr. <span className="mono">{r.number}</span> · {r.customer.name}
                        </div>
                        <div style={styles.muted}>
                          {formatDateDE(r.date)} · CHF {chf(r.total)}
                          {r.editedAt ? " · bearbeitet" : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => openReceipt(r)} style={styles.secondaryBtnSmall}>
                          Öffnen
                        </button>
                        <button onClick={() => startEditReceipt(r)} style={styles.secondaryBtnSmall}>
                          Bearbeiten
                        </button>
                        <ConfirmDeleteButton onConfirm={() => deleteReceipt(r.id)} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === "accounting" && (
              <div style={styles.panel}>
                <BuchhaltungTab receipts={receipts} onTogglePaid={togglePaid} />
              </div>
            )}
          </main>
        </div>
      )}

      {mode === "preview" && currentReceipt && (
        <div className="preview-wrap" style={styles.previewWrap}>
          <div className="no-print" style={styles.previewToolbar}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={backToForm} style={styles.secondaryBtn}>
                <ArrowLeft size={14} /> Neue Quittung
              </button>
              <button onClick={() => startEditReceipt(currentReceipt)} style={styles.secondaryBtn}>
                Bearbeiten
              </button>
              <ConfirmDeleteButton
                label="Quittung löschen"
                onConfirm={() => deleteReceipt(currentReceipt.id)}
              />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={downloadPdf} style={styles.secondaryBtn} disabled={generatingPdf}>
                <Printer size={14} /> {generatingPdf ? "Erstelle PDF…" : "PDF herunterladen"}
              </button>
              <button onClick={printReceipt} style={styles.secondaryBtn}>
                Drucken
              </button>
              {canShareFiles && (
                <button onClick={sharePdf} style={styles.secondaryBtn} disabled={sharing}>
                  <Share2 size={14} /> {sharing ? "Bereite vor…" : "Teilen"}
                </button>
              )}
              <button
                onClick={sendMail}
                style={styles.primaryBtnSmall}
                disabled={!currentReceipt.customer.email}
                title={!currentReceipt.customer.email ? "Keine E-Mail-Adresse hinterlegt" : ""}
              >
                <Mail size={14} /> Per E-Mail senden
              </button>
              <button onClick={sendWhatsApp} style={styles.whatsappBtn}>
                <MessageCircle size={14} /> Per WhatsApp senden
              </button>
            </div>
          </div>
          {!currentReceipt.customer.email && (
            <div className="no-print" style={{ ...styles.hint, maxWidth: 640, margin: "0 auto 12px" }}>
              Für diesen Kunden ist keine E-Mail-Adresse hinterlegt — bitte manuell versenden.
            </div>
          )}
          {!currentReceipt.customer.phone && (
            <div className="no-print" style={{ ...styles.hint, maxWidth: 640, margin: "0 auto 12px" }}>
              Für diesen Kunden ist keine Telefonnummer hinterlegt — WhatsApp öffnet sich ohne
              vorausgewählten Kontakt, du wählst ihn dann manuell aus.
            </div>
          )}
          <div className="no-print" style={{ ...styles.hint, maxWidth: 640, margin: "0 auto 12px" }}>
            Tipp für eine saubere PDF ohne Titel/URL am Seitenrand: Im Druckdialog unten auf
            „Mehr Einstellungen" klicken und „Kopf- und Fusszeilen" abwählen.
          </div>
          <div className="no-print" style={{ ...styles.hint, maxWidth: 640, margin: "0 auto 8px" }}>
            Hinweis: „Per E-Mail senden" öffnet dein E-Mail-Programm mit vorausgefülltem Text. Da Browser aus
            Sicherheitsgründen keine automatischen Anhänge erlauben, lade die Quittung zuerst über den Button
            „PDF herunterladen" herunter und hänge sie manuell an
            {canShareFiles ? ' — oder nutze stattdessen „Teilen" (siehe unten).' : "."}
          </div>
          <div className="no-print" style={{ ...styles.hint, maxWidth: 640, margin: "0 auto 20px" }}>
            Hinweis: „Per WhatsApp senden" öffnet WhatsApp (App oder WhatsApp Web) mit fertig
            eingetragenem Text — als reine Nachricht, ohne PDF-Anhang. Welche WhatsApp-Version sich
            öffnet (privat oder Business), entscheidet dein Betriebssystem, nicht dieses Tool — ist
            nur WhatsApp Business installiert, öffnet sich automatisch diese.
          </div>
          {canShareFiles && (
            <div className="no-print" style={{ ...styles.hint, maxWidth: 640, margin: "0 auto 20px" }}>
              Tipp: Der Button „Teilen" öffnet den Teilen-Dialog deines Geräts und übergibt die
              Quittung direkt als PDF-Anhang an WhatsApp, Mail oder eine andere App — ohne den
              Umweg über „Herunterladen" und manuelles Anhängen.
            </div>
          )}

          <ReceiptDocument receipt={currentReceipt} />
          {currentReceipt.qrBillEnabled && (
            <div className="no-print" style={{ textAlign: "center", margin: "16px 0" }}>
              <span style={styles.docMuted}>↓ QR-Rechnung — wird sowohl beim PDF-Download als auch beim Drucken mit ausgegeben</span>
            </div>
          )}
          {currentReceipt.qrBillEnabled && <QrBillDocument receipt={currentReceipt} />}
        </div>
      )}
    </div>
  );
}

function ReceiptDocument({ receipt }) {
  return (
    <div className="print-area" style={styles.document}>
      <div style={styles.docHeader}>
        <div>
          <div style={styles.docCompanyName}>{receipt.company.name || "Firma"}</div>
          <div style={styles.docMuted}>{receipt.company.address}</div>
          <div style={styles.docMuted}>{receipt.company.zipCity}</div>
          <div style={styles.docMuted}>{receipt.company.email}</div>
          <div style={styles.docMuted}>{receipt.company.phone}</div>
          {receipt.company.vatNumber && (
            <div style={styles.docMuted}>MWST-Nr. {receipt.company.vatNumber}</div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={styles.docTitle}>QUITTUNG</div>
          <div className="mono" style={styles.docNumber}>Nr. {receipt.number}</div>
          <div className="mono" style={styles.docMuted}>{formatDateDE(receipt.date)}</div>
        </div>
      </div>

      <div style={styles.docRule} />

      <div style={styles.docSection}>
        <div style={styles.docLabel}>Empfänger</div>
        <div style={{ fontWeight: 600 }}>{receipt.customer.name}</div>
        {personAddressLines(receipt.customer).map((l, i) => (
          <div style={styles.docMuted} key={i}>{l}</div>
        ))}
        {receipt.customer.email && <div style={styles.docMuted}>{receipt.customer.email}</div>}
      </div>

      <div style={styles.docSection}>
        <div style={styles.docLabel}>Leistung</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6 }}>
          <tbody>
            {receipt.items.map((it) => (
              <tr key={it.id} style={{ borderBottom: "1px solid #EDEEEF" }}>
                <td style={{ padding: "6px 0", fontSize: 13 }}>{it.description}</td>
                <td className="mono" style={{ padding: "6px 0", fontSize: 13, textAlign: "right" }}>
                  CHF {chf(it.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {receipt.vatEnabled ? (
          <div style={{ marginTop: 10 }}>
            <div style={styles.vatBreakdownRow}>
              <span>Netto</span>
              <span className="mono">CHF {chf(receipt.netTotal)}</span>
            </div>
            <div style={styles.vatBreakdownRow}>
              <span>MWST 8.1 %</span>
              <span className="mono">CHF {chf(receipt.vatAmount)}</span>
            </div>
            <div style={styles.totalLine}>
              <span>Total (inkl. MWST)</span>
              <span className="mono" style={styles.totalAmount}>CHF {chf(receipt.total)}</span>
            </div>
          </div>
        ) : (
          <div style={styles.totalLine}>
            <span>Total</span>
            <span className="mono" style={styles.totalAmount}>CHF {chf(receipt.total)}</span>
          </div>
        )}
      </div>

      {receipt.note && (
        <div style={styles.docSection}>
          <div style={styles.docLabel}>Notiz</div>
          <div style={{ fontSize: 13 }}>{receipt.note}</div>
        </div>
      )}

      <div style={{ ...styles.docSection, marginTop: 24 }}>
        {receipt.qrBillEnabled ? (
          <div style={{ fontSize: 13 }}>
            Zahlbar per beiliegendem Einzahlungsschein innert 30 Tagen.
          </div>
        ) : (
          <div style={{ fontSize: 13 }}>
            Betrag dankend erhalten, {receipt.company.zipCity || "___________"}, {formatDateDE(receipt.date)}
          </div>
        )}
        <div style={styles.signatureLine}>
          <span style={styles.docMuted}>Unterschrift</span>
          <span style={{ fontStyle: "italic" }}>{receipt.company.name}</span>
        </div>
      </div>
    </div>
  );
}

function NavItem({ icon: Icon, label, active, onClick }) {
  return (
    <button
      className="navbtn"
      onClick={onClick}
      style={{
        ...styles.navBtn,
        borderLeft: active ? "3px solid #E30613" : "3px solid transparent",
        background: active ? "#F1F1EF" : "transparent",
        color: active ? "#16181D" : "#5B5F66",
      }}
    >
      <Icon size={15} />
      <span>{label}</span>
    </button>
  );
}

function Eyebrow({ children }) {
  return <div style={styles.eyebrow}>{children}</div>;
}

function FieldGroup({ label, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={styles.fieldLabel}>{label}</div>
      {children}
    </div>
  );
}

function EmptyState({ text }) {
  return <div style={styles.empty}>{text}</div>;
}

function ConfirmDeleteButton({ onConfirm, label = "Löschen" }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#B5480C" }}>Wirklich löschen?</span>
        <button
          onClick={() => {
            onConfirm();
            setConfirming(false);
          }}
          style={styles.dangerBtnSmall}
        >
          Ja, löschen
        </button>
        <button onClick={() => setConfirming(false)} style={styles.secondaryBtnSmall}>
          Abbrechen
        </button>
      </div>
    );
  }

  return (
    <button onClick={() => setConfirming(true)} style={styles.dangerOutlineBtnSmall}>
      <Trash2 size={13} /> {label}
    </button>
  );
}

const styles = {
  loadingWrap: { display: "flex", justifyContent: "center", alignItems: "center", height: 200 },
  appWrap: { minHeight: "100vh", background: "#FAFAF8" },
  shell: { display: "flex", minHeight: "100vh" },
  sidebar: {
    width: 200,
    borderRight: "1px solid #E4E5E7",
    padding: "20px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    background: "#fff",
  },
  brand: { display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", marginBottom: 18 },
  brandMark: {
    width: 30,
    height: 30,
    objectFit: "contain",
  },
  brandTitle: { fontWeight: 700, fontSize: 13, lineHeight: 1.1 },
  brandSub: { fontSize: 11, color: "#8B8F96", letterSpacing: "0.04em" },
  navBtn: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 10px",
    fontSize: 13,
    fontWeight: 500,
    border: "none",
    cursor: "pointer",
    textAlign: "left",
  },
  main: { flex: 1, padding: "40px 48px", maxWidth: 640 },
  panel: {},
  eyebrow: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    color: "#E30613",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  h1: { fontSize: 22, fontWeight: 700, margin: "0 0 28px 0" },
  fieldLabel: { fontSize: 12, fontWeight: 600, color: "#5B5F66", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.03em" },
  select: { width: "100%", padding: "8px 10px", border: "1px solid #DADDE1", fontSize: 13, background: "#fff" },
  itemRow: { display: "flex", alignItems: "center", gap: 8 },
  amountWrap: { display: "flex", alignItems: "center", gap: 4 },
  chfLabel: { fontSize: 11, color: "#8B8F96" },
  iconBtn: { border: "none", background: "transparent", cursor: "pointer", padding: 6, display: "flex" },
  dashedBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    border: "1px dashed #C7CACF",
    background: "transparent",
    color: "#5B5F66",
    fontSize: 12,
    padding: "8px 10px",
    cursor: "pointer",
    width: "fit-content",
  },
  totalLine: {
    display: "flex",
    justifyContent: "space-between",
    borderTop: "2px solid #16181D",
    marginTop: 10,
    paddingTop: 8,
    fontWeight: 600,
    fontSize: 14,
  },
  totalAmount: { color: "#E30613" },
  vatToggleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: "10px 0 0",
    width: "fit-content",
  },
  vatSwitch: {
    width: 34,
    height: 18,
    background: "#DADDE1",
    borderRadius: 999,
    position: "relative",
    transition: "background 0.15s ease",
    flexShrink: 0,
  },
  vatSwitchOn: {
    background: "#E30613",
  },
  vatSwitchKnob: {
    position: "absolute",
    top: 2,
    left: 2,
    width: 14,
    height: 14,
    borderRadius: "50%",
    background: "#fff",
    transition: "left 0.15s ease",
  },
  vatSwitchKnobOn: {
    left: 18,
  },
  vatToggleLabel: {
    fontSize: 13,
    fontWeight: 500,
    color: "#16181D",
    textAlign: "left",
  },
  vatBreakdown: {
    marginTop: 10,
  },
  vatBreakdownRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
    color: "#5B5F66",
    padding: "3px 0",
  },
  primaryBtn: {
    background: "#16181D",
    color: "#fff",
    border: "none",
    padding: "11px 20px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  primaryBtnSmall: {
    background: "#16181D",
    color: "#fff",
    border: "none",
    padding: "9px 14px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  secondaryBtn: {
    background: "#fff",
    color: "#16181D",
    border: "1px solid #DADDE1",
    padding: "9px 14px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
    width: "fit-content",
  },
  whatsappBtn: {
    background: "#25D366",
    color: "#0B2E1A",
    border: "none",
    padding: "9px 14px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  secondaryBtnSmall: {
    background: "#fff",
    color: "#16181D",
    border: "1px solid #DADDE1",
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  dangerOutlineBtnSmall: {
    background: "#fff",
    color: "#B00020",
    border: "1px solid #F0C4C9",
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 5,
  },
  dangerBtnSmall: {
    background: "#B00020",
    color: "#fff",
    border: "none",
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  editBanner: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    background: "#FDF3EC",
    border: "1px solid #F3D9C4",
    color: "#5B5F66",
    fontSize: 12,
    padding: "10px 12px",
    marginBottom: 20,
  },
  linkBtn: {
    background: "transparent",
    border: "none",
    color: "#E30613",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    textDecoration: "underline",
    padding: 0,
  },
  card: { border: "1px solid #E4E5E7", padding: 16, background: "#fff", maxWidth: 380 },
  listRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 0",
    borderBottom: "1px solid #EDEEEF",
  },
  muted: { fontSize: 12, color: "#8B8F96" },
  empty: { fontSize: 13, color: "#8B8F96", fontStyle: "italic", padding: "20px 0" },
  hint: { fontSize: 12, color: "#B5480C", background: "#FDF3EC", padding: "8px 10px", marginTop: 8 },
  savedMsg: { fontSize: 12, color: "#1D7A3C" },
  previewWrap: { padding: "40px 20px" },
  previewToolbar: {
    maxWidth: 640,
    margin: "0 auto 24px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  document: {
    maxWidth: 640,
    margin: "0 auto",
    background: "#fff",
    border: "1px solid #E4E5E7",
    padding: 40,
  },
  docHeader: { display: "flex", justifyContent: "space-between" },
  docCompanyName: { fontWeight: 700, fontSize: 15 },
  docMuted: { fontSize: 12, color: "#70747C" },
  docTitle: { fontSize: 20, fontWeight: 700, letterSpacing: "0.04em", color: "#E30613" },
  docNumber: { fontSize: 13, fontWeight: 600 },
  docRule: { height: 2, background: "#16181D", margin: "20px 0 24px" },
  docSection: { marginBottom: 22 },
  docLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#8B8F96",
    marginBottom: 4,
  },
  signatureLine: { display: "flex", justifyContent: "space-between", marginTop: 20, borderTop: "1px solid #DADDE1", paddingTop: 8 },
};
