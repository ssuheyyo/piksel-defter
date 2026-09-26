# Piksel Defter ✿

Piksel manzaralı günlük, haftalık ve aylık planlayıcı. Yerel masaüstü sürümü ile iPhone/Windows/Linux üzerinde açılabilen hesaplı web sürümü aynı arayüzü kullanır.

## Web sürümü nasıl çalışır?

GitHub Pages yalnızca HTML, CSS, JavaScript ve görselleri yayınlar. Hesap ve kayıtlar Supabase Auth ile Postgres veritabanında saklanır. GitHub deposuna planların, parolaların veya gizli veritabanı anahtarlarının yüklenmesi gerekmez.

İlk kurulum:

1. Supabase'de bir proje açın. `schema.sql` içeriğini SQL Editor'de bir kez çalıştırın; bu dosya her kullanıcıyı yalnızca kendi kayıtlarına eriştiren veritabanı kurallarını da oluşturur.
2. Supabase proje URL'sini ve **publishable** (`sb_publishable_...`) anahtarını `cloud-config.js` içine yazın. **Secret** veya `service_role` anahtarını kesinlikle buraya koymayın.
3. Supabase **Authentication → URL Configuration** bölümünde `Site URL` ve izinli yönlendirme adresini yayımlanan GitHub Pages URL'si yapın.
4. Bu depoyu GitHub Pages ile `main` dalı kökünden yayınlayın. Web sayfasından e-posta ve parola ile hesap oluşturup giriş yapın.
5. Eski masaüstü kayıtlarını taşımak için yerel uygulamada **Ayarlar → Yedeği indir**, web uygulamasında giriş yaptıktan sonra **Ayarlar → Yedek yükle** adımlarını izleyin. Yedek dosyasını GitHub deposuna yüklemeyin.

Sonrasında aynı web adresine Linux, Windows veya iPhone'dan girip **aynı hesapla** oturum açın. iPhone'da Safari paylaşım menüsündeki **Ana Ekrana Ekle** seçeneğiyle uygulama simgesi oluşturabilirsiniz. Çevrimiçi sürüm veri yazmak ve diğer cihazdaki değişiklikleri almak için internet bağlantısı ister. Diğer cihazdaki değişiklikler sayfa açılınca veya uygulamaya geri dönünce yenilenir. Bildirimler yalnızca yerel masaüstü sürümü açıkken çalışır; iPhone'a arka plan bildirimi gönderilmez.

## Açma

Masaüstündeki **Piksel Defter** simgesine çift tıklayın. Kısayol görünmüyorsa bu klasördeki `launch.sh` dosyasını çalıştırın. Uygulama 1160 × 800 boyutunda ayrı bir pencere açar; pencereyi normal şekilde büyütüp küçültebilirsiniz.

## Neler yapabilirsiniz?

- **Günüm:** Günün görevleri, etkinlikleri, alışkanlıkları, ruh hâli, otomatik kaydedilen kısa not ve serbest çizim alanı.
- **Haftalık:** Yedi güne yayılan plan ve ilerleme sayıları.
- **Aylık:** Görev ve etkinliklerin yer aldığı takvim; bir güne tıklayınca o günün sayfası açılır.
- **Görevler:** İşaretleme, düzenleme, kategori, önem derecesi, günlük/haftalık/aylık tekrar ve isteğe bağlı saatli hatırlatıcı.
- **Alışkanlıklar:** Rutin oluşturma ve haftalık işaretleme.
- **Notlar:** Ayrı not kartları, arama ve düzenleme.
- **Odak zamanı:** Ayarlanabilir çalışma ve mola sayacı, tamamlanan oturum kaydı.
- **Serbest alan:** Kalem, ok, renk, silgi ve geri alma. Çizimler seçilen güne kaydedilir.
- **Temalar:** Üstteki **Tema değiştir** düğmesiyle Kızıl Bahçe, Ay Işığı ve Yeşil Vadi arasında geçin. Kızıl Bahçe varsayılandır. Her temanın ayrıntılı, katmanlı piksel manzarası ve uçuşan yaprakları vardır. **Manzarayı gör** düğmesi resmi büyütür; hareketi Ayarlar'dan kapatabilirsiniz.
- **Ayarlar:** Yedek indirme ve yükleme; isteğe bağlı WebDAV eşitlemesi.

Üstteki **Yeni ekle** düğmesiyle hızlıca kayıt ekleyebilirsiniz. `Ctrl+K` aramayı, `Ctrl+N` yeni görevi açar.

## Veriler nerede?

Planlar varsayılan olarak bilgisayarınızda `~/.local/share/piksel-defter/planner.sqlite3` dosyasında saklanır. İnternet bağlantısı olmadan kullanılabilir. Yedek almak için **Ayarlar → Yedeği indir** yolunu kullanın.

Başka bir cihazla eşitlemek isterseniz **Ayarlar** bölümüne kendi **HTTPS WebDAV dosya adresinizi**, kullanıcı adınızı ve uygulama parolanızı girip **Şimdi eşitle** düğmesine basın. Nextcloud gibi WebDAV sunan bir hizmet kullanılabilir. Bu özellik isteğe bağlıdır; bir hesap otomatik açılmaz. Eşitleme iki cihaz aynı kaydı değiştirdiyse daha yeni kaydı tutar. Aynı anda iki cihazda düzenleme yapıyorsanız önce eşitleyin.

Saatli hatırlatıcılar ve odak sayacı uygulama açıkken çalışır. Hatırlatıcı için görev/etkinlikte saat ve hatırlatma süresi seçin.

## Neden bu yapı?

**Arayüz**, gördüğünüz renkli sayfalardır. Bu sayfalar hazır gelen Chromium ile ayrı bir pencere olarak açılır; tam ekran zorunluluğu yoktur. **Python**, planları kaydeden küçük yerel sunucudur. **SQLite**, verileri tek dosyada tutan hafif bir veritabanıdır. Böylece büyük bir ek uygulama paketi veya abonelik gerekmiyor. İstediğinizde JSON yedeği alarak kayıtlarınızı taşıyabilirsiniz.

## Teknik gereksinimler

Linux üzerinde Python 3.11+ ve Chromium gerekir. Harici Python veya Node paketi gerekmez. Uygulama yalnızca `127.0.0.1` üzerinden kendi bilgisayarınızda hizmet verir.
