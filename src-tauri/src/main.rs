// 发布版 Windows 下隐藏控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    game_calendar_ai_lib::run()
}
