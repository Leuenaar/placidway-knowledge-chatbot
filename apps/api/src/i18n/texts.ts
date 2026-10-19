/* ============================================================================
 * PETA FILE
 * FILE    : apps/api/src/i18n/texts.ts
 * TUJUAN  : Semua teks tetap yang dilihat pengunjung (krisis, disclaimer,
 *           'tidak ditemukan', error, saran pertanyaan, teks kartu kontak)
 *           dalam lima bahasa tulisan tangan: Inggris (induk), Indonesia,
 *           Turki, Spanyol, Arab. Untuk bahasa lain, teks Inggris
 *           diterjemahkan sekali oleh model (lihat localizer.ts).
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Daftar kunci teks
 *    2. Alamat direktori bantuan krisis
 *    3. Teks Inggris (versi induk)
 *    4. Teks Indonesia
 *    5. Teks Turki (belum dicek penutur asli)
 *    6. Teks Spanyol (belum dicek penutur asli)
 *    7. Teks Arab (belum dicek penutur asli)
 *    8. Tabel bahasa tulisan tangan dan kode bahasa utama
 * KALAU DIMINTA MENGUBAH:
 *    - Mengubah kalimat krisis, disclaimer, atau teks kartu kontak: cari
 *      kuncinya di bahasa yang diminta (BAGIAN 3)
 *    - Menambah kunci teks baru: tambahkan di TEXT_KEYS lalu isi di kelima
 *      bahasa (BAGIAN 1)
 * ============================================================================ */

/**
 * Every fixed sentence the server can show on its own: replies for the rare cases where the model's text must not be shown, the crisis
 * reply, the disclaimer and the follow-up suggestions. English is the master text. Five languages are written by hand (en, id, tr, es, ar);
 * for any other language the master is translated once by the model and kept in memory, and if that fails the English text is used.
 *
 * Review status: en and id were checked by the owner; tr, es and ar were written by the assistant and have not been reviewed by a native speaker.
 */
import { DISCLAIMER_TEXT } from "@pwbot/shared";

// ===== BAGIAN 1: Daftar kunci teks =====
export const TEXT_KEYS = [
  "crisis",
  "disclaimer",
  "ungrounded",
  "not_found",
  "refused",
  "medical_fallback",
  "error",
  "ask_cost",
  "ask_included",
  "ask_duration",
  "ask_after",
  "ask_about",
  "lead_title",
  "lead_name",
  "lead_email",
  "lead_consent",
  "lead_submit",
  "lead_decline",
  "lead_thanks",
  "lead_failed",
] as const;
export type TextKey = (typeof TEXT_KEYS)[number];
export type Texts = Record<TextKey, string>;

// ===== BAGIAN 2: Alamat direktori bantuan krisis =====
/** The address the crisis text points to. A translation that loses it is not used. */
export const HELPLINE_DIRECTORY = "findahelpline.com";

// ===== BAGIAN 3: Teks Inggris (versi induk) =====
export const EN: Texts = {
  crisis:
    "I'm really sorry you're going through this. I'm an AI assistant that answers questions about the ITC clinic, so I can't give you the support you deserve right now. " +
    "If you might act on these thoughts or you are in danger, please call your local emergency number now. " +
    `You can also reach a crisis line in your country (${HELPLINE_DIRECTORY} lists them), or tell someone you trust, or your doctor, how you feel today. You don't have to go through this alone.`,
  disclaimer: DISCLAIMER_TEXT,
  ungrounded: "I couldn't confirm that from the PlacidWay pages, so I'd rather not guess. PlacidWay can answer it directly if you request a free quote.",
  not_found: "I don't have that information here. PlacidWay can answer it directly if you request a free quote.",
  refused: "I can't help with that question here. For anything about your own health, please speak with your doctor. PlacidWay can answer questions about the program if you request a free quote.",
  medical_fallback:
    "I can't tell you whether a treatment is safe or right for you. That is a question for your own doctor, who knows your medical history. If you want to know about the program, you can ask me about the ITC information on the PlacidWay pages.",
  error: "Something went wrong on our side. Please try again in a moment.",
  ask_cost: "How much does the treatment cost?",
  ask_included: "What is included in the package?",
  ask_duration: "How long is the program?",
  ask_after: "What happens after the program?",
  ask_about: "Tell me about the ITC Immunity Therapy Center",
  lead_title: "Want the PlacidWay team to contact you about a free quote? Leave your name and email.",
  lead_name: "Your name",
  lead_email: "Your email",
  lead_consent:
    "I agree that my name and email are stored so the PlacidWay team can contact me about a quote. Nothing else from this chat is stored with them, and they are deleted after 90 days.",
  lead_submit: "Send my details",
  lead_decline: "No, thanks",
  lead_thanks: "Thank you. Your details were saved for the PlacidWay team.",
  lead_failed: "Sorry, I couldn't save your details. Please try again, or use the free quote link.",
};

// ===== BAGIAN 4: Teks Indonesia =====
const ID: Texts = {
  crisis:
    "Saya turut prihatin Anda sedang melewati hal seberat ini. Saya asisten AI yang menjawab pertanyaan seputar klinik ITC, jadi saya tidak bisa memberi dukungan yang Anda butuhkan saat ini. " +
    "Jika Anda mungkin akan bertindak atas pikiran itu atau sedang dalam bahaya, segera hubungi nomor darurat di negara Anda. " +
    `Anda juga bisa menghubungi layanan krisis di negara Anda (${HELPLINE_DIRECTORY} mendaftarkannya), atau memberi tahu orang yang Anda percaya atau dokter Anda bagaimana perasaan Anda hari ini. Anda tidak harus melewati ini sendirian.`,
  disclaimer:
    "PlacidWay menyediakan informasi wisata medis, bukan layanan kesehatan, dan tidak merekomendasikan penyedia layanan mana pun. Konsultasikan dengan tenaga kesehatan berlisensi di tempat Anda sebelum menjalani pengobatan apa pun.",
  ungrounded: "Saya tidak bisa memastikannya dari halaman PlacidWay, jadi saya tidak mau menebak. PlacidWay bisa menjawabnya langsung jika Anda meminta penawaran gratis.",
  not_found: "Saya tidak punya informasi itu di sini. PlacidWay bisa menjawabnya langsung jika Anda meminta penawaran gratis.",
  refused:
    "Saya tidak bisa membantu pertanyaan itu di sini. Untuk hal yang menyangkut kesehatan Anda sendiri, silakan bicara dengan dokter Anda. PlacidWay bisa menjawab pertanyaan tentang programnya jika Anda meminta penawaran gratis.",
  medical_fallback:
    "Saya tidak bisa mengatakan apakah suatu pengobatan aman atau cocok untuk Anda. Itu pertanyaan untuk dokter Anda sendiri, yang mengetahui riwayat kesehatan Anda. Jika Anda ingin tahu tentang programnya, tanyakan saja informasi ITC yang ada di halaman PlacidWay.",
  error: "Terjadi kesalahan di pihak kami. Silakan coba lagi sebentar lagi.",
  ask_cost: "Berapa biaya pengobatannya?",
  ask_included: "Apa saja yang termasuk dalam paket?",
  ask_duration: "Berapa lama programnya?",
  ask_after: "Apa yang terjadi setelah program selesai?",
  ask_about: "Ceritakan tentang ITC Immunity Therapy Center",
  lead_title: "Mau tim PlacidWay menghubungi Anda untuk penawaran gratis? Tinggalkan nama dan email Anda.",
  lead_name: "Nama Anda",
  lead_email: "Email Anda",
  lead_consent:
    "Saya setuju nama dan email saya disimpan agar tim PlacidWay dapat menghubungi saya tentang penawaran. Tidak ada isi percakapan lain yang disimpan bersamanya, dan datanya dihapus setelah 90 hari.",
  lead_submit: "Kirim data saya",
  lead_decline: "Tidak, terima kasih",
  lead_thanks: "Terima kasih. Data Anda sudah disimpan untuk tim PlacidWay.",
  lead_failed: "Maaf, data Anda tidak bisa disimpan. Silakan coba lagi, atau gunakan tautan penawaran gratis.",
};

// ===== BAGIAN 5: Teks Turki (belum dicek penutur asli) =====
const TR: Texts = {
  crisis:
    "Bunları yaşadığınız için çok üzgünüm. Ben ITC kliniği hakkındaki soruları yanıtlayan bir yapay zekâ asistanıyım, bu yüzden şu anda ihtiyacınız olan desteği veremem. " +
    "Bu düşüncelerle hareket edebileceğinizi düşünüyorsanız ya da tehlikedeyseniz lütfen hemen bulunduğunuz yerin acil durum numarasını arayın. " +
    `Ülkenizdeki bir kriz hattına da ulaşabilirsiniz (${HELPLINE_DIRECTORY} bunları listeler); ya da güvendiğiniz birine veya doktorunuza bugün nasıl hissettiğinizi söyleyebilirsiniz. Bununla tek başınıza uğraşmak zorunda değilsiniz.`,
  disclaimer:
    "PlacidWay tıbbi seyahat bilgisi sunar; sağlık hizmeti vermez ve hiçbir sağlayıcıyı onaylamaz. Herhangi bir tedaviye başlamadan önce bulunduğunuz yerdeki lisanslı bir sağlık uzmanına danışın.",
  ungrounded: "Bunu PlacidWay sayfalarından doğrulayamadım, bu yüzden tahmin yürütmek istemem. Ücretsiz teklif isterseniz PlacidWay bunu doğrudan yanıtlayabilir.",
  not_found: "Bu bilgi bende yok. Ücretsiz teklif isterseniz PlacidWay bunu doğrudan yanıtlayabilir.",
  refused: "Bu soruya burada yardımcı olamıyorum. Kendi sağlığınızla ilgili her konuda lütfen doktorunuza danışın. Ücretsiz teklif isterseniz PlacidWay program hakkındaki soruları yanıtlayabilir.",
  medical_fallback:
    "Bir tedavinin sizin için güvenli ya da uygun olup olmadığını söyleyemem. Bu, sağlık geçmişinizi bilen kendi doktorunuza sorulması gereken bir soru. Program hakkında bilgi isterseniz PlacidWay sayfalarındaki ITC bilgilerini bana sorabilirsiniz.",
  error: "Bizim tarafımızda bir sorun oluştu. Lütfen biraz sonra tekrar deneyin.",
  ask_cost: "Tedavi ne kadar tutuyor?",
  ask_included: "Pakete neler dahil?",
  ask_duration: "Program ne kadar sürüyor?",
  ask_after: "Programdan sonra ne oluyor?",
  ask_about: "ITC Immunity Therapy Center hakkında bilgi verir misiniz?",
  lead_title: "PlacidWay ekibinin ücretsiz teklif için sizinle iletişime geçmesini ister misiniz? Adınızı ve e-posta adresinizi bırakın.",
  lead_name: "Adınız",
  lead_email: "E-posta adresiniz",
  lead_consent:
    "Adımın ve e-posta adresimin, PlacidWay ekibi teklif konusunda benimle iletişime geçebilsin diye saklanmasını kabul ediyorum. Bu sohbetten başka hiçbir şey onlarla birlikte saklanmaz ve 90 gün sonra silinirler.",
  lead_submit: "Bilgilerimi gönder",
  lead_decline: "Hayır, teşekkürler",
  lead_thanks: "Teşekkürler. Bilgileriniz PlacidWay ekibi için kaydedildi.",
  lead_failed: "Üzgünüz, bilgileriniz kaydedilemedi. Lütfen tekrar deneyin veya ücretsiz teklif bağlantısını kullanın.",
};

// ===== BAGIAN 6: Teks Spanyol (belum dicek penutur asli) =====
const ES: Texts = {
  crisis:
    "Lamento mucho que esté pasando por esto. Soy un asistente de IA que responde preguntas sobre la clínica ITC, así que no puedo darle el apoyo que merece en este momento. " +
    "Si podría actuar según esos pensamientos o está en peligro, llame ahora mismo al número de emergencias de su país. " +
    `También puede comunicarse con una línea de crisis de su país (${HELPLINE_DIRECTORY} las lista), o contarle a alguien de confianza, o a su médico, cómo se siente hoy. No tiene por qué pasar por esto sin apoyo.`,
  disclaimer:
    "PlacidWay ofrece información sobre turismo médico, no servicios de salud, y no respalda a ningún proveedor. Consulte a un profesional de la salud con licencia en su localidad antes de iniciar cualquier tratamiento.",
  ungrounded: "No pude confirmarlo con las páginas de PlacidWay, así que prefiero no adivinar. PlacidWay puede responderlo directamente si solicita una cotización gratuita.",
  not_found: "No tengo esa información aquí. PlacidWay puede responderlo directamente si solicita una cotización gratuita.",
  refused: "No puedo ayudar con esa pregunta aquí. Para cualquier tema sobre su propia salud, hable con su médico. PlacidWay puede responder preguntas sobre el programa si solicita una cotización gratuita.",
  medical_fallback:
    "No puedo decirle si un tratamiento es seguro o adecuado para usted. Esa es una pregunta para su propio médico, que conoce su historial. Si desea conocer el programa, puede preguntarme por la información de ITC que aparece en las páginas de PlacidWay.",
  error: "Algo salió mal de nuestro lado. Inténtelo de nuevo en un momento.",
  ask_cost: "¿Cuánto cuesta el tratamiento?",
  ask_included: "¿Qué incluye el paquete?",
  ask_duration: "¿Cuánto dura el programa?",
  ask_after: "¿Qué ocurre después del programa?",
  ask_about: "Cuénteme sobre el ITC Immunity Therapy Center",
  lead_title: "¿Quiere que el equipo de PlacidWay lo contacte para una cotización gratuita? Deje su nombre y correo electrónico.",
  lead_name: "Su nombre",
  lead_email: "Su correo electrónico",
  lead_consent:
    "Acepto que mi nombre y mi correo se guarden para que el equipo de PlacidWay me contacte sobre una cotización. No se guarda nada más de este chat junto con ellos, y se eliminan después de 90 días.",
  lead_submit: "Enviar mis datos",
  lead_decline: "No, gracias",
  lead_thanks: "Gracias. Sus datos se guardaron para el equipo de PlacidWay.",
  lead_failed: "Lo sentimos, no pudimos guardar sus datos. Inténtelo de nuevo o use el enlace de cotización gratuita.",
};

// ===== BAGIAN 7: Teks Arab (belum dicek penutur asli) =====
const AR: Texts = {
  crisis:
    "يؤسفني جدًا أنك تمر بهذا. أنا مساعد ذكاء اصطناعي أجيب عن الأسئلة المتعلقة بعيادة ITC، ولذلك لا أستطيع أن أقدم لك الدعم الذي تستحقه الآن. " +
    "إذا كنت قد تتصرف بناءً على هذه الأفكار أو كنت في خطر، فاتصل فورًا برقم الطوارئ في بلدك. " +
    `يمكنك أيضًا التواصل مع خط مساعدة للأزمات في بلدك (يعرض موقع ${HELPLINE_DIRECTORY} هذه الخطوط)، أو إخبار شخص تثق به أو طبيبك بما تشعر به اليوم. ليس عليك أن تمر بهذا وحدك.`,
  disclaimer:
    "تقدّم PlacidWay معلومات عن السياحة العلاجية ولا تقدّم خدمات رعاية صحية، ولا تزكّي أي مقدّم خدمة. استشر مقدّم رعاية صحية مرخّصًا في منطقتك قبل الإقدام على أي علاج.",
  ungrounded: "لم أتمكن من التأكد من ذلك من صفحات PlacidWay، لذلك لا أريد التخمين. يمكن لـ PlacidWay الإجابة عنه مباشرة إذا طلبت عرض سعر مجانيًا.",
  not_found: "ليست لدي هذه المعلومة هنا. يمكن لـ PlacidWay الإجابة عنها مباشرة إذا طلبت عرض سعر مجانيًا.",
  refused: "لا أستطيع المساعدة في هذا السؤال هنا. وفي كل ما يخص صحتك الشخصية، يُرجى استشارة طبيبك. يمكن لـ PlacidWay الإجابة عن أسئلة البرنامج إذا طلبت عرض سعر مجانيًا.",
  medical_fallback:
    "لا أستطيع أن أقول لك إن كان علاج ما آمنًا أو مناسبًا لك. هذا سؤال لطبيبك الخاص الذي يعرف تاريخك الطبي. وإذا أردت معرفة تفاصيل البرنامج فيمكنك أن تسألني عن معلومات ITC الواردة في صفحات PlacidWay.",
  error: "حدث خطأ من جانبنا. يُرجى المحاولة مرة أخرى بعد قليل.",
  ask_cost: "كم تبلغ تكلفة العلاج؟",
  ask_included: "ما الذي تشمله الباقة؟",
  ask_duration: "كم تستغرق مدة البرنامج؟",
  ask_after: "ماذا يحدث بعد انتهاء البرنامج؟",
  ask_about: "حدثني عن مركز ITC Immunity Therapy Center",
  lead_title: "هل تريد أن يتواصل معك فريق PlacidWay بخصوص عرض سعر مجاني؟ اترك اسمك وبريدك الإلكتروني.",
  lead_name: "اسمك",
  lead_email: "بريدك الإلكتروني",
  lead_consent:
    "أوافق على حفظ اسمي وبريدي الإلكتروني ليتواصل معي فريق PlacidWay بخصوص عرض السعر. لا يُحفظ معهما أي شيء آخر من هذه المحادثة، ويُحذفان بعد 90 يومًا.",
  lead_submit: "أرسل بياناتي",
  lead_decline: "لا، شكرًا",
  lead_thanks: "شكرًا لك. تم حفظ بياناتك لفريق PlacidWay.",
  lead_failed: "عذرًا، تعذّر حفظ بياناتك. يُرجى المحاولة مرة أخرى أو استخدام رابط عرض السعر المجاني.",
};

// ===== BAGIAN 8: Tabel bahasa tulisan tangan dan kode bahasa utama =====
/** Hand-written languages, by primary language code. */
export const CURATED: Readonly<Record<string, Texts>> = { en: EN, id: ID, tr: TR, es: ES, ar: AR };

/** "pt-BR" -> "pt". Anything that is not a language code gives "en". */
export function primaryCode(code: string | undefined): string {
  const primary = (code ?? "").split("-")[0]?.toLowerCase() ?? "";
  return /^[a-z]{2,3}$/.test(primary) ? primary : "en";
}
