"""
MedXrayChat Backend - AI Orchestration Service
"""
import time
from typing import List, Optional, Tuple
from PIL import Image
from loguru import logger

from schemas import Detection, BoundingBox, AIAnalyzeResponse
from services.yolo_service import get_yolo_service, YOLOService
from services.qwen_service import get_qwen_service, QwenVLService


def weighted_boxes_fusion(
    detections_list: List[List[Detection]],
    image_width: int = None,
    image_height: int = None,
    iou_threshold: float = 0.5,
    skip_box_threshold: float = 0.0,
) -> List[Detection]:
    """Apply Weighted Box Fusion to merge detections from multiple sources.
    
    Args:
        detections_list: List of detection lists from different sources
        image_width: Actual image width for proper normalization
        image_height: Actual image height for proper normalization
        iou_threshold: IoU threshold for box matching
        skip_box_threshold: Minimum confidence to keep a box
        
    Returns:
        Fused detections
    """
    try:
        from ensemble_boxes import weighted_boxes_fusion as wbf
        import numpy as np
    except ImportError:
        logger.warning("ensemble-boxes not installed, returning concatenated detections")
        return [det for dets in detections_list for det in dets]
    
    if not detections_list or all(len(d) == 0 for d in detections_list):
        return []
    
    # Use actual image dimensions for proper normalization
    # This is critical for correct WBF behavior
    if image_width is None or image_height is None:
        # Fallback: estimate from max bbox (not ideal but maintains backward compatibility)
        logger.warning("Image dimensions not provided to WBF, using bbox max as fallback")
        max_x, max_y = 1, 1
        for dets in detections_list:
            for det in dets:
                max_x = max(max_x, det.bbox.x2)
                max_y = max(max_y, det.bbox.y2)
    else:
        max_x, max_y = image_width, image_height
    
    boxes_list = []
    scores_list = []
    labels_list = []
    
    for dets in detections_list:
        if len(dets) == 0:
            boxes_list.append(np.array([]))
            scores_list.append(np.array([]))
            labels_list.append(np.array([]))
            continue
            
        boxes = np.array([
            [d.bbox.x1/max_x, d.bbox.y1/max_y, d.bbox.x2/max_x, d.bbox.y2/max_y]
            for d in dets
        ])
        scores = np.array([d.confidence for d in dets])
        labels = np.array([d.class_id for d in dets])
        
        boxes_list.append(boxes)
        scores_list.append(scores)
        labels_list.append(labels)
    
    # Apply WBF
    fused_boxes, fused_scores, fused_labels = wbf(
        boxes_list,
        scores_list,
        labels_list,
        iou_thr=iou_threshold,
        skip_box_thr=skip_box_threshold,
    )
    
    # Convert back to Detection objects
    from services.yolo_service import VINDR_CLASSES
    
    fused_detections = []
    for box, score, label in zip(fused_boxes, fused_scores, fused_labels):
        label_int = int(label)
        class_name = VINDR_CLASSES[label_int] if label_int < len(VINDR_CLASSES) else f"class_{label_int}"
        
        fused_detections.append(Detection(
            class_id=label_int,
            class_name=class_name,
            confidence=float(score),
            bbox=BoundingBox(
                x1=float(box[0] * max_x),
                y1=float(box[1] * max_y),
                x2=float(box[2] * max_x),
                y2=float(box[3] * max_y),
            ),
            source="fused"
        ))
    
    return fused_detections


class AIService:
    """Orchestrates YOLO and Qwen-VL for full analysis pipeline."""
    
    def __init__(
        self,
        yolo_service: Optional[YOLOService] = None,
        qwen_service: Optional[QwenVLService] = None,
    ):
        """Initialize AI service.
        
        Args:
            yolo_service: YOLO detection service instance
            qwen_service: Qwen-VL service instance
        """
        self.yolo = yolo_service or get_yolo_service()
        self.qwen = qwen_service or get_qwen_service()
    
    def analyze_image(
        self,
        image: Image.Image | str,
        run_yolo: bool = True,
        run_qwen: bool = True,
        question: Optional[str] = None,
        yolo_conf: float = 0.25,
        fusion_iou: float = 0.5,
    ) -> AIAnalyzeResponse:
        """Run full AI analysis pipeline on an image.
        
        Pipeline:
        1. Run YOLO detection
        2. Pass image + YOLO results to Qwen-VL
        3. Fuse detection results with WBF
        
        Args:
            image: PIL Image or path to image
            run_yolo: Whether to run YOLO detection
            run_qwen: Whether to run Qwen-VL analysis
            question: Optional question for Qwen-VL
            yolo_conf: YOLO confidence threshold
            fusion_iou: IoU threshold for WBF fusion
            
        Returns:
            AIAnalyzeResponse with all results
        """
        start_time = time.time()
        
        # Load image if path
        if isinstance(image, str):
            image = Image.open(image).convert("RGB")
        
        yolo_detections = []
        qwen_detections = []
        analysis_text = None
        yolo_time = 0
        qwen_time = 0
        
        # Run YOLO first, then Qwen with YOLO results
        # (Sequential execution ensures Qwen has access to YOLO detections)
        if run_yolo:
            yolo_detections, yolo_time = self.yolo.detect(
                image,
                conf_threshold=yolo_conf,
            )
            logger.info(f"YOLO: {len(yolo_detections)} detections in {yolo_time}ms")
        
        if run_qwen:
            analysis_text, qwen_detections, qwen_time = self.qwen.analyze(
                image,
                question=question,
                yolo_detections=yolo_detections,
            )
            logger.info(f"Qwen-VL: analysis completed in {qwen_time}ms")
        
        # Step 3: Fusion with WBF (with proper image dimensions)
        fused_detections = []
        if yolo_detections or qwen_detections:
            all_detections = [yolo_detections, qwen_detections]
            fused_detections = weighted_boxes_fusion(
                all_detections,
                image_width=image.width,
                image_height=image.height,
                iou_threshold=fusion_iou,
            )
            logger.info(f"WBF: {len(fused_detections)} fused detections")
        
        total_time = int((time.time() - start_time) * 1000)
        
        return AIAnalyzeResponse(
            image_id=None,  # Will be set by caller
            yolo_detections=yolo_detections,
            qwen_detections=qwen_detections,
            fused_detections=fused_detections,
            analysis_text=analysis_text,
            processing_time_ms=total_time,
        )
    
    def chat(
        self,
        message: str,
        image: Optional[Image.Image] = None,
        chat_history: Optional[List[dict]] = None,
        include_detections: bool = True,
    ) -> Tuple[str, List[Detection], int]:
        """Chat with AI about X-ray image.
        
        Args:
            message: User message
            image: Optional image context
            chat_history: Previous chat messages
            include_detections: Whether to run YOLO and include in response
            
        Returns:
            Tuple of (response text, relevant detections, tokens used)
        """
        # Run YOLO if image provided and detections requested
        detections = []
        if image is not None and include_detections:
            detections, _ = self.yolo.detect(image)
        
        # Build messages for Qwen
        messages = []
        if chat_history:
            messages.extend(chat_history)
        
        # Add detection context to message if available
        if detections:
            det_text = "Các phát hiện từ AI:\n"
            for i, det in enumerate(detections, 1):
                det_text += f"- {det.class_name}: {det.confidence:.1%}\n"
            message = f"{det_text}\n{message}"
        
        messages.append({"role": "user", "content": message})
        
        # Get response from Qwen
        response, tokens = self.qwen.chat(messages, image)
        
        return response, detections, tokens


# Global singleton
_ai_service: Optional[AIService] = None


def get_ai_service() -> AIService:
    """Get or create AI service singleton."""
    global _ai_service
    if _ai_service is None:
        _ai_service = AIService()
    return _ai_service
