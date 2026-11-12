//! 时间展示的唯一公共实现：epoch 毫秒 → 本地时区字符串。
//!
//! 历史实现用「ms → UTC」手写民用历换算，却被当作本地时间直接展示（东八区整体早 8 小时，
//! 且 UTC 16:00 之后日期会错一天）。这里统一改用 `chrono::Local`，输出格式保持不变
//! （前端无需改动）：日期时间 `YYYY-MM-DD HH:MM:SS`，日期 `YYYY-MM-DD`。

use chrono::{Local, TimeZone};

/// 本地时区格式化；极端越界时间戳回退 UTC（并告警一次），保证命令不因展示层失败。
fn format_local(ms: i64, fmt: &str) -> String {
    if let Some(dt) = Local.timestamp_millis_opt(ms).single() {
        return dt.format(fmt).to_string();
    }
    eprintln!("[timeutil] 时间戳 {ms} 超出本地时区可表示范围，回退 UTC 展示");
    match chrono::DateTime::from_timestamp_millis(ms) {
        Some(dt) => dt.format(fmt).to_string(),
        None => String::new(),
    }
}

/// epoch 毫秒 → 本地 `YYYY-MM-DD HH:MM:SS`
pub fn epoch_ms_to_local(ms: i64) -> String {
    format_local(ms, "%Y-%m-%d %H:%M:%S")
}

/// epoch 毫秒 → 本地 `YYYY-MM-DD`（迭代起止日期等只取日期的场景）
pub fn epoch_ms_to_local_date(ms: i64) -> String {
    format_local(ms, "%Y-%m-%d")
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Local, NaiveDateTime, TimeZone};

    /// 输出必须能被解析回同一个 epoch 毫秒 —— 即真正按本地时区落盘展示。
    #[test]
    fn epoch_ms_round_trips_through_local_timezone() {
        for ms in [
            0_i64,
            1_791_514_800_000,
            1_767_225_599_000,
            1_709_208_000_000,
        ] {
            let text = epoch_ms_to_local(ms);
            assert_eq!(text.len(), 19, "格式应为 YYYY-MM-DD HH:MM:SS: {text}");
            let naive =
                NaiveDateTime::parse_from_str(&text, "%Y-%m-%d %H:%M:%S").expect("输出应可解析");
            let local = Local
                .from_local_datetime(&naive)
                .single()
                .expect("本地时间应唯一");
            assert_eq!(local.timestamp_millis(), ms, "本地换算必须可逆: {text}");
        }
    }

    #[test]
    fn date_variant_matches_local_datetime_prefix() {
        let ms = 1_791_514_800_000;
        let date = epoch_ms_to_local_date(ms);
        assert_eq!(date.len(), 10);
        assert_eq!(date, epoch_ms_to_local(ms)[..10]);
    }

    /// 东八区 2026-10-09 11:00 的 UTC 03:00 输入，日期必须是本地 10-09 而非 UTC 日期。
    /// 该断言与运行机器时区无关：两者都按 Local 计算。
    #[test]
    fn local_date_is_computed_in_local_timezone() {
        let utc_midnight = 1_791_504_000_000; // 2026-10-09T00:00:00Z
        let expected = Local
            .timestamp_millis_opt(utc_midnight)
            .single()
            .unwrap()
            .format("%Y-%m-%d")
            .to_string();
        assert_eq!(epoch_ms_to_local_date(utc_midnight), expected);
    }
}
