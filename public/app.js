// public/app.js

let allVideos = [];
let filteredVideos = [];
let currentComments = [];
let sortField = "publishedAt";
let sortDir = "desc";
let commentSortField = "likeCount";
let commentSortDir = "desc";
let allChannelIds = [];
let selectedChannelIds = new Set(); // empty set = all channels selected
let currentList = "Korea"; // which named channel list (tab) is active (tự đổi theo tabs.json)
let dataMissing = false; // true khi tab chưa có file dữ liệu (tab/kênh vừa thêm, workflow chưa chạy xong)

const els = {
  tbody: document.getElementById("videoTableBody"),
  marketTabs: document.getElementById("marketTabs"),
  search: document.getElementById("searchInput"),
  sortField: document.getElementById("sortField"),
  sortDir: document.getElementById("sortDir"),
  channelFilterWrap: document.getElementById("channelFilterWrap"),
  channelFilterBtn: document.getElementById("channelFilterBtn"),
  channelFilterPanel: document.getElementById("channelFilterPanel"),
  channelFilterList: document.getElementById("channelFilterList"),
  channelFilterLabel: document.getElementById("channelFilterLabel"),
  selectAllChannels: document.getElementById("selectAllChannels"),
  clearAllChannels: document.getElementById("clearAllChannels"),
  metaViews1d: document.getElementById("metaViews1d"),
  metaViews7d: document.getElementById("metaViews7d"),
  metaTotalVph: document.getElementById("metaTotalVph"),
  metaChannels: document.getElementById("metaChannels"),
  metaVideos: document.getElementById("metaVideos"),
  metaUpdated: document.getElementById("metaUpdated"),
  fetchTriggerWrap: document.getElementById("fetchTriggerWrap"),
  fetchTriggerBtn: document.getElementById("fetchTriggerBtn"),
  fetchTriggerPanel: document.getElementById("fetchTriggerPanel"),
  fetchForceRefresh: document.getElementById("fetchForceRefresh"),
  fetchFullHistory: document.getElementById("fetchFullHistory"),
  fetchTriggerSubmit: document.getElementById("fetchTriggerSubmit"),
  fetchTriggerStatus: document.getElementById("fetchTriggerStatus"),
  manageChannelsWrap: document.getElementById("manageChannelsWrap"),
  manageChannelsBtn: document.getElementById("manageChannelsBtn"),
  manageChannelsPanel: document.getElementById("manageChannelsPanel"),
  manageChannelsStatus: document.getElementById("manageChannelsStatus"),
  mcTabSelect: document.getElementById("mcTabSelect"),
  mcChannelInput: document.getElementById("mcChannelInput"),
  mcAddChannelBtn: document.getElementById("mcAddChannelBtn"),
  mcNewTabName: document.getElementById("mcNewTabName"),
  mcNewTabChannel: document.getElementById("mcNewTabChannel"),
  mcAddTabBtn: document.getElementById("mcAddTabBtn"),
  mcChannelList: document.getElementById("mcChannelList"),
  mcRenameTabInput: document.getElementById("mcRenameTabInput"),
  mcRenameTabBtn: document.getElementById("mcRenameTabBtn"),
  mcDeleteTabBtn: document.getElementById("mcDeleteTabBtn"),
  modalOverlay: document.getElementById("modalOverlay"),
  modalClose: document.getElementById("modalClose"),
  channelModalOverlay: document.getElementById("channelModalOverlay"),
  channelModalClose: document.getElementById("channelModalClose"),
  channelModalAvatar: document.getElementById("channelModalAvatar"),
  channelModalName: document.getElementById("channelModalName"),
  channelModalSub: document.getElementById("channelModalSub"),
  channelModalGrid: document.getElementById("channelModalGrid"),
  channelModalRevenue: document.getElementById("channelModalRevenue"),
  channelRpmMin: document.getElementById("channelRpmMin"),
  channelRpmMax: document.getElementById("channelRpmMax"),
  modalThumb: document.getElementById("modalThumb"),
  modalTitle: document.getElementById("modalTitle"),
  modalTitleVi: document.getElementById("modalTitleVi"),
  modalChannel: document.getElementById("modalChannel"),
  modalStats: document.getElementById("modalStats"),
  commentsList: document.getElementById("commentsList"),
  commentSortField: document.getElementById("commentSortField"),
  commentSortDir: document.getElementById("commentSortDir"),
  videoTableColgroup: document.getElementById("videoTableColgroup"),
  videoTableHeadRow: document.getElementById("videoTableHeadRow"),
  channelGroupSummary: document.getElementById("channelGroupSummary"),
  exportExcelBtn: document.getElementById("exportExcelBtn"),
};

function fmtNumber(n) {
  if (n === null || n === undefined) return "–";
  return new Intl.NumberFormat("vi-VN").format(n);
}

// viewsPerHourSource is "recent" (real delta vs. last fetch - reliable velocity)
// or "lifetime" (fallback average since publish - only happens for videos we're
// seeing for the first time, no previous data point to diff against yet).
function fmtViewsPerHour(v) {
  if (isVphExcluded(v)) {
    return `<span class="vph-live" title="Video ${escapeAttr(LIVE_STATUS_LABELS[v.liveStatus].short.toLowerCase())} - không tính view/giờ và không cộng vào Tổng VPH">–</span>`;
  }
  if (v.viewsPerHour === null || v.viewsPerHour === undefined) return "–";
  const num = fmtNumber(v.viewsPerHour);
  if (v.viewsPerHourSource === "lifetime") {
    return `${num} <span class="vph-badge" title="Chưa có mốc so sánh phù hợp (video mới thấy lần đầu, hoặc lần fetch trước cách quá lâu) - đây là trung bình cả đời video, không phải tốc độ gần đây">~</span>`;
  }
  if (v.vphWindowHours) {
    return `<span title="Tính trên ${escapeAttr(String(v.vphWindowHours))} giờ gần nhất">${num}</span>`;
  }
  return num;
}

function fmtDate(iso) {
  if (!iso) return "–";
  const d = new Date(iso);
  return d.toLocaleDateString("vi-VN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function fmtDateTime(iso) {
  if (!iso) return "–";
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function parseDurationToSeconds(iso) {
  if (!iso) return 0;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const h = parseInt(m[1] || "0", 10);
  const min = parseInt(m[2] || "0", 10);
  const s = parseInt(m[3] || "0", 10);
  return h * 3600 + min * 60 + s;
}

function fmtDuration(iso) {
  const total = parseDurationToSeconds(iso);
  if (!total) return "–";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// Phân loại theo thời lượng: Video ngắn (< 60 phút) / Video dài (từ 60 phút trở
// lên). Không hiển thị trong bảng dữ liệu - chỉ dùng khi xuất Excel.
function classifyVideoLength(v) {
  const minutes = parseDurationToSeconds(v.duration) / 60;
  return minutes >= 60 ? "Video dài" : "Video ngắn";
}

// ---------- Biến phân tích mở rộng (Lịch sử đăng / Tương tác / Nhóm kênh) ----------
// Các cột này LUÔN hiển thị trong bảng cùng các cột cơ bản - không còn cơ chế
// ẩn/hiện cột nữa. Ô "Chọn biến" (xem ALL_SORT_VARS/selectedSortVars bên dưới)
// giờ dùng để chọn NHIỀU biến để sắp xếp kết hợp (multi-column sort), không
// giới hạn số lượng biến được chọn.

const DAY_MS = 24 * 60 * 60 * 1000;

function getDaysAgo(v) {
  if (!v.publishedAt) return null;
  return Math.floor((Date.now() - new Date(v.publishedAt).getTime()) / DAY_MS);
}

// Video đăng từ bao nhiêu ngày trở lên thì số ở cột "Lịch sử đăng" được đổi màu (xem .days-old trong style.css).
const OLD_VIDEO_DAYS = 30;

function isOldVideo(v) {
  const d = getDaysAgo(v);
  return d !== null && d >= OLD_VIDEO_DAYS;
}

function renderDaysAgoCell(v) {
  const text = fmtDaysAgo(v);
  if (!isOldVideo(v)) return `<td class="col-num">${text}</td>`;
  return `<td class="col-num"><span class="days-old" title="Đã đăng từ ${OLD_VIDEO_DAYS} ngày trở lên">${text}</span></td>`;
}

function fmtDaysAgo(v) {
  const d = getDaysAgo(v);
  if (d === null) return "–";
  // Hiển thị thuần số (số ngày kể từ khi đăng), không kèm chữ. Đăng hôm nay = 0.
  return fmtNumber(Math.max(0, d));
}

// Tỷ lệ tương tác = (lượt thích + bình luận) / lượt xem. likeCount có thể null
// (kênh ẩn số liệu) - khi đó coi như 0 trong công thức, không loại cả video ra.
function getEngagementRate(v) {
  if (!v.viewCount) return null;
  const likes = v.likeCount || 0;
  const comments = v.commentCount || 0;
  return (likes + comments) / v.viewCount;
}

function fmtEngagement(v) {
  const r = getEngagementRate(v);
  if (r === null) return "–";
  return `${(r * 100).toFixed(2)}%`;
}

// Phân nhóm kênh theo sub: Kênh mới (<2K) / Kênh nhỏ (2K-10K) / Kênh lớn (>10K).
function classifyChannelGroup(subscriberCount) {
  if (subscriberCount === null || subscriberCount === undefined) {
    return { label: "Không rõ", cls: "unknown", rank: 0 };
  }
  if (subscriberCount < 2000) return { label: "Kênh mới", cls: "new", rank: 1 };
  if (subscriberCount <= 10000) return { label: "Kênh nhỏ", cls: "small", rank: 2 };
  return { label: "Kênh lớn", cls: "large", rank: 3 };
}

// Nhận xét nhanh khi di chuột vào lượt xem: Thất bại / Bình thường / Tiềm năng / Top View.
function classifyViewRating(viewCount) {
  if (viewCount === null || viewCount === undefined) return null;
  if (viewCount < 5000) return { label: "Thất bại", cls: "fail" };
  if (viewCount < 20000) return { label: "Bình thường", cls: "normal" };
  if (viewCount <= 100000) return { label: "Tiềm năng", cls: "potential" };
  return { label: "Top View", cls: "top" };
}

// ---------- Ngôn ngữ video (Tiếng Hàn / Tiếng Nhật) ----------
// scripts/fetch-data.mjs ghi v.language ("ko" | "ja" | mã khác | "und") cho từng
// video, suy ra từ chữ viết trong tiêu đề/mô tả, metadata và ngôn ngữ chủ đạo của
// kênh (xem scripts/language.mjs). App dùng đúng ngôn ngữ này làm ngôn ngữ NGUỒN
// khi dịch tiêu đề / bình luận sang Tiếng Việt và khi gửi dữ liệu cho trợ lý AI.
const LANG_INFO = {
  ko: { label: "Tiếng Hàn", short: "Hàn", flag: "🇰🇷", cls: "ko", rank: 1 },
  ja: { label: "Tiếng Nhật", short: "Nhật", flag: "🇯🇵", cls: "ja", rank: 2 },
  other: { label: "Ngôn ngữ khác", short: "Khác", flag: "🌐", cls: "other", rank: 3 },
};
const LANG_SOURCE_LABELS = {
  title: "nhận diện từ chữ viết trong tiêu đề",
  description: "nhận diện từ chữ viết trong mô tả video",
  metadata: "theo ngôn ngữ chủ kênh khai báo cho video",
  channel: "theo ngôn ngữ chủ đạo của kênh",
  client: "nhận diện từ tiêu đề trên trình duyệt",
  none: "không xác định được",
};

const HANGUL_RE = /[\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7AF\uD7B0-\uD7FF]/g;
const KANA_RE = /[\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF\uFF66-\uFF9F]/g;
const CJK_RE = /[\u3400-\u9FFF\uF900-\uFAFF]/;

// Cùng quy tắc với scripts/language.mjs: có Hangul -> ko, có Kana -> ja.
function detectScriptLang(text) {
  if (!text) return null;
  const ko = (String(text).match(HANGUL_RE) || []).length;
  const ja = (String(text).match(KANA_RE) || []).length;
  if (!ko && !ja) return null;
  return ko >= ja ? "ko" : "ja";
}

// Ngôn ngữ của video. Dữ liệu cũ chưa có trường language thì nhận diện tạm từ tiêu đề.
function getVideoLang(v) {
  if (v.language && v.language !== "und") return v.language;
  return detectScriptLang(v.title) || "und";
}

function langKey(lang) {
  return lang === "ko" || lang === "ja" ? lang : "other";
}

function langInfo(lang) {
  return LANG_INFO[langKey(lang)];
}

// Mã ngôn ngữ nguồn gửi cho Google Dịch: ko/ja dùng thẳng, còn lại để Google tự nhận diện.
function translateSource(lang) {
  return lang === "ko" || lang === "ja" ? lang : "auto";
}

// Ngôn ngữ nguồn cho 1 bình luận/trả lời. Bình luận thường cùng ngôn ngữ với
// video, nhưng khán giả quốc tế hay bình luận bằng tiếng khác (vd tiếng Anh dưới
// video tiếng Hàn) - nên ưu tiên chữ viết thật của bình luận:
//   có Hangul/Kana -> theo chữ viết; chỉ có Hán tự -> theo ngôn ngữ video;
//   không có chữ CJK nào -> để Google tự nhận diện.
function commentSourceLang(text, videoLang) {
  const byScript = detectScriptLang(text);
  if (byScript) return byScript;
  if (CJK_RE.test(text || "") && (videoLang === "ko" || videoLang === "ja")) return videoLang;
  return "auto";
}

function langSourceText(v) {
  const src = v.language && v.language !== "und" ? v.languageSource : detectScriptLang(v.title) ? "client" : "none";
  return LANG_SOURCE_LABELS[src] || "";
}

function renderLangBadge(v) {
  const lang = getVideoLang(v);
  const info = langInfo(lang);
  const extra = info.cls === "other" && lang !== "und" ? ` (${lang})` : "";
  return `<span class="lang-badge lang-badge--${info.cls}" title="${escapeAttr(`${info.label}${extra} - ${langSourceText(v)}`)}">${info.flag} ${info.short}</span>`;
}

// ---------- Live / công chiếu ----------
// liveStatus do scripts/fetch-data.mjs ghi (từ liveBroadcastContent + liveStreamingDetails):
//   "live" đang phát | "upcoming" sắp phát | "ended" từng live/công chiếu, nay là bản VOD | "none".
// API không phân biệt được live với công chiếu (premiere), nên dùng chung 1 nhãn.
const LIVE_STATUS_LABELS = {
  live: { short: "Đang live/công chiếu", text: "🔴 LIVE", cls: "live" },
  upcoming: { short: "Sắp phát", text: "⏳ Sắp phát", cls: "upcoming" },
  ended: { short: "Đã live/công chiếu", text: "Từng live", cls: "ended" },
};

// Trạng thái bị loại khỏi "Tổng VPH" và không hiện view/giờ. Bản VOD của live đã kết thúc
// ("ended") có tốc độ tăng view như video thường nên vẫn tính - muốn loại luôn thì thêm "ended" vào đây.
const VPH_EXCLUDED_LIVE_STATES = new Set(["live", "upcoming"]);

function isVphExcluded(v) {
  return VPH_EXCLUDED_LIVE_STATES.has(v.liveStatus);
}

// ---------- Loại video: "Video" (thường) hoặc "Live" (đang/sắp/đã từng live hoặc công chiếu) ----------
function classifyVideoType(v) {
  if (v.liveStatus === "live" || v.liveStatus === "upcoming" || v.liveStatus === "ended") {
    return { label: "Live", cls: "live", rank: 1 };
  }
  return { label: "Video", cls: "video", rank: 0 };
}

function renderLiveBadge(v) {
  const info = LIVE_STATUS_LABELS[v.liveStatus];
  if (!info) return "";
  const d = v.liveStreamingDetails || {};
  let tip = info.short;
  if (v.liveStatus === "upcoming" && d.scheduledStartTime) tip += ` - dự kiến ${fmtDateTime(d.scheduledStartTime)}`;
  if (v.liveStatus === "live" && d.actualStartTime) tip += ` - bắt đầu ${fmtDateTime(d.actualStartTime)}`;
  if (v.liveStatus === "ended" && d.actualEndTime) tip += ` - kết thúc ${fmtDateTime(d.actualEndTime)}`;
  return `<span class="live-badge live-badge--${info.cls}" title="${escapeAttr(tip)}">${info.text}</span> `;
}

// ---------- Nhóm cấp 2 trong ô "Chọn biến sắp xếp" (dùng để LỌC dữ liệu) ----------
// cls phải khớp với cls trả về từ classifyViewRating() / classifyChannelGroup().
const VIEW_GROUP_OPTIONS = [
  { cls: "fail", label: "Thất bại (< 5.000 view)" },
  { cls: "normal", label: "Bình thường (≥ 5.000 đến 20.000 view)" },
  { cls: "potential", label: "Tiềm năng (≥ 20.000 đến 100.000 view)" },
  { cls: "top", label: "Top View (> 100.000 view)" },
];
const CHANNEL_GROUP_OPTIONS = [
  { cls: "new", label: "Kênh mới (< 2K sub)" },
  { cls: "small", label: "Kênh nhỏ (2K - 10K sub)" },
  { cls: "large", label: "Kênh lớn (> 10K sub)" },
];
// Rỗng = không lọc (hiện tất cả). Có ≥1 phần tử = chỉ hiện video thuộc các nhóm đã chọn.
let selectedViewGroups = new Set();
let selectedChannelGroups = new Set(); // lọc bằng chip "Nhóm kênh" phía trên bảng
let selectedTimeRanges = new Set(); // chip thời gian: lt10 | 10to30 | gt30
let engagementOnly = false; // chip "Tương tác" = chỉ video có tỷ lệ tương tác > 1%
let baseVideos = [];
const titleTranslations = new Map(); // videoId -> tiêu đề đã dịch

function renderViewCountCell(v) {
  const rating = classifyViewRating(v.viewCount);
  const num = fmtNumber(v.viewCount);
  if (!rating) return num;
  return `<span class="view-rating view-rating--${rating.cls}" data-tooltip="${escapeAttr(rating.label)}">${num}</span>`;
}

// ---------- Định nghĩa cột: 6 cột cơ bản + 5 cột "biến" - TẤT CẢ luôn hiển thị ----------
// (Thích/Bình luận KHÔNG còn là cột trên bảng.)

const BASE_COLUMNS = [
  {
    key: "video",
    label: "Video",
    headClass: "col-video",
    colClass: "cg-video",
    sortField: null,
    renderCell: (v) => `
      <td>
        <div class="video-cell">
          <a class="video-cell__thumb-link" href="https://www.youtube.com/watch?v=${v.videoId}" target="_blank" rel="noopener" title="Mở video trên YouTube">
            <img src="${v.thumbnail}" alt="" loading="lazy" />
          </a>
          <div class="video-cell__info">
            <div class="video-cell__title" data-title-id="${v.videoId}">${renderLiveBadge(v)}${escapeHtml(v.title)}</div>
            <button class="comments-btn" data-video-id="${v.videoId}">💬 Xem bình luận</button>
          </div>
        </div>
      </td>`,
    excelValue: (v) => v.title || "",
  },
  {
    key: "channel",
    label: "Kênh",
    headClass: "col-channel",
    colClass: "cg-channel",
    sortField: null,
    renderCell: (v) => `
      <td class="channel-cell" data-channel-id="${v.channelId}">
        <img class="channel-cell__avatar" src="${v.channelThumbnail}" alt="" loading="lazy" />
        <span>${escapeHtml(v.channelTitle)}</span>
      </td>`,
    excelValue: (v) => v.channelTitle || "",
  },
  {
    key: "publishedAt",
    label: "Ngày đăng",
    headClass: "col-num",
    colClass: "cg-num",
    sortField: "publishedAt",
    renderCell: (v) => `<td class="col-num">${fmtDate(v.publishedAt)}</td>`,
    excelValue: (v) => fmtDate(v.publishedAt),
  },
  {
    key: "duration",
    label: "Thời lượng",
    headClass: "col-num",
    colClass: "cg-num",
    sortField: "duration",
    renderCell: (v) => `<td class="col-num">${fmtDuration(v.duration)}</td>`,
    excelValue: (v) => fmtDuration(v.duration),
  },
  {
    key: "viewCount",
    label: "Lượt xem",
    headClass: "col-num",
    colClass: "cg-num",
    sortField: "viewCount",
    renderCell: (v) => `<td class="col-num">${renderViewCountCell(v)}</td>`,
    excelValue: (v) => v.viewCount ?? "",
  },
  {
    key: "subscriberCount",
    label: "Sub kênh",
    headClass: "col-num",
    colClass: "cg-num",
    sortField: "subscriberCount",
    renderCell: (v) => `<td class="col-num">${fmtNumber(v.subscriberCount)}</td>`,
    excelValue: (v) => v.subscriberCount ?? "",
  },
];

// 5 cột "biến" mở rộng - luôn hiển thị trong bảng cùng BASE_COLUMNS (không còn
// bật/tắt hiển thị). Vẫn giữ định nghĩa riêng vì chúng cũng là các lựa chọn
// trong ô "Chọn biến sắp xếp" (xem ALL_SORT_VARS bên dưới).
const METRIC_COLUMNS = {
  language: {
    key: "language",
    label: "Ngôn ngữ",
    headClass: "col-num",
    colClass: "cg-num",
    sortField: "language",
    headTitle: "Ngôn ngữ gốc của video. Tiêu đề và bình luận được dịch sang Tiếng Việt từ đúng ngôn ngữ này.",
    renderCell: (v) => `<td class="col-num">${renderLangBadge(v)}</td>`,
    excelValue: (v) => {
      const lang = getVideoLang(v);
      const info = langInfo(lang);
      return info.cls === "other" && lang !== "und" ? `${info.label} (${lang})` : info.label;
    },
  },
  viewsPerHour: {
    key: "viewsPerHour",
    label: "View/giờ",
    headClass: "col-num",
    colClass: "cg-num",
    sortField: "viewsPerHour",
    headTitle: "Tốc độ tăng view (view/giờ), tính trên khoảng 6–24 giờ gần nhất. Dấu ~ = chưa có mốc so sánh nên đang là trung bình cả đời video. Video đang live/sắp phát không tính.",
    renderCell: (v) => `<td class="col-num">${fmtViewsPerHour(v)}</td>`,
    excelValue: (v) => (isVphExcluded(v) ? LIVE_STATUS_LABELS[v.liveStatus].short : v.viewsPerHour ?? ""),
  },
  daysAgo: {
    key: "daysAgo",
    label: "Lịch sử đăng",
    headClass: "col-num",
    colClass: "cg-num",
    sortField: "daysAgo",
    headTitle: `Số ngày kể từ khi video được đăng. Từ ${OLD_VIDEO_DAYS} ngày trở lên hiển thị màu khác.`,
    renderCell: (v) => renderDaysAgoCell(v),
    excelValue: (v) => getDaysAgo(v) ?? "",
  },
  engagement: {
    key: "engagement",
    label: "Tương tác",
    headClass: "col-num",
    colClass: "cg-num",
    sortField: "engagement",
    headTitle: "Tỷ lệ tương tác = (Lượt thích + Bình luận) / Lượt xem.",
    renderCell: (v) => `<td class="col-num">${fmtEngagement(v)}</td>`,
    excelValue: (v) => {
      const r = getEngagementRate(v);
      return r === null ? "" : +(r * 100).toFixed(2);
    },
  },
  channelGroup: {
    key: "channelGroup",
    label: "Nhóm kênh",
    headClass: "col-num",
    colClass: "cg-num",
    sortField: "channelGroup",
    headTitle: "Phân nhóm theo sub kênh: Kênh mới (<2K) / Kênh nhỏ (2K-10K) / Kênh lớn (>10K).",
    renderCell: (v) => {
      const g = classifyChannelGroup(v.subscriberCount);
      return `<td class="col-num"><span class="channel-group-badge channel-group-badge--${g.cls}">${g.label}</span></td>`;
    },
    excelValue: (v) => classifyChannelGroup(v.subscriberCount).label,
  },
  videoType: {
    key: "videoType",
    label: "Loại video",
    headClass: "col-num",
    colClass: "cg-num",
    sortField: "videoType",
    headTitle: "Phân loại video: Video (video thường) hoặc Live (đang live/sắp phát/đã từng live hoặc công chiếu).",
    renderCell: (v) => {
      const t = classifyVideoType(v);
      return `<td class="col-num"><span class="channel-group-badge channel-group-badge--${t.cls}">${t.label}</span></td>`;
    },
    excelValue: (v) => classifyVideoType(v).label,
  },
};

const METRIC_ORDER = ["language", "viewsPerHour", "daysAgo", "engagement", "channelGroup", "videoType"];
// Cả 5 biến (View/giờ, Lịch sử đăng, Tương tác, Nhóm kênh, Loại video) luôn hiện trong bảng.
const ALWAYS_VISIBLE_METRICS = ["language", "viewsPerHour", "daysAgo", "engagement", "channelGroup", "videoType"];
const CONDITIONAL_METRICS = []; // không còn cột nào ẩn/hiện theo lựa chọn - "Nhóm kênh" giờ hiển thị cố định

function getActiveColumns() {
  const metricCols = ALWAYS_VISIBLE_METRICS.map((k) => METRIC_COLUMNS[k]);
  for (const k of CONDITIONAL_METRICS) {
    if (selectedSortVars.includes(k)) metricCols.push(METRIC_COLUMNS[k]);
  }
  return [...BASE_COLUMNS, ...metricCols];
}

// ---------- Chọn biến để SẮP XẾP KẾT HỢP (multi-column sort) ----------
// Danh sách đầy đủ mọi biến có thể sắp xếp trong bảng - gồm cả các cột cơ bản
// (Ngày đăng, Thời lượng, Lượt xem, Sub kênh) lẫn 5 biến mở rộng (View/giờ,
// Lịch sử đăng, Tương tác, Nhóm kênh, Loại video). "Video" và "Kênh" không có
// ở đây vì là cột dạng chữ/ảnh, không có giá trị để sắp xếp.
const ALL_SORT_VARS = [
  ...BASE_COLUMNS.filter((c) => c.sortField).map((c) => ({ key: c.sortField, label: c.label })),
  ...METRIC_ORDER.filter((k) => k !== "channelGroup").map((k) => ({ key: METRIC_COLUMNS[k].sortField, label: METRIC_COLUMNS[k].label })),
];

// Mảng chứa các biến đang được tích chọn để sắp xếp KẾT HỢP ĐỒNG THỜI - thứ
// tự trong mảng KHÔNG quan trọng và không có biến nào được ưu tiên hơn biến
// nào (xem sortVideos(): dùng hạng trung bình - average rank - để kết hợp
// nhiều biến cùng lúc, không xét biến này trước rồi mới xét biến kia).
// Rỗng = không sắp xếp kết hợp, dùng lại sortField/sortDir (ô "Sắp xếp") như
// bình thường.
let selectedSortVars = [];

function getSortValue(v, field) {
  switch (field) {
    case "publishedAt":
      return new Date(v.publishedAt).getTime();
    case "duration":
      return parseDurationToSeconds(v.duration);
    case "daysAgo": {
      const d = getDaysAgo(v);
      return d === null ? -1 : d;
    }
    case "engagement": {
      const r = getEngagementRate(v);
      return r === null ? -1 : r;
    }
    case "channelGroup":
      return classifyChannelGroup(v.subscriberCount).rank;
    case "videoType":
      return classifyVideoType(v).rank;
    case "language":
      return langInfo(getVideoLang(v)).rank;
    default:
      return v[field] ?? -1;
  }
}

async function loadData() {
  els.tbody.innerHTML = `<tr><td colspan="${getActiveColumns().length}" class="empty-state"><span class="loading-plane">✈️</span> Đang tải dữ liệu...</td></tr>`;
  try {
    const [videosRes, metaRes] = await Promise.all([
      fetch(`data/videos-${currentList}.json`, { cache: "no-store" }),
      fetch(`data/meta-${currentList}.json`, { cache: "no-store" }),
    ]);
    dataMissing = !videosRes.ok;
    allVideos = videosRes.ok ? await videosRes.json() : [];
    const meta = metaRes.ok ? await metaRes.json() : null;

    populateChannelFilter();
    if (meta) {
      els.metaChannels.textContent = meta.channelCount ?? "–";
      els.metaVideos.textContent = meta.videoCount ?? allVideos.length;
      els.metaUpdated.textContent = meta.lastUpdated ? fmtDateTime(meta.lastUpdated) : "–";
    } else {
      els.metaVideos.textContent = allVideos.length;
    }
    // Tổng view 1/7 ngày = tổng lượt xem (hiện tại) của các video ĐĂNG trong
    // khoảng thời gian đó - không phải tốc độ tăng view.
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    let views1d = 0;
    let views7d = 0;
    for (const v of allVideos) {
      if (!v.publishedAt) continue;
      const ageMs = now - new Date(v.publishedAt).getTime();
      if (ageMs <= 7 * DAY_MS) views7d += v.viewCount || 0;
      if (ageMs <= DAY_MS) views1d += v.viewCount || 0;
    }
    els.metaViews1d.textContent = fmtNumber(views1d);
    els.metaViews7d.textContent = fmtNumber(views7d);
    // Tổng VPH của cả tab - tính trên toàn bộ video của danh sách đang chọn,
    // không bị ảnh hưởng bởi tìm kiếm/lọc kênh hiện tại.
    // Video đang live/sắp phát KHÔNG được cộng vào (xem isVphExcluded).
    let totalVph = 0;
    let excludedLive = 0;
    for (const v of allVideos) {
      if (isVphExcluded(v)) {
        excludedLive++;
        continue;
      }
      totalVph += v.viewsPerHour || 0;
    }
    els.metaTotalVph.textContent = fmtNumber(totalVph);
    const vphChip = els.metaTotalVph.parentElement;
    if (vphChip) {
      vphChip.title = excludedLive
        ? `Không tính ${excludedLive} video đang live/sắp phát`
        : "Tổng view/giờ của tất cả video trong tab";
    }
    applyFilters();
  } catch (err) {
    els.tbody.innerHTML = `<tr><td colspan="${getActiveColumns().length}" class="empty-state">Không tải được dữ liệu. Hãy chắc chắn GitHub Action đã chạy ít nhất 1 lần và public/data/videos-${currentList}.json tồn tại.</td></tr>`;
    els.metaTotalVph.textContent = "–";
    els.metaViews1d.textContent = "–";
    els.metaViews7d.textContent = "–";
    console.error(err);
  }
}

function switchList(listName) {
  if (listName === currentList) return;
  currentList = listName;
  els.marketTabs.querySelectorAll(".market-tab").forEach((btn) => {
    const isActive = btn.dataset.list === currentList;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  });
  els.search.value = "";
  selectedTimeRanges = new Set();
  selectedChannelGroups = new Set();
  engagementOnly = false;
  loadData();
}

// Tab được tạo tự động từ public/data/tabs.json - thêm/xoá tab trong
// channels.json (kể cả qua bảng "Quản lý kênh") là đủ, không cần sửa HTML.
async function loadTabs() {
  try {
    const res = await fetch("data/tabs.json", { cache: "no-store" });
    const tabs = res.ok ? await res.json() : [];
    renderTabs(tabs.length ? tabs : [currentList]);
  } catch (err) {
    console.error("Không tải được danh sách tab:", err);
    renderTabs([currentList]);
  }
}

function renderTabs(tabs) {
  if (!tabs.length) tabs = [currentList];
  if (!tabs.includes(currentList)) currentList = tabs[0];
  els.marketTabs.innerHTML = tabs
    .map(
      (t) =>
        `<button type="button" class="market-tab${t === currentList ? " active" : ""}" data-list="${escapeAttr(t)}" role="tab" aria-selected="${t === currentList}">${escapeHtml(t)}</button>`
    )
    .join("");
  els.marketTabs.querySelectorAll(".market-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchList(btn.dataset.list));
  });
  populateManageTabSelect(mcTabsLoaded ? Object.keys(mcTabsCache) : tabs);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s);
}

function populateChannelFilter() {
  const channels = new Map();
  for (const v of allVideos) {
    if (!channels.has(v.channelId)) {
      channels.set(v.channelId, { title: v.channelTitle, thumbnail: v.channelThumbnail || "" });
    }
  }
  const sorted = [...channels.entries()].sort((a, b) => a[1].title.localeCompare(b[1].title));
  allChannelIds = sorted.map(([id]) => id);
  // Empty selection means "all channels" - start with nothing checked = show everything.
  selectedChannelIds = new Set();

  els.channelFilterList.innerHTML = sorted
    .map(
      ([id, info]) => `
    <div class="channel-filter__item" data-id="${id}">
      <input type="checkbox" value="${id}" />
      <a class="channel-filter__link" href="https://www.youtube.com/channel/${id}" target="_blank" rel="noopener" title="Mở kênh trên YouTube">
        <img class="channel-filter__avatar" src="${info.thumbnail}" alt="" loading="lazy" />
        <span>${escapeHtml(info.title)}</span>
      </a>
    </div>`
    )
    .join("");

  els.channelFilterList.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) selectedChannelIds.add(cb.value);
      else selectedChannelIds.delete(cb.value);
      updateChannelFilterLabel();
      applyFilters();
    });
  });

  // Clicking anywhere on the row still toggles the filter checkbox, except
  // when the click is on the avatar/name link, which navigates to YouTube instead.
  els.channelFilterList.querySelectorAll(".channel-filter__item").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (e.target.closest(".channel-filter__link")) return;
      if (e.target.tagName === "INPUT") return;
      const cb = item.querySelector('input[type="checkbox"]');
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event("change"));
    });
  });

  updateChannelFilterLabel();
}

function updateChannelFilterLabel() {
  if (selectedChannelIds.size === 0 || selectedChannelIds.size === allChannelIds.length) {
    els.channelFilterLabel.textContent = "Tất cả kênh";
  } else if (selectedChannelIds.size === 1) {
    const id = [...selectedChannelIds][0];
    const cb = els.channelFilterList.querySelector(`input[value="${id}"]`);
    els.channelFilterLabel.textContent = cb ? cb.parentElement.querySelector("span").textContent : "1 kênh";
  } else {
    els.channelFilterLabel.textContent = `${selectedChannelIds.size} kênh đã chọn`;
  }
}

function toggleChannelPanel(forceOpen) {
  const isOpen = els.channelFilterWrap.classList.contains("open");
  const shouldOpen = forceOpen !== undefined ? forceOpen : !isOpen;
  els.channelFilterWrap.classList.toggle("open", shouldOpen);
}

els.channelFilterBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleChannelPanel();
});

document.addEventListener("click", (e) => {
  if (!els.channelFilterWrap.contains(e.target)) toggleChannelPanel(false);
  if (!els.fetchTriggerWrap.contains(e.target)) toggleFetchPanel(false);
  if (!els.manageChannelsWrap.contains(e.target)) toggleManagePanel(false);
});

function toggleFetchPanel(forceOpen) {
  const isOpen = els.fetchTriggerWrap.classList.contains("open");
  const shouldOpen = forceOpen !== undefined ? forceOpen : !isOpen;
  els.fetchTriggerWrap.classList.toggle("open", shouldOpen);
  if (shouldOpen) setFetchStatus("");
}

els.fetchTriggerBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleFetchPanel();
});

function setFetchStatus(message, kind) {
  els.fetchTriggerStatus.textContent = message;
  els.fetchTriggerStatus.classList.toggle("visible", Boolean(message));
  els.fetchTriggerStatus.classList.remove("fetch-trigger__status--ok", "fetch-trigger__status--error");
  if (kind) els.fetchTriggerStatus.classList.add(`fetch-trigger__status--${kind}`);
}

async function submitFetchTrigger() {
  els.fetchTriggerSubmit.disabled = true;
  setFetchStatus("Đang gửi yêu cầu...", "");

  try {
    const res = await fetch("/api/trigger-fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        forceRefreshComments: els.fetchForceRefresh.checked,
        fullChannelHistory: els.fetchFullHistory.checked,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      setFetchStatus(
        "Đã kích hoạt! Quá trình lấy dữ liệu chạy nền vài phút, tải lại trang sau đó để xem kết quả mới.",
        "ok"
      );
    } else {
      setFetchStatus(data.error || "Có lỗi xảy ra, thử lại sau.", "error");
    }
  } catch (err) {
    setFetchStatus("Không kết nối được tới server.", "error");
  } finally {
    els.fetchTriggerSubmit.disabled = false;
  }
}

els.fetchTriggerSubmit.addEventListener("click", submitFetchTrigger);

// ===== Quản lý kênh (thêm/xoá kênh, thêm/xoá tab) =====

let mcTabsCache = {}; // { tabName: [channel, ...] }
let mcTabsLoaded = false; // true khi mcTabsCache đã lấy từ server (nguồn mới nhất)

function toggleManagePanel(forceOpen) {
  const isOpen = els.manageChannelsWrap.classList.contains("open");
  const shouldOpen = forceOpen !== undefined ? forceOpen : !isOpen;
  els.manageChannelsWrap.classList.toggle("open", shouldOpen);
  if (shouldOpen) {
    setManageStatus("");
    loadManageTabs();
  }
}

els.manageChannelsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleManagePanel();
});

function setManageStatus(message, kind) {
  els.manageChannelsStatus.textContent = message;
  els.manageChannelsStatus.classList.toggle("visible", Boolean(message));
  els.manageChannelsStatus.classList.remove("fetch-trigger__status--ok", "fetch-trigger__status--error");
  if (kind) els.manageChannelsStatus.classList.add(`fetch-trigger__status--${kind}`);
}

function populateManageTabSelect(tabs) {
  const prevValue = els.mcTabSelect.value;
  els.mcTabSelect.innerHTML = tabs.map((t) => `<option value="${escapeAttr(t)}">${escapeHtml(t)}</option>`).join("");
  if (tabs.includes(prevValue)) els.mcTabSelect.value = prevValue;
}

async function loadManageTabs() {
  try {
    const res = await fetch("/api/manage-channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "listTabs" }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.channels) {
      mcTabsCache = data.channels;
      mcTabsLoaded = true;
      populateManageTabSelect(Object.keys(mcTabsCache));
      renderManageChannelList();
    }
  } catch (err) {
    // Im lặng - danh sách kênh vẫn dùng được từ cache trước đó (nếu có).
  }
}

function renderManageChannelList() {
  const tab = els.mcTabSelect.value;
  const list = mcTabsCache[tab] || [];
  if (!list.length) {
    els.mcChannelList.innerHTML = `<div class="manage-channels__empty">Chưa có kênh nào trong tab này.</div>`;
    return;
  }
  els.mcChannelList.innerHTML = list
    .map(
      (c) =>
        `<div class="manage-channels__item">
          <span class="manage-channels__item-text">${escapeHtml(c)}</span>
          <button type="button" class="manage-channels__remove" data-channel="${escapeAttr(c)}" title="Xoá kênh này">✕</button>
        </div>`
    )
    .join("");
  els.mcChannelList.querySelectorAll(".manage-channels__remove").forEach((btn) => {
    btn.addEventListener("click", () => removeChannel(tab, btn.dataset.channel));
  });
}

els.mcTabSelect.addEventListener("change", renderManageChannelList);

async function callManageChannels(payload, busyBtn) {
  if (busyBtn) busyBtn.disabled = true;
  setManageStatus("Đang xử lý...", "");
  try {
    const res = await fetch("/api/manage-channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setManageStatus("Xong! Dữ liệu sẽ tự cập nhật trong vài phút.", "ok");
      // Dùng danh sách tab vừa trả về từ server (đã là bản mới nhất), KHÔNG đọc lại
      // data/tabs.json - file đó trên trang web chỉ cập nhật sau khi workflow chạy
      // xong và Vercel deploy lại, đọc lúc này sẽ ra danh sách tab cũ.
      if (data.channels) mcTabsCache = data.channels;
      mcTabsLoaded = true;
      renderTabs(Object.keys(mcTabsCache));
      renderManageChannelList();
      return true;
    }
    setManageStatus(data.error || "Có lỗi xảy ra, thử lại sau.", "error");
    return false;
  } catch (err) {
    setManageStatus("Không kết nối được tới server.", "error");
    return false;
  } finally {
    if (busyBtn) busyBtn.disabled = false;
  }
}

els.mcAddChannelBtn.addEventListener("click", async () => {
  const tab = els.mcTabSelect.value;
  const channel = els.mcChannelInput.value.trim();
  if (!tab) return setManageStatus("Chưa có tab nào - tạo tab mới trước đã.", "error");
  if (!channel) return setManageStatus("Dán link/handle kênh trước đã.", "error");
  const ok = await callManageChannels({ action: "addChannel", tab, channel }, els.mcAddChannelBtn);
  if (ok) els.mcChannelInput.value = "";
});

els.mcAddTabBtn.addEventListener("click", async () => {
  const tab = els.mcNewTabName.value.trim();
  const channel = els.mcNewTabChannel.value.trim();
  if (!tab) return setManageStatus("Nhập tên tab mới trước đã.", "error");
  if (!channel) return setManageStatus("Dán link/handle kênh đầu tiên trước đã.", "error");
  const ok = await callManageChannels({ action: "addTab", tab, channel }, els.mcAddTabBtn);
  if (ok) {
    els.mcNewTabName.value = "";
    els.mcNewTabChannel.value = "";
    els.mcTabSelect.value = tab;
    renderManageChannelList();
  }
});

els.mcRenameTabBtn.addEventListener("click", async () => {
  const tab = els.mcTabSelect.value;
  const newTabName = els.mcRenameTabInput.value.trim();
  if (!tab) return setManageStatus("Chưa có tab nào để đổi tên.", "error");
  if (!newTabName) return setManageStatus("Nhập tên mới cho tab trước đã.", "error");
  const wasCurrent = tab === currentList;
  const ok = await callManageChannels({ action: "renameTab", tab, newTab: newTabName }, els.mcRenameTabBtn);
  if (ok) {
    els.mcRenameTabInput.value = "";
    els.mcTabSelect.value = newTabName;
    renderManageChannelList();
    if (wasCurrent) {
      currentList = newTabName;
      els.marketTabs.querySelectorAll(".market-tab").forEach((btn) => {
        const isActive = btn.dataset.list === currentList;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-selected", String(isActive));
      });
      loadData();
    }
  }
});

els.mcDeleteTabBtn.addEventListener("click", async () => {
  const tab = els.mcTabSelect.value;
  if (!tab) return setManageStatus("Chưa có tab nào để xoá.", "error");
  if (Object.keys(mcTabsCache).length <= 1) {
    return setManageStatus("Không thể xoá tab cuối cùng - cần ít nhất 1 tab.", "error");
  }
  if (!confirm(`Xoá toàn bộ tab "${tab}" và danh sách kênh trong đó? Không thể hoàn tác.`)) return;
  const wasCurrent = tab === currentList;
  const ok = await callManageChannels({ action: "removeTab", tab }, els.mcDeleteTabBtn);
  // Nếu vừa xoá đúng tab đang xem, loadTabs() bên trong callManageChannels đã
  // tự chuyển currentList sang tab đầu tiên còn lại - chỉ cần tải lại dữ liệu.
  if (ok && wasCurrent) loadData();
});

async function removeChannel(tab, channel) {
  if (!confirm(`Xoá kênh này khỏi tab "${tab}"?\n${channel}`)) return;
  await callManageChannels({ action: "removeChannel", tab, channel });
}

els.selectAllChannels.addEventListener("click", () => {
  selectedChannelIds = new Set(allChannelIds);
  els.channelFilterList.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = true));
  updateChannelFilterLabel();
  applyFilters();
});

els.clearAllChannels.addEventListener("click", () => {
  selectedChannelIds = new Set();
  els.channelFilterList.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = false));
  updateChannelFilterLabel();
  applyFilters();
});

function applyFilters() {
  const q = els.search.value.trim().toLowerCase();
  const filterActive = selectedChannelIds.size > 0 && selectedChannelIds.size < allChannelIds.length;
  const passesBase = (v) => {
    if (filterActive && !selectedChannelIds.has(v.channelId)) return false;
    // Lọc theo nhóm cấp 2 của "Lượt xem" (Thất bại/Bình thường/Tiềm năng/Top View).
    if (selectedViewGroups.size > 0) {
      const g = classifyViewRating(v.viewCount);
      if (!g || !selectedViewGroups.has(g.cls)) return false;
    }
    if (!q) return true;
    return (
      v.title.toLowerCase().includes(q) ||
      v.channelTitle.toLowerCase().includes(q)
    );
  };

  // Chip nhóm kênh / tương tác: lọc thêm ở bước sau, còn số đếm trên chip tính
  // từ tập "base" để các chip không biến mất khi đang được chọn.
  baseVideos = allVideos.filter(passesBase);
  filteredVideos = baseVideos.filter((v) => {
    if (selectedChannelGroups.size > 0 && !selectedChannelGroups.has(classifyChannelGroup(v.subscriberCount).cls)) return false;
    if (selectedTimeRanges.size > 0 && !selectedTimeRanges.has(timeBucket(v))) return false;
    if (engagementOnly) {
      const r = getEngagementRate(v);
      if (r === null || !(r > 0.01)) return false;
    }
    return true;
  });

  sortVideos();
  renderTable();
  renderChannelGroupSummary();
}

function sortVideos() {
  const dir = sortDir === "asc" ? 1 : -1;

  // Sắp xếp kết hợp ĐỒNG THỜI: khi có ≥1 biến được tích trong ô "Chọn biến",
  // KHÔNG xét biến này trước rồi mới xét biến kia (không phải tie-break tuần
  // tự). Thay vào đó, mỗi biến được xếp hạng RIÊNG theo đúng chiều tăng/giảm
  // đang chọn ở ô "Sắp xếp" (hạng 0 = đứng đầu bảng nếu chỉ xét 1 mình biến
  // đó), rồi lấy TRUNG BÌNH các hạng của mọi biến đã tích để ra 1 điểm kết
  // hợp duy nhất cho từng video. Video có điểm trung bình thấp nhất - tức
  // đứng đầu ở NHIỀU biến cùng lúc - sẽ lên đầu bảng. Cách này tránh việc 1
  // biến có thang đo lớn hơn (vd lượt xem) át hẳn 1 biến có thang đo nhỏ hơn
  // (vd tỷ lệ tương tác %) nếu cộng thẳng giá trị thô lại với nhau.
  if (selectedSortVars.length > 0) {
    const rankByField = selectedSortVars.map((field) => {
      const ranked = [...filteredVideos].sort((a, b) => {
        const av = getSortValue(a, field);
        const bv = getSortValue(b, field);
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
      const rankMap = new Map();
      ranked.forEach((v, idx) => rankMap.set(v.videoId, idx));
      return rankMap;
    });

    const avgRank = new Map();
    for (const v of filteredVideos) {
      const sum = rankByField.reduce((acc, rankMap) => acc + rankMap.get(v.videoId), 0);
      avgRank.set(v.videoId, sum / rankByField.length);
    }

    filteredVideos.sort((a, b) => avgRank.get(a.videoId) - avgRank.get(b.videoId));
    return;
  }

  filteredVideos.sort((a, b) => {
    const av = getSortValue(a, sortField);
    const bv = getSortValue(b, sortField);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

function renderTableHeader() {
  const columns = getActiveColumns();

  els.videoTableColgroup.innerHTML = columns.map((c) => `<col class="${c.colClass}" />`).join("");

  els.videoTableHeadRow.innerHTML = columns
    .map((c) => {
      const fieldAttr = c.sortField ? ` data-field="${c.sortField}"` : "";
      const titleAttr = c.headTitle ? ` title="${escapeAttr(c.headTitle)}"` : "";
      const isActive = c.sortField
        ? selectedSortVars.length > 0
          ? selectedSortVars.includes(c.sortField)
          : c.sortField === sortField
        : false;
      return `<th class="${c.headClass}${isActive ? " active-sort" : ""}"${fieldAttr}${titleAttr}>${escapeHtml(c.label)}</th>`;
    })
    .join("");

  els.videoTableHeadRow.querySelectorAll("th[data-field]").forEach((th) => {
    th.addEventListener("click", () => {
      const field = th.dataset.field;
      // Bấm thẳng vào 1 cột = chọn sắp xếp đơn theo đúng cột đó - thoát khỏi
      // chế độ sắp xếp kết hợp (nếu đang bật) để tránh gây khó hiểu (vừa tích
      // nhiều biến trong ô "Chọn biến" vừa bấm cột lại ra kết quả khác nhau).
      selectedSortVars = [];
      els.sortField.value = field;
      sortField = field;
      applyFilters();
    });
  });
}

function renderTable() {
  renderTableHeader();
  const columns = getActiveColumns();

  if (!filteredVideos.length) {
    const msg = dataMissing
      ? `Tab "${escapeHtml(currentList)}" chưa có dữ liệu. Nếu bạn vừa tạo tab, thêm kênh hoặc đổi tên tab, hệ thống cần vài phút để lấy dữ liệu và cập nhật trang - tải lại trang sau ít phút. Tab chưa có kênh nào thì thêm kênh trong "Quản lý kênh".`
      : allVideos.length
      ? "Không có video phù hợp với bộ lọc hiện tại."
      : `Tab "${escapeHtml(currentList)}" chưa có video nào. Thêm kênh trong "Quản lý kênh".`;
    els.tbody.innerHTML = `<tr><td colspan="${columns.length}" class="empty-state">${msg}</td></tr>`;
    return;
  }

  els.tbody.innerHTML = filteredVideos
    .map((v) => `<tr>${columns.map((c) => c.renderCell(v)).join("")}</tr>`)
    .join("");

  els.tbody.querySelectorAll(".comments-btn").forEach((btn) => {
    btn.addEventListener("click", () => openModal(btn.dataset.videoId));
  });

  els.tbody.querySelectorAll(".channel-cell").forEach((cell) => {
    cell.addEventListener("click", () => openChannelModal(cell.dataset.channelId));
  });

}

// ---------- Tóm tắt nhóm kênh - vì cột "Nhóm kênh" giờ hiển thị cố định nên thanh
// này cũng luôn hiện khi có nhiều hơn 1 kênh trong dữ liệu đang lọc (tích chọn
// nhiều kênh -> tự động tập hợp và hiển thị số kênh theo từng nhóm). ----------
// Nhóm thời gian theo số ngày kể từ khi đăng: <10 | 10-29 | >=30
const TIME_RANGE_OPTIONS = [
  { cls: "lt10", label: "Dưới 10 ngày" },
  { cls: "10to30", label: "Từ 10 - 30 ngày" },
  { cls: "gt30", label: "Trên 30 ngày" },
];
function timeBucket(v) {
  const d = getDaysAgo(v);
  if (d === null) return null;
  if (d < 10) return "lt10";
  if (d < 30) return "10to30";
  return "gt30";
}

function renderChannelGroupSummary() {
  // Đếm số kênh theo nhóm trên tập "baseVideos" (chưa áp chip) để chip luôn ổn định.
  const channelSubs = new Map();
  for (const v of baseVideos) {
    if (!channelSubs.has(v.channelId)) channelSubs.set(v.channelId, v.subscriberCount);
  }
  if (!allVideos.length) {
    els.channelGroupSummary.innerHTML = "";
    els.channelGroupSummary.classList.remove("visible");
    return;
  }

  const counts = { new: 0, small: 0, large: 0, unknown: 0 };
  const labels = { new: "Kênh mới", small: "Kênh nhỏ", large: "Kênh lớn", unknown: "Không rõ" };
  for (const sub of channelSubs.values()) counts[classifyChannelGroup(sub).cls]++;
  const engageCount = baseVideos.filter((v) => {
    const r = getEngagementRate(v);
    return r !== null && r > 0.01;
  }).length;

  const timeCounts = { lt10: 0, "10to30": 0, gt30: 0 };
  for (const v of baseVideos) {
    const b = timeBucket(v);
    if (b) timeCounts[b]++;
  }
  const timeChips = TIME_RANGE_OPTIONS.map((o) => {
    const active = selectedTimeRanges.has(o.cls) ? " is-active" : "";
    return `<button type="button" class="channel-group-badge channel-group-badge--time channel-group-badge--filter${active}" data-time="${o.cls}" title="Chỉ hiện video đăng trong khoảng này (bấm lại để bỏ lọc)">${o.label} · ${fmtNumber(timeCounts[o.cls])}</button>`;
  }).join("");

  const groupChips = Object.entries(counts)
    .filter(([cls, n]) => cls !== "unknown" || n > 0)
    .map(([cls, n]) => {
      const active = selectedChannelGroups.has(cls) ? " is-active" : "";
      return `<button type="button" class="channel-group-badge channel-group-badge--${cls} channel-group-badge--filter${active}" data-group="${cls}" title="Bấm để lọc bảng theo nhóm này (bấm lại để bỏ lọc)">${labels[cls]} · ${n}</button>`;
    })
    .join("");
  const engageChip = `<button type="button" class="channel-group-badge channel-group-badge--engage channel-group-badge--filter${engagementOnly ? " is-active" : ""}" data-engage="1" title="Chỉ hiện video có tỷ lệ tương tác > 1%">Tương tác > 1% · ${fmtNumber(engageCount)} video</button>`;

  els.channelGroupSummary.innerHTML =
    `<span class="channel-group-summary__label">Nhóm kênh (${channelSubs.size} kênh):</span>` +
    groupChips +
    `<span class="channel-group-summary__sep"></span>` +
    engageChip +
    `<span class="channel-group-summary__sep"></span>` +
    timeChips;
  els.channelGroupSummary.classList.add("visible");
}

els.channelGroupSummary.addEventListener("click", (e) => {
  const chip = e.target.closest(".channel-group-badge--filter");
  if (!chip) return;
  if (chip.dataset.engage) {
    engagementOnly = !engagementOnly;
  } else if (chip.dataset.time) {
    const t = chip.dataset.time;
    if (selectedTimeRanges.has(t)) selectedTimeRanges.delete(t);
    else selectedTimeRanges.add(t);
  } else {
    const g = chip.dataset.group;
    if (selectedChannelGroups.has(g)) selectedChannelGroups.delete(g);
    else selectedChannelGroups.add(g);
  }
  applyFilters();
});

// ---------- Dịch sang Tiếng Việt, nguồn = đúng ngôn ngữ của video/bình luận ----------
async function translateText(text, sl = "auto") {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json[0].map((chunk) => chunk[0]).join("");
}

function googleTranslateLink(text, sl) {
  return `https://translate.google.com/?sl=${encodeURIComponent(sl)}&tl=vi&text=${encodeURIComponent(text)}&op=translate`;
}

// Bản dịch tiêu đề dùng chung cho tooltip trong bảng và modal bình luận.
async function getTitleTranslation(v) {
  if (titleTranslations.has(v.videoId)) return titleTranslations.get(v.videoId);
  const text = await translateText(v.title, translateSource(getVideoLang(v)));
  titleTranslations.set(v.videoId, text);
  return text;
}

// ---------- Rê chuột vào tiêu đề video -> hiện bản dịch Tiếng Việt ----------
let titleTipEl = null;
let titleTipFor = null; // videoId đang được rê chuột

function getTitleTip() {
  if (!titleTipEl) {
    titleTipEl = document.createElement("div");
    titleTipEl.className = "title-tooltip";
    document.body.appendChild(titleTipEl);
  }
  return titleTipEl;
}

function moveTitleTip(e) {
  const tip = getTitleTip();
  const pad = 14;
  let x = e.clientX + pad;
  let y = e.clientY + pad + 6;
  if (x + tip.offsetWidth > window.innerWidth - 8) x = Math.max(8, window.innerWidth - tip.offsetWidth - 8);
  if (y + tip.offsetHeight > window.innerHeight - 8) y = Math.max(8, e.clientY - tip.offsetHeight - pad);
  tip.style.left = x + "px";
  tip.style.top = y + "px";
}

async function showTitleTranslation(videoId, e) {
  const tip = getTitleTip();
  titleTipFor = videoId;
  const v = allVideos.find((x) => x.videoId === videoId);
  if (!v) return;
  const prefix = `${langInfo(getVideoLang(v)).flag} ${langInfo(getVideoLang(v)).short} → Việt: `;
  const cached = titleTranslations.get(videoId);
  tip.textContent = cached ? prefix + cached : "Đang dịch...";
  tip.classList.toggle("title-tooltip--pending", !cached);
  tip.classList.add("visible");
  moveTitleTip(e);
  if (cached) return;
  try {
    const text = await getTitleTranslation(v);
    if (titleTipFor === videoId) {
      tip.textContent = prefix + text;
      tip.classList.remove("title-tooltip--pending");
    }
  } catch (err) {
    if (titleTipFor === videoId) tip.textContent = "Không dịch được, rê chuột lại để thử lại.";
  }
}

function hideTitleTip() {
  titleTipFor = null;
  if (titleTipEl) titleTipEl.classList.remove("visible");
}

els.tbody.addEventListener("mouseover", (e) => {
  const el = e.target.closest(".video-cell__title");
  if (!el || el.contains(e.relatedTarget)) return;
  showTitleTranslation(el.dataset.titleId, e);
});
els.tbody.addEventListener("mousemove", (e) => {
  if (titleTipFor && e.target.closest(".video-cell__title")) moveTitleTip(e);
});
els.tbody.addEventListener("mouseout", (e) => {
  const el = e.target.closest(".video-cell__title");
  if (el && !el.contains(e.relatedTarget)) hideTitleTip();
});
window.addEventListener("scroll", hideTitleTip, true);

// ---------- Xuất Excel ----------

// Cột giá trị thường (không phải link) chỉ xuất hiện khi xuất Excel, không
// hiển thị trên bảng dữ liệu trên web - phân loại theo thời lượng (Video ngắn
// < 60 phút / Video dài >= 60 phút). Thời lượng gốc (mm:ss) đã có sẵn ở cột
// "Thời lượng" trên bảng nên không lặp lại ở đây.
const VALUE_EXPORT_COLUMNS = [{ label: "Loại thời lượng", value: (v) => classifyVideoLength(v) }];

// Link (video + ảnh thumbnail) của từng video khi xuất Excel.
//  - Link video: mở thẳng video trên YouTube.
//  - HD: ảnh 1280x720 (maxresdefault). Gần như mọi video HD đều có, nhưng một số
//    video (thường là video cũ/độ phân giải thấp) YouTube không tạo ảnh này -> mở ra báo 404.
//  - Dự phòng: ảnh 320x180 đã lưu sẵn trong dữ liệu (luôn mở được).
const THUMB_EXPORT_COLUMNS = [
  { label: "Link video", getUrl: (v) => `https://www.youtube.com/watch?v=${v.videoId}` },
  { label: "Link thumbnail HD (1280x720)", getUrl: (v) => `https://i.ytimg.com/vi/${v.videoId}/maxresdefault.jpg` },
  {
    label: "Link thumbnail dự phòng (320x180)",
    getUrl: (v) => v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
  },
];

function exportToExcel() {
  if (typeof XLSX === "undefined") {
    alert("Không tải được thư viện xuất Excel (kiểm tra kết nối mạng rồi thử lại).");
    return;
  }
  if (!filteredVideos.length) {
    alert("Không có dữ liệu để xuất.");
    return;
  }
  const columns = getActiveColumns();
  // Thêm các cột thời lượng + link vào CUỐI file Excel (chỉ có trong file xuất, không hiện trên bảng web).
  const header = [
    ...columns.map((c) => c.label),
    ...VALUE_EXPORT_COLUMNS.map((c) => c.label),
    ...THUMB_EXPORT_COLUMNS.map((c) => c.label),
  ];
  const rows = filteredVideos.map((v) => [
    ...columns.map((c) => c.excelValue(v)),
    ...VALUE_EXPORT_COLUMNS.map((c) => c.value(v)),
    ...THUMB_EXPORT_COLUMNS.map((c) => c.getUrl(v)),
  ]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  // Biến ô link (video + thumbnail) thành hyperlink bấm được trong Excel.
  const linkColOffset = columns.length + VALUE_EXPORT_COLUMNS.length;
  filteredVideos.forEach((v, i) => {
    THUMB_EXPORT_COLUMNS.forEach((c, j) => {
      const cell = ws[XLSX.utils.encode_cell({ r: i + 1, c: linkColOffset + j })];
      if (cell) cell.l = { Target: c.getUrl(v), Tooltip: c.label === "Link video" ? "Mở video trên YouTube" : "Mở ảnh thumbnail" };
    });
  });
  ws["!cols"] = [
    ...columns.map((c) => ({ wch: c.key === "video" ? 50 : c.key === "channel" ? 24 : 14 })),
    ...VALUE_EXPORT_COLUMNS.map(() => ({ wch: 14 })),
    ...THUMB_EXPORT_COLUMNS.map(() => ({ wch: 46 })),
  ];
  const wb = XLSX.utils.book_new();
  const sheetName = String(currentList).slice(0, 31) || "Data";
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `yt-tracker-${currentList}-${dateStr}.xlsx`);
}

els.exportExcelBtn.addEventListener("click", exportToExcel);


// ---------- Modal & comments ----------

let currentModalVideo = null;
let currentCommentsMaxAge = 0;

async function openModal(videoId) {
  const video = allVideos.find((v) => v.videoId === videoId);
  if (!video) return;

  els.modalOverlay.classList.add("open");
  els.modalThumb.src = video.thumbnail;
  els.modalTitle.textContent = video.title;
  currentModalVideo = video;
  els.modalTitleVi.textContent = "Đang dịch tiêu đề...";
  getTitleTranslation(video)
    .then((t) => {
      if (currentModalVideo === video) els.modalTitleVi.textContent = t;
    })
    .catch(() => {
      if (currentModalVideo === video) els.modalTitleVi.textContent = "";
    });
  els.modalChannel.textContent = video.channelTitle;
  els.modalStats.innerHTML = `
    ${renderLangBadge(video)}
    <span>${fmtNumber(video.viewCount)} lượt xem</span>
    <span>${fmtNumber(video.likeCount)} thích</span>
    <span>${fmtNumber(video.commentCount)} bình luận</span>
    <span>${fmtDate(video.publishedAt)}</span>
  `;
  els.commentsList.innerHTML = `<div class="empty-state"><span class="loading-plane">✈️</span> Đang tải bình luận...</div>`;

  try {
    const res = await fetch(`data/comments/${videoId}.json`, { cache: "no-store" });
    if (!res.ok) throw new Error("no comments file");
    const data = await res.json();
    if (data.disabled) {
      currentComments = [];
      els.commentsList.innerHTML = `<div class="empty-state">Video này đã tắt bình luận.</div>`;
      return;
    }
    currentComments = data.comments || [];
    currentCommentsMaxAge = data.maxAgeDays || 0;
    renderComments();
  } catch (err) {
    currentComments = [];
    els.commentsList.innerHTML = `<div class="empty-state">Chưa có dữ liệu bình luận cho video này. Video mới thêm sẽ có bình luận sau lần lấy dữ liệu tiếp theo.</div>`;
  }
}

function renderComments() {
  if (!currentComments.length) {
    els.commentsList.innerHTML =
      currentCommentsMaxAge > 0 && currentModalVideo?.commentCount > 0
        ? `<div class="empty-state">Không có bình luận nào trong ${currentCommentsMaxAge} ngày gần nhất (app chỉ lưu bình luận mới trong khoảng này; video có ${fmtNumber(currentModalVideo.commentCount)} bình luận tổng cộng).</div>`
        : `<div class="empty-state">Video chưa có bình luận.</div>`;
    return;
  }

  const dir = commentSortDir === "asc" ? 1 : -1;
  const sorted = [...currentComments].sort((a, b) => {
    let av = a[commentSortField];
    let bv = b[commentSortField];
    if (commentSortField === "publishedAt") {
      av = new Date(av).getTime();
      bv = new Date(bv).getTime();
    }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  els.commentsList.innerHTML = sorted
    .map((c, i) => {
      const replies = c.replies || [];
      const replyCount = c.replyCount || replies.length;
      return `
    <div class="comment" data-idx="${i}">
      <div class="comment__head">
        <img class="comment__avatar" src="${c.authorImage}" alt="" loading="lazy" />
        <span class="comment__author">${escapeHtml(c.author)}</span>
        <span class="comment__date">${fmtDate(c.publishedAt)}</span>
      </div>
      <div class="comment__text">${escapeHtml(c.text)}</div>
      <div class="comment__footer">
        <span class="comment__likes">♥ ${fmtNumber(c.likeCount)} lượt thích</span>
        <button class="translate-btn" data-idx="${i}" data-kind="comment">Dịch sang Tiếng Việt</button>
        ${
          replyCount > 0
            ? `<button class="replies-toggle-btn" data-idx="${i}" data-count="${replyCount}">💬 Xem ${fmtNumber(replyCount)} trả lời</button>`
            : ""
        }
      </div>
      <div class="comment__translation" id="translation-${i}"></div>
      ${
        replyCount > 0
          ? `<div class="comment__replies" id="replies-${i}">${renderReplies(replies, i)}</div>`
          : ""
      }
    </div>`;
    })
    .join("");

  els.commentsList.querySelectorAll(".translate-btn[data-kind='comment']").forEach((btn) => {
    btn.addEventListener("click", () => translateComment(sorted, btn.dataset.idx));
  });

  els.commentsList.querySelectorAll(".translate-btn[data-kind='reply']").forEach((btn) => {
    const [ci, ri] = btn.dataset.idx.split(":");
    btn.addEventListener("click", () => translateReply(sorted[ci].replies, ci, ri));
  });

  els.commentsList.querySelectorAll(".replies-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => toggleReplies(btn));
  });
}

function renderReplies(replies, commentIdx) {
  if (!replies.length) {
    return `<div class="reply reply--empty">Chưa có dữ liệu nội dung trả lời cho bình luận này.</div>`;
  }
  return replies
    .map(
      (r, ri) => `
    <div class="reply">
      <div class="reply__head">
        <img class="reply__avatar" src="${r.authorImage}" alt="" loading="lazy" />
        <span class="reply__author">${escapeHtml(r.author)}</span>
        <span class="reply__date">${fmtDate(r.publishedAt)}</span>
      </div>
      <div class="reply__text">${escapeHtml(r.text)}</div>
      <div class="reply__footer">
        <span class="reply__likes">♥ ${fmtNumber(r.likeCount)} lượt thích</span>
        <button class="translate-btn translate-btn--small" data-idx="${commentIdx}:${ri}" data-kind="reply">Dịch sang Tiếng Việt</button>
      </div>
      <div class="comment__translation" id="translation-reply-${commentIdx}-${ri}"></div>
    </div>`
    )
    .join("");
}

function toggleReplies(btn) {
  const idx = btn.dataset.idx;
  const count = btn.dataset.count;
  const box = document.getElementById(`replies-${idx}`);
  if (!box) return;
  const isOpen = box.classList.toggle("open");
  btn.textContent = isOpen ? "Ẩn trả lời" : `💬 Xem ${count} trả lời`;
}

async function translateComment(sortedList, idx) {
  const comment = sortedList[idx];
  const box = document.getElementById(`translation-${idx}`);
  await translateIntoBox(comment.text, box);
}

async function translateReply(replies, commentIdx, replyIdx) {
  const reply = replies[replyIdx];
  const box = document.getElementById(`translation-reply-${commentIdx}-${replyIdx}`);
  await translateIntoBox(reply.text, box);
}

// Dịch 1 bình luận/trả lời, nguồn = ngôn ngữ của chính bình luận đó (xem commentSourceLang).
async function translateIntoBox(text, box) {
  const videoLang = currentModalVideo ? getVideoLang(currentModalVideo) : "und";
  const sl = commentSourceLang(text, videoLang);
  const fromLabel = sl === "auto" ? "tự nhận diện" : LANG_INFO[sl].label.toLowerCase();
  box.classList.add("visible");
  box.textContent = "Đang dịch...";
  try {
    const translated = await translateText(text, sl);
    box.textContent = translated;
    box.title = `Dịch từ ${fromLabel}`;
  } catch (err) {
    box.innerHTML = `Không dịch được tự động. <a href="${googleTranslateLink(text, sl)}" target="_blank" rel="noopener">Mở Google Dịch</a>`;
  }
}

// ---------- Channel stats modal ----------

let currentChannelId = null;

function openChannelModal(channelId) {
  currentChannelId = channelId;
  renderChannelModal();
  els.channelModalOverlay.classList.add("open");
}

function closeChannelModal() {
  els.channelModalOverlay.classList.remove("open");
}

function renderChannelModal() {
  const videos = allVideos.filter((v) => v.channelId === currentChannelId);
  if (!videos.length) return;
  const c = videos[0];

  els.channelModalAvatar.src = c.channelThumbnail;
  els.channelModalName.textContent = c.channelTitle;
  els.channelModalName.href = `https://www.youtube.com/channel/${c.channelId}`;
  els.channelModalSub.textContent = `${fmtNumber(c.subscriberCount)} subscribers`;

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const totalViews = videos.reduce((s, v) => s + (v.viewCount || 0), 0);
  const totalComments = videos.reduce((s, v) => s + (v.commentCount || 0), 0);
  const views7d = videos
    .filter((v) => now - new Date(v.publishedAt).getTime() <= 7 * day)
    .reduce((s, v) => s + (v.viewCount || 0), 0);
  const views30d = videos
    .filter((v) => now - new Date(v.publishedAt).getTime() <= 30 * day)
    .reduce((s, v) => s + (v.viewCount || 0), 0);

  const dates = videos.map((v) => new Date(v.publishedAt).getTime()).sort((a, b) => a - b);
  const spanDays = Math.max(1, (dates[dates.length - 1] - dates[0]) / day);
  const videosPerWeek = (videos.length / spanDays) * 7;
  const latestPublished = new Date(dates[dates.length - 1]);

  const statCards = [
    ["Subscribers", fmtNumber(c.subscriberCount)],
    ["Tổng view kênh (all-time)", c.channelViewCount ? fmtNumber(c.channelViewCount) : "–"],
    ["Tổng số video kênh", c.channelVideoCount ? fmtNumber(c.channelVideoCount) : "–"],
    ["Video đang theo dõi", fmtNumber(videos.length)],
    ["View trung bình / video", fmtNumber(Math.round(totalViews / videos.length))],
    ["Bình luận trung bình / video", fmtNumber(Math.round(totalComments / videos.length))],
    ["Tần suất đăng bài", `~${videosPerWeek.toFixed(1)} video/tuần`],
    ["Video mới nhất", fmtDate(latestPublished.toISOString())],
    ["Ngôn ngữ video", channelLanguageSummary(videos)],
    ["View 7 ngày qua*", fmtNumber(views7d)],
    ["View 30 ngày qua*", fmtNumber(views30d)],
  ];

  els.channelModalGrid.innerHTML = statCards
    .map(
      ([label, value]) => `
    <div class="channel-stat">
      <div class="channel-stat__label">${label}</div>
      <div class="channel-stat__value">${value}</div>
    </div>`
    )
    .join("");

  renderChannelRevenue(views7d, views30d);
}

function channelLanguageSummary(videos) {
  const counts = {};
  for (const v of videos) {
    const k = langKey(getVideoLang(v));
    counts[k] = (counts[k] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${LANG_INFO[k].flag} ${LANG_INFO[k].short} ${Math.round((n / videos.length) * 100)}%`)
    .join(" · ");
}

function renderChannelRevenue(views7d, views30d) {
  let rpmMin = parseFloat(els.channelRpmMin.value) || 0;
  let rpmMax = parseFloat(els.channelRpmMax.value) || 0;
  if (rpmMin > rpmMax) [rpmMin, rpmMax] = [rpmMax, rpmMin];

  const fmtMoney = (n) => `$${n.toFixed(2)}`;
  const range = (views) => {
    const lo = (views * rpmMin) / 1000;
    const hi = (views * rpmMax) / 1000;
    return rpmMin === rpmMax ? fmtMoney(lo) : `${fmtMoney(lo)} – ${fmtMoney(hi)}`;
  };

  const cards = [
    ["Ước tính 7 ngày qua*", range(views7d)],
    ["Ước tính 30 ngày qua*", range(views30d)],
  ];

  els.channelModalRevenue.innerHTML = cards
    .map(
      ([label, value]) => `
    <div class="channel-stat channel-stat--money">
      <div class="channel-stat__label">${label}</div>
      <div class="channel-stat__value">${value}</div>
    </div>`
    )
    .join("");
}

function closeModal() {
  els.modalOverlay.classList.remove("open");
}

// ---------- Events ----------

els.search.addEventListener("input", applyFilters);

els.sortField.addEventListener("change", () => {
  // Đổi ô "Sắp xếp" đơn = thoát chế độ sắp xếp kết hợp, giống hành vi khi bấm
  // thẳng vào 1 cột trong bảng (xem renderTableHeader).
  selectedSortVars = [];
  sortField = els.sortField.value;
  applyFilters();
});

els.sortDir.addEventListener("click", () => {
  sortDir = sortDir === "asc" ? "desc" : "asc";
  els.sortDir.dataset.dir = sortDir;
  els.sortDir.querySelector(".dir-btn__arrow").textContent = sortDir === "asc" ? "↑" : "↓";
  els.sortDir.lastChild.textContent = sortDir === "asc" ? " Tăng dần" : " Giảm dần";
  applyFilters();
});

els.commentSortField.addEventListener("change", () => {
  commentSortField = els.commentSortField.value;
  renderComments();
});

els.commentSortDir.addEventListener("click", () => {
  commentSortDir = commentSortDir === "asc" ? "desc" : "asc";
  els.commentSortDir.dataset.dir = commentSortDir;
  els.commentSortDir.querySelector(".dir-btn__arrow").textContent = commentSortDir === "asc" ? "↑" : "↓";
  renderComments();
});

els.modalClose.addEventListener("click", closeModal);
els.modalOverlay.addEventListener("click", (e) => {
  if (e.target === els.modalOverlay) closeModal();
});
els.channelModalClose.addEventListener("click", closeChannelModal);
els.channelModalOverlay.addEventListener("click", (e) => {
  if (e.target === els.channelModalOverlay) closeChannelModal();
});
els.channelRpmMin.addEventListener("input", () => {
  if (currentChannelId) renderChannelModal();
});
els.channelRpmMax.addEventListener("input", () => {
  if (currentChannelId) renderChannelModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeModal();
    closeChannelModal();
  }
});

loadTabs().then(loadData);

// ---------- AI chat (Gemini) - client-side only, user supplies their own API key ----------
// This block is fully additive and does not touch any of the Fetch-trigger
// or table/filter code above.

(function setupAIChat() {
  const KEY_STORAGE = "gemini_api_key";
  const CHATS_STORAGE = "yt_tracker_ai_chats_v1";
  const ACTIVE_CHAT_STORAGE = "yt_tracker_ai_active_chat_v1";

  const fab = document.getElementById("aiChatBtn");
  const panel = document.getElementById("aiChatPanel");
  const closeBtn = document.getElementById("aiChatClose");
  const expandBtn = document.getElementById("aiChatExpandBtn");
  const resetKeyBtn = document.getElementById("aiChatResetKey");
  const newChatBtn = document.getElementById("aiChatNewBtn");
  const historyBtn = document.getElementById("aiChatHistoryBtn");
  const historyPanel = document.getElementById("aiChatHistoryPanel");
  const historyEmpty = document.getElementById("aiChatHistoryEmpty");
  const historyList = document.getElementById("aiChatHistoryList");
  const messagesEl = document.getElementById("aiChatMessages");
  const input = document.getElementById("aiChatInput");
  const sendBtn = document.getElementById("aiChatSend");
  const dataModeToggle = document.getElementById("aiDataModeToggle");
  const dataModeCount = document.getElementById("aiDataModeCount");

  if (!fab || !panel) return;

  const getApiKey = () => localStorage.getItem(KEY_STORAGE) || "";
  const setApiKey = (key) => localStorage.setItem(KEY_STORAGE, key);
  const clearApiKey = () => localStorage.removeItem(KEY_STORAGE);

  // ---------- Chat persistence (all conversations saved in this browser) ----------

  function loadAllChats() {
    try {
      const raw = localStorage.getItem(CHATS_STORAGE);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveAllChats(chats) {
    try {
      localStorage.setItem(CHATS_STORAGE, JSON.stringify(chats));
    } catch {
      // Storage full or unavailable (private browsing etc.) - fail silently,
      // the chat still works for the current session, just won't persist.
    }
  }

  function makeChatId() {
    return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function createChatRecord() {
    const now = Date.now();
    return { id: makeChatId(), title: "Đoạn chat mới", createdAt: now, updatedAt: now, history: [], messages: [] };
  }

  let allChats = loadAllChats();
  let activeChatId = localStorage.getItem(ACTIVE_CHAT_STORAGE) || "";
  let activeChat = allChats.find((c) => c.id === activeChatId) || null;

  // Mirrors activeChat.history, kept as a separate variable so the rest of
  // the send/receive logic below (unchanged) keeps working exactly as before.
  let conversationHistory = activeChat ? activeChat.history : [];

  function persistActiveChat() {
    if (!activeChat) return;
    activeChat.updatedAt = Date.now();
    const idx = allChats.findIndex((c) => c.id === activeChat.id);
    if (idx === -1) allChats.unshift(activeChat);
    else allChats[idx] = activeChat;
    saveAllChats(allChats);
    localStorage.setItem(ACTIVE_CHAT_STORAGE, activeChat.id);
  }

  function ensureActiveChat() {
    if (activeChat) return activeChat;
    activeChat = createChatRecord();
    conversationHistory = activeChat.history;
    return activeChat;
  }

  function loadChatIntoView(chat) {
    activeChat = chat;
    conversationHistory = chat.history;
    messagesEl.innerHTML = "";
    for (const m of chat.messages) appendMessage(m.text, m.who, false);
    localStorage.setItem(ACTIVE_CHAT_STORAGE, chat.id);
  }

  function startNewChat() {
    activeChat = createChatRecord();
    conversationHistory = activeChat.history;
    messagesEl.innerHTML = "";
    persistActiveChat();
    renderHistoryList();
    input.focus();
  }

  function deleteChat(id, evt) {
    if (evt) evt.stopPropagation();
    allChats = allChats.filter((c) => c.id !== id);
    saveAllChats(allChats);
    if (activeChat && activeChat.id === id) {
      startNewChat();
    }
    renderHistoryList();
  }

  function fmtChatDate(ts) {
    const d = new Date(ts);
    return d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function renderHistoryList() {
    const sorted = [...allChats].sort((a, b) => b.updatedAt - a.updatedAt);
    historyEmpty.classList.toggle("hidden", sorted.length > 0);
    historyList.innerHTML = sorted
      .map(
        (c) => `
      <div class="ai-chat-history__item ${activeChat && c.id === activeChat.id ? "active" : ""}" data-chat-id="${c.id}">
        <div class="ai-chat-history__item-main">
          <div class="ai-chat-history__item-title">${escapeHtml(c.title || "Đoạn chat mới")}</div>
          <div class="ai-chat-history__item-date">${fmtChatDate(c.updatedAt)}</div>
        </div>
        <button class="ai-chat-history__item-delete" data-delete-id="${c.id}" title="Xoá">✕</button>
      </div>`
      )
      .join("");

    historyList.querySelectorAll(".ai-chat-history__item").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest(".ai-chat-history__item-delete")) return;
        const chat = allChats.find((c) => c.id === el.dataset.chatId);
        if (chat) {
          loadChatIntoView(chat);
          toggleHistoryPanel(false);
        }
      });
    });
    historyList.querySelectorAll(".ai-chat-history__item-delete").forEach((btn) => {
      btn.addEventListener("click", (e) => deleteChat(btn.dataset.deleteId, e));
    });
  }

  function toggleHistoryPanel(forceOpen) {
    const isOpen = historyPanel.classList.contains("open");
    const shouldOpen = forceOpen !== undefined ? forceOpen : !isOpen;
    if (shouldOpen) renderHistoryList();
    historyPanel.classList.toggle("open", shouldOpen);
  }

  newChatBtn.addEventListener("click", startNewChat);
  historyBtn.addEventListener("click", () => toggleHistoryPanel());

  function appendMessage(text, who, persist = true) {
    const div = document.createElement("div");
    div.className = `ai-msg ai-msg--${who}`;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    if (persist && activeChat) {
      activeChat.messages.push({ text, who });
      div.dataset.msgIndex = activeChat.messages.length - 1;
      persistActiveChat();
    }
    return div;
  }

  // Updates a message bubble's final text (e.g. replacing "Đang trả lời..."
  // with the real answer) and, if that bubble was persisted, patches the
  // saved copy too so reloading history shows the real answer, not the
  // transient "thinking..." placeholder.
  function updateMessage(div, newText) {
    div.textContent = newText;
    messagesEl.scrollTop = messagesEl.scrollHeight;
    if (activeChat && div.dataset.msgIndex !== undefined) {
      const idx = Number(div.dataset.msgIndex);
      if (activeChat.messages[idx]) {
        activeChat.messages[idx].text = newText;
        persistActiveChat();
      }
    }
  }

  function promptForApiKey() {
    input.placeholder = "Dán API key Gemini vào đây rồi bấm gửi...";
    input.dataset.mode = "apikey";
  }

  // Uses whatever is currently displayed on the table (respecting the
  // search box, channel filter, and date-range filter that already exist),
  // not the entire dataset.
  // Luôn dùng đúng danh sách đang lọc - kể cả khi rỗng (trước đây rỗng thì
  // lặng lẽ gửi TOÀN BỘ video, trong khi prompt vẫn ghi là "đang lọc").
  function currentFilteredList() {
    return typeof filteredVideos !== "undefined" ? filteredVideos : [];
  }

  function updateDataModeCount() {
    dataModeCount.textContent = currentFilteredList().length;
  }

  function openPanel() {
    panel.classList.add("open");
    ensureActiveChat();
    if (!getApiKey()) promptForApiKey();
    updateDataModeCount();
    setTimeout(() => input.focus(), 50);
  }
  const EXPANDED_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`;
  const COLLAPSED_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3v4a2 2 0 0 1-2 2H3M15 3v4a2 2 0 0 0 2 2h4M9 21v-4a2 2 0 0 0-2-2H3M15 21v-4a2 2 0 0 1 2-2h4"/></svg>`;

  function setExpanded(expanded) {
    panel.classList.toggle("expanded", expanded);
    if (expandBtn) {
      expandBtn.innerHTML = expanded ? COLLAPSED_ICON : EXPANDED_ICON;
      expandBtn.title = expanded ? "Thu nhỏ" : "Phóng to";
    }
  }
  if (expandBtn) {
    expandBtn.addEventListener("click", () => setExpanded(!panel.classList.contains("expanded")));
  }

  function closePanel() {
    panel.classList.remove("open");
    toggleHistoryPanel(false);
  }

  // Backdrop-click-to-close only makes sense in expanded mode - the mini
  // dock has no backdrop to click since the box fills the whole panel.
  panel.addEventListener("click", (e) => {
    if (panel.classList.contains("expanded") && e.target === panel) closePanel();
  });

  // Restore whatever conversation was last active in this browser, if any,
  // so re-opening the panel shows it without waiting for the user to click.
  if (activeChat) {
    for (const m of activeChat.messages) appendMessage(m.text, m.who, false);
  }

  fab.addEventListener("click", openPanel);
  closeBtn.addEventListener("click", closePanel);
  resetKeyBtn.addEventListener("click", () => {
    clearApiKey();
    appendMessage("Đã xoá API key cũ.", "bot");
    promptForApiKey();
    input.focus();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendBtn.click();
  });
  dataModeToggle.addEventListener("change", updateDataModeCount);

  const langCode = (v) => {
    const l = getVideoLang(v);
    return l === "ko" ? "KO" : l === "ja" ? "JA" : l === "und" ? "?" : l.toUpperCase();
  };

  function buildFullVideoList(list) {
    return list
      .map((v) => {
        const title = v.title.length > 55 ? v.title.slice(0, 55) + "…" : v.title;
        const date = v.publishedAt ? v.publishedAt.slice(0, 10) : "?";
        return `${date} | ${langCode(v)} | ${v.channelTitle} | "${title}" | ${fmtNumber(v.viewCount)} views | ${fmtNumber(
          v.likeCount
        )} likes | ${fmtNumber(v.commentCount)} comments`;
      })
      .join("\n");
  }

  function buildChannelSummary(list) {
    const map = new Map();
    for (const v of list) {
      if (!map.has(v.channelId)) {
        map.set(v.channelId, {
          title: v.channelTitle,
          subscriberCount: v.subscriberCount,
          videoCount: 0,
          totalViews: 0,
          totalLikes: 0,
          totalComments: 0,
        });
      }
      const c = map.get(v.channelId);
      c.videoCount += 1;
      c.totalViews += v.viewCount || 0;
      c.totalLikes += v.likeCount || 0;
      c.totalComments += v.commentCount || 0;
    }
    return [...map.values()]
      .map(
        (c) =>
          `- ${c.title}: ${c.videoCount} video, tổng ${fmtNumber(c.totalViews)} views, ${fmtNumber(
            c.totalLikes
          )} likes, ${fmtNumber(c.totalComments)} bình luận, ${
            c.subscriberCount != null ? fmtNumber(c.subscriberCount) : "?"
          } sub`
      )
      .join("\n");
  }

  // Gom bình luận của các video đang lọc để gửi cho Gemini. Có giới hạn để
  // không vượt cửa sổ ngữ cảnh của model (toàn bộ bình luận của vài trăm video
  // có thể lên tới hàng triệu token): tối đa AI_COMMENTS_PER_VIDEO bình luận
  // nhiều like nhất mỗi video, video nhiều view được ưu tiên, và dừng khi tổng
  // vượt AI_COMMENT_CHAR_BUDGET ký tự. Tải theo lô AI_FETCH_CONCURRENCY file
  // một lúc thay vì mở hàng trăm request song song.
  const AI_COMMENTS_PER_VIDEO = 25;
  const AI_COMMENT_CHAR_BUDGET = 350000;
  const AI_FETCH_CONCURRENCY = 12;

  async function gatherCommentContext(list, onProgress) {
    const ordered = [...list].sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
    const results = new Array(ordered.length).fill("");
    let done = 0;
    let next = 0;

    async function worker() {
      while (next < ordered.length) {
        const i = next++;
        const v = ordered[i];
        try {
          const res = await fetch(`data/comments/${v.videoId}.json`, { cache: "no-store" });
          if (res.ok) {
            const data = await res.json();
            if (!data.disabled && data.comments?.length) {
              const top = [...data.comments].sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0)).slice(0, AI_COMMENTS_PER_VIDEO);
              const lines = top.map((c) => `- ${String(c.text).replace(/\s+/g, " ").slice(0, 400)}`).join("\n");
              const info = langInfo(getVideoLang(v));
              results[i] = `Video: "${v.title}" (Ngôn ngữ video: ${info.label}; Kênh: ${v.channelTitle}, ${fmtNumber(v.viewCount)} views)\nBình luận (nguyên văn):\n${lines}`;
            }
          }
        } catch {
          // không có file bình luận cho video này, bỏ qua
        } finally {
          done += 1;
          if (onProgress) onProgress(done, ordered.length);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(AI_FETCH_CONCURRENCY, ordered.length) }, worker));

    const kept = [];
    let used = 0;
    let skipped = 0;
    for (const part of results) {
      if (!part) continue;
      if (used + part.length > AI_COMMENT_CHAR_BUDGET) {
        skipped++;
        continue;
      }
      kept.push(part);
      used += part.length;
    }
    return { text: kept.join("\n\n---\n\n"), included: kept.length, skipped };
  }

  // Google regularly retires Gemini model names (1.5 and 2.0-flash are both
  // already shut down as of mid-2026). Try a short list of currently-known
  // working names in order, falling back to the next one on a 404, instead
  // of hardcoding a single model that can silently break again later.
  const MODEL_CANDIDATES = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"];

  async function callGemini(apiKey, contents) {
    let lastError = null;

    for (const model of MODEL_CANDIDATES) {
      let res, data;
      try {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
            apiKey
          )}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents }),
          }
        );
        data = await res.json().catch(() => null);
      } catch (networkErr) {
        lastError = new Error("Không kết nối được tới Gemini API. Kiểm tra lại mạng.");
        continue;
      }

      if (res.ok) {
        const blockReason = data?.promptFeedback?.blockReason;
        if (blockReason) {
          throw new Error(`Gemini từ chối trả lời (lý do: ${blockReason}). Thử diễn đạt lại câu hỏi.`);
        }
        return (
          data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ||
          "Gemini không trả về nội dung nào."
        );
      }

      // Model not found/not supported - try the next candidate. Any other
      // error (bad key, quota, etc.) should surface immediately instead of
      // silently trying more models.
      const isModelNotFound = res.status === 404 || /not found|not supported/i.test(data?.error?.message || "");
      if (!isModelNotFound) {
        throw new Error(
          `Lỗi từ Gemini (${res.status}): ${data?.error?.message || "không rõ nguyên nhân"}. Kiểm tra lại API key hoặc thử lại sau.`
        );
      }
      lastError = new Error(
        `Model "${model}" không còn khả dụng (${data?.error?.message || res.status}).`
      );
    }

    throw new Error(
      (lastError?.message ? lastError.message + " " : "") +
        "Không có model Gemini nào trong danh sách còn hoạt động - Google có thể đã đổi tên model, thử lại sau hoặc báo để cập nhật danh sách model."
    );
  }

  async function handleAISend() {
    const text = input.value.trim();
    if (!text) return;

    if (input.dataset.mode === "apikey") {
      setApiKey(text);
      input.value = "";
      input.dataset.mode = "";
      input.placeholder = "Khán giả Hàn và Nhật đang bình luận gì?";
      appendMessage("Đã lưu API key trên trình duyệt này. Giờ anh hỏi được rồi!", "bot");
      return;
    }

    ensureActiveChat();
    appendMessage(text, "user");
    input.value = "";

    const apiKey = getApiKey();
    if (!apiKey) {
      promptForApiKey();
      return;
    }

    const dataModeOn = dataModeToggle.checked;
    const thinkingEl = appendMessage(dataModeOn ? "Đang tải dữ liệu..." : "Đang trả lời...", "bot");
    sendBtn.disabled = true;

    try {
      let messageForGemini = text;

      if (dataModeOn) {
        const list = currentFilteredList();
        const channelSummary = buildChannelSummary(list);
        const videoList = buildFullVideoList(list);
        const { text: commentContext, included, skipped } = await gatherCommentContext(list, (done, total) => {
          thinkingEl.textContent = `Đang tải bình luận... (${done}/${total} video)`;
        });
        const langCounts = list.reduce((acc, v) => {
          const k = langInfo(getVideoLang(v)).label;
          acc[k] = (acc[k] || 0) + 1;
          return acc;
        }, {});
        const langSummary = Object.entries(langCounts).map(([k, n]) => `${k}: ${n} video`).join(", ");
        const commentNote = skipped
          ? `(Bình luận của ${included} video nhiều view nhất được đưa vào, mỗi video tối đa ${AI_COMMENTS_PER_VIDEO} bình luận nhiều like nhất; ${skipped} video còn lại bị lược bớt để vừa giới hạn của model.)`
          : `(Mỗi video tối đa ${AI_COMMENTS_PER_VIDEO} bình luận nhiều like nhất.)`;
        thinkingEl.textContent = "Đang phân tích...";

        messageForGemini = `Dưới đây là dữ liệu của đúng các video đang được hiển thị/lọc trên bảng lúc này (${list.length} video, theo bộ lọc/tìm kiếm hiện tại của người dùng trên app). Hãy dùng dữ liệu này để trả lời câu hỏi bên dưới nếu liên quan; nếu câu hỏi không liên quan tới dữ liệu, trả lời bình thường. Lưu ý về ngôn ngữ: đây là các kênh TIẾNG HÀN và TIẾNG NHẬT. Mỗi video đã được gắn ngôn ngữ gốc (cột KO = Tiếng Hàn, JA = Tiếng Nhật). Hãy đọc tiêu đề và bình luận của từng video theo ĐÚNG ngôn ngữ của video đó (Hán tự trong video JA đọc theo tiếng Nhật, không đọc như tiếng Trung; bình luận có thể bằng ngôn ngữ khác video, ví dụ tiếng Anh). Luôn trả lời bằng TIẾNG VIỆT; khi trích dẫn tiêu đề/bình luận, giữ nguyên văn gốc và kèm bản dịch Tiếng Việt trong ngoặc. Khi so sánh, tách riêng nhận xét cho nhóm Tiếng Hàn và nhóm Tiếng Nhật nếu có cả hai.

Phân bố ngôn ngữ: ${langSummary || "(trống)"}

=== TỔNG HỢP THEO KÊNH (trong phạm vi đang lọc) ===
${channelSummary || "(không có video nào trong phạm vi đang lọc)"}

=== DANH SÁCH VIDEO ĐANG LỌC (ngày | ngôn ngữ | kênh | tiêu đề | views | likes | comments) ===
${videoList || "(trống)"}

=== BÌNH LUẬN CỦA CÁC VIDEO ĐANG LỌC ${commentNote} ===
${commentContext || "(không có dữ liệu bình luận)"}

CÂU HỎI: ${text}`;
      }

      const contents = [
        ...conversationHistory,
        { role: "user", parts: [{ text: messageForGemini }] },
      ];

      const answer = await callGemini(apiKey, contents);
      updateMessage(thinkingEl, answer);

      conversationHistory.push({ role: "user", parts: [{ text }] });
      conversationHistory.push({ role: "model", parts: [{ text: answer }] });
      if (conversationHistory.length > 20) {
        conversationHistory.splice(0, conversationHistory.length - 20);
      }
      if (activeChat) {
        activeChat.history = conversationHistory;
        if (!activeChat.title || activeChat.title === "Đoạn chat mới") {
          activeChat.title = text.length > 42 ? text.slice(0, 42) + "…" : text;
        }
        persistActiveChat();
        renderHistoryList();
      }
    } catch (err) {
      updateMessage(thinkingEl, err.message || "Không gọi được Gemini API. Kiểm tra lại kết nối mạng hoặc API key.");
    } finally {
      sendBtn.disabled = false;
    }
  }

  sendBtn.addEventListener("click", handleAISend);
})();
