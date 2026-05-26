#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests

WORK_DIR = Path(os.getenv("RUNNER_TEMP", "/tmp")) / "curator-media-processor"
WORK_DIR.mkdir(parents=True, exist_ok=True)
MAX_ASSETS = 10


def main() -> int:
    parser = argparse.ArgumentParser(description="Download external media, stage it in Telegram, and callback the Worker.")
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--item-id", required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--callback-url", required=True)
    parser.add_argument("--media-asset-id", default="")
    parser.add_argument("--expected-kind", default="")
    args = parser.parse_args()

    try:
        validate_env()
        cookie_file = write_cookie_file(args.source_url)
        callback(args.callback_url, {
            "jobId": args.job_id,
            "mediaAssetId": args.media_asset_id or None,
            "status": "processing",
            "raw": {"sourceUrl": args.source_url}
        })

        media_paths = download_media(args.source_url, cookie_file)
        if len(media_paths) == 0:
            message = "No downloadable media was found for this source URL."
            if strict_missing_media():
                raise RuntimeError(message)
            callback(args.callback_url, {
                "jobId": args.job_id,
                "mediaAssetId": args.media_asset_id or None,
                "status": "skipped",
                "errorMessage": message,
                "raw": {"sourceUrl": args.source_url, "reason": "no_media"}
            })
            print(json.dumps({"ok": True, "jobId": args.job_id, "status": "skipped", "reason": message}, ensure_ascii=False))
            return 0

        assets: list[dict[str, Any]] = []
        raw_assets: list[dict[str, Any]] = []
        for index, media_path in enumerate(media_paths[:MAX_ASSETS]):
            try:
                media_type = classify_media(media_path)
                prepared_path = prepare_media_to_limits(media_path, media_type)
                prepared_type = classify_media(prepared_path)
                validate_size(prepared_path, prepared_type)
                thumbnail_path = generate_thumbnail(prepared_path) if prepared_type == "video" else None
                telegram_payload = upload_to_telegram(prepared_path, prepared_type, thumbnail_path, args.source_url)
                if args.media_asset_id and index == 0:
                    telegram_payload["id"] = args.media_asset_id
                assets.append(telegram_payload)
                raw_assets.append({
                    "fileName": prepared_path.name,
                    "mediaType": prepared_type,
                    "sizeBytes": prepared_path.stat().st_size,
                    "thumbnailGenerated": thumbnail_path is not None
                })
            except Exception as asset_error:  # noqa: BLE001
                if strict_missing_media():
                    raise
                print(f"Skipping one media asset: {safe_error(str(asset_error))}", file=sys.stderr)

        if len(assets) == 0:
            message = "Media was detected, but no asset could be prepared under Telegram limits."
            raise RuntimeError(message)

        callback(args.callback_url, {
            "jobId": args.job_id,
            "mediaAssetId": args.media_asset_id or None,
            "status": "ready",
            "assets": assets,
            "raw": {
                "sourceUrl": args.source_url,
                "assetCount": len(assets),
                "assets": raw_assets
            }
        })
        print(json.dumps({"ok": True, "jobId": args.job_id, "assetCount": len(assets)}, ensure_ascii=False))
        return 0
    except Exception as exc:  # noqa: BLE001
        message = safe_error(str(exc))
        try:
            callback(args.callback_url, {
                "jobId": args.job_id,
                "mediaAssetId": args.media_asset_id or None,
                "status": "failed",
                "errorMessage": message,
                "raw": {"sourceUrl": args.source_url}
            })
        except Exception as callback_exc:  # noqa: BLE001
            print(f"Callback failed after media failure: {safe_error(str(callback_exc))}", file=sys.stderr)
        print(json.dumps({"ok": False, "jobId": args.job_id, "error": message}, ensure_ascii=False), file=sys.stderr)
        return 1


def validate_env() -> None:
    missing = [name for name in ["TELEGRAM_BOT_TOKEN", "TELEGRAM_MEDIA_CACHE_CHAT_ID", "WORKER_INTERNAL_API_SECRET"] if not os.getenv(name)]
    if missing:
        raise RuntimeError(f"Missing required secret(s): {', '.join(missing)}")


def strict_missing_media() -> bool:
    return os.getenv("MEDIA_PROCESSING_STRICT", "false").lower() == "true"


def write_cookie_file(source_url: str) -> Path | None:
    host = urlparse(source_url).hostname or ""
    value = None
    name = None
    if "instagram" in host:
        value = os.getenv("INSTAGRAM_COOKIES_B64")
        name = "instagram-cookies.txt"
    elif "x.com" in host or "twitter.com" in host:
        value = os.getenv("X_COOKIES_B64")
        name = "x-cookies.txt"
    if not value or not name:
        return None
    path = WORK_DIR / name
    path.write_bytes(base64.b64decode(value))
    return path


def download_media(source_url: str, cookie_file: Path | None) -> list[Path]:
    direct = try_direct_download(source_url)
    if direct is not None:
        return [direct]
    return download_with_ytdlp(source_url, cookie_file)


def try_direct_download(source_url: str) -> Path | None:
    parsed = urlparse(source_url)
    suffix = Path(parsed.path).suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".mp4", ".m4v", ".mov", ".webm"}:
        return None
    target = WORK_DIR / f"direct{suffix}"
    with requests.get(source_url, stream=True, timeout=(20, 180), headers={"user-agent": "ai-curation-publisher-agent-media/1.0"}) as response:
        response.raise_for_status()
        with target.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=512 * 1024):
                if chunk:
                    handle.write(chunk)
    return target if target.exists() and target.stat().st_size > 0 else None


def download_with_ytdlp(source_url: str, cookie_file: Path | None) -> list[Path]:
    try:
        import yt_dlp  # type: ignore
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("yt-dlp is not available in this runner.") from exc

    output_template = str(WORK_DIR / "download_%(id)s_%(playlist_index)s.%(ext)s")
    options: dict[str, Any] = {
        "outtmpl": output_template,
        "noplaylist": False,
        "playlistend": MAX_ASSETS,
        "quiet": True,
        "no_warnings": True,
        "merge_output_format": "mp4",
        "format": "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bestvideo+bestaudio/best",
        "retries": 3,
        "fragment_retries": 3,
        "socket_timeout": 30,
    }
    if cookie_file is not None:
        options["cookiefile"] = str(cookie_file)
    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            ydl.extract_info(source_url, download=True)
    except Exception as exc:  # noqa: BLE001
        if strict_missing_media():
            raise RuntimeError("yt-dlp could not download media for this source URL.") from exc
        return []

    candidates = sorted(WORK_DIR.glob("download_*.*"), key=lambda path: path.stat().st_size if path.exists() else 0, reverse=True)
    media_files: list[Path] = []
    seen_names: set[str] = set()
    for candidate in candidates:
        suffix = candidate.suffix.lower()
        if not candidate.is_file() or candidate.stat().st_size <= 0 or suffix in {".part", ".json", ".description"}:
            continue
        if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".mp4", ".m4v", ".mov", ".webm", ".gif"}:
            continue
        normalized = normalize_video_container(candidate) if classify_media(candidate) == "video" else candidate
        if normalized.name in seen_names:
            continue
        seen_names.add(normalized.name)
        media_files.append(normalized)
        if len(media_files) >= MAX_ASSETS:
            break
    return media_files


def normalize_video_container(path: Path) -> Path:
    if path.suffix.lower() == ".mp4":
        return path
    target = path.with_suffix(".mp4")
    run(["ffmpeg", "-y", "-i", str(path), "-c", "copy", str(target)], allow_fail=True)
    return target if target.exists() and target.stat().st_size > 0 else path


def classify_media(path: Path) -> str:
    mime_type = mimetypes.guess_type(path.name)[0] or ""
    if mime_type.startswith("image/"):
        return "photo"
    if mime_type.startswith("video/") or path.suffix.lower() in {".mp4", ".m4v", ".mov", ".webm", ".gif"}:
        return "video"
    return "document"


def validate_size(path: Path, media_type: str) -> None:
    size = path.stat().st_size
    limit = media_limit_bytes(media_type)
    if size > limit:
        raise RuntimeError(f"Downloaded {media_type} is too large after processing: {size} bytes, limit {limit} bytes.")


def media_limit_bytes(media_type: str) -> int:
    photo_limit = int(float(os.getenv("MAX_PHOTO_MB", "9")) * 1024 * 1024)
    file_limit = int(float(os.getenv("MAX_FILE_MB", "49")) * 1024 * 1024)
    return photo_limit if media_type == "photo" else file_limit


def prepare_media_to_limits(path: Path, media_type: str) -> Path:
    if path.stat().st_size <= media_limit_bytes(media_type):
        return path
    if media_type == "video":
        return transcode_video_to_limit(path)
    if media_type == "photo":
        return recompress_photo_to_limit(path)
    return path


def transcode_video_to_limit(path: Path) -> Path:
    if shutil.which("ffmpeg") is None:
        return path
    attempts = [(28, 1280), (32, 1280), (34, 960), (36, 854)]
    best = path
    for crf, max_width in attempts:
        target = WORK_DIR / f"compressed_crf{crf}_{max_width}_{path.stem}.mp4"
        vf = f"scale='min({max_width},iw)':-2"
        run(["ffmpeg", "-y", "-i", str(path), "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", str(crf), "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(target)], allow_fail=True)
        if target.exists() and target.stat().st_size > 0:
            best = target
            if target.stat().st_size <= media_limit_bytes("video"):
                return target
    return best


def recompress_photo_to_limit(path: Path) -> Path:
    if shutil.which("ffmpeg") is None:
        return path
    target = WORK_DIR / f"compressed_photo_{path.stem}.jpg"
    run(["ffmpeg", "-y", "-i", str(path), "-vf", "scale='min(1600,iw)':-2", "-q:v", "5", str(target)], allow_fail=True)
    return target if target.exists() and target.stat().st_size > 0 else path


def generate_thumbnail(video_path: Path) -> Path | None:
    if shutil.which("ffmpeg") is None:
        return None
    thumb = video_path.with_suffix(".jpg")
    run(["ffmpeg", "-y", "-ss", "00:00:01", "-i", str(video_path), "-vframes", "1", "-vf", "scale='min(320,iw)':-2", "-q:v", "4", str(thumb)], allow_fail=True)
    if thumb.exists() and 0 < thumb.stat().st_size <= 200 * 1024:
        return thumb
    return None


def upload_to_telegram(path: Path, media_type: str, thumbnail_path: Path | None, source_url: str) -> dict[str, Any]:
    token = os.environ["TELEGRAM_BOT_TOKEN"]
    chat_id = os.environ["TELEGRAM_MEDIA_CACHE_CHAT_ID"]
    thread_id = os.getenv("TELEGRAM_MEDIA_CACHE_THREAD_ID")
    method = "sendPhoto" if media_type == "photo" else "sendVideo" if media_type == "video" else "sendDocument"
    field_name = "photo" if media_type == "photo" else "video" if media_type == "video" else "document"
    data: dict[str, Any] = {"chat_id": chat_id, "disable_notification": "true"}
    if thread_id:
        data["message_thread_id"] = thread_id
    files: dict[str, Any] = {field_name: (path.name, path.open("rb"), mimetypes.guess_type(path.name)[0] or "application/octet-stream")}
    if media_type == "video":
        data["supports_streaming"] = "true"
    if thumbnail_path is not None and media_type == "video":
        files["thumbnail"] = (thumbnail_path.name, thumbnail_path.open("rb"), "image/jpeg")
    try:
        response = requests.post(f"https://api.telegram.org/bot{token}/{method}", data=data, files=files, timeout=(20, 240))
        payload = response.json()
    finally:
        for handle_tuple in files.values():
            handle_tuple[1].close()
    if not response.ok or payload.get("ok") is not True:
        raise RuntimeError("Telegram staging upload failed.")
    message = payload.get("result") or {}
    telegram_media = message.get("photo")[-1] if media_type == "photo" and message.get("photo") else message.get("video") if media_type == "video" else message.get("document")
    if not isinstance(telegram_media, dict) or not telegram_media.get("file_id"):
        raise RuntimeError("Telegram upload response did not include a reusable file_id.")
    return {
        "kind": media_type,
        "telegramFileType": media_type if media_type != "photo" else "photo",
        "telegramFileId": telegram_media.get("file_id"),
        "telegramFileUniqueId": telegram_media.get("file_unique_id"),
        "telegramMimeType": telegram_media.get("mime_type") or mimetypes.guess_type(path.name)[0],
        "telegramFileSize": telegram_media.get("file_size") or path.stat().st_size,
        "sizeBytes": path.stat().st_size,
        "mimeType": telegram_media.get("mime_type") or mimetypes.guess_type(path.name)[0],
        "width": telegram_media.get("width"),
        "height": telegram_media.get("height"),
        "durationSeconds": telegram_media.get("duration"),
        "sourceUrl": source_url
    }


def callback(callback_url: str, payload: dict[str, Any]) -> None:
    response = requests.post(callback_url, json=payload, headers={"x-internal-api-secret": os.environ["WORKER_INTERNAL_API_SECRET"]}, timeout=(20, 90))
    if not response.ok:
        raise RuntimeError(f"Worker callback failed with HTTP {response.status_code}.")


def run(command: list[str], allow_fail: bool = False) -> None:
    completed = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False)
    if completed.returncode != 0 and not allow_fail:
        raise RuntimeError(completed.stderr[-500:] or f"Command failed: {' '.join(command)}")


def safe_error(value: str) -> str:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    if token:
        value = value.replace(token, "[redacted-token]")
    return value[:500]


if __name__ == "__main__":
    raise SystemExit(main())
