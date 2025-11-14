from PIL import Image, ImageDraw
import os

# Create icons directory if it doesn't exist
os.makedirs('icons', exist_ok=True)

# Create icons in different sizes
sizes = [16, 48, 128]

for size in sizes:
    # Create a new image with red background
    img = Image.new('RGB', (size, size), color='#FF0000')
    draw = ImageDraw.Draw(img)
    
    # Draw a white circle in the center
    padding = size // 8
    draw.ellipse([padding, padding, size-padding, size-padding], fill='white')
    
    # Draw a red cross/plus in the center
    line_width = max(2, size // 16)
    center = size // 2
    cross_size = size // 3
    
    # Vertical line
    draw.rectangle([center - line_width, center - cross_size, 
                   center + line_width, center + cross_size], fill='#FF0000')
    # Horizontal line
    draw.rectangle([center - cross_size, center - line_width, 
                   center + cross_size, center + line_width], fill='#FF0000')
    
    # Save the icon
    img.save(f'icons/icon{size}.png')
    print(f'Created icon{size}.png')

print('All icons created successfully!')
