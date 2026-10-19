const { readLabeledFields } = require("./labelValueReader");

// TC Kimlik Kartı ön yüzünde MRZ yok — bilgiler ikili (TR/EN) etiketlerin
// altında ayrı satırda basılı. Kart üzerindeki fotoğraf/logo/güvenlik deseni
// yüzünden OCR'ın okuma sırası sık sık bozuluyor, bu da "etiketten sonraki
// satır" tahminini gerçek testlerde güvenilmez kılıyor (yanlış/karışık değer
// döndürebiliyor). Bu yüzden SADECE serbest metin olup başka türlü
// yakalanamayan soyad/adı bu şekilde okuyoruz; geri kalan alanlar kartta HER
// ZAMAN aynı sabit biçimde basıldığı için etikete bakmadan doğrudan metnin
// TAMAMINDA aranıyor — bu, OCR etiket kısmını bozsa bile çalışıyor ve yanlış
// pozitif riski çok daha düşük. Best-effort'tur — ham metin (rawText) her
// zaman ayrıca döner.
const FIELD_PATTERNS = [
  { field: "soyad", label: /soyad[ıi]\s*\/?\s*surname/i },
  { field: "ad", label: /ad[ıi]\s*\/?\s*given\s*name/i },
];

const IDENTITY_NUMBER_PATTERN = /\b\d{11}\b/;
// Seri/belge no formatı tüm örneklerde sabit: 1 harf + 2 rakam + 1 harf + 5
// rakam (ör. A47P34994, A25D67172, A12234567).
const DOCUMENT_NUMBER_PATTERN = /\b[A-Z]\d{2}[A-Z]\d{5}\b/;
// "T.C./TUR" kartta hep aynı sabit metin — noktalama OCR'da sık kayboluyor,
// bu yüzden nokta ve taksim işaretlerini opsiyonel bıraktık ("TCTUR" da eşleşir).
const NATIONALITY_PATTERN = /\bT\.?\s*C\.?\s*\/?\s*TUR\b/;
// Cinsiyet kartta "E / M" (Erkek/Male) veya "K / F" (Kadın/Female) olarak sabit
// basılı — bu bir etiket değil, değerin kendisi.
const GENDER_PATTERNS = [
  { value: "Erkek", pattern: /\bE\s*\/\s*M\b/ },
  { value: "Kadın", pattern: /\bK\s*\/\s*F\b/ },
];
const DATE_PATTERN = /\b(\d{2})\.(\d{2})\.(\d{4})\b/g;

// Doğum tarihi ve son geçerlilik tarihi ikisi de GG.AA.YYYY biçiminde ve
// hangisinin hangisi olduğunu etiketten ayırt etmek OCR gürültüsünde
// güvenilir değil. Ama basit ve HER ZAMAN doğru bir kural var: doğum tarihi
// her zaman son geçerlilik tarihinden ÖNCE gelir (bugünün tarihine bakmaya
// gerek yok). Metinde tam olarak 2 tarih varsa (beklenen durum) bu kurala
// göre ayırıyoruz; 0, 1 veya 3+ tarih bulunursa (OCR gürültüsü fazladan
// tarih-benzeri parça üretmiş olabilir) yanlış atama yapmamak için hiçbirini
// döndürmüyoruz.
function extractDates(rawText) {
  const matches = [...rawText.matchAll(DATE_PATTERN)].map((m) => ({
    text: m[0],
    value: new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])),
  }));
  if (matches.length !== 2) return {};

  const [earlier, later] = matches.sort((a, b) => a.value - b.value);
  return { dogumTarihi: earlier.text, sonGecerlilikTarihi: later.text };
}

class IdCardFrontFieldReader {
  static read(rawText) {
    const fields = readLabeledFields(rawText, FIELD_PATTERNS);

    const identityNumberMatch = rawText.match(IDENTITY_NUMBER_PATTERN);
    if (identityNumberMatch) fields.tcKimlikNo = identityNumberMatch[0];

    const documentNumberMatch = rawText.match(DOCUMENT_NUMBER_PATTERN);
    if (documentNumberMatch) fields.seriNo = documentNumberMatch[0];

    if (NATIONALITY_PATTERN.test(rawText)) fields.uyruk = "TC/TUR";

    const genderMatch = GENDER_PATTERNS.find(({ pattern }) => pattern.test(rawText));
    if (genderMatch) fields.cinsiyet = genderMatch.value;

    Object.assign(fields, extractDates(rawText));

    return fields;
  }
}

module.exports = { IdCardFrontFieldReader };
