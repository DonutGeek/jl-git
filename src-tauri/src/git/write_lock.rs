use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock, Weak};

use crate::error::AppError;

type RepoMutex = Mutex<()>;

static REPO_WRITE_LOCKS: OnceLock<Mutex<HashMap<PathBuf, Weak<RepoMutex>>>> = OnceLock::new();

fn recover_guard<T>(result: std::sync::LockResult<MutexGuard<'_, T>>) -> MutexGuard<'_, T> {
    match result {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

fn lock_for(repo_path: &Path) -> Arc<RepoMutex> {
    let key = std::fs::canonicalize(repo_path).unwrap_or_else(|_| repo_path.to_path_buf());
    let locks = REPO_WRITE_LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut locks = recover_guard(locks.lock());

    if let Some(lock) = locks.get(&key).and_then(Weak::upgrade) {
        return lock;
    }

    locks.retain(|_, lock| lock.strong_count() > 0);
    let lock = Arc::new(Mutex::new(()));
    locks.insert(key, Arc::downgrade(&lock));
    lock
}

/// 同一仓库的所有写操作必须经过此入口，避免 index、HEAD 与工作区被并发修改。
pub fn with_repo_write_lock<T>(
    repo_path: &Path,
    operation: impl FnOnce() -> Result<T, AppError>,
) -> Result<T, AppError> {
    let lock = lock_for(repo_path);
    let _guard = recover_guard(lock.lock());
    operation()
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::thread;
    use std::time::Duration;

    use super::with_repo_write_lock;

    #[test]
    fn serializes_writes_for_the_same_repo() {
        let temp = std::env::temp_dir();
        let active = Arc::new(AtomicUsize::new(0));
        let max_active = Arc::new(AtomicUsize::new(0));
        let mut handles = Vec::new();

        for _ in 0..4 {
            let repo = temp.clone();
            let active = Arc::clone(&active);
            let max_active = Arc::clone(&max_active);
            handles.push(thread::spawn(move || {
                with_repo_write_lock(&repo, || {
                    let current = active.fetch_add(1, Ordering::SeqCst) + 1;
                    max_active.fetch_max(current, Ordering::SeqCst);
                    thread::sleep(Duration::from_millis(10));
                    active.fetch_sub(1, Ordering::SeqCst);
                    Ok(())
                })
                .unwrap();
            }));
        }

        for handle in handles {
            handle.join().unwrap();
        }

        assert_eq!(max_active.load(Ordering::SeqCst), 1);
    }
}
