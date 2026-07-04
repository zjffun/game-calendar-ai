//! 桌面壳（无自定义 UI 逻辑，页面与网页版同一套代码）。
//!
//! 网页内容的加载与更新策略：
//! - 窗口加载自定义协议 `app://localhost`，由 [`serve_web`] 提供内容：
//!   优先读应用数据目录下的「网页缓存」（webcache，来自 GitHub Pages 热更新），
//!   没有缓存则回退到打包时内置的 dist —— 因此**完全离线可用**；
//! - [`download_web_update`] 命令：比对 GitHub Pages 上的 version.json
//!   （由 scripts/gen-web-manifest.mjs 随每次构建生成），有新版本则把清单里的
//!   文件全部下载到临时目录，校验完整后原子替换 webcache；前端重载即生效。
//! - 始终保持同一 origin（app://localhost），因此 localStorage / IndexedDB
//!   中的用户数据在「内置版 ⇄ 更新版」之间无缝延续。

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// GitHub Pages 站点根地址（deploy.yml 部署到的位置）
const PAGES_BASE: &str = "https://zjffun.github.io/game-calendar-ai/";
/// 网页缓存目录名（位于应用数据目录下）
const WEB_CACHE_DIR: &str = "webcache";

/// dist/version.json 的结构（见 scripts/gen-web-manifest.mjs）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WebManifest {
    version: String,
    #[serde(default)]
    built_at: Option<String>,
    files: Vec<String>,
}

fn web_cache_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join(WEB_CACHE_DIR))
}

/// 当前生效的网页清单：缓存优先，回退内置
fn active_manifest(app: &AppHandle) -> Option<WebManifest> {
    if let Some(dir) = web_cache_dir(app) {
        if let Ok(bytes) = fs::read(dir.join("version.json")) {
            if let Ok(m) = serde_json::from_slice::<WebManifest>(&bytes) {
                return Some(m);
            }
        }
    }
    let resolver = app.asset_resolver();
    let asset = resolver
        .get("/version.json".into())
        .or_else(|| resolver.get("version.json".into()))?;
    serde_json::from_slice(&asset.bytes).ok()
}

/// 把请求路径清洗为安全的相对路径；空路径视为 index.html，拒绝路径穿越
fn sanitize_rel_path(uri_path: &str) -> Option<String> {
    let decoded = percent_encoding::percent_decode_str(uri_path)
        .decode_utf8()
        .ok()?;
    let trimmed = decoded.trim_start_matches('/');
    if trimmed.is_empty() {
        return Some("index.html".into());
    }
    if trimmed.contains('\\') || trimmed.split('/').any(|p| p.is_empty() || p == "." || p == "..")
    {
        return None;
    }
    Some(trimmed.to_string())
}

fn mime_for(path: &str) -> String {
    mime_guess::from_path(path).first_or_octet_stream().to_string()
}

/// 网页内容服务：webcache → 内置资源 → SPA 回退 index.html
fn serve_web(app: &AppHandle, uri_path: &str) -> (Vec<u8>, String, u16) {
    let Some(rel) = sanitize_rel_path(uri_path) else {
        return (b"bad request".to_vec(), "text/plain".into(), 400);
    };
    if let Some(dir) = web_cache_dir(app) {
        let p = dir.join(&rel);
        if p.is_file() {
            if let Ok(bytes) = fs::read(&p) {
                return (bytes, mime_for(&rel), 200);
            }
        }
    }
    let resolver = app.asset_resolver();
    if let Some(asset) = resolver
        .get(format!("/{rel}"))
        .or_else(|| resolver.get(rel.clone()))
    {
        return (asset.bytes, mime_for(&rel), 200);
    }
    if rel != "index.html" {
        return serve_web(app, "/index.html");
    }
    (b"not found".to_vec(), "text/plain".into(), 404)
}

/// 网页更新检查结果（serde camelCase 与前端 TS 类型对齐）
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WebUpdateResult {
    /// "updated" | "upToDate" | "error"
    status: String,
    current: Option<String>,
    remote: Option<String>,
    message: Option<String>,
}

/// 检查 GitHub Pages 上的网页版本；有新版则下载并原子替换网页缓存。
/// 不会中断当前页面——前端在收到 "updated" 后自行决定何时 reload。
#[tauri::command]
async fn download_web_update(app: AppHandle) -> WebUpdateResult {
    let current = active_manifest(&app).map(|m| m.version);
    match try_update(&app, current.clone()).await {
        Ok(r) => r,
        Err(message) => WebUpdateResult {
            status: "error".into(),
            current,
            remote: None,
            message: Some(message),
        },
    }
}

async fn try_update(app: &AppHandle, current: Option<String>) -> Result<WebUpdateResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    // 加时间戳查询参数绕过 CDN 缓存，确保拿到最新清单
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let remote: WebManifest = client
        .get(format!("{PAGES_BASE}version.json?t={ts}"))
        .send()
        .await
        .map_err(|e| format!("网络请求失败：{e}"))?
        .error_for_status()
        .map_err(|e| format!("站点响应异常：{e}"))?
        .json()
        .await
        .map_err(|e| format!("版本清单解析失败：{e}"))?;

    if Some(&remote.version) == current.as_ref() {
        return Ok(WebUpdateResult {
            status: "upToDate".into(),
            current,
            remote: Some(remote.version),
            message: None,
        });
    }

    // 全部下载到 webcache.tmp，最后写 version.json 并原子替换，
    // 任何一步失败都不影响当前生效的内容
    let cache = web_cache_dir(app).ok_or("无法定位应用数据目录")?;
    let tmp = cache.with_extension("tmp");
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;

    for rel in &remote.files {
        if rel.starts_with('/')
            || rel.contains('\\')
            || rel.split('/').any(|p| p.is_empty() || p == "." || p == "..")
        {
            return Err(format!("清单包含非法路径：{rel}"));
        }
        let bytes = client
            .get(format!("{PAGES_BASE}{rel}"))
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| format!("下载 {rel} 失败：{e}"))?
            .bytes()
            .await
            .map_err(|e| format!("下载 {rel} 失败：{e}"))?;
        let target = tmp.join(rel);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&target, &bytes).map_err(|e| e.to_string())?;
    }
    fs::write(
        tmp.join("version.json"),
        serde_json::to_vec_pretty(&remote).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    let _ = fs::remove_dir_all(&cache);
    fs::rename(&tmp, &cache).map_err(|e| format!("替换网页缓存失败：{e}"))?;

    Ok(WebUpdateResult {
        status: "updated".into(),
        current,
        remote: Some(remote.version),
        message: None,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_uri_scheme_protocol("app", |ctx, request| {
            let (body, mime, status) = serve_web(ctx.app_handle(), request.uri().path());
            tauri::http::Response::builder()
                .status(status)
                .header("content-type", mime)
                // 本地磁盘读取零开销；禁用 WebView 缓存保证更新后 reload 即生效
                .header("cache-control", "no-cache")
                .body(body)
                .unwrap_or_else(|_| tauri::http::Response::new(Vec::new()))
        })
        .invoke_handler(tauri::generate_handler![download_web_update])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
