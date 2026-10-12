// scripts/language.mjs
//
// Xác định ngôn ngữ của từng video (Tiếng Hàn / Tiếng Nhật / Tiếng Pháp / khác)
// để app đọc và dịch dữ liệu đúng theo ngôn ngữ gốc của video. Tách riêng để
// test được không cần API key (xem language.test.mjs).
//
// Thứ tự ưu tiên (từ đáng tin nhất tới kém nhất):
//   1. "title"       - văn bản trong tiêu đề:
//                        có Hangul -> ko, có Kana -> ja (chữ viết riêng, rất chắc chắn);
//                        chữ Latin mang đủ dấu hiệu tiếng Pháp -> fr (xem detectFrench).
//   2. "description" - cùng quy tắc, áp dụng cho phần mô tả (khi tiêu đề chỉ có
//                      Hán tự, chữ Latin chung chung, hoặc quá ngắn).
//   3. "metadata"    - defaultAudioLanguage / defaultLanguage do chủ kênh khai
//                      báo. Xếp sau văn bản vì rất nhiều kênh để nguyên giá trị
//                      mặc định sai (vd "en") cho mọi video. Chỉ tính là chắc
//                      chắn khi là ngôn ngữ hỗ trợ (ko/ja/fr).
//   4. "channel"     - không suy ra được từ chính video -> lấy ngôn ngữ chủ
//                      đạo của kênh (đa số video của kênh, rồi tới
//                      defaultLanguage / country của kênh).
//   Không có gì cả -> "und" (không xác định), khi dịch sẽ dùng sl=auto.
//
// Thêm 1 ngôn ngữ mới: thêm mã vào SUPPORTED, viết hàm nhận diện văn bản và
// gọi nó trong detectTextLanguage(), thêm quốc gia vào COUNTRY_TO_LANG, rồi
// thêm LANG_INFO tương ứng trong public/app.js.

export const SUPPORTED = ["ko", "ja", "fr"];

const HANGUL = /[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힯ힰ-퟿]/g;
const KANA = /[぀-ゟ゠-ヿㇰ-ㇿｦ-ﾟ]/g;

// Trả về "ko" | "ja" | null dựa trên chữ viết. Khi văn bản trộn cả hai (hiếm,
// vd tiêu đề song ngữ), chọn chữ viết xuất hiện nhiều ký tự hơn.
export function detectScript(text) {
  if (!text) return null;
  const ko = (String(text).match(HANGUL) || []).length;
  const ja = (String(text).match(KANA) || []).length;
  if (!ko && !ja) return null;
  return ko >= ja ? "ko" : "ja";
}

// ---------- Tiếng Pháp ----------
// Tiếng Pháp dùng chữ Latin như tiếng Anh/Tây Ban Nha/Bồ Đào Nha/Ý, nên không
// nhận diện bằng bộ chữ được. Thay vào đó cộng điểm theo các dấu hiệu chỉ (hoặc
// gần như chỉ) tiếng Pháp mới có:
//   - từ chức năng đặc trưng: les, des, du, une, est, et, pour, dans, avec, cette…
//     (cố ý bỏ các từ trùng với tiếng Anh/Tây Ban Nha như "la", "de", "que", "plus").
//   - dạng lược âm: l'…, d'…, qu'…, c'est, j'ai, n'…, s'…
//   - chữ cái có dấu đặc trưng: ç, œ, è, ê, ë, â, î, ï, ô, û, ù
// Có dấu hiệu rõ của tiếng Tây Ban Nha/Bồ Đào Nha (ñ, ¿, ¡, ã, õ) -> không phải
// tiếng Pháp. Cần tổng điểm >= 2 để tránh nhận nhầm 1 từ mượn lẻ trong tiêu đề
// tiếng Anh (vd "Café", "Hôtel").
// Từ rất đặc trưng (hầu như không gặp trong tiếng Anh/Tây Ban Nha/Ý): 2 điểm,
// đủ để kết luận 1 mình. Từ thường gặp nhưng có thể trùng: 1 điểm.
const FR_STRONG = new Set([
  "les", "aux", "avec", "dans", "cette", "très", "être", "était", "sont", "nous", "vous",
  "pourquoi", "voici", "chez", "meilleur", "meilleurs", "meilleure", "meilleures",
  "beaux", "découverte", "ça", "où", "jamais", "aujourd",
]);
const FR_WORDS = new Set([
  "le", "des", "du", "une", "est", "et", "pour", "sur", "au", "ces", "ce", "ils",
  "elle", "elles", "pas", "mais", "leur", "leurs", "sans", "quand", "tout", "tous",
  "toute", "toutes", "même", "aussi", "notre", "votre", "qui", "monde", "ville", "pays",
  "il", "on", "faire", "beau", "belle", "belles", "petit", "petite", "nouveau", "nouvelle",
]);
// Không đưa vào: các từ trùng tiếng Anh ("son", "ton", "comment", "voyage", "plus")
// hoặc tiếng Tây Ban Nha ("la", "de", "que", "mes", "nos", "vos", "un").
const FR_ELISION = /\b(?:l|d|qu|c|j|n|s|m|t|jusqu|lorsqu|puisqu)['’][a-zàâäéèêëîïôöùûüÿœæ]/gi;
const FR_CHARS = /[çœèêëâîïôûù]/i;
// ñ ¿ ¡: Tây Ban Nha; ã õ: Bồ Đào Nha; ì ò: Ý - tiếng Pháp không dùng các chữ này.
const NOT_FR_CHARS = /[ñ¿¡ãõìò]/i;

export function frenchScore(text) {
  if (!text) return 0;
  const t = String(text);
  if (NOT_FR_CHARS.test(t)) return 0;
  const words = t.toLowerCase().match(/[a-zàâäçéèêëîïôöùûüÿœæ]+/g) || [];
  let score = 0;
  for (const w of words) {
    if (FR_STRONG.has(w)) score += 2;
    else if (FR_WORDS.has(w)) score += 1;
  }
  score += (t.match(FR_ELISION) || []).length;
  // Chữ có dấu chỉ cộng tối đa 1 điểm: món ăn/từ mượn trong tiêu đề tiếng Anh
  // (vd "Crème brûlée") có thể có nhiều dấu nhưng không phải câu tiếng Pháp.
  if (FR_CHARS.test(t)) score += 1;
  return score;
}

export function detectFrench(text) {
  return frenchScore(text) >= 2 ? "fr" : null;
}

// Ngôn ngữ của 1 đoạn văn bản: chữ Hàn/Nhật trước (chắc chắn nhất), rồi tiếng Pháp.
export function detectTextLanguage(text) {
  return detectScript(text) || detectFrench(text);
}

// "ko-KR" -> "ko", "fr-CA" -> "fr", "zxx"/"" -> null. Giữ mã ngôn ngữ khác (vd "en")
// để hiển thị "Khác", nhưng không coi là tín hiệu chắc chắn.
export function normalizeLangCode(code) {
  if (!code || typeof code !== "string") return null;
  const base = code.trim().toLowerCase().split(/[-_]/)[0];
  if (!base || base === "zxx" || base === "und" || base === "mul") return null;
  return base;
}

// Chỉ dùng quốc gia khi kênh không có tín hiệu nào khác. Bỉ, Thuỵ Sĩ, Canada
// không có ở đây vì là nước đa ngôn ngữ - kênh ở đó không chắc nói tiếng Pháp.
const COUNTRY_TO_LANG = { KR: "ko", JP: "ja", FR: "fr" };

// Ngôn ngữ của 1 video, chưa xét tới kênh. Trả về { language, languageSource } hoặc null.
export function detectVideoLanguage(snippet) {
  const fromTitle = detectTextLanguage(snippet?.title);
  if (fromTitle) return { language: fromTitle, languageSource: "title" };

  const fromDesc = detectTextLanguage(String(snippet?.description || "").slice(0, 1500));
  if (fromDesc) return { language: fromDesc, languageSource: "description" };

  const meta = normalizeLangCode(snippet?.defaultAudioLanguage) || normalizeLangCode(snippet?.defaultLanguage);
  if (meta && SUPPORTED.includes(meta)) return { language: meta, languageSource: "metadata" };
  // Ngôn ngữ khác (vd "en") được khai báo: tín hiệu yếu - nhiều kênh để nguyên
  // giá trị mặc định này. Nơi gọi sẽ ưu tiên ngôn ngữ của kênh hơn.
  if (meta) return { language: meta, languageSource: "metadata-other" };

  return null;
}

// Gộp ngôn ngữ của video với ngôn ngữ chủ đạo của kênh.
export function resolveVideoLanguage(detected, channelLanguage) {
  const strong = detected && detected.languageSource !== "metadata-other";
  if (strong) return detected;
  if (SUPPORTED.includes(channelLanguage)) return { language: channelLanguage, languageSource: "channel" };
  if (detected) return { language: detected.language, languageSource: "metadata" };
  return { language: "und", languageSource: "none" };
}

// Ngôn ngữ chủ đạo của kênh: đa số trong các video đã xác định được (chỉ đếm
// ngôn ngữ hỗ trợ), nếu không có thì dùng defaultLanguage / country của kênh.
export function detectChannelLanguage(videoLanguages, channelSnippet) {
  const counts = {};
  for (const l of videoLanguages) if (SUPPORTED.includes(l)) counts[l] = (counts[l] || 0) + 1;
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (best) return best[0];
  const meta = normalizeLangCode(channelSnippet?.defaultLanguage);
  if (meta) return meta;
  const country = String(channelSnippet?.country || "").toUpperCase();
  return COUNTRY_TO_LANG[country] || "und";
}
