"""
MedXrayChat Backend - Tool Definitions for Function Calling
"""
from enum import Enum
from typing import Optional, List, Any
from pydantic import BaseModel, Field


class ToolName(str, Enum):
    """Available tool names."""
    ANALYZE_XRAY = "analyze_xray"
    EXPLAIN_FINDING = "explain_finding"
    GENERATE_REPORT = "generate_report"


class ToolCall(BaseModel):
    """Represents a tool call from the LLM."""
    name: ToolName
    args: dict = Field(default_factory=dict)


class ToolResult(BaseModel):
    """Result from tool execution."""
    tool_name: ToolName
    success: bool
    data: Any = None
    error: Optional[str] = None


# Tool definitions following OpenAI/Anthropic function calling format
AVAILABLE_TOOLS = [
    {
        "name": "analyze_xray",
        "description": """Phân tích ảnh X-quang để phát hiện các bất thường bằng AI (YOLO detection).
Sử dụng khi user yêu cầu: phân tích, detect, tìm bất thường, chẩn đoán, xem có gì bất thường không, kiểm tra ảnh.
KHÔNG sử dụng khi: user chào hỏi, hỏi thông tin chung, hỏi về kết quả đã có trong context.""",
        "parameters": {
            "type": "object",
            "properties": {
                "detail_level": {
                    "type": "string",
                    "enum": ["quick", "detailed"],
                    "default": "detailed",
                    "description": "Mức độ chi tiết phân tích"
                }
            },
            "required": []
        }
    },
    {
        "name": "explain_finding",
        "description": """Giải thích chi tiết về một bất thường/bệnh lý cụ thể trên X-quang.
Sử dụng khi user hỏi: 'X là gì?', 'giải thích về Y', 'nguyên nhân của Z', 'Y có nguy hiểm không?'.""",
        "parameters": {
            "type": "object",
            "properties": {
                "finding_name": {
                    "type": "string",
                    "description": "Tên bất thường cần giải thích (VD: Cardiomegaly, Pleural effusion, Pneumothorax)"
                },
                "include_treatment": {
                    "type": "boolean",
                    "default": False,
                    "description": "Có bao gồm thông tin điều trị không"
                }
            },
            "required": ["finding_name"]
        }
    },
    {
        "name": "generate_report",
        "description": """Tạo báo cáo chẩn đoán chuyên nghiệp từ kết quả phân tích.
Sử dụng khi user yêu cầu: tạo báo cáo, xuất report, viết kết luận, tổng hợp kết quả.""",
        "parameters": {
            "type": "object",
            "properties": {
                "format": {
                    "type": "string",
                    "enum": ["standard", "detailed", "summary"],
                    "default": "standard",
                    "description": "Định dạng báo cáo: standard (chuẩn), detailed (chi tiết), summary (tóm tắt)"
                },
                "include_recommendations": {
                    "type": "boolean",
                    "default": True,
                    "description": "Có bao gồm khuyến nghị theo dõi/điều trị không"
                }
            },
            "required": []
        }
    }
]


def get_tool_by_name(name: str) -> Optional[dict]:
    """Get tool definition by name.

    Args:
        name: Tool name to look up

    Returns:
        Tool definition dict or None if not found
    """
    for tool in AVAILABLE_TOOLS:
        if tool["name"] == name:
            return tool
    return None


def get_tools_description() -> str:
    """Get formatted description of all tools for system prompt.

    Returns:
        Formatted string describing all available tools
    """
    lines = []
    for i, tool in enumerate(AVAILABLE_TOOLS, 1):
        lines.append(f"{i}. **{tool['name']}**: {tool['description'].split(chr(10))[0]}")

        # Add usage hints
        desc_lines = tool['description'].split('\n')
        for line in desc_lines[1:]:
            if line.strip():
                lines.append(f"   {line.strip()}")

    return "\n".join(lines)


def format_tool_call_instruction() -> str:
    """Get instruction for how to format tool calls.

    Returns:
        Instruction string for the LLM
    """
    return """## Response Format
Nếu CẦN sử dụng tool, trả về CHÍNH XÁC format JSON (không có text khác):
{"tool_call": {"name": "tool_name", "args": {"param": "value"}}}

Nếu KHÔNG cần tool, trả lời bình thường bằng text tiếng Việt.

## Important Rules
- CHỈ gọi tool khi user THỰC SỰ yêu cầu hành động đó
- Nếu đã có kết quả phân tích trong context, THAM KHẢO kết quả đó thay vì gọi analyze_xray lại
- Với câu hỏi đơn giản, chào hỏi, hoặc hỏi thông tin chung → trả lời trực tiếp, KHÔNG gọi tool
- Khi không chắc chắn → trả lời trực tiếp, KHÔNG gọi tool"""
