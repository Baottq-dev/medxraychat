"""
MedXrayChat Backend - Qwen3-VL Service with Tool Calling Support
"""
import time
import threading
from typing import List, Optional, Tuple, Generator, AsyncGenerator
from pathlib import Path
import base64
from io import BytesIO
from PIL import Image
from loguru import logger

from schemas import Detection, BoundingBox
from core.config import settings
from services.tools import get_tools_description, format_tool_call_instruction


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


# System prompt for tool-aware chat (function calling)
TOOL_SYSTEM_PROMPT = """Bạn là trợ lý AI y tế hỗ trợ bác sĩ phân tích X-quang ngực.

## Available Tools
1. **analyze_xray**: Chạy AI để phát hiện bất thường trên ảnh X-quang
2. **explain_finding**: Giải thích chi tiết về một bất thường cụ thể
3. **generate_report**: Tạo báo cáo chẩn đoán hoàn chỉnh

## Kết quả phân tích đã có:
{existing_detections}

## QUAN TRỌNG - Khi nào dùng tool:
- Nếu user yêu cầu phân tích/kiểm tra/xem ảnh và CHƯA CÓ kết quả → BẮT BUỘC gọi analyze_xray
- Nếu user hỏi về một bệnh/bất thường cụ thể → gọi explain_finding
- Nếu user yêu cầu báo cáo → gọi generate_report
- Nếu user chào hỏi hoặc hỏi chung → trả lời text bình thường

## Response Format
- Cần tool: CHỈ trả về JSON, không text khác
  {{"tool_call": {{"name": "analyze_xray", "args": {{}}}}}}
- Không cần tool: Trả lời text bình thường

## Examples
"xin chào" → Xin chào! Tôi có thể giúp gì cho bạn?
"phân tích ảnh này" → {{"tool_call": {{"name": "analyze_xray", "args": {{}}}}}}
"kiểm tra ảnh x-quang" → {{"tool_call": {{"name": "analyze_xray", "args": {{}}}}}}
"phân tích và đưa ra nhận xét" → {{"tool_call": {{"name": "analyze_xray", "args": {{}}}}}}
"có bất thường gì không" → {{"tool_call": {{"name": "analyze_xray", "args": {{}}}}}}
"cardiomegaly là gì" → {{"tool_call": {{"name": "explain_finding", "args": {{"finding_name": "Cardiomegaly"}}}}}}
"tạo báo cáo" → {{"tool_call": {{"name": "generate_report", "args": {{}}}}}}
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

    def chat_stream(
        self,
        messages: List[dict],
        image: Optional[Image.Image] = None,
        max_new_tokens: int = 512,
    ) -> Generator[str, None, None]:
        """Stream chat response token by token.

        Args:
            messages: List of chat messages [{"role": "user/assistant", "content": "..."}]
            image: Optional image context
            max_new_tokens: Maximum tokens to generate

        Yields:
            Response text chunks as they are generated
        """
        if self.model is None or self.processor is None:
            yield "Model không sẵn sàng."
            return

        try:
            from transformers import TextIteratorStreamer
            import torch

            # Truncate messages if too many
            max_context_tokens = settings.QWEN_MAX_CONTEXT_TOKENS
            truncated_messages = self._truncate_messages(messages, max_context_tokens)

            # Add system prompt
            full_messages = [{"role": "system", "content": SYSTEM_PROMPT}]

            # Save original image reference
            original_image = image
            image_added = False

            # Process messages
            for msg in truncated_messages:
                if msg["role"] == "user" and original_image is not None and not image_added:
                    full_messages.append({
                        "role": "user",
                        "content": [
                            {"type": "image", "image": original_image},
                            {"type": "text", "text": msg["content"]}
                        ]
                    })
                    image_added = True
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

            # Setup streamer
            streamer = TextIteratorStreamer(
                self.processor.tokenizer,
                skip_prompt=True,
                skip_special_tokens=True
            )

            # Generation kwargs
            generation_kwargs = dict(
                **inputs,
                max_new_tokens=max_new_tokens,
                use_cache=True,
                streamer=streamer,
            )

            # Run generation in separate thread
            thread = threading.Thread(target=self.model.generate, kwargs=generation_kwargs)
            thread.start()

            # Yield tokens as they come
            for text_chunk in streamer:
                yield text_chunk

            thread.join()

            # Cleanup
            del inputs
            self._clear_gpu_memory()
            logger.info("Qwen-VL streaming chat completed")

        except Exception as e:
            logger.error(f"Qwen-VL streaming chat failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            self._clear_gpu_memory()
            yield "Lỗi xử lý. Vui lòng thử lại."

    # ==================== Tool Calling Methods ====================

    def chat_for_tool_decision(
        self,
        message: str,
        image: Optional[Image.Image] = None,
        chat_history: Optional[List[dict]] = None,
        existing_detections: Optional[List[Detection]] = None,
    ) -> Tuple[str, int]:
        """Let Qwen decide whether to call a tool or respond directly.

        Args:
            message: User message
            image: Optional image context
            chat_history: Previous chat messages
            existing_detections: Detections already available in session

        Returns:
            Tuple of (response text or tool call JSON, tokens used)
        """
        # Format existing detections for context
        det_text = "Chưa có kết quả phân tích."
        if existing_detections and len(existing_detections) > 0:
            det_text = self._format_detections_text(existing_detections)

        system_prompt = TOOL_SYSTEM_PROMPT.format(existing_detections=det_text)

        messages = [{"role": "system", "content": system_prompt}]

        # Add recent chat history for context (limit to last 6 messages)
        if chat_history:
            messages.extend(chat_history[-6:])

        messages.append({"role": "user", "content": message})

        # Use shorter max_tokens for decision (we only need JSON or short response)
        return self.chat(messages, image, max_new_tokens=256)

    def chat_for_tool_decision_stream(
        self,
        message: str,
        image: Optional[Image.Image] = None,
        chat_history: Optional[List[dict]] = None,
        existing_detections: Optional[List[Detection]] = None,
    ) -> Generator[str, None, None]:
        """Stream version of chat_for_tool_decision for immediate response start.

        This allows streaming to begin immediately while we detect if it's a tool
        call (JSON) or direct response (text).

        Args:
            message: User message
            image: Optional image context
            chat_history: Previous chat messages
            existing_detections: Detections already available in session

        Yields:
            Response text chunks (may be JSON for tool call or plain text)
        """
        # Format existing detections for context
        det_text = "Chưa có kết quả phân tích."
        if existing_detections and len(existing_detections) > 0:
            det_text = self._format_detections_text(existing_detections)

        system_prompt = TOOL_SYSTEM_PROMPT.format(existing_detections=det_text)

        messages = [{"role": "system", "content": system_prompt}]

        # Add recent chat history for context (limit to last 6 messages)
        if chat_history:
            messages.extend(chat_history[-6:])

        messages.append({"role": "user", "content": message})

        # Stream with shorter max_tokens
        return self.chat_stream(messages, image, max_new_tokens=256)

    def chat_stream_simple(
        self,
        message: str,
        image: Optional[Image.Image] = None,
        chat_history: Optional[List[dict]] = None,
    ) -> Generator[str, None, None]:
        """Simple chat stream without tool awareness (direct response).

        Args:
            message: User message
            image: Optional image context
            chat_history: Previous chat messages

        Yields:
            Response text chunks
        """
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        if chat_history:
            messages.extend(chat_history[-6:])

        messages.append({"role": "user", "content": message})

        return self.chat_stream(messages, image)

    def summarize_with_detections(
        self,
        original_message: str,
        image: Optional[Image.Image],
        detections: List[Detection],
        chat_history: Optional[List[dict]] = None,
    ) -> Tuple[str, int]:
        """Summarize analysis results after YOLO detection.

        Args:
            original_message: Original user question
            image: The X-ray image
            detections: YOLO detection results
            chat_history: Previous chat messages

        Returns:
            Tuple of (summary text, tokens used)
        """
        det_text = self._format_detections_text(detections)

        prompt = f"""Dựa trên kết quả phân tích AI:

{det_text}

Câu hỏi của bác sĩ: {original_message}

Hãy trả lời chi tiết bằng tiếng Việt:
1. Mô tả các bất thường phát hiện được
2. Vị trí và đặc điểm của từng bất thường
3. Đưa ra nhận định tổng quát
4. Lưu ý: Đây chỉ là gợi ý, quyết định cuối cùng thuộc về bác sĩ"""

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        if chat_history:
            messages.extend(chat_history[-4:])

        messages.append({"role": "user", "content": prompt})

        return self.chat(messages, image)

    def summarize_with_detections_stream(
        self,
        original_message: str,
        image: Optional[Image.Image],
        detections: List[Detection],
        chat_history: Optional[List[dict]] = None,
    ) -> Generator[str, None, None]:
        """Stream version of summarize_with_detections.

        Args:
            original_message: Original user question
            image: The X-ray image
            detections: YOLO detection results
            chat_history: Previous chat messages

        Yields:
            Response text chunks
        """
        det_text = self._format_detections_text(detections)

        prompt = f"""Dựa trên kết quả phân tích AI:

{det_text}

Câu hỏi của bác sĩ: {original_message}

Hãy trả lời chi tiết bằng tiếng Việt, mô tả các bất thường và đưa ra nhận định."""

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        if chat_history:
            messages.extend(chat_history[-4:])

        messages.append({"role": "user", "content": prompt})

        return self.chat_stream(messages, image)

    def explain_finding_stream(
        self,
        finding_name: str,
        include_treatment: bool = False,
    ) -> Generator[str, None, None]:
        """Stream explanation about a specific finding.

        Args:
            finding_name: Name of the finding to explain
            include_treatment: Whether to include treatment info

        Yields:
            Explanation text chunks
        """
        treatment_section = "5. Phương pháp điều trị phổ biến" if include_treatment else ""

        prompt = f"""Giải thích chi tiết về bất thường X-quang ngực: **{finding_name}**

Bao gồm các nội dung sau:
1. Định nghĩa và mô tả
2. Nguyên nhân phổ biến
3. Đặc điểm nhận dạng trên X-quang
4. Mức độ nghiêm trọng và tiên lượng
{treatment_section}

Trả lời bằng tiếng Việt, sử dụng ngôn ngữ y khoa chuyên nghiệp nhưng dễ hiểu.
Lưu ý: Đây chỉ là thông tin tham khảo, không thay thế tư vấn y khoa."""

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ]

        return self.chat_stream(messages, None)

    def generate_report_stream(
        self,
        detections: List[Detection],
        format: str = "standard",
        include_recommendations: bool = True,
    ) -> Generator[str, None, None]:
        """Stream generation of diagnosis report.

        Args:
            detections: Detection results to include in report
            format: Report format (standard, detailed, summary)
            include_recommendations: Whether to include recommendations

        Yields:
            Report text chunks
        """
        det_text = self._format_detections_text(detections)

        format_instructions = {
            "standard": "Viết báo cáo chuẩn với đầy đủ các mục",
            "detailed": "Viết báo cáo chi tiết, mô tả kỹ từng bất thường",
            "summary": "Viết báo cáo tóm tắt, ngắn gọn súc tích"
        }

        rec_section = """4. KHUYẾN NGHỊ
   - Đề xuất xét nghiệm bổ sung (nếu cần)
   - Hướng theo dõi""" if include_recommendations else ""

        prompt = f"""Tạo báo cáo chẩn đoán X-quang ngực.

**Kết quả phân tích AI:**
{det_text}

**Yêu cầu:** {format_instructions.get(format, format_instructions["standard"])}

**Cấu trúc báo cáo:**
1. KỸ THUẬT CHỤP
   - Tư thế: Thẳng (PA/AP)
   - Chất lượng ảnh

2. MÔ TẢ HÌNH ẢNH
   - Phổi
   - Tim và mạch máu lớn
   - Xương và mô mềm
   - Các bất thường phát hiện

3. KẾT LUẬN
   - Tổng hợp các phát hiện chính
   - Chẩn đoán gợi ý

{rec_section}

Sử dụng ngôn ngữ y khoa chuyên nghiệp bằng tiếng Việt.
Lưu ý cuối: "Đây là báo cáo hỗ trợ AI, cần được bác sĩ xác nhận trước khi sử dụng chính thức."
"""

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ]

        return self.chat_stream(messages, None)

    def _format_detections_text(self, detections: List[Detection]) -> str:
        """Format detections list to readable text.

        Args:
            detections: List of Detection objects

        Returns:
            Formatted string describing all detections
        """
        if not detections:
            return "Không phát hiện bất thường đáng kể."

        lines = []
        for i, det in enumerate(detections, 1):
            lines.append(
                f"{i}. **{det.class_name}** (độ tin cậy: {det.confidence:.1%})\n"
                f"   - Vị trí: [{det.bbox.x1:.0f}, {det.bbox.y1:.0f}] → [{det.bbox.x2:.0f}, {det.bbox.y2:.0f}]"
            )

        return "\n".join(lines)


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
