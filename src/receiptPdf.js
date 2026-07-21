// Baut fertige PDF-Bytes aus einer Quittung — für die normale Quittungs-PDF
// und die Mahnungs-PDF gemeinsam genutzt, da beide dieselbe QR-Zahlungsdaten-
// Aufbereitung (QR-Code-Bild + Referenznummer) brauchen. Wird sowohl vom
// Download-/Teilen-Button in App.jsx als auch vom "Mahnung erstellen"-Button
// in BuchhaltungTab.jsx verwendet.

import QRCode from "qrcode";
import { generateReceiptPdf, generateMahnungPdf } from "./pdfGenerator.js";
import { buildSwissQrPayload, buildCreditorReference, formatReferenceDisplay } from "./qrbill.js";

function dataUrlToUint8Array(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function buildReceiptQrData(receipt) {
  if (!receipt.qrBillEnabled) {
    return { qrPngBytes: null, referenceDisplay: "", qrIban: "", qrCreditor: {} };
  }

  const company = receipt.company || {};
  const qr = company.qrBill || {};
  const qrIban = qr.iban || "";
  const qrCreditor = {
    name: qr.name || company.name,
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
  const referenceDisplay = formatReferenceDisplay(creditorReference);

  const dataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 0,
    width: 480,
    color: { dark: "#000000", light: "#ffffff" },
  });

  return { qrPngBytes: dataUrlToUint8Array(dataUrl), referenceDisplay, qrIban, qrCreditor };
}

export async function buildReceiptPdfBytes(receipt) {
  const qrData = await buildReceiptQrData(receipt);
  const enrichedReceipt = {
    ...receipt,
    referenceDisplay: qrData.referenceDisplay,
    qrIban: qrData.qrIban,
    qrCreditor: qrData.qrCreditor,
  };
  return generateReceiptPdf(enrichedReceipt, qrData.qrPngBytes);
}

export async function buildMahnungPdfBytes(receipt) {
  const qrData = await buildReceiptQrData(receipt);
  const enrichedReceipt = {
    ...receipt,
    referenceDisplay: qrData.referenceDisplay,
    qrIban: qrData.qrIban,
    qrCreditor: qrData.qrCreditor,
  };
  return generateMahnungPdf(enrichedReceipt, qrData.qrPngBytes);
}
