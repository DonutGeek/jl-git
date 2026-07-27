use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::AppError;

const MAX_PDF_BYTES: u64 = 20 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractPdfTextInput {
    /// 临时目录下的 PDF 绝对路径（由前端写入后传入，解析后由前端删除）
    pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractPdfTextResult {
    pub text: String,
}

/// 从临时 PDF 抽取可选中文本（无 OCR）。CPU 密集，放 blocking 线程，避免卡住 UI。
#[tauri::command]
pub async fn document_extract_pdf_text(
    input: ExtractPdfTextInput,
) -> Result<ExtractPdfTextResult, AppError> {
    let path = validate_temp_pdf_path(&input.path)?;
    let path_for_job = path.clone();

    tauri::async_runtime::spawn_blocking(move || extract_pdf_text_blocking(&path_for_job))
        .await
        .map_err(|error| AppError::new("INTERNAL", format!("PDF 解析任务失败：{error}")))?
}

fn extract_pdf_text_blocking(path: &Path) -> Result<ExtractPdfTextResult, AppError> {
    let meta = std::fs::metadata(path).map_err(|_| {
        AppError::new("NOT_FOUND", "找不到临时 PDF 文件")
    })?;
    if !meta.is_file() {
        return Err(AppError::new("VALIDATION", "路径不是文件"));
    }
    if meta.len() > MAX_PDF_BYTES {
        return Err(AppError::new("VALIDATION", "文件过大（上限 20MB）"));
    }
    if meta.len() == 0 {
        return Err(AppError::new("VALIDATION", "PDF 文件为空"));
    }

    let data = std::fs::read(path).map_err(|_| {
        AppError::new("INTERNAL", "读取临时 PDF 失败")
    })?;
    if !looks_like_pdf(&data) {
        return Err(AppError::new("VALIDATION", "不是有效的 PDF 文件"));
    }

    let text = pdf_extract::extract_text_from_mem(&data).map_err(|error| {
        AppError::new("INTERNAL", format!("无法解析 PDF：{error}"))
    })?;

    Ok(ExtractPdfTextResult { text })
}

fn validate_temp_pdf_path(raw: &str) -> Result<PathBuf, AppError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::new("VALIDATION", "PDF 路径为空"));
    }

    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err(AppError::new("VALIDATION", "PDF 路径必须为绝对路径"));
    }

    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");
    if !file_name.starts_with("jlgit-pdf-") || !file_name.to_ascii_lowercase().ends_with(".pdf") {
        return Err(AppError::new(
            "VALIDATION",
            "仅允许解析应用写入的临时 PDF",
        ));
    }

    let temp_root = std::env::temp_dir()
        .canonicalize()
        .map_err(|_| AppError::new("INTERNAL", "无法解析系统临时目录"))?;
    let canonical = path
        .canonicalize()
        .map_err(|_| AppError::new("NOT_FOUND", "找不到临时 PDF 文件"))?;
    if !canonical.starts_with(&temp_root) {
        return Err(AppError::new(
            "VALIDATION",
            "PDF 路径必须位于系统临时目录",
        ));
    }

    Ok(canonical)
}

fn looks_like_pdf(data: &[u8]) -> bool {
    let head = data.len().min(1024);
    data[..head]
        .windows(5)
        .any(|window| window == b"%PDF-")
}
