// Ortak yardımcı: TR/EN etiketin altında ayrı satırda değer basılı olan kart
// yüzlerinde (ön/arka) kullanılır. Etiketi bulup bir sonraki dolu satırı değer
// olarak alır. TEK FARKI: o "sonraki satır" kendisi de BİLİNEN bir etiket
// kalıbına uyuyorsa (OCR sırası karışıp iki etiket art arda gelmiş, gerçek
// değer bir satır sonraya kaymış olabilir) onu atlayıp bir sonrakine bakar.
// Best-effort bir çıkarımdır, garanti vermez — ham metin ayrıca döner.
function readLabeledFields(rawText, fieldPatterns) {
  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const fields = {};

  fieldPatterns.forEach(({ field, label }) => {
    const idx = lines.findIndex((line) => label.test(line));
    if (idx === -1) return;

    let valueIdx = idx + 1;
    while (valueIdx < lines.length && fieldPatterns.some(({ label: l }) => l.test(lines[valueIdx]))) {
      valueIdx += 1;
    }
    if (lines[valueIdx]) fields[field] = lines[valueIdx];
  });

  return fields;
}

module.exports = { readLabeledFields };
