"""
MedXrayChat Backend - Report Endpoints

Provides diagnosis report generation with PDF export.
"""
import uuid
from typing import Optional
from io import BytesIO
from pathlib import Path
from datetime import datetime

from fastapi import APIRouter, HTTPException, status, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from loguru import logger

from models import Study, DiagnosisReport, Image, AIResult
from schemas import ReportCreate, ReportResponse
from api.deps import CurrentUser, DbSession
from services import get_ai_service
from core.rate_limit import limiter


router = APIRouter(prefix="/reports", tags=["Reports"])


@router.post("", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
async def create_report(
    report_in: ReportCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> ReportResponse:
    """Create or update a diagnosis report for a study."""
    # Verify study ownership
    study_result = await db.execute(
        select(Study).where(Study.id == report_in.study_id, Study.user_id == current_user.id)
    )
    if not study_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study not found"
        )
    
    report = DiagnosisReport(
        study_id=report_in.study_id,
        user_id=current_user.id,
        findings=report_in.findings,
        impression=report_in.impression,
        recommendations=report_in.recommendations,
        is_ai_generated=False,
    )
    
    db.add(report)
    await db.commit()
    await db.refresh(report)
    
    return report


@router.post("/generate/{study_id}", response_model=ReportResponse)
@limiter.limit("5/minute")
async def generate_ai_report(
    request: Request,
    study_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> ReportResponse:
    """Generate an AI diagnosis report based on analysis results."""
    # Get study with images and AI results
    study_result = await db.execute(
        select(Study)
        .options(selectinload(Study.images).selectinload(Image.ai_results))
        .where(Study.id == study_id, Study.user_id == current_user.id)
    )
    study = study_result.scalar_one_or_none()
    
    if not study:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study not found"
        )
    
    if not study.images:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Study has no images to analyze"
        )
    
    # Collect all AI analysis results
    all_findings = []
    all_detections = []
    
    for image in study.images:
        if image.ai_results:
            latest_result = sorted(image.ai_results, key=lambda r: r.created_at, reverse=True)[0]
            if latest_result.analysis_text:
                all_findings.append(latest_result.analysis_text)
            if latest_result.fused_detections:
                all_detections.extend(latest_result.fused_detections)
    
    # Generate report content using AI
    ai_service = get_ai_service()
    
    # Build findings from detections
    findings = _generate_findings(all_detections, all_findings)
    impression = _generate_impression(all_detections)
    recommendations = _generate_recommendations(all_detections)
    
    # Create report
    report = DiagnosisReport(
        study_id=study_id,
        user_id=current_user.id,
        findings=findings,
        impression=impression,
        recommendations=recommendations,
        is_ai_generated=True,
    )
    
    db.add(report)
    await db.commit()
    await db.refresh(report)
    
    return report


@router.get("/{study_id}", response_model=ReportResponse)
async def get_report(
    study_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> ReportResponse:
    """Get the latest report for a study."""
    # Verify study ownership
    study_result = await db.execute(
        select(Study).where(Study.id == study_id, Study.user_id == current_user.id)
    )
    if not study_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study not found"
        )
    
    # Get latest report
    report_result = await db.execute(
        select(DiagnosisReport)
        .where(DiagnosisReport.study_id == study_id)
        .order_by(DiagnosisReport.created_at.desc())
        .limit(1)
    )
    report = report_result.scalar_one_or_none()
    
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No report found for this study"
        )
    
    return report


@router.get("/{report_id}/pdf")
async def export_report_pdf(
    report_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    """Export report as PDF."""
    # Get report with study info
    report_result = await db.execute(
        select(DiagnosisReport)
        .options(selectinload(DiagnosisReport.study))
        .where(DiagnosisReport.id == report_id)
    )
    report = report_result.scalar_one_or_none()
    
    if not report or report.study.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found"
        )
    
    # Generate PDF
    pdf_buffer = _generate_pdf(report)
    
    filename = f"report_{report.study_id}_{datetime.now().strftime('%Y%m%d')}.pdf"
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


def _generate_findings(detections: list, ai_texts: list) -> str:
    """Generate findings section from detections."""
    if not detections and not ai_texts:
        return "Không phát hiện bất thường rõ rệt trên hình ảnh X-quang."
    
    findings = []
    
    # Group detections by class
    detection_groups = {}
    for det in detections:
        cls_name = det.get("class_name", "Unknown")
        if cls_name not in detection_groups:
            detection_groups[cls_name] = []
        detection_groups[cls_name].append(det)
    
    # Generate findings for each detected condition
    for cls_name, dets in detection_groups.items():
        avg_conf = sum(d.get("confidence", 0) for d in dets) / len(dets)
        if avg_conf > 0.5:
            findings.append(f"- {cls_name}: Phát hiện với độ tin cậy {avg_conf:.0%}")
        else:
            findings.append(f"- {cls_name}: Nghi ngờ (độ tin cậy {avg_conf:.0%})")
    
    # Add AI analysis text
    if ai_texts:
        findings.append("\nPhân tích chi tiết từ AI:")
        findings.extend(ai_texts[:3])  # Limit to 3 analysis texts
    
    return "\n".join(findings)


def _generate_impression(detections: list) -> str:
    """Generate impression/conclusion from detections."""
    if not detections:
        return "Hình ảnh X-quang phổi trong giới hạn bình thường."
    
    # Count significant findings
    high_conf = [d for d in detections if d.get("confidence", 0) > 0.5]
    
    if len(high_conf) == 0:
        return "Một số dấu hiệu nghi ngờ cần theo dõi thêm."
    elif len(high_conf) <= 2:
        classes = list(set(d.get("class_name") for d in high_conf))
        return f"Phát hiện {', '.join(classes)}. Đề nghị đối chiếu lâm sàng."
    else:
        return "Nhiều bất thường được phát hiện. Cần đánh giá lâm sàng chi tiết."


def _generate_recommendations(detections: list) -> str:
    """Generate recommendations based on findings."""
    if not detections:
        return "Khám định kỳ theo lịch."
    
    recommendations = ["Các đề xuất dựa trên kết quả phân tích AI:"]
    
    classes = set(d.get("class_name") for d in detections)
    
    if any("Nodule" in c or "Mass" in c for c in classes):
        recommendations.append("- CT scan ngực để đánh giá chi tiết tổn thương")
    if any("effusion" in c.lower() for c in classes):
        recommendations.append("- Siêu âm ngực, xem xét chọc dịch nếu cần")
    if any("Pneumothorax" in c for c in classes):
        recommendations.append("- Đánh giá lâm sàng khẩn, xem xét dẫn lưu nếu tràn khí lớn")
    if any("Cardiomegaly" in c for c in classes):
        recommendations.append("- Siêu âm tim, ECG")
    
    if len(recommendations) == 1:
        recommendations.append("- Tái khám và theo dõi tiến triển")
    
    recommendations.append("\n*Lưu ý: Đây là kết quả hỗ trợ từ AI, quyết định cuối cùng thuộc về bác sĩ.*")
    
    return "\n".join(recommendations)


def _generate_pdf(report: DiagnosisReport) -> BytesIO:
    """Generate PDF from report data."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4)
        styles = getSampleStyleSheet()
        
        # Custom style for Vietnamese text
        styles.add(ParagraphStyle(
            name='Vietnamese',
            fontName='Helvetica',
            fontSize=11,
            leading=14,
        ))
        
        elements = []
        
        # Header
        elements.append(Paragraph("<b>BÁO CÁO CHẨN ĐOÁN HÌNH ẢNH</b>", styles['Title']))
        elements.append(Spacer(1, 0.5*cm))
        
        # Study info
        study = report.study
        elements.append(Paragraph(f"<b>Mã bệnh nhân:</b> {study.patient_id or 'N/A'}", styles['Vietnamese']))
        elements.append(Paragraph(f"<b>Tên bệnh nhân:</b> {study.patient_name or 'N/A'}", styles['Vietnamese']))
        elements.append(Paragraph(f"<b>Ngày khám:</b> {report.created_at.strftime('%d/%m/%Y')}", styles['Vietnamese']))
        elements.append(Spacer(1, 0.5*cm))
        
        # Findings
        elements.append(Paragraph("<b>KẾT QUẢ PHÂN TÍCH:</b>", styles['Heading2']))
        if report.findings:
            for line in report.findings.split('\n'):
                elements.append(Paragraph(line, styles['Vietnamese']))
        elements.append(Spacer(1, 0.3*cm))
        
        # Impression
        elements.append(Paragraph("<b>KẾT LUẬN:</b>", styles['Heading2']))
        if report.impression:
            elements.append(Paragraph(report.impression, styles['Vietnamese']))
        elements.append(Spacer(1, 0.3*cm))
        
        # Recommendations
        elements.append(Paragraph("<b>ĐỀ XUẤT:</b>", styles['Heading2']))
        if report.recommendations:
            for line in report.recommendations.split('\n'):
                elements.append(Paragraph(line, styles['Vietnamese']))
        
        # Footer
        elements.append(Spacer(1, 1*cm))
        if report.is_ai_generated:
            elements.append(Paragraph(
                "<i>*Báo cáo này được tạo bởi hệ thống AI. Kết quả cần được xác nhận bởi bác sĩ.*</i>",
                styles['Vietnamese']
            ))
        
        doc.build(elements)
        buffer.seek(0)
        return buffer
        
    except ImportError:
        logger.warning("reportlab not installed, returning simple text PDF")
        # Fallback: return simple text
        buffer = BytesIO()
        content = f"""
DIAGNOSIS REPORT
================
Study: {report.study_id}
Date: {report.created_at}

FINDINGS:
{report.findings or 'N/A'}

IMPRESSION:
{report.impression or 'N/A'}

RECOMMENDATIONS:
{report.recommendations or 'N/A'}
"""
        buffer.write(content.encode('utf-8'))
        buffer.seek(0)
        return buffer
