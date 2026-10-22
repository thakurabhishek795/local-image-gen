"""
main.py - FastAPI application endpoints, dynamic routing, and lifecycle events.
"""

import argparse
import logging
import os
import socket
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, BackgroundTasks, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.config import MODEL_CATALOG, settings
from app.generator import engine
from app.hardware import get_memory_info, detect_device

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("server")

# -----------------------------------------------------------------------------
# Request & Response Schemas
# -----------------------------------------------------------------------------
class SwitchModelRequest(BaseModel):
    model_key: str = Field(..., description="Key of the model to load from MODEL_CATALOG")


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000, description="Text prompt for image generation")
    negative_prompt: Optional[str] = Field(default="", max_length=2000, description="Negative prompt")
    width: Optional[int] = Field(default=None, ge=128, le=2048, description="Image width (must be multiple of 8)")
    height: Optional[int] = Field(default=None, ge=128, le=2048, description="Image height (must be multiple of 8)")
    num_inference_steps: Optional[int] = Field(default=None, ge=1, le=100, description="Denoising steps")
    guidance_scale: Optional[float] = Field(default=None, ge=0.0, le=30.0, description="Classifier-free guidance")
    seed: Optional[int] = Field(default=-1, description="Random seed (-1 for random)")


class GenerateVideoRequest(BaseModel):
    image_filename: str = Field(..., description="Filename of source image in outputs folder")
    num_frames: Optional[int] = Field(default=14, ge=8, le=30, description="Number of video frames (14 or 25)")
    fps: Optional[int] = Field(default=7, ge=4, le=30, description="Frames per second")
    motion_bucket_id: Optional[int] = Field(default=127, ge=1, le=255, description="Motion intensity (1-255)")
    noise_aug_strength: Optional[float] = Field(default=0.02, ge=0.0, le=1.0, description="Noise augmentation amount")
    seed: Optional[int] = Field(default=-1, description="Random seed")


# -----------------------------------------------------------------------------
# Application Lifespan
# -----------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle startup and shutdown logic."""
    # Ensure output directory exists
    settings.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Check for CLI argument --model
    selected_model = settings.DEFAULT_MODEL_KEY
    for i, arg in enumerate(sys.argv):
        if arg in ("--model", "-m") and i + 1 < len(sys.argv):
            selected_model = sys.argv[i + 1].strip().lower()

    if selected_model not in MODEL_CATALOG:
        logger.warning(
            f"Configured model '{selected_model}' not recognized. Falling back to 'sd15'."
        )
        selected_model = "sd15"

    logger.info("=" * 60)
    logger.info(f"⚡ Local Image Generation Web Service Starting Up")
    logger.info(f"Target initial model: {selected_model}")
    detected_dev = detect_device(settings.DEVICE)
    logger.info(f"Active backend device: {detected_dev}")
    logger.info(f"Output directory: {settings.OUTPUT_DIR}")
    logger.info("=" * 60)

    # Load initial model on server start
    try:
        await engine.switch_model(selected_model)
    except Exception as e:
        logger.error(f"Failed to preload model '{selected_model}': {e}. Server will continue running.")

    yield

    # Shutdown: clean up weights and GPU cache
    logger.info("Shutting down image generation service. Clearing GPU memory...")
    engine.unload()


# -----------------------------------------------------------------------------
# FastAPI App Initialization
# -----------------------------------------------------------------------------
app = FastAPI(
    title="Local Image Generation Web Service",
    description="Hardware-aware, model-agnostic local diffusion server with dynamic swapping and Tailscale access.",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for local and Tailscale access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
# API Endpoints
# -----------------------------------------------------------------------------
@app.get("/api/v1/health")
async def health_check():
    """
    Returns system status, active hardware device (CUDA/MPS/CPU),
    VRAM & RAM usage metrics, and currently loaded model info.
    """
    engine_status = engine.get_status()
    device = engine_status["device"]
    mem_info = get_memory_info(device)

    active_meta = None
    if engine_status["current_model_key"]:
        active_meta = MODEL_CATALOG.get(engine_status["current_model_key"])

    return {
        "status": "healthy",
        "device": device,
        "device_name": mem_info.get("device_name", "Unknown"),
        "platform": mem_info.get("platform"),
        "vram": mem_info.get("vram"),
        "ram": mem_info.get("ram"),
        "engine": engine_status,
        "active_model": active_meta,
    }


@app.get("/api/v1/network")
async def get_network_info():
    """
    Returns detected network addresses (Tailscale IP, LAN Wi-Fi IP, and URLs)
    for easy remote access configuration and mobile pairing.
    """
    tailscale_ip = None
    local_ip = None
    hostname = socket.gethostname()

    try:
        import psutil
        addrs = psutil.net_if_addrs()
        for iface, addr_list in addrs.items():
            for addr in addr_list:
                if addr.family == socket.AF_INET:
                    ip = addr.address
                    if ip.startswith("127.") or ip.startswith("169.254."):
                        continue
                    if "tailscale" in iface.lower() or ip.startswith("100."):
                        tailscale_ip = ip
                    elif not local_ip:
                        local_ip = ip
    except Exception as e:
        logger.debug(f"Network discovery error: {e}")

    # Fallback for local IP
    if not local_ip:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
        except Exception:
            local_ip = "127.0.0.1"

    port = settings.PORT
    return {
        "hostname": hostname,
        "tailscale_ip": tailscale_ip,
        "tailscale_url": f"http://{tailscale_ip}:{port}" if tailscale_ip else None,
        "local_ip": local_ip,
        "local_url": f"http://{local_ip}:{port}" if local_ip else f"http://localhost:{port}",
        "port": port,
    }


@app.get("/api/v1/models")
async def list_models():
    """
    List all pre-configured model profiles with hardware recommendations,
    default parameters, and resolution presets.
    """
    return {
        "current_model": engine.current_model_key,
        "is_loading": engine.is_loading,
        "models": MODEL_CATALOG,
    }


@app.post("/api/v1/switch-model")
async def switch_model(payload: SwitchModelRequest):
    """
    Dynamically unload the currently loaded model and load a new model
    without restarting the server.
    """
    key = payload.model_key.lower().strip()
    if key not in MODEL_CATALOG:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid model key '{key}'. Available models: {list(MODEL_CATALOG.keys())}",
        )

    if engine.is_loading:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A model is currently loading. Please wait before switching again.",
        )

    try:
        result = await engine.switch_model(key)
        return result
    except Exception as err:
        logger.error(f"Error during model switch to '{key}': {err}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to switch model to '{key}': {str(err)}",
        )


@app.post("/api/v1/generate")
async def generate_image(request: GenerateRequest):
    """
    Generate an image based on the provided prompt and parameters.
    """
    if engine.pipeline is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No model is currently loaded. Please call /api/v1/switch-model or wait for startup to finish.",
        )

    if engine.is_loading:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Model is currently reloading. Please retry shortly.",
        )

    # Resolve default parameters from active model if not specified
    model_meta = MODEL_CATALOG[engine.current_model_key]
    width = request.width or model_meta["default_width"]
    height = request.height or model_meta["default_height"]
    num_steps = request.num_inference_steps or model_meta["default_steps"]
    guidance = request.guidance_scale if request.guidance_scale is not None else model_meta["default_guidance_scale"]

    # Ensure dimensions are multiples of 8 (required by VAE)
    width = (width // 8) * 8
    height = (height // 8) * 8

    try:
        result = await engine.generate(
            prompt=request.prompt,
            negative_prompt=request.negative_prompt,
            width=width,
            height=height,
            num_inference_steps=num_steps,
            guidance_scale=guidance,
            seed=request.seed if request.seed is not None else -1,
        )
        return result
    except RuntimeError as r_err:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(r_err))
    except Exception as ex:
        logger.error(f"Generation error: {ex}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Image generation failed: {str(ex)}",
        )


@app.post("/api/v1/generate-video")
async def generate_video(request: GenerateVideoRequest):
    """
    Animate a source image into an MP4 video using Stable Video Diffusion (SVD).
    """
    if engine.is_loading:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Model is currently loading/switching. Please retry shortly.",
        )

    try:
        result = await engine.generate_video(
            image_input=request.image_filename,
            num_frames=request.num_frames or settings.SVD_DEFAULT_FRAMES,
            fps=request.fps or settings.SVD_DEFAULT_FPS,
            motion_bucket_id=request.motion_bucket_id or settings.SVD_DEFAULT_MOTION_BUCKET_ID,
            noise_aug_strength=request.noise_aug_strength or settings.SVD_DEFAULT_NOISE_AUG,
            seed=request.seed if request.seed is not None else -1,
        )
        return result
    except FileNotFoundError as fnf:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(fnf))
    except RuntimeError as r_err:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(r_err))
    except Exception as ex:
        logger.error(f"Video generation error: {ex}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Video animation failed: {str(ex)}",
        )


@app.get("/api/v1/images")
async def list_recent_images(limit: int = 36):
    """
    Lists recently generated images and videos stored in the output directory.
    """
    output_dir = settings.OUTPUT_DIR
    if not output_dir.exists():
        return {"images": []}

    files = sorted(
        [f for f in output_dir.iterdir() if f.suffix.lower() in (".png", ".jpg", ".webp", ".mp4")],
        key=lambda f: f.stat().st_mtime,
        reverse=True,
    )

    items = []
    for f in files[:limit]:
        is_video = f.suffix.lower() == ".mp4"
        items.append({
            "filename": f.name,
            "url": f"/outputs/{f.name}",
            "media_type": "video" if is_video else "image",
            "created_at": f.stat().st_mtime,
            "size_kb": round(f.stat().st_size / 1024, 1),
        })

    return {"images": items}


# -----------------------------------------------------------------------------
# Static Files & Frontend Mounts
# -----------------------------------------------------------------------------
STATIC_DIR = Path(__file__).parent / "static"
OUTPUTS_DIR = settings.OUTPUT_DIR

app.mount("/outputs", StaticFiles(directory=str(OUTPUTS_DIR)), name="outputs")

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
async def root():
    """Serves the main web UI."""
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return JSONResponse(
        {
            "message": "Local Image Generation API is running.",
            "docs": "/docs",
            "health": "/api/v1/health",
        }
    )


# -----------------------------------------------------------------------------
# Direct Execution Support
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser(description="Run Local Image Generation Web Service")
    parser.add_argument("--model", "-m", type=str, default=settings.DEFAULT_MODEL_KEY, help="Model profile to load")
    parser.add_argument("--host", type=str, default=settings.HOST, help="Host network interface (default 0.0.0.0)")
    parser.add_argument("--port", "-p", type=int, default=settings.PORT, help="Port to bind (default 7860)")
    args, unknown = parser.parse_known_args()

    # Pass model to settings
    settings.DEFAULT_MODEL_KEY = args.model

    uvicorn.run("app.main:app", host=args.host, port=args.port, reload=False)
