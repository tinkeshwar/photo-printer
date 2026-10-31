use tauri::Emitter;
use tauri::menu::{Menu, MenuItem};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        // Default menu plus "Add Photos…" at the top of File; the frontend opens the picker.
        .menu(|app| {
            let menu = Menu::default(app)?;
            let add = MenuItem::with_id(app, "add-photos", "Add Photos…", true, Some("CmdOrCtrl+O"))?;
            let file = menu
                .items()?
                .into_iter()
                .filter_map(|i| i.as_submenu().cloned())
                .find(|s| s.text().is_ok_and(|t| t == "File"));
            match file {
                Some(file) => file.insert(&add, 0)?,
                None => menu.append(&add)?,
            }
            Ok(menu)
        })
        .on_menu_event(|app, e| {
            if e.id() == "add-photos" {
                let _ = app.emit("add-photos", ());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
