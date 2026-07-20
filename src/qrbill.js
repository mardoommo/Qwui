// Erzeugt den "Swiss Payments Code" (SPC) — die exakte Textstruktur, die im
// Swiss QR Code codiert wird, gemäss "Swiss Implementation Guidelines QR-bill"
// (SIX Interbank Clearing, aktuell Version 2.3/2.4).
//
// Wichtig, Stand der Vorgaben (berücksichtigt in diesem Code):
// - Seit 22.11.2025 ist NUR NOCH die strukturierte Adresse (Typ "S") zulässig,
//   keine kombinierte Adresse (Typ "K") mehr.
// - Referenztyp: Wir verwenden "SCOR" (ISO-11649-Kreditorreferenz, "RF..."),
//   damit die Quittungs-/Rechnungsnummer im offiziellen Referenz-Feld steht —
//   das funktioniert mit jeder gewöhnlichen IBAN (im Gegensatz zu "QRR", das
//   eine spezielle QR-IBAN voraussetzen würde, die die meisten
//   Kleinunternehmen/Freelancer nicht haben).
// - Der Schuldner (Zahlbar durch) bleibt leer, falls keine strukturierten
//   Kundendaten vorliegen — das ist laut Spezifikation zulässig (optional).

export function cleanIban(iban) {
  return (iban || "").replace(/\s+/g, "").toUpperCase();
}

export function formatIbanDisplay(iban) {
  const clean = cleanIban(iban);
  return clean.replace(/(.{4})/g, "$1 ").trim();
}

export function isValidSwissIban(iban) {
  const clean = cleanIban(iban);
  if (!/^(CH|LI)\d{2}[A-Z0-9]{17}$/.test(clean)) return false;
  // IBAN-Prüfziffer (Mod-97, ISO 7064)
  const rearranged = clean.slice(4) + clean.slice(0, 4);
  const numeric = rearranged
    .split("")
    .map((ch) => (/[0-9]/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)))
    .join("");
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    remainder = Number(String(remainder) + numeric.substr(i, 7)) % 97;
  }
  return remainder === 1;
}

// ISO 7064 Mod-97-10 Prüfziffernberechnung, wie sie auch für IBANs verwendet
// wird — hier angewendet auf eine ISO-11649-Kreditorreferenz ("RF...").
function mod97(numericString) {
  let remainder = 0;
  for (let i = 0; i < numericString.length; i += 7) {
    remainder = Number(String(remainder) + numericString.substr(i, 7)) % 97;
  }
  return remainder;
}

function lettersToDigits(str) {
  return str
    .split("")
    .map((ch) => (/[0-9]/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)))
    .join("");
}

/**
 * Baut eine gültige ISO-11649-Kreditorreferenz ("RF" + 2 Prüfziffern + Text)
 * aus einem beliebigen Referenztext (z.B. der Quittungsnummer). Funktioniert
 * mit jeder normalen IBAN, keine QR-IBAN nötig.
 */
export function buildCreditorReference(refText) {
  const cleaned = (refText || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!cleaned) return "";
  // Prüfziffer: Referenz + "RF00" anhängen, Buchstaben -> Zahlen, Mod 97, Prüfziffer = 98 - Rest
  const withPlaceholder = lettersToDigits(cleaned + "RF00");
  const checkDigits = String(98 - mod97(withPlaceholder)).padStart(2, "0");
  return `RF${checkDigits}${cleaned}`;
}

export function formatReferenceDisplay(ref) {
  return (ref || "").replace(/(.{4})/g, "$1 ").trim();
}

function formatAmount(amount) {
  const num = Number(amount);
  if (!num || num <= 0) return "";
  return num.toFixed(2);
}

function line(value) {
  return (value || "").toString().trim();
}

/**
 * Baut den vollständigen SPC-Text für den Swiss QR Code.
 *
 * @param {object} params
 * @param {string} params.iban
 * @param {object} params.creditor - { name, street, houseNumber, postalCode, city, country }
 * @param {number} params.amount
 * @param {string} params.currency - "CHF" | "EUR"
 * @param {object} [params.debtor] - { name, street, houseNumber, postalCode, city, country }
 * @param {string} [params.referenceText] - Text für die Referenznummer (z.B. Quittungsnummer "0007")
 * @param {string} [params.message] - unstrukturierte Mitteilung
 */
export function buildSwissQrPayload({
  iban,
  creditor,
  amount,
  currency = "CHF",
  debtor,
  referenceText,
  message,
}) {
  const cleanedIban = cleanIban(iban);

  const creditorLines = [
    cleanedIban,
    "S",
    line(creditor.name),
    line(creditor.street),
    line(creditor.houseNumber),
    line(creditor.postalCode),
    line(creditor.city),
    line(creditor.country || "CH"),
  ];

  const ultimateCreditorLines = ["", "", "", "", "", "", ""]; // reserviert, nicht verwenden

  const hasDebtor = debtor && debtor.name && debtor.postalCode && debtor.city;
  const debtorLines = hasDebtor
    ? [
        "S",
        line(debtor.name),
        line(debtor.street),
        line(debtor.houseNumber),
        line(debtor.postalCode),
        line(debtor.city),
        line(debtor.country || "CH"),
      ]
    : ["", "", "", "", "", "", ""];

  const creditorReference = referenceText ? buildCreditorReference(referenceText) : "";
  const referenceType = creditorReference ? "SCOR" : "NON";

  const lines = [
    "SPC", // QRType
    "0200", // Version
    "1", // Coding (UTF-8)
    ...creditorLines,
    ...ultimateCreditorLines,
    formatAmount(amount),
    currency,
    ...debtorLines,
    referenceType,
    creditorReference,
    line(message).slice(0, 140),
    "EPD", // Trailer, Ende der Zahlungsdaten
  ];

  return lines.join("\r\n");
}
