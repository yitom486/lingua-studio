use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::ShellExt;

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

// ---------------------------------------------------------------------------
// P4-B：Agent Gateway sidecar 生命周期与数据库备份
// 网关以编译产物 sidecar 随壳启动（`bun scripts/build-sidecar.ts` 产出
// `binaries/study-studio-gateway-<target-triple>`），库路径指向系统应用数据目录，
// 重启后学习数据保留；前端仍连 http://localhost:8080，无需改动。
// ---------------------------------------------------------------------------

/// 网关 SQLite 库路径：系统应用数据目录（重启保留、卸载清理，区别于仓库根开发库）。
fn gateway_db_path(app: &AppHandle) -> std::path::PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir())
        .join("study-studio.db")
}

/// sidecar 子进程句柄：保活至应用退出（Tauri 退出时自动回收）。
#[allow(dead_code)]
struct GatewaySidecar(std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>>);

/// 拉起网关 sidecar；二进制缺失或启动失败只打日志，不阻塞壳启动
///（离线模式下前端走本地降级，见 `useGateway`）。
fn spawn_gateway_sidecar(app: &AppHandle) {
    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    if let Err(e) = std::fs::create_dir_all(&data_dir) {
        eprintln!("[sidecar] 创建应用数据目录失败：{e}");
    }
    let db_path = data_dir.join("study-studio.db");

    let command = match app.shell().sidecar("study-studio-gateway") {
        Ok(command) => command,
        Err(e) => {
            eprintln!("[sidecar] 网关 sidecar 二进制缺失：{e}（先运行 bun scripts/build-sidecar.ts）");
            return;
        }
    };
    match command
        .env("STUDY_STUDIO_DB", &db_path)
        .env("GATEWAY_PORT", "8080")
        .spawn()
    {
        Ok((mut rx, child)) => {
            println!("[sidecar] 网关已拉起（库路径={}）", db_path.display());
            app.manage(GatewaySidecar(std::sync::Mutex::new(Some(child))));
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_shell::process::CommandEvent;
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                            print!("[gateway] {}", String::from_utf8_lossy(&line))
                        }
                        _ => {}
                    }
                }
            });
        }
        Err(e) => {
            eprintln!("[sidecar] 网关启动失败：{e}（前端将以降级离线模式运行）");
        }
    }
}

/// 备份学习数据库：把当前库文件（含 WAL/SHM 伴生文件）复制到用户选择的目录。
/// 恢复即把备份文件放回应用数据目录并重启应用；schema 迁移为加法自愈
///（CREATE TABLE IF NOT EXISTS + 容错 ALTER），旧库可直接打开。
#[tauri::command]
async fn platform_backup_database(app: AppHandle) -> Result<String, String> {
    let src = gateway_db_path(&app);
    if !src.exists() {
        return Err("学习数据库尚不存在，请先在应用内产生学习记录后再备份。".to_string());
    }
    let dest = app
        .dialog()
        .file()
        .set_file_name("study-studio-backup.db")
        .add_filter("SQLite 数据库", &["db"])
        .blocking_save_file()
        .ok_or_else(|| "未选择保存路径".to_string())?;
    let dest_path = match dest {
        tauri_plugin_dialog::FilePath::Path(p) => p,
        tauri_plugin_dialog::FilePath::Url(_) => {
            return Err("保存路径无效：非本地文件路径".to_string())
        }
    };
    // 主库 + WAL/SHM 伴生文件一起复制，保证热备份一致性
    let mut copied = 0;
    for suffix in ["", "-wal", "-shm"] {
        let from = if suffix.is_empty() {
            src.clone()
        } else {
            src.with_extension(format!("db{suffix}"))
        };
        if !from.exists() {
            continue;
        }
        let to = if suffix.is_empty() {
            dest_path.clone()
        } else {
            dest_path.with_extension(format!("db{suffix}"))
        };
        std::fs::copy(&from, &to).map_err(|e| format!("备份失败：{e}"))?;
        copied += 1;
    }
    if copied == 0 {
        return Err("学习数据库尚不存在，请先在应用内产生学习记录后再备份。".to_string());
    }
    Ok(dest_path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            platform_open_external_url,
            platform_clipboard_write_text,
            platform_save_text_file,
            platform_backup_database,
        ])
        .setup(|app| {
            spawn_gateway_sidecar(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Study Studio desktop application");
}
