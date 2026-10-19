// Domain seviyesinde bir hata tipi: "girdi çözümlenemedi" gibi kullanıcı hatalarını
// altyapı hatalarından (örn. model çökmesi) ayırt etmek için hem infrastructure
// (OnnxDetector) hem application (AnalyzeDocumentUseCase) katmanı bu sınıfı bilir.
class ValueError extends Error {}

module.exports = { ValueError };
