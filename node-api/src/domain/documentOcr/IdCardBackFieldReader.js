const { readLabeledFields } = require("./labelValueReader");

// TC Kimlik Kartı arka yüzünde MRZ'nin yanında etiketli alanlar da olabilir:
// Anne Adı, Baba Adı, Veren Makam. Not: bu alanların yeni (çipli) kimlik
// kartının arka yüzünde fiziksel olarak basılı olup olmadığından emin
// değiliz — eski nüfus cüzdanında vardı. Etiket OCR metninde bulunamazsa
// ilgili alan basitçe boş kalır, hata vermez; rawText her zaman fallback'tir.
const FIELD_PATTERNS = [
  { field: "anneAdi", label: /anne\s*ad[ıi]\s*\/?\s*mother'?s?\s*name/i },
  { field: "babaAdi", label: /baba\s*ad[ıi]\s*\/?\s*father'?s?\s*name/i },
  // Gerçek kartlarda etiket "Veren Makam / Issued By" — "Issuing Authority"
  // değil (eski tasarım ihtimaline karşı ikisini de kabul ediyoruz).
  { field: "verenMakam", label: /veren\s*makam\s*\/?\s*(issued\s*by|issuing\s*authority)/i },
];

class IdCardBackFieldReader {
  static read(rawText) {
    return readLabeledFields(rawText, FIELD_PATTERNS);
  }
}

module.exports = { IdCardBackFieldReader };
