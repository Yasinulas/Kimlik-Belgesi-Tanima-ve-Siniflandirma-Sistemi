const CHANNEL_DIFF_THRESHOLD = 12;
const BRIGHTNESS_THRESHOLD = 150;
const CONTRAST_THRESHOLD = 70;
// Gerçek fotoğraflar (özellikle kötü/floresan ışıkta çekilenler) 2 sinyali
// kolayca tetikleyip yanlışlıkla fotokopi sayılabiliyordu — üçünün de aynı anda
// gerçekleşmesini istiyoruz ki yanlış pozitif azalsın.
const MIN_SIGNALS = 3;
// HSV doygunluk ortalaması (0-255). Gerçek bir fotokopi/tarayıcı çıktısı neredeyse
// tamamen gri tondadır (doygunluk ~0-5); hologram, renkli logo, arka plan gibi
// unsurlar içeren gerçek bir belge fotoğrafı bu eşiği rahatça geçer. Eşik
// düşürüldü ki hafif soluk renkli gerçek fotoğraflar da erken "fotokopi değil"
// kararı alabilsin.
const SATURATION_THRESHOLD = 18;

class PhotocopyPolicy {
  static decide({ channels, saturationMean } = {}) {
    if (!channels || channels.length < 3) return true;

    // Görüntüde belirgin renk varsa fotokopi olamaz — bu, kontrast/parlaklık
    // sinyallerinden daha güvenilir bir ayraçtır çünkü beyaz bir belgeyi dolduran
    // gerçek bir fotoğraf da yüksek parlaklık/kontrast üretebilir.
    if (saturationMean > SATURATION_THRESHOLD) return false;

    const [r, g, b] = channels;
    const means = [r.mean, g.mean, b.mean];
    const channelDiff = Math.max(...means) - Math.min(...means);
    const brightness = (r.mean + g.mean + b.mean) / 3;
    const contrast = (r.stdev + g.stdev + b.stdev) / 3;

    const signals = [
      channelDiff <= CHANNEL_DIFF_THRESHOLD,
      brightness >= BRIGHTNESS_THRESHOLD,
      contrast >= CONTRAST_THRESHOLD,
    ].filter(Boolean).length;

    return signals >= MIN_SIGNALS;
  }
}

module.exports = { PhotocopyPolicy };
