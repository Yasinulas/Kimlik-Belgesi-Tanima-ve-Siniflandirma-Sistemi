const { parse } = require("mrz");

// ICAO 9303 formatları: TD3 (pasaport, 2x44), TD1 (kimlik arka yüz, 3x30),
// TD2 (2x36). Uzunluğa göre önce en spesifik olanı deniyoruz.
const MRZ_FORMATS = [
  { length: 44, lineCount: 2 },
  { length: 30, lineCount: 3 },
  { length: 36, lineCount: 2 },
];

const MRZ_CHAR_PATTERN = /^[A-Z0-9<]+$/;
// Türkçe OCR çıktısında (tur+eng dil paketi) MRZ bölgesine yakın metinlerde bile
// İ/Ğ/Ü/Ş/Ö/Ç gibi Türkçe harfler çıkabiliyor. Bunları [^A-Z0-9<] filtresiyle
// SİLERSEK satır 1 karakter kısalıp MRZ'nin sabit-genişlik hizası bozuluyor
// (ör. "OZDİL" -> "OZDL"), bu da tüm satırın yanlış alanlara kaymasına yol
// açıyor. Bu yüzden silmeden ÖNCE en yakın ASCII karşılığına çeviriyoruz.
const TURKISH_TO_ASCII = { İ: "I", Ğ: "G", Ü: "U", Ş: "S", Ö: "O", Ç: "C" };
function turkishToAscii(text) {
  return text.replace(/[İĞÜŞÖÇ]/g, (ch) => TURKISH_TO_ASCII[ch]);
}

const SEX_TR = { male: "Erkek", female: "Kadın" };

// mrz paketi alan adlarını İngilizce döner (lastName, nationality, sex...) —
// checksum/validasyon amaçlı checkDigit alanlarını (kullanıcıya anlamsız)
// dışarıda bırakıp geri kalanı Türkçe alan adlarıyla sunuyoruz.
function translateFields(fields) {
  const translated = {};
  if (fields.documentCode != null) translated.belgeKodu = fields.documentCode;
  if (fields.issuingState != null) translated.duzenleyenUlke = fields.issuingState;
  if (fields.lastName != null) translated.soyad = fields.lastName;
  if (fields.firstName != null) translated.ad = fields.firstName;
  if (fields.documentNumber != null) translated.belgeNo = fields.documentNumber;
  if (fields.nationality != null) translated.uyruk = fields.nationality;
  if (fields.birthDate != null) translated.dogumTarihi = formatMrzDate(fields.birthDate);
  if (fields.sex != null) translated.cinsiyet = SEX_TR[fields.sex] || fields.sex;
  if (fields.expirationDate != null) translated.sonGecerlilikTarihi = formatMrzDate(fields.expirationDate);
  if (fields.personalNumber != null) translated.kisiselNo = fields.personalNumber;
  return translated;
}

// MRZ tarihleri YYMMDD formatında (örn. "740812"). ICAO standardında yüzyılı
// belirten bir kural yok — doğum tarihleri geçmişte, son geçerlilik tarihleri
// genelde yakın gelecekte olduğu için şu anki yıla göre pratik bir sezgiyle
// yüzyılı tahmin ediyoruz (kesin garanti değil, okunabilirlik içindir).
function formatMrzDate(yymmdd) {
  if (!/^\d{6}$/.test(yymmdd)) return yymmdd;
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  const currentYY = new Date().getFullYear() % 100;
  const century = yy > currentYY + 20 ? 1900 : 2000;
  return `${dd}.${mm}.${century + yy}`;
}

// OCR'ın ham metninden MRZ (Machine Readable Zone) satırlarını bulup mrz
// paketiyle çözümler. OCR gürültülü olduğu için satır uzunluğunda ±2 tolerans
// tanır, eksik kalan satırları sondan '<' ile tamamlar/kırpar.
class MrzReader {
  static read(rawText) {
    const candidateLines = rawText
      .split("\n")
      .map((line) => turkishToAscii(line.toUpperCase()).replace(/\s+/g, "").replace(/[^A-Z0-9<]/g, ""))
      .filter((line) => line.length >= 20 && MRZ_CHAR_PATTERN.test(line));

    for (const { length, lineCount } of MRZ_FORMATS) {
      const matches = candidateLines.filter((line) => Math.abs(line.length - length) <= 2);
      if (matches.length < lineCount) continue;

      // İLK N değil SON N adayı alıyoruz: MRZ her zaman belgenin EN ALTINDA
      // basılıdır. Kart başlığı gibi metinler ("TÜRKİYE CUMHURİYETİ KİMLİK
      // KARTI" boşluksuz haliyle) tesadüfen MRZ satır uzunluğuna denk gelip
      // metnin başında sahte bir aday olarak görünebiliyor — ilk N alınırsa bu
      // sahte adaylar gerçek MRZ satırlarının önüne geçip onları dışarıda
      // bırakabiliyor. Gerçek MRZ bloğu bittikten sonra kartta başka içerik
      // basılı olmadığı için "sondan N" çok daha güvenilir.
      const lines = matches
        .slice(-lineCount)
        .map((line) => line.padEnd(length, "<").slice(0, length));

      try {
        const result = parse(lines);
        return { format: result.format, gecerli: result.valid, alanlar: translateFields(result.fields) };
      } catch {
        continue;
      }
    }

    return null;
  }
}

module.exports = { MrzReader };
