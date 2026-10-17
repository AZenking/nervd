use super::common::{as_array, client_of, ensure_write, i64_of, ids_of, names_of, nested_s, org_of, s, s2};
use crate::AppState;
use serde_json::{json, Value};
use tauri::State;

// ---------- 工作项 ----------

/// POST workitems:search（body: category/spaceId/spaceType/page/perPage）
/// 实测（2026-10）：body 不接受 sprintId（传了也被忽略）；行内自带 sprint:{id,name}，
/// 由前端按当前迭代做客户端过滤，因此这里只透出 sprintId/sprintName 两个扁平字段。
#[tauri::command]
pub async fn list_workitems(
    state: State<'_, AppState>,
    category: String,
    space_identifier: String,
    next_token: Option<String>,
) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    if space_identifier.trim().is_empty() {
        return Err("NOT_CONFIGURED: 请先在设置中选择默认项目空间".into());
    }
    let page: u32 = next_token
        .and_then(|t| t.parse().ok())
        .unwrap_or(1);
    let per_page = 50u32;
    let body = json!({
        "category": category,
        "spaceId": space_identifier,
        "spaceType": "Project",
        "orderBy": "gmtModified",
        "sort": "desc",
        "page": page,
        "perPage": per_page,
    });
    let resp = c
        .post(&format!("/oapi/v1/projex/organizations/{org}/workitems:search"), &[], body)
        .await?;
    let items: Vec<Value> = as_array(&resp)
        .iter()
        .map(|w| {
            let ident = {
                let a = s(w, "identifier");
                if a.is_empty() { s(w, "serialNumber") } else { a }
            };
            json!({
                "identifier": ident,
                "workitemId": s(w, "id"),
                "subject": s(w, "subject"),
                "status": nested_s(w, "status", "name"),
                "statusStageName": nested_s(w, "status", "stageName"),
                "assignedTo": nested_s(w, "assignedTo", "name"),
                "assignedToId": nested_s(w, "assignedTo", "id"),
                "relatedTo": names_of(w, &["participant", "participants", "relatedUsers"]),
                "relatedToIds": ids_of(w, &["participant", "participants", "relatedUsers"]),
                "creator": nested_s(w, "creator", "name"),
                "creatorId": nested_s(w, "creator", "id"),
                "sprintId": nested_s(w, "sprint", "id"),
                "sprintName": nested_s(w, "sprint", "name"),
                "spaceName": nested_s(w, "space", "name"),
                "updatedAt": i64_of(w, "gmtModified").map(chrono_ms_to_local).unwrap_or_default(),
                "category": category,
            })
        })
        .collect();
    let next = if (items.len() as u32) >= per_page {
        Some((page + 1).to_string())
    } else {
        None
    };
    Ok(json!({ "items": items, "nextToken": next }))
}

pub(super) fn chrono_ms_to_local(ms: i64) -> String {
    // 无 chrono：用系统 date 不可取（无 shell）；手写 ms→UTC 粗转换仅用于展示
    let secs = ms / 1000;
    let days = secs / 86400;
    let rem = secs % 86400;
    let (h, mi, se) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    // 1970-01-01 起的天数 → 年月日（民用算法）
    let (y, mo, d) = civil_from_days(days);
    format!("{y:04}-{mo:02}-{d:02} {h:02}:{mi:02}:{se:02}")
}

fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as i64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

#[tauri::command]
pub async fn get_workitem(state: State<'_, AppState>, workitem_id: String) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    c.get(&format!("/oapi/v1/projex/organizations/{org}/workitems/{workitem_id}"), &[]).await
}

#[tauri::command]
pub async fn list_workitem_comments(state: State<'_, AppState>, workitem_id: String) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    c.get(
        &format!("/oapi/v1/projex/organizations/{org}/workitems/{workitem_id}/comments"),
        &[("page", "1".to_string()), ("perPage", "50".to_string())],
    )
    .await
}

/// 子工作项查询：POST workitems:search × 三类别（Req/Task/Bug），行级 parentId 过滤。
/// 实测结论（2026-10）：PAT 可用面只有 oapi/v1 族——getRelations 的 ROA 路径在
/// openapi-rdc 上 302 到文档页、在 devops.{region} 主机上要求 AK 签名（PAT 不可用）；
/// 而搜索行自带 parentId/idPath/serialNumber/status，字段比关系接口更全。
/// 覆盖面：每类别取最近 100 条（按 gmtModified 倒序），子项通常在此范围内。
#[tauri::command]
pub async fn list_workitem_children(state: State<'_, AppState>, workitem_id: String) -> Result<Value, String> {
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let space = {
        let st = state.settings.lock().unwrap();
        st.default_space_identifier.trim().to_string()
    };
    if space.is_empty() {
        return Err("NOT_CONFIGURED: 请先在设置中选择默认项目空间".into());
    }

    let mut children: Vec<Value> = Vec::new();
    for category in ["Req", "Task", "Bug"] {
        let body = json!({
            "category": category,
            "spaceId": space,
            "spaceType": "Project",
            "orderBy": "gmtModified",
            "sort": "desc",
            "page": 1,
            "perPage": 100,
        });
        let resp = c
            .post(
                &format!("/oapi/v1/projex/organizations/{org}/workitems:search"),
                &[],
                body,
            )
            .await
            .unwrap_or(Value::Null);
        let rows = as_array(&resp);
        for w in &rows {
            if s(w, "parentId") != workitem_id {
                continue;
            }
            let ident = {
                let a = s(w, "identifier");
                if !a.is_empty() { a } else { s(w, "serialNumber") }
            };
            let status_name = {
                let n = nested_s(w, "status", "name");
                if !n.is_empty() { n } else { nested_s(w, "status", "displayName") }
            };
            children.push(json!({
                "workitemId": s(w, "id"),
                "identifier": ident,
                "subject": s(w, "subject"),
                "category": s(w, "categoryId"),
                "statusId": nested_s(w, "status", "id"),
                "status": status_name,
                "assignedTo": nested_s(w, "assignedTo", "name"),
                "gmtModified": i64_of(w, "gmtModified").map(chrono_ms_to_local).unwrap_or_default(),
            }));
        }
    }
    Ok(json!({ "items": children }))
}

#[tauri::command]
pub async fn get_workitem_workflow_statuses(
    state: State<'_, AppState>,
    workitem_id: String,
) -> Result<Value, String> {
    if workitem_id.trim().is_empty() {
        return Err("工作项 ID 不能为空".into());
    }
    let client = client_of(&state)?;
    let org = org_of(&state)?;
    let detail_response = client
        .get(&format!("/oapi/v1/projex/organizations/{org}/workitems/{workitem_id}"), &[])
        .await?;
    let detail = detail_response
        .get("workitem")
        .or_else(|| detail_response.get("data"))
        .unwrap_or(&detail_response);
    let project_id = detail
        .get("space")
        .and_then(|space| space.get("id"))
        .and_then(Value::as_str)
        .or_else(|| detail.get("projectId").and_then(Value::as_str))
        .unwrap_or_default()
        .trim();
    let workitem_type_id = detail
        .get("workitemType")
        .and_then(|workitem_type| workitem_type.get("id"))
        .and_then(Value::as_str)
        .or_else(|| detail.get("workitemTypeId").and_then(Value::as_str))
        .unwrap_or_default()
        .trim();
    if project_id.is_empty() || workitem_type_id.is_empty() {
        return Err("无法从工作项详情读取项目或工作项类型".into());
    }
    let response = client
        .get(
            &format!("/oapi/v1/projex/organizations/{org}/projects/{project_id}/workitemTypes/{workitem_type_id}/workflows"),
            &[],
        )
        .await?;
    let workflows: Vec<&Value> = if let Some(items) = response.as_array() {
        items.iter().collect()
    } else if let Some(items) = response.get("workflows").and_then(Value::as_array) {
        items.iter().collect()
    } else {
        vec![&response]
    };
    let mut statuses = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for workflow in workflows {
        for status in workflow.get("statuses").and_then(Value::as_array).into_iter().flatten() {
            let id = s2(status, "id", "identifier");
            let name = s2(status, "displayName", "name");
            if !id.is_empty() && !name.is_empty() && seen.insert(id.clone()) {
                statuses.push(json!({ "id": id, "name": name }));
            }
        }
    }
    if statuses.is_empty() {
        return Err("云效未返回可用的工作项状态".into());
    }
    Ok(Value::Array(statuses))
}

#[tauri::command]
pub async fn update_workitem(
    state: State<'_, AppState>,
    workitem_id: String,
    subject: Option<String>,
    status_id: Option<String>,
    description: Option<String>,
    format_type: Option<String>,
    assigned_to: Option<String>,
) -> Result<Value, String> {
    ensure_write(&state)?;
    let workitem_id = workitem_id.trim();
    if workitem_id.is_empty() {
        return Err("工作项 ID 不能为空".into());
    }
    let mut body = serde_json::Map::new();
    if let Some(subject) = subject {
        let subject = subject.trim();
        if subject.is_empty() || subject.len() > 500 || subject.chars().any(char::is_control) {
            return Err("子任务名称不能为空，且不能超过 500 个字符".into());
        }
        body.insert("subject".into(), json!(subject));
    }
    if let Some(status_id) = status_id {
        let status_id = status_id.trim();
        if status_id.is_empty() || status_id.len() > 255 || status_id.chars().any(char::is_control) {
            return Err("工作项状态无效".into());
        }
        body.insert("status".into(), json!(status_id));
    }
    if let Some(description) = description {
        body.insert("description".into(), json!(description));
        let ft = format_type.unwrap_or_else(|| "RICHTEXT".to_string());
        body.insert("formatType".into(), json!(ft));
    }
    if let Some(assigned_to) = assigned_to {
        let assigned_to = assigned_to.trim();
        if !assigned_to.is_empty() {
            body.insert("assignedTo".into(), json!(assigned_to));
        }
    }
    if body.is_empty() {
        return Err("没有需要保存的工作项修改".into());
    }
    let client = client_of(&state)?;
    let org = org_of(&state)?;
    client
        .put(
            &format!("/oapi/v1/projex/organizations/{org}/workitems/{workitem_id}"),
            &[],
            Value::Object(body),
        )
        .await
}

#[tauri::command]
pub async fn create_workitem_comment(
    state: State<'_, AppState>,
    workitem_id: String,
    content: String,
    format_type: Option<String>,
) -> Result<Value, String> {
    ensure_write(&state)?;
    let workitem_id = workitem_id.trim();
    if workitem_id.is_empty() {
        return Err("工作项 ID 不能为空".into());
    }
    let content = content.trim();
    if content.is_empty() {
        return Err("评论内容不能为空".into());
    }
    let client = client_of(&state)?;
    let org = org_of(&state)?;
    let ft = format_type.unwrap_or_else(|| "RICHTEXT".to_string());
    let body = json!({
        "content": content,
        "formatType": ft,
    });
    client
        .post(
            &format!("/oapi/v1/projex/organizations/{org}/workitems/{workitem_id}/comments"),
            &[],
            body,
        )
        .await
}


/// 项目内某类别（Task/Bug…）的工作项类型列表：
/// oapi/v1 GET projects/{space}/workitemTypes?category=…（端点形态依据
/// alibabacloud-devops-mcp-server@0.3.64 getWorkItemTypesFunc 逆向）。
/// 创建子任务时由前端拉取，defaultType 优先预选。
#[tauri::command]
pub async fn list_workitem_types(
    state: State<'_, AppState>,
    category: String,
) -> Result<Value, String> {
    let category = category.trim().to_string();
    if category.is_empty() {
        return Err("工作项类别不能为空".into());
    }
    let c = client_of(&state)?;
    let org = org_of(&state)?;
    let space = {
        let st = state.settings.lock().unwrap();
        st.default_space_identifier.trim().to_string()
    };
    if space.is_empty() {
        return Err("NOT_CONFIGURED: 请先在设置中选择默认项目空间".into());
    }
    let resp = c
        .get(
            &format!("/oapi/v1/projex/organizations/{org}/projects/{space}/workitemTypes"),
            &[("category", category.clone())],
        )
        .await?;
    let types: Vec<Value> = as_array(&resp)
        .iter()
        .map(|t| {
            let id = s2(t, "id", "identifier");
            let name = {
                let n = s2(t, "name", "nameEn");
                if n.is_empty() { id.clone() } else { n }
            };
            json!({
                "id": id,
                "name": name,
                "category": s(t, "categoryId"),
                "defaultType": t.get("defaultType").and_then(Value::as_bool).unwrap_or(false),
            })
        })
        .filter(|t| !s(t, "id").is_empty())
        .collect();
    if types.is_empty() {
        return Err(format!("云效未返回可用的 {category} 工作项类型"));
    }
    Ok(Value::Array(types))
}

fn extract_user_id(val: Option<&Value>) -> String {
    let Some(v) = val else { return String::new(); };
    if let Some(s) = v.as_str() {
        let trimmed = s.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    if let Some(obj) = v.as_object() {
        for key in [
            "identifier",
            "id",
            "userId",
            "userIdentifier",
            "accountencid",
            "aliyunPk",
            "account",
        ] {
            if let Some(s) = obj.get(key).and_then(|x| x.as_str()) {
                let trimmed = s.trim();
                if !trimmed.is_empty() {
                    return trimmed.to_string();
                }
            }
        }
    }
    String::new()
}

/// 在需求下创建子工作项（**写操作**）：
/// oapi/v1 POST workitems，body { spaceId, subject, workitemTypeId, parentId, sprint?, assignedTo }
fn resolve_user_id(name_or_id: &str, detail: &Value) -> String {
    let trimmed = name_or_id.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    // 1. 若入参等于父项负责人/创建人/修改人的姓名，提取其真实 ID
    for key in ["assignedTo", "creator", "modifier", "verifier"] {
        if let Some(user_val) = detail.get(key) {
            let user_name = s2(user_val, "name", "displayName");
            if user_name == trimmed {
                let id = extract_user_id(Some(user_val));
                if !id.is_empty() {
                    return id;
                }
            }
        }
    }
    // 2. 若入参等于 participants 中的姓名，提取其真实 ID
    if let Some(participants) = detail.get("participants").and_then(Value::as_array) {
        for p in participants {
            let p_name = s2(p, "name", "displayName");
            if p_name == trimmed {
                let id = extract_user_id(Some(p));
                if !id.is_empty() {
                    return id;
                }
            }
        }
    }
    // 3. 否则入参本身即为用户 ID/标识
    trimmed.to_string()
}

/// 从工作项字段配置中智能匹配最符合的选项 ID，防止非法中文字符串直接发往云效导致 400 校验报错。
pub(crate) fn match_field_option(
    field: &Value,
    target_val: Option<&str>,
    is_severity: bool,
) -> Option<String> {
    let options = field.get("options")
        .or_else(|| field.get("items"))
        .or_else(|| field.get("values"))
        .or_else(|| field.get("fieldOptions"))
        .and_then(Value::as_array);

    let opts = match options {
        Some(arr) if !arr.is_empty() => arr,
        _ => {
            return field.get("defaultValue")
                .and_then(|v| {
                    if let Some(s) = v.as_str() { Some(s.to_string()) }
                    else if let Some(id) = v.get("id").or_else(|| v.get("identifier")).or_else(|| v.get("value")).and_then(|x| x.as_str()) {
                        Some(id.to_string())
                    } else { None }
                })
                .or_else(|| target_val.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()));
        }
    };

    let parse_opt = |opt: &Value| -> (String, String) {
        if let Some(s) = opt.as_str() {
            return (s.to_string(), s.to_string());
        }
        let mut id = s(opt, "id");
        if id.is_empty() { id = s(opt, "value"); }
        if id.is_empty() { id = s(opt, "identifier"); }
        if id.is_empty() { id = s(opt, "code"); }

        let mut name = s(opt, "displayValue");
        if name.is_empty() { name = s(opt, "displayName"); }
        if name.is_empty() { name = s(opt, "name"); }
        if name.is_empty() { name = s(opt, "label"); }
        if name.is_empty() { name = s(opt, "valueEn"); }
        if name.is_empty() { name = id.clone(); }
        (id, name)
    };

    // 1. 若显式指定 target_val，优先按 ID、名称、语义别名匹配
    if let Some(target) = target_val.map(str::trim).filter(|s| !s.is_empty()) {
        for opt in opts {
            let (opt_id, opt_name) = parse_opt(opt);
            if opt_id.is_empty() { continue; }
            if opt_id == target || opt_name == target {
                return Some(opt_id);
            }
            if opt_name.contains(target) || target.contains(&opt_name) {
                return Some(opt_id);
            }
            if is_severity {
                let lower_target = target.to_ascii_lowercase();
                let lower_name = opt_name.to_ascii_lowercase();
                let lower_id = opt_id.to_ascii_lowercase();

                let is_slight = target == "轻微" || lower_target.contains("slight") || lower_target.contains("low") || lower_target.contains("trivial");
                if is_slight && (opt_name.contains("轻微") || lower_name.contains("slight") || lower_name.contains("low") || lower_name.contains("trivial") || lower_id.contains("minor") || lower_id.contains("slight") || lower_id.contains("low")) {
                    return Some(opt_id);
                }

                let is_normal = target == "一般" || lower_target.contains("normal") || lower_target.contains("medium");
                if is_normal && (opt_name.contains("一般") || lower_name.contains("normal") || lower_name.contains("medium") || lower_id.contains("normal")) {
                    return Some(opt_id);
                }

                let is_critical = target == "严重" || lower_target.contains("critical") || lower_target.contains("major") || lower_target.contains("high");
                if is_critical && (opt_name.contains("严重") || lower_name.contains("critical") || lower_name.contains("major") || lower_name.contains("high") || lower_id.contains("critical") || lower_id.contains("major")) {
                    return Some(opt_id);
                }

                let is_fatal = target == "致命" || lower_target.contains("fatal") || lower_target.contains("blocker");
                if is_fatal && (opt_name.contains("致命") || lower_name.contains("fatal") || lower_name.contains("blocker") || lower_id.contains("fatal") || lower_id.contains("blocker")) {
                    return Some(opt_id);
                }
            }
        }
    }

    // 2. 尝试从 defaultValue / defaultOption 取
    if let Some(def) = field.get("defaultValue").and_then(|v| {
        if let Some(s) = v.as_str() { Some(s.to_string()) }
        else if let Some(id) = v.get("id").or_else(|| v.get("identifier")).or_else(|| v.get("value")).and_then(|x| x.as_str()) {
            Some(id.to_string())
        } else { None }
    }) {
        if !def.is_empty() {
            for opt in opts {
                let (opt_id, opt_name) = parse_opt(opt);
                if opt_id == def || opt_name == def {
                    return Some(opt_id);
                }
            }
            return Some(def);
        }
    }

    // 3. 尝试找「一般 / Normal」作为通用兜底
    for opt in opts {
        let (opt_id, opt_name) = parse_opt(opt);
        if !opt_id.is_empty() && (opt_name.contains("一般") || opt_name.to_ascii_lowercase().contains("normal")) {
            return Some(opt_id);
        }
    }

    // 4. 兜底取首个有效选项 ID
    for opt in opts {
        let (opt_id, _) = parse_opt(opt);
        if !opt_id.is_empty() {
            return Some(opt_id);
        }
    }

    None
}

/// 在需求下创建子工作项（**写操作**）：
/// oapi/v1 POST workitems，body { spaceId, subject, workitemTypeId, parentId, sprint?, assignedTo, severity? }
/// （端点与 body 字段依据 alibabacloud-devops-mcp-server@0.3.64 createWorkItemFunc 逆向，
/// parentId 即挂载父级）。spaceId 取父详情 space.id（子项与父同空间，缺失回退默认
/// 项目空间）；sprint 继承父项迭代；assignedTo 取显式传入、父项负责人、父项创建人或当前用户。
/// 针对缺陷（Bug）自动读取字段配置并补充【严重程度】（severity）等必填项，防止云效 400 校验报错。
#[tauri::command]
pub async fn create_workitem_child(
    state: State<'_, AppState>,
    parent_workitem_id: String,
    subject: String,
    workitem_type_id: String,
    assigned_to: Option<String>,
    severity: Option<String>,
    category: Option<String>,
) -> Result<Value, String> {
    ensure_write(&state)?;
    let parent_workitem_id = parent_workitem_id.trim().to_string();
    let workitem_type_id = workitem_type_id.trim().to_string();
    let subject = subject.trim().to_string();
    if parent_workitem_id.is_empty() {
        return Err("父工作项 ID 不能为空".into());
    }
    if subject.is_empty() || subject.len() > 500 || subject.chars().any(char::is_control) {
        return Err("子任务名称不能为空，且不能超过 500 个字符".into());
    }
    if workitem_type_id.is_empty() {
        return Err("请选择子任务类型".into());
    }
    let c = client_of(&state)?;
    let org = org_of(&state)?;

    // 父详情：spaceId / sprintId（与 get_workitem_workflow_statuses 相同的防御式解包）
    let detail_response = c
        .get(
            &format!("/oapi/v1/projex/organizations/{org}/workitems/{parent_workitem_id}"),
            &[],
        )
        .await?;
    let detail = detail_response
        .get("workitem")
        .or_else(|| detail_response.get("data"))
        .unwrap_or(&detail_response);
    let space_id = {
        let from_parent = nested_s(detail, "space", "id").trim().to_string();
        if from_parent.is_empty() {
            state.settings.lock().unwrap().default_space_identifier.trim().to_string()
        } else {
            from_parent
        }
    };
    if space_id.is_empty() {
        return Err("NOT_CONFIGURED: 无法确定项目空间，请先在设置中选择默认项目空间".into());
    }
    let sprint_id = nested_s(detail, "sprint", "id").trim().to_string();

    let mut body = json!({
        "spaceId": space_id,
        "subject": subject,
        "workitemTypeId": workitem_type_id,
        "parentId": parent_workitem_id,
    });
    if !sprint_id.is_empty() {
        body["sprint"] = json!(sprint_id);
    }

    // 云效 Projex 要求 assignedTo（指派人）不能为空：
    // 优先级：显式入参 -> 父项负责人 -> 父项创建人 -> 父项修改人 -> 当前平台用户
    let mut assignee_id = assigned_to
        .as_deref()
        .map(|s| resolve_user_id(s, detail))
        .unwrap_or_default();
    if assignee_id.is_empty() {
        assignee_id = extract_user_id(detail.get("assignedTo"));
    }
    if assignee_id.is_empty() {
        assignee_id = extract_user_id(detail.get("creator"));
    }
    if assignee_id.is_empty() {
        assignee_id = extract_user_id(detail.get("modifier"));
    }
    if assignee_id.is_empty() {
        if let Ok(user_resp) = c.get("/oapi/v1/platform/user", &[]).await {
            assignee_id = extract_user_id(Some(&user_resp));
        }
    }
    if !assignee_id.is_empty() {
        body["assignedTo"] = json!(assignee_id);
    } else {
        return Err("指派人不能为空：无法从指定处理人、父需求或当前登录用户获取指派人 ID".into());
    }

    // 自动检查该工作项类型的字段配置，填充必填字段（尤其是 Bug 的【严重程度】等）
    let fields_url = format!("/oapi/v1/projex/organizations/{org}/projects/{space_id}/workitemTypes/{workitem_type_id}/fields");
    if let Ok(fields_resp) = c.get(&fields_url, &[]).await {
        let fields_list = if let Some(arr) = fields_resp.as_array() {
            arr.clone()
        } else if let Some(arr) = fields_resp.get("result").and_then(Value::as_array) {
            arr.clone()
        } else if let Some(arr) = fields_resp.get("data").and_then(Value::as_array) {
            arr.clone()
        } else {
            Vec::new()
        };

        for f in &fields_list {
            let name = s2(f, "name", "displayName");
            let ident = {
                let id = s(f, "identifier");
                if id.is_empty() { s(f, "id") } else { id }
            };
            if ident.is_empty() {
                continue;
            }
            let is_severity = name.contains("严重程度") || ident.eq_ignore_ascii_case("severity");
            let is_required = f.get("isRequired").and_then(Value::as_bool).unwrap_or(false)
                || f.get("required").and_then(Value::as_bool).unwrap_or(false)
                || is_severity;

            if is_severity || is_required {
                let target_input = if is_severity { severity.as_deref() } else { None };
                if let Some(val) = match_field_option(f, target_input, is_severity) {
                    body[ident.clone()] = json!(val);
                    if is_severity {
                        body["severity"] = json!(val);
                    }
                    if let Some(cfv) = body.get_mut("customFieldValues").and_then(Value::as_object_mut) {
                        cfv.insert(ident.clone(), json!(val));
                    } else {
                        let mut cfv = serde_json::Map::new();
                        cfv.insert(ident.clone(), json!(val));
                        body["customFieldValues"] = Value::Object(cfv);
                    }
                    let entry = json!({
                        "fieldIdentifier": ident.clone(),
                        "value": val
                    });
                    if let Some(fvl) = body.get_mut("fieldValueList").and_then(Value::as_array_mut) {
                        fvl.push(entry);
                    } else {
                        body["fieldValueList"] = json!([entry]);
                    }
                }
            }
        }
    }

    let resp = c
        .post(&format!("/oapi/v1/projex/organizations/{org}/workitems"), &[], body)
        .await?;

    // 归一化为子项行（与 list_workitem_children 映射一致）；创建响应顶层即工作项对象，
    // 防御式兼容 workitem/data 包装
    let row = resp
        .get("workitem")
        .filter(|w| !s(w, "id").is_empty())
        .or_else(|| resp.get("data").filter(|w| !s(w, "id").is_empty()))
        .unwrap_or(&resp);

    let identifier = {
        let a = s(row, "identifier");
        if !a.is_empty() { a } else { s(row, "serialNumber") }
    };

    let inferred_category = category
        .filter(|c| !c.trim().is_empty())
        .or_else(|| if severity.is_some() { Some("Bug".to_string()) } else { None })
        .unwrap_or_else(|| {
            let mut c = s(row, "categoryId");
            if c.is_empty() { c = s(row, "category"); }
            if c.is_empty() { c = nested_s(row, "workitemType", "category"); }
            if c.is_empty() { c = nested_s(row, "workitemType", "categoryId"); }
            if c.is_empty() { c = "Task".to_string(); }
            c
        });

    let mut status_name = nested_s(row, "status", "name");
    if status_name.is_empty() { status_name = nested_s(row, "status", "displayName"); }
    if status_name.is_empty() { status_name = s(row, "statusName"); }
    if status_name.is_empty() { status_name = "待办".to_string(); }

    let mut status_id = nested_s(row, "status", "id");
    if status_id.is_empty() { status_id = s(row, "statusId"); }

    let mut assigned_to_name = nested_s(row, "assignedTo", "name");
    if assigned_to_name.is_empty() { assigned_to_name = nested_s(row, "assignedTo", "realName"); }
    if assigned_to_name.is_empty() { assigned_to_name = s(row, "assignedToName"); }
    if assigned_to_name.is_empty() && !assignee_id.is_empty() && assignee_id == extract_user_id(detail.get("assignedTo")) {
        assigned_to_name = nested_s(detail, "assignedTo", "name");
    }

    let mut subject_val = s(row, "subject");
    if subject_val.is_empty() { subject_val = subject.clone(); }

    let workitem_id_val = {
        let id = s(row, "id");
        if !id.is_empty() { id } else { s(row, "workitemId") }
    };

    let gmt_modified = i64_of(row, "gmtModified")
        .or_else(|| i64_of(row, "gmtCreate"))
        .map(chrono_ms_to_local)
        .unwrap_or_default();

    Ok(json!({
        "workitemId": workitem_id_val,
        "identifier": identifier,
        "subject": subject_val,
        "category": inferred_category,
        "statusId": status_id,
        "status": status_name,
        "assignedTo": assigned_to_name,
        "gmtModified": gmt_modified,
    }))
}

// ---------- 附件图片代理（富文本描述内联直显） ----------

/// 代理响应大小上限：5MB
const PROXY_MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024;

/// SSRF 白名单：devops.aliyun.com 或 *.aliyuncs.com（含多级子域）
fn proxy_host_allowed(host: &str) -> bool {
    let h = host.trim_end_matches('.').to_ascii_lowercase();
    h == "devops.aliyun.com" || h == "aliyuncs.com" || h.ends_with(".aliyuncs.com")
}

/// 仅云效核心 API 域名需要携带 x-yunxiao-token，OSS/CDN 等直链不携带 PAT
fn is_yunxiao_api_host(host: &str) -> bool {
    let h = host.trim_end_matches('.').to_ascii_lowercase();
    h == "devops.aliyun.com" || h == "openapi-rdc.aliyuncs.com"
}

/// base64 标准字母表编码（不引入新依赖）
fn base64_encode(data: &[u8]) -> String {
    const TBL: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let n = ((chunk[0] as u32) << 16)
            | ((*chunk.get(1).unwrap_or(&0) as u32) << 8)
            | (*chunk.get(2).unwrap_or(&0) as u32);
        out.push(TBL[(n >> 18 & 63) as usize] as char);
        out.push(TBL[(n >> 12 & 63) as usize] as char);
        out.push(if chunk.len() > 1 { TBL[(n >> 6 & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { TBL[(n & 63) as usize] as char } else { '=' });
    }
    out
}

/// GET 云效附件图片（x-yunxiao-token，与 YunxiaoClient 同一鉴权方式）。
/// host 白名单（devops.aliyun.com / *.aliyuncs.com，重定向同样校验）+
/// Content-Type image/* + ≤5MB，成功返回 data:<mime>;base64,<payload>；
/// 鉴权被拒（401/403）等一律 Err（含状态码），不做任何绕过。
#[tauri::command]
pub async fn proxy_workitem_file(state: State<'_, AppState>, url: String) -> Result<String, String> {
    let _ = client_of(&state)?; // 统一 NOT_CONFIGURED 口径
    let pat = crate::credentials::load_pat()
        .ok_or_else(|| "NOT_CONFIGURED: 请先在设置中保存个人访问令牌".to_string())?
        .trim()
        .to_string();
    let parsed = reqwest::Url::parse(url.trim())
        .map_err(|e| format!("PROXY 拒绝: URL 非法（{e}）"))?;
    if parsed.scheme() != "https" {
        return Err(format!("PROXY 拒绝: 仅允许 https（实际 {}）", parsed.scheme()));
    }
    let host = parsed
        .host_str()
        .ok_or("PROXY 拒绝: URL 缺少主机名")?;
    if !proxy_host_allowed(host) {
        return Err(format!("PROXY 拒绝: 主机 {host} 不在白名单（devops.aliyun.com / *.aliyuncs.com）"));
    }
    let is_api_host = is_yunxiao_api_host(host);
    // 重定向目标也必须落在白名单内，最多 5 跳
    let redirect = reqwest::redirect::Policy::custom(|attempt| {
        match attempt.url().host_str().map(proxy_host_allowed) {
            Some(true) if attempt.previous().len() < 5 => attempt.follow(),
            _ => attempt.error("重定向目标不在白名单或次数超限"),
        }
    });
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .redirect(redirect)
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))?;
    let mut req = http.get(parsed);
    if is_api_host {
        req = req.header("x-yunxiao-token", &pat);
    }
    let resp = req
        .send()
        .await
        .map_err(|e| format!("网络错误: {e}"))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("PROXY {status}: 云效附件获取失败"));
    }
    let mime = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.split(';').next().unwrap_or("").trim().to_ascii_lowercase())
        .unwrap_or_default();
    if !mime.starts_with("image/") {
        return Err(format!("PROXY 拒绝: 非图片响应（Content-Type: {mime}）"));
    }
    if let Some(len) = resp.content_length() {
        if len as usize > PROXY_MAX_IMAGE_BYTES {
            return Err(format!("PROXY 拒绝: 附件超过 5MB（{len} 字节）"));
        }
    }
    let bytes = resp.bytes().await.map_err(|e| format!("网络错误: {e}"))?;
    if bytes.len() > PROXY_MAX_IMAGE_BYTES {
        return Err(format!("PROXY 拒绝: 附件超过 5MB（{} 字节）", bytes.len()));
    }
    Ok(format!("data:{mime};base64,{}", base64_encode(&bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_match_field_option_with_yunxiao_display_value() {
        // 云效标准返回：displayValue 为中文，value/id 为 option ID
        let field = json!({
            "id": "severity_field_id",
            "name": "严重程度",
            "options": [
                { "id": "sev_fatal", "value": "fatal_val", "displayValue": "致命" },
                { "id": "sev_critical", "value": "critical_val", "displayValue": "严重" },
                { "id": "sev_normal", "value": "normal_val", "displayValue": "一般" },
                { "id": "sev_minor", "value": "minor_val", "displayValue": "轻微" }
            ]
        });

        // 用户选择「轻微」应精准匹配到 "sev_minor"
        let matched = match_field_option(&field, Some("轻微"), true);
        assert_eq!(matched, Some("sev_minor".to_string()));

        // 用户选择「一般」
        let matched = match_field_option(&field, Some("一般"), true);
        assert_eq!(matched, Some("sev_normal".to_string()));

        // 英文别名匹配 "slight"
        let matched = match_field_option(&field, Some("slight"), true);
        assert_eq!(matched, Some("sev_minor".to_string()));
    }

    #[test]
    fn test_match_field_option_fallback_when_target_missing() {
        let field = json!({
            "id": "severity_field_id",
            "name": "严重程度",
            "options": [
                { "value": "opt_1", "displayValue": "P1-紧急" },
                { "value": "opt_2", "displayValue": "P2-一般" },
                { "value": "opt_3", "displayValue": "P3-提示" }
            ]
        });

        // 匹配包含「一般」的项
        let matched = match_field_option(&field, Some("一般"), true);
        assert_eq!(matched, Some("opt_2".to_string()));

        // 未知值不强行塞入非法中文，回退兜底有效选项
        let matched = match_field_option(&field, Some("完全不存在的级别"), true);
        // 应回退到包含「一般」的 opt_2 或首项
        assert_eq!(matched, Some("opt_2".to_string()));
    }
}
