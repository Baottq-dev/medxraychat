"""
MedXrayChat Backend - Image Utilities
Helper functions for loading and processing medical images.
"""
from pathlib import Path
from PIL import Image as PILImage
import numpy as np
from loguru import logger


def load_image_from_file(file_path: str) -> PILImage.Image:
    """
    Load image from file, supporting both DICOM and regular image formats.
    
    Args:
        file_path: Path to the image file
        
    Returns:
        PIL Image in RGB format
    """
    path = Path(file_path)
    
    # Try to load as DICOM first if extension suggests it
    if path.suffix.lower() in ['.dcm', '.dicom', '']:
        try:
            import pydicom
            ds = pydicom.dcmread(file_path)
            pixel_array = ds.pixel_array
            
            # Normalize to 8-bit
            if pixel_array.dtype != np.uint8:
                pixel_array = pixel_array.astype(np.float32)
                pixel_array = (pixel_array - pixel_array.min()) / (pixel_array.max() - pixel_array.min() + 1e-8)
                pixel_array = (pixel_array * 255).astype(np.uint8)
            
            # Convert to RGB
            if len(pixel_array.shape) == 2:
                image = PILImage.fromarray(pixel_array).convert("RGB")
            else:
                image = PILImage.fromarray(pixel_array).convert("RGB")
            
            return image
        except Exception as e:
            logger.warning(f"Failed to load as DICOM: {e}, trying as regular image")
    
    # Fall back to regular image loading
    return PILImage.open(file_path).convert("RGB")
