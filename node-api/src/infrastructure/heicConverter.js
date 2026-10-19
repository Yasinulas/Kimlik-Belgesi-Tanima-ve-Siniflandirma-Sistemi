const sharp = require("sharp");
const heicConvert = require("heic-convert");

// sharp'ın prebuilt binary'si HEIC/HEIF'i decode edemiyor (yalnızca AVIF
// destekleniyor — HEVC codec'inin patent lisansı yüzünden prebuilt binary'den
// çıkarılmış). iPhone'ların varsayılan fotoğraf formatı HEIC olduğu için bunu
// görmezden gelemeyiz: sharp görseli tanıyamazsa heic-convert (WASM tabanlı
// libheif) ile JPEG'e çevirip devam ediyoruz.
async function normalizeImageBuffer(buffer) {
  try {
    // metadata() sadece container'ı okur (HEIC'te bile başarılı döner) — gerçek
    // piksel decode'unun çalışıp çalışmadığını anlamak için küçük bir decode
    // denemesi yapmamız lazım.
    await sharp(buffer).resize(8).raw().toBuffer();
    return buffer;
  } catch {
    try {
      const converted = await heicConvert({ buffer, format: "JPEG", quality: 1 });
      return Buffer.from(converted);
    } catch {
      throw {
        status: 400,
        code: "UNSUPPORTED_IMAGE_FORMAT",
        message: "Görsel formatı tanınamadı veya bozuk (JPEG/PNG/HEIC destekleniyor).",
      };
    }
  }
}

module.exports = { normalizeImageBuffer };
