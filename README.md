# City Beer Station — BEAR DEV

Quán bia 2.5D cho TikTok LIVE. Người xem theo dõi chủ quán là chọn bàn ngồi trong quán; quà tặng được tính bằng **xu** (1 xu = 1 coin) và quy ra món theo **bảng menu**: 1 xu = 1 ly bia, 5 xu = 1 tô phở. Sân có bàn ghế nhựa xanh đỏ, khách bước vào, ngồi ăn phở ban ngày và uống bia ban đêm; quán có khói bia, cụng ly, xúc xắc may mắn, giọng đọc xướng danh và bảng "Bảng nhậu" cập nhật liên tục.

Đây là bản fork/rebrand do **BEAR DEV** duy trì, dựa trên dự án gốc [hoangminhon/city-beer-station](https://github.com/hoangminhon/city-beer-station) (chuyển thể từ [Ô Long Viện](https://github.com/hoangminhon/olongvien)). Bản fork giữ lại giấy phép MIT và ghi nhận bản quyền của tác giả gốc.

| Thư mục | Là gì |
|---|---|
| `index.html`, `assets/` | Bản web tĩnh để mọi người tự vào ngồi, bấm thử quà tại chỗ |
| `live/` | Bộ phát LIVE: server Node, overlay 9:16, bảng điều khiển |

## Chạy bộ LIVE

Cần Node.js 22.19 trở lên (thư viện `piratetok-live-js` yêu cầu).

```bash
cd live
npm install
npm start
```

1. Mở `http://localhost:3000/live/control.html`.
2. Bấm **Mở màn hình overlay 9:16**, rồi bấm **Bật âm thanh** một lần trong cửa sổ đó (trình duyệt chặn tự phát tiếng).
3. TikTok LIVE Studio: *Add source → Window capture* → chọn cửa sổ overlay. Với OBS: *Browser source* trỏ tới `http://localhost:3000/live/overlay.html`, kích thước 1080×1920.
4. Bật LIVE trên TikTok, nhập `@username` vào bảng điều khiển, bấm **Kết nối**.

Đổi cổng bằng biến môi trường, ví dụ `PORT=3100 npm start` (Windows PowerShell: `$env:PORT=3100; npm start`).

Chưa live vẫn thử được: **Thử tương tác**, **Đổ người mẫu 12/24/36/48/64**, **Làm trống quán** hoặc **Bot mô phỏng**.

Trang `index.html` ở thư mục gốc là bản demo tĩnh. Mở trực tiếp bằng trình duyệt hoặc đăng lên hosting tĩnh; server LIVE chỉ phục vụ `/assets` và `/live`, không phục vụ `index.html`.

## Luật chơi

- **Theo dõi chủ quán** → vào quán, ngồi vào chỗ trống gần lối đi trước. Người đã theo dõi sẽ tự vào khi ghé live (tắt được trong bảng điều khiển). Sức chứa tự mở 24 → 36 → 48 → 64.
- **Hoa hồng** (và "Rose") → thẻ xướng danh, +1 xu mỗi hoa hồng. Đây là câu "một hoa hồng, một ly bia" trên bảng hiệu.
- **Quà khác** → số xu = `diamond × số lượng`, kẹp trong 1–999. Quà từ 20 xu trở lên là "Tháp bia": banner lớn, cụng ly, hop bay khắp quán.
- **Cỏ bốn lá** → vẫn cộng xu theo giá trị quà, rồi lắc thêm 3 xúc xắc:

  | Kết quả | Điều kiện | Thưởng |
  |---|---|---|
  | BÃO! | ba xúc xắc giống nhau | +3 ly |
  | TAY CHƠI | tổng 15–18 | +2 ly |
  | CHUẨN BÀI | tổng 9–14 | +1 ly |
  | NON | tổng 3–8 | +0 ly |

  Kèm một thử thách vui ("Mời người bên trái một ly", "Uống cạn trong một hơi"…).
- **Bình luận đúng một từ** `nam`, `nữ`, `ông già`, `bà già` → đổi sang nhóm nhân vật tương ứng (xem bảng dưới).
- **Bình luận `dzô`** (hoặc `zo`, `dzo`) → cả bàn nâng ly.
- **Thả tim** → tim bay trên đầu nhân vật.
- **Bảng nhậu** hiện 5 khách uống nhiều nhất. Tổng số xu của quán là số cộng dồn, người rời quán không làm mất bia đã rót.
- Mỗi 3 phút server tự hô "Cả quán dzô" một lần (đổi được trong bảng điều khiển).

## Bảng menu

Giá trị quà tính bằng **xu** (1 xu = 1 coin). Mỗi lần tặng quà, quán cộng xu vào số ly của người tặng rồi đổi ra món theo bảng menu:

| Món | Giá | Ghi chú |
|---|---|---|
| 🍺 Bia | 1 xu | 1 xu = 1 ly bia |
| 🍜 Phở | 5 xu | 1 tô phở = 5 xu |

- Chia hết cho phở trước, phần dư thành bia: **5 xu → "1 phở"**, **6 xu → "1 phở và 1 bia"**, **20 xu → "4 phở"**.
- Mỗi lần gọi món, quán thông báo trên overlay và đọc bằng giọng đọc: *"Xin xướng danh Hà My, đã gọi 1 phở. Tổng cộng 5 xu. Dzô!"*. **Mọi món quà đều được xướng tên** (kể cả quà nhỏ nhất); quà hồng thì xướng danh trước rồi cả quán dzô, quà 20 xu trở lên thì cả quán nâng ly.
- Bảng menu được vẽ ở góc trái overlay (và trên trang demo tĩnh), lấy từ `MENU` trong [`assets/scene.js`](assets/scene.js) — server gửi kèm theo trạng thái nên hai bên luôn khớp.

## Đổi nhân vật

Các nhân vật được chia thành 4 nhóm. Bình luận đúng từ khóa của nhóm sẽ lọc trong nhóm đó rồi chọn **ngẫu nhiên một nhân vật** (ưu tiên nhân vật khác dáng hiện tại để thay đổi thấy rõ):

| Từ khóa chat | Nhóm | Nhân vật trong nhóm |
|---|---|---|
| `nam` (cũng `anh`, `trai`) | Nam | nam, nam mũ lưỡi trai |
| `nữ` (cũng `chị`, `gái`, `em`, `bé`) | Nữ | nữ, nữ gợi cảm |
| `ông già` (cũng `chú`, `bác`, `cụ`) | Ông già | ông già |
| `bà già` (cũng `bà`, `má`, `cụ bà`) | Bà già | bà già |

Từ khóa riêng theo dáng vẫn dùng được: `mũ` → mũ lưỡi trai, `sexy` → nữ gợi cảm. Trang demo tĩnh có nút **Đổi hình** để chọn nhóm trước khi vào quán; bảng điều khiển có bốn nút gửi bình luận tương ứng.

## Ngày và đêm

Sân đổi cảnh theo giờ của máy phát: khoảng **05:00–16:00 bán cơm · phở** (nền `city-bg-light`, khách ăn trong sân), **16:00–05:00 bán bia** (nền `city-bg-dark`, khách ngồi nhậu). Hai nền chuyển mờ dần trong khoảng một giờ quanh mỗi mốc, đèn dây và ánh hoàng hôn tắt dần theo.

Bảng điều khiển có mục **Thời điểm trong ngày**: `Tự động theo giờ`, `Luôn ban ngày`, `Luôn ban đêm`, cùng hai ô giờ bắt đầu bán cơm và bán bia (hai mốc phải cách nhau ít nhất 2 giờ). Trang demo tĩnh bấm vào chip thời điểm trên HUD để đổi nhanh giữa ba chế độ.

## Bảng điều khiển

- Kết nối / ngắt TikTok LIVE theo `@username`; không cần mật khẩu hay cookie.
- Xem số khách, tổng xu, danh sách người đang ngồi và số xu từng người; xoá người mẫu/bot.
- Thử bình luận, theo dõi, dzô, Hoa hồng +1 xu, Phở +5 xu, Đại món +20 xu, Cỏ bốn lá.
- Bốn nút **Đổi nhân vật (nhóm)** gửi bình luận `nam` / `nữ` / `ông già` / `bà già` để đổi dáng khách.
- Đổ người mẫu, làm trống quán, bật/tắt bot mô phỏng (chỉ chạy trên máy bạn).
- Chọn giọng đọc (Google mặc định, hoặc Edge Nam Minh / Hoài My), độ trầm, tốc độ; đọc thử.
- Bật/tắt nhạc, tiếng quán & phố, tiếng cụng ly, tự hô dzô; chọn bài, âm lượng, nhịp hô, số chỗ ngồi.
- Đổi tên quán, dòng phụ và bật/tắt tự xếp chỗ cho người đã theo dõi.
- Chọn thời điểm trong ngày: tự động theo giờ, luôn ban ngày (cơm · phở) hoặc luôn ban đêm (bia), kèm hai mốc giờ.

## Giọng đọc

Mặc định dùng Google Dịch tiếng Việt: trả kết quả trong khoảng một giây, không giữ WebSocket nên không bị ngắt giữa câu. Chọn Edge thì server chia câu thành đoạn khoảng 150 ký tự, thử lại trên kết nối mới và tự chuyển về Google nếu Edge lỗi. Đoạn đã đọc được lưu đệm trong bộ nhớ. Tốc độ áp dụng cho cả hai giọng, độ trầm chỉ áp dụng cho Edge. Máy phát cần Internet; mạng chặn IPv6 tới `speech.platform.bing.com` có thể đổi bằng biến `TTS_IP_FAMILY` (4, 6 hoặc 0).

## Nhạc quán

Nhạc nền đọc từ [`assets/music/library.json`](assets/music/library.json) qua trình phát dùng chung [`assets/audio-player.js`](assets/audio-player.js). Trang tĩnh và overlay LIVE dùng chung danh sách.

Mặc định là **ban nhạc quán** — một vòng nhạc sôi động (118 BPM, trống bốn nhịp, bass, hợp âm và giai điệu) tổng hợp trực tiếp bằng Web Audio trong [`assets/bar-sound.js`](assets/bar-sound.js), không cần file và không vướng bản quyền. Mục này dùng `"engine": "band"` thay cho `src`:

```json
{
  "id": "house-band",
  "title": "Ban nhạc quán · sôi động",
  "engine": "band",
  "credit": "Tổng hợp Web Audio trong dự án",
  "license": "Tài nguyên của dự án"
}
```

Thêm bài từ file như cũ:

```json
{
  "id": "dem-via-he",
  "title": "Đêm vỉa hè",
  "src": "music1.mp3",
  "credit": "Tạo bằng Gemini cho dự án",
  "license": "Tài nguyên của dự án"
}
```

- `src` là đường dẫn tương đối so với `library.json` (file nằm trong `assets/music/`). Hỗ trợ `.mp3`, `.ogg`, `.m4a`, `.wav`. Mục có `"engine": "band"` thì bỏ qua `src`.
- `id` là chữ thường không dấu, dùng cho bộ chọn bài và để ghi nhớ bài đang phát.
- Trình phát tự lưu bài và âm lượng trong `localStorage`; nếu không tải được `library.json` thì dùng danh sách mặc định (ban nhạc + hai bài cũ).
- Bài đầu tiên trong danh sách là bài mặc định. Bản ghi nhớ cũ (trước khi có ban nhạc) được bỏ qua một lần để quán mở bằng nhạc mới.

### Tiếng quán & phố

[`assets/bar-sound.js`](assets/bar-sound.js) có hai lớp ambience:

- `Crowd`: tiếng rì rầm nhiều lớp, cụng ly, kéo ghế và hò reo ngẫu nhiên, to dần theo số khách. Mỗi lần có người lên bia lớn hoặc cả quán hô dzô, lớp này thêm một đợt vỗ tay và huýt sáo.
- `Street`: thu âm nhà hàng đường phố phát lặp, xe cộ ùa qua ngẫu nhiên, và tiếng hô "hai, ba, dzô" khi cả quán nâng ly. Không còn còi xe. File nằm trong `assets/audio/`, nguồn và điều khoản ghi ở [`assets/audio/SOURCES.md`](assets/audio/SOURCES.md).

Bật/tắt cả hai bằng **Tiếng quán & phố** trong bảng điều khiển; tự giảm âm lượng khi trợ lý đọc lời chúc. Trang tĩnh dùng chung hai lớp này và tắt theo nút tắt tiếng.

**Bản quyền:** chỉ dùng bản tự thu, CC0 / public domain hoặc CC BY (kèm ghi công). Không tải lại bản đăng trên YouTube/TikTok/Spotify. Ghi nguồn vào `credit`, giấy phép vào `license`.

## Đồ hoạ

- Hai nền sân 768×1376 (phóng lên khung 1080×1920): `assets/city-bg-light.webp` (ban ngày) và `assets/city-bg-dark.webp` (ban đêm), chuyển mờ theo giờ. Ảnh gốc `city-bg-light.png` / `city-bg-dark.png`; khi thay ảnh, chạy lại lệnh chuyển WebP hoặc cập nhật cả hai bản.
- 6 nhân vật × 5 tư thế = 30 sprite, gộp thành `assets/atlas.webp` + `atlas.json`: ngồi nhìn từ sau (uống bia), ngồi ăn phở, đi bộ toàn thân, ngồi đối diện quay mặt (uống bia) và ngồi đối diện ăn phở. [`assets/sprites.js`](assets/sprites.js) đọc atlas và tự quay về file rời nếu thiếu atlas (kể cả khi mở bằng `file://`).
- Vị trí bàn trong ảnh nền được neo theo toạ độ ảnh (768×1376) trong [`assets/scene.js`](assets/scene.js); khách ngồi đúng bàn đã vẽ, phần bàn bị khuất được vá lại từ chính ảnh nền. Hai hàng bàn nhựa xanh đỏ được vẽ thêm ở khoảng sân trống phía trước, cùng chai, cốc, tô phở và khói. Số chỗ tự đổi theo sức chứa 24 → 64.
- Ly bia, bọt, hop, xúc xắc được vẽ trong [`assets/beer-fx.js`](assets/beer-fx.js).
- Nhãn tên được vẽ một lần vào canvas ngoài màn hình rồi dán lại mỗi khung hình, tự bỏ nhãn chồng nhau; bàn ghế tĩnh và nền được đệm thành lớp riêng nên chỉ dán lại mỗi khung hình.

Tạo lại nhân vật từ ảnh gốc trên phông xanh:

```bash
cd live
npm run assets:key     # tách phông xanh/magenta -> assets/*.webp
npm run assets:atlas   # gộp 30 tư thế thành atlas
```

Ảnh gốc nằm trong `vibe_images/` (1024×1536; nhân vật cũ dùng phông `#00FF00`, các tư thế đi/ăn/ngồi đối diện dùng `#FF00FF`).

## Bảo mật

- **Không dùng tài khoản TikTok.** Server chỉ đọc sự kiện công khai của phòng live theo username. Không hỏi, không lưu mật khẩu, cookie hay session; không gửi tin nhắn thay bạn.
- **Chỉ mở trên máy mình.** Server lắng nghe `127.0.0.1`; máy khác trong mạng hay Internet không truy cập được. Muốn mở ra ngoài phải tự đặt `HOST` và nên thêm đăng nhập trước.
- **Chặn trang web lạ điều khiển.** WebSocket chỉ nhận kết nối từ chính trang của server (kiểm tra `Origin`), header `Host` phải là localhost (chống DNS rebinding). Overlay chỉ nhận dữ liệu, không gửi lệnh.
- **File tĩnh có danh sách trắng.** Chỉ phục vụ `/assets` và `/live`; chặn file ẩn, `node_modules`, mã server, `package.json` và mọi đường dẫn `../`.
- **Không tin dữ liệu vào.** Tên, bình luận, tên quà bị cắt độ dài; cài đặt chỉ nhận đúng khóa, đúng kiểu, trong giới hạn; chữ đưa vào giọng đọc được escape XML; mọi chữ trên màn hình vẽ bằng `textContent` hoặc canvas.
- **Chống spam.** Hàng đợi giọng đọc tối đa 15 câu; bình luận thường không đọc thành tiếng.
- **Avatar được đệm tại máy phát.** Server chỉ tải avatar qua https từ host TikTok CDN trong danh sách trắng, kiểm tra lại redirect, giới hạn 3 MB, thu nhỏ 160 px WebP, lưu trong `live/avatar-cache/` (tự xoá bớt khi quá 400 ảnh).

## Lưu ý

- `piratetok-live-js` là thư viện cộng đồng, không phải API chính thức của TikTok. Nó tự ký WebSocket trên máy phát nên không cần signing server hay API key, nhưng có thể ngừng chạy khi TikTok đổi hệ thống. Kiểm tra điều khoản TikTok trước khi dùng cho kênh của bạn.
- Nhân vật được tạo bằng AI từ ảnh tham chiếu; hai bài nhạc dự phòng tạo bằng Gemini, còn ban nhạc và tiếng quán đông được tổng hợp bằng Web Audio ngay trong dự án. Kiểm tra điều khoản của dịch vụ tạo ảnh/nhạc trước khi dùng thương mại, hoặc thay bằng tài nguyên của bạn.
- Dự án gốc phát hành theo MIT; bản BEAR DEV giữ nguyên giấy phép đó.

## Miễn trừ trách nhiệm

Dự án được chia sẻ **miễn phí, với mục đích học tập và tham khảo lập trình**. Phần mềm được cung cấp "nguyên trạng" (AS IS), không kèm bất kỳ bảo đảm nào.

Khi tải về, sử dụng, chỉnh sửa hoặc phân phối lại mã nguồn này, **bạn tự chịu hoàn toàn trách nhiệm** về nội dung bạn phát, việc nhận quà/donation, việc tuân thủ điều khoản TikTok và pháp luật nơi bạn hoạt động, cũng như mọi rủi ro phát sinh (khoá tài khoản, dừng live, mất dữ liệu, tranh chấp…).

Tác giả không liên quan, không bảo trợ và không chịu trách nhiệm đối với bất kỳ kênh, tài khoản hay hoạt động nào sử dụng mã nguồn này. Vui lòng uống có trách nhiệm và không dùng nội dung cổ vũ uống rượu bia quá mức, đặc biệt với người chưa đủ tuổi.

## Ghi nhận

Bản BEAR DEV không sử dụng thông tin tài khoản hoặc mã QR ủng hộ của tác giả gốc. Nếu bạn phân phối hoặc chỉnh sửa tiếp, hãy giữ lại `LICENSE` và phần ghi nhận nguồn này.

## Giấy phép

MIT, xem `LICENSE`.
