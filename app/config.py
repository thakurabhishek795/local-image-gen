"""
config.py - Model configuration matrix, hardware profiles, and runtime settings.
"""

import os
from pathlib import Path
from typing import Dict, Any, List
from dotenv import load_dotenv

# Load .env file from project root if present
ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

# -----------------------------------------------------------------------------
# Pre-configured Model Profiles Matrix
# -----------------------------------------------------------------------------
MODEL_CATALOG: Dict[str, Dict[str, Any]] = {
    "sd15": {
        "id": "sd15",
        "name": "Stable Diffusion v1.5",
        "repo_id": "runwayml/stable-diffusion-v1-5",
        "family": "sd",
        "tier": "Lightweight / Low VRAM",
        "min_vram_gb": 4,
        "recommended_vram_gb": 6,
        "description": "Fast and lightweight base model. Ideal for low-VRAM GPUs (4GB) and rapid prototyping.",
        "default_width": 512,
        "default_height": 512,
        "default_steps": 25,
        "default_guidance_scale": 7.5,
        "supports_negative_prompt": True,
        "resolutions": [
            {"label": "1:1 Square (512x512)", "width": 512, "height": 512},
            {"label": "4:3 Standard (640x480)", "width": 640, "height": 480},
            {"label": "3:4 Portrait (480x640)", "width": 480, "height": 640},
            {"label": "16:9 Landscape (768x432)", "width": 768, "height": 432},
            {"label": "9:16 Story (432x768)", "width": 432, "height": 768},
        ],
    },
    "sdxl_turbo": {
        "id": "sdxl_turbo",
        "name": "SDXL Turbo",
        "repo_id": "stabilityai/sdxl-turbo",
        "family": "sdxl",
        "tier": "Fast Single-Step Inference",
        "min_vram_gb": 6,
        "recommended_vram_gb": 8,
        "description": "Real-time distilled SDXL model. Generates photorealistic images in 1-4 steps with CFG 0.0.",
        "default_width": 512,
        "default_height": 512,
        "default_steps": 1,
        "default_guidance_scale": 0.0,
        "supports_negative_prompt": False,
        "resolutions": [
            {"label": "1:1 Square (512x512)", "width": 512, "height": 512},
            {"label": "1:1 HD Square (768x768)", "width": 768, "height": 768},
            {"label": "1:1 Ultra (1024x1024)", "width": 1024, "height": 1024},
            {"label": "16:9 Landscape (768x432)", "width": 768, "height": 432},
        ],
    },
    "sdxl": {
        "id": "sdxl",
        "name": "Stable Diffusion XL Base 1.0",
        "repo_id": "stabilityai/stable-diffusion-xl-base-1.0",
        "family": "sdxl",
        "tier": "High Quality / Mid-High VRAM",
        "min_vram_gb": 8,
        "recommended_vram_gb": 12,
        "description": "Flagship 1024x1024 diffusion model with superb aesthetics, prompt adherence, and detail.",
        "default_width": 1024,
        "default_height": 1024,
        "default_steps": 30,
        "default_guidance_scale": 7.0,
        "supports_negative_prompt": True,
        "resolutions": [
            {"label": "1:1 Square (1024x1024)", "width": 1024, "height": 1024},
            {"label": "4:3 Standard (1152x896)", "width": 1152, "height": 896},
            {"label": "3:4 Portrait (896x1152)", "width": 896, "height": 1152},
            {"label": "16:9 Landscape (1344x768)", "width": 1344, "height": 768},
            {"label": "9:16 Mobile (768x1344)", "width": 768, "height": 1344},
            {"label": "21:9 Cinematic (1536x640)", "width": 1536, "height": 640},
        ],
    },
    "flux_schnell": {
        "id": "flux_schnell",
        "name": "FLUX.1 [schnell]",
        "repo_id": "black-forest-labs/FLUX.1-schnell",
        "family": "flux",
        "tier": "Next-Gen Quality / High VRAM",
        "min_vram_gb": 12,
        "recommended_vram_gb": 16,
        "description": "State-of-the-art 12B rectified flow transformer. 4-step generation with unmatched typography and composition.",
        "default_width": 1024,
        "default_height": 1024,
        "default_steps": 4,
        "default_guidance_scale": 0.0,
        "supports_negative_prompt": False,
        "resolutions": [
            {"label": "1:1 Square (1024x1024)", "width": 1024, "height": 1024},
            {"label": "4:3 Standard (1152x896)", "width": 1152, "height": 896},
            {"label": "3:4 Portrait (896x1152)", "width": 896, "height": 1152},
            {"label": "16:9 Landscape (1344x768)", "width": 1344, "height": 768},
            {"label": "9:16 Mobile (768x1344)", "width": 768, "height": 1344},
        ],
    },
}

# -----------------------------------------------------------------------------
# Runtime Settings & Environment Options
# -----------------------------------------------------------------------------
class Settings:
    # Server network
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "7860"))

    # Active model
    DEFAULT_MODEL_KEY: str = os.getenv("MODEL_KEY", "sd15").strip().lower()

    # Hardware & precision overrides
    DEVICE: str = os.getenv("DEVICE", "auto").strip().lower()
    TORCH_DTYPE: str = os.getenv("TORCH_DTYPE", "auto").strip().lower()

    # Memory safeguards
    # Options for offload: 'auto', 'none', 'model', 'sequential'
    ENABLE_CPU_OFFLOAD: str = os.getenv("ENABLE_CPU_OFFLOAD", "auto").strip().lower()
    ENABLE_ATTENTION_SLICING: bool = os.getenv("ENABLE_ATTENTION_SLICING", "true").lower() in ("1", "true", "yes")
    ENABLE_VAE_SLICING: bool = os.getenv("ENABLE_VAE_SLICING", "true").lower() in ("1", "true", "yes")
    ENABLE_VAE_TILING: bool = os.getenv("ENABLE_VAE_TILING", "false").lower() in ("1", "true", "yes")

    # Storage
    OUTPUT_DIR: Path = ROOT_DIR / os.getenv("OUTPUT_DIR", "app/outputs")

    # Optional Hugging Face Token for gated / private models
    HF_TOKEN: str = os.getenv("HF_TOKEN", "").strip() or None

    # Video generation (Stable Video Diffusion)
    SVD_REPO_ID: str = os.getenv("SVD_REPO_ID", "stabilityai/stable-video-diffusion-img2vid-xt")
    SVD_DEFAULT_FRAMES: int = int(os.getenv("SVD_DEFAULT_FRAMES", "14"))
    SVD_DEFAULT_FPS: int = int(os.getenv("SVD_DEFAULT_FPS", "7"))
    SVD_DEFAULT_MOTION_BUCKET_ID: int = int(os.getenv("SVD_DEFAULT_MOTION_BUCKET_ID", "127"))
    SVD_DEFAULT_NOISE_AUG: float = float(os.getenv("SVD_DEFAULT_NOISE_AUG", "0.02"))


settings = Settings()
settings.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
