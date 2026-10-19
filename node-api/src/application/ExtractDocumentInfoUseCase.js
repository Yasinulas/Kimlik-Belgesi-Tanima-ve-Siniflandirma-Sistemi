const { Base64Image } = require("../domain/shared/Base64Image");
const { normalizeImageBuffer } = require("../infrastructure/heicConverter");
const { cropToDetectionBox } = require("../infrastructure/sharpImageProcessor");
const { MrzReader } = require("../domain/documentOcr/MrzReader");
const { IdCardFrontFieldReader } = require("../domain/documentOcr/IdCardFrontFieldReader");
const { IdCardBackFieldReader } = require("../domain/documentOcr/IdCardBackFieldReader");

// MRZ (Machine Readable Zone) taşıyan yüzler: kimlik arka yüzü ve pasaport.
// Pasaportta isim/soyisim/uyruk/cinsiyet zaten MRZ'nin kendi alanlarında gelir
// (mrz paketi firstName/lastName/nationality/sex olarak döner), ayrı bir etiket
// okuma gerekmez.
const MRZ_DOCUMENT_TYPES = new Set(["tr_id_back", "tr_passport"]);
// Etiket/değer eşleşmesiyle okunan yüzler: kimlik ön yüzü (MRZ yok) ve kimlik
// arka yüzü (MRZ'nin yanında anne/baba adı, veren makam gibi ek alanlar için).
const FRONT_FIELD_DOCUMENT_TYPES = new Set(["tr_id_front"]);
const BACK_FIELD_DOCUMENT_TYPES = new Set(["tr_id_back"]);

// Use case: "bu görselden kimlik bilgilerini oku" akışını yönetir. ocrProvider
// enjekte edilen port — bu sınıf tesseract'ı bilmez. Ehliyet bu akışa hiç
// girmez, çağıran taraf (VerifyDocumentUseCase) documentCategory'ye göre karar verir.
class ExtractDocumentInfoUseCase {
  constructor({ ocrProvider }) {
    this.ocrProvider = ocrProvider;
  }

  // box: AnalyzeDocumentUseCase'in bulduğu belge kutusu ({x1,y1,x2,y2}, ham
  // piksel uzayında). Verilirse OCR'a fotoğrafın tamamı yerine sadece kartın
  // olduğu bölge gider — hem çok daha hızlı olur hem de kartın etrafındaki
  // arka planın (masa, doku vb.) yanlışlıkla metin gibi okunmasını engeller.
  async execute(imageInput, documentType, box = null) {
    const { buffer: rawBuffer } = new Base64Image(imageInput, "image");
    let buffer = await normalizeImageBuffer(rawBuffer);
    // GEÇİCİ TEŞHİS LOGU — kırpmanın gerçekten devreye girip girmediğini ve
    // detector'ın bu görsel için ne kutusu bulduğunu görmek için. Sorun
    // netleşince kaldırılabilir.
    console.log("[OCR-debug] box:", box, "| kırpma öncesi buffer boyutu:", buffer.length);
    if (box) {
      buffer = await cropToDetectionBox(buffer, box);
      console.log("[OCR-debug] kırpma sonrası buffer boyutu:", buffer.length);
    } else {
      console.log("[OCR-debug] box gelmedi, TAM GÖRSEL OCR'a gidiyor");
    }
    // MRZ ağırlıklı yüzler (kimlik arkası, pasaport) tek düzgün blok halinde
    // — gerçek testte bu yüzlerde SPARSE_TEXT PSM'i belirgin şekilde daha iyi
    // sonuç verdi (bkz. tesseractOcrProvider.js'teki not). Ön yüzde tam tersi
    // olduğu için sadece MRZ taşıyan tiplerde true gönderiyoruz.
    const hasMrz = MRZ_DOCUMENT_TYPES.has(documentType);
    console.time("[OCR-debug] recognizeText süresi");
    const rawText = await this.ocrProvider(buffer, { sparseText: hasMrz });
    console.timeEnd("[OCR-debug] recognizeText süresi");

    const mrz = hasMrz ? MrzReader.read(rawText) : null;

    let fields = null;
    if (FRONT_FIELD_DOCUMENT_TYPES.has(documentType)) {
      fields = IdCardFrontFieldReader.read(rawText);
    } else if (BACK_FIELD_DOCUMENT_TYPES.has(documentType)) {
      fields = IdCardBackFieldReader.read(rawText);
    }

    return { mrz, fields, rawText };
  }
}

module.exports = { ExtractDocumentInfoUseCase };
