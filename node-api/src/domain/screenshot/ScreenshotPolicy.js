// DENENDİ VE GERİ ALINDI (2 farklı sürüm): Önce MIN_SIGNALS=3 (üçünün de
// gerekmesi) denendi — teorik olarak mantıklıydı ama gerçek bir macOS ekran
// görüntüsünde hasExif TRUE çıktığı için (macOS bazı meta veriyi screenshot
// PNG'lerine de gömüyor) gerçek bir ekran görüntüsünü YAKALAYAMAMA riskine
// yol açtı. Sonra MIN_SIGNALS=2'ye (üç sinyalden herhangi ikisi) dönüldü —
// ama bu da TERS yönde sorun çıkardı: EXIF'i paylaşım/format dönüşümüyle
// silinmiş VE düşük renk çeşitliliğine sahip gerçek fotoğraflar (ör. PNG'ye
// çevrilmiş gerçek pasaport fotoğrafları) format PNG olmasa bile sadece
// "EXIF yok + düşük renk çeşitliliği" ikilisiyle yanlışlıkla screenshot
// sayılabiliyordu — hatta format PNG olduğunda (gerçek fotoğraf birisi
// tarafından PNG'ye çevrilmiş olsa bile) bu iki sinyal kolayca tetikleniyordu.
//
// GERÇEK VERİYLE DOĞRULANAN SON KURAL: format===png'yi opsiyonel bir sinyal
// olmaktan çıkarıp ZORUNLU ön koşul yaptık, ardından diğer iki sinyalden en
// az birini istiyoruz. Gerekçe: gerçek kamera fotoğrafları (JPEG/HEIC/WEBP)
// PRATİKTE NEREDEYSE HİÇ PNG olarak çekilmez/paylaşılmaz — ekran görüntüsü
// araçları ise varsayılan olarak PNG kullanır. Bu kural, test edilen TÜM
// klasörlerdeki (kimlik/ehliyet/pasaport) gerçek fotoğraflarda (format
// jpeg/webp olduğu için) hiç yanlış tetiklenmedi, üstelik gerçek bir macOS
// ekran görüntüsünü de doğru yakaladı.
const UNIQUE_COLOR_RATIO_THRESHOLD = 0.15;

class ScreenshotPolicy {
  static decide({ hasExif, format, uniqueColorRatio } = {}) {
    if (format !== "png") return false;
    return !hasExif || uniqueColorRatio <= UNIQUE_COLOR_RATIO_THRESHOLD;
  }
}

module.exports = { ScreenshotPolicy };
