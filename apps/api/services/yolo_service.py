"""
MedXrayChat Backend - YOLO Detection Service
"""
import hashlib
import time
from io import BytesIO
from typing import List, Optional, Tuple
from pathlib import Path
import numpy as np
from PIL import Image
from loguru import logger
import torch
import cv2

from schemas import Detection, BoundingBox
from core.config import settings

# Simple in-memory cache for heatmaps (keyed by image hash)
_heatmap_cache: dict[str, bytes] = {}
_HEATMAP_CACHE_MAX_SIZE = 50  # Max number of cached heatmaps


# Class names from VinDR-CXR dataset
VINDR_CLASSES = [
    "Aortic enlargement",
    "Atelectasis", 
    "Calcification",
    "Cardiomegaly",
    "Clavicle fracture",
    "Consolidation",
    "Edema",
    "Emphysema",
    "Enlarged PA",
    "ILD",
    "Infiltration",
    "Lung Opacity",
    "Lung cavity",
    "Lung cyst",
    "Mediastinal shift",
    "Nodule/Mass",
    "Pleural effusion",
    "Pleural thickening",
    "Pneumothorax",
    "Pulmonary fibrosis",
    "Rib fracture",
    "Other lesion",
]


class YOLOService:
    """Service for YOLOv11 object detection on chest X-rays."""

    def __init__(self, model_path: Optional[str] = None):
        """Initialize YOLO service.

        Args:
            model_path: Path to YOLO model weights. If None, uses default from settings.
        """
        self.model_path = model_path or settings.YOLO_MODEL_PATH
        self.model = None
        self.device = self._get_device()
        self._load_model()

    def _get_device(self) -> str:
        """Detect and return the optimal device for inference."""
        device_setting = settings.AI_DEVICE

        if device_setting == "auto":
            try:
                import torch
                if torch.cuda.is_available():
                    return "cuda:0"
                logger.info("CUDA not available, using CPU for YOLO")
                return "cpu"
            except ImportError:
                return "cpu"

        # Check if specified CUDA device is available
        if device_setting.startswith("cuda"):
            try:
                import torch
                if not torch.cuda.is_available():
                    logger.warning(f"CUDA not available, falling back to CPU")
                    return "cpu"
            except ImportError:
                return "cpu"

        return device_setting
    
    def _load_model(self) -> None:
        """Load YOLO model."""
        try:
            from ultralytics import YOLO
            
            model_file = Path(self.model_path)
            weights_dir = model_file.parent
            fallback_model = weights_dir / "yolo11l.pt"
            
            if not model_file.exists():
                logger.warning(f"YOLO model not found at {self.model_path}")
                # Use fallback in same directory
                if fallback_model.exists():
                    logger.info(f"Using fallback model: {fallback_model}")
                    self.model = YOLO(str(fallback_model))
                else:
                    logger.warning(f"Downloading yolo11l.pt to {fallback_model}")
                    self.model = YOLO("yolo11l.pt")
                    # Note: ultralytics downloads to ~/.cache/ultralytics or current dir
            else:
                try:
                    logger.info(f"Loading YOLO model from {self.model_path}")
                    self.model = YOLO(str(model_file))
                except Exception as load_err:
                    logger.error(f"Failed to load custom model: {load_err}")
                    logger.warning("Falling back to pretrained yolo11l.pt - this won't detect medical findings accurately!")
                    logger.warning("Please train a proper VinDR-CXR model using Finetune/yolo/scripts/")
                    if fallback_model.exists():
                        self.model = YOLO(str(fallback_model))
                    else:
                        self.model = YOLO("yolo11l.pt")
            
            # Warmup
            logger.info("Warming up YOLO model...")
            dummy = np.zeros((640, 640, 3), dtype=np.uint8)
            self.model.predict(dummy, verbose=False)
            logger.info(f"YOLO model loaded and ready - {len(self.model.names)} classes")
            
        except Exception as e:
            logger.error(f"Failed to load YOLO model: {e}")
            self.model = None
    
    def detect(
        self,
        image: Image.Image | np.ndarray | str,
        conf_threshold: float = 0.25,
        iou_threshold: float = 0.45,
        img_size: int = 1024,
    ) -> tuple[List[Detection], int]:
        """Run object detection on an image.
        
        Args:
            image: PIL Image, numpy array, or path to image file
            conf_threshold: Confidence threshold for detections
            iou_threshold: IoU threshold for NMS
            img_size: Image size for inference
            
        Returns:
            Tuple of (list of Detection objects, processing time in ms)
        """
        if self.model is None:
            logger.error("YOLO model not loaded")
            return [], 0
        
        start_time = time.time()
        
        try:
            # Run inference
            results = self.model.predict(
                source=image,
                conf=conf_threshold,
                iou=iou_threshold,
                imgsz=img_size,
                device=self.device,
                verbose=False,
            )
            
            detections = []
            
            for result in results:
                boxes = result.boxes
                
                if boxes is None or len(boxes) == 0:
                    continue
                
                for i in range(len(boxes)):
                    # Get box coordinates (xyxy format)
                    xyxy = boxes.xyxy[i].cpu().numpy()
                    conf = float(boxes.conf[i].cpu().numpy())
                    cls_id = int(boxes.cls[i].cpu().numpy())
                    
                    # Get class name
                    if cls_id < len(VINDR_CLASSES):
                        cls_name = VINDR_CLASSES[cls_id]
                    else:
                        cls_name = f"class_{cls_id}"
                    
                    detection = Detection(
                        class_id=cls_id,
                        class_name=cls_name,
                        confidence=conf,
                        bbox=BoundingBox(
                            x1=float(xyxy[0]),
                            y1=float(xyxy[1]),
                            x2=float(xyxy[2]),
                            y2=float(xyxy[3]),
                        ),
                        source="yolo"
                    )
                    detections.append(detection)
            
            processing_time = int((time.time() - start_time) * 1000)
            logger.info(f"YOLO detected {len(detections)} objects in {processing_time}ms")
            
            return detections, processing_time
            
        except Exception as e:
            logger.error(f"YOLO detection failed: {e}")
            # Clear GPU memory on error
            self._clear_gpu_memory()
            return [], 0

    def _clear_gpu_memory(self) -> None:
        """Clear GPU memory cache to prevent memory leaks."""
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
    
    def detect_from_path(self, image_path: str, **kwargs) -> tuple[List[Detection], int]:
        """Run detection on image from file path."""
        return self.detect(image_path, **kwargs)
    
    def detect_from_bytes(self, image_bytes: bytes, **kwargs) -> tuple[List[Detection], int]:
        """Run detection on image from bytes."""
        from io import BytesIO
        image = Image.open(BytesIO(image_bytes))
        return self.detect(image, **kwargs)
    
    def detect_batch(
        self,
        images: List[Image.Image | np.ndarray | str],
        conf_threshold: float = 0.25,
        iou_threshold: float = 0.45,
        img_size: int = 1024,
    ) -> tuple[List[List[Detection]], int]:
        """Run batch object detection on multiple images.
        
        More efficient than calling detect() multiple times due to
        reduced GPU context switching.
        
        Args:
            images: List of PIL Images, numpy arrays, or paths
            conf_threshold: Confidence threshold for detections
            iou_threshold: IoU threshold for NMS
            img_size: Image size for inference
            
        Returns:
            Tuple of (list of detection lists per image, total processing time in ms)
        """
        if self.model is None:
            logger.error("YOLO model not loaded")
            return [[] for _ in images], 0
        
        if not images:
            return [], 0
        
        start_time = time.time()
        
        try:
            # Run batch inference
            results = self.model.predict(
                source=images,
                conf=conf_threshold,
                iou=iou_threshold,
                imgsz=img_size,
                device=self.device,
                verbose=False,
            )
            
            all_detections = []
            
            for result in results:
                detections = []
                boxes = result.boxes
                
                if boxes is not None and len(boxes) > 0:
                    for i in range(len(boxes)):
                        xyxy = boxes.xyxy[i].cpu().numpy()
                        conf = float(boxes.conf[i].cpu().numpy())
                        cls_id = int(boxes.cls[i].cpu().numpy())
                        
                        if cls_id < len(VINDR_CLASSES):
                            cls_name = VINDR_CLASSES[cls_id]
                        else:
                            cls_name = f"class_{cls_id}"
                        
                        detection = Detection(
                            class_id=cls_id,
                            class_name=cls_name,
                            confidence=conf,
                            bbox=BoundingBox(
                                x1=float(xyxy[0]),
                                y1=float(xyxy[1]),
                                x2=float(xyxy[2]),
                                y2=float(xyxy[3]),
                            ),
                            source="yolo"
                        )
                        detections.append(detection)
                
                all_detections.append(detections)
            
            processing_time = int((time.time() - start_time) * 1000)
            total_dets = sum(len(d) for d in all_detections)
            logger.info(f"YOLO batch: {total_dets} objects in {len(images)} images, {processing_time}ms")
            
            return all_detections, processing_time
            
        except Exception as e:
            logger.error(f"YOLO batch detection failed: {e}")
            self._clear_gpu_memory()
            return [[] for _ in images], 0
    
    def _load_image_from_bytes(self, image_bytes: bytes) -> Image.Image:
        """Load image from bytes, handling both regular images and DICOM.
        
        For DICOM images, properly handles:
        - PhotometricInterpretation (MONOCHROME1 vs MONOCHROME2)
        - Window/Level adjustments
        - Bit depth normalization
        """
        # Try as regular image first
        try:
            return Image.open(BytesIO(image_bytes)).convert('RGB')
        except Exception:
            pass
        
        # Try as DICOM
        try:
            import pydicom
            ds = pydicom.dcmread(BytesIO(image_bytes))
            pixel_array = ds.pixel_array.astype(np.float32)
            
            # Apply rescale slope/intercept if present
            slope = getattr(ds, 'RescaleSlope', 1)
            intercept = getattr(ds, 'RescaleIntercept', 0)
            pixel_array = pixel_array * slope + intercept
            
            # Handle Photometric Interpretation
            # MONOCHROME1: 0 = white, max = black (inverted)
            # MONOCHROME2: 0 = black, max = white (normal)
            photometric = getattr(ds, 'PhotometricInterpretation', 'MONOCHROME2')
            if photometric == 'MONOCHROME1':
                # Invert the image
                pixel_array = pixel_array.max() - pixel_array
                logger.info(f"DICOM: Inverted MONOCHROME1 image")
            
            # Apply window/level if present, otherwise use min/max
            window_center = getattr(ds, 'WindowCenter', None)
            window_width = getattr(ds, 'WindowWidth', None)
            
            if window_center is not None and window_width is not None:
                # Handle multi-value window/level
                if hasattr(window_center, '__iter__'):
                    window_center = window_center[0]
                if hasattr(window_width, '__iter__'):
                    window_width = window_width[0]
                    
                window_center = float(window_center)
                window_width = float(window_width)
                
                # Apply window/level
                min_val = window_center - window_width / 2
                max_val = window_center + window_width / 2
                pixel_array = np.clip(pixel_array, min_val, max_val)
                pixel_array = (pixel_array - min_val) / (max_val - min_val + 1e-8)
                logger.info(f"DICOM: Applied window center={window_center}, width={window_width}")
            else:
                # Normalize to 0-1 using min/max
                pixel_array = (pixel_array - pixel_array.min()) / (pixel_array.max() - pixel_array.min() + 1e-8)
            
            # Convert to 8-bit
            pixel_array = (pixel_array * 255).astype(np.uint8)
            
            # Convert to RGB PIL Image
            if len(pixel_array.shape) == 2:
                img = Image.fromarray(pixel_array).convert("RGB")
            else:
                img = Image.fromarray(pixel_array).convert("RGB")
            
            logger.info(f"DICOM loaded: size={img.size}, photometric={photometric}")
            return img
            
        except Exception as e:
            logger.error(f"Failed to load image from bytes: {e}")
            import traceback
            traceback.print_exc()
            raise ValueError(f"Cannot load image: {e}")
    
    def detect_from_bytes(self, image_bytes: bytes, **kwargs) -> tuple[List[Detection], int]:
        """Run detection on image from bytes (supports DICOM and regular images)."""
        image = self._load_image_from_bytes(image_bytes)
        return self.detect(image, **kwargs)

    def _get_gradcam_target_layers(self) -> list:
        """Get target layers for GradCAM from YOLO model.

        For ultralytics YOLO models, we target the last convolutional layers
        in the backbone before the detection head.

        Returns:
            List of target layers for GradCAM
        """
        if self.model is None:
            return []

        try:
            # Get the underlying PyTorch model
            model = self.model.model

            # For YOLO v8/v11, the model structure is:
            # model.model[0-9] = backbone layers (Conv, C2f, SPPF, etc.)
            # model.model[10+] = head layers (Upsample, Concat, C2f, Detect)
            # We want the last feature extraction layer before detection head

            # Try to find C2f or C3 layers in the backbone (usually indices 4, 6, 8)
            target_layers = []

            # Method 1: Get the last C2f/C3 layer in backbone (usually index 9 or before Detect)
            if hasattr(model, 'model'):
                layers = model.model
                # Find the last Conv or C2f layer before Detect
                for i in range(len(layers) - 1, -1, -1):
                    layer = layers[i]
                    layer_type = type(layer).__name__
                    # Skip Detect, Segment, Pose heads
                    if layer_type in ['Detect', 'Segment', 'Pose', 'Classify']:
                        continue
                    # Use C2f, C3, SPPF, or Conv layers
                    if layer_type in ['C2f', 'C3', 'SPPF', 'Conv']:
                        target_layers.append(layer)
                        logger.info(f"[GradCAM] Using layer {i}: {layer_type}")
                        break

            # Method 2: Fallback to second-to-last layer
            if not target_layers and hasattr(model, 'model'):
                target_layers = [model.model[-2]]
                logger.info(f"[GradCAM] Fallback to layer -2: {type(target_layers[0]).__name__}")

            return target_layers

        except Exception as e:
            logger.error(f"[GradCAM] Failed to get target layers: {e}")
            return []

    def generate_gradcam_heatmap(
        self,
        image: Image.Image,
        img_size: int = 640,
    ) -> np.ndarray:
        """Generate GradCAM heatmap using EigenCAM for the YOLO model.

        Uses EigenCAM which performs PCA on activations without requiring
        gradients, making it more suitable for object detection models.

        Args:
            image: PIL Image to analyze
            img_size: Image size for inference

        Returns:
            Grayscale heatmap as numpy array (H, W) with values 0-1
        """
        try:
            from pytorch_grad_cam import EigenCAM
        except ImportError as e:
            logger.error(f"[GradCAM] pytorch-grad-cam not installed: {e}")
            logger.error("Install with: pip install grad-cam")
            return None

        if self.model is None:
            logger.error("[GradCAM] YOLO model not loaded")
            return None

        try:
            start_time = time.time()

            # Get target layers
            target_layers = self._get_gradcam_target_layers()
            if not target_layers:
                logger.error("[GradCAM] No target layers found")
                return None

            # Prepare image for model
            original_size = image.size  # (W, H)
            original_width, original_height = original_size

            # Convert to RGB numpy array and normalize to [0, 1]
            img_array = np.array(image.convert('RGB'))
            img_float = img_array.astype(np.float32) / 255.0

            # ============================================================
            # Use LETTERBOX resizing to maintain aspect ratio (like YOLO)
            # ============================================================
            scale = min(img_size / original_width, img_size / original_height)
            new_width = int(original_width * scale)
            new_height = int(original_height * scale)

            # Padding to center the image in the square
            pad_left = (img_size - new_width) // 2
            pad_top = (img_size - new_height) // 2
            pad_right = img_size - new_width - pad_left
            pad_bottom = img_size - new_height - pad_top

            # Resize image maintaining aspect ratio
            img_scaled = cv2.resize(img_float, (new_width, new_height))

            # Create letterboxed image with gray padding (0.5 for normalized)
            img_letterbox = np.full((img_size, img_size, 3), 0.5, dtype=np.float32)
            img_letterbox[pad_top:pad_top + new_height, pad_left:pad_left + new_width] = img_scaled

            logger.info(f"[GradCAM] Letterbox: {original_width}x{original_height} -> {new_width}x{new_height} in {img_size}x{img_size}, pad=({pad_left},{pad_top})")

            # Convert to tensor (C, H, W) and add batch dimension
            tensor = torch.from_numpy(img_letterbox).permute(2, 0, 1).unsqueeze(0)

            # Get the underlying PyTorch model
            pytorch_model = self.model.model

            # Determine device
            use_cuda = self.device.startswith('cuda') and torch.cuda.is_available()
            if use_cuda:
                tensor = tensor.cuda()
                pytorch_model = pytorch_model.cuda()

            # Create a wrapper class to handle YOLO's tuple output
            class YOLOWrapper(torch.nn.Module):
                def __init__(self, model):
                    super().__init__()
                    self.model = model

                def forward(self, x):
                    # YOLO returns tuple (predictions, features) or just predictions
                    output = self.model(x)
                    if isinstance(output, tuple):
                        # Return the first prediction tensor
                        return output[0]
                    return output

            wrapped_model = YOLOWrapper(pytorch_model)
            wrapped_model.eval()

            # Create EigenCAM with the wrapped model
            cam = EigenCAM(
                model=wrapped_model,
                target_layers=target_layers,
            )

            # Generate CAM - EigenCAM doesn't need targets for object detection
            grayscale_cam = cam(input_tensor=tensor, targets=None)

            # Get the CAM for the first (only) image in batch
            cam_result = grayscale_cam[0, :, :]  # Shape: (img_size, img_size)

            # ============================================================
            # Extract only the image region (remove letterbox padding)
            # ============================================================
            cam_cropped = cam_result[pad_top:pad_top + new_height, pad_left:pad_left + new_width]
            logger.info(f"[GradCAM] Cropped CAM: {cam_result.shape} -> {cam_cropped.shape}")

            # Resize cropped CAM back to original image size
            cam_resized = cv2.resize(cam_cropped, (original_width, original_height))

            processing_time = int((time.time() - start_time) * 1000)
            logger.info(f"[GradCAM] Generated in {processing_time}ms, shape={cam_resized.shape}")

            return cam_resized

        except Exception as e:
            logger.error(f"[GradCAM] Failed to generate heatmap: {e}")
            import traceback
            traceback.print_exc()
            return None

    def generate_heatmap(
        self,
        image_bytes: bytes,
        img_size: int = 640,
    ) -> bytes:
        """Generate full-image attention heatmap using GradCAM from YOLO model.

        Uses EigenCAM to visualize what the YOLO model is "looking at" across
        the entire image.

        Args:
            image_bytes: Raw image bytes
            img_size: Image size for inference

        Returns:
            PNG image bytes of the heatmap with alpha channel
        """
        start_time = time.time()

        # Check cache first (use hash of image bytes as key)
        cache_key = hashlib.md5(image_bytes).hexdigest()
        if cache_key in _heatmap_cache:
            logger.info(f"[HEATMAP] Cache hit for {cache_key[:8]}...")
            return _heatmap_cache[cache_key]

        try:
            # Load image using helper (handles DICOM and regular formats)
            img = self._load_image_from_bytes(image_bytes)

            original_size = img.size  # (W, H)
            original_width, original_height = original_size
            logger.info(f"[HEATMAP] Generating for size: {original_size}")

            # Generate GradCAM heatmap
            logger.info("[HEATMAP] Using GradCAM method")
            heatmap = self.generate_gradcam_heatmap(img, img_size=img_size)

            if heatmap is None:
                logger.error("[HEATMAP] GradCAM failed, returning empty heatmap")
                return self._empty_heatmap(original_width, original_height)

            logger.info(f"[HEATMAP] GradCAM successful, shape={heatmap.shape}")

            # Convert heatmap to colored PNG with alpha channel
            png_bytes = self._heatmap_to_png(heatmap, original_width, original_height)

            processing_time = int((time.time() - start_time) * 1000)
            logger.info(f"[HEATMAP] Generated in {processing_time}ms, size: {len(png_bytes)} bytes")

            # Cache the result
            if len(_heatmap_cache) >= _HEATMAP_CACHE_MAX_SIZE:
                oldest_key = next(iter(_heatmap_cache))
                del _heatmap_cache[oldest_key]
            _heatmap_cache[cache_key] = png_bytes
            logger.info(f"[HEATMAP] Cached with key {cache_key[:8]}... (cache size: {len(_heatmap_cache)})")

            return png_bytes

        except Exception as e:
            logger.error(f"[HEATMAP] Generation failed: {e}")
            import traceback
            traceback.print_exc()
            return self._empty_heatmap(original_width, original_height) if 'original_width' in locals() else b''

    def _heatmap_to_png(
        self,
        heatmap: np.ndarray,
        width: int,
        height: int,
    ) -> bytes:
        """Convert grayscale heatmap to colored PNG with alpha channel.

        Args:
            heatmap: Grayscale heatmap (H, W) with values 0-1
            width: Target width
            height: Target height

        Returns:
            PNG bytes with RGBA
        """
        # Ensure correct size
        if heatmap.shape != (height, width):
            heatmap = cv2.resize(heatmap, (width, height))

        # Normalize to 0-1
        if heatmap.max() > 0:
            heatmap = heatmap / heatmap.max()

        logger.info(f"[HEATMAP] Final: shape={heatmap.shape}, range=[{heatmap.min():.3f}, {heatmap.max():.3f}]")

        # Convert to color heatmap using JET colormap
        heatmap_uint8 = (heatmap * 255).astype(np.uint8)
        heatmap_color = cv2.applyColorMap(heatmap_uint8, cv2.COLORMAP_JET)
        heatmap_color = cv2.cvtColor(heatmap_color, cv2.COLOR_BGR2RGB)

        # Create alpha channel based on heatmap intensity
        # Use higher base alpha for full visibility, scale with intensity
        # Minimum alpha of 50 ensures entire heatmap is visible
        alpha = (heatmap * 180 + 50).astype(np.uint8)
        alpha = np.clip(alpha, 50, 230)

        # Combine RGB + Alpha into RGBA
        heatmap_rgba = np.dstack([heatmap_color, alpha])

        # Convert to PNG bytes
        heatmap_pil = Image.fromarray(heatmap_rgba, 'RGBA')
        output = BytesIO()
        heatmap_pil.save(output, format='PNG')
        output.seek(0)
        return output.getvalue()

    def _empty_heatmap(self, width: int, height: int) -> bytes:
        """Generate an empty transparent heatmap."""
        heatmap_rgba = np.zeros((height, width, 4), dtype=np.uint8)
        heatmap_pil = Image.fromarray(heatmap_rgba, 'RGBA')
        output = BytesIO()
        heatmap_pil.save(output, format='PNG')
        output.seek(0)
        return output.getvalue()


# Global singleton instance
_yolo_service: Optional[YOLOService] = None


def get_yolo_service() -> YOLOService:
    """Get or create YOLO service singleton."""
    global _yolo_service
    if _yolo_service is None:
        _yolo_service = YOLOService()
    return _yolo_service


# Export singleton for direct import
yolo_service = get_yolo_service()
