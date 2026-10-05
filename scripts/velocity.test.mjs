// Chạy: node --test scripts/velocity.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { computeVelocity, pickBaseline, deriveLiveStatus, pickLiveDetails, readSnapshots, CONFIG } from "./velocity.mjs";

const H = 3600000;
const NOW = Date.parse("2026-09-25T00:00:00Z");
const ago = (h) => NOW - h * H;
const video = (viewCount) => ({ viewCount, publishedAt: "2026-09-01T00:00:00Z" });
const run = (o) => computeVelocity({ nowMs: NOW, liveStatus: "none", ...o });

test("cấu hình mặc định: 6h / 24h / 48h / 8 snapshot", () => {
  assert.equal(CONFIG.minIntervalHours, 6);
  assert.equal(CONFIG.windowMaxHours, 24);
  assert.equal(CONFIG.fallbackMaxHours, 48);
  assert.equal(CONFIG.maxSnapshots, 8);
});

test("fetch cách lần trước < 6h: giữ nguyên VPH cũ, không thêm snapshot", () => {
  const prev = { viewCount: 1000, viewsPerHour: 42, viewsPerHourSource: "recent", vphWindowHours: 23.5, snapshots: [[ago(5.9), 1000]] };
  const r = run({ video: video(9999), prev });
  assert.equal(r.viewsPerHour, 42);
  assert.equal(r.viewsPerHourSource, "recent");
  assert.equal(r.vphWindowHours, 23.5);
  assert.deepEqual(r.snapshots, [[ago(5.9), 1000]]);
});

test("đúng 6h: tính lại, và mốc 6h nằm trong cửa sổ", () => {
  const prev = { viewCount: 1000, viewsPerHour: 1, snapshots: [[ago(6), 1000]] };
  const r = run({ video: video(1600), prev });
  assert.equal(r.viewsPerHour, 100); // 600 view / 6h
  assert.equal(r.viewsPerHourSource, "recent");
  assert.equal(r.vphWindowHours, 6);
  assert.equal(r.snapshots.length, 2);
});

test("nhiều mốc trong 6–24h: chọn mốc CŨ NHẤT (cửa sổ dài nhất)", () => {
  const snaps = [[ago(30), 0], [ago(20), 500], [ago(10), 800]];
  assert.deepEqual(pickBaseline(snaps, NOW), [ago(20), 500]);
});

test("cron 24h lệch vài phút (24.1h): rơi vào fallback thay vì về lifetime", () => {
  const prev = { viewCount: 1000, viewsPerHour: 1, snapshots: [[ago(24.1), 1000]] };
  const r = run({ video: video(1241), prev });
  assert.equal(r.viewsPerHourSource, "recent");
  assert.equal(r.viewsPerHour, 10); // 241 / 24.1
});

test("mốc trong cửa sổ được ưu tiên hơn mốc fallback", () => {
  const snaps = [[ago(30), 0], [ago(12), 500]];
  assert.deepEqual(pickBaseline(snaps, NOW), [ago(12), 500]);
});

test("mốc cũ hơn 48h: không dùng, quay về lifetime", () => {
  const prev = { viewCount: 1000, viewsPerHour: 1, snapshots: [[ago(60), 1000]] };
  const r = run({ video: video(2000), prev });
  assert.equal(r.viewsPerHourSource, "lifetime");
  assert.equal(r.snapshots.length, 2);
});

test("video mới thấy lần đầu: lifetime + tạo snapshot đầu tiên", () => {
  const r = run({ video: video(24 * 24 * 100), prev: undefined }); // đăng 24 ngày trước
  assert.equal(r.viewsPerHourSource, "lifetime");
  assert.equal(r.snapshots.length, 1);
});

test("giữ tối đa MAX_SNAPSHOTS mốc, bỏ mốc cũ nhất", () => {
  const snaps = Array.from({ length: 8 }, (_, i) => [ago(60 - i * 6.5), i * 10]);
  const prev = { viewCount: 70, viewsPerHour: 1, snapshots: snaps };
  const r = run({ video: video(500), prev });
  assert.equal(r.snapshots.length, 8);
  assert.equal(r.snapshots.at(-1)[0], NOW);
  assert.notDeepEqual(r.snapshots[0], snaps[0]);
});

test("view giảm (YouTube lọc view ảo): VPH không âm", () => {
  const prev = { viewCount: 1000, viewsPerHour: 1, snapshots: [[ago(12), 1000]] };
  assert.equal(run({ video: video(900), prev }).viewsPerHour, 0);
});

test("migration: dữ liệu cũ chưa có snapshots được dựng từ lần fetch trước của cả danh sách", () => {
  const prev = { viewCount: 1000, viewsPerHour: 5, viewsPerHourSource: "lifetime" };
  const legacy = new Date(ago(12));
  assert.deepEqual(readSnapshots(prev, legacy), [[ago(12), 1000]]);
  const r = run({ video: video(1120), prev, legacyFetchTime: legacy });
  assert.equal(r.viewsPerHourSource, "recent");
  assert.equal(r.viewsPerHour, 10);
});

test("live/upcoming: VPH = null, nguồn 'live', KHÔNG ghi snapshot", () => {
  const prev = { viewCount: 0, viewsPerHour: 3, snapshots: [[ago(12), 0]] };
  for (const liveStatus of ["live", "upcoming"]) {
    const r = run({ video: video(5000), prev, liveStatus });
    assert.equal(r.viewsPerHour, null);
    assert.equal(r.viewsPerHourSource, "live");
    assert.equal(r.snapshots.length, 1);
  }
});

test("live kết thúc (ended) tính VPH như video thường", () => {
  const prev = { viewCount: 0, viewsPerHour: null, viewsPerHourSource: "live", snapshots: [] };
  const r = run({ video: video(5000), prev, liveStatus: "ended" });
  assert.equal(r.viewsPerHourSource, "lifetime");
  assert.ok(r.viewsPerHour > 0);
});

test("deriveLiveStatus", () => {
  const d = { actualStartTime: "x" };
  assert.equal(deriveLiveStatus({ liveBroadcastContent: "live" }, d), "live");
  assert.equal(deriveLiveStatus({ liveBroadcastContent: "live" }, { ...d, actualEndTime: "y" }), "ended");
  assert.equal(deriveLiveStatus({ liveBroadcastContent: "upcoming" }, { scheduledStartTime: "z" }), "upcoming");
  assert.equal(deriveLiveStatus({ liveBroadcastContent: "none" }, d), "ended"); // VOD của live/công chiếu
  assert.equal(deriveLiveStatus({ liveBroadcastContent: "none" }, undefined), "none");
  assert.equal(deriveLiveStatus({}, undefined), "none");
});

test("pickLiveDetails chỉ giữ trường thời gian", () => {
  assert.deepEqual(
    pickLiveDetails({ actualStartTime: "a", concurrentViewers: "9", actualEndTime: "b" }),
    { actualStartTime: "a", actualEndTime: "b" }
  );
  assert.equal(pickLiveDetails(undefined), undefined);
  assert.equal(pickLiveDetails({ concurrentViewers: "9" }), undefined);
});

test("live + dữ liệu cũ chưa có snapshots: không ghi mốc dựng tạm xuống", () => {
  const prev = { viewCount: 300, viewsPerHour: 3 };
  const r = run({ video: video(5000), prev, liveStatus: "live", legacyFetchTime: new Date(ago(12)) });
  assert.deepEqual(r.snapshots, []);
});
