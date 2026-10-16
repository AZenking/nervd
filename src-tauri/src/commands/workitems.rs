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
            children.push(json!({
                "workitemId": s(w, "id"),
                "identifier": s(w, "serialNumber"),
                "subject": s(w, "subject"),
                "category": s(w, "categoryId"),
                "statusId": nested_s(w, "status", "id"),
                "status": nested_s(w, "status", "name"),
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
                let options = f.get("options")
                    .or_else(|| f.get("items"))
                    .or_else(|| f.get("values"))
                    .and_then(Value::as_array);

                let mut chosen_val: Option<String> = None;

                if is_severity {
                    // 若调用方显式传入了 severity（如 "一般" / "致命" 或 optionId），优先按名称或标识匹配
                    if let Some(target_sev) = severity.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
                        if let Some(opts) = options {
                            for opt in opts {
                                let opt_id = s2(opt, "identifier", "id");
                                let opt_name = s2(opt, "name", "displayName");
                                if opt_id == target_sev || opt_name == target_sev {
                                    chosen_val = Some(opt_id);
                                    break;
                                }
                            }
                        }
                        if chosen_val.is_none() {
                            chosen_val = Some(target_sev.to_string());
                        }
                    }
                }

                // 若未指定或未匹配，尝试从 defaultValue / defaultOption 取
                if chosen_val.is_none() {
                    if let Some(def) = f.get("defaultValue").and_then(|v| {
                        if let Some(s) = v.as_str() { Some(s.to_string()) }
                        else if let Some(id) = v.get("id").or_else(|| v.get("identifier")).and_then(|x| x.as_str()) { Some(id.to_string()) }
                        else { None }
                    }) {
                        if !def.is_empty() {
                            chosen_val = Some(def);
                        }
                    }
                }

                // 若仍未获取，从 options 列表中找「一般/Normal」或第一项备选
                if chosen_val.is_none() {
                    if let Some(opts) = options {
                        let normal_opt = opts.iter().find(|o| {
                            let n = s2(o, "name", "displayName");
                            n.contains("一般") || n.eq_ignore_ascii_case("normal")
                        });
                        let picked = normal_opt.or_else(|| opts.first());
                        if let Some(p) = picked {
                            let opt_id = s2(p, "identifier", "id");
                            if !opt_id.is_empty() {
                                chosen_val = Some(opt_id);
                            }
                        }
                    }
                }

                if let Some(val) = chosen_val {
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
    let status_name = {
        let n = nested_s(row, "status", "name");
        if n.is_empty() { nested_s(row, "status", "displayName") } else { n }
    };
    Ok(json!({
        "workitemId": s(row, "id"),
        "identifier": s(row, "serialNumber"),
        "subject": s(row, "subject"),
        "category": s(row, "categoryId"),
        "statusId": nested_s(row, "status", "id"),
        "status": status_name,
        "assignedTo": nested_s(row, "assignedTo", "name"),
        "gmtModified": i64_of(row, "gmtModified").map(chrono_ms_to_local).unwrap_or_default(),
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
    let resp = http
        .get(parsed)
        .header("x-yunxiao-token", &pat)
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
