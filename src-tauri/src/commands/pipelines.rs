use super::common::{as_array, client_of, ensure_write, i64_of, nested_s, org_of, s, s2};
use crate::AppState;
use serde_json::{json, Value};
use tauri::State;

// ---------- 流水线 ----------

#[tauri::command]
pub async fn list_pipelines(state: State<'_, AppState>, max_results: Option<i64>) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let q = vec![
        ("page", "1".to_string()),
        ("perPage", max_results.unwrap_or(20).to_string()),
    ];
    let resp = c.get(&format!("/oapi/v1/flow/organizations/{org}/pipelines"), &q).await?;
    let items: Vec<Value> = as_array(&resp)
        .iter()
        .map(|p| {
            json!({
                "pipelineId": i64_of(p, "id").unwrap_or(0).max(i64_of(p, "pipelineId").unwrap_or(0)),
                "pipelineName": s2(p, "name", "pipelineName"),
                "status": nested_s(p, "latestRun", "status"),
                "updateTime": s(p, "updateTime"),
            })
        })
        .filter(|p| p["pipelineId"].as_i64().unwrap_or(0) > 0)
        .collect();
    Ok(Value::Array(items))
}

/// 运行分支名防御式收集：候选字段 branchModeBranchs / runningBranchs / branches / runningBranch
/// 及 sources[*] 的 branch 同义字段。元素可为字符串或 {value|branch|branchName} 对象；
/// runningBranchs 实际为 {仓库URL: 分支名} 映射形态，对象字段取其值（云效 oapi 响应字段以联调为准）。
fn branches_of(run: &Value) -> Vec<String> {
    fn push_branch(out: &mut Vec<String>, value: &Value, keys: &[&str]) {
        let name = match value {
            Value::String(s) if !s.is_empty() => Some(s.clone()),
            Value::Object(obj) => keys
                .iter()
                .find_map(|k| obj.get(*k).and_then(|x| x.as_str()))
                .filter(|s| !s.is_empty())
                .map(str::to_string),
            _ => None,
        };
        if let Some(name) = name {
            if !out.contains(&name) {
                out.push(name);
            }
        }
    }
    fn push_field(out: &mut Vec<String>, run: &Value, key: &str) {
        match run.get(key) {
            Some(Value::Array(list)) => {
                list.iter().for_each(|e| push_branch(out, e, &["value", "branch", "branchName"]));
            }
            // runningBranchs 等可能是 {仓库URL: 分支名} 映射
            Some(Value::Object(map)) => {
                map.values().for_each(|e| push_branch(out, e, &["value", "branch", "branchName"]));
            }
            _ => {}
        }
    }

    let mut branches: Vec<String> = Vec::new();
    for key in ["branchModeBranchs", "runningBranchs", "branches", "runningBranch"] {
        push_field(&mut branches, run, key);
    }
    if let Some(sources) = run.get("sources").and_then(|x| x.as_array()) {
        for src in sources {
            push_branch(&mut branches, src, &["branch", "branchName", "value"]);
        }
    }
    branches
}

#[tauri::command]
pub async fn list_pipeline_runs(state: State<'_, AppState>, pipeline_id: i64, max_results: Option<i64>) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let q = vec![
        ("page", "1".to_string()),
        ("perPage", max_results.unwrap_or(5).to_string()),
    ];
    let resp = c
        .get(&format!("/oapi/v1/flow/organizations/{org}/pipelines/{pipeline_id}/runs"), &q)
        .await?;
    let items: Vec<Value> = as_array(&resp)
        .iter()
        .map(|r| {
            let branches = branches_of(r);
            json!({
                "pipelineRunId": i64_of(r, "pipelineRunId").unwrap_or(0),
                "status": s(r, "status"),
                "startTime": i64_of(r, "createTime"),
                "endTime": i64_of(r, "updateTime"),
                "executorAccountId": s(r, "creatorAccountId"),
                "triggerMode": i64_of(r, "triggerMode"),
                "branches": branches,
            })
        })
        .filter(|r| r["pipelineRunId"].as_i64().unwrap_or(0) > 0)
        .collect();
    Ok(Value::Array(items))
}

#[tauri::command]
pub async fn get_pipeline_run(state: State<'_, AppState>, pipeline_id: i64, run_id: i64) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    c.get(&format!("/oapi/v1/flow/organizations/{org}/pipelines/{pipeline_id}/runs/{run_id}"), &[]).await
}

/// POST runs body {params:{}} → 运行 ID
#[tauri::command]
pub async fn start_pipeline_run(state: State<'_, AppState>, pipeline_id: i64) -> Result<Value, String> {
    ensure_write(&state)?;
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    c.post(
        &format!("/oapi/v1/flow/organizations/{org}/pipelines/{pipeline_id}/runs"),
        &[],
        json!({ "params": {} }),
    )
    .await
}

/// oapi/v1 PAT 面未提供运行级停止端点（只有 deploy/job 级），明确报不支持
#[tauri::command]
pub async fn stop_pipeline_run(_pipeline_id: i64, _run_id: i64) -> Result<Value, String> {
    Err("UNSUPPORTED: 当前 oapi/v1 接口不支持停止整条运行（可在云效网页操作）".into())
}

#[tauri::command]
pub async fn get_job_logs(state: State<'_, AppState>, pipeline_id: i64, run_id: i64, job_id: i64) -> Result<String, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let resp = c
        .get(
            &format!("/oapi/v1/flow/organizations/{org}/pipelines/{pipeline_id}/runs/{run_id}/job/{job_id}/log"),
            &[],
        )
        .await?;
    // 响应结构以联调为准：数组逐行、或 {logs:[]}、或整体 JSON
    if let Some(arr) = resp.as_array() {
        let mut out = String::new();
        for line in arr {
            if let Some(t) = line.as_str() {
                out.push_str(t);
                out.push('\n');
            } else {
                out.push_str(&serde_json::to_string_pretty(line).unwrap_or_default());
                out.push('\n');
            }
        }
        return Ok(out);
    }
    if let Some(arr) = resp.get("logs").and_then(|x| x.as_array()) {
        let mut out = String::new();
        for line in arr {
            out.push_str(line.as_str().unwrap_or_default());
            out.push('\n');
        }
        return Ok(out);
    }
    Ok(serde_json::to_string_pretty(&resp).unwrap_or_default())
}
