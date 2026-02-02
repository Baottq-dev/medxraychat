"""
MedXrayChat Backend - Tool Definitions for Function Calling

Includes tool definitions and a robust ToolCallParser for extracting
tool calls from LLM responses with multiple fallback strategies.
"""
import json
import re
from enum import Enum
from typing import Optional, List, Any
from pydantic import BaseModel, Field, field_validator, ValidationError
from loguru import logger


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


class ToolCallParser:
    """Robust tool call parser with multiple fallback strategies.

    Parsing strategies (in order):
    1. Direct JSON parse - Entire response is valid JSON
    2. Code block extraction - JSON in markdown code blocks
    3. JSON object finding - Find JSON object anywhere in text
    4. Fuzzy matching - Match tool names by keywords

    Example:
        tool_call = ToolCallParser.parse(response_text)
        if tool_call:
            execute_tool(tool_call)
    """

    # Trigger keywords for fuzzy matching (Vietnamese and English)
    TOOL_TRIGGERS = {
        ToolName.ANALYZE_XRAY: [
            "analyze_xray", "phân tích", "detect", "kiểm tra ảnh",
            "xem ảnh", "bất thường", "chẩn đoán", "phát hiện"
        ],
        ToolName.EXPLAIN_FINDING: [
            "explain_finding", "giải thích", "là gì", "nguyên nhân",
            "explain", "what is"
        ],
        ToolName.GENERATE_REPORT: [
            "generate_report", "báo cáo", "report", "tạo báo cáo",
            "xuất report", "viết kết luận"
        ],
    }

    @classmethod
    def parse(cls, response: str) -> Optional[ToolCall]:
        """Parse tool call from LLM response using multiple strategies.

        Args:
            response: Raw response text from LLM

        Returns:
            ToolCall if found, None otherwise
        """
        if not response or not response.strip():
            return None

        # Strategy 1: Direct JSON parse
        result = cls._try_direct_json(response)
        if result:
            logger.debug(f"Tool call parsed via direct JSON: {result.name}")
            return result

        # Strategy 2: Extract from markdown code blocks
        result = cls._try_code_block(response)
        if result:
            logger.debug(f"Tool call parsed from code block: {result.name}")
            return result

        # Strategy 3: Find JSON object anywhere in text
        result = cls._try_find_json(response)
        if result:
            logger.debug(f"Tool call found in text: {result.name}")
            return result

        # Strategy 4: Fuzzy match tool names (last resort)
        result = cls._try_fuzzy_match(response)
        if result:
            logger.debug(f"Tool call fuzzy matched: {result.name}")
            return result

        return None

    @classmethod
    def _try_direct_json(cls, text: str) -> Optional[ToolCall]:
        """Try parsing entire response as JSON."""
        try:
            text = text.strip()
            data = json.loads(text)
            return cls._validate_and_create(data)
        except (json.JSONDecodeError, ValidationError):
            return None

    @classmethod
    def _try_code_block(cls, text: str) -> Optional[ToolCall]:
        """Extract JSON from markdown code blocks."""
        patterns = [
            r'```json\s*(.*?)\s*```',
            r'```\s*(\{.*?\})\s*```',
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.DOTALL)
            if match:
                try:
                    data = json.loads(match.group(1))
                    result = cls._validate_and_create(data)
                    if result:
                        return result
                except (json.JSONDecodeError, ValidationError):
                    continue
        return None

    @classmethod
    def _try_find_json(cls, text: str) -> Optional[ToolCall]:
        """Find JSON object anywhere in text using bracket matching."""
        depth = 0
        start_idx = None

        for i, char in enumerate(text):
            if char == '{':
                if depth == 0:
                    start_idx = i
                depth += 1
            elif char == '}':
                depth -= 1
                if depth == 0 and start_idx is not None:
                    try:
                        json_str = text[start_idx:i + 1]
                        data = json.loads(json_str)
                        result = cls._validate_and_create(data)
                        if result:
                            return result
                    except (json.JSONDecodeError, ValidationError):
                        pass
                    start_idx = None

        return None

    @classmethod
    def _try_fuzzy_match(cls, text: str) -> Optional[ToolCall]:
        """Fuzzy match tool names based on keywords in text."""
        text_lower = text.lower()

        for tool_name, triggers in cls.TOOL_TRIGGERS.items():
            for trigger in triggers:
                if trigger in text_lower:
                    # Extract finding name for explain_finding if possible
                    if tool_name == ToolName.EXPLAIN_FINDING:
                        args = cls._extract_finding_name(text)
                    else:
                        args = {}

                    logger.debug(
                        f"Fuzzy matched tool '{tool_name}' from trigger '{trigger}'"
                    )
                    return ToolCall(name=tool_name, args=args)

        return None

    @classmethod
    def _extract_finding_name(cls, text: str) -> dict:
        """Try to extract finding name from text for explain_finding tool."""
        # Common finding names
        findings = [
            "Cardiomegaly", "Pleural effusion", "Pneumothorax",
            "Atelectasis", "Consolidation", "Edema", "Emphysema",
            "Nodule", "Mass", "Infiltration", "Pneumonia",
            "Aortic enlargement", "Calcification", "Fibrosis",
        ]

        text_lower = text.lower()
        for finding in findings:
            if finding.lower() in text_lower:
                return {"finding_name": finding}

        return {}

    @classmethod
    def _validate_and_create(cls, data: dict) -> Optional[ToolCall]:
        """Validate data structure and create ToolCall.

        Args:
            data: Parsed JSON data

        Returns:
            ToolCall if valid, None otherwise
        """
        try:
            # Handle nested format: {"tool_call": {...}}
            if "tool_call" in data:
                data = data["tool_call"]

            # Validate required fields
            name = data.get("name")
            if not name:
                return None

            # Validate tool name
            try:
                tool_name = ToolName(name)
            except ValueError:
                logger.debug(f"Unknown tool name: {name}")
                return None

            args = data.get("args", {})

            return ToolCall(name=tool_name, args=args)

        except (KeyError, TypeError) as e:
            logger.debug(f"Tool call validation failed: {e}")
            return None
