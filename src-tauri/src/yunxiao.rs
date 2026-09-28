//! 云效 OpenAPI（ROA REST）客户端 —— PAT 鉴权直连
//! 端点依据 docs/yunxiao-api.md（提取自 aliyun CLI v3.5.1 内置元数据）

use reqwest::{Client, Method};
use serde_json::Value;

pub const BASE: &str = "https://devops.cn-hangzhou.aliyuncs.com";

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
        method: Method,
        path: &str,
        query: &[(&str, String)],
        body: Option<Value>,
    ) -> Result<Value, String> {
        let mut q: Vec<(&str, String)> = query.to_vec();
        q.push(("accessToken", self.pat.clone()));
        let url = format!("{BASE}{path}");
        let mut rb = self.http.request(method, &url).query(&q);
        if let Some(b) = body {
            rb = rb.json(&b);
        }
        let resp = rb.send().await.map_err(|e| format!("网络错误: {e}"))?;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(format!("YUNXIAO {status}: {}", truncate(&text, 300)));
        }
        serde_json::from_str(&text).map_err(|e| format!("响应解析失败: {e}"))
    }

    pub async fn get(&self, path: &str, query: &[(&str, String)]) -> Result<Value, String> {
        self.req(Method::GET, path, query, None).await
    }

    pub async fn post(&self, path: &str, query: &[(&str, String)], body: Value) -> Result<Value, String> {
        self.req(Method::POST, path, query, Some(body)).await
    }

    pub async fn put(&self, path: &str, query: &[(&str, String)]) -> Result<Value, String> {
        self.req(Method::PUT, path, query, None).await
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
