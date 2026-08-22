from PIL import Image
import sys
import os

src = sys.argv[1] if len(sys.argv) > 1 else "D:/EDG/software/weixinkaifa/WorkBuddy/工作台/generated-images/icon_flat_check.png"
out_dir = sys.argv[2] if len(sys.argv) > 2 else "D:/EDG/software/Workbench/assets/icons"

img = Image.open(src).convert("RGBA")

# 如果源图有灰底，先简单裁剪到非透明/有色内容的外接矩形（这里源图是方图，直接居中缩放到目标尺寸）

def make_size(size):
    return img.resize((size, size), Image.LANCZOS)

def make_maskable(size):
    """maskable: 内容放在 70% 安全区域内，背景 navy 填满"""
    bg = Image.new("RGBA", (size, size), (10, 30, 50, 255))  # 接近原图 navy
    content_size = int(size * 0.72)
    content = img.resize((content_size, content_size), Image.LANCZOS)
    offset = (size - content_size) // 2
    bg.paste(content, (offset, offset), content)
    return bg

def save_overwrite(path, img_obj):
    if os.path.exists(path):
        os.remove(path)
    img_obj.save(path)

save_overwrite(os.path.join(out_dir, "icon-192.png"), make_size(192))
save_overwrite(os.path.join(out_dir, "icon-512.png"), make_size(512))
save_overwrite(os.path.join(out_dir, "icon-maskable-512.png"), make_maskable(512))
save_overwrite(os.path.join(out_dir, "apple-touch-icon.png"), make_size(180))

print("done")
