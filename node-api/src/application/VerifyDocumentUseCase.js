// Ehliyette MRZ yok ve etiket düzeni kimlikten farklı — OCR desteği şimdilik
// sadece kimlik ve pasaport için var, ehliyet bilinçli olarak dışarıda tutuluyor.
const OCR_SUPPORTED_CATEGORIES = new Set(["id_card", "passport"]);

// Use case: "bir görsel geçerli mi?" akışını uçtan uca yönetir. Sırayla
// AnalyzeDocumentUseCase -> CheckPhotocopyUseCase -> CheckScreenshotUseCase
// çağırır. Belge tipi tanınmazsa ya da fotokopiyse süreç orada durur.
// CheckScreenshotUseCase de çalışır ve sonucu (isScreenshot) response'ta
// döner ama artık süreci DURDURMUYOR (bkz. aşağıdaki not) — belge tipi
// geçerliyse OCR her zaman çalışır. Son adımda ExtractDocumentInfoUseCase ile
// kimlik bilgileri (MRZ + alanlar) okunur. Her use case kendi kaydını kendi
// tablosuna yazmaya devam eder — burası sadece sırayı ve erken çıkışı yönetir.
class VerifyDocumentUseCase {
  constructor({ analyzeDocumentUseCase, checkPhotocopyUseCase, checkScreenshotUseCase, extractDocumentInfoUseCase }) {
    this.analyzeDocumentUseCase = analyzeDocumentUseCase;
    this.checkPhotocopyUseCase = checkPhotocopyUseCase;
    this.checkScreenshotUseCase = checkScreenshotUseCase;
    this.extractDocumentInfoUseCase = extractDocumentInfoUseCase;
  }

  async execute(imageInput, conf = 0.25) {
    const analysis = await this.analyzeDocumentUseCase.execute(imageInput, conf);

    if (!analysis.isValidDocument) {
      return {
        status: "success",
        passed: false,
        failedAt: "document_type",
        documentAnalysis: analysis,
        isPhotocopy: null,
        isScreenshot: null,
        extractedInfo: null,
      };
    }

    const { isPhotocopy } = await this.checkPhotocopyUseCase.execute(imageInput);
    if (isPhotocopy) {
      return {
        status: "success",
        passed: false,
        failedAt: "photocopy",
        documentAnalysis: analysis,
        isPhotocopy,
        isScreenshot: null,
        extractedInfo: null,
      };
    }

    // Ekran görüntüsü kontrolü artık akışı DURDURMUYOR — sadece bilgi olarak
    // dönüyor (isScreenshot alanı). Sebebi: sinyaller (EXIF/format/renk
    // çeşitliliği) formatla o kadar iç içe ki gerçek dosyaları (özellikle PNG
    // olarak paylaşılan/kaydedilen gerçek fotoğrafları) güvenilir şekilde
    // ayırt edemiyordu — gerçek testte geçerli pasaport/kimlik fotoğrafları
    // format yüzünden OCR'a hiç ulaşamıyordu. Format ne olursa olsun (JPEG,
    // PNG, fark etmez) belge tipi doğruysa OCR her zaman çalışır.
    const { isScreenshot } = await this.checkScreenshotUseCase.execute(imageInput);

    const { documentCategory, documentType } = analysis.topPrediction;
    // Detector'ın bulduğu en iyi tahminin kutusu — OCR'ı sadece kart bölgesine
    // sınırlamak için ExtractDocumentInfoUseCase'e iletiyoruz (bkz. o dosyadaki
    // box parametresi açıklaması).
    const topBox = analysis.detections[0]?.box || null;
    const extractedInfo = OCR_SUPPORTED_CATEGORIES.has(documentCategory)
      ? await this.extractDocumentInfoUseCase.execute(imageInput, documentType, topBox)
      : null;

    return {
      status: "success",
      passed: true,
      failedAt: null,
      documentAnalysis: analysis,
      isPhotocopy,
      isScreenshot,
      extractedInfo,
    };
  }
}

module.exports = { VerifyDocumentUseCase };
