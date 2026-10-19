// className -> Türkçe etiket + belge tipi + yüz. Tek doğru kaynak burası.
// Pasaportta model ön/arka ayrımını öğrenmediği için "side" hiç dönmez —
// bu kural burada bir kere yazılır, hem analiz anında hem geçmiş kayıtları okunurken kullanılır.
const CLASSES = {
  none_valid:      { label: "Geçerli Doküman Yok",        documentCategory: null,             side: null },
  tr_card_foreign: { label: "Yabancı Cisim Tespit Edildi", documentCategory: null,             side: null },
  tr_driver_back:  { label: "Ehliyet (Arka Yüz)",          documentCategory: "driver_license", side: "back" },
  tr_driver_front: { label: "Ehliyet (Ön Yüz)",            documentCategory: "driver_license", side: "front" },
  tr_id_back:      { label: "TC Kimlik Kartı (Arka Yüz)",  documentCategory: "id_card",        side: "back" },
  tr_id_front:     { label: "TC Kimlik Kartı (Ön Yüz)",    documentCategory: "id_card",        side: "front" },
  tr_passport:     { label: "Pasaport",                    documentCategory: "passport",       side: null },
};

class DocumentCategory {
  static labelFor(className) {
    return CLASSES[className]?.label || className;
  }

  static infoFor(className) {
    const info = CLASSES[className] || { documentCategory: null, side: null };
    if (info.documentCategory === "passport") {
      return { documentCategory: "passport" };
    }
    return { documentCategory: info.documentCategory, side: info.side };
  }

  static shouldShowSide(documentCategory) {
    return documentCategory !== "passport";
  }

  static allClasses() {
    return Object.entries(CLASSES).map(([code, { label }]) => ({ code, label }));
  }
}

module.exports = { DocumentCategory };
