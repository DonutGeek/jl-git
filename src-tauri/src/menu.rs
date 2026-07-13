//! 原生应用菜单（macOS 菜单栏等）
//! 默认中文标签；系统不会自动翻译 File/Edit，需自行设置。

use tauri::{
    menu::{Menu, MenuBuilder, SubmenuBuilder},
    AppHandle, Runtime,
};

/// 构建中文默认菜单并设为应用菜单
pub fn install_zh_cn_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let menu = build_zh_cn_menu(app)?;
    app.set_menu(menu)?;
    Ok(())
}

fn build_zh_cn_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    // macOS：第一项会成为应用菜单（jlgit）
    let app_menu = SubmenuBuilder::new(app, "JLGit")
        .about_with_text("关于 JLGit", None)
        .separator()
        .services_with_text("服务")
        .separator()
        .hide_with_text("隐藏 JLGit")
        .hide_others_with_text("隐藏其他")
        .show_all_with_text("全部显示")
        .separator()
        .quit_with_text("退出 JLGit")
        .build()?;

    let file_menu = SubmenuBuilder::new(app, "文件")
        .close_window_with_text("关闭窗口")
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "编辑")
        .undo_with_text("撤销")
        .redo_with_text("重做")
        .separator()
        .cut_with_text("剪切")
        .copy_with_text("拷贝")
        .paste_with_text("粘贴")
        .select_all_with_text("全选")
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "显示")
        .fullscreen_with_text("进入全屏幕")
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "窗口")
        .minimize_with_text("最小化")
        .maximize_with_text("缩放")
        .separator()
        .close_window_with_text("关闭")
        .bring_all_to_front_with_text("前置全部窗口")
        .build()?;

    let help_menu = SubmenuBuilder::new(app, "帮助").build()?;

    MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&window_menu)
        .item(&help_menu)
        .build()
}
