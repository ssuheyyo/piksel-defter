# Piksel Defter ✿

Piksel manzaralı günlük, haftalık ve aylık planlayıcı. Canlı adres: **https://ssuheyyo.github.io/piksel-defter/**. Aynı hesapla iPhone, Android, tablet, Windows ve Linux üzerinde kullanılabilir.

## Web sürümü nasıl çalışır?

GitHub Pages yalnızca HTML, CSS, JavaScript ve görselleri yayınlar. Hesap ve kayıtlar Supabase Auth ile Postgres veritabanında saklanır. GitHub deposuna planların, parolaların veya gizli veritabanı anahtarlarının yüklenmesi gerekmez.

İlk kurulum:

1. Supabase'de bir proje açın. `schema.sql` içeriğini SQL Editor'de bir kez çalıştırın; bu dosya her kullanıcıyı yalnızca kendi kayıtlarına eriştiren veritabanı kurallarını da oluşturur.
2. Supabase proje URL'sini ve **publishable** (`sb_publishable_...`) anahtarını `cloud-config.js` içine yazın. **Secret** veya `service_role` anahtarını kesinlikle buraya koymayın.
3. Supabase **Authentication → URL Configuration** bölümünde `Site URL` ve izinli yönlendirme adresini yayımlanan GitHub Pages URL'si yapın.
4. Bu depoyu GitHub Pages ile `main` dalı kökünden yayınlayın. Web sayfasından e-posta ve parola ile hesap oluşturup giriş yapın.
5. Eski masaüstü kayıtlarını taşımak için yerel uygulamada **Ayarlar → Yedeği indir**, web uygulamasında giriş yaptıktan sonra **Ayarlar → Yedek yükle** adımlarını izleyin. Yedek dosyasını GitHub deposuna yüklemeyin.

Sonrasında aynı web adresine iPhone, Android, tablet, Windows veya Linux'tan girip **aynı hesapla** oturum açın. iPhone'da Safari paylaşım menüsündeki **Ana Ekrana Ekle** seçeneğiyle uygulama simgesi oluşturabilirsiniz. Android'de tarayıcı menüsündeki **Ana ekrana ekle** veya **Uygulamayı yükle** seçeneğini kullanabilirsiniz. Çevrimiçi sürüm veri yazmak ve diğer cihazdaki değişiklikleri almak için internet bağlantısı ister. Diğer cihazdaki değişiklikler sayfa açılınca veya uygulamaya geri dönünce yenilenir. Bildirimler yalnızca yerel masaüstü sürümü açıkken çalışır; telefona arka plan bildirimi gönderilmez.

## Açma

Masaüstündeki **Piksel Defter** simgesine çift tıklayın. Kısayol görünmüyorsa bu klasördeki `launch.sh` dosyasını çalıştırın. Bu kısayol çevrimiçi hesabını 1160 × 800 boyutunda ayrı bir pencerede açar; ilk seferde hesabına giriş yap. Pencereyi normal şekilde büyütüp küçültebilirsiniz. Eski çevrimdışı SQLite sürümüne gerekirse `launch-local.sh` ile erişebilirsiniz; onda yaptığınız yeni düzenlemeler web hesabına kendiliğinden aktarılmaz.

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

Çevrimiçi uygulamadaki planlar Supabase hesabının veritabanında saklanır. Masaüstü simgesi bu sürümü açar. Eski çevrimdışı sürümün kayıtları bilgisayarınızda `~/.local/share/piksel-defter/planner.sqlite3` dosyasında kalır. Yedek almak için **Ayarlar → Yedeği indir** yolunu kullanın.

Eski çevrimdışı sürümde ayrıca WebDAV eşitlemesi vardır. Bunun için o sürümün **Ayarlar** bölümüne kendi **HTTPS WebDAV dosya adresinizi**, kullanıcı adınızı ve uygulama parolanızı girip **Şimdi eşitle** düğmesine basın. Hesaplı web sürümünde buna gerek yoktur; kayıtlar oturum açtığınız hesapla eşitlenir.

Saatli hatırlatıcılar ve odak sayacı uygulama açıkken çalışır. Hatırlatıcı için görev/etkinlikte saat ve hatırlatma süresi seçin.

## Neden bu yapı?

**Arayüz**, gördüğünüz renkli sayfalardır. Bu sayfalar hazır gelen Chromium ile ayrı bir pencere olarak açılır; tam ekran zorunluluğu yoktur. **Python**, planları kaydeden küçük yerel sunucudur. **SQLite**, verileri tek dosyada tutan hafif bir veritabanıdır. Böylece büyük bir ek uygulama paketi veya abonelik gerekmiyor. İstediğinizde JSON yedeği alarak kayıtlarınızı taşıyabilirsiniz.

## Teknik gereksinimler

Linux üzerinde Python 3.11+ ve Chromium gerekir. Harici Python veya Node paketi gerekmez. Uygulama yalnızca `127.0.0.1` üzerinden kendi bilgisayarınızda hizmet verir.
