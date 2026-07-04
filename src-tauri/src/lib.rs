use std::path::Path;

/// 生成不冲突的输出路径: (video.mov, "_slim", "mp4") -> video_slim.mp4
#[tauri::command]
fn output_path(input: String, suffix: String, ext: String) -> String {
    let p = Path::new(&input);
    let dir = p.parent().unwrap_or_else(|| Path::new("."));
    let stem = p
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "video".into());
    let mut out = dir.join(format!("{stem}{suffix}.{ext}"));
    let mut i = 2;
    while out.exists() {
        out = dir.join(format!("{stem}{suffix}_{i}.{ext}"));
        i += 1;
    }
    out.to_string_lossy().to_string()
}

#[tauri::command]
fn file_size(path: String) -> u64 {
    std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0)
}

/// 删除失败/取消任务留下的半成品输出文件
#[tauri::command]
fn remove_file(path: String) {
    let _ = std::fs::remove_file(&path);
}

/// 在文件管理器中显示文件
#[tauri::command]
fn reveal(path: String) {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").args(["-R", &path]).spawn();
    }
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer")
            .arg(format!("/select,{path}"))
            .spawn();
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(dir) = Path::new(&path).parent() {
            let _ = std::process::Command::new("xdg-open").arg(dir).spawn();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            output_path,
            file_size,
            remove_file,
            reveal
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
