//! Tauri IPC commands grouped by product domain.

mod ai;
mod ci;
mod common;
mod iterations;
mod local_tasks;
mod pipelines;
mod repositories;
mod settings;
mod updater;
mod workitems;

pub use ai::*;
pub use ci::*;
pub use iterations::*;
pub use local_tasks::*;
pub use pipelines::*;
pub use repositories::*;
pub use settings::*;
pub use updater::*;
pub use workitems::*;
