"""
MedXrayChat Backend - Mock Qwen-VL Service for Testing

This mock service simulates Qwen-VL responses without loading the actual model.
Use this when you don't have the Qwen model weights or GPU resources.
"""
import time
import random
from typing import List, Optional, Tuple
from PIL import Image
from loguru import logger

from schemas import Detection, BoundingBox


# Vietnamese response templates based on YOLO detections
ANALYSIS_TEMPLATES = {
    "normal": """**Kết quả phân tích ảnh X-quang ngực:**

📋 **Nhận xét tổng quan:**
Hình ảnh X-quang ngực thẳng chất lượng tốt, đủ để đánh giá.

🫁 **Phổi:**
- Hai phế trường sáng, không thấy tổn thương thâm nhiễm rõ
- Không có hình ảnh đông đặc hoặc xẹp phổi
- Góc sườn hoành hai bên tự do

❤️ **Tim và trung thất:**
- Bóng tim kích thước bình thường (CTR < 50%)
- Trung thất không giãn, không lệch

🦴 **Xương:**
- Các xương sườn, xương đòn không thấy bất thường rõ

✅ **Kết luận:** Hình ảnh X-quang ngực trong giới hạn bình thường.

⚠️ *Đây là kết quả phân tích AI hỗ trợ. Quyết định cuối cùng thuộc về bác sĩ.*
""",
    
    "with_findings": """**Kết quả phân tích ảnh X-quang ngực:**

📋 **Nhận xét tổng quan:**
Hình ảnh X-quang ngực thẳng. Phát hiện một số bất thường cần lưu ý.

🔍 **Các phát hiện bất thường:**
{findings}

📊 **Chi tiết vị trí:**
{locations}

💡 **Đề xuất:**
- Cần đối chiếu với lâm sàng và tiền sử bệnh nhân
- Có thể cần thêm các thăm dò bổ sung nếu cần thiết

⚠️ *Đây là kết quả phân tích AI hỗ trợ. Quyết định cuối cùng thuộc về bác sĩ.*
""",
}

# Vietnamese descriptions for each finding class
FINDING_DESCRIPTIONS = {
    "Aortic enlargement": "Phình động mạch chủ - cung động mạch chủ giãn rộng",
    "Atelectasis": "Xẹp phổi - giảm thể tích phổi khu trú",
    "Calcification": "Vôi hóa - các nốt vôi hóa trong nhu mô phổi",
    "Cardiomegaly": "Tim to - chỉ số tim/ngực (CTR) > 50%",
    "Clavicle fracture": "Gãy xương đòn - đường gãy xương đòn",
    "Consolidation": "Đông đặc phổi - vùng mờ đồng nhất do tổn thương nhu mô",
    "Edema": "Phù phổi - hình ảnh mờ lan tỏa hai bên",
    "Emphysema": "Khí phế thũng - phổi căng giãn, tăng sáng",
    "Enlarged PA": "Động mạch phổi giãn - rốn phổi to",
    "ILD": "Bệnh phổi kẽ - tổn thương mô kẽ lan tỏa",
    "Infiltration": "Thâm nhiễm - vùng mờ không đồng nhất",
    "Lung Opacity": "Mờ phổi - vùng giảm sáng trong nhu mô phổi",
    "Lung cavity": "Hang phổi - tổn thương dạng hang có thành",
    "Lung cyst": "Nang phổi - tổn thương dạng nang thành mỏng",
    "Mediastinal shift": "Di lệch trung thất - trung thất lệch sang một bên",
    "Nodule/Mass": "Nốt/Khối u - tổn thương dạng nốt hoặc khối",
    "Pleural effusion": "Tràn dịch màng phổi - mờ góc sườn hoành",
    "Pleural thickening": "Dày màng phổi - dày màng phổi thành",
    "Pneumothorax": "Tràn khí màng phổi - khí trong khoang màng phổi",
    "Pulmonary fibrosis": "Xơ phổi - tổn thương xơ hóa nhu mô phổi",
    "Rib fracture": "Gãy xương sườn - đường gãy xương sườn",
    "Other lesion": "Tổn thương khác - bất thường cần đánh giá thêm",
}

# Location mapping based on bbox position
def get_location_text(bbox: BoundingBox, image_width: int = 2048, image_height: int = 2048) -> str:
    """Determine anatomical location based on bbox position."""
    x_center = (bbox.x1 + bbox.x2) / 2
    y_center = (bbox.y1 + bbox.y2) / 2
    
    # Horizontal position
    if x_center < image_width * 0.4:
        h_pos = "phổi phải"
    elif x_center > image_width * 0.6:
        h_pos = "phổi trái"
    else:
        h_pos = "vùng trung tâm/trung thất"
    
    # Vertical position
    if y_center < image_height * 0.35:
        v_pos = "thùy trên"
    elif y_center > image_height * 0.65:
        v_pos = "thùy dưới"
    else:
        v_pos = "thùy giữa"
    
    return f"{v_pos} {h_pos}"


class MockQwenVLService:
    """Mock service that simulates Qwen-VL responses based on YOLO detections."""

    def __init__(self, model_name: Optional[str] = None):
        """Initialize mock service."""
        self.model_name = model_name or "MockQwen-VL (Testing)"
        self.model = "mock"  # Indicate it's loaded (as mock)
        self.processor = "mock"
        logger.warning("🧪 Using MOCK Qwen-VL Service - responses are simulated for testing")
        logger.info("   To use real Qwen model, set MOCK_QWEN_SERVICE=False in .env")

    def analyze(
        self,
        image: Image.Image | str,
        question: Optional[str] = None,
        yolo_detections: Optional[List[Detection]] = None,
        max_new_tokens: int = 1024,
    ) -> Tuple[str, List[Detection], int]:
        """Generate mock analysis response based on YOLO detections.
        
        Args:
            image: PIL Image or path to image file
            question: Optional question from doctor
            yolo_detections: YOLO detections to base response on
            max_new_tokens: Ignored in mock
            
        Returns:
            Tuple of (analysis text, detected bboxes (empty for mock), processing time)
        """
        start_time = time.time()
        
        # Simulate processing delay (100-500ms)
        time.sleep(random.uniform(0.1, 0.5))
        
        # Generate response based on YOLO detections
        if not yolo_detections or len(yolo_detections) == 0:
            response = ANALYSIS_TEMPLATES["normal"]
        else:
            # Build findings list
            findings_list = []
            locations_list = []
            
            for i, det in enumerate(yolo_detections, 1):
                desc = FINDING_DESCRIPTIONS.get(det.class_name, det.class_name)
                location = get_location_text(det.bbox)
                conf_level = "cao" if det.confidence > 0.7 else "trung bình" if det.confidence > 0.4 else "thấp"
                
                findings_list.append(f"  {i}. **{det.class_name}** ({desc}) - độ tin cậy {conf_level} ({det.confidence:.0%})")
                locations_list.append(f"  - {det.class_name}: {location}")
            
            findings_text = "\n".join(findings_list)
            locations_text = "\n".join(locations_list)
            
            response = ANALYSIS_TEMPLATES["with_findings"].format(
                findings=findings_text,
                locations=locations_text,
            )
        
        # If there's a specific question, add a response to it
        if question:
            response += f"\n\n---\n📝 **Trả lời câu hỏi của bác sĩ:**\n> \"{question}\"\n\n"
            response += self._generate_question_response(question, yolo_detections)
        
        processing_time = int((time.time() - start_time) * 1000)
        
        # Mock doesn't return additional detections
        return response, [], processing_time
    
    def _generate_question_response(self, question: str, detections: Optional[List[Detection]]) -> str:
        """Generate a contextual response to the doctor's question."""
        question_lower = question.lower()
        
        if any(word in question_lower for word in ["bất thường", "phát hiện", "thấy gì"]):
            if detections and len(detections) > 0:
                findings = ", ".join(set(d.class_name for d in detections))
                return f"Dựa trên phân tích, các bất thường được phát hiện bao gồm: {findings}. Cần đối chiếu với lâm sàng để xác nhận."
            else:
                return "Không phát hiện bất thường rõ rệt trên ảnh X-quang này. Tuy nhiên, cần kết hợp với khám lâm sàng để đánh giá toàn diện."
        
        elif any(word in question_lower for word in ["viêm phổi", "pneumonia"]):
            consolidation_found = any(d.class_name in ["Consolidation", "Infiltration", "Lung Opacity"] for d in (detections or []))
            if consolidation_found:
                return "Có hình ảnh đông đặc/thâm nhiễm gợi ý tổn thương viêm. Cần kết hợp với triệu chứng lâm sàng (sốt, ho, khó thở) và xét nghiệm máu để chẩn đoán viêm phổi."
            else:
                return "Không thấy hình ảnh đông đặc phổi điển hình của viêm phổi trên ảnh này. Tuy nhiên, viêm phổi giai đoạn sớm có thể chưa biểu hiện rõ trên X-quang."
        
        elif any(word in question_lower for word in ["tim", "heart", "cardiomegaly"]):
            heart_issue = any(d.class_name in ["Cardiomegaly", "Enlarged PA", "Pulmonary edema"] for d in (detections or []))
            if heart_issue:
                return "Phát hiện bóng tim to và/hoặc dấu hiệu ứ huyết phổi. Đề nghị siêu âm tim để đánh giá chức năng tim."
            else:
                return "Bóng tim trong giới hạn bình thường, chỉ số tim/ngực (CTR) ước tính < 50%."
        
        elif any(word in question_lower for word in ["u", "khối", "nodule", "mass"]):
            nodule_found = any(d.class_name in ["Nodule/Mass", "Lung Opacity"] for d in (detections or []))
            if nodule_found:
                return "Phát hiện tổn thương dạng nốt/khối. Cần đánh giá thêm bằng CT ngực để xác định tính chất và theo dõi diễn tiến."
            else:
                return "Không phát hiện tổn thương dạng nốt hay khối rõ trên ảnh X-quang này."
        
        else:
            return "Đây là kết quả phân tích sơ bộ của AI. Vui lòng đặt câu hỏi cụ thể hơn để được hỗ trợ chi tiết, hoặc tham khảo ý kiến bác sĩ chuyên khoa."
    
    def chat(
        self,
        messages: List[dict],
        image: Optional[Image.Image] = None,
        max_new_tokens: int = 512,
    ) -> Tuple[str, int]:
        """Mock multi-turn chat.
        
        Args:
            messages: List of chat messages
            image: Optional image context
            max_new_tokens: Ignored in mock
            
        Returns:
            Tuple of (response text, tokens used (simulated))
        """
        # Simulate delay
        time.sleep(random.uniform(0.1, 0.3))
        
        # Get last user message
        last_message = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                last_message = msg.get("content", "")
                break
        
        # Check if message contains AI detection results (from ai_service)
        has_detections = "Các phát hiện từ AI:" in last_message
        
        # Generate contextual response based on whether detections were found
        if has_detections:
            # Parse detection info from message
            response = self._generate_detection_based_response(last_message)
        else:
            response = self._generate_question_response(last_message, [])
        
        if not response or response == "":
            response = """Cảm ơn bạn đã sử dụng trợ lý AI phân tích X-quang.

Tôi có thể hỗ trợ:
- Phân tích ảnh X-quang ngực
- Giải thích các phát hiện bất thường
- Trả lời câu hỏi về hình ảnh

Vui lòng upload ảnh X-quang và đặt câu hỏi cụ thể để được hỗ trợ tốt nhất.

*Lưu ý: Đây là hệ thống AI hỗ trợ, kết quả cần được bác sĩ xác nhận.*"""
        
        # Simulate token count
        tokens_used = len(response) // 4 + random.randint(10, 50)
        
        return response, tokens_used
    
    def _generate_detection_based_response(self, message: str) -> str:
        """Generate response when AI detections are present in message."""
        # Extract the actual question (after the detection list)
        parts = message.split("\n\n", 1)
        question = parts[-1] if len(parts) > 1 else message
        
        # Check what was detected
        message_lower = message.lower()
        
        # Build response based on detected classes
        findings = []
        
        # Check for various conditions in the detection text
        # VinDR-CXR 14 classes + other common findings
        detection_mappings = {
            # VinDR-CXR Classes (14 classes from best.pt)
            "aortic enlargement": "Phình động mạch chủ (Aortic enlargement) - cần siêu âm tim đánh giá",
            "atelectasis": "Xẹp phổi (Atelectasis) - giảm thể tích phổi",
            "calcification": "Vôi hóa (Calcification) - có thể là tổn thương cũ đã lành",
            "cardiomegaly": "Tim to (Cardiomegaly) - chỉ số tim/ngực có thể > 50%",
            "consolidation": "Đông đặc phổi (Consolidation) - vùng mờ đồng nhất trong nhu mô",
            "ild": "Bệnh phổi kẽ (ILD) - cần HRCT để đánh giá chi tiết",
            "infiltration": "Thâm nhiễm phổi (Infiltration) - vùng mờ không đồng nhất",
            "lung opacity": "Vùng mờ phổi (Lung Opacity) - cần đối chiếu lâm sàng",
            "nodule/mass": "Nốt/Khối u phổi (Nodule/Mass) - cần CT để đánh giá chi tiết",
            "nodule": "Nốt phổi - cần theo dõi và đánh giá thêm",
            "mass": "Khối u phổi - cần CT để đánh giá chi tiết",
            "pleural effusion": "Tràn dịch màng phổi (Pleural effusion) - mờ góc sườn hoành",
            "pleural thickening": "Dày màng phổi (Pleural thickening) - có thể do viêm hoặc u",
            "pneumothorax": "Tràn khí màng phổi (Pneumothorax) - cần can thiệp nếu lượng nhiều",
            "pulmonary fibrosis": "Xơ phổi (Pulmonary fibrosis) - tổn thương xơ hóa mạn tính",
            "fibrosis": "Xơ phổi - tổn thương xơ hóa mạn tính",
            # Additional classes
            "enlarged pa": "Động mạch phổi giãn (Enlarged PA) - có thể liên quan tăng áp phổi",
            "edema": "Phù phổi (Edema) - có thể do suy tim hoặc nguyên nhân khác",
            "emphysema": "Khí phế thũng (Emphysema) - phổi căng giãn",
            "other lesion": "Tổn thương khác (Other lesion) - cần đánh giá thêm",
        }
        
        for key, description in detection_mappings.items():
            if key in message_lower:
                findings.append(description)
        
        # If we found known findings
        if findings:
            response = f"""**Kết quả phân tích ảnh X-quang:**

🔍 **Các phát hiện bất thường:**
"""
            for i, finding in enumerate(findings, 1):
                response += f"  {i}. {finding}\n"
            
            response += """
💡 **Đề xuất:**
- Đối chiếu với triệu chứng lâm sàng của bệnh nhân
- Có thể cần thêm các xét nghiệm bổ sung (CT, siêu âm, xét nghiệm máu)
- Theo dõi diễn tiến nếu cần thiết

⚠️ *Đây là kết quả phân tích AI hỗ trợ. Quyết định cuối cùng thuộc về bác sĩ.*
"""
        else:
            # Unknown class detected (like class_61 from pretrained model)
            response = """**Kết quả phân tích ảnh X-quang:**

📋 **Nhận xét:**
Hệ thống AI đã phát hiện một số vùng cần chú ý trên ảnh X-quang. Tuy nhiên, do model hiện tại chưa được fine-tune đầy đủ trên dataset y khoa, kết quả cần được bác sĩ chuyên khoa xác nhận.

💡 **Đề xuất:**
- Cần đánh giá thêm bởi bác sĩ chẩn đoán hình ảnh
- Đối chiếu với triệu chứng lâm sàng
- Có thể cần các xét nghiệm bổ sung

⚠️ *Lưu ý: Model YOLO hiện tại có thể chưa được train trên VinDR-CXR. Vui lòng kiểm tra file weights/yolo/best.pt*
"""
        
        return response


# Singleton instance
_mock_qwen_service: Optional[MockQwenVLService] = None


def get_mock_qwen_service() -> MockQwenVLService:
    """Get or create mock Qwen-VL service singleton."""
    global _mock_qwen_service
    if _mock_qwen_service is None:
        _mock_qwen_service = MockQwenVLService()
    return _mock_qwen_service
