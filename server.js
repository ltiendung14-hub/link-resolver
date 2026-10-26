
const express = require("express");
const path = require("path");

const app = express();
app.use(express.json({ limit: "5kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.send("OK");
});

app.post("/api/resolve", (req, res) => {
  const input = req.body?.url;

  if (typeof input !== "string" || input.length > 2048) {
    return res.status(400).json({
      ok: false,
      error: "Vui lòng nhập URL hợp lệ."
    });
  }

  let target;
  try {
    target = new URL(input);
  } catch {
    return res.status(400).json({
      ok: false,
      error: "URL không hợp lệ."
    });
  }

  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password
  ) {
    return res.status(400).json({
      ok: false,
      error: "Chỉ chấp nhận URL HTTPS hợp lệ."
    });
  }

  return res.json({
    ok: true,
    url: target.href,
    message: "Link đã được kiểm tra. Mở link để tiếp tục các bước mà trang yêu cầu."
  });
});

const port = process.env.PORT || 3000;

app.listen(port, "0.0.0.0", () => {
  console.log("Dark AI Studio đang chạy trên cổng " + port);
});
