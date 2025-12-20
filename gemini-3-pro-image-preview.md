使用 Gemini（又称 Nano Banana 和 Nano Banana Pro）生成图片

content_copy



Gemini 可以通过对话方式生成和处理图片。您可以使用文本、图片或两者结合来向快速的 Gemini 2.5 Flash（又称 Nano Banana）或高级的 Gemini 3 Pro 预览版（又称 Nano Banana Pro）图片模型发出提示，从而以前所未有的控制力创建、修改和迭代视觉内容：

文本到图片、图片到图片和多张图片到图片：根据文本描述生成高质量图片，使用文本提示编辑和调整指定图片，或使用多张输入图片合成新场景并转移风格。
迭代式优化：通过多轮对话对图片进行优化，进行细微调整，直至达到理想效果。
高保真文本呈现：准确生成包含清晰易读且位置恰当的文本的图片，非常适合用于徽标、图表和海报。
所有生成的图片都包含 SynthID 水印。

图片生成（文本转图片）
Python
JavaScript
Go
Java
REST

from google import genai
from google.genai import types
from PIL import Image

client = genai.Client()

prompt = (
    "Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme"
)

response = client.models.generate_content(
    model="gemini-2.5-flash-image",
    contents=[prompt],
)

for part in response.parts:
    if part.text is not None:
        print(part.text)
    elif part.inline_data is not None:
        image = part.as_image()
        image.save("generated_image.png")
AI 生成的迷你香蕉菜肴图片
AI 生成的图片：Gemini 主题餐厅中的纳米香蕉菜肴
图片编辑（文字和图片转图片）
提醒：请确保您对上传的所有图片均拥有必要权利。 请勿生成会侵犯他人权利的内容，包括会欺骗、骚扰或伤害他人的视频或图片。使用此生成式 AI 服务时须遵守我们的《使用限制政策》。

提供图片，然后使用文本提示添加、移除或修改元素、更改样式或调整色彩分级。

以下示例演示了如何上传 base64 编码的图片。如需了解多张图片、更大的载荷和支持的 MIME 类型，请参阅图片理解页面。

Python
JavaScript
Go
Java
REST

from google import genai
from google.genai import types
from PIL import Image

client = genai.Client()

prompt = (
    "Create a picture of my cat eating a nano-banana in a "
    "fancy restaurant under the Gemini constellation",
)

image = Image.open("/path/to/cat_image.png")

response = client.models.generate_content(
    model="gemini-2.5-flash-image",
    contents=[prompt, image],
)

for part in response.parts:
    if part.text is not None:
        print(part.text)
    elif part.inline_data is not None:
        image = part.as_image()
        image.save("generated_image.png")
AI 生成的猫吃香蕉的图片
AI 生成的猫吃迷你香蕉的图片
多轮图片修改
继续以对话方式生成和修改图片。建议使用聊天或多轮对话的方式来迭代图片。以下示例展示了生成有关光合作用的信息图表的提示。

Python
JavaScript
Go
Java
REST

from google import genai
from google.genai import types

client = genai.Client()

chat = client.chats.create(
    model="gemini-3-pro-image-preview",
    config=types.GenerateContentConfig(
        response_modalities=['TEXT', 'IMAGE'],
        tools=[{"google_search": {}}]
    )
)

message = "Create a vibrant infographic that explains photosynthesis as if it were a recipe for a plant's favorite food. Show the \"ingredients\" (sunlight, water, CO2) and the \"finished dish\" (sugar/energy). The style should be like a page from a colorful kids' cookbook, suitable for a 4th grader."

response = chat.send_message(message)

for part in response.parts:
    if part.text is not None:
        print(part.text)
    elif image:= part.as_image():
        image.save("photosynthesis.png")
关于光合作用的 AI 生成的信息图
AI 生成的有关光合作用的信息图
然后，您可以使用同一对话将图片中的语言更改为西班牙语。

Python
JavaScript
Go
Java
REST

message = "Update this infographic to be in Spanish. Do not change any other elements of the image."
aspect_ratio = "16:9" # "1:1","2:3","3:2","3:4","4:3","4:5","5:4","9:16","16:9","21:9"
resolution = "2K" # "1K", "2K", "4K"

response = chat.send_message(message,
    config=types.GenerateContentConfig(
        image_config=types.ImageConfig(
            aspect_ratio=aspect_ratio,
            image_size=resolution
        ),
    ))

for part in response.parts:
    if part.text is not None:
        print(part.text)
    elif image:= part.as_image():
        image.save("photosynthesis_spanish.png")
AI 生成的西班牙语光合作用信息图
AI 生成的西班牙语光合作用信息图
Gemini 3 Pro Image 的新功能
Gemini 3 Pro Image (gemini-3-pro-image-preview) 是一款先进的图片生成和编辑模型，针对专业资源制作进行了优化。Gemini 1.5 Pro 旨在通过高级推理来应对最具挑战性的工作流程，擅长处理复杂的多轮创建和修改任务。

高分辨率输出：内置 1K、2K 和 4K 视觉效果生成功能。
高级文字渲染：能够为信息图表、菜单、图表和营销素材资源生成清晰易读的风格化文字。
依托 Google 搜索进行接地：模型可以使用 Google 搜索作为工具来验证事实，并根据实时数据（例如当前天气地图、股票图表、近期活动）生成图像。
思考模式：模型会利用“思考”过程来推理复杂的提示。它会生成临时“构思图片”（在后端可见，但不收费），以在生成最终的高质量输出之前优化构图。
最多 14 张参考图片：您现在最多可以混合使用 14 张参考图片来生成最终图片。
最多可使用 14 张参考图片
借助 Gemini 3 Pro 预览版，您最多可以混合 14 张参考图片。这 14 张图片可以包含以下内容：

最多 6 张高保真对象图片，用于包含在最终图片中
最多 5 张人像照片，以保持角色一致性

Python
JavaScript
Go
Java
REST

from google import genai
from google.genai import types
from PIL import Image

prompt = "An office group photo of these people, they are making funny faces."
aspect_ratio = "5:4" # "1:1","2:3","3:2","3:4","4:3","4:5","5:4","9:16","16:9","21:9"
resolution = "2K" # "1K", "2K", "4K"

client = genai.Client()

response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents=[
        prompt,
        Image.open('person1.png'),
        Image.open('person2.png'),
        Image.open('person3.png'),
        Image.open('person4.png'),
        Image.open('person5.png'),
    ],
    config=types.GenerateContentConfig(
        response_modalities=['TEXT', 'IMAGE'],
        image_config=types.ImageConfig(
            aspect_ratio=aspect_ratio,
            image_size=resolution
        ),
    )
)

for part in response.parts:
    if part.text is not None:
        print(part.text)
    elif image:= part.as_image():
        image.save("office.png")
AI 生成的办公室合影
AI 生成的办公室合影
使用 Google 搜索建立依据
使用 Google 搜索工具根据实时信息（例如天气预报、股市图表或近期活动）生成图片。

请注意，将“依托 Google 搜索进行接地”与图片生成功能搭配使用时，基于图片的搜索结果不会传递给生成模型，也不会包含在回答中。

Python
JavaScript
Java
REST

from google import genai
prompt = "Visualize the current weather forecast for the next 5 days in San Francisco as a clean, modern weather chart. Add a visual on what I should wear each day"
aspect_ratio = "16:9" # "1:1","2:3","3:2","3:4","4:3","4:5","5:4","9:16","16:9","21:9"

client = genai.Client()

response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents=prompt,
    config=types.GenerateContentConfig(
        response_modalities=['Text', 'Image'],
        image_config=types.ImageConfig(
            aspect_ratio=aspect_ratio,
        ),
        tools=[{"google_search": {}}]
    )
)

for part in response.parts:
    if part.text is not None:
        print(part.text)
    elif image:= part.as_image():
        image.save("weather.png")
AI 生成的旧金山五天天气图表
旧金山未来五天的天气图表（由 AI 生成）
响应包含 groundingMetadata，其中包含以下必需字段：

searchEntryPoint：包含用于呈现所需搜索建议的 HTML 和 CSS。
groundingChunks：返回用于为生成的图片提供依据的前 3 个 Web 来源
生成分辨率高达 4K 的图片
Gemini 3 Pro Image 默认生成 1K 图片，但也可以输出 2K 和 4K 图片。如需生成更高分辨率的资源，请在 generation_config 中指定 image_size。

您必须使用大写“K”（例如，1K、2K、4K）。小写参数（例如，1k）将被拒绝。

Python
JavaScript
Go
Java
REST

from google import genai
from google.genai import types

prompt = "Da Vinci style anatomical sketch of a dissected Monarch butterfly. Detailed drawings of the head, wings, and legs on textured parchment with notes in English." 
aspect_ratio = "1:1" # "1:1","2:3","3:2","3:4","4:3","4:5","5:4","9:16","16:9","21:9"
resolution = "1K" # "1K", "2K", "4K"

client = genai.Client()

response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents=prompt,
    config=types.GenerateContentConfig(
        response_modalities=['TEXT', 'IMAGE'],
        image_config=types.ImageConfig(
            aspect_ratio=aspect_ratio,
            image_size=resolution
        ),
    )
)

for part in response.parts:
    if part.text is not None:
        print(part.text)
    elif image:= part.as_image():
        image.save("butterfly.png")
以下是根据此提示生成的示例图片：

AI 生成的解剖帝王蝶的达芬奇风格解剖草图。
AI 生成的达芬奇风格的解剖君主斑蝶的解剖草图。
思维过程
Gemini 3 Pro Image 预览版模型是一种思考型模型，会针对复杂的提示使用推理流程（“思考”）。此功能默认处于启用状态，并且无法在 API 中停用。如需详细了解思考过程，请参阅 Gemini 思考指南。

模型最多会生成两张临时图片，以测试构图和逻辑。“思考”中的最后一张图片也是最终渲染的图片。

您可以查看生成最终图片所依据的想法。

Python
JavaScript

for part in response.parts:
    if part.thought:
        if part.text:
            print(part.text)
        elif image:= part.as_image():
            image.show()
思考签名
思考签名是模型内部思考过程的加密表示形式，用于在多轮互动中保留推理上下文。所有响应都包含 thought_signature 字段。一般来说，如果您在模型响应中收到思考签名，则应在下一轮对话中发送对话历史记录时，完全按收到的原样将其传递回去。未能循环使用想法签名可能会导致回答失败。如需详细了解签名，请参阅思想签名文档。

注意： 如果您使用官方 Google Gen AI SDK 并使用聊天功能（或将完整的模型回答对象直接附加到历史记录中），思考签名会被自动处理。您无需手动提取或管理它们，也无需更改代码。
思考签名的运作方式如下：

所有包含图片 mimetype 的 inline_data 部分（属于响应的一部分）都应具有签名。
如果想法之后（在任何图片之前）紧跟着一些文字部分，则第一个文字部分也应包含签名。
想法没有签名；如果带有图片 mimetype 的 inline_data 部分是想法的一部分，则不会有签名。
以下代码展示了包含意念签名的示例：


[
  {
    "inline_data": {
      "data": "<base64_image_data_0>",
      "mime_type": "image/png"
    },
    "thought": true // Thoughts don't have signatures
  },
  {
    "inline_data": {
      "data": "<base64_image_data_1>",
      "mime_type": "image/png"
    },
    "thought": true // Thoughts don't have signatures
  },
  {
    "inline_data": {
      "data": "<base64_image_data_2>",
      "mime_type": "image/png"
    },
    "thought": true // Thoughts don't have signatures
  },
  {
    "text": "Here is a step-by-step guide to baking macarons, presented in three separate images.\n\n### Step 1: Piping the Batter\n\nThe first step after making your macaron batter is to pipe it onto a baking sheet. This requires a steady hand to create uniform circles.\n\n",
    "thought_signature": "<Signature_A>" // The first non-thought part always has a signature
  },
  {
    "inline_data": {
      "data": "<base64_image_data_3>",
      "mime_type": "image/png"
    },
    "thought_signature": "<Signature_B>" // All image parts have a signatures
  },
  {
    "text": "\n\n### Step 2: Baking and Developing Feet\n\nOnce piped, the macarons are baked in the oven. A key sign of a successful bake is the development of \"feet\"—the ruffled edge at the base of each macaron shell.\n\n"
    // Follow-up text parts don't have signatures
  },
  {
    "inline_data": {
      "data": "<base64_image_data_4>",
      "mime_type": "image/png"
    },
    "thought_signature": "<Signature_C>" // All image parts have a signatures
  },
  {
    "text": "\n\n### Step 3: Assembling the Macaron\n\nThe final step is to pair the cooled macaron shells by size and sandwich them together with your desired filling, creating the classic macaron dessert.\n\n"
  },
  {
    "inline_data": {
      "data": "<base64_image_data_5>",
      "mime_type": "image/png"
    },
    "thought_signature": "<Signature_D>" // All image parts have a signatures
  }
]
其他图片生成模式
Gemini 还支持其他基于提示结构和上下文的图片互动模式，包括：

文生图和文本（交织）：输出包含相关文本的图片。
提示示例：“生成一份图文并茂的海鲜饭食谱。”
图片和文本转图片和文本（交织）：使用输入图片和文本创建新的相关图片和文本。
提示示例：（附带一张带家具的房间的照片）“我的空间还适合放置哪些颜色的沙发？你能更新一下图片吗？”
批量生成图片
如果您需要生成大量图片，可以使用批量 API。您可获得更高的速率限制，但需要等待最长 24 小时才能获得解答。

如需查看 Batch API 图片示例和代码，请参阅 Batch API 图片生成文档和实用指南。

提示指南和策略
掌握图片生成技术首先要遵循一个基本原则：

描述场景，而不仅仅是列出关键字。 该模型的核心优势在于其深厚的语言理解能力。与一连串不相关的字词相比，叙述性描述段落几乎总是能生成更好、更连贯的图片。

用于生成图片的提示
以下策略将帮助您创建有效的提示，以生成您想要的图片。

1. 逼真场景
对于逼真的图片，请使用摄影术语。提及拍摄角度、镜头类型、光线和细节，引导模型生成逼真的效果。

模板
提示
Python
Java
JavaScript
Go
REST

from google import genai
from google.genai import types    

client = genai.Client()

response = client.models.generate_content(
    model="gemini-2.5-flash-image",
    contents="A photorealistic close-up portrait of an elderly Japanese ceramicist with deep, sun-etched wrinkles and a warm, knowing smile. He is carefully inspecting a freshly glazed tea bowl. The setting is his rustic, sun-drenched workshop with pottery wheels and shelves of clay pots in the background. The scene is illuminated by soft, golden hour light streaming through a window, highlighting the fine texture of the clay and the fabric of his apron. Captured with an 85mm portrait lens, resulting in a soft, blurred background (bokeh). The overall mood is serene and masterful.",
)

for part in response.parts:
    if part.text is not None:
        print(part.text)
    elif part.inline_data is not None:
        image = part.as_image()
        image.save("photorealistic_example.png")
一张写实风格的特写肖像照，照片中是一位年长的日本陶艺家...
一位年长的日本陶艺家的特写肖像，照片级真实感...
2. 风格化插图和贴纸
如需创建贴纸、图标或素材资源，请明确说明样式并要求使用透明背景。

模板
提示
Python
Java
JavaScript
Go
REST

from google import genai
from google.genai import types

client = genai.Client()

response = client.models.generate_content(
    model="gemini-2.5-flash-image",
    contents="A kawaii-style sticker of a happy red panda wearing a tiny bamboo hat. It's munching on a green bamboo leaf. The design features bold, clean outlines, simple cel-shading, and a vibrant color palette. The background must be white.",
)

for part in response.parts:
    if part.text is not None:
        print(part.text)
    elif part.inline_data is not None:
        image = part.as_image()
        image.save("red_panda_sticker.png")
一张可爱风格的贴纸，上面画着一个开心的红色...
一张可爱风格的贴纸，上面是一只快乐的小熊猫...
3. 图片中的文字准确无误
Gemini 在呈现文本方面表现出色。清楚说明文字、字体样式（描述性）和整体设计。使用 Gemini 3 Pro 图片预览版制作专业资源。

模板
提示
Python
Java
JavaScript
Go
REST

from google import genai
from google.genai import types    

client = genai.Client()

response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents="Create a modern, minimalist logo for a coffee shop called 'The Daily Grind'. The text should be in a clean, bold, sans-serif font. The color scheme is black and white. Put the logo in a circle. Use a coffee bean in a clever way.",
    config=types.GenerateContentConfig(
        image_config=types.ImageConfig(
            aspect_ratio="1:1",
        )
    )
)

for part in response.parts:
    if part.text is not None:
        print(part.text)
    elif part.inline_data is not None:
        image = part.as_image()
        image.save("logo_example.jpg")
为名为“The Daily Grind”的咖啡店设计一个现代简约的徽标...
为一家名为“The Daily Grind”的咖啡店设计一个现代简约的徽标...
4. 产品模型和商业摄影
非常适合为电子商务、广告或品牌宣传制作清晰专业的商品照片。

模板
提示
Python
Java
JavaScript
Go
REST

from google import genai
from google.genai import types

client = genai.Client()

response = client.models.generate_content(
    model="gemini-2.5-flash-image",
    contents="A high-resolution, studio-lit product photograph of a minimalist ceramic coffee mug in matte black, presented on a polished concrete surface. The lighting is a three-point softbox setup designed to create soft, diffused highlights and eliminate harsh shadows. The camera angle is a slightly elevated 45-degree shot to showcase its clean lines. Ultra-realistic, with sharp focus on the steam rising from the coffee. Square image.",
)

for part in response.parts:
    if part.text is not None:
        print(part.text)
    elif part.inline_data is not None:
        image = part.as_image()
        image.save("product_mockup.png")
一张高分辨率的棚拍商品照片，展示的是一个极简风格的陶瓷咖啡杯...
一张高分辨率的棚拍商品照片，照片中是一个极简风格的陶瓷咖啡杯...
5. 极简风格和负空间设计
非常适合用于创建网站、演示或营销材料的背景，以便在其中叠加文字。

模板
提示
Python
Java
JavaScript
Go
REST

from google import genai
from google.genai import types    

client = genai.Client()

response = client.models.generate_content(
    model="gemini-2.5-flash-image",
    contents="A minimalist composition featuring a single, delicate red maple leaf positioned in the bottom-right of the frame. The background is a vast, empty off-white canvas, creating significant negative space for text. Soft, diffused lighting from the top left. Square image.",
)

for part in response.parts:
    if part.text is not None:
        print(part.text)
    elif part.inline_data is not None:
        image = part.as_image()
        image.save("minimalist_design.png")
A minimalist composition featuring a single, delicate red maple leaf...
一幅极简主义构图，画面中只有一片精致的红枫叶...
6. 连续艺术（漫画分格 / 故事板）
以角色一致性和场景描述为基础，为视觉故事讲述创建分格。为了确保文本准确性和故事讲述能力，这些提示最适合搭配 Gemini 3 Pro Image 预览版使用。

模板
提示
Python
Java
JavaScript
Go
REST

from google import genai
from google.genai import types
from PIL import Image

client = genai.Client()

image_input = Image.open('/path/to/your/man_in_white_glasses.jpg')
text_input = "Make a 3 panel comic in a gritty, noir art style with high-contrast black and white inks. Put the character in a humurous scene."

response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents=[text_input, image_input],
)

for part in response.parts:
    if part.text is not None:
        print(part.text)
    elif part.inline_data is not None:
        image = part.as_image()
        image.save("comic_panel.jpg")
输入

输出

戴着白色眼镜的男士
输入图片
制作一个三格漫画，采用粗犷的黑色电影艺术风格...
制作一幅采用粗犷的黑色电影艺术风格的三格漫画...
7. 使用 Google 搜索建立依据
使用 Google 搜索根据最新信息或实时信息生成图片。 这对于新闻、天气和其他时效性主题非常有用。

提示
Python
Java
JavaScript
Go
REST

from google import genai
from google.genai import types
prompt = "Make a simple but stylish graphic of last night's Arsenal game in the Champion's League"
aspect_ratio = "16:9" # "1:1","2:3","3:2","3:4","4:3","4:5","5:4","9:16","16:9","21:9"

client = genai.Client()

response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents=prompt,
    config=types.GenerateContentConfig(
        response_modalities=['Text', 'Image'],
        image_config=types.ImageConfig(
            aspect_ratio=aspect_ratio,
        ),
        tools=[{"google_search": {}}]
    )
)

for part in response.parts:
    if part.text is not None:
        print(part.text)
    elif image:= part.as_image():
        image.save("football-score.jpg")
AI 生成的阿森纳足球比赛得分图片
AI 生成的阿森纳足球比赛得分图表
用于修改图片的提示
以下示例展示了如何提供图片以及文本提示，以进行编辑、构图和风格迁移。

1. 添加和移除元素
提供图片并描述您的更改。模型将与原始图片的风格、光照和透视效果保持一致。

模板
提示
Python
Java
JavaScript
Go
REST

from google import genai
from google.genai import types
from PIL import Image

client = genai.Client()

# Base image prompt: "A photorealistic picture of a fluffy ginger cat sitting on a wooden floor, looking directly at the camera. Soft, natural light from a window."
image_input = Image.open('/path/to/your/cat_photo.png')
text_input = """Using the provided image of my cat, please add a small, knitted wizard hat on its head. Make it look like it's sitting comfortably and not falling off."""

# Generate an image from a text prompt
response = client.models.generate_content(
    model="gemini-2.5-flash-image",
    contents=[text_input, image_input],
)

for part in response.parts:
    if part.text is not None:
        print(part.text)
    elif part.inline_data is not None:
        image = part.as_image()
        image.save("cat_with_hat.png")
输入

输出

一张照片般逼真的图片，画面中是一只毛茸茸的姜黄色猫。
一张逼真的图片，内容是一只毛绒绒的姜黄色猫...
请使用我提供的猫咪图片，添加一顶针织的小巫师帽...
请使用我提供的猫咪图片，添加一顶针织的小巫师帽...
2. 局部重绘（语义遮盖）
通过对话定义“蒙版”，以修改图片的特定部分，同时保持其余部分不变。

模板
提示
Python
Java
JavaScript
Go
REST

from google import genai
from google.genai import types
from PIL import Image

client = genai.Client()

# Base image prompt: "A wide shot of a modern, well-lit living room with a prominent blue sofa in the center. A coffee table is in front of it and a large window is in the background."
living_room_image = Image.open('/path/to/your/living_room.png')
text_input = """Using the provided image of a living room, change only the blue sofa to be a vintage, brown leather chesterfield sofa. Keep the rest of the room, including the pillows on the sofa and the lighting, unchanged."""

# Generate an image from a text prompt
response = client.models.generate_content(
    model="gemini-2.5-flash-image",
    contents=[living_room_image, text_input],
)

for part in response.parts:
    if part.text is not None:
        print(part.text)
    elif part.inline_data is not None:
        image = part.as_image()
        image.save("living_room_edited.png")
输入

输出

广角镜头：一间现代风格、光线充足的客厅...
一张广角照片，拍摄的是一间光线充足的现代客厅…
使用提供的客厅图片，将蓝色沙发更改为复古棕色皮革切斯特菲尔德沙发...
使用提供的客厅图片，仅将蓝色沙发更改为复古棕色真皮切斯特菲尔德沙发...
3. 风格迁移
提供一张图片，并让模型以不同的艺术风格重新创作其内容。

模板
提示
Python
Java
JavaScript
Go
REST

from google import genai
from google.genai import types
from PIL import Image

client = genai.Client()

# Base image prompt: "A photorealistic, high-resolution photograph of a busy city street in New York at night, with bright neon signs, yellow taxis, and tall skyscrapers."
city_image = Image.open('/path/to/your/city.png')
text_input = """Transform the provided photograph of a modern city street at night into the artistic style of Vincent van Gogh's 'Starry Night'. Preserve the original composition of buildings and cars, but render all elements with swirling, impasto brushstrokes and a dramatic palette of deep blues and bright yellows."""

# Generate an image from a text prompt
response = client.models.generate_content(
    model="gemini-2.5-flash-image",
    contents=[city_image, text_input],
)

for part in response.parts:
    if part.text is not None:
        print(part.text)
    elif part.inline_data is not None:
        image = part.as_image()
        image.save("city_style_transfer.png")
输入

输出

一张逼真的高分辨率照片，画面中是一条繁忙的城市街道...
一张逼真的高分辨率照片，拍摄的是繁忙的城市街道...
将提供的现代城市街道夜景照片进行转换...
将提供的夜间现代城市街道照片改造成...
4. 高级合成：组合多张图片
提供多张图片作为上下文，以创建新的合成场景。这非常适合制作产品模型或创意拼贴画。

模板
提示
Python
Java
JavaScript
Go
REST

from google import genai
from google.genai import types
from PIL import Image

client = genai.Client()

# Base image prompts:
# 1. Dress: "A professionally shot photo of a blue floral summer dress on a plain white background, ghost mannequin style."
# 2. Model: "Full-body shot of a woman with her hair in a bun, smiling, standing against a neutral grey studio background."
dress_image = Image.open('/path/to/your/dress.png')
model_image = Image.open('/path/to/your/model.png')

text_input = """Create a professional e-commerce fashion photo. Take the blue floral dress from the first image and let the woman from the second image wear it. Generate a realistic, full-body shot of the woman wearing the dress, with the lighting and shadows adjusted to match the outdoor environment."""

# Generate an image from a text prompt
response = client.models.generate_content(
    model="gemini-2.5-flash-image",
    contents=[dress_image, model_image, text_input],
)

for part in response.parts:
    if part.text is not None:
        print(part.text)
    elif part.inline_data is not None:
        image = part.as_image()
        image.save("fashion_ecommerce_shot.png")
输入值 1

输入值 2

输出

一张专业拍摄的照片，照片中是一位女性穿着蓝色碎花夏装...
一张专业拍摄的照片，照片中是一件蓝色印花夏季连衣裙…
全身镜头：一位女性将头发盘成发髻，...
Full-body shot of a woman with her hair in a bun...
制作专业电子商务时尚照片…
创建专业的电子商务时尚照片...
5. 高保真度细节保留
为确保在编辑过程中保留关键细节（例如面部或徽标），请在编辑请求中详细描述这些细节。

模板
提示
Python
Java
JavaScript
Go
REST

from google import genai
from google.genai import types
from PIL import Image

client = genai.Client()

# Base image prompts:
# 1. Woman: "A professional headshot of a woman with brown hair and blue eyes, wearing a plain black t-shirt, against a neutral studio background."
# 2. Logo: "A simple, modern logo with the letters 'G' and 'A' in a white circle."
woman_image = Image.open('/path/to/your/woman.png')
logo_image = Image.open('/path/to/your/logo.png')
text_input = """Take the first image of the woman with brown hair, blue eyes, and a neutral expression. Add the logo from the second image onto her black t-shirt. Ensure the woman's face and features remain completely unchanged. The logo should look like it's naturally printed on the fabric, following the folds of the shirt."""

# Generate an image from a text prompt
response = client.models.generate_content(
    model="gemini-2.5-flash-image",
    contents=[woman_image, logo_image, text_input],
)

for part in response.parts:
    if part.text is not None:
        print(part.text)
    elif part.inline_data is not None:
        image = part.as_image()
        image.save("woman_with_logo.png")
输入值 1

输入值 2

输出

一张专业头像，照片中的女性留着棕色头发，有着蓝色眼睛…
一张专业头部特写照片，照片中的女子留着棕色头发，有着蓝色眼睛…
一个简约的现代徽标，包含字母“G”和“A”...
一个简单的现代徽标，包含字母“G”和“A”...
拍摄第一张照片，照片中的女性留着棕色头发、有着蓝色眼睛，面部表情平静...
拍摄第一张照片，照片中的女子留着棕色头发，有着蓝色眼睛，面部表情平静...
6. 让事物变得生动有趣
上传草图或简笔画，然后让模型将其细化为成品图片。

模板
提示
Python
Java
JavaScript
Go
REST

from google import genai
from PIL import Image

client = genai.Client()

# Base image prompt: "A rough pencil sketch of a flat sports car on white paper."
sketch_image = Image.open('/path/to/your/car_sketch.png')
text_input = """Turn this rough pencil sketch of a futuristic car into a polished photo of the finished concept car in a showroom. Keep the sleek lines and low profile from the sketch but add metallic blue paint and neon rim lighting."""

response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents=[sketch_image, text_input],
)

for part in response.parts:
    if part.text is not None:
        print(part.text)
    elif part.inline_data is not None:
        image = part.as_image()
        image.save("car_photo.png")
输入

输出

汽车草图
汽车的粗略草图
显示最终概念车的输出
经过润饰的汽车照片
7. 字符一致性：360 度全景
您可以迭代提示不同的角度，从而生成角色的 360 度视图。为获得最佳效果，请在后续提示中包含之前生成的图片，以保持一致性。对于复杂的姿势，请添加所需姿势的参考图片。

模板
提示
Python
Java
JavaScript
Go
REST

from google import genai
from google.genai import types
from PIL import Image

client = genai.Client()

image_input = Image.open('/path/to/your/man_in_white_glasses.jpg')
text_input = """A studio portrait of this man against white, in profile looking right"""

response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents=[text_input, image_input],
)

for part in response.parts:
    if part.text is not None:
        print(part.text)
    elif part.inline_data is not None:
        image = part.as_image()
        image.save("man_right_profile.png")
输入

输出内容 1

输出内容 2

戴白色眼镜的男士的原始输入内容
原始图片
一位戴着白色眼镜的男士看向右侧的输出
戴白色眼镜的男士向右看
一位戴着白色眼镜的男士向前看的输出图片
一位戴着白色眼镜的男士向前看
最佳做法
如需将结果从“好”提升到“优秀”，请将以下专业策略融入您的工作流程。

内容要非常具体：您提供的信息越详细，对输出结果的掌控程度就越高。与其使用“奇幻盔甲”，不如具体描述：“华丽的精灵板甲，蚀刻着银叶图案，带有高领和猎鹰翅膀形状的肩甲。”
提供上下文和意图：说明图片的用途。模型对上下文的理解会影响最终输出。例如，“为高端极简护肤品牌设计徽标”的效果要好于“设计徽标”。
迭代和优化：不要指望第一次尝试就能生成完美的图片。利用模型的对话特性进行小幅更改。使用后续提示，例如“这很棒，但你能让光线更暖一些吗？”或“保持所有内容不变，但让角色的表情更严肃一些。”
使用分步指令：对于包含许多元素的复杂场景，请将提示拆分为多个步骤。“首先，创建一个宁静、薄雾弥漫的黎明森林的背景。然后，在前景中添加一个长满苔藓的古老石制祭坛。 最后，将一把发光的剑放在祭坛顶部。”
使用“语义负面提示”：不要说“没有汽车”，而是通过说“一条没有交通迹象的空旷、荒凉的街道”来正面描述所需的场景。
控制镜头：使用摄影和电影语言来控制构图。例如wide-angle shot、macro shot、low-angle perspective等字词。
限制
为获得最佳性能，请使用以下语言：英语、阿拉伯语（埃及）、德语（德国）、西班牙语（墨西哥）、法语（法国）、印地语（印度）、印度尼西亚语（印度尼西亚）、意大利语（意大利）、日语（日本）、韩语（韩国）、葡萄牙语（巴西）、俄语（俄罗斯）、乌克兰语（乌克兰）、越南语（越南）、中文（中国）。
图片生成不支持音频或视频输入。
模型不一定会生成用户明确要求的确切数量的图片输出。
gemini-2.5-flash-image 最多可接受 3 张图片作为输入，而 gemini-3-pro-image-preview 最多可接受 5 张高保真图片，总共最多可接受 14 张图片。
为图片生成文字时，最好先生成文字，然后再要求生成包含该文字的图片，这样 Gemini 的效果会更好。
所有生成的图片都包含 SynthID 水印。
可选配置
您可以选择在 generate_content 调用的 config 字段中配置模型输出的响应模态和宽高比。

输出类型
默认情况下，模型会返回文本和图片响应（即 response_modalities=['Text', 'Image']）。您可以使用 response_modalities=['Image'] 将响应配置为仅返回图片而不返回文本。

Python
JavaScript
Go
Java
REST

response = client.models.generate_content(
    model="gemini-2.5-flash-image",
    contents=[prompt],
    config=types.GenerateContentConfig(
        response_modalities=['Image']
    )
)
宽高比和图片大小
默认情况下，模型会使输出图片的大小与输入图片的大小保持一致，否则会生成 1:1 的正方形图片。 您可以使用响应请求中 image_config 下的 aspect_ratio 字段来控制输出图片的宽高比，如下所示：

Python
JavaScript
Go
Java
REST

# For gemini-2.5-flash-image
response = client.models.generate_content(
    model="gemini-2.5-flash-image",
    contents=[prompt],
    config=types.GenerateContentConfig(
        image_config=types.ImageConfig(
            aspect_ratio="16:9",
        )
    )
)

# For gemini-3-pro-image-preview
response = client.models.generate_content(
    model="gemini-3-pro-image-preview",
    contents=[prompt],
    config=types.GenerateContentConfig(
        image_config=types.ImageConfig(
            aspect_ratio="16:9",
            image_size="2K",
        )
    )
)
下表列出了可用的不同宽高比以及生成的图片大小：

Gemini 2.5 Flash 图片

宽高比	分辨率	令牌
1:1	1024x1024	1290
2:3	832x1248	1290
3:2	1248x832	1290
3:4	864x1184	1290
4:3	1184x864	1290
4:5	896x1152	1290
5:4	1152x896	1290
9:16	768x1344	1290
16:9	1344x768	1290
21:9	1536x672	1290
Gemini 3 Pro Image 预览版

宽高比	1K 分辨率	1,000 个词元	2K 分辨率	2,000 个 token	4K 分辨率	4,000 个 token
1:1	1024x1024	1120	2048 x 2048	1120	4096x4096	2000
2:3	848x1264	1120	1696x2528	1120	3392x5056	2000
3:2	1264x848	1120	2528x1696	1120	5056x3392	2000
3:4	896x1200	1120	1792x2400	1120	3584x4800	2000
4:3	1200x896	1120	2400x1792	1120	4800x3584	2000
4:5	928x1152	1120	1856x2304	1120	3712x4608	2000
5:4	1152x928	1120	2304x1856	1120	4608x3712	2000
9:16	768x1376	1120	1536x2752	1120	3072x5504	2000
16:9	1376x768	1120	2752x1536	1120	5504x3072	2000
21:9	1584x672	1120	3168x1344	1120	6336x2688	2000
模型选择
选择最适合您的特定应用场景的模型。

Gemini 3 Pro Image 预览版（Nano Banana Pro 预览版）专为专业资源制作和复杂指令而设计。此模型具有以下特点：使用 Google 搜索进行现实世界接地、默认“思考”流程（在生成之前优化构图），并且可以生成分辨率高达 4K 的图片。如需了解详情，请参阅模型价格和功能页面。

Gemini 2.5 Flash Image (Nano Banana) 旨在实现速度和效率。此模型经过优化，可处理大批量、低延迟的任务，并生成 1024 像素分辨率的图片。如需了解详情，请参阅模型价格和功能页面。