/**
 * script.js - Frontend controller for Local Diffusion Studio.
 * Handles dynamic model switching, hardware stats polling, image generation,
 * and Stable Video Diffusion (SVD) Image-to-Video generation.
 */

// Global State
let modelCatalog = {};
let activeModelKey = null;
let isGenerating = false;
let isGeneratingVideo = false;
let isSwitchingModel = false;
let elapsedTimerInterval = null;
let videoTimerInterval = null;
let lastGenerationData = null;
let currentMode = "image"; // "image" | "video"
let selectedVideoFrames = 14;
let activeSourceImageFilename = null;
let activeSourceImageUrl = null;

// DOM Elements
const elements = {
  // Navigation & Stats
  deviceDot: document.getElementById("device-dot"),
  deviceText: document.getElementById("device-text"),
  vramText: document.getElementById("vram-text"),

  // Studio Mode Tabs & Panels
  tabImageMode: document.getElementById("tab-image-mode"),
  tabVideoMode: document.getElementById("tab-video-mode"),
  imageControlsPanel: document.querySelector(".controls-panel:not(#video-controls-panel)"),
  videoControlsPanel: document.getElementById("video-controls-panel"),

  // Model Selector
  modelSelect: document.getElementById("model-select"),
  switchModelBtn: document.getElementById("switch-model-btn"),
  modelTierBadge: document.getElementById("model-tier-badge"),
  modelDesc: document.getElementById("model-description"),

  // Image Inputs
  promptInput: document.getElementById("prompt-input"),
  promptCount: document.getElementById("prompt-count"),
  negPromptGroup: document.getElementById("negative-prompt-group"),
  negPromptInput: document.getElementById("negative-prompt-input"),
  negPromptTag: document.getElementById("negative-prompt-tag"),

  // Presets & Dimensions
  resPresetsContainer: document.getElementById("resolution-presets"),
  customWidth: document.getElementById("custom-width"),
  customHeight: document.getElementById("custom-height"),

  // Sliders
  stepsSlider: document.getElementById("steps-slider"),
  stepsVal: document.getElementById("steps-val"),
  guidanceSlider: document.getElementById("guidance-slider"),
  guidanceVal: document.getElementById("guidance-val"),
  seedInput: document.getElementById("seed-input"),
  diceBtn: document.getElementById("dice-btn"),
  randomizeSeedBtn: document.getElementById("randomize-seed-btn"),

  // Image Action
  generateBtn: document.getElementById("generate-btn"),
  generateBtnText: document.getElementById("generate-btn-text"),
  generateSpinner: document.getElementById("generate-spinner"),
  statusDot: document.getElementById("status-dot"),
  statusMessage: document.getElementById("status-message"),
  timerText: document.getElementById("timer-text"),

  // Video Inputs & Controls
  sourceImageThumb: document.getElementById("source-image-thumb"),
  noSourceImageMsg: document.getElementById("no-source-image-msg"),
  selectedSourceFilename: document.getElementById("selected-source-filename"),
  sourceImageStatus: document.getElementById("source-image-status"),
  motionSlider: document.getElementById("motion-slider"),
  motionVal: document.getElementById("motion-val"),
  fpsSlider: document.getElementById("fps-slider"),
  fpsVal: document.getElementById("fps-val"),
  noiseAugSlider: document.getElementById("noise-aug-slider"),
  noiseAugVal: document.getElementById("noise-aug-val"),
  videoFramesGroup: document.getElementById("video-frames-group"),

  // Video Action
  generateVideoBtn: document.getElementById("generate-video-btn"),
  generateVideoBtnText: document.getElementById("generate-video-btn-text"),
  videoSpinner: document.getElementById("video-spinner"),
  videoStatusDot: document.getElementById("video-status-dot"),
  videoStatusMessage: document.getElementById("video-status-message"),
  videoTimerText: document.getElementById("video-timer-text"),

  // Stage & Preview
  imageStage: document.getElementById("image-stage"),
  placeholderState: document.getElementById("placeholder-state"),
  loadingState: document.getElementById("loading-state"),
  loadingTitle: document.getElementById("loading-title"),
  loadingDetail: document.getElementById("loading-detail"),
  elapsedCounter: document.getElementById("elapsed-counter"),
  mainPreviewImg: document.getElementById("main-preview-img"),
  mainPreviewVideo: document.getElementById("main-preview-video"),
  previewActions: document.getElementById("preview-actions"),
  animateToVideoBtn: document.getElementById("animate-to-video-btn"),
  downloadBtn: document.getElementById("download-btn"),
  downloadVideoBtn: document.getElementById("download-video-btn"),
  copyParamsBtn: document.getElementById("copy-params-btn"),

  // Metadata Strip
  metaStrip: document.getElementById("meta-strip"),
  metaModel: document.getElementById("meta-model"),
  metaRes: document.getElementById("meta-res"),
  metaSteps: document.getElementById("meta-steps"),
  metaCfg: document.getElementById("meta-cfg"),
  metaSeed: document.getElementById("meta-seed"),
  metaTime: document.getElementById("meta-time"),

  // Gallery
  galleryGrid: document.getElementById("gallery-grid"),
  galleryCount: document.getElementById("gallery-count"),
  toastContainer: document.getElementById("toast-container"),

  // Remote Access Modal
  remotePill: document.getElementById("remote-pill"),
  remoteText: document.getElementById("remote-text"),
  remoteModal: document.getElementById("remote-modal"),
  closeRemoteModal: document.getElementById("close-remote-modal"),
  modalTailscaleUrl: document.getElementById("modal-tailscale-url"),
  modalLanUrl: document.getElementById("modal-lan-url"),
  copyTailscaleBtn: document.getElementById("copy-tailscale-btn"),
  copyLanBtn: document.getElementById("copy-lan-btn"),
};

// ============================================================================
// Initialization
// ============================================================================
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  fetchModels();
  fetchHealth();
  fetchNetworkInfo();
  fetchRecentImages();

  // Poll hardware status every 6 seconds
  setInterval(fetchHealth, 6000);
});

// ============================================================================
// Event Listeners
// ============================================================================
function setupEventListeners() {
  // Mode switcher tabs
  elements.tabImageMode.addEventListener("click", () => switchMode("image"));
  elements.tabVideoMode.addEventListener("click", () => switchMode("video"));

  // Prompt input length counter
  elements.promptInput.addEventListener("input", () => {
    elements.promptCount.textContent = `${elements.promptInput.value.length} chars`;
  });

  // Image sliders synchronization
  elements.stepsSlider.addEventListener("input", (e) => {
    elements.stepsVal.textContent = e.target.value;
  });

  elements.guidanceSlider.addEventListener("input", (e) => {
    elements.guidanceVal.textContent = Number(e.target.value).toFixed(1);
  });

  // Seed buttons
  elements.diceBtn.addEventListener("click", () => {
    elements.seedInput.value = -1;
  });
  elements.randomizeSeedBtn.addEventListener("click", () => {
    elements.seedInput.value = -1;
  });

  // Model switch
  elements.switchModelBtn.addEventListener("click", handleModelSwitch);
  elements.modelSelect.addEventListener("change", () => {
    const selectedKey = elements.modelSelect.value;
    if (selectedKey !== activeModelKey) {
      elements.switchModelBtn.classList.add("btn-primary");
      elements.switchModelBtn.classList.remove("btn-secondary");
    } else {
      elements.switchModelBtn.classList.remove("btn-primary");
      elements.switchModelBtn.classList.add("btn-secondary");
    }
  });

  // Request notification permission if supported
  if ("Notification" in window && Notification.permission === "default") {
    elements.generateBtn.addEventListener("click", () => {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }, { once: true });
  }

  // Generate Image
  elements.generateBtn.addEventListener("click", handleGenerate);

  // Animate into Video shortcut from canvas
  elements.animateToVideoBtn.addEventListener("click", () => {
    if (activeSourceImageFilename) {
      setVideoSource(activeSourceImageFilename, activeSourceImageUrl);
      switchMode("video");
      showToast("Source image loaded into Video Studio! Adjust motion and click Animate.", "info");
    } else {
      showToast("Please generate or select an image first.", "error");
    }
  });

  // Video slider synchronization
  elements.motionSlider.addEventListener("input", (e) => {
    elements.motionVal.textContent = e.target.value;
  });

  elements.fpsSlider.addEventListener("input", (e) => {
    elements.fpsVal.textContent = e.target.value;
  });

  elements.noiseAugSlider.addEventListener("input", (e) => {
    elements.noiseAugVal.textContent = Number(e.target.value).toFixed(2);
  });

  // Video frame count selector pills
  if (elements.videoFramesGroup) {
    const framePills = elements.videoFramesGroup.querySelectorAll(".preset-pill");
    framePills.forEach((pill) => {
      pill.addEventListener("click", () => {
        framePills.forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        selectedVideoFrames = parseInt(pill.getAttribute("data-frames"), 10) || 14;
      });
    });
  }

  // Generate Video
  elements.generateVideoBtn.addEventListener("click", handleGenerateVideo);

  // Copy parameters
  elements.copyParamsBtn.addEventListener("click", copyGenerationParams);

  // Remote Access Modal listeners
  elements.remotePill.addEventListener("click", () => {
    elements.remoteModal.style.display = "flex";
  });
  elements.closeRemoteModal.addEventListener("click", () => {
    elements.remoteModal.style.display = "none";
  });
  elements.remoteModal.addEventListener("click", (e) => {
    if (e.target === elements.remoteModal) {
      elements.remoteModal.style.display = "none";
    }
  });

  elements.copyTailscaleBtn.addEventListener("click", () => {
    const url = elements.modalTailscaleUrl.value;
    if (url && !url.includes("not detected")) {
      navigator.clipboard.writeText(url).then(() => {
        showToast("Tailscale URL copied! Open this on any Tailnet device.", "success");
      });
    }
  });

  elements.copyLanBtn.addEventListener("click", () => {
    const url = elements.modalLanUrl.value;
    if (url) {
      navigator.clipboard.writeText(url).then(() => {
        showToast("Home Wi-Fi URL copied! Open on any device on your Wi-Fi.", "success");
      });
    }
  });
}

async function fetchNetworkInfo() {
  try {
    const res = await fetch("/api/v1/network");
    if (!res.ok) return;
    const data = await res.json();

    if (data.tailscale_url) {
      elements.modalTailscaleUrl.value = data.tailscale_url;
      elements.remoteText.textContent = "Tailscale: " + data.tailscale_ip;
    } else {
      elements.modalTailscaleUrl.value = "Tailscale not detected on server";
    }

    if (data.local_url) {
      elements.modalLanUrl.value = data.local_url;
      if (!data.tailscale_url) {
        elements.remoteText.textContent = "Wi-Fi: " + data.local_ip;
      }
    }
  } catch (e) {
    // Silent fail
  }
}

// ============================================================================
// Mode Switching (Image Studio vs. Video Studio)
// ============================================================================
function switchMode(mode) {
  currentMode = mode;
  if (mode === "video") {
    elements.tabVideoMode.classList.add("active");
    elements.tabImageMode.classList.remove("active");
    elements.imageControlsPanel.style.display = "none";
    elements.videoControlsPanel.style.display = "block";
  } else {
    elements.tabImageMode.classList.add("active");
    elements.tabVideoMode.classList.remove("active");
    elements.videoControlsPanel.style.display = "none";
    elements.imageControlsPanel.style.display = "block";
  }
}

function setVideoSource(filename, url) {
  activeSourceImageFilename = filename;
  activeSourceImageUrl = url;
  elements.selectedSourceFilename.value = filename;
  elements.sourceImageThumb.src = url;
  elements.sourceImageThumb.style.display = "block";
  elements.noSourceImageMsg.style.display = "none";
  elements.sourceImageStatus.textContent = filename.length > 20 ? filename.slice(0, 18) + "..." : filename;
}

// ============================================================================
// API Calls: Models & Health
// ============================================================================
async function fetchModels() {
  try {
    const res = await fetch("/api/v1/models");
    if (!res.ok) throw new Error("Failed to load models");
    const data = await res.json();

    modelCatalog = data.models || {};
    activeModelKey = data.current_model;

    // Populate dropdown
    elements.modelSelect.innerHTML = "";
    Object.keys(modelCatalog).forEach((key) => {
      const m = modelCatalog[key];
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = `${m.name} (${m.min_vram_gb}GB+ VRAM)`;
      if (key === activeModelKey) opt.selected = true;
      elements.modelSelect.appendChild(opt);
    });

    if (activeModelKey && modelCatalog[activeModelKey]) {
      applyModelPresets(activeModelKey);
    }
  } catch (err) {
    showToast(`Error loading models: ${err.message}`, "error");
  }
}

async function fetchHealth() {
  try {
    const res = await fetch("/api/v1/health");
    if (!res.ok) return;
    const data = await res.json();

    const device = data.device || "cpu";
    elements.deviceDot.className = `stat-dot ${device}`;
    const devName = data.device_name || device.toUpperCase();
    elements.deviceText.textContent = devName;

    if (data.vram && data.vram.total_gb) {
      const used = data.vram.allocated_gb || data.vram.used_gb || 0;
      const total = data.vram.total_gb;
      const pct = Math.round((used / total) * 100);
      elements.vramText.textContent = `${used} / ${total} GB (${pct}%)`;
    } else {
      elements.vramText.textContent = `RAM: ${data.ram.used_gb} / ${data.ram.total_gb} GB`;
    }

    if (data.engine && data.engine.current_model_key && data.engine.current_model_key !== activeModelKey) {
      activeModelKey = data.engine.current_model_key;
      elements.modelSelect.value = activeModelKey;
      applyModelPresets(activeModelKey);
    }
  } catch (e) {
    // Silent fail for polling errors
  }
}

function applyModelPresets(modelKey) {
  const model = modelCatalog[modelKey];
  if (!model) return;

  // Update info badges & description
  elements.modelTierBadge.textContent = model.tier || `${model.min_vram_gb}GB VRAM`;
  elements.modelDesc.innerHTML = `<strong>${model.name}</strong> &bull; ${model.description}`;

  // Sliders default values
  elements.stepsSlider.value = model.default_steps;
  elements.stepsVal.textContent = model.default_steps;

  elements.guidanceSlider.value = model.default_guidance_scale;
  elements.guidanceVal.textContent = Number(model.default_guidance_scale).toFixed(1);

  // Negative prompt support check
  if (model.supports_negative_prompt === false) {
    elements.negPromptInput.disabled = true;
    elements.negPromptInput.value = "";
    elements.negPromptTag.textContent = "Not used by this architecture";
    elements.negPromptGroup.style.opacity = "0.5";
  } else {
    elements.negPromptInput.disabled = false;
    elements.negPromptTag.textContent = "Avoids artifacts";
    elements.negPromptGroup.style.opacity = "1.0";
  }

  // Populate resolution presets
  elements.resPresetsContainer.innerHTML = "";
  const resolutions = model.resolutions || [
    { label: "1:1 (512x512)", width: 512, height: 512 }
  ];

  resolutions.forEach((res, idx) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = `preset-pill ${idx === 0 ? "active" : ""}`;
    pill.textContent = res.label;
    pill.addEventListener("click", () => {
      document.querySelectorAll(".preset-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      elements.customWidth.value = res.width;
      elements.customHeight.value = res.height;
    });
    elements.resPresetsContainer.appendChild(pill);
  });

  // Set default dimensions
  elements.customWidth.value = model.default_width || 512;
  elements.customHeight.value = model.default_height || 512;
}

// ============================================================================
// Model Switching
// ============================================================================
async function handleModelSwitch() {
  const targetKey = elements.modelSelect.value;
  if (!targetKey || isSwitchingModel || isGenerating || isGeneratingVideo) return;

  isSwitchingModel = true;
  setStatus("busy", `Loading model '${targetKey}' (may take a moment to initialize)...`);
  elements.switchModelBtn.disabled = true;
  elements.generateBtn.disabled = true;

  try {
    const res = await fetch("/api/v1/switch-model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_key: targetKey }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Model switch failed");

    activeModelKey = targetKey;
    applyModelPresets(activeModelKey);
    setStatus("ready", `Active: ${data.model_name} (switched in ${data.switch_time_seconds}s)`);
    showToast(`Loaded ${data.model_name} successfully!`, "success");
    elements.switchModelBtn.classList.remove("btn-primary");
    elements.switchModelBtn.classList.add("btn-secondary");
  } catch (err) {
    setStatus("error", `Switch failed: ${err.message}`);
    showToast(err.message, "error");
  } finally {
    isSwitchingModel = false;
    elements.switchModelBtn.disabled = false;
    elements.generateBtn.disabled = false;
    fetchHealth();
  }
}

// ============================================================================
// Image Generation
// ============================================================================
async function handleGenerate() {
  const prompt = elements.promptInput.value.trim();
  if (!prompt) {
    showToast("Please enter a text prompt to generate.", "error");
    elements.promptInput.focus();
    return;
  }

  if (isGenerating || isGeneratingVideo || isSwitchingModel) return;

  isGenerating = true;
  elements.generateBtn.disabled = true;
  elements.generateSpinner.style.display = "inline-block";
  elements.generateBtnText.textContent = "Synthesizing...";
  setStatus("busy", "Inference running on backend...");

  // Show loading canvas state
  elements.placeholderState.style.display = "none";
  elements.mainPreviewImg.style.display = "none";
  elements.mainPreviewVideo.style.display = "none";
  elements.mainPreviewVideo.pause();
  elements.loadingState.style.display = "block";
  elements.loadingTitle.textContent = "Synthesizing Pixels...";
  elements.loadingDetail.textContent = "Running diffusion denoising steps on GPU";
  elements.previewActions.style.display = "none";
  elements.metaStrip.style.display = "none";

  const startTime = Date.now();
  elements.elapsedCounter.textContent = "0.0s";
  elapsedTimerInterval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    elements.elapsedCounter.textContent = `${elapsed}s`;
    elements.timerText.textContent = `${elapsed}s`;
  }, 100);

  const payload = {
    prompt: prompt,
    negative_prompt: elements.negPromptInput.value.trim(),
    width: parseInt(elements.customWidth.value, 10),
    height: parseInt(elements.customHeight.value, 10),
    num_inference_steps: parseInt(elements.stepsSlider.value, 10),
    guidance_scale: parseFloat(elements.guidanceSlider.value),
    seed: parseInt(elements.seedInput.value, 10),
  };

  try {
    const res = await fetch("/api/v1/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Image generation failed");

    lastGenerationData = data;
    displayGeneratedImage(data);
    setVideoSource(data.filename, data.url);
    addToGallery(data);
    notifyCompletion(data, "image");
    setStatus("ready", `Generated in ${data.generation_time_seconds}s (Seed: ${data.seed})`);
    showToast("Image synthesized successfully!", "success");
  } catch (err) {
    setStatus("error", `Generation failed: ${err.message}`);
    showToast(err.message, "error");
    elements.loadingState.style.display = "none";
    if (lastGenerationData) {
      elements.mainPreviewImg.style.display = "block";
      elements.previewActions.style.display = "flex";
      elements.metaStrip.style.display = "flex";
    } else {
      elements.placeholderState.style.display = "block";
    }
  } finally {
    clearInterval(elapsedTimerInterval);
    isGenerating = false;
    elements.generateBtn.disabled = false;
    elements.generateSpinner.style.display = "none";
    elements.generateBtnText.textContent = "✨ Generate Image";
    fetchHealth();
  }
}

function displayGeneratedImage(data) {
  elements.loadingState.style.display = "none";
  elements.placeholderState.style.display = "none";

  // Hide video, show image
  elements.mainPreviewVideo.style.display = "none";
  elements.mainPreviewVideo.pause();
  elements.mainPreviewImg.src = data.url;
  elements.mainPreviewImg.style.display = "block";

  // Actions
  elements.downloadBtn.href = data.url;
  elements.downloadBtn.download = data.filename || `diffusion_${data.seed}.png`;
  elements.downloadBtn.style.display = "inline-flex";
  elements.downloadVideoBtn.style.display = "none";
  elements.animateToVideoBtn.style.display = "inline-flex";
  elements.previewActions.style.display = "flex";

  // Metadata strip
  elements.metaModel.textContent = data.model_name || data.model_key;
  elements.metaRes.textContent = `${data.width}x${data.height}`;
  elements.metaSteps.textContent = data.num_inference_steps;
  elements.metaCfg.textContent = data.guidance_scale;
  elements.metaSeed.textContent = data.seed;
  elements.metaTime.textContent = `${data.generation_time_seconds}s`;
  elements.metaStrip.style.display = "flex";
}

// ============================================================================
// Video Generation (Stable Video Diffusion)
// ============================================================================
async function handleGenerateVideo() {
  const sourceFilename = elements.selectedSourceFilename.value || activeSourceImageFilename;
  if (!sourceFilename) {
    showToast("Please generate or select a source image from the gallery first.", "error");
    return;
  }

  if (isGenerating || isGeneratingVideo || isSwitchingModel) return;

  isGeneratingVideo = true;
  elements.generateVideoBtn.disabled = true;
  elements.videoSpinner.style.display = "inline-block";
  elements.generateVideoBtnText.textContent = "Animating...";
  setVideoStatus("busy", "Generating video frames on RTX 4070...");

  // Show loading state in canvas
  elements.placeholderState.style.display = "none";
  elements.mainPreviewImg.style.display = "none";
  elements.mainPreviewVideo.style.display = "none";
  elements.mainPreviewVideo.pause();
  elements.loadingState.style.display = "block";
  elements.loadingTitle.textContent = "Synthesizing 3D Motion Video...";
  elements.loadingDetail.textContent = `Rendering ${selectedVideoFrames} frames with Stable Video Diffusion XT`;
  elements.previewActions.style.display = "none";
  elements.metaStrip.style.display = "none";

  const startTime = Date.now();
  elements.elapsedCounter.textContent = "0.0s";
  videoTimerInterval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    elements.elapsedCounter.textContent = `${elapsed}s`;
    elements.videoTimerText.textContent = `${elapsed}s`;
  }, 100);

  const payload = {
    image_filename: sourceFilename,
    num_frames: selectedVideoFrames,
    fps: parseInt(elements.fpsSlider.value, 10),
    motion_bucket_id: parseInt(elements.motionSlider.value, 10),
    noise_aug_strength: parseFloat(elements.noiseAugSlider.value),
    seed: -1,
  };

  try {
    const res = await fetch("/api/v1/generate-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Video animation failed");

    displayGeneratedVideo(data);
    addToGallery({
      url: data.video_url,
      filename: data.filename,
      media_type: "video",
    });
    notifyCompletion(data, "video");
    setVideoStatus("ready", `Animated in ${data.generation_time_seconds}s (${data.num_frames} frames @ ${data.fps}fps)`);
    showToast("MP4 video generated successfully!", "success");
  } catch (err) {
    setVideoStatus("error", `Animation failed: ${err.message}`);
    showToast(err.message, "error");
    elements.loadingState.style.display = "none";
    if (activeSourceImageUrl) {
      elements.mainPreviewImg.style.display = "block";
      elements.previewActions.style.display = "flex";
    } else {
      elements.placeholderState.style.display = "block";
    }
  } finally {
    clearInterval(videoTimerInterval);
    isGeneratingVideo = false;
    elements.generateVideoBtn.disabled = false;
    elements.videoSpinner.style.display = "none";
    elements.generateVideoBtnText.textContent = "🎬 Animate Image to MP4";
    fetchHealth();
  }
}

function displayGeneratedVideo(data) {
  elements.loadingState.style.display = "none";
  elements.placeholderState.style.display = "none";

  // Hide image, show video
  elements.mainPreviewImg.style.display = "none";
  elements.mainPreviewVideo.src = data.video_url;
  elements.mainPreviewVideo.style.display = "block";
  elements.mainPreviewVideo.play().catch(() => {});

  // Actions
  elements.downloadVideoBtn.href = data.video_url;
  elements.downloadVideoBtn.download = data.filename || `animated_video.mp4`;
  elements.downloadVideoBtn.style.display = "inline-flex";
  elements.downloadBtn.style.display = "none";
  elements.animateToVideoBtn.style.display = "none";
  elements.previewActions.style.display = "flex";

  // Metadata strip
  elements.metaModel.textContent = "SVD-XT (Video)";
  elements.metaRes.textContent = `${data.num_frames} frames @ ${data.fps}fps`;
  elements.metaSteps.textContent = `Motion: ${data.motion_bucket_id}`;
  elements.metaCfg.textContent = "--";
  elements.metaSeed.textContent = data.seed;
  elements.metaTime.textContent = `${data.generation_time_seconds}s`;
  elements.metaStrip.style.display = "flex";
}

// ============================================================================
// Gallery & History
// ============================================================================
async function fetchRecentImages() {
  try {
    const res = await fetch("/api/v1/images");
    if (!res.ok) return;
    const data = await res.json();
    const items = data.images || [];

    elements.galleryGrid.innerHTML = "";
    items.forEach((item) => {
      createGalleryItem(item.url, item.filename, item.media_type);
    });
    elements.galleryCount.textContent = `${items.length} items`;

    // Set first image as default source if none selected
    const firstImg = items.find((i) => i.media_type !== "video" && i.filename.endsWith(".png"));
    if (firstImg && !activeSourceImageFilename) {
      setVideoSource(firstImg.filename, firstImg.url);
    }
  } catch (e) {
    // Ignore gallery fetch error on clean startup
  }
}

function addToGallery(data) {
  createGalleryItem(data.url, data.filename, data.media_type, true);
  const currentCount = elements.galleryGrid.children.length;
  elements.galleryCount.textContent = `${currentCount} items`;
}

function createGalleryItem(url, filename, mediaType = "image", prepend = false) {
  const isVideo = mediaType === "video" || filename.endsWith(".mp4");
  const thumb = document.createElement("div");
  thumb.className = `gallery-thumb ${isVideo ? "is-video" : ""}`;
  thumb.title = `Click to preview: ${filename}`;

  if (isVideo) {
    const videoThumb = document.createElement("video");
    videoThumb.src = url;
    videoThumb.muted = true;
    videoThumb.playsInline = true;
    videoThumb.preload = "metadata";
    thumb.appendChild(videoThumb);
  } else {
    const img = document.createElement("img");
    img.src = url;
    img.loading = "lazy";
    thumb.appendChild(img);
  }

  thumb.addEventListener("click", () => {
    elements.loadingState.style.display = "none";
    elements.placeholderState.style.display = "none";

    if (isVideo) {
      elements.mainPreviewImg.style.display = "none";
      elements.mainPreviewVideo.src = url;
      elements.mainPreviewVideo.style.display = "block";
      elements.mainPreviewVideo.play().catch(() => {});
      elements.downloadVideoBtn.href = url;
      elements.downloadVideoBtn.download = filename;
      elements.downloadVideoBtn.style.display = "inline-flex";
      elements.downloadBtn.style.display = "none";
      elements.animateToVideoBtn.style.display = "none";
      elements.previewActions.style.display = "flex";
    } else {
      elements.mainPreviewVideo.style.display = "none";
      elements.mainPreviewVideo.pause();
      elements.mainPreviewImg.src = url;
      elements.mainPreviewImg.style.display = "block";
      elements.downloadBtn.href = url;
      elements.downloadBtn.download = filename;
      elements.downloadBtn.style.display = "inline-flex";
      elements.downloadVideoBtn.style.display = "none";
      elements.animateToVideoBtn.style.display = "inline-flex";
      elements.previewActions.style.display = "flex";

      // Set as active source for video generation
      setVideoSource(filename, url);
    }
  });

  if (prepend && elements.galleryGrid.firstChild) {
    elements.galleryGrid.insertBefore(thumb, elements.galleryGrid.firstChild);
  } else {
    elements.galleryGrid.appendChild(thumb);
  }
}

// ============================================================================
// Utilities
// ============================================================================
function setStatus(type, message) {
  elements.statusDot.className = `status-indicator ${type}`;
  elements.statusMessage.textContent = message;
}

function setVideoStatus(type, message) {
  elements.videoStatusDot.className = `status-indicator ${type}`;
  elements.videoStatusMessage.textContent = message;
}

function notifyCompletion(data, type = "image") {
  playAudioChime();

  const originalTitle = document.title;
  const label = type === "video" ? "🎬 Video Ready!" : "✨ Image Ready!";
  document.title = `${label} - Local Diffusion Studio`;
  setTimeout(() => {
    document.title = originalTitle;
  }, 6000);

  if ("Notification" in window && Notification.permission === "granted") {
    const title = type === "video" ? "🎬 Video Generation Complete!" : "🎨 Image Generation Complete!";
    const body = type === "video"
      ? `Rendered ${data.num_frames} frames in ${data.generation_time_seconds}s!`
      : `Generated in ${data.generation_time_seconds}s (${data.width}x${data.height}) using ${data.model_name || data.model_key}`;

    new Notification(title, {
      body: body,
      icon: type === "video" ? undefined : data.url,
    });
  }
}

function playAudioChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 chord
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.value = freq;

      const startTime = ctx.currentTime + idx * 0.08;
      const duration = 0.35;

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.12, startTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    });
  } catch (e) {
    // Graceful fallback if audio autoplay restricted
  }
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${type === "error" ? "❌" : "✅"}</span> <span>${message}</span>`;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 250);
  }, 4500);
}

function copyGenerationParams() {
  if (!lastGenerationData) return;
  const d = lastGenerationData;
  const text = `Model: ${d.model_name} (${d.model_key})\nPrompt: ${d.prompt}\nNegative Prompt: ${d.negative_prompt}\nDimensions: ${d.width}x${d.height}\nSteps: ${d.num_inference_steps}\nCFG Scale: ${d.guidance_scale}\nSeed: ${d.seed}\nGeneration Time: ${d.generation_time_seconds}s`;
  navigator.clipboard.writeText(text).then(() => {
    showToast("Parameters copied to clipboard!", "success");
  });
}
