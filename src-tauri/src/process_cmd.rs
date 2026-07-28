use std::process::Command;

/// Windows GUI 子系统下，后台子进程若不设此标志会弹出/闪烁控制台窗口。
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 配置「不应出现控制台窗口」的子进程（git / powershell / ssh-keygen 等）。
/// 故意打开的终端（`system_open_terminal`）不要调用本函数。
/// Unix：放入独立进程组，超时时可连同 husky/pnpm 子进程一并杀掉。
pub fn configure_background_command(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // 0 = 子进程成为新进程组组长（pgid == pid）
        command.process_group(0);
    }
    let _ = command;
}

/// 结束子进程；Unix 上优先杀整个进程组，避免 hook 里的 pnpm 残留导致等待挂死
pub fn kill_background_child(child: &mut std::process::Child) {
    #[cfg(unix)]
    {
        let pid = child.id() as i32;
        if pid > 0 {
            // 负 pid：向该进程组发信号（需为 process_group 启动）
            let _ = std::process::Command::new("kill")
                .args(["-KILL", &format!("-{pid}")])
                .status();
        }
    }
    let _ = child.kill();
}
