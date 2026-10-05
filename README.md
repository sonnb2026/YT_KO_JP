# Bảng theo dõi kênh YouTube Tiếng Hàn & Tiếng Nhật

Web app tĩnh (deploy trên Vercel) để theo dõi thống kê của nhiều danh sách kênh
YouTube theo tab: lượt xem, tốc độ tăng view (view/giờ), lượt thích, lượt bình luận,
sub kênh, ngày đăng — kèm xem bình luận từng video (có sắp xếp + dịch nhanh sang
tiếng Việt), trợ lý phân tích AI (Gemini, người dùng tự nhập API key riêng), và bảng
**quản lý kênh/tab ngay trên web** — không cần biết lập trình, không cần vào GitHub.

Dữ liệu được GitHub Actions gọi API YouTube **1 lần/ngày** (hoặc bấm nút "Fetch dữ
liệu" trên web để chạy ngay), lưu thành file JSON tĩnh trong repo. Frontend (Vercel)
chỉ đọc file JSON này — **không cần API key YouTube ở phía trình duyệt**.

```
┌─────────────┐   cron 1 lần/ngày      ┌──────────────────┐
│ GitHub       │ ───────────────────▶  │ YouTube Data API │
│ Actions      │ ◀───────────────────  │ v3               │
└──────┬──────┘   video + comment data └──────────────────┘
       │ commit public/data/*.json
       ▼
┌─────────────┐   phục vụ file tĩnh   ┌──────────────────┐
│ GitHub repo  │ ───────────────────▶ │ Vercel (frontend) │
└─────────────┘  ◀─────────────────── │  + api/*.js       │
     ▲            workflow_dispatch,  └──────────────────┘
     └── các nút "Fetch dữ liệu" / "Quản lý kênh" trên web gọi vào api/*.js
```

## 1. Cấu trúc project

```
channels.json                 # danh sách kênh YouTube theo từng tab, vd { "Korea": [...], "Japan": [...] }
scripts/fetch-data.mjs        # script gọi YouTube API, chạy bởi GitHub Actions
scripts/language.mjs          # nhận diện ngôn ngữ từng video (Hàn/Nhật), test: language.test.mjs
.github/workflows/fetch-data.yml  # lịch chạy cron + workflow_dispatch (chạy tay)
api/trigger-fetch.js          # nút "Fetch dữ liệu" trên web gọi vào đây để kích hoạt workflow trên
api/manage-channels.js        # nút "Quản lý kênh" trên web gọi vào đây để tự sửa channels.json trên GitHub
public/                       # toàn bộ frontend, đây là thư mục Vercel sẽ publish
  index.html
  style.css
  app.js
  data/
    tabs.json                 # danh sách tên tab hiện có (được ghi tự động, web đọc để tự tạo nút tab)
    videos-<TÊN LIST>.json    # vd videos-Korea.json (được ghi tự động)
    meta-<TÊN LIST>.json      # vd meta-Korea.json (được ghi tự động)
    channel-map-<TÊN LIST>.json  # ánh xạ kênh -> channelId, dùng nội bộ (được ghi tự động)
    comments/<videoId>.json   # bình luận từng video, dùng chung cho mọi danh sách (được ghi tự động)
```

**Quan trọng:** kể từ bản này, các nút tab trên web (`index.html`) được **tạo tự động**
từ `public/data/tabs.json` — bạn không bao giờ cần sửa `index.html` để thêm/xoá tab
nữa. Chỉ cần dùng bảng "Quản lý kênh" ngay trên web (xem mục 9).

## 2. Lấy YouTube Data API key

1. Vào [Google Cloud Console](https://console.cloud.google.com/) → tạo project mới.
2. Bật **YouTube Data API v3** (APIs & Services → Library → tìm "YouTube Data API v3" → Enable).
3. Vào **APIs & Services → Credentials** → Create credentials → API key.
4. (Khuyến khích) Giới hạn API key chỉ dùng cho "YouTube Data API v3" để an toàn hơn.

Quota mặc định: 10.000 unit/ngày/project. Muốn dùng nhiều API key để cộng dồn quota,
mỗi key phải nằm ở **Google Cloud Project khác nhau** (nhiều key cùng 1 project vẫn
chỉ chung 1 cục 10.000 unit).

## 3. Đưa project lên GitHub

```bash
cd yt-travel-tracker
git init
git add .
git commit -m "init: youtube travel tracker"
git branch -M main
git remote add origin https://github.com/<username>/<repo>.git
git push -u origin main
```

## 4. Thêm API key vào GitHub Secrets

Repo trên GitHub → **Settings → Secrets and variables → Actions → New repository secret**

- Nếu chỉ có 1 key: Name `YOUTUBE_API_KEY`, Value = key vừa tạo.
- Nếu có nhiều key (mỗi key ở project GCP riêng): Name `YOUTUBE_API_KEYS`, Value =
  `key1,key2,key3` (cách nhau dấu phẩy, không dấu cách, không ngoặc kép).

## 5. Tạo Personal Access Token (PAT) cho Vercel

Web cần 1 token GitHub để tự động: (a) kích hoạt fetch dữ liệu, (b) tự sửa
`channels.json` khi ai đó thêm kênh/tab qua bảng "Quản lý kênh".

1. Vào [github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens) →
   **Generate new token** (loại *fine-grained*, khuyến khích).
2. **Repository access** → *Only select repositories* → chọn đúng repo này. **Permissions** →
   *Contents: Read and write* và *Actions: Read and write* → Generate.
   (Token classic với scope `repo` cũng chạy được, nhưng nó có quyền trên MỌI repo của
   bạn - nếu lộ thì thiệt hại lớn hơn nhiều.)
3. **Copy token lại ngay** (chỉ hiện 1 lần) — sẽ dùng ở bước deploy Vercel dưới đây.

## 6. Deploy lên Vercel

1. Vào [vercel.com](https://vercel.com) → **Add New → Project** → import đúng repo
   GitHub vừa tạo.
2. Vercel tự nhận diện static site + API route trong `api/`, không cần chỉnh build
   settings gì thêm.
3. Trước khi deploy (hoặc sau đó vào **Settings → Environment Variables**), thêm 3
   biến sau:

   | Biến | Giá trị |
   |---|---|
   | `GITHUB_TOKEN` | Token tạo ở bước 5. **Không để lộ ra ngoài, chỉ nhập ở đây.** |
   | `GITHUB_OWNER` | Username/org GitHub sở hữu repo |
   | `GITHUB_REPO` | Tên repo |

   Không có mật khẩu nào cần thiết lập — ai vào được trang web đều dùng được các nút
   "Fetch dữ liệu" và "Quản lý kênh".

4. Deploy. Xong — mỗi khi GitHub Actions commit dữ liệu mới, Vercel tự deploy lại bản
   mới nhất.

## 7. Thêm kênh/tab đầu tiên

Bản này giao kèm sẵn 2 tab rỗng là `Korea` và `Japan`. Sau khi deploy xong, vào trang web →
bấm **"Quản lý kênh"** → chọn tab → dán link/@handle kênh → "Thêm kênh". Một tab có thể chứa
cả kênh Hàn lẫn kênh Nhật - ngôn ngữ được nhận diện theo từng video, không theo tab. Không cần vào GitHub, không cần sửa file gì cả — xem chi tiết mục 9.

Kênh **mới thêm lần đầu sẽ tự động được lấy TOÀN BỘ video** (không giới hạn ~50 video
gần nhất) — không cần tích chọn gì thêm.

## 8. Lịch chạy cron

Mặc định workflow chạy **1 lần/ngày**: 23:00 UTC (~06:00 sáng giờ VN). Muốn đổi lịch,
sửa phần `cron` trong `.github/workflows/fetch-data.yml` (cú pháp cron chuẩn UTC).

Bạn cũng có thể bấm nút **"Fetch dữ liệu"** trên web để chạy ngay bất cứ lúc nào —
sẽ fetch **tất cả các tab** cùng lúc, không có tuỳ chọn chỉ chạy 1 tab.

## 9. Hướng dẫn dùng các nút trên web

### Nút "Fetch dữ liệu"
Chạy lấy dữ liệu YouTube mới nhất ngay, không cần đợi tới giờ cron. Mất vài phút,
tải lại trang sau đó để xem kết quả. Có 2 tuỳ chọn nâng cao (thường không cần
tích): "Ép làm mới toàn bộ bình luận" và "Lấy toàn bộ video của MỌI kênh" (kênh mới
thêm đã tự động full-history sẵn rồi, 2 ô này chỉ dùng khi muốn làm lại cho *mọi*
kênh cùng lúc, khá tốn quota).

### Nút "Quản lý kênh"
- **Thêm kênh vào tab có sẵn**: chọn tab trong ô sổ xuống, dán link hoặc `@handle`
  kênh YouTube, bấm "Thêm kênh".
- **Tạo tab mới**: nhập tên tab (chỉ chữ không dấu, số, `_` hoặc `-`, tối đa 40 ký tự — vd `Korea_Food`), dán link kênh
  đầu tiên, bấm "Tạo tab mới".
- **Xoá kênh**: chọn tab, danh sách kênh hiện có sẽ hiện bên dưới, bấm dấu ✕ cạnh
  kênh muốn xoá.
- Mọi thay đổi có hiệu lực trong **vài phút** (hệ thống tự chạy fetch cho kênh/tab
  mới ngay sau khi bạn thêm) — không cần bấm thêm gì khác.

### Các tính năng khác
- Tìm kiếm theo tiêu đề video / tên kênh, lọc theo từng kênh riêng lẻ, lọc theo
  khoảng thời gian đăng.
- Sắp xếp theo: ngày đăng, lượt xem, view/giờ, lượt thích, lượt bình luận, sub kênh.
- Bấm vào 1 video → mở bảng bình luận của video đó, có nút "Dịch sang Tiếng Việt".
- Chip "Tổng VPH", "View 1 ngày", "View 7 ngày" ở header.
- Trợ lý phân tích AI (nút "Hỏi AI" góc dưới phải) — người dùng tự nhập Gemini API
  key của họ (lưu trong trình duyệt, không gửi lên server).

## 10. Giới hạn cần biết

- **Không có mật khẩu nào bảo vệ** các nút "Fetch dữ liệu" / "Quản lý kênh" — ai vào
  được trang web đều dùng được. Nếu cần hạn chế, cách đơn giản nhất là không công khai
  rộng rãi link trang web.
- Endpoint dịch dùng trong app (`translate.googleapis.com`) là endpoint công khai
  không chính thức của Google — miễn phí, không cần key, nhưng không có SLA chính
  thức, có thể bị giới hạn nếu gọi quá nhiều trong thời gian ngắn.
- `likeCount`/`subscriberCount` có thể là `null` nếu kênh ẩn số liệu đó.
- Nếu 1 kênh lỗi/hết quota giữa chừng, script ghi lỗi vào `meta-<LIST>.json` (mục
  `errors`) và tiếp tục các kênh còn lại — kênh lỗi vẫn giữ nguyên dữ liệu từ lần
  fetch thành công gần nhất, không bị xoá.
- **`viewsPerHour`**: tính bằng `(view hiện tại - view lần fetch trước) / số giờ giữa
  2 lần fetch`. Video mới thấy lần đầu sẽ tạm hiển thị trung bình cả đời video, có
  đánh dấu `~` để phân biệt.
- **`View 1 ngày` / `View 7 ngày`**: là tổng lượt xem của các video **đăng trong**
  khoảng thời gian đó, không phải tốc độ tăng trưởng.

## 11. Các thay đổi so với bản gốc (bản tuỳ chỉnh này)

- **Khoảng thời gian**: chỉ còn 3 lựa chọn — "Tất cả", "7 ngày gần nhất", "1 tháng gần nhất".
- **Cột mới** (thêm vào bảng, không mất cột nào cũ):
  - **Lịch sử đăng**: số ngày kể từ khi video được đăng.
  - **Tương tác**: tỷ lệ (Lượt thích + Bình luận) / Lượt xem, tính theo %.
  - **Nhóm kênh**: phân loại kênh theo sub — Kênh mới (< 2K), Kênh nhỏ (2K–10K), Kênh lớn (> 10K). Khi dữ liệu đang lọc có nhiều hơn 1 kênh, phía trên bảng sẽ tự hiện thanh tóm tắt số lượng kênh theo từng nhóm.
- **Chọn biến hiển thị**: nút "N/3 biến đang hiện" cạnh ô tìm kiếm — cho chọn tối đa 3 trong 4 biến: View/giờ, Lịch sử đăng, Tương tác, Nhóm kênh (4 cột gốc Ngày đăng/Thời lượng/Lượt xem/Thích/Bình luận/Sub kênh luôn hiển thị, không tắt được). Mặc định đang bật: View/giờ, Lịch sử đăng, Tương tác.
- **Nhận xét lượt xem khi di chuột**: di chuột vào số ở cột "Lượt xem" sẽ hiện tooltip: Thất bại (< 5.000), Bình thường (5.000–20.000), Tiềm năng (20.000–100.000), Top View (> 100.000).
- **Xuất Excel**: nút "Xuất Excel" cạnh nút "Quản lý kênh" — xuất đúng danh sách video đang lọc/sắp xếp trên màn hình (kèm các cột đang bật) ra file `.xlsx`, dùng thư viện SheetJS tải qua CDN (`cdnjs.cloudflare.com`), chạy hoàn toàn phía trình duyệt, không qua server.

Các ranh giới số (2K/10K sub, 5K/20K/100K view) đang hard-code trong `public/app.js`
(hàm `classifyChannelGroup` và `classifyViewRating`) — sửa trực tiếp 2 hàm này nếu
muốn đổi ngưỡng.

## 12. (Tuỳ chọn) Đồng bộ sang Google Sheets

Có sẵn 1 Google Apps Script (gửi kèm riêng, file `sync-to-google-sheets.gs.txt`) để
đọc trực tiếp `public/data/videos-<LIST>.json` từ trang web và đổ vào Google Sheets —
không cần service account, không tốn quota YouTube API. Có thể đặt lịch tự chạy mỗi
ngày ngay trong Google Apps Script.


## 13. Bản Tiếng Hàn & Tiếng Nhật

### Ngôn ngữ được xác định theo TỪNG VIDEO
Mỗi video được gắn trường `language` (`ko` = Tiếng Hàn, `ja` = Tiếng Nhật, mã khác, hoặc `und` =
không xác định) khi fetch, theo thứ tự ưu tiên (`scripts/language.mjs`):

1. **Chữ viết trong tiêu đề** — có chữ Hangul → Hàn; có Hiragana/Katakana → Nhật. Đây là tín
   hiệu chắc chắn nhất vì 2 bộ chữ này không dùng chung giữa 2 ngôn ngữ.
2. **Chữ viết trong mô tả video** — khi tiêu đề chỉ có Hán tự (vd `京都紅葉`) hoặc chữ Latin.
3. **Ngôn ngữ chủ kênh khai báo** (`defaultAudioLanguage` / `defaultLanguage`) — chỉ tính là
   chắc chắn khi là `ko`/`ja`. Nhiều kênh để nguyên giá trị mặc định `en` cho mọi video, nên
   giá trị khác bị coi là tín hiệu yếu.
4. **Ngôn ngữ chủ đạo của kênh** — đa số video của kênh, rồi tới ngôn ngữ/quốc gia (KR/JP) của
   kênh.

Rê chuột vào nhãn ngôn ngữ trong bảng để xem video được nhận diện theo cách nào.

### App đọc dữ liệu theo đúng ngôn ngữ đó
- **Dịch tiêu đề** (rê chuột vào tiêu đề, và hiện sẵn dưới tiêu đề trong bảng bình luận): dịch
  từ đúng ngôn ngữ của video sang Tiếng Việt (`sl=ko` hoặc `sl=ja`), không để Google đoán.
  Điều này quan trọng với tiêu đề chỉ có Hán tự, vốn rất dễ bị nhận nhầm thành tiếng Trung.
- **Dịch bình luận**: ưu tiên chữ viết của chính bình luận (khán giả có thể bình luận tiếng
  Hàn dưới video Nhật hoặc ngược lại). Bình luận chỉ có Hán tự thì theo ngôn ngữ video. Bình
  luận không có chữ Hàn/Nhật (vd tiếng Anh) thì để Google tự nhận diện.
- **Trợ lý AI**: mỗi video gửi đi được gắn nhãn KO/JA, Gemini được yêu cầu đọc theo đúng ngôn
  ngữ của từng video, trả lời bằng Tiếng Việt, trích dẫn nguyên văn kèm bản dịch, và tách nhận
  xét riêng cho nhóm Hàn và nhóm Nhật.
- **Cột "Ngôn ngữ"** trong bảng (có trong ô Sắp xếp và trong file Excel), **chip lọc ngôn ngữ**
  🇰🇷 / 🇯🇵 phía trên bảng, và tỷ lệ ngôn ngữ trong bảng thống kê kênh.
- Font Noto Sans KR / Noto Sans JP được nạp để chữ Hàn, Nhật hiển thị đúng nét.

### Các lỗi của bản gốc đã được sửa
- Kênh bị dán trùng 2 lần (link `/channel/UC…` và `@handle` của cùng 1 kênh) chỉ được fetch 1
  lần, có ghi cảnh báo vào `meta-<tab>.json`. Xoá 1 trong 2 dòng trùng không còn xoá mất dữ
  liệu của kênh.
- Kênh mới bị hết quota giữa lúc đang lấy toàn bộ lịch sử: lần sau vẫn được lấy lại toàn bộ,
  không còn bị kẹt ở ~50 video.
- Lấy bình luận bị lỗi: lần fetch sau tự thử lại (trước đây bị bỏ qua mãi vì số bình luận không
  đổi).
- Workflow chỉ chạy 1 lượt tại 1 thời điểm (`concurrency`), không còn chạy song song khi thêm
  nhiều kênh liên tiếp hay bấm "Fetch dữ liệu" nhiều lần.
- Chip "Kênh" đếm số kênh thực (không đếm dòng trùng/kênh không tìm thấy); quota và lỗi reply
  trong `meta-<tab>.json` tính riêng từng tab.
- Bảng "Quản lý kênh": tab vừa tạo/đổi tên/xoá hiện đúng ngay trong ô chọn tab và trên thanh
  tab, không bị danh sách cũ ghi đè. Tab chưa có dữ liệu hiện hướng dẫn thay vì bảng trống.
- Đổi tên tab vẫn giữ được dữ liệu khi file `videos-<tab>.json` lớn hơn 1 MB.
- Trợ lý AI giới hạn lượng bình luận gửi đi (25 bình luận nhiều like nhất/video, tổng ~350.000
  ký tự, ưu tiên video nhiều view) để không vượt giới hạn của Gemini; bộ lọc ra 0 video thì
  gửi đúng 0 video thay vì lặng lẽ gửi toàn bộ.
- Bình luận rỗng do giới hạn 90 ngày được giải thích rõ trong bảng bình luận.

### Lưu ý
- App chỉ lưu bình luận trong **90 ngày gần nhất** (`COMMENT_MAX_AGE_DAYS`, mặc định 90). Video
  cũ không có bình luận mới sẽ hiện thông báo tương ứng. Đặt `COMMENT_MAX_AGE_DAYS: "0"` trong
  `.github/workflows/fetch-data.yml` để bỏ giới hạn (tốn quota hơn).
- Các nút "Fetch dữ liệu" / "Quản lý kênh" vẫn **không có mật khẩu** như bản gốc.
