# YOLOv11-MFF Custom Modules
# Paper: "YOLOv11-MFF: A multi-scale frequency-adaptive fusion network for enhanced CXR anomaly detection"

from torch import nn
import torch
import numpy as np

# Import from ultralytics (works when copied into ultralytics/nn/modules/)
try:
    from ultralytics.nn.modules.block import C2f, C3
except ImportError:
    from ultralytics.nn.modules import C2f, C3

__all__ = ["FAHG", "FFM_Concat", "MSPLC", "C3_MSLC", "C3_MSLC2"]


class FAHG(nn.Module):
    """
    Frequency-Adaptive Hybrid Gate (FAHG) Module.
    
    Enhances contrast differentiation between lesions and background by processing
    different frequency bands with specialized attention mechanisms.
    
    Args:
        in_channel (int): Number of input channels.
        se_ratio (int): Squeeze-and-Excitation ratio. Default: 16.
        requires_grad (bool): Whether scale parameters require gradients. Default: True.
    """
    def __init__(self, in_channel, se_ratio=16, requires_grad=True):
        super().__init__()
        self.in_channel = in_channel
        self.se_ratio = se_ratio

        # Channel attention for low frequency
        self.decompose_low = nn.Conv2d(self.in_channel, 1, kernel_size=1)
        self.decompose_mid = nn.Conv2d(self.in_channel, 1, kernel_size=1)
        self.decompose_act = nn.GELU()
        self.scale_low = nn.Parameter(0. * torch.ones((1, self.in_channel, 1, 1)), requires_grad=requires_grad)
        self.scale_mid = nn.Parameter(0. * torch.ones((1, self.in_channel, 1, 1)), requires_grad=requires_grad)

        # SE attention for high frequency
        self.se_global_pool = nn.AdaptiveAvgPool2d((1, 1))
        self.se_fc = nn.Sequential(
            nn.Linear(self.in_channel, self.in_channel // self.se_ratio, bias=False),
            nn.ReLU(),
            nn.Linear(self.in_channel // self.se_ratio, self.in_channel, bias=False),
            nn.Sigmoid()
        )

    def filter_frequency_bands(self, x, cutoff=0.2):
        """
        Filter input tensor into low, mid, and high frequency bands using FFT.
        
        Args:
            x (Tensor): Input tensor of shape (B, C, H, W).
            cutoff (float): Cutoff ratio for frequency separation. Default: 0.2.
            
        Returns:
            tuple: (low_freq_tensor, mid_freq_tensor, high_freq_tensor)
        """
        device = x.device
        B, C, H, W = x.shape
        
        # 2D FFT and shift low frequency to center
        fft_tensor = torch.fft.fftshift(torch.fft.fft2(x, dim=(-2, -1)), dim=(-2, -1))

        def create_filter(shape, low_cutoff, high_cutoff, mode='band', device=device):
            """Create frequency filter mask."""
            rows, cols = shape
            center_row, center_col = rows // 2, cols // 2
            y, x = torch.meshgrid(
                torch.arange(rows, device=device),
                torch.arange(cols, device=device),
                indexing='ij',
            )
            distance = torch.sqrt((y - center_row) ** 2 + (x - center_col) ** 2)
            mask = torch.zeros((rows, cols), dtype=torch.float32, device=device)
            
            if mode == 'low':
                mask[distance <= low_cutoff] = 1
            elif mode == 'high':
                mask[distance >= high_cutoff] = 1
            elif mode == 'band':
                mask[(distance > low_cutoff) & (distance < high_cutoff)] = 1
            return mask

        # Calculate cutoff radii
        max_radius = np.sqrt((H // 2) ** 2 + (W // 2) ** 2)
        low_cutoff = max_radius * cutoff
        high_cutoff = max_radius * (1 - cutoff)

        # Create filters
        low_pass_filter = create_filter((H, W), low_cutoff, None, mode='low')[None, None, :, :]
        high_pass_filter = create_filter((H, W), None, high_cutoff, mode='high')[None, None, :, :]
        mid_pass_filter = create_filter((H, W), low_cutoff, high_cutoff, mode='band')[None, None, :, :]

        # Apply filters
        low_freq_fft = fft_tensor * low_pass_filter
        high_freq_fft = fft_tensor * high_pass_filter
        mid_freq_fft = fft_tensor * mid_pass_filter

        # Inverse FFT
        low_freq_tensor = torch.fft.ifft2(torch.fft.ifftshift(low_freq_fft, dim=(-2, -1)), dim=(-2, -1)).real
        high_freq_tensor = torch.fft.ifft2(torch.fft.ifftshift(high_freq_fft, dim=(-2, -1)), dim=(-2, -1)).real
        mid_freq_tensor = torch.fft.ifft2(torch.fft.ifftshift(mid_freq_fft, dim=(-2, -1)), dim=(-2, -1)).real

        return low_freq_tensor, mid_freq_tensor, high_freq_tensor

    def ca_low_forward(self, x):
        """Channel attention for low frequency components."""
        temp = self.decompose_low(x)
        temp = self.decompose_act(temp)
        temp = x - temp
        temp = self.scale_low * temp
        x = x + temp
        return x

    def ca_mid_forward(self, x):
        """Channel attention for mid frequency components."""
        temp = self.decompose_mid(x)
        temp = self.decompose_act(temp)
        temp = x - temp
        temp = self.scale_mid * temp
        x = x + temp
        return x

    def se_high_forward(self, x):
        """Squeeze-and-Excitation attention for high frequency components."""
        b, c, _, _ = x.size()
        c_weight_temp = self.se_global_pool(x).view(b, c)
        c_weight = self.se_fc(c_weight_temp)
        c_weight = c_weight.view(b, c, 1, 1)
        return x * c_weight

    def forward(self, x):
        """Forward pass combining all frequency band processing."""
        low_freq_x, mid_freq_x, high_freq_x = self.filter_frequency_bands(x)
        low_freq_x = self.ca_low_forward(low_freq_x)
        mid_freq_x = self.ca_mid_forward(mid_freq_x)
        high_freq_x = self.se_high_forward(high_freq_x)
        return low_freq_x + mid_freq_x + high_freq_x


class FFM_Concat(nn.Module):
    """
    Feature Fusion Module with learnable channel-wise weights.
    
    Extends standard concatenation with learnable weights for each channel,
    enabling the network to learn the importance of different feature maps.
    
    Args:
        dimension (int): Concatenation dimension. Default: 1.
        Channel1 (int): Number of channels in first input. Default: 1.
        Channel2 (int): Number of channels in second input. Default: 1.
    """
    def __init__(self, dimension=1, Channel1=1, Channel2=1):
        super().__init__()
        self.d = dimension
        self.Channel1 = Channel1
        self.Channel2 = Channel2
        self.Channel_all = int(Channel1 + Channel2)
        self.w = nn.Parameter(torch.ones(self.Channel_all, dtype=torch.float32), requires_grad=True)
        self.epsilon = 0.0001

    def forward(self, x):
        """
        Concatenate input tensors with learnable channel weights.
        
        Args:
            x (List[torch.Tensor]): List of two input tensors.
            
        Returns:
            torch.Tensor: Weighted concatenated tensor.
        """
        _, C1, _, _ = x[0].size()
        _, C2, _, _ = x[1].size()
        w = self.w[:(C1 + C2)]
        weight = w / (torch.sum(w, dim=0) + self.epsilon)
        x1 = weight[:C1][None, :, None, None] * x[0]
        x2 = weight[C1:][None, :, None, None] * x[1]
        x = [x1, x2]
        return torch.cat(x, self.d)


class MSPLC(nn.Module):
    """
    Multi-Scale Parallel Large Convolution (MSPLC) Block.
    
    Expands receptive field using parallel dilated convolutions with different kernel sizes.
    
    Args:
        dim (int): Number of input/output channels.
        shortcut (bool): Whether to use residual connection. Default: True.
    """
    def __init__(self, dim, shortcut=True):
        super().__init__()
        self.norm1 = nn.BatchNorm2d(dim)
        self.shortcut = shortcut

        # Convolution layers
        self.conv1 = nn.Conv2d(dim, dim, kernel_size=1)
        self.conv2 = nn.Conv2d(dim, dim, kernel_size=5, padding=2, padding_mode='reflect')

        # Parallel dilated convolutions
        self.conv3_5 = nn.Conv2d(dim, dim, kernel_size=5, padding=6, groups=dim, dilation=3, padding_mode='reflect')
        self.conv3_3 = nn.Conv2d(dim, dim, kernel_size=3, padding=3, groups=dim, dilation=3, padding_mode='reflect')

        # Fusion conv
        self.conv3 = nn.Conv2d(2 * dim, dim, kernel_size=1)

    def forward(self, x):
        """Forward pass with optional shortcut connection."""
        identity = x
        x = self.norm1(x)
        x = self.conv1(x)
        x = self.conv2(x)
        x = torch.cat([self.conv3_5(x), self.conv3_3(x)], dim=1)
        x = self.conv3(x)
        return x + identity if self.shortcut else x


class C3_MSLC(C3):
    """
    C3 block with MSPLC replacing standard Bottleneck.
    
    Args:
        c1 (int): Input channels.
        c2 (int): Output channels.
        n (int): Number of MSPLC blocks.
        shortcut (bool): Whether to use shortcut connections.
        g (int): Groups for convolutions.
        e (float): Expansion ratio.
    """
    def __init__(self, c1, c2, n=1, shortcut=True, g=1, e=0.5):
        super().__init__(c1, c2, n, shortcut, g, e)
        c_ = int(c2 * e)
        self.m = nn.Sequential(*(MSPLC(c_, shortcut) for _ in range(n)))


class C3_MSLC2(C2f):
    """
    C2f-style block with MSPLC for multi-scale feature extraction.
    
    Replaces C3k2 in YOLOv11 backbone for improved receptive field.
    
    Args:
        c1 (int): Input channels.
        c2 (int): Output channels.
        n (int): Number of blocks.
        c3_mslc (bool): Whether to use nested C3_MSLC blocks.
        e (float): Expansion ratio.
        g (int): Groups for convolutions.
        shortcut (bool): Whether to use shortcut connections.
    """
    def __init__(self, c1, c2, n=1, c3_mslc=False, e=0.5, g=1, shortcut=True):
        super().__init__(c1, c2, n, shortcut, g, e)
        self.m = nn.ModuleList(
            C3_MSLC(self.c, self.c, 2, shortcut, g, e) if c3_mslc else MSPLC(self.c, shortcut) 
            for _ in range(n)
        )
