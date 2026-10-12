// Chạy: node --test scripts/language.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { detectScript, normalizeLangCode, detectVideoLanguage, detectChannelLanguage, resolveVideoLanguage } from "./language.mjs";

test("chữ viết: Hangul -> ko, Kana -> ja, Latin/Kanji thuần -> null", () => {
  assert.equal(detectScript("서울 여행 브이로그"), "ko");
  assert.equal(detectScript("東京で食べ歩き"), "ja");
  assert.equal(detectScript("カフェ巡り VLOG"), "ja");
  assert.equal(detectScript("Seoul travel vlog"), null);
  assert.equal(detectScript("東京旅行"), null);
  assert.equal(detectScript(""), null);
});

test("trộn 2 chữ viết: chọn chữ viết nhiều ký tự hơn", () => {
  assert.equal(detectScript("한국 여행 가이드 (韓国旅行)"), "ko");
  assert.equal(detectScript("韓国のおすすめカフェを紹介します 카페"), "ja");
});

test("chuẩn hoá mã ngôn ngữ", () => {
  assert.equal(normalizeLangCode("ko-KR"), "ko");
  assert.equal(normalizeLangCode("ja"), "ja");
  assert.equal(normalizeLangCode("zxx"), null);
  assert.equal(normalizeLangCode(undefined), null);
});

test("tiêu đề thắng metadata khai báo sai", () => {
  const r = detectVideoLanguage({ title: "부산 맛집 투어", defaultAudioLanguage: "en" });
  assert.deepEqual(r, { language: "ko", languageSource: "title" });
});

test("tiêu đề chỉ có Kanji -> dùng mô tả", () => {
  const r = detectVideoLanguage({ title: "京都紅葉", description: "今年の紅葉はとてもきれいでした" });
  assert.deepEqual(r, { language: "ja", languageSource: "description" });
});

test("không có chữ viết -> metadata ko/ja", () => {
  const r = detectVideoLanguage({ title: "VLOG #12", defaultAudioLanguage: "ja-JP" });
  assert.deepEqual(r, { language: "ja", languageSource: "metadata" });
});

test("metadata 'en' là tín hiệu yếu, nhường cho ngôn ngữ kênh", () => {
  const d = detectVideoLanguage({ title: "VLOG #12", defaultAudioLanguage: "en" });
  assert.deepEqual(resolveVideoLanguage(d, "ko"), { language: "ko", languageSource: "channel" });
  assert.deepEqual(resolveVideoLanguage(d, "und"), { language: "en", languageSource: "metadata" });
});

test("không có gì -> und", () => {
  assert.deepEqual(resolveVideoLanguage(null, "und"), { language: "und", languageSource: "none" });
});

test("ngôn ngữ kênh: đa số video, rồi metadata kênh, rồi quốc gia", () => {
  assert.equal(detectChannelLanguage(["ja", "ja", "ko", "en"], {}), "ja");
  assert.equal(detectChannelLanguage(["en"], { defaultLanguage: "ko" }), "ko");
  assert.equal(detectChannelLanguage([], { country: "JP" }), "ja");
  assert.equal(detectChannelLanguage([], {}), "und");
});

// ---------- Tiếng Pháp ----------
import { detectFrench, frenchScore, detectTextLanguage } from "./language.mjs";

test("tiếng Pháp: nhận diện tiêu đề tiếng Pháp thường gặp", () => {
  assert.equal(detectFrench("Les plus beaux villages de France"), "fr");
  assert.equal(detectFrench("Voyage à Paris : ce qu'il faut voir"), "fr");
  assert.equal(detectFrench("J'ai testé le meilleur restaurant de Lyon"), "fr");
  assert.equal(detectFrench("Découverte de la Bretagne avec nous"), "fr");
  assert.equal(detectFrench("C'est la fin du monde ?"), "fr");
});

test("tiếng Pháp: không nhận nhầm tiếng Anh có từ mượn", () => {
  assert.equal(detectFrench("Best Café in Paris"), null);
  assert.equal(detectFrench("Crème brûlée recipe"), null);
  assert.equal(detectFrench("Hôtel review: worth it?"), null);
  assert.equal(detectFrench("My son's first trip to Europe"), null);
  assert.equal(detectFrench("Seoul travel vlog"), null);
});

test("tiếng Pháp: không nhận nhầm tiếng Tây Ban Nha / Bồ Đào Nha / Ý", () => {
  assert.equal(detectFrench("Los mejores pueblos de España"), null);
  assert.equal(detectFrench("¿Qué ver en Madrid? La guía completa"), null);
  assert.equal(detectFrench("Viagem ao Japão: o que não perder"), null);
  assert.equal(detectFrench("Perché l'Italia è così bella? Così è"), null);
});

test("tiếng Pháp: tiêu đề quá ngắn/chung chung -> không kết luận", () => {
  assert.equal(frenchScore("Paris 2026"), 0);
  assert.equal(detectFrench("VLOG #3"), null);
});

test("Hàn/Nhật được ưu tiên trước tiếng Pháp", () => {
  assert.equal(detectTextLanguage("파리 여행 - les meilleurs cafés"), "ko");
  assert.equal(detectTextLanguage("パリ旅行 avec des amis"), "ja");
});

test("video tiếng Pháp: tiêu đề, mô tả, metadata, kênh", () => {
  assert.deepEqual(detectVideoLanguage({ title: "Les secrets de Marseille", defaultAudioLanguage: "en" }), { language: "fr", languageSource: "title" });
  assert.deepEqual(
    detectVideoLanguage({ title: "MARSEILLE 4K", description: "Dans cette vidéo, nous partons à la découverte du Vieux-Port." }),
    { language: "fr", languageSource: "description" }
  );
  assert.deepEqual(detectVideoLanguage({ title: "VLOG #3", defaultAudioLanguage: "fr-FR" }), { language: "fr", languageSource: "metadata" });
  assert.deepEqual(resolveVideoLanguage(detectVideoLanguage({ title: "VLOG #3" }), "fr"), { language: "fr", languageSource: "channel" });
  assert.equal(detectChannelLanguage(["fr", "fr", "en"], {}), "fr");
  assert.equal(detectChannelLanguage([], { country: "FR" }), "fr");
  assert.equal(detectChannelLanguage([], { country: "BE" }), "und");
});
