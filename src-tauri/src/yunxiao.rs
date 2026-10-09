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
    pub async fn get_roa(&self, path: &str, query: &[(&str, String)]) -> Result<Value, String> {
        self.req(ROA_BASE, Method::GET, path, query, None).await
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
