"""
MedXrayChat Backend - Qwen3-VL Service
"""
import time
from typing import List, Optional, Tuple
from pathlib import Path
import base64
from io import BytesIO
from PIL import Image
from loguru import logger

from schemas import Detection, BoundingBox
from core.config import settings


# System prompt for medical X-ray analysis
SYSTEM_PROMPT = """Bạn là một trợ lý AI chuyên về phân tích hình ảnh X-quang lồng ngực. 
Bạn được thiết kế để hỗ trợ bác sĩ chẩn đoán hình ảnh.

Nhiệm vụ của bạn:
1. Phân tích ảnh X-quang phổi và mô tả các bất thường nếu có
2. Trả lời câu hỏi của bác sĩ về ảnh X-quang
3. Đề xuất vị trí các tổn thương dưới dạng bounding box khi cần

Các bất thường có thể phát hiện:
- Aortic enlargement (Phình động mạch chủ)
- Atelectasis (Xẹp phổi)
- Calcification (Vôi hóa)
- Cardiomegaly (Tim to)
- Clavicle fracture (Gãy xương đòn)
- Consolidation (Đông đặc phổi)
- Edema (Phù phổi)
- Emphysema (Khí phế thũng)
- Enlarged PA (Động mạch phổi giãn)
- ILD (Bệnh phổi kẽ)
- Infiltration (Thâm nhiễm)
- Lung Opacity (Mờ phổi)
- Lung cavity (Hang phổi)
- Lung cyst (Nang phổi)
- Mediastinal shift (Di lệch trung thất)
- Nodule/Mass (Nốt/Khối u)
- Pleural effusion (Tràn dịch màng phổi)
- Pleural thickening (Dày màng phổi)
- Pneumothorax (Tràn khí màng phổi)
- Pulmonary fibrosis (Xơ phổi)
- Rib fracture (Gãy xương sườn)
- Other lesion (Tổn thương khác)

Khi trả lời, hãy:
- Sử dụng tiếng Việt
- Mô tả chi tiết vị trí và đặc điểm tổn thương
- Đề xuất chẩn đoán phân biệt nếu phù hợp
- Luôn nhắc rằng đây chỉ là gợi ý, quyết định cuối cùng thuộc về bác sĩ
"""


class QwenVLService:
    """Service for Qwen3-VL vision-language model."""

    def __init__(self, model_name: Optional[str] = None):
        """Initialize Qwen-VL service.

        Args:
            model_name: Hugging Face model name. If None, uses default from settings.
        """
        self.model_name = model_name or settings.QWEN_MODEL_NAME
        self.model = None
        self.processor = None
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
                logger.info("CUDA not available, using CPU for Qwen-VL")
                return "cpu"
            except ImportError:
                return "cpu"

        # Check if specified CUDA device is available
        if device_setting.startswith("cuda"):
            try:
                import torch
                if not torch.cuda.is_available():
                    logger.warning("CUDA not available, falling back to CPU")
                    return "cpu"
            except ImportError:
                return "cpu"

        return device_setting

    def _clear_gpu_memory(self) -> None:
        """Clear GPU memory cache to prevent memory leaks."""
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
    
    def _load_model(self) -> None:
        """Load Qwen-VL model and processor."""
        try:
            import torch
            
            logger.info(f"Loading Qwen-VL model: {self.model_name}")
            
            # Try Qwen3-VL first (transformers >= 5.0), then fallback to Qwen2.5-VL
            try:
                from transformers import Qwen3VLForConditionalGeneration, Qwen3VLProcessor
                self.model = Qwen3VLForConditionalGeneration.from_pretrained(
                    self.model_name,
                    torch_dtype=torch.bfloat16,
                    device_map="auto",
                    trust_remote_code=True,
                    low_cpu_mem_usage=True,
                )
                self.processor = Qwen3VLProcessor.from_pretrained(
                    self.model_name,
                    trust_remote_code=True,
                )
            except ImportError:
                # Fallback to Qwen2.5-VL for older transformers
                from transformers import Qwen2_5_VLForConditionalGeneration, AutoProcessor
                self.model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
                    self.model_name,
                    torch_dtype=torch.bfloat16,
                    device_map="auto",
                    trust_remote_code=True,
                )
                self.processor = AutoProcessor.from_pretrained(
                    self.model_name,
                    trust_remote_code=True,
                )
            
            logger.info(f"Qwen-VL model loaded successfully: {type(self.model).__name__}")
            
        except Exception as e:
            logger.error(f"Failed to load Qwen-VL model: {e}")
            import traceback
            logger.error(traceback.format_exc())
            self.model = None
            self.processor = None
    
    def _image_to_base64(self, image: Image.Image) -> str:
        """Convert PIL Image to base64 string."""
        buffered = BytesIO()
        image.save(buffered, format="PNG")
        return base64.b64encode(buffered.getvalue()).decode()
    
    def analyze(
        self,
        image: Image.Image | str,
        question: Optional[str] = None,
        yolo_detections: Optional[List[Detection]] = None,
        max_new_tokens: int = 1024,
    ) -> Tuple[str, List[Detection], int]:
        """Analyze X-ray image with Qwen-VL.
        
        Args:
            image: PIL Image or path to image file
            question: Optional question from doctor
            yolo_detections: Optional YOLO detections to include in prompt
            max_new_tokens: Maximum tokens to generate
            
        Returns:
            Tuple of (analysis text, detected bboxes, processing time in ms)
        """
        if self.model is None or self.processor is None:
            logger.error("Qwen-VL model not loaded")
            return "Model không sẵn sàng. Vui lòng thử lại sau.", [], 0
        
        start_time = time.time()
        
        try:
            # Load image if path
            if isinstance(image, str):
                image = Image.open(image).convert("RGB")
            elif isinstance(image, Image.Image):
                image = image.convert("RGB")
            
            # Build prompt
            prompt = self._build_prompt(question, yolo_detections)
            
            # Prepare messages
            messages = [
                {
                    "role": "system",
                    "content": SYSTEM_PROMPT
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "image", "image": image},
                        {"type": "text", "text": prompt}
                    ]
                }
            ]
            
            # Process with Qwen
            text = self.processor.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True
            )
            
            inputs = self.processor(
                text=[text],
                images=[image],
                padding=True,
                return_tensors="pt"
            ).to(self.model.device)
            
            # Generate response (Qwen3-VL doesn't support temperature/do_sample directly)
            generated_ids = self.model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
            )
            
            # Decode response
            generated_ids_trimmed = [
                out_ids[len(in_ids):] 
                for in_ids, out_ids in zip(inputs.input_ids, generated_ids)
            ]
            response = self.processor.batch_decode(
                generated_ids_trimmed,
                skip_special_tokens=True,
            )[0]
            
            # Parse any bounding boxes from response (if model outputs them)
            detections = self._parse_detections(response)
            
            processing_time = int((time.time() - start_time) * 1000)
            logger.info(f"Qwen-VL analysis completed in {processing_time}ms")
            
            return response, detections, processing_time
            
        except Exception as e:
            logger.error(f"Qwen-VL analysis failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            self._clear_gpu_memory()
            return "Lỗi phân tích. Vui lòng thử lại.", [], 0
    
    def _build_prompt(
        self,
        question: Optional[str],
        yolo_detections: Optional[List[Detection]]
    ) -> str:
        """Build prompt for Qwen-VL."""
        prompt_parts = []
        
        # Add YOLO detections context if available
        if yolo_detections and len(yolo_detections) > 0:
            detection_text = "Hệ thống YOLO đã phát hiện các vùng bất thường sau:\n"
            for i, det in enumerate(yolo_detections, 1):
                detection_text += (
                    f"{i}. {det.class_name} (độ tin cậy: {det.confidence:.1%}) "
                    f"tại vị trí [{det.bbox.x1:.0f}, {det.bbox.y1:.0f}, "
                    f"{det.bbox.x2:.0f}, {det.bbox.y2:.0f}]\n"
                )
            prompt_parts.append(detection_text)
        
        # Add user question or default analysis request
        if question:
            prompt_parts.append(f"\nCâu hỏi của bác sĩ: {question}")
        else:
            prompt_parts.append(
                "\nHãy phân tích ảnh X-quang này và mô tả chi tiết các phát hiện. "
                "Nếu có bất thường, hãy mô tả vị trí, kích thước và đặc điểm."
            )
        
        return "\n".join(prompt_parts)
    
    def _truncate_messages(
        self,
        messages: List[dict],
        max_tokens: int,
    ) -> List[dict]:
        """Truncate messages to fit within context window.
        
        Uses simple estimation: ~4 chars per token.
        Removes oldest messages first, keeping recent context.
        """
        if not messages:
            return messages
        
        # Estimate tokens (rough: 4 chars per token for mixed content)
        chars_per_token = 4
        system_prompt_tokens = len(SYSTEM_PROMPT) // chars_per_token
        available_tokens = max_tokens - system_prompt_tokens - 512  # Reserve for response
        
        # Estimate token count for each message
        message_tokens = []
        for msg in messages:
            content = msg.get("content", "")
            if isinstance(content, str):
                tokens = len(content) // chars_per_token
            else:
                # For multimodal content, estimate higher
                tokens = 500  # Image tokens estimate
                for item in content:
                    if isinstance(item, dict) and item.get("type") == "text":
                        tokens += len(item.get("text", "")) // chars_per_token
            message_tokens.append(tokens)
        
        # Truncate from oldest if needed
        total_tokens = sum(message_tokens)
        start_idx = 0
        
        while total_tokens > available_tokens and start_idx < len(messages) - 1:
            total_tokens -= message_tokens[start_idx]
            start_idx += 1
        
        if start_idx > 0:
            logger.info(f"Truncated {start_idx} old messages to fit context window")
        
        return messages[start_idx:]
    
    def _parse_detections(self, response: str) -> List[Detection]:
        """Parse bounding box detections from model response.
        
        Note: This is a placeholder. The actual implementation depends on
        how the finetuned model outputs bounding boxes.
        """
        # TODO: Implement bbox parsing when finetuned model is available
        return []
    
    def chat(
        self,
        messages: List[dict],
        image: Optional[Image.Image] = None,
        max_new_tokens: int = 512,
    ) -> Tuple[str, int]:
        """Multi-turn chat with Qwen-VL.

        Args:
            messages: List of chat messages [{"role": "user/assistant", "content": "..."}]
            image: Optional image context
            max_new_tokens: Maximum tokens to generate

        Returns:
            Tuple of (response text, tokens used)
        """
        if self.model is None or self.processor is None:
            return "Model không sẵn sàng.", 0

        try:
            # Truncate messages if too many to fit context window
            max_context_tokens = settings.QWEN_MAX_CONTEXT_TOKENS
            truncated_messages = self._truncate_messages(messages, max_context_tokens)

            # Add system prompt
            full_messages = [{"role": "system", "content": SYSTEM_PROMPT}]

            # Save original image reference for processor
            original_image = image
            image_added = False

            # Process messages
            for msg in truncated_messages:
                if msg["role"] == "user" and original_image is not None and not image_added:
                    # Add image to first user message
                    full_messages.append({
                        "role": "user",
                        "content": [
                            {"type": "image", "image": original_image},
                            {"type": "text", "text": msg["content"]}
                        ]
                    })
                    image_added = True  # Only add image once
                else:
                    full_messages.append(msg)

            # Generate response
            text = self.processor.apply_chat_template(
                full_messages,
                tokenize=False,
                add_generation_prompt=True
            )

            images_list = [original_image] if original_image else None
            inputs = self.processor(
                text=[text],
                images=images_list,
                padding=True,
                return_tensors="pt"
            ).to(self.model.device)
            
            # Generate with memory optimization
            import torch
            with torch.inference_mode():
                generated_ids = self.model.generate(
                    **inputs,
                    max_new_tokens=max_new_tokens,
                    use_cache=True,
                )

            generated_ids_trimmed = [
                out_ids[len(in_ids):]
                for in_ids, out_ids in zip(inputs.input_ids, generated_ids)
            ]
            response = self.processor.batch_decode(
                generated_ids_trimmed,
                skip_special_tokens=True,
            )[0]

            tokens_used = len(generated_ids_trimmed[0])
            logger.info(f"Qwen-VL chat completed, tokens: {tokens_used}")

            # Cleanup to free GPU memory
            del inputs, generated_ids, generated_ids_trimmed
            self._clear_gpu_memory()

            return response, tokens_used

        except Exception as e:
            logger.error(f"Qwen-VL chat failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            self._clear_gpu_memory()
            return "Lỗi xử lý. Vui lòng thử lại.", 0


# Global singleton instance
_qwen_service: Optional[QwenVLService] = None


def get_qwen_service():
    """Get or create Qwen-VL service singleton.
    
    Returns MockQwenVLService if MOCK_QWEN_SERVICE is True in settings.
    """
    global _qwen_service
    
    # Check if mock mode is enabled
    if settings.MOCK_QWEN_SERVICE:
        from services.mock_qwen_service import get_mock_qwen_service
        return get_mock_qwen_service()
    
    if _qwen_service is None:
        _qwen_service = QwenVLService()
    return _qwen_service
