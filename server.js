
const express = require("express");
const path = require("path");
const dns = require("node:dns").promises;
const net = require("node:net");

const app = express();

app.use(express.json({ limit: "5kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.send("OK");
});

function isPublicAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);

    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }

  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase();

    return (
      s.startsWith("2001:") ||
      s.startsWith("2600:") ||
      s.startsWith("2a00:")
    ) && !s.startsWith("2001:db8:");
  }

  return false;
}

async function checkPublicHost(hostname) {
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Tên máy chủ không được phép.");
  }

  if (net.isIP(hostname)) {
    if (!isPublicAddress(hostname)) {
      throw new Error("Địa chỉ IP riêng không được phép.");
    }
    return;
  }

  const records = await dns.lookup(hostname, { all: true });

  if (
    !records.length ||
    records.some(record => !isPublicAddress(record.address))
  ) {
    throw new Error("Máy chủ có địa chỉ IP không an toàn.");
  }
}

app.post("/api/resolve", async (req, res) => {
  const input = req.body?.url;

  if (typeof input !== "string" || input.length > 2048) {
    return res.status(400).json({
      ok: false,
      error: "Vui lòng nhập URL hợp lệ."
    });
  }

  let current;

  try {
    current = new URL(input.trim());
  } catch {
    return res.status(400).json({
      ok: false,
      error: "URL không hợp lệ."
    });
  }

  if (
    current.protocol !== "https:" ||
    current.username ||
    current.password
  ) {
    return res.status(400).json({
      ok: false,
      error: "Chỉ chấp nhận URL HTTPS không chứa thông tin đăng nhập."
    });
  }

  const history = [];
  const maxRedirects = 5;

  try {
    for (let i = 0; i <= maxRedirects; i++) {
      await checkPublicHost(current.hostname);

      history.push(current.href);

      const response = await fetch(current.href, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(7000),
        headers: {
          "User-Agent": "DarkAIStudio-LinkChecker/1.0"
        }
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");

        if (!location) break;

        if (i === maxRedirects) {
          throw new Error("Link chuyển hướng quá nhiều lần.");
        }

        const next = new URL(location, current);

        if (
          next.protocol !== "https:" ||
          next.username ||
          next.password
        ) {
          throw new Error("Đích chuyển hướng không được phép.");
        }

        current = next;
        continue;
      }

      return res.json({
        ok: true,
        originalUrl: input.trim(),
        finalUrl: current.href,
        history,
        status: response.status,
        message:
          "Đã kiểm tra được đích đến. Đây không phải bảo đảm rằng trang web an toàn."
      });
    }

    return res.json({
      ok: true,
      originalUrl: input.trim(),
      finalUrl: current.href,
      history,
      message: "Không tìm thấy thêm chuyển hướng."
    });
  } catch (error) {
    return res.status(400).json({
      ok: false,
      error:
        error.name === "TimeoutError"
          ? "Trang phản hồi quá chậm."
          : error.message || "Không thể xử lý link này."
    });
  }
});

const port = process.env.PORT || 3000;

app.listen(port, "0.0.0.0", () => {
  console.log("Dark AI Studio đang chạy trên cổng " + port);
});
