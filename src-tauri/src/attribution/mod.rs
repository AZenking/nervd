//! 变更归属：仓库中心的事件索引、提交引用解析、增量同步与动态回写支撑。
//!
//! 模块边界：
//! - `model`：IPC 契约（Lead 冻结）
//! - `refs`：提交/分支/MR 的标识符解析与归属推断
//! - `store`：SQLite 事件索引、归属、游标、回写记账
//! - `sync`：仓库中心增量同步

pub mod model;
pub mod refs;
pub mod store;
pub mod sync;