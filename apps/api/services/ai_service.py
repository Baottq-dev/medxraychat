"""
MedXrayChat Backend - AI Orchestration Service with Tool Calling
"""
import time
import json
import re
from typing import List, Optional, Tuple, Generator
from PIL import Image
from loguru import logger

from schemas import Detection, BoundingBox, AIAnalyzeResponse
from services.yolo_service import get_yolo_service, YOLOService
from services.qwen_service import get_qwen_service, QwenVLService
from services.tools import ToolName, ToolCall


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

    def chat_stream(
        self,
        message: str,
        image: Optional[Image.Image] = None,
        chat_history: Optional[List[dict]] = None,
        include_detections: bool = True,
    ) -> Tuple[Generator[str, None, None], List[Detection]]:
        """Stream chat response with AI about X-ray image.

        Args:
            message: User message
            image: Optional image context
            chat_history: Previous chat messages
            include_detections: Whether to run YOLO and include in response

        Returns:
            Tuple of (generator yielding text chunks, relevant detections)
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

        # Get streaming response from Qwen
        stream = self.qwen.chat_stream(messages, image)

        return stream, detections

    # ==================== Tool Calling Methods ====================

    def chat_with_tools(
        self,
        message: str,
        image: Optional[Image.Image] = None,
        chat_history: Optional[List[dict]] = None,
        available_detections: Optional[List[Detection]] = None,
    ) -> Tuple[str, List[Detection], int, Optional[ToolCall]]:
        """Chat with tool calling support (non-streaming).

        Args:
            message: User message
            image: Optional image context
            chat_history: Previous chat messages
            available_detections: Detections already available in session

        Returns:
            Tuple of (response_text, detections, tokens, tool_call or None)
        """
        # Step 1: Let Qwen decide if tool is needed
        decision_response, tokens = self.qwen.chat_for_tool_decision(
            message, image, chat_history, available_detections
        )

        # Step 2: Parse tool call from response
        tool_call = self._parse_tool_call(decision_response)

        if tool_call is None:
            # No tool needed - return direct response
            # But decision_response might be a direct answer, use it
            return decision_response, [], tokens, None

        # Step 3: Execute tool based on type
        detections = []

        if tool_call.name == ToolName.ANALYZE_XRAY:
            # Run YOLO detection
            if image is not None:
                detections, _ = self.yolo.detect(image)
                logger.info(f"Tool analyze_xray: {len(detections)} detections")

            # Let Qwen summarize with detections
            final_response, extra_tokens = self.qwen.summarize_with_detections(
                message, image, detections, chat_history
            )
            return final_response, detections, tokens + extra_tokens, tool_call

        elif tool_call.name == ToolName.EXPLAIN_FINDING:
            finding_name = tool_call.args.get("finding_name", "")
            include_treatment = tool_call.args.get("include_treatment", False)
            logger.info(f"Tool explain_finding: {finding_name}")

            # Stream and collect response
            chunks = []
            for chunk in self.qwen.explain_finding_stream(finding_name, include_treatment):
                chunks.append(chunk)
            explanation = "".join(chunks)

            return explanation, [], tokens, tool_call

        elif tool_call.name == ToolName.GENERATE_REPORT:
            report_format = tool_call.args.get("format", "standard")
            include_rec = tool_call.args.get("include_recommendations", True)
            logger.info(f"Tool generate_report: format={report_format}")

            # Use available detections or empty list
            report_detections = available_detections or []

            # Stream and collect response
            chunks = []
            for chunk in self.qwen.generate_report_stream(
                report_detections, report_format, include_rec
            ):
                chunks.append(chunk)
            report = "".join(chunks)

            return report, [], tokens, tool_call

        # Unknown tool - return decision response
        return decision_response, [], tokens, None

    def chat_with_tools_stream(
        self,
        message: str,
        image: Optional[Image.Image] = None,
        chat_history: Optional[List[dict]] = None,
        available_detections: Optional[List[Detection]] = None,
    ) -> Generator[Tuple[str, str, Optional[List[Detection]]], None, None]:
        """Streaming chat with real-time tool detection.

        Uses streaming tool decision to start response immediately:
        - If response starts with '{' → tool call JSON → execute tool
        - If response starts with text → direct response → stream through

        Yields events in format: (event_type, content, detections)
        Event types:
        - "thinking": AI is analyzing (only shown briefly if tool detected)
        - "tool_start": Tool execution starting
        - "tool_result": Tool finished, includes detections if any
        - "text": Text chunk from response
        - "done": Stream finished

        Args:
            message: User message
            image: Optional image context
            chat_history: Previous chat messages
            available_detections: Detections already available in session

        Yields:
            Tuple of (event_type, content, detections or None)
        """
        # Stream tool decision - response starts immediately!
        decision_stream = self.qwen.chat_for_tool_decision_stream(
            message, image, chat_history, available_detections
        )

        # Buffer to detect if it's JSON (tool call) or text (direct response)
        buffer = ""
        is_json = None  # None = unknown, True = JSON, False = text
        json_detection_chars = 10  # Check first N chars to determine type

        for chunk in decision_stream:
            buffer += chunk

            # Determine response type from initial characters
            if is_json is None and len(buffer) >= json_detection_chars:
                stripped = buffer.strip()
                # JSON tool call starts with { or "
                is_json = stripped.startswith('{') or stripped.startswith('"')

                if is_json:
                    # It's a tool call - show thinking indicator
                    logger.info("Detected tool call JSON, buffering...")
                    yield ("thinking", "Đang xử lý yêu cầu...", None)
                else:
                    # It's direct text - start streaming immediately
                    logger.info("Direct response detected, streaming...")
                    yield ("text", buffer, None)
                    buffer = ""  # Clear buffer, continue streaming

            elif is_json is False:
                # Continue streaming text directly
                yield ("text", chunk, None)

        # Handle remaining buffer
        if is_json is None:
            # Short response - check type
            stripped = buffer.strip()
            is_json = stripped.startswith('{') or stripped.startswith('"')
            if not is_json:
                # Short text response
                yield ("text", buffer, None)

        if not is_json:
            # Direct text response - already streamed, just finish
            yield ("done", "", None)
            return

        # is_json = True: Parse tool call from complete JSON response
        tool_call = self._parse_tool_call(buffer)

        if tool_call is None:
            # Failed to parse - treat as text
            logger.warning(f"Failed to parse tool call, treating as text: {buffer[:100]}")
            yield ("text", buffer, None)
            yield ("done", "", None)
            return

        # Execute tool with status updates
        logger.info(f"Tool call detected: {tool_call.name}")

        detections = []

        if tool_call.name == ToolName.ANALYZE_XRAY:
            yield ("tool_start", "Đang phân tích ảnh X-quang...", None)

            # Run YOLO detection
            if image is not None:
                detections, yolo_time = self.yolo.detect(image)
                logger.info(f"YOLO detection: {len(detections)} findings in {yolo_time}ms")

            yield ("tool_result", f"Phát hiện {len(detections)} vùng bất thường", detections)

            # Stream summarization from Qwen
            for chunk in self.qwen.summarize_with_detections_stream(
                message, image, detections, chat_history
            ):
                yield ("text", chunk, None)

        elif tool_call.name == ToolName.EXPLAIN_FINDING:
            finding_name = tool_call.args.get("finding_name", "")
            include_treatment = tool_call.args.get("include_treatment", False)

            yield ("tool_start", f"Đang tra cứu thông tin về {finding_name}...", None)
            yield ("tool_result", "", None)

            # Stream explanation
            for chunk in self.qwen.explain_finding_stream(finding_name, include_treatment):
                yield ("text", chunk, None)

        elif tool_call.name == ToolName.GENERATE_REPORT:
            report_format = tool_call.args.get("format", "standard")
            include_rec = tool_call.args.get("include_recommendations", True)

            yield ("tool_start", "Đang tạo báo cáo chẩn đoán...", None)
            yield ("tool_result", "", None)

            # Use available detections
            report_detections = available_detections or []

            # Stream report generation
            for chunk in self.qwen.generate_report_stream(
                report_detections, report_format, include_rec
            ):
                yield ("text", chunk, None)

        yield ("done", "", detections if detections else None)

    def _parse_tool_call(self, response: str) -> Optional[ToolCall]:
        """Parse tool call from Qwen's response.

        Args:
            response: Raw response from Qwen

        Returns:
            ToolCall object if found, None otherwise
        """
        if not response:
            return None

        # Try multiple patterns to extract tool call JSON
        patterns = [
            # Full format: {"tool_call": {"name": "...", "args": {...}}}
            r'\{\s*"tool_call"\s*:\s*(\{[^}]*"name"\s*:\s*"[^"]+?"[^}]*\})\s*\}',
            # Simple format: {"name": "...", "args": {...}}
            r'(\{\s*"name"\s*:\s*"[^"]+?"[^}]*\})',
        ]

        for pattern in patterns:
            match = re.search(pattern, response, re.DOTALL)
            if match:
                try:
                    # Extract the matched JSON
                    json_str = match.group(1) if "tool_call" in pattern else match.group(0)

                    # Handle nested format
                    if "tool_call" in response and "tool_call" not in json_str:
                        # We extracted inner object, parse it directly
                        data = json.loads(json_str)
                    else:
                        full_match = match.group(0)
                        data = json.loads(full_match)
                        if "tool_call" in data:
                            data = data["tool_call"]

                    # Validate and create ToolCall
                    name = data.get("name", "")
                    args = data.get("args", {})

                    # Check if name is valid
                    try:
                        tool_name = ToolName(name)
                        return ToolCall(name=tool_name, args=args)
                    except ValueError:
                        logger.warning(f"Unknown tool name: {name}")
                        continue

                except (json.JSONDecodeError, KeyError, TypeError) as e:
                    logger.debug(f"Failed to parse tool call: {e}")
                    continue

        return None


# Global singleton
_ai_service: Optional[AIService] = None


def get_ai_service() -> AIService:
    """Get or create AI service singleton."""
    global _ai_service
    if _ai_service is None:
        _ai_service = AIService()
    return _ai_service
