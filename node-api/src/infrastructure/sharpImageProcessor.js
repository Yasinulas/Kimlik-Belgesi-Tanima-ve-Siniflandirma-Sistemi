const sharp = require("sharp");

// PhotocopyPolicy'nin ihtiyaç duyduğu R/G/B kanal istatistiklerini (mean, stdev) ve
// ortalama renk doygunluğunu (HSV'nin S kanalı) hesaplar. sharp'a dokunan tek yer
// burası — domain katmanı bu detayı hiç bilmiyor.
async function getChannelStats(buffer) {
  const [{ channels }, saturationMean] = await Promise.all([
    sharp(buffer).stats(),
    getSaturationMean(buffer),
  ]);

  return { channels, saturationMean };
}

// sharp'ın .stats() metodu toColourspace("hsv") dönüşümünü dikkate almıyor
// (pipeline'ı değil orijinal görüntüyü ölçüyor), bu yüzden S kanalının
// ortalamasını ham pikselden kendimiz hesaplıyoruz. Performans için önce
// küçültüyoruz — sadece toplu istatistik için tam çözünürlük gerekmiyor.
async function getSaturationMean(buffer) {
  const { data, info } = await sharp(buffer)
    .resize(200, 200, { fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .toColourspace("hsv")
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelCount = info.width * info.height;
  let sum = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    sum += data[i * info.channels + 1];
  }

  return pixelCount ? sum / pixelCount : 0;
}

// ScreenshotPolicy'nin ihtiyaç duyduğu sinyalleri toplar: EXIF metadata var mı,
// dosya formatı ne ve görseldeki renk çeşitliliği ne kadar düşük (arayüzlerdeki
// düz renk bloklarını yakalamak için) — sharp'a dokunan tek yer yine burası.
//
// ÖNEMLİ: iki ayrı buffer alıyoruz. rawBuffer HAM veridir (HEIC dönüşümünden
// ÖNCE) — metadata (exif/format) buradan okunuyor çünkü heic-convert, HEIC'i
// JPEG'e çevirirken EXIF'i KORUMUYOR. Eğer metadata'yı normalizedBuffer'dan
// okusaydık, iPhone'ların varsayılan formatı olan HEIC ile çekilmiş HER GERÇEK
// FOTOĞRAF "hasExif: false" görünür ve yanlışlıkla screenshot sinyaline
// katkıda bulunurdu. sharp(rawBuffer).metadata() HEIC'te bile container'ı
// (piksel decode etmeden) okuyabiliyor (bkz. heicConverter.js), bu yüzden bu
// güvenli. uniqueColorRatio ise piksel verisi gerektirdiği için decode
// edilebilir normalizedBuffer'dan hesaplanıyor.
async function getScreenshotSignals(rawBuffer, normalizedBuffer) {
  const [metadata, uniqueColorRatio] = await Promise.all([
    sharp(rawBuffer).metadata(),
    getUniqueColorRatio(normalizedBuffer),
  ]);

  return {
    hasExif: Boolean(metadata.exif),
    format: metadata.format,
    uniqueColorRatio,
  };
}

// Görseli küçültüp her pikseli 16 seviyeye kuantize ederek kaç farklı renk
// kullanıldığını ölçer. Ekran görüntülerinde arayüz elemanları (arka plan,
// yazı alanları, butonlar) az sayıda düz renkten oluşur; gerçek fotoğraflarda
// ışık/gölge geçişleri yüzünden renk çeşitliliği çok daha yüksektir.
async function getUniqueColorRatio(buffer) {
  const { data, info } = await sharp(buffer)
    .resize(100, 100, { fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelCount = info.width * info.height;
  const seen = new Set();
  for (let i = 0; i < pixelCount; i += 1) {
    const offset = i * info.channels;
    const r = data[offset] >> 4;
    const g = data[offset + 1] >> 4;
    const b = data[offset + 2] >> 4;
    seen.add((r << 8) | (g << 4) | b);
  }

  return pixelCount ? seen.size / pixelCount : 0;
}

// OCR öncesi görseli sadeleştirir: önce EXIF yönünü düzeltir (kamera tutuşuna
// göre — görseller artık hep düz/doğru yönde geldiği için kart içeriğini AYRICA
// döndürüp deneme mantığı kaldırıldı, sadece EXIF düzeltmesi kalıyor). Ardından
// hedef genişliğe büyütür/küçültür, griye çevirir ve keskinleştirir. normalize()
// BİLEREK kullanılmıyor: gerçek kamera fotoğraflarındaki sensör gürültüsünü
// histogram germe yüzünden inanılmaz büyütüp Tesseract'ı anlamsız sembol
// çorbası üretmeye itiyordu. Tesseract'a bunu veriyoruz — sharp'a dokunan tek
// yer yine burası.
// DENENDİ VE GERİ ALINDI: median(3) ile kartın üzerindeki güvenlik desenini
// bastırmayı denedik, ama gerçek testte metni İYİLEŞTİRMEK yerine KÖTÜLEŞTİRDİ
// — desenin çizgi kalınlığı gerçek harf gövdeleriyle neredeyse aynı olduğu için
// median ikisini birden bulanıklaştırdı. normalize() için yukarıda anlatılan
// aynı ders: genel geçer bir gürültü azaltma filtresi kör kör eklemek, gerçek
// veriyle test edilmeden iyileştirme garantisi vermiyor.
async function preprocessForOcr(buffer, width = 2200) {
  return sharp(buffer)
    .rotate()
    .resize({ width, withoutEnlargement: false, fit: "inside" })
    .grayscale()
    .sharpen()
    .toBuffer();
}

// OnnxDetector'ın bulduğu belge kutusuna kırpar. ÖNEMLİ: detector kutuyu ham
// (EXIF döndürmesi uygulanmamış) piksel uzayında hesaplıyor — letterbox()
// içinde sharp(imageBytes).metadata() kullanıyor, .rotate() çağırmıyor. Bu
// yüzden burada da .rotate() ÇAĞIRMADAN, aynı ham koordinat uzayında kırpıyoruz;
// preprocessForOcr zaten kendi EXIF/ek döndürmesini kırpılmış görsel üzerinde
// ayrıca uygulayacak. Kutunun etrafına küçük bir pay bırakıyoruz çünkü detector
// kutusu bazen kenar metnini (MRZ, seri no gibi) tam sınırda kesebiliyor.
//
// Bunun asıl amacı: kırpma olmadan OCR, kartın etrafındaki tüm arka planı
// (masa, doku, desen) da tam çözünürlükte 4 farklı açıda taramak zorunda
// kalıyordu — hem işlemi ciddi şekilde yavaşlatıyor hem de desenli/dokulu
// arka planlar Tesseract'a rastgele "kelime" gibi görünüp anlamsız metin
// üretilmesine yol açıyordu.
async function cropToDetectionBox(buffer, box, paddingRatio = 0.08) {
  if (!box) return buffer;

  const { width: imgW, height: imgH } = await sharp(buffer).metadata();
  if (!imgW || !imgH) return buffer;

  const boxW = box.x2 - box.x1;
  const boxH = box.y2 - box.y1;
  if (boxW <= 0 || boxH <= 0) return buffer;

  const padX = boxW * paddingRatio;
  const padY = boxH * paddingRatio;

  const left = Math.max(0, Math.floor(box.x1 - padX));
  const top = Math.max(0, Math.floor(box.y1 - padY));
  const right = Math.min(imgW, Math.ceil(box.x2 + padX));
  const bottom = Math.min(imgH, Math.ceil(box.y2 + padY));

  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return buffer;

  return sharp(buffer).extract({ left, top, width, height }).toBuffer();
}

module.exports = { getChannelStats, getScreenshotSignals, preprocessForOcr, cropToDetectionBox };
