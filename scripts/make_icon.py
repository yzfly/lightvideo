# 生成应用图标 1024x1024: 蓝色渐变圆角矩形 + 白色播放三角 + 速度光痕
# 用法: uv run --with pillow python scripts/make_icon.py
from PIL import Image, ImageDraw, ImageFilter

S = 1024  # 画布
M = 78    # macOS 图标四周留白 (Apple 规范图标占 ~85%)
R = 200   # 圆角半径 (~23% 的图标宽度)

SS = 4    # 超采样抗锯齿
s, m, r = S * SS, M * SS, R * SS

# ---- 渐变底 (对角线性: 亮蓝 -> 深蓝, 单一色相不混紫) ----
top = (107, 219, 255)    # #6BDBFF 青
bottom = (46, 139, 255)  # #2E8BFF 亮蓝
grad = Image.new("RGB", (s, s))
px = grad.load()
for y in range(s):
    for x in range(0, s, 8):  # 对角插值, 8px 步进后拉伸平滑
        t = (x + y) / (2 * s)
        c = tuple(int(a + (b - a) * t) for a, b in zip(top, bottom))
        for dx in range(8):
            if x + dx < s:
                px[x + dx, y] = c

# 左上角柔和高光, 打破均匀渐变
light = Image.new("L", (s, s), 0)
ld = ImageDraw.Draw(light)
ld.ellipse([-s * 0.35, -s * 0.45, s * 0.75, s * 0.55], fill=70)
light = light.filter(ImageFilter.GaussianBlur(s * 0.10))
white = Image.new("RGB", (s, s), (255, 255, 255))
grad = Image.composite(white, grad, light.point(lambda v: v))

# ---- 圆角遮罩 ----
mask = Image.new("L", (s, s), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle([m, m, s - m, s - m], radius=r, fill=255)

icon = Image.new("RGBA", (s, s), (0, 0, 0, 0))
icon.paste(grad, (0, 0), mask)

d = ImageDraw.Draw(icon)

# ---- 白色圆角播放三角 (视觉中心右偏, 光学居中) ----
# 圆角实现: 画在独立蒙版上 -> 高斯模糊 -> 阈值二值化, 角部自然变圆
cx, cy = s * 0.565, s * 0.5
w, h = s * 0.30, s * 0.34
tri = [(cx - w * 0.42, cy - h / 2), (cx + w * 0.58, cy), (cx - w * 0.42, cy + h / 2)]
tri_mask = Image.new("L", (s, s), 0)
ImageDraw.Draw(tri_mask).polygon(tri, fill=255)
round_r = s * 0.028
tri_mask = tri_mask.filter(ImageFilter.GaussianBlur(round_r)).point(lambda v: 255 if v > 128 else 0)
tri_mask = tri_mask.filter(ImageFilter.GaussianBlur(SS))  # 轻微羽化消除阈值锯齿
icon.paste((255, 255, 255, 255), (0, 0), tri_mask)

# ---- 左侧三道速度光痕 ("轻"的意象) ----
lw = int(s * 0.052)
lx = s * 0.245
for i, (dy, ln) in enumerate([(-0.155, 0.115), (0.0, 0.082), (0.155, 0.115)]):
    y = cy + s * dy
    d.line([(lx, y), (lx + s * ln, y)], fill=(255, 255, 255, 225), width=lw)
# 圆头
for i, (dy, ln) in enumerate([(-0.155, 0.115), (0.0, 0.082), (0.155, 0.115)]):
    y = cy + s * dy
    for ex in (lx, lx + s * ln):
        d.ellipse([ex - lw / 2, y - lw / 2, ex + lw / 2, y + lw / 2], fill=(255, 255, 255, 225))

# 缩回目标尺寸 (超采样抗锯齿)
icon = icon.resize((S, S), Image.LANCZOS)
icon.save("src-tauri/app-icon.png")
print("OK -> src-tauri/app-icon.png")
