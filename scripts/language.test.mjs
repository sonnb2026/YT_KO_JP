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
