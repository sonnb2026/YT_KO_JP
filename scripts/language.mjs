// scripts/language.mjs
//
// Xác định ngôn ngữ của từng video (Tiếng Hàn / Tiếng Nhật / khác) để app đọc
// và dịch dữ liệu đúng theo ngôn ngữ gốc của video. Tách riêng để test được
// không cần API key (xem language.test.mjs).
//
// Thứ tự ưu tiên (từ đáng tin nhất tới kém nhất):
//   1. "title"       - chữ viết trong tiêu đề: có Hangul -> ko, có Kana -> ja.
//                      Đây là tín hiệu đáng tin nhất vì Hangul và Kana không
//                      dùng chung giữa 2 ngôn ngữ.
//   2. "description" - chữ viết trong phần mô tả (tiêu đề chỉ có Kanji/Latin).
//   3. "metadata"    - defaultAudioLanguage / defaultLanguage do chủ kênh khai
//                      báo. Xếp sau chữ viết vì rất nhiều kênh để nguyên giá
//                      trị mặc định sai (vd "en") cho mọi video.
//   4. "channel"     - không suy ra được từ chính video -> lấy ngôn ngữ chủ
//                      đạo của kênh (đa số video của kênh, rồi tới
//                      defaultLanguage / country của kênh).
//   Không có gì cả -> "und" (không xác định), khi dịch sẽ dùng sl=auto.

export const SUPPORTED = ["ko", "ja"];

const HANGUL = /[\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7AF\uD7B0-\uD7FF]/g;
const KANA = /[\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF\uFF66-\uFF9F]/g;

// Trả về "ko" | "ja" | null dựa trên chữ viết. Khi văn bản trộn cả hai (hiếm,
// vd tiêu đề song ngữ), chọn chữ viết xuất hiện nhiều ký tự hơn.
export function detectScript(text) {
  if (!text) return null;
  const ko = (String(text).match(HANGUL) || []).length;
  const ja = (String(text).match(KANA) || []).length;
  if (!ko && !ja) return null;
  return ko >= ja ? "ko" : "ja";
}

// "ko-KR" -> "ko", "ja" -> "ja", "zxx"/"" -> null. Giữ mã ngôn ngữ khác (vd "en")
// để hiển thị "Khác", nhưng không coi là tín hiệu Hàn/Nhật.
export function normalizeLangCode(code) {
  if (!code || typeof code !== "string") return null;
  const base = code.trim().toLowerCase().split(/[-_]/)[0];
  if (!base || base === "zxx" || base === "und" || base === "mul") return null;
  return base;
}

const COUNTRY_TO_LANG = { KR: "ko", JP: "ja" };

// Ngôn ngữ của 1 video, chưa xét tới kênh. Trả về { language, languageSource } hoặc null.
export function detectVideoLanguage(snippet) {
  const fromTitle = detectScript(snippet?.title);
  if (fromTitle) return { language: fromTitle, languageSource: "title" };

  const fromDesc = detectScript(String(snippet?.description || "").slice(0, 1500));
  if (fromDesc) return { language: fromDesc, languageSource: "description" };

  const meta = normalizeLangCode(snippet?.defaultAudioLanguage) || normalizeLangCode(snippet?.defaultLanguage);
  if (meta && SUPPORTED.includes(meta)) return { language: meta, languageSource: "metadata" };
  // Ngôn ngữ khác (vd "en") được khai báo: tín hiệu yếu - nhiều kênh Hàn/Nhật để
  // nguyên giá trị mặc định này. Nơi gọi sẽ ưu tiên ngôn ngữ của kênh hơn.
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
// ko/ja), nếu không có thì dùng defaultLanguage / country của kênh.
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
