//! 云效 OpenAPI（openapi-rdc /oapi/v1，PAT 鉴权）客户端
//! 依据：alibabacloud-devops-mcp-server@0.3.64 源码逆向 + 真实冒烟验证
//! 端点清单与契约见 docs/yunxiao-api.md 与 docs/ipc-contract.md

use reqwest::{Client, Method};
use serde_json::Value;

pub const BASE: &str = "https://openapi-rdc.aliyuncs.com";
/// ROA 2021-06-25 族端点（getRelations / listWorkflowStatus 等旧形态接口）
pub const ROA_BASE: &str = "https://devops.cn-hangzhou.aliyuncs.com";

#[derive(Clone)]
pub struct YunxiaoClient {
    http: Client,
    pat: String,
}

impl YunxiaoClient {
    pub fn new(pat: &str) -> Result<Self, String> {
        let http = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))?;
        Ok(Self { http, pat: pat.trim().to_string() })
    }

    async fn req(
        &self,
        base: &str,
        method: Method,
        path: &str,
        query: &[(&str, String)],
        body: Option<Value>,
    ) -> Result<Value, String> {
        let url = format!("{base}{path}");
        let mut rb = self
            .http
            .request(method, &url)
            .query(&query.to_vec())
            .header("Accept", "application/json")
            .header("x-yunxiao-token", &self.pat);
        if base == ROA_BASE {
            // ROA 网关强制要求 Date 头（缺失报 MissingDate 400）
            rb = rb.header("Date", http_date_now());
        }
        if let Some(b) = body {
            rb = rb.json(&b);
        }
        let resp = rb.send().await.map_err(|e| format!("网络错误: {e}"))?;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            // oapi/v1 错误体：{"errorCode":"...","errorMessage":"..."}
            let msg = serde_json::from_str::<Value>(&text)
                .ok()
                .and_then(|v| {
                    let code = v.get("errorCode").and_then(|x| x.as_str()).unwrap_or("");
                    let m = v.get("errorMessage").and_then(|x| x.as_str()).unwrap_or("");
                    if code.is_empty() && m.is_empty() {
                        None
                    } else {
                        Some(format!("{code}: {m}"))
                    }
                })
                .unwrap_or_else(|| truncate(&text, 200));
            return Err(format!("YUNXIAO {status}: {msg}"));
        }
        if text.trim().is_empty() {
            return Ok(Value::Null);
        }
        // 运行触发等接口返回裸数字；非 JSON 成功体（如打错端点返回网关页）带回片段便于定位
        serde_json::from_str(&text)
            .map_err(|e| format!("响应解析失败: {e}；返回片段: {}", truncate(text.trim(), 160)))
    }

    pub async fn get(&self, path: &str, query: &[(&str, String)]) -> Result<Value, String> {
        self.req(BASE, Method::GET, path, query, None).await
    }

    /// ROA 2021-06-25 族 GET（devops.{region}.aliyuncs.com）
    /// PAT 鉴权走 accessToken 查询参数（该族不识别 x-yunxiao-token 头）
    pub async fn get_roa(&self, path: &str, query: &[(&str, String)]) -> Result<Value, String> {
        let mut q: Vec<(&str, String)> = query.to_vec();
        q.push(("accessToken", self.pat.clone()));
        self.req(ROA_BASE, Method::GET, path, &q, None).await
    }

    pub async fn post(&self, path: &str, query: &[(&str, String)], body: Value) -> Result<Value, String> {
        self.req(BASE, Method::POST, path, query, Some(body)).await
    }

    pub async fn put(&self, path: &str, query: &[(&str, String)], body: Value) -> Result<Value, String> {
        self.req(BASE, Method::PUT, path, query, Some(body)).await
    }
}

/// UTF-8 安全截断
pub fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        return s.to_string();
    }
    let mut out: String = s.chars().take(n).collect();
    out.push('…');
    out
}

/// 当前时间的 IMF-fixdate（RFC 7231），ROA 网关 Date 头要求。
/// 无 chrono 依赖，手写民用历换算（1970-01-01 = 星期四）。
fn http_date_now() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    http_date_at(secs)
}

fn http_date_at(secs: i64) -> String {
    let days = secs.div_euclid(86400);
    let rem = secs.rem_euclid(86400);
    let (y, mo, d) = civil_from_days(days);
    const WD: [&str; 7] = ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"];
    const MON: [&str; 12] = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    format!(
        "{}, {:02} {} {} {:02}:{:02}:{:02} GMT",
        WD[days.rem_euclid(7) as usize],
        d,
        MON[(mo - 1) as usize],
        y,
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

/// 天数 → (年, 月, 日)，民用历（同 commands/workitems.rs 的实现）
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn http_date_formats_imf_fixdate() {
        // Unix 纪元：1970-01-01 周四
        assert_eq!(http_date_at(0), "Thu, 01 Jan 1970 00:00:00 GMT");
        // 2026-10-09 03:00:00 UTC = 1791514800（周五）
        assert_eq!(http_date_at(1_791_514_800), "Fri, 09 Oct 2026 03:00:00 GMT");
        // 月末/年初边界：2025-12-31 23:59:59 UTC = 1767225599（周三）
        assert_eq!(http_date_at(1_767_225_599), "Wed, 31 Dec 2025 23:59:59 GMT");
        // 闰日：2024-02-29 12:00:00 UTC = 1709208000（周四）
        assert_eq!(http_date_at(1_709_208_000), "Thu, 29 Feb 2024 12:00:00 GMT");
    }
}
