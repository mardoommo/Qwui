// API-Endpunkt: POST /api/generate-pdf
// Erzeugt die komplette Quittung (+ QR-Rechnung, falls aktiviert) als fertiges
// PDF, komplett selbst layoutet (nicht über Browser-Druck). Dadurch ist die
// Position der QR-Rechnung am unteren Seitenrand garantiert exakt korrekt.
//
// Geschützt durch dieselbe functions/_middleware.js wie der Rest der Seite.

import QRCode from "qrcode";
import { generateReceiptPdf } from "../_lib/pdfGenerator.js";
import { buildSwissQrPayload, buildCreditorReference, formatReferenceDisplay } from "../../src/qrbill.js";

export async function onRequestPost(context) {
  try {
    const { request } = context;
    const receipt = await request.json();

    let qrPngBytes = null;
    let referenceDisplay = "";
    let qrIban = "";
    let qrCreditor = {};

    if (receipt.qrBillEnabled) {
      const company = receipt.company || {};
      const qr = company.qrBill || {};
      qrIban = qr.iban || "";
      qrCreditor = {
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
      referenceDisplay = formatReferenceDisplay(creditorReference);

      qrPngBytes = await QRCode.toBuffer(payload, {
        errorCorrectionLevel: "M",
        margin: 0,
        width: 480,
        color: { dark: "#000000", light: "#ffffff" },
      });
    }

    const enrichedReceipt = { ...receipt, referenceDisplay, qrIban, qrCreditor };
    const pdfBytes = await generateReceiptPdf(enrichedReceipt, qrPngBytes);

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Quittung_${receipt.number || "0000"}.pdf"`,
      },
    });
  } catch (err) {
    console.error("PDF-Erzeugung fehlgeschlagen", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
