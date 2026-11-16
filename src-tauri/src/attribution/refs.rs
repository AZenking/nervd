//! 提交 / 分支 / MR 的标识符解析与归属推断。
//!
//! 解析顺序（与 `docs/change-attribution.md` 一致）：
//! 1. trailer（`Refs:` / `Workitem:` / `Req:` / `Task:` / `Bug:`，行首、大小写不敏感）
//! 2. 正文/标题中的 `linkPattern`
//! 3. 分支名（`gbranch` owner = 最后一个标识符，子项优先）
//!
//! 本模块是纯函数集合：不做 IO、不读设置、不解析工作项 ID，
//! 便于单测与在同步流程里复用。

use regex::Regex;
use std::collections::HashMap;

/// git trailer 中被识别为「工作项引用」的键（小写比较）。
const TRAILER_KEYS: [&str; 5] = ["refs", "workitem", "req", "task", "bug"];

/// 归属关系（与 `event_workitems.relation` 的 CHECK 一致）。
pub const RELATION_PRIMARY: &str = "primary";
pub const RELATION_RELATED: &str = "related";
pub const RELATION_ROLLUP: &str = "rollup";

/// 归属置信度（与 `event_workitems.confidence` 的 CHECK 一致）。
pub const CONFIDENCE_EXPLICIT: &str = "explicit";
pub const CONFIDENCE_BRANCH: &str = "branch";
pub const CONFIDENCE_TARGET: &str = "target";
pub const CONFIDENCE_INHERITED: &str = "inherited";

/// 一条事件 → 工作项归属（未解析 workitemId，由 `store` 落库时补）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Attribution {
    pub identifier: String,
    pub category: Option<String>,
    /// primary | related | rollup
    pub relation: String,
    /// explicit | branch | target | inherited | manual
    pub confidence: String,
}

impl Attribution {
    pub fn is_primary(&self) -> bool {
        self.relation == RELATION_PRIMARY
    }

    pub fn is_task_or_bug(&self) -> bool {
        matches!(self.category.as_deref(), Some("Task") | Some("Bug"))
    }
}

/// 标点/包裹字符，解析前统一剥掉（支持 `[REQ-1]`、`"REQ-1"`、`#123` 等写法）。
fn is_trim_char(c: char) -> bool {
    matches!(
        c,
        ',' | ';' | ':' | '"' | '\'' | '`' | '[' | ']' | '(' | ')' | '{' | '}' | '<' | '>' | '#'
    )
}

/// 标识符规范化：大写、`_` 归一为 `-`、去掉包裹标点、压缩重复 `-`。
///
/// `REQ_101` → `REQ-101`；`req101` → `REQ-101`（补分隔符，兼容旧 `linkPattern`）；
/// `abc-12` → `ABC-12`。非法字符（含非 ASCII）返回 `None`。
pub fn normalize_identifier(raw: &str) -> Option<String> {
    let trimmed = raw.trim().trim_matches(is_trim_char);
    if trimmed.is_empty() || trimmed.len() > 64 {
        return None;
    }
    let mut value = String::with_capacity(trimmed.len());
    let mut previous_dash = false;
    for ch in trimmed.chars() {
        let ch = if ch == '_' {
            '-'
        } else {
            ch.to_ascii_uppercase()
        };
        if ch == '-' {
            if previous_dash {
                continue;
            }
            previous_dash = true;
            value.push(ch);
        } else if ch.is_ascii_alphanumeric() {
            previous_dash = false;
            value.push(ch);
        } else {
            return None;
        }
    }
    let value = value.trim_matches('-').to_string();
    if value.is_empty() {
        return None;
    }
    Some(split_category_prefix(&value))
}

/// `REQ101` → `REQ-101`：兼容旧版 `linkPattern` 只捕获数字/无分隔符的写法。
fn split_category_prefix(value: &str) -> String {
    for prefix in ["REQ", "BUG", "TASK"] {
        if let Some(rest) = value.strip_prefix(prefix) {
            if !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit()) {
                return format!("{prefix}-{rest}");
            }
        }
    }
    value.to_string()
}

/// 由标识符前缀识别工作项类别；`REQ-101` → `Req`。
pub fn category_of(identifier: &str) -> Option<&'static str> {
    let upper = identifier.trim().to_ascii_uppercase();
    for (prefix, category) in [("REQ", "Req"), ("BUG", "Bug"), ("TASK", "Task")] {
        if let Some(rest) = upper.strip_prefix(prefix) {
            // 必须紧跟 `-` 或数字，避免把 `REQUIREMENT-1` 误判成 Req
            if rest.is_empty() {
                continue;
            }
            if rest.starts_with('-') || rest.chars().next().is_some_and(|c| c.is_ascii_digit()) {
                return Some(category);
            }
        }
    }
    None
}

/// 从提交消息里提取 trailer 引用（行首、大小写不敏感，值可用逗号/空格分隔）。
///
/// 只认「整行以 key: 开头」的写法；正文里 `see Refs: XXX` 不算 trailer
/// （那部分交给 `linkPattern` 兜底）。
pub fn extract_trailer_identifiers(message: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for line in message.lines() {
        let line = line.trim_start();
        let Some((key, rest)) = split_trailer(line) else {
            continue;
        };
        if !TRAILER_KEYS
            .iter()
            .any(|known| known.eq_ignore_ascii_case(key))
        {
            continue;
        }
        for token in split_trailer_values(rest) {
            if let Some(identifier) = normalize_identifier(token) {
                push_unique(&mut out, identifier);
            }
        }
    }
    out
}

fn split_trailer(line: &str) -> Option<(&str, &str)> {
    let index = line.find(':')?;
    let key = line[..index].trim();
    // git trailer 键不允许空白（`Refs : x` 不当作 trailer）
    if key.is_empty() || key.chars().any(char::is_whitespace) {
        return None;
    }
    Some((key, &line[index + 1..]))
}

fn split_trailer_values(text: &str) -> Vec<&str> {
    text.split(|c: char| c == ',' || c == ';' || c.is_whitespace())
        .filter(|token| !token.is_empty())
        .collect()
}

/// 按 `linkPattern` 从任意文本中提取标识符（分支名/标题/正文共用）。
///
/// 规则：优先取第 1 个捕获组；若捕获组是纯数字（旧 pattern 只捕获编号），
/// 则回退到整个匹配串以保留 `REQ` 前缀；`linkPattern` 非法时返回空。
pub fn extract_pattern_identifiers(text: &str, link_pattern: &str) -> Vec<String> {
    if text.is_empty() {
        return Vec::new();
    }
    let Ok(regex) = Regex::new(link_pattern) else {
        return Vec::new();
    };
    let mut out: Vec<String> = Vec::new();
    for captures in regex.captures_iter(text) {
        let whole = captures.get(0).map(|m| m.as_str()).unwrap_or_default();
        let captured = captures.get(1).map(|m| m.as_str()).unwrap_or(whole);
        let candidate = if !captured.is_empty() && captured.chars().all(|c| c.is_ascii_digit()) {
            // 旧 pattern `(?:REQ|BUG|TASK)[-_]?(\d+)`：整串才带类别前缀
            if normalize_identifier(whole).is_some() {
                whole
            } else {
                captured
            }
        } else {
            captured
        };
        if let Some(identifier) = normalize_identifier(candidate) {
            push_unique(&mut out, identifier);
        }
    }
    out
}

/// `linkPattern` 是否可编译（同步入口做一次前置校验，避免整轮静默为空）。
pub fn validate_link_pattern(link_pattern: &str) -> Result<(), String> {
    Regex::new(link_pattern)
        .map(|_| ())
        .map_err(|e| format!("设置中的需求编号正则 linkPattern 无效: {e}"))
}

/// 提交消息中的全部显式引用：trailer 优先，正文 `linkPattern` 兜底去重。
pub fn commit_identifiers(message: &str, link_pattern: &str) -> Vec<String> {
    let mut out = extract_trailer_identifiers(message);
    for identifier in extract_pattern_identifiers(message, link_pattern) {
        push_unique(&mut out, identifier);
    }
    out
}

/// 分支名中的标识符（保持出现顺序）。
pub fn branch_identifiers(branch: &str, link_pattern: &str) -> Vec<String> {
    extract_pattern_identifiers(branch, link_pattern)
}

/// 分支 owner：分支名中最后一个标识符（子项优先）。
pub fn branch_owner(branch: &str, link_pattern: &str) -> Option<String> {
    branch_identifiers(branch, link_pattern).pop()
}

fn push_unique(out: &mut Vec<String>, value: String) {
    if !out.iter().any(|existing| existing == &value) {
        out.push(value);
    }
}

fn relation_priority(relation: &str) -> u8 {
    match relation {
        RELATION_PRIMARY => 3,
        RELATION_ROLLUP => 2,
        _ => 1,
    }
}

#[derive(Default)]
struct LinkBuilder {
    order: Vec<String>,
    links: HashMap<String, Attribution>,
}

impl LinkBuilder {
    fn add(&mut self, identifier: &str, relation: &str, confidence: &str) {
        let category = category_of(identifier).map(str::to_string);
        if let Some(existing) = self.links.get_mut(identifier) {
            if relation_priority(relation) > relation_priority(&existing.relation) {
                existing.relation = relation.to_string();
                existing.confidence = confidence.to_string();
            }
            if existing.category.is_none() {
                existing.category = category;
            }
            return;
        }
        self.order.push(identifier.to_string());
        self.links.insert(
            identifier.to_string(),
            Attribution {
                identifier: identifier.to_string(),
                category,
                relation: relation.to_string(),
                confidence: confidence.to_string(),
            },
        );
    }

    fn finish(self) -> Vec<Attribution> {
        self.order
            .into_iter()
            .filter_map(|identifier| self.links.get(&identifier).cloned())
            .collect()
    }
}

fn build_attributions(
    explicit: &[String],
    branch: Option<&str>,
    target: Option<&str>,
    link_pattern: &str,
) -> Vec<Attribution> {
    let mut builder = LinkBuilder::default();
    // 显式引用中 Task/Bug 优先于 Req；同层取第一个为 primary，其余 related。
    let primary_index = explicit
        .iter()
        .position(|identifier| matches!(category_of(identifier), Some("Task") | Some("Bug")))
        .unwrap_or(0);
    let primary_is_child = explicit
        .get(primary_index)
        .is_some_and(|identifier| matches!(category_of(identifier), Some("Task") | Some("Bug")));

    if !explicit.is_empty() {
        builder.add(
            &explicit[primary_index],
            RELATION_PRIMARY,
            CONFIDENCE_EXPLICIT,
        );
        for (index, identifier) in explicit.iter().enumerate() {
            if index != primary_index {
                builder.add(identifier, RELATION_RELATED, CONFIDENCE_EXPLICIT);
            }
        }
    }

    if let Some(branch) = branch {
        let identifiers = branch_identifiers(branch, link_pattern);
        if let Some((owner, rest)) = identifiers.split_last() {
            // 显式引用是 Task/Bug 时，需求分支 owner 是父需求汇总，不是逐条 related；
            // 否则父需求时间线会被子项 commit 刷屏。
            let owner_is_requirement = matches!(category_of(owner), Some("Req"));
            let (relation, confidence) = if explicit.is_empty() {
                (RELATION_PRIMARY, CONFIDENCE_BRANCH)
            } else if primary_is_child && owner_is_requirement {
                (RELATION_ROLLUP, CONFIDENCE_INHERITED)
            } else {
                (RELATION_RELATED, CONFIDENCE_BRANCH)
            };
            builder.add(owner, relation, confidence);
            for identifier in rest {
                builder.add(identifier, RELATION_RELATED, CONFIDENCE_BRANCH);
            }
        }
    }

    if let Some(target) = target {
        // MR 目标分支 owner 作为 related（rollup 由调用方按父需求补充）
        for identifier in branch_identifiers(target, link_pattern) {
            builder.add(&identifier, RELATION_RELATED, CONFIDENCE_TARGET);
        }
    }

    builder.finish()
}

/// commit 归属：`message` 显式引用 → 分支名 owner → 其余分支标识符。
pub fn attribute_commit(
    message: &str,
    branch: Option<&str>,
    link_pattern: &str,
) -> Vec<Attribution> {
    let explicit = commit_identifiers(message, link_pattern);
    build_attributions(&explicit, branch, None, link_pattern)
}

/// MR 归属：标题显式引用（trailer/pattern）→ sourceBranch owner primary →
/// targetBranch owner related。
pub fn attribute_merge_request(
    title: &str,
    source_branch: &str,
    target_branch: &str,
    link_pattern: &str,
) -> Vec<Attribution> {
    let explicit = commit_identifiers(title, link_pattern);
    build_attributions(
        &explicit,
        Some(source_branch),
        Some(target_branch),
        link_pattern,
    )
}

/// 追加 rollup 归属（primary 是 Task/Bug 且父需求可解析时）。
///
/// 只负责关系推断；父需求的 `workitem_id` 由调用方从解析缓存里取。
pub fn push_rollup(links: &mut Vec<Attribution>, parent_identifier: &str) {
    let Some(parent) = normalize_identifier(parent_identifier) else {
        return;
    };
    // 父需求已经以其它关系出现时不重复记录
    if links.iter().any(|link| link.identifier == parent) {
        return;
    }
    links.push(Attribution {
        category: category_of(&parent).map(str::to_string),
        identifier: parent,
        relation: RELATION_ROLLUP.to_string(),
        confidence: CONFIDENCE_INHERITED.to_string(),
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    const DEFAULT_PATTERN: &str = r"([A-Za-z][A-Za-z0-9]{1,15}[-_]\d{1,})";
    const LEGACY_PATTERN: &str = r"(?:REQ|BUG|TASK)[-_]?(\d+)";

    fn relations(links: &[Attribution]) -> Vec<(String, String, String)> {
        links
            .iter()
            .map(|link| {
                (
                    link.identifier.clone(),
                    link.relation.clone(),
                    link.confidence.clone(),
                )
            })
            .collect()
    }

    #[test]
    fn multi_reference_prefers_task_or_bug_as_primary() {
        let message =
            "feat: 支持批量回写\n\nRefs: REQ-101, TASK-202\nBug: BUG-303\n\n正文顺带提到 REQ-404。";
        let links = attribute_commit(message, Some("feature/req-101_task-202"), DEFAULT_PATTERN);

        let got = relations(&links);
        assert_eq!(
            got[0],
            (
                "TASK-202".to_string(),
                RELATION_PRIMARY.to_string(),
                CONFIDENCE_EXPLICIT.to_string()
            ),
            "显式引用中 Task 优先于 Req：{got:?}"
        );
        assert!(got.contains(&(
            "REQ-101".to_string(),
            RELATION_RELATED.to_string(),
            CONFIDENCE_EXPLICIT.to_string()
        )));
        assert!(got.contains(&(
            "BUG-303".to_string(),
            RELATION_RELATED.to_string(),
            CONFIDENCE_EXPLICIT.to_string()
        )));
        assert!(got.contains(&(
            "REQ-404".to_string(),
            RELATION_RELATED.to_string(),
            CONFIDENCE_EXPLICIT.to_string()
        )));
        // 分支 owner（最后一个）作为 related，且不与显式引用重复
        assert_eq!(
            got.iter()
                .filter(|(identifier, _, _)| identifier == "TASK-202")
                .count(),
            1
        );
    }

    #[test]
    fn underscore_and_case_are_normalized() {
        let message = "fix\n\nrefs: req_101 task_202\nworkitem: bug_303";
        let mut identifiers = extract_trailer_identifiers(message);
        identifiers.sort();
        assert_eq!(identifiers, vec!["BUG-303", "REQ-101", "TASK-202"]);

        assert_eq!(normalize_identifier(" req_101 "), Some("REQ-101".into()));
        assert_eq!(normalize_identifier("Req101"), Some("REQ-101".into()));
        assert_eq!(normalize_identifier("[BUG-9]"), Some("BUG-9".into()));
        assert_eq!(normalize_identifier("---"), None);
        assert_eq!(normalize_identifier("需求-1"), None);
        assert_eq!(category_of("REQ-1"), Some("Req"));
        assert_eq!(category_of("TASK-1"), Some("Task"));
        assert_eq!(category_of("BUG-1"), Some("Bug"));
        assert_eq!(category_of("FOO-1"), None);
        assert_eq!(category_of("REQUIREMENT-1"), None);
    }

    #[test]
    fn no_reference_falls_back_to_branch_owner() {
        let links = attribute_commit("chore: 调整格式", Some("feature/req-7"), DEFAULT_PATTERN);
        assert_eq!(
            relations(&links),
            vec![(
                "REQ-7".to_string(),
                RELATION_PRIMARY.to_string(),
                CONFIDENCE_BRANCH.to_string()
            )]
        );

        // 无引用且无分支名 → 空（事件进入待归属）
        assert!(attribute_commit("chore: 调整格式", None, DEFAULT_PATTERN).is_empty());
        assert!(
            attribute_commit("chore", Some("feature/no-identifier-here"), DEFAULT_PATTERN)
                .is_empty()
        );
    }

    #[test]
    fn branch_owner_is_last_identifier_and_others_are_related() {
        let branch = "feature/req-101_task-202";
        assert_eq!(
            branch_owner(branch, DEFAULT_PATTERN).as_deref(),
            Some("TASK-202")
        );
        assert_eq!(
            branch_identifiers(branch, DEFAULT_PATTERN),
            vec!["REQ-101".to_string(), "TASK-202".to_string()]
        );

        let links = attribute_commit("no refs", Some(branch), DEFAULT_PATTERN);
        let got = relations(&links);
        assert!(got.contains(&(
            "TASK-202".to_string(),
            RELATION_PRIMARY.to_string(),
            CONFIDENCE_BRANCH.to_string()
        )));
        assert!(got.contains(&(
            "REQ-101".to_string(),
            RELATION_RELATED.to_string(),
            CONFIDENCE_BRANCH.to_string()
        )));
    }

    #[test]
    fn custom_pattern_and_legacy_pattern_are_supported() {
        // 自定义 pattern（无捕获组 → 用整串）
        let links = extract_pattern_identifiers("feat(FEAT-12) 与 FIX-34", r"(?:FEAT|FIX)-\d+");
        assert!(links.contains(&"FEAT-12".to_string()));
        assert!(links.contains(&"FIX-34".to_string()));

        // 旧 pattern 只捕获数字：整串匹配保留类别前缀
        let links = extract_pattern_identifiers("修复 REQ-101 / TASK_202", LEGACY_PATTERN);
        assert_eq!(links, vec!["REQ-101".to_string(), "TASK-202".to_string()]);

        // 非法正则不 panic，只是无结果
        assert!(extract_pattern_identifiers("REQ-1", "([unclosed").is_empty());
        assert!(validate_link_pattern("([unclosed").is_err());
        assert!(validate_link_pattern(DEFAULT_PATTERN).is_ok());
    }

    #[test]
    fn trailer_must_start_a_line_and_be_case_insensitive() {
        let message = "标题\n\nrefs: REQ-1\nWORKITEM: BUG-2\nsee Refs: TASK-3 不算 trailer";
        let identifiers = extract_trailer_identifiers(message);
        assert_eq!(identifiers, vec!["REQ-1", "BUG-2"]);
    }

    #[test]
    fn merge_request_uses_source_branch_as_primary_and_target_as_related() {
        let links = attribute_merge_request(
            "feat: 合并开发分支",
            "feature/task-9",
            "release/req-1",
            DEFAULT_PATTERN,
        );
        let got = relations(&links);
        assert!(got.contains(&(
            "TASK-9".to_string(),
            RELATION_PRIMARY.to_string(),
            CONFIDENCE_BRANCH.to_string()
        )));
        assert!(got.contains(&(
            "REQ-1".to_string(),
            RELATION_RELATED.to_string(),
            CONFIDENCE_TARGET.to_string()
        )));

        // 显式引用改变 primary，但 target owner 仍是 related
        let links = attribute_merge_request(
            "Refs: BUG-5",
            "feature/no-id",
            "release/req-1",
            DEFAULT_PATTERN,
        );
        let got = relations(&links);
        assert_eq!(got[0].0, "BUG-5");
        assert_eq!(got[0].1, RELATION_PRIMARY);
        assert!(got.contains(&(
            "REQ-1".to_string(),
            RELATION_RELATED.to_string(),
            CONFIDENCE_TARGET.to_string()
        )));
    }

    #[test]
    fn rollup_is_appended_once() {
        let mut links = attribute_commit("Refs: TASK-1", Some("feature/task-1"), DEFAULT_PATTERN);
        push_rollup(&mut links, "REQ-9");
        push_rollup(&mut links, "REQ_9");
        let rollups: Vec<_> = links
            .iter()
            .filter(|link| link.is_primary() || link.relation == RELATION_ROLLUP)
            .collect();
        assert_eq!(rollups.len(), 2);
        assert_eq!(rollups[1].identifier, "REQ-9");
        assert_eq!(rollups[1].confidence, CONFIDENCE_INHERITED);
    }
}
