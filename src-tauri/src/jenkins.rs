//! Small Jenkins Remote Access API client used by repo-scoped CI commands.

use reqwest::{redirect::Policy, Client, Response, Url};
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

#[derive(Clone)]
pub struct JenkinsClient {
    base_url: Url,
    username: String,
    token: String,
    http: Client,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsJobInfo {
    pub name: String,
    pub full_name: String,
    pub color: String,
    pub last_build: Option<CiRunSummary>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsJobSummary {
    pub name: String,
    pub full_name: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsJobParameter {
    pub name: String,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub parameter_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_value: Option<String>,
    pub choices: Vec<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CiRunSummary {
    pub run_id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_time: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trigger: Option<String>,
    #[serde(default, skip_serializing_if = "std::collections::HashMap::is_empty")]
    pub parameters: std::collections::HashMap<String, String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JenkinsLogChunk {
    pub text: String,
    pub next_offset: u64,
    pub has_more: bool,
}

impl JenkinsClient {
    pub fn new(base_url: &str, username: &str, token: &str) -> Result<Self, String> {
        let base_url = Url::parse(base_url.trim().trim_end_matches('/'))
            .map_err(|e| format!("Jenkins URL 无效: {e}"))?;
        if !matches!(base_url.scheme(), "http" | "https")
            || base_url.host_str().is_none()
            || !base_url.username().is_empty()
            || base_url.password().is_some()
            || base_url.query().is_some()
            || base_url.fragment().is_some()
        {
            return Err("Jenkins URL 必须是无凭证、无查询参数的 HTTP(S) 地址".into());
        }
        if username.trim().is_empty() || token.trim().is_empty() {
            return Err("请填写 Jenkins 用户名和 API Token".into());
        }
        let http = Client::builder()
            .timeout(Duration::from_secs(30))
            .redirect(Policy::none())
            .build()
            .map_err(|e| format!("创建 Jenkins HTTP 客户端失败: {e}"))?;
        Ok(Self {
            base_url,
            username: username.trim().to_string(),
            token: token.trim().to_string(),
            http,
        })
    }

    fn append_segments(&self, segments: &[String]) -> Result<Url, String> {
        let mut url = self.base_url.clone();
        let mut path = url
            .path_segments_mut()
            .map_err(|_| "Jenkins URL 不支持路径配置".to_string())?;
        path.pop_if_empty();
        for segment in segments {
            path.push(segment);
        }
        drop(path);
        Ok(url)
    }

    fn job_segments(full_name: &str) -> Result<Vec<String>, String> {
        let parts: Vec<&str> = full_name.split('/').collect();
        if parts.is_empty()
            || parts.iter().any(|part| {
                part.trim().is_empty() || *part == "." || *part == ".." || part.contains('\\')
            })
        {
            return Err("Jenkins Job 全路径格式无效，请使用 folder/job 格式".into());
        }
        let mut segments = Vec::with_capacity(parts.len() * 2);
        for part in parts {
            segments.push("job".to_string());
            segments.push(part.to_string());
        }
        Ok(segments)
    }

    async fn finish(&self, response: Response) -> Result<Response, String> {
        if response.status().is_success() {
            return Ok(response);
        }
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let body: String = body.chars().take(300).collect();
        Err(format!("Jenkins HTTP {status}: {body}"))
    }

    async fn get_json(&self, url: Url) -> Result<Value, String> {
        let response = self
            .http
            .get(url)
            .basic_auth(&self.username, Some(&self.token))
            .send()
            .await
            .map_err(|e| format!("Jenkins 请求失败: {e}"))?;
        self.finish(response)
            .await?
            .json::<Value>()
            .await
            .map_err(|e| format!("Jenkins JSON 响应无效: {e}"))
    }

    async fn get_text(&self, url: Url) -> Result<String, String> {
        let response = self
            .http
            .get(url)
            .basic_auth(&self.username, Some(&self.token))
            .send()
            .await
            .map_err(|e| format!("Jenkins 请求失败: {e}"))?;
        self.finish(response)
            .await?
            .text()
            .await
            .map_err(|e| format!("读取 Jenkins 响应失败: {e}"))
    }

    pub async fn test_connection(&self) -> Result<(), String> {
        let segments = vec!["api".into(), "json".into()];
        let mut url = self.append_segments(&segments)?;
        url.query_pairs_mut()
            .append_pair("tree", "nodeDescription,numExecutors");
        self.get_json(url).await?;
        Ok(())
    }

    pub async fn get_job(&self, full_name: &str) -> Result<JenkinsJobInfo, String> {
        let mut segments = Self::job_segments(full_name)?;
        segments.extend(["api".into(), "json".into()]);
        let mut url = self.append_segments(&segments)?;
        url.query_pairs_mut().append_pair(
            "tree",
            "name,fullName,color,lastBuild[number,displayName,result,timestamp,duration,building]",
        );
        let value = self.get_json(url).await?;
        let runs = value
            .get("lastBuild")
            .and_then(map_run)
            .into_iter()
            .collect::<Vec<_>>();
        Ok(JenkinsJobInfo {
            name: value
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or(full_name)
                .to_string(),
            full_name: value
                .get("fullName")
                .and_then(Value::as_str)
                .unwrap_or(full_name)
                .to_string(),
            color: value
                .get("color")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            last_build: runs.into_iter().next(),
        })
    }

    pub async fn list_jobs(&self) -> Result<Vec<JenkinsJobSummary>, String> {
        let mut pending = vec![(None::<String>, 0usize)];
        let mut visited = std::collections::HashSet::new();
        let mut jobs = Vec::new();

        while let Some((parent, depth)) = pending.pop() {
            if depth > 8 || jobs.len() >= 2000 {
                continue;
            }
            let mut segments = match parent.as_deref() {
                Some(full_name) => Self::job_segments(full_name)?,
                None => Vec::new(),
            };
            segments.extend(["api".into(), "json".into()]);
            let mut url = self.append_segments(&segments)?;
            url.query_pairs_mut().append_pair("tree", "jobs[name,fullName,_class]");
            let value = self.get_json(url).await?;
            let entries = value.get("jobs").and_then(Value::as_array);
            for entry in entries.into_iter().flatten() {
                let name = entry.get("name").and_then(Value::as_str).unwrap_or_default().trim();
                if name.is_empty() {
                    continue;
                }
                let full_name = entry
                    .get("fullName")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .or_else(|| parent.as_ref().map(|prefix| format!("{prefix}/{name}")))
                    .unwrap_or_else(|| name.to_string());
                if !visited.insert(full_name.clone()) {
                    continue;
                }
                let class_name = entry
                    .get("_class")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_ascii_lowercase();
                let is_container = class_name.contains("folder")
                    || class_name.contains("multibranchproject")
                    || class_name.contains("organizationfolder");
                if is_container {
                    pending.push((Some(full_name), depth + 1));
                } else {
                    jobs.push(JenkinsJobSummary {
                        name: name.to_string(),
                        full_name,
                    });
                }
                if jobs.len() >= 2000 {
                    break;
                }
            }
        }

        jobs.sort_by(|left, right| left.full_name.to_lowercase().cmp(&right.full_name.to_lowercase()));
        Ok(jobs)
    }

    pub async fn get_job_parameters(&self, full_name: &str) -> Result<Vec<JenkinsJobParameter>, String> {
        let mut segments = Self::job_segments(full_name)?;
        segments.extend(["api".into(), "json".into()]);
        let mut url = self.append_segments(&segments)?;
        url.query_pairs_mut().append_pair(
            "tree",
            "property[parameterDefinitions[name,type,defaultParameterValue[value],choices]],actions[parameterDefinitions[name,type,defaultParameterValue[value],choices]]",
        );
        let value = self.get_json(url).await?;
        let mut definitions = Vec::new();
        let mut seen = std::collections::HashSet::new();
        for key in ["property", "actions"] {
            for container in value.get(key).and_then(Value::as_array).into_iter().flatten() {
                for definition in container
                    .get("parameterDefinitions")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                {
                    let name = definition.get("name").and_then(Value::as_str).unwrap_or_default().trim();
                    if name.is_empty() || !seen.insert(name.to_string()) {
                        continue;
                    }
                    let default_value = definition
                        .get("defaultParameterValue")
                        .and_then(|value| value.get("value"))
                        .or_else(|| definition.get("defaultValue"))
                        .and_then(json_value_text);
                    let choices = definition
                        .get("choices")
                        .map(|choices| {
                            choices
                                .as_array()
                                .map(|values| values.iter().filter_map(json_value_text).collect())
                                .or_else(|| choices.as_str().map(|text| {
                                    text.lines().map(str::trim).filter(|line| !line.is_empty()).map(str::to_string).collect()
                                }))
                                .unwrap_or_default()
                        })
                        .unwrap_or_default();
                    definitions.push(JenkinsJobParameter {
                        name: name.to_string(),
                        parameter_type: definition.get("type").and_then(Value::as_str).map(str::to_string),
                        default_value,
                        choices,
                    });
                }
            }
        }
        Ok(definitions)
    }

    pub async fn list_runs(
        &self,
        full_name: &str,
        limit: usize,
    ) -> Result<Vec<CiRunSummary>, String> {
        let mut segments = Self::job_segments(full_name)?;
        segments.extend(["api".into(), "json".into()]);
        let mut url = self.append_segments(&segments)?;
        url.query_pairs_mut().append_pair(
            "tree",
            &format!(
                "builds[number,displayName,result,timestamp,duration,building,actions[parameters[name,value]]]{{0,{}}}",
                limit.saturating_sub(1)
            ),
        );
        let value = self.get_json(url).await?;
        Ok(value
            .get("builds")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(map_run)
            .collect())
    }

    pub async fn trigger_build(&self, full_name: &str) -> Result<Option<String>, String> {
        let mut segments = Self::job_segments(full_name)?;
        segments.push("build".into());
        let url = self.append_segments(&segments)?;
        let response = self
            .http
            .post(url)
            .basic_auth(&self.username, Some(&self.token))
            .send()
            .await
            .map_err(|e| format!("触发 Jenkins 构建失败: {e}"))?;
        if response.status().is_success() {
            return Ok(response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .map(str::to_string));
        }
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default();
            if location.contains("/queue/item/") {
                return Ok(Some(location.to_string()));
            }
        }
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let body: String = body.chars().take(300).collect();
        Err(format!("Jenkins 构建触发失败 HTTP {status}: {body}"))
    }

    pub async fn trigger_build_with_parameters(
        &self,
        full_name: &str,
        parameters: &std::collections::HashMap<String, String>,
    ) -> Result<Option<String>, String> {
        if parameters.is_empty() {
            return self.trigger_build(full_name).await;
        }
        if parameters.iter().any(|(name, value)| {
            name.trim().is_empty()
                || name.len() > 255
                || value.len() > 8192
                || name.chars().any(char::is_control)
                || value.chars().any(char::is_control)
        }) {
            return Err("Jenkins 构建参数无效".into());
        }
        let mut segments = Self::job_segments(full_name)?;
        segments.push("buildWithParameters".into());
        let url = self.append_segments(&segments)?;
        let response = self
            .http
            .post(url)
            .basic_auth(&self.username, Some(&self.token))
            .query(parameters)
            .send()
            .await
            .map_err(|e| format!("触发 Jenkins 构建失败: {e}"))?;
        if response.status().is_success() {
            return Ok(response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .map(str::to_string));
        }
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default();
            if location.contains("/queue/item/") {
                return Ok(Some(location.to_string()));
            }
        }
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let body: String = body.chars().take(300).collect();
        Err(format!("Jenkins 构建触发失败 HTTP {status}: {body}"))
    }

    pub async fn console_text(
        &self,
        full_name: &str,
        build_number: &str,
    ) -> Result<String, String> {
        if build_number.is_empty() || !build_number.bytes().all(|b| b.is_ascii_digit()) {
            return Err("Jenkins 构建编号无效".into());
        }
        let mut segments = Self::job_segments(full_name)?;
        segments.push(build_number.to_string());
        segments.push("consoleText".into());
        self.get_text(self.append_segments(&segments)?).await
    }

    pub async fn progressive_console_chunk(
        &self,
        full_name: &str,
        build_number: &str,
        start_offset: u64,
    ) -> Result<JenkinsLogChunk, String> {
        if build_number.is_empty() || !build_number.bytes().all(|b| b.is_ascii_digit()) {
            return Err("Jenkins 构建编号无效".into());
        }
        let mut segments = Self::job_segments(full_name)?;
        segments.extend([
            build_number.to_string(),
            "logText".into(),
            "progressiveText".into(),
        ]);
        let mut url = self.append_segments(&segments)?;
        url.query_pairs_mut()
            .append_pair("start", &start_offset.to_string());
        let response = self
            .http
            .get(url)
            .basic_auth(&self.username, Some(&self.token))
            .send()
            .await
            .map_err(|e| format!("读取 Jenkins 增量日志失败: {e}"))?;
        let response = self.finish(response).await?;
        let reported_offset = response
            .headers()
            .get("X-Text-Size")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok());
        let has_more = response
            .headers()
            .get("X-More-Data")
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.eq_ignore_ascii_case("true"));
        let text = response
            .text()
            .await
            .map_err(|e| format!("读取 Jenkins 日志内容失败: {e}"))?;
        let next_offset = reported_offset.unwrap_or_else(|| {
            start_offset.saturating_add(u64::try_from(text.len()).unwrap_or(u64::MAX))
        });
        Ok(JenkinsLogChunk {
            text,
            next_offset,
            has_more,
        })
    }
}

fn json_value_text(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::to_string)
        .or_else(|| (!value.is_null()).then(|| value.to_string()))
}

fn map_run(value: &Value) -> Option<CiRunSummary> {
    let run_id = value.get("number")?.as_i64()?.to_string();
    let building = value
        .get("building")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let result = value
        .get("result")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let status = if building {
        "RUNNING"
    } else {
        match result {
            "SUCCESS" => "SUCCESS",
            "FAILURE" | "UNSTABLE" => "FAIL",
            "ABORTED" => "CANCELED",
            "" => "WAITING",
            _ => "OTHER",
        }
    };
    let parameters = value
        .get("actions")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .flat_map(|action| {
            action
                .get("parameters")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
        })
        .filter_map(|parameter| {
            let name = parameter.get("name").and_then(Value::as_str)?.trim();
            if name.is_empty() {
                return None;
            }
            let value = parameter.get("value").and_then(json_value_text)?;
            Some((name.to_string(), value))
        })
        .collect();
    Some(CiRunSummary {
        run_id,
        status: status.to_string(),
        start_time: value.get("timestamp").and_then(Value::as_i64),
        duration_ms: value.get("duration").and_then(Value::as_i64),
        trigger: value
            .get("displayName")
            .and_then(Value::as_str)
            .map(str::to_string),
        parameters,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread::{self, JoinHandle};

    struct MockResponse {
        status: u16,
        headers: Vec<(&'static str, String)>,
        body: String,
    }

    impl MockResponse {
        fn json(status: u16, body: &str) -> Self {
            Self {
                status,
                headers: vec![("Content-Type", "application/json".into())],
                body: body.into(),
            }
        }
    }

    fn mock_server(responses: Vec<MockResponse>) -> (String, JoinHandle<Vec<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let mut requests = Vec::new();
            for response in responses {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                let mut request = Vec::new();
                let mut chunk = [0_u8; 4096];
                loop {
                    let read = stream.read(&mut chunk).unwrap_or(0);
                    if read == 0 {
                        break;
                    }
                    request.extend_from_slice(&chunk[..read]);
                    let Some(header_end) =
                        request.windows(4).position(|bytes| bytes == b"\r\n\r\n")
                    else {
                        continue;
                    };
                    let headers =
                        String::from_utf8_lossy(&request[..header_end]).to_ascii_lowercase();
                    let content_length = headers
                        .lines()
                        .find_map(|line| line.strip_prefix("content-length:"))
                        .and_then(|value| value.trim().parse::<usize>().ok())
                        .unwrap_or(0);
                    if request.len() >= header_end + 4 + content_length {
                        break;
                    }
                }
                let header_end = request
                    .windows(4)
                    .position(|bytes| bytes == b"\r\n\r\n")
                    .unwrap_or(request.len());
                requests.push(String::from_utf8_lossy(&request[..header_end]).to_string());

                let reason = match response.status {
                    200 => "OK",
                    201 => "Created",
                    302 => "Found",
                    401 => "Unauthorized",
                    404 => "Not Found",
                    _ => "Mock",
                };
                let mut headers = format!(
                    "HTTP/1.1 {} {}\r\nContent-Length: {}\r\nConnection: close\r\n",
                    response.status,
                    reason,
                    response.body.len()
                );
                for (name, value) in response.headers {
                    headers.push_str(&format!("{name}: {value}\r\n"));
                }
                headers.push_str("\r\n");
                stream.write_all(headers.as_bytes()).unwrap();
                stream.write_all(response.body.as_bytes()).unwrap();
                stream.flush().unwrap();
            }
            requests
        });
        (format!("http://{address}/jenkins"), server)
    }

    #[test]
    fn mocked_connection_job_runs_trigger_and_logs() {
        let (base_url, server) = mock_server(vec![
            MockResponse::json(200, r#"{"nodeDescription":"mock","numExecutors":2}"#),
            MockResponse::json(
                200,
                r##"{"name":"compile","fullName":"team/mobile/compile","color":"blue","lastBuild":{"number":18,"displayName":"#18","result":"SUCCESS","timestamp":1000,"duration":500,"building":false}}"##,
            ),
            MockResponse::json(
                200,
                r##"{"builds":[{"number":19,"displayName":"#19","result":null,"timestamp":2000,"duration":0,"building":true,"actions":[{"parameters":[{"name":"BRANCH","value":"feature/REQ-2048"},{"name":"ENVIRONMENT","value":"test"}]}]},{"number":18,"displayName":"#18","result":"SUCCESS","timestamp":1000,"duration":500,"building":false}]}"##,
            ),
            MockResponse {
                status: 302,
                headers: vec![("Location", "http://localhost/jenkins/queue/item/42/".into())],
                body: String::new(),
            },
            MockResponse {
                status: 200,
                headers: vec![("Content-Type", "text/plain; charset=utf-8".into())],
                body: "build output\nfinished".into(),
            },
        ]);

        tauri::async_runtime::block_on(async {
            let client = JenkinsClient::new(&base_url, "mock-user", "mock-token").unwrap();
            client.test_connection().await.unwrap();

            let job = client.get_job("team/mobile/compile").await.unwrap();
            assert_eq!(job.name, "compile");
            assert_eq!(job.full_name, "team/mobile/compile");
            assert_eq!(job.last_build.unwrap().status, "SUCCESS");

            let runs = client.list_runs("team/mobile/compile", 2).await.unwrap();
            assert_eq!(runs.len(), 2);
            assert_eq!(runs[0].run_id, "19");
            assert_eq!(runs[0].status, "RUNNING");
            assert_eq!(runs[0].parameters.get("BRANCH").unwrap(), "feature/REQ-2048");
            assert_eq!(runs[0].parameters.get("ENVIRONMENT").unwrap(), "test");

            let queue = client.trigger_build("team/mobile/compile").await.unwrap();
            assert!(queue.unwrap().contains("/queue/item/42/"));
            assert_eq!(
                client
                    .console_text("team/mobile/compile", "19")
                    .await
                    .unwrap(),
                "build output\nfinished"
            );
        });

        let requests = server.join().unwrap();
        assert_eq!(requests.len(), 5);
        assert!(requests.iter().all(|request| request
            .to_ascii_lowercase()
            .contains("authorization: basic ")));
        assert!(requests[1].contains("/jenkins/job/team/job/mobile/job/compile/api/json?"));
        assert!(requests[2].contains("builds%5Bnumber%2CdisplayName%2Cresult%2Ctimestamp%2Cduration%2Cbuilding%2Cactions%5Bparameters%5Bname%2Cvalue%5D%5D%5D%7B0%2C1%7D"));
        assert!(requests[3].starts_with("POST /jenkins/job/team/job/mobile/job/compile/build "));
        assert!(!requests[3].to_ascii_lowercase().contains("crumb"));
        assert!(
            requests[4].starts_with("GET /jenkins/job/team/job/mobile/job/compile/19/consoleText ")
        );
    }

    #[test]
    fn progressive_console_reads_only_new_text_and_returns_jenkins_offsets() {
        let (base_url, server) = mock_server(vec![MockResponse {
            status: 200,
            headers: vec![
                ("Content-Type", "text/plain; charset=utf-8".into()),
                ("X-Text-Size", "11".into()),
                ("X-More-Data", "true".into()),
            ],
            body: " tail".into(),
        }]);

        tauri::async_runtime::block_on(async {
            let client = JenkinsClient::new(&base_url, "user", "token").unwrap();
            let chunk = client
                .progressive_console_chunk("team/mobile/compile", "19", 6)
                .await
                .unwrap();
            assert_eq!(chunk.text, " tail");
            assert_eq!(chunk.next_offset, 11);
            assert!(chunk.has_more);
        });

        let requests = server.join().unwrap();
        assert_eq!(requests.len(), 1);
        assert!(requests[0].starts_with(
            "GET /jenkins/job/team/job/mobile/job/compile/19/logText/progressiveText?start=6 "
        ));
    }

    #[test]
    fn mocked_auth_and_missing_job_failures_are_reported() {
        let (base_url, server) = mock_server(vec![
            MockResponse::json(401, r#"{"message":"bad token"}"#),
            MockResponse::json(404, r#"{"message":"no such job"}"#),
        ]);
        tauri::async_runtime::block_on(async {
            let client = JenkinsClient::new(&base_url, "user", "wrong-token").unwrap();
            assert!(client
                .test_connection()
                .await
                .unwrap_err()
                .contains("HTTP 401"));
            assert!(client
                .get_job("missing/job")
                .await
                .err()
                .unwrap()
                .contains("HTTP 404"));
        });
        assert_eq!(server.join().unwrap().len(), 2);
    }

    #[test]
    fn rejects_invalid_job_paths_and_reports_network_failure() {
        assert!(JenkinsClient::job_segments("folder/../job").is_err());
        assert_eq!(
            JenkinsClient::job_segments("folder/job").unwrap(),
            ["job", "folder", "job", "job"]
        );

        tauri::async_runtime::block_on(async {
            let client = JenkinsClient::new("http://127.0.0.1:1", "user", "token").unwrap();
            assert!(client
                .test_connection()
                .await
                .unwrap_err()
                .contains("Jenkins 请求失败"));
        });
    }
}
