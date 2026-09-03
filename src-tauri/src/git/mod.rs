//! Git CLI 执行与解析。UI 不得直接拼命令；一律经 `commands/git_ops` 入参校验后再到这里。
//!
//! 每个子模块对应一类能力（status / diff / log / branch…），返回可序列化结构给前端。

pub mod blame;
pub mod branch;
pub mod branch_compare;
pub mod commit;
pub mod conflict;
pub mod diff;
pub mod env_path;
pub mod fs_list;
pub mod grep;
pub mod identity;
pub mod log;
pub mod media;
pub mod merge;
pub mod oplog;
pub mod path;
pub mod project_profile;
pub mod remote;
pub mod remote_identity;
pub mod repo_state;
pub mod reset;
pub mod runner;
pub mod show;
pub mod stash;
pub mod status;
pub mod tag;
pub mod version;
pub mod write_lock;
