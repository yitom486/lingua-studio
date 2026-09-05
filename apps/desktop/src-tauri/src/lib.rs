use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;

/// 学习 Studio 桌面壳命令（P4-B 平台能力 Rust 侧）。
/// 与 `apps/web/src/platform/tauri-capabilities.ts` 经 `window.__TAURI__.core.invoke` 对接。
/// 命令名与 TS 侧 `tauriInvoke(cmd, ...)` 字符串严格一致。

/// 用系统浏览器打开外链，避免在 WebView 内跳转。
#[tauri::command]
async fn platform_open_external_url(_app: tauri::AppHandle, url: String) -> Result<(), String> {
    tauri_plugin_opener::open_url(&url, None::<&str>).map_err(|e| format!("打开外链失败：{e}"))
}

/// 写入系统剪贴板。
#[tauri::command]
async fn platform_clipboard_write_text(app: tauri::AppHandle, text: String) -> Result<(), String> {
    app.clipboard()
        .write_text(text)
        .map_err(|e| format!("写入剪贴板失败：{e}"))
}

/// 弹出保存对话框并把文本内容写入用户选择的路径。
#[tauri::command]
async fn platform_save_text_file(
    app: tauri::AppHandle,
    filename: String,
    content: String,
    _mime_type: String,
) -> Result<(), String> {
    let path = app
        .dialog()
        .file()
        .set_file_name(&filename)
        .add_filter("文件", &[get_extension(&filename)])
        .blocking_save_file()
        .ok_or_else(|| "未选择保存路径".to_string())?;

    match path {
        tauri_plugin_dialog::FilePath::Path(p) => {
            std::fs::write(p, content).map_err(|e| format!("写入文件失败：{e}"))
        }
        tauri_plugin_dialog::FilePath::Url(_) => Err("保存路径无效：非本地文件路径".to_string()),
    }
}

fn get_extension(filename: &str) -> &str {
    filename.rsplit_once('.').map(|(_, ext)| ext).unwrap_or("txt")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            platform_open_external_url,
            platform_clipboard_write_text,
            platform_save_text_file,
        ])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running Study Studio desktop application");
}
