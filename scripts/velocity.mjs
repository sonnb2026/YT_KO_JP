// scripts/velocity.mjs
//
// Logic tính view/giờ (VPH) và nhận diện live/công chiếu. Tách riêng khỏi
// fetch-data.mjs để test được mà không cần API key (xem velocity.test.mjs).
//
// Cấu hình qua env (đều tuỳ chọn):
//   MIN_VPH_INTERVAL_HOURS   default 6   - khoảng cách tối thiểu giữa 2 lần fetch của CÙNG
//                            1 video thì mới tính lại VPH và ghi snapshot mới. Ngắn hơn thì
//                            giữ nguyên VPH lần trước (viewCount vẫn được cập nhật).
//   VPH_WINDOW_MAX_HOURS     default 24  - cửa sổ ưu tiên để tìm mốc so sánh: [MIN, 24h].
//   VPH_FALLBACK_MAX_HOURS   default 48  - cron chạy đúng 24h/lần nên mốc hôm qua thường lệch
//                            24h + vài phút (nằm NGOÀI cửa sổ). Khi không có mốc nào trong
//                            [6h, 24h], lấy mốc mới nhất trong (24h, 48h]. Quá 48h thì coi như
//                            không có mốc -> quay về trung bình cả đời ("lifetime").
//   MAX_SNAPSHOTS            default 8   - số snapshot giữ lại cho mỗi video.

const HOUR_MS = 3600000;

const numEnv = (name, def) => {
  const n = parseFloat(process.env[name] || "");
  return Number.isFinite(n) && n > 0 ? n : def;
};

export const CONFIG = {
  minIntervalHours: numEnv("MIN_VPH_INTERVAL_HOURS", 6),
  windowMaxHours: numEnv("VPH_WINDOW_MAX_HOURS", 24),
  fallbackMaxHours: numEnv("VPH_FALLBACK_MAX_HOURS", 48),
  maxSnapshots: Math.floor(numEnv("MAX_SNAPSHOTS", 8)),
};

// ---------- Live / công chiếu ----------
//
// liveBroadcastContent (trong snippet) cho biết trạng thái HIỆN TẠI:
//   "live" | "upcoming" | "none".
// Nhưng khi live/công chiếu đã kết thúc, giá trị này quay về "none" - lúc đó chỉ còn
// liveStreamingDetails là dấu vết cho thấy video từng là live/công chiếu. Vì vậy kết hợp cả hai:
//   "live"     - đang phát
//   "upcoming" - đã lên lịch, chưa phát
//   "ended"    - từng live/công chiếu, đã kết thúc (bản VOD)
//   "none"     - video thường
// Lưu ý: API không phân biệt được "live" với "công chiếu (premiere)" một cách đáng tin cậy,
// nên cả hai dùng chung 1 nhãn.
export function deriveLiveStatus(snippet, liveStreamingDetails) {
  const lbc = snippet?.liveBroadcastContent || "none";
  const d = liveStreamingDetails || null;
  if (lbc === "live") {
    // Đôi khi liveBroadcastContent trễ vài phút so với actualEndTime.
    return d?.actualEndTime ? "ended" : "live";
  }
  if (lbc === "upcoming") return "upcoming";
  return d ? "ended" : "none";
}

// Chỉ giữ các trường thời gian cần dùng, để file JSON không phình.
export function pickLiveDetails(d) {
  if (!d) return undefined;
  const out = {};
  for (const k of ["scheduledStartTime", "actualStartTime", "actualEndTime"]) {
    if (d[k]) out[k] = d[k];
  }
  return Object.keys(out).length ? out : undefined;
}

// Video đang live/sắp phát thì view chưa phản ánh "tốc độ tăng view" của video thường.
export const isVphExcluded = (liveStatus) => liveStatus === "live" || liveStatus === "upcoming";

// ---------- Snapshot ----------
//
// Mỗi video giữ tối đa MAX_SNAPSHOTS mốc dạng [thời điểm (epoch ms), lượt xem], cũ -> mới.

export function readSnapshots(prev, legacyFetchTime) {
  if (Array.isArray(prev?.snapshots) && prev.snapshots.length) {
    return prev.snapshots.filter((s) => Array.isArray(s) && Number.isFinite(s[0]) && Number.isFinite(s[1]));
  }
  // Dữ liệu cũ (trước khi có snapshot): dựng 1 mốc từ lần fetch trước của cả danh sách.
  if (prev && legacyFetchTime && Number.isFinite(prev.viewCount)) {
    return [[legacyFetchTime.getTime(), prev.viewCount]];
  }
  return [];
}

// Chọn mốc so sánh:
//  1) Mốc CŨ NHẤT nằm trong [minInterval, windowMax] - cửa sổ dài nhất có thể nên ít nhiễu nhất.
//  2) Không có -> mốc MỚI NHẤT nằm trong (windowMax, fallbackMax] (trường hợp cron 24h lệch vài phút).
//  3) Không có -> null.
export function pickBaseline(snaps, nowMs, cfg = CONFIG) {
  const minAge = cfg.minIntervalHours * HOUR_MS;
  const winMax = cfg.windowMaxHours * HOUR_MS;
  const fbMax = cfg.fallbackMaxHours * HOUR_MS;

  let inWindow = null;
  let fallback = null;
  for (const s of snaps) {
    const age = nowMs - s[0];
    if (age >= minAge && age <= winMax) {
      if (!inWindow || s[0] < inWindow[0]) inWindow = s;
    } else if (age > winMax && age <= fbMax) {
      if (!fallback || s[0] > fallback[0]) fallback = s;
    }
  }
  return inWindow || fallback;
}

// ---------- VPH ----------
//
// Trả về { viewsPerHour, viewsPerHourSource, vphWindowHours?, snapshots }.
// viewsPerHourSource:
//   "recent"   - delta view / số giờ giữa mốc so sánh và hiện tại (mốc trong 6–24h, hoặc 24–48h nếu fallback)
//   "lifetime" - trung bình cả đời video, chỉ dùng khi chưa có mốc phù hợp
//   "live"     - video đang live/sắp phát: không tính VPH (viewsPerHour = null)
export function computeVelocity({ video, prev, legacyFetchTime, liveStatus, nowMs, cfg = CONFIG }) {
  const snaps = readSnapshots(prev, legacyFetchTime);

  // Live / sắp phát: không tính VPH và KHÔNG ghi snapshot. Nếu ghi, mốc lúc đang live sẽ làm sai
  // delta của lần tính đầu tiên sau khi video kết thúc (lúc đó view tăng theo kiểu khác hẳn).
  // Chỉ giữ lại snapshot ĐÃ lưu thật; mốc dựng tạm từ dữ liệu cũ (legacyFetchTime) cũng là số view
  // lúc đang live nên không được ghi xuống.
  if (isVphExcluded(liveStatus)) {
    return {
      viewsPerHour: null,
      viewsPerHourSource: "live",
      snapshots: Array.isArray(prev?.snapshots) ? prev.snapshots : [],
    };
  }

  // Quy tắc 1: quá gần lần ghi snapshot trước -> giữ nguyên VPH cũ, không tính lại, không thêm
  // snapshot. (viewCount của video vẫn được cập nhật ở nơi gọi.)
  const last = snaps[snaps.length - 1];
  if (
    last &&
    nowMs - last[0] < cfg.minIntervalHours * HOUR_MS &&
    prev &&
    prev.viewsPerHour !== null &&
    prev.viewsPerHour !== undefined
  ) {
    return {
      viewsPerHour: prev.viewsPerHour,
      viewsPerHourSource: prev.viewsPerHourSource || "lifetime",
      ...(prev.vphWindowHours !== undefined ? { vphWindowHours: prev.vphWindowHours } : {}),
      snapshots: snaps,
    };
  }

  const nextSnaps = [...snaps, [nowMs, video.viewCount]].slice(-cfg.maxSnapshots);

  // Quy tắc 2: tính trên mốc trong khoảng 6–24h (fallback 24–48h).
  const base = pickBaseline(snaps, nowMs, cfg);
  if (base) {
    const hours = (nowMs - base[0]) / HOUR_MS;
    const delta = Math.max(0, video.viewCount - base[1]);
    return {
      viewsPerHour: Math.round(delta / hours),
      viewsPerHourSource: "recent",
      vphWindowHours: Math.round(hours * 10) / 10,
      snapshots: nextSnaps,
    };
  }

  // Chưa có mốc phù hợp (video mới thấy lần đầu, hoặc lần fetch trước quá 48h): trung bình cả đời.
  const hoursSincePublish = Math.max((nowMs - new Date(video.publishedAt).getTime()) / HOUR_MS, 1);
  return {
    viewsPerHour: Math.round(video.viewCount / hoursSincePublish),
    viewsPerHourSource: "lifetime",
    snapshots: nextSnaps,
  };
}
