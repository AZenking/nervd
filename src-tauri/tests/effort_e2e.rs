//! 工时登记链路验收（E2E）：真实 YunxiaoClient HTTP 层 × 本地 mock 云效。
//!
//! 验收点：
//! 1. 创建工作项后，按云效契约向 .../workitems/{id}/estimatedEfforts 登记，
//!    body 字段名是 spentTime（不是 estimatedHours / estimatedTime）；
//! 2. 登记挂在创建响应返回的工作项 id 上（创建→登记的串联正确）；
//! 3. 鉴权头 x-yunxiao-token 真实发出（mock 缺 token 回 401）。
//!
//! 运行：先起 mock（scripts/e2e-effort.sh 已封装），再
//!   cd src-tauri && cargo test --test effort_e2e -- --nocapture

use nervd_lib::yunxiao::YunxiaoClient;
use serde_json::json;

fn base() -> String {
    std::env::var("NERVD_E2E_BASE").unwrap_or_else(|_| "http://127.0.0.1:8765".into())
}

#[tokio::test]
async fn create_then_register_effort_follows_yunxiao_contract() {
    let c = YunxiaoClient::new("e2e-token").expect("client");
    let b = base();

    // 1. 创建子工作项（与 create_workitem_child 同一端点形态）
    let created = c
        .post_abs(
            &b,
            "/oapi/v1/projex/organizations/org-e2e/workitems",
            json!({
                "spaceId": "sp-1",
                "subject": "【后端】提供退款校验接口",
                "workitemTypeId": "tt-1",
                "parentId": "wi-parent",
            }),
        )
        .await
        .expect("创建应成功");
    let wid = created["id"].as_str().expect("创建响应含 id").to_string();
    assert!(!wid.is_empty(), "工作项 id 不能为空");

    // 2. 登记预计工时：字段名 spentTime，挂在刚创建的 id 上
    let effort = c
        .post_abs(
            &b,
            &format!("/oapi/v1/projex/organizations/org-e2e/workitems/{wid}/estimatedEfforts"),
            json!({ "spentTime": 3.5 }),
        )
        .await
        .expect("工时登记应成功");
    assert_eq!(effort["workitemId"].as_str(), Some(wid.as_str()));
    assert_eq!(effort["spentTime"].as_f64(), Some(3.5));

    // 3. 负例：错误字段名必须被拒（防 estimatedHours 直传的契约回归）
    let wrong = c
        .post_abs(
            &b,
            &format!("/oapi/v1/projex/organizations/org-e2e/workitems/{wid}/estimatedEfforts"),
            json!({ "estimatedHours": 3.5 }),
        )
        .await;
    assert!(wrong.is_err(), "错误字段名 estimatedHours 必须被云效拒绝");
    let msg = wrong.unwrap_err();
    assert!(msg.contains("400"), "应回 400，实际: {msg}");

    // 4. 负例：缺鉴权头必须被拒
    let anon = YunxiaoClient::new("").expect("client");
    let denied = anon
        .post_abs(&b, "/oapi/v1/projex/organizations/org-e2e/workitems", json!({}))
        .await;
    assert!(denied.is_err(), "缺 token 必须被拒");
    assert!(denied.unwrap_err().contains("401"), "应回 401");
}
