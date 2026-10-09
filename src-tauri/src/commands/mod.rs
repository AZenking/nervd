//! Tauri IPC commands grouped by product domain.

mod ci;
mod common;
mod iterations;
mod pipelines;
mod repositories;
mod settings;
mod workitems;

pub use ci::*;
pub use iterations::*;
pub use pipelines::*;
pub use repositories::*;
pub use settings::*;
pub use workitems::*;
