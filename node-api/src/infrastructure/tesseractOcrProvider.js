const { createWorker, PSM } = require("tesseract.js");
const { preprocessForOcr } = require("./sharpImageProcessor");

// Tesseract'ın kendi confidence skoru güvenilir değil (neredeyse hiçbir şey
// okuyamadığında bile yüksek değer dönebiliyor). Toplam harf/rakam SAYISI da
// güvenilmez: yanlış açıda okunan gürültü, birbirinden kopuk tek-iki karakterlik
// parçacıklardan oluştuğu için toplamda gerçek metinden bile daha "yüksek"
// sayıya ulaşabiliyor. Bunun yerine en UZUN ardışık anlamlı kelime/token'a
// bakıyoruz — gerçek metin (isim, MRZ satırı) kesintisiz uzun bir dizidir,
// gürültü ise kısa parçacıklara bölünmüş olur.
const MIN_TOKEN_LENGTH = 10;
const TOKEN_SPLIT_PATTERN = /[^A-Za-z0-9çğıöşüÇĞİÖŞÜ<]+/;

async function runOcrPass(buffer, width, sparseText) {
  const preprocessed = await preprocessForOcr(buffer, width);

  // GEÇİCİ TEŞHİS LOGU — worker kurulumu (dil verisi yükleme) mı yoksa
  // recognize() (asıl OCR) mı yavaş, ayırt etmek için. Sorun netleşince
  // kaldırılabilir.
  const t0 = Date.now();
  const worker = await createWorker("tur+eng");
  // Gerçek testlerde iki belge yüzü FARKLI PSM istiyor: MRZ ağırlıklı yüzler
  // (kimlik arkası, pasaport) tek düzgün blok olduğu için SPARSE_TEXT'te çok
  // daha temiz/doğru çıkıyor (checksum'u geçen MRZ'ler bunda alındı); ön yüz
  // ise fotoğraf/logo/dağınık etiket-değer çiftleri yüzünden SPARSE_TEXT'te
  // ciddi kötüleşiyor, varsayılan AUTO'da daha okunaklı. Hangi belge yüzü
  // olduğu (dolayısıyla hangi PSM'in seçileceği) çağıran taraftan (bkz.
  // ExtractDocumentInfoUseCase) `sparseText` parametresiyle geliyor.
  if (sparseText) await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
  const t1 = Date.now();
  try {
    const { data } = await worker.recognize(preprocessed);
    const t2 = Date.now();
    console.log(
      `[OCR-debug] width=${width} sparseText=${Boolean(sparseText)} worker-kurulum=${t1 - t0}ms recognize=${t2 - t1}ms toplam=${t2 - t0}ms`
    );
    return data.text;
  } finally {
    await worker.terminate();
  }
}

function longestTokenLength(text) {
  const tokens = text.split(TOKEN_SPLIT_PATTERN).filter(Boolean);
  return tokens.reduce((max, t) => Math.max(max, t.length), 0);
}

// Kimlik/pasaport görselinden ham metin çıkarır. tur+eng dil paketini
// kullanıyoruz: alan etiketleri Türkçe ("Soyadı/Surname" gibi), MRZ ise zaten
// düz Latin karakterlerden oluşuyor. Dil verisi ilk çalıştırmada internetten
// indirilip önbelleğe alınır — tesseract.js'e dokunan tek yer burası.
//
// Görseller artık hep DÜZ (kart karenin içinde doğru yönde) geliyor, bu yüzden
// 90°/180°/270° döndürüp deneme mantığı tamamen kaldırıldı — tek bir tarama
// yeterli. EXIF düzeltmesi (kameranın tutuluşu) hâlâ preprocessForOcr içinde
// uygulanıyor, o ayrı bir konu. Bu değişiklik OCR süresini ~4 kata kadar
// kısaltıyor çünkü artık dört ayrı worker kurup dört ayrı tarama yapmıyoruz.
//
// options.sparseText: true ise SPARSE_TEXT PSM kullanılır (bkz. runOcrPass'taki
// not) — MRZ ağırlıklı yüzler için ExtractDocumentInfoUseCase tarafından true
// gönderiliyor.
async function recognizeText(buffer, { sparseText = false } = {}) {
  const text = await runOcrPass(buffer, 2200, sparseText);
  const score = longestTokenLength(text);
  console.log(`[OCR-debug] skor: ${score}`);

  if (score >= MIN_TOKEN_LENGTH) return text;

  // Yeterince uzun bir token çıkmadı — daha yüksek çözünürlükle bir kez daha
  // dene (örn. kart karenin küçük bir kısmıysa yazı çok küçük kalmış olabilir).
  const fallback = await runOcrPass(buffer, 3000, sparseText);
  return longestTokenLength(fallback) > score ? fallback : text;
}

module.exports = { recognizeText };
