import os
import sys
import colorsys
from PIL import Image

def process_image(input_path, output_path, brightness_factor=1.0, contrast_factor=1.0):
    print(f"Processing {input_path} -> {output_path}...")
    if not os.path.exists(input_path):
        print(f"Error: Input file {input_path} does not exist.")
        return False

    img = Image.open(input_path).convert("RGBA")
    width, height = img.size
    data = img.getdata()
    
    new_data = []
    for item in data:
        r, g, b, a = item
        
        # 1. Invert colors
        ir, ig, ib = 255 - r, 255 - g, 255 - b
        
        # 2. Hue rotate by 180 degrees (0.5 in colorsys scale)
        h, s, v = colorsys.rgb_to_hsv(ir / 255.0, ig / 255.0, ib / 255.0)
        h = (h + 0.5) % 1.0
        
        # Apply brightness adjustment to V (value) channel
        v = min(1.0, max(0.0, v * brightness_factor))
        
        # Convert back to RGB
        nr, ng, nb = colorsys.hsv_to_rgb(h, s, v)
        fr, fg, fb = int(nr * 255), int(ng * 255), int(nb * 255)
        
        # Apply contrast adjustment if not 1.0
        if contrast_factor != 1.0:
            # Shift to center around 128
            fr = int(128 + (fr - 128) * contrast_factor)
            fg = int(128 + (fg - 128) * contrast_factor)
            fb = int(128 + (fb - 128) * contrast_factor)
            
            # Clamp to 0-255
            fr = min(255, max(0, fr))
            fg = min(255, max(0, fg))
            fb = min(255, max(0, fb))
            
        new_data.append((fr, fg, fb, a))
        
    img.putdata(new_data)
    img.save(output_path, "PNG")
    print(f"Successfully saved to {output_path}")
    return True

def main():
    assets_dir = "results/01-pitch-deck/assets"
    
    # 1. Slide 1 Background (Title)
    # CSS used: invert(1) hue-rotate(180deg) brightness(1.15) contrast(0.9)
    process_image(
        os.path.join(assets_dir, "slide_1_title.png"),
        os.path.join(assets_dir, "slide_1_title_light.png"),
        brightness_factor=1.15,
        contrast_factor=0.9
    )
    
    # 2. Slide 3 Background (Why Now)
    # CSS used: invert(1) hue-rotate(180deg) brightness(1.15)
    process_image(
        os.path.join(assets_dir, "slide_3_whynow.png"),
        os.path.join(assets_dir, "slide_3_whynow_light.png"),
        brightness_factor=1.15,
        contrast_factor=1.0
    )
    
    # 3. Slide 6 Background (Product swarm UI)
    # CSS used: invert(1) hue-rotate(180deg) brightness(1.1)
    process_image(
        os.path.join(assets_dir, "slide_6_product.png"),
        os.path.join(assets_dir, "slide_6_product_light.png"),
        brightness_factor=1.1,
        contrast_factor=1.0
    )

if __name__ == "__main__":
    main()
