use std::process::Command;

/// Windows GUI 子系统下，后台子进程若不设此标志会弹出/闪烁控制台窗口。
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 配置「不应出现控制台窗口」的子进程（git / powershell / ssh-keygen 等）。
/// 故意打开的终端（`system_open_terminal`）不要调用本函数。
pub fn configure_background_command(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let _ = command;
}
