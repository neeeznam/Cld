// Bez konzolnog prozora u release verziji na Windowsu.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    kanalcalc_lib::run()
}
