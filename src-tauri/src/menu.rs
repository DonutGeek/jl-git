//! 原生应用菜单
//! 默认中文标签；系统不会自动翻译 File/Edit，需自行设置。

use tauri::{
    menu::{AboutMetadata, Menu, MenuBuilder, SubmenuBuilder},
    AppHandle, Runtime,
};

/// 与 LICENSE / README 一致；`bundle.copyright` 优先
const DEFAULT_COPYRIGHT: &str = "Copyright © 2026 DonutGeek";

/// 构建中文默认菜单并设为应用菜单
pub fn install_zh_cn_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let menu = build_zh_cn_menu(app)?;
    app.set_menu(menu)?;
    Ok(())
}

fn about_metadata<R: Runtime>(app: &AppHandle<R>) -> AboutMetadata<'_> {
    let pkg_info = app.package_info();
    let config = app.config();
    AboutMetadata {
        name: Some(pkg_info.name.clone()),
        version: Some(pkg_info.version.to_string()),
        copyright: Some(
            config
                .bundle
                .copyright
                .clone()
                .unwrap_or_else(|| DEFAULT_COPYRIGHT.to_string()),
        ),
        ..Default::default()
    }
}

fn build_zh_cn_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    #[cfg(target_os = "macos")]
    {
        return build_macos_menu(app);
    }
    #[cfg(not(target_os = "macos"))]
    {
        build_desktop_menu(app)
    }
}

/// macOS：完整应用菜单（服务 / 隐藏等）
#[cfg(target_os = "macos")]
fn build_macos_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let about = about_metadata(app);

    let app_menu = SubmenuBuilder::new(app, "鲸灵Git")
        .about_with_text("关于 鲸灵Git", Some(about))
        .separator()
        .services_with_text("服务")
        .separator()
        .hide_with_text("隐藏 鲸灵Git")
        .hide_others_with_text("隐藏其他")
        .show_all_with_text("全部显示")
        .separator()
        .quit_with_text("退出 鲸灵Git")
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

/// Windows / Linux：精简菜单（无 mac 专用服务/隐藏项）
#[cfg(not(target_os = "macos"))]
fn build_desktop_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let about = about_metadata(app);

    let file_menu = SubmenuBuilder::new(app, "文件")
        .about_with_text("关于 鲸灵Git", Some(about))
        .separator()
        .quit_with_text("退出")
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
        .fullscreen_with_text("全屏")
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "窗口")
        .minimize_with_text("最小化")
        .maximize_with_text("最大化")
        .separator()
        .close_window_with_text("关闭")
        .build()?;

    MenuBuilder::new(app)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&window_menu)
        .build()
}
