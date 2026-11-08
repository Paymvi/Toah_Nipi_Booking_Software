/*
  FICTIONAL test documents for online signing. Nothing here is a real Toah
  Nipi contract or policy: the sample agreement is labeled on every page.
  Generated at test time so no large file is committed.
*/
import zlib from "node:zlib";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";

const LETTER = [612, 792];
const A4 = [595.28, 841.89];

async function textDocument({ pages, size, title, label, signatureBlock = true }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (let number = 1; number <= pages; number += 1) {
    const page = pdf.addPage(size);
    const [, height] = size;
    page.drawText(label, { x: 54, y: height - 40, size: 9, font: bold, color: rgb(0.7, 0, 0) });
    page.drawText(`${title} - page ${number} of ${pages}`, { x: 54, y: height - 70, size: 14, font: bold });
    for (let line = 0; line < 38; line += 1) {
      page.drawText(`Section ${number}.${line + 1}  Fictional placeholder wording for testing only. No real terms.`, {
        x: 54,
        y: height - 100 - line * 16,
        size: 9.5,
        font,
      });
    }
    if (signatureBlock && number === pages) {
      page.drawText("Printed name: ______________________   Signature: ______________________   Date: ________", {
        x: 54,
        y: 90,
        size: 9,
        font,
      });
    }
  }
  return pdf.save();
}

export function sampleContract() {
  return textDocument({
    pages: 4,
    size: LETTER,
    title: "SAMPLE AGREEMENT - NOT A REAL CONTRACT",
    label: "FICTIONAL SAMPLE FOR SOFTWARE TESTING - NOT A TOAH NIPI CONTRACT",
  });
}

export function samplePolicyA4() {
  return textDocument({
    pages: 2,
    size: A4,
    title: "Sample Guest House Rules (fictional)",
    label: "FICTIONAL SAMPLE FOR SOFTWARE TESTING",
  });
}

export function manyPages(pages = 400) {
  return textDocument({
    pages,
    size: LETTER,
    title: "Long fictional handbook",
    label: "FICTIONAL SAMPLE FOR SOFTWARE TESTING",
    signatureBlock: false,
  });
}

export async function rotatedLastPage() {
  const pdf = await PDFDocument.load(await samplePolicyA4());
  pdf.getPage(pdf.getPageCount() - 1).setRotation(degrees(90));
  return pdf.save();
}

function encodePng(width, height, raw, level) {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(typed));
    return Buffer.concat([length, typed, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// A noise image cannot be compressed, so this behaves like a large scanned document.
function noisePng(width, height, seed) {
  let state = seed >>> 0;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let index = 0; index < raw.length; index += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    raw[index] = index % (width * 3 + 1) === 0 ? 0 : state >>> 24;
  }
  return encodePng(width, height, raw, 1);
}

export async function largeScannedPdf({ pages = 12, side = 520 } = {}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (let number = 0; number < pages; number += 1) {
    const page = pdf.addPage(LETTER);
    const image = await pdf.embedPng(noisePng(side, side, number + 1));
    page.drawImage(image, { x: 46, y: 160, width: 520, height: 520 });
    page.drawText("FICTIONAL LARGE TEST DOCUMENT", { x: 54, y: 740, size: 12, font, color: rgb(0.7, 0, 0) });
  }
  return pdf.save();
}

export function drawingPng(width = 600, height = 180) {
  // A simple dark diagonal stroke on a transparent-looking white background.
  const raw = Buffer.alloc((width * 3 + 1) * height, 255);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x += 1) {
      const onStroke = Math.abs(y - (height * x) / width) < 3 || Math.abs(y - height / 2 - 20 * Math.sin(x / 25)) < 2;
      if (onStroke) raw.fill(30, y * (width * 3 + 1) + 1 + x * 3, y * (width * 3 + 1) + 4 + x * 3);
    }
  }
  return encodePng(width, height, raw, 6);
}

export function drawingDataUrl() {
  return `data:image/png;base64,${drawingPng().toString("base64")}`;
}
