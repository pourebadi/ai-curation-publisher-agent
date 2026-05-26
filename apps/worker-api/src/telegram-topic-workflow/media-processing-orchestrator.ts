import { MediaAssetsRepository, MediaProcessingJobsRepository, type CreateMediaAssetInput, type MediaProcessingJobRecord } from "@curator/db";
import type { Env } from "../types";

export type MediaProcessingDispatchResult = {
  enabled: boolean;
  createdJobs: MediaProcessingJobRecord[];
  dispatchedJobs: string[];
  warnings: string[];
};

type EnvWithMediaProcessing = Env & {
  MEDIA_PROCESSING_MODE?: string;
  GITHUB_MEDIA_WORKFLOW_ENABLED?: string;
  GITHUB_MEDIA_WORKFLOW_DISPATCH_ENABLED?: string;
  GITHUB_MEDIA_REPO?: string;
  GITHUB_MEDIA_WORKFLOW_ID?: string;
  GITHUB_MEDIA_WORKFLOW_REF?: string;
  GITHUB_TOKEN?: string;
  WORKER_PUBLIC_BASE_URL?: string;
  GITHUB_MEDIA_PROCESSOR_ENABLED?: string;
  GITHUB_MEDIA_PROCESSOR_REPOSITORY?: string;
  GITHUB_MEDIA_PROCESSOR_WORKFLOW_ID?: string;
  GITHUB_MEDIA_PROCESSOR_REF?: string;
  GITHUB_MEDIA_PROCESSOR_TOKEN?: string;
  MEDIA_PROCESSOR_GH_TOKEN?: string;
  GITHUB_MEDIA_PROCESSOR_CALLBACK_URL?: string;
  INTERNAL_API_SECRET?: string;
  TELEGRAM_MEDIA_CACHE_CHAT_ID?: string;
  TELEGRAM_MEDIA_CACHE_THREAD_ID?: string;
  TELEGRAM_MEDIA_STAGING_CHAT_ID?: string;
  TELEGRAM_MEDIA_STAGING_THREAD_ID?: string;
  TELEGRAM_MEDIA_MAX_PHOTO_MB?: string;
  TELEGRAM_MEDIA_MAX_FILE_MB?: string;
  MEDIA_PROCESSING_STRICT?: string;
  GITHUB_MEDIA_PROCESSOR_STRICT?: string;
};

export type CompleteMediaProcessingJobInput = {
  jobId: string;
  status: "processing" | "ready" | "failed" | "skipped";
  errorMessage?: string;
  assets?: Array<{
    id?: string;
    kind?: string;
    telegramFileId?: string;
    telegramFileUniqueId?: string;
    telegramMediaGroupId?: string;
    telegramFileType?: string;
    telegramMimeType?: string;
    telegramFileSize?: number;
    sourceUrl?: string;
    mimeType?: string;
    sizeBytes?: number;
    width?: number;
    height?: number;
    durationSeconds?: number;
    thumbnailTelegramFileId?: string;
  }>;
  raw?: Record<string, unknown>;
};

export async function maybeDispatchExternalMediaProcessing(input: {
  env: Env;
  itemId: string;
  sourceUrls: string[];
  requestedBy?: string;
  fetchImpl?: typeof fetch;
}): Promise<MediaProcessingDispatchResult> {
  const env = input.env as EnvWithMediaProcessing;
  const enabled = env.MEDIA_PROCESSING_MODE === "github_actions" || env.GITHUB_MEDIA_WORKFLOW_ENABLED === "true" || env.GITHUB_MEDIA_PROCESSOR_ENABLED === "true";
  const warnings: string[] = [];
  const createdJobs: MediaProcessingJobRecord[] = [];
  const dispatchedJobs: string[] = [];
  if (!enabled) {
    return { enabled: false, createdJobs, dispatchedJobs, warnings };
  }

  const urls = mediaCandidateUrls(input.sourceUrls).slice(0, 3);
  if (urls.length === 0) {
    return { enabled: true, createdJobs, dispatchedJobs, warnings };
  }

  const jobsRepository = new MediaProcessingJobsRepository(input.env.DB);
  for (const sourceUrl of urls) {
    const jobInput: Parameters<MediaProcessingJobsRepository["create"]>[0] = { itemId: input.itemId, sourceUrl };
    if (input.requestedBy !== undefined) jobInput.requestedBy = input.requestedBy;
    const job = await jobsRepository.create(jobInput);
    createdJobs.push(job);
    await jobsRepository.markDispatching(job.id);

    try {
      const dispatch = await dispatchGithubMediaWorkflow({
        env,
        job,
        fetchImpl: input.fetchImpl ?? safeFetch
      });

      if (dispatch.ok) {
        dispatchedJobs.push(job.id);
        await jobsRepository.markDispatched(job.id, dispatch.workflowRunId);
      } else {
        warnings.push(dispatch.warning);
        await jobsRepository.markFailed(job.id, dispatch.warning, { sourceUrl });
      }
    } catch (error) {
      const warning = `GitHub media workflow dispatch crashed for job ${job.id}: ${describeDispatchError(error)}`;
      warnings.push(warning);
      await jobsRepository.markFailed(job.id, warning, { sourceUrl });
    }
  }

  return { enabled: true, createdJobs, dispatchedJobs, warnings };
}

export async function dispatchExistingMediaProcessingJob(env: Env, jobId: string): Promise<{
  ok: boolean;
  jobId: string;
  status: string;
  message: string;
}> {
  const jobsRepository = new MediaProcessingJobsRepository(env.DB);
  const job = await jobsRepository.findById(jobId);

  if (!job) {
    return { ok: false, jobId, status: "missing", message: "Media processing job was not found." };
  }

  await jobsRepository.markDispatching(job.id);

  try {
    const dispatch = await dispatchGithubMediaWorkflow({
      env: env as EnvWithMediaProcessing,
      job,
      fetchImpl: safeFetch
    });

    if (dispatch.ok) {
      await jobsRepository.markDispatched(job.id, dispatch.workflowRunId);
      return { ok: true, jobId: job.id, status: "dispatched", message: "Media processing job dispatched." };
    }

    await jobsRepository.markFailed(job.id, dispatch.warning, { sourceUrl: job.sourceUrl });
    return { ok: false, jobId: job.id, status: "failed", message: dispatch.warning };
  } catch (error) {
    const message = `GitHub media workflow dispatch crashed for job ${job.id}: ${describeDispatchError(error)}`;
    await jobsRepository.markFailed(job.id, message, { sourceUrl: job.sourceUrl });
    return { ok: false, jobId: job.id, status: "failed", message };
  }
}

export async function completeMediaProcessingJob(env: Env, body: CompleteMediaProcessingJobInput): Promise<{
  ok: boolean;
  jobId: string;
  status: string;
  storedAssetCount: number;
  message: string;
}> {
  const jobsRepository = new MediaProcessingJobsRepository(env.DB);
  const mediaAssetsRepository = new MediaAssetsRepository(env.DB);
  const job = await jobsRepository.findById(body.jobId);
  if (!job) {
    return { ok: false, jobId: body.jobId, status: "missing", storedAssetCount: 0, message: "Media processing job was not found." };
  }

  if (body.status !== "ready") {
    const message = safeError(body.errorMessage ?? `Media processing ${body.status}.`);
    if (body.status === "skipped") {
      await jobsRepository.markSkipped(job.id, message, body.raw ?? {});
    } else {
      await jobsRepository.markFailed(job.id, message, body.raw ?? {});
    }
    return { ok: body.status === "skipped", jobId: job.id, status: body.status, storedAssetCount: 0, message };
  }

  const assets = normalizeCallbackAssets(job, body.assets ?? []);
  if (assets.length === 0) {
    const message = "Media processor returned no Telegram file IDs.";
    await jobsRepository.markFailed(job.id, message, body.raw ?? {});
    return { ok: false, jobId: job.id, status: "failed", storedAssetCount: 0, message };
  }

  await mediaAssetsRepository.createMany(assets);
  await jobsRepository.markReady(job.id, { storedAssetCount: assets.length, ...(body.raw ?? {}) });
  return { ok: true, jobId: job.id, status: "ready", storedAssetCount: assets.length, message: "Media processing result stored." };
}

const safeFetch: typeof fetch = (request, init) => fetch(request, init);

function describeDispatchError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return `${error.name}: ${error.message}`.slice(0, 500);
  return "Unknown dispatch error.";
}

async function dispatchGithubMediaWorkflow(input: { env: EnvWithMediaProcessing; job: MediaProcessingJobRecord; fetchImpl: typeof fetch }): Promise<{ ok: true; workflowRunId?: string } | { ok: false; warning: string }> {
  const dispatchEnabled = input.env.GITHUB_MEDIA_WORKFLOW_DISPATCH_ENABLED === "true" || input.env.GITHUB_MEDIA_PROCESSOR_ENABLED === "true";
  if (!dispatchEnabled) {
    return { ok: false, warning: `Media job ${input.job.id} was created but GitHub workflow dispatch is disabled.` };
  }
  const repo = input.env.GITHUB_MEDIA_REPO?.trim() || input.env.GITHUB_MEDIA_PROCESSOR_REPOSITORY?.trim();
  const workflowId = input.env.GITHUB_MEDIA_WORKFLOW_ID?.trim() || input.env.GITHUB_MEDIA_PROCESSOR_WORKFLOW_ID?.trim() || "media-processor.yml";
  const token = input.env.MEDIA_PROCESSOR_GH_TOKEN?.trim()
    || input.env.GITHUB_MEDIA_PROCESSOR_TOKEN?.trim()
    || input.env.GITHUB_TOKEN?.trim();
  const stagingChatId = input.env.TELEGRAM_MEDIA_STAGING_CHAT_ID?.trim() || input.env.TELEGRAM_MEDIA_CACHE_CHAT_ID?.trim();
  const stagingThreadId = input.env.TELEGRAM_MEDIA_STAGING_THREAD_ID?.trim() || input.env.TELEGRAM_MEDIA_CACHE_THREAD_ID?.trim();
  const callbackBaseUrl = input.env.WORKER_PUBLIC_BASE_URL?.trim();
  const legacyCallback = input.env.GITHUB_MEDIA_PROCESSOR_CALLBACK_URL?.trim();
  const normalizedLegacyCallback = legacyCallback?.replace(/\/internal\/media\/processed$/, "/internal/media/processing/callback");
  const callbackUrl = normalizedLegacyCallback && normalizedLegacyCallback.includes("/internal/media/processing/callback")
    ? normalizedLegacyCallback
    : `${(callbackBaseUrl ?? normalizedLegacyCallback ?? "").replace(/\/$/, "")}/internal/media/processing/callback`;
  if (!repo || !token || !callbackUrl.startsWith("http") || !stagingChatId) {
    return { ok: false, warning: `Media job ${input.job.id} was created but GitHub media workflow config is incomplete.` };
  }
  const response = await input.fetchImpl(`https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(workflowId)}/dispatches`, {
    method: "POST",
    headers: {
      "accept": "application/vnd.github+json",
      "authorization": `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "ai-curation-publisher-agent-media-dispatcher"
    },
    body: JSON.stringify({
      ref: input.env.GITHUB_MEDIA_WORKFLOW_REF?.trim() || input.env.GITHUB_MEDIA_PROCESSOR_REF?.trim() || "main",
      inputs: {
        job_id: input.job.id,
        item_id: input.job.itemId,
        source_url: input.job.sourceUrl,
        ...(input.job.mediaAssetId === undefined ? {} : { media_asset_id: input.job.mediaAssetId }),
        kind: input.job.kind,
        callback_url: callbackUrl,
        telegram_staging_chat_id: stagingChatId,
        ...(stagingThreadId === undefined ? {} : { telegram_staging_thread_id: stagingThreadId }),
        max_photo_mb: input.env.TELEGRAM_MEDIA_MAX_PHOTO_MB ?? "9",
        max_file_mb: input.env.TELEGRAM_MEDIA_MAX_FILE_MB ?? "49",
        strict_missing_media: input.env.GITHUB_MEDIA_PROCESSOR_STRICT ?? input.env.MEDIA_PROCESSING_STRICT ?? "false"
      }
    })
  });
  if (!response.ok) {
    const detail = await safeReadResponseText(response);
    return {
      ok: false,
      warning: detail.length > 0
        ? `GitHub media workflow dispatch failed for job ${input.job.id}: HTTP ${response.status} ${response.statusText}: ${detail}`
        : `GitHub media workflow dispatch failed for job ${input.job.id}: HTTP ${response.status} ${response.statusText}.`
    };
  }
  return { ok: true };
}

async function safeReadResponseText(response: Response): Promise<string> {
  try {
    return (await response.text()).replace(/\s+/g, " ").trim().slice(0, 800);
  } catch {
    return "";
  }
}

function normalizeCallbackAssets(job: MediaProcessingJobRecord, assets: NonNullable<CompleteMediaProcessingJobInput["assets"]>): CreateMediaAssetInput[] {
  const normalized: CreateMediaAssetInput[] = [];
  assets.forEach((asset, index) => {
    const telegramFileId = typeof asset.telegramFileId === "string" ? asset.telegramFileId.trim() : "";
    if (!telegramFileId) return;
    const telegramFileType = normalizeTelegramFileType(asset.telegramFileType ?? asset.kind);
    const kind = telegramFileType === "photo" ? "image" : telegramFileType === "video" || telegramFileType === "animation" ? "video" : "link_preview";
    normalized.push({
      id: asset.id ?? (index === 0 && job.mediaAssetId ? job.mediaAssetId : `media_job_${stableHash(`${job.id}:${index}:${telegramFileId}`)}`),
      itemId: job.itemId,
      kind,
      status: "ready",
      sourceUrl: asset.sourceUrl ?? job.sourceUrl,
      canonicalUrl: job.sourceUrl,
      ...(asset.mimeType === undefined ? {} : { mimeType: asset.mimeType }),
      ...(asset.sizeBytes === undefined ? {} : { sizeBytes: asset.sizeBytes }),
      ...(asset.width === undefined ? {} : { width: asset.width }),
      ...(asset.height === undefined ? {} : { height: asset.height }),
      ...(asset.durationSeconds === undefined ? {} : { durationSeconds: asset.durationSeconds }),
      telegramFileId,
      ...(asset.telegramFileUniqueId === undefined ? {} : { telegramFileUniqueId: asset.telegramFileUniqueId }),
      ...(asset.telegramMediaGroupId === undefined ? {} : { telegramMediaGroupId: asset.telegramMediaGroupId }),
      telegramFileType,
      ...(asset.telegramMimeType === undefined ? {} : { telegramMimeType: asset.telegramMimeType }),
      ...(asset.telegramFileSize === undefined ? {} : { telegramFileSize: asset.telegramFileSize })
    });
  });
  return normalized;
}

function normalizeTelegramFileType(value: string | undefined): "photo" | "video" | "animation" | "document" {
  if (value === "photo" || value === "image") return "photo";
  if (value === "video") return "video";
  if (value === "animation") return "animation";
  return "document";
}

function mediaCandidateUrls(urls: string[]): string[] {
  return uniqueHttpUrls(urls).filter((url) => isLikelyExternalMediaSource(url));
}

function isLikelyExternalMediaSource(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.toLowerCase();
    if (/\.(jpg|jpeg|png|webp|gif|mp4|m4v|mov|webm)(\?.*)?$/.test(path)) return true;
    return host === "x.com"
      || host.endsWith(".x.com")
      || host === "twitter.com"
      || host.endsWith(".twitter.com")
      || host === "instagram.com"
      || host.endsWith(".instagram.com")
      || host === "tiktok.com"
      || host.endsWith(".tiktok.com")
      || host === "youtube.com"
      || host.endsWith(".youtube.com")
      || host === "youtu.be";
  } catch {
    return false;
  }
}

function uniqueHttpUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of urls) {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function safeError(value: string): string {
  return value.replace(/[0-9]{6,}:[A-Za-z0-9_-]+/g, "[redacted-token]").slice(0, 500);
}

function stableHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
