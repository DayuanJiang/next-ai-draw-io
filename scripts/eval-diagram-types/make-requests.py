"""Write requests.json, the requests of the evaluation.

    python3 make-requests.py requests.json

The requests are written for the evaluation. They follow the kinds of
requests the demo site gets (short ones in several languages, long ones
that list participants and messages, loops, messages to oneself, colours),
but none is a user's text. Kept as a script because the long requests and
their expected messages are built from one list.
"""
import json
import sys


def numbered(messages):
    return " ".join(
        f"{i}. {a} to {b}: {t}." for i, (a, b, t) in enumerate(messages, 1)
    )


SIX_P = [
    "Customer",
    "Web App",
    "API Gateway",
    "Order Service",
    "Payment Service",
    "Inventory Service",
]
SIX_M = [
    ("Customer", "Web App", "Place order"),
    ("Web App", "API Gateway", "POST /orders"),
    ("API Gateway", "Order Service", "Create order"),
    ("Order Service", "Inventory Service", "Reserve items"),
    ("Inventory Service", "Order Service", "Items reserved"),
    ("Order Service", "Payment Service", "Charge card"),
    ("Payment Service", "Order Service", "Payment approved"),
    ("Order Service", "Inventory Service", "Confirm reservation"),
    ("Inventory Service", "Order Service", "Stock updated"),
    ("Order Service", "API Gateway", "Order created"),
    ("API Gateway", "Web App", "201 Created"),
    ("Web App", "Customer", "Show confirmation"),
]
SIX_TEXT = (
    "Draw a sequence diagram of an online order with six participants: "
    "Customer, Web App, API Gateway, Order Service, Payment Service and "
    "Inventory Service. It has twelve messages, in this order: "
    + numbered(SIX_M)
)

JA_P = ["ui_app", "mainプロセス", "storage_service", "update_service"]
JA_M = [
    ("ui_app", "mainプロセス", "更新要求"),
    ("mainプロセス", "storage_service", "空き容量確認"),
    ("storage_service", "mainプロセス", "容量OK"),
    ("mainプロセス", "update_service", "更新パッケージ取得"),
    ("update_service", "mainプロセス", "パッケージ受信完了"),
    ("mainプロセス", "storage_service", "パッケージ保存"),
    ("storage_service", "mainプロセス", "保存完了"),
    ("mainプロセス", "ui_app", "再起動の確認表示"),
]
JA_TEXT = (
    "「更新処理シーケンス」のシーケンス図を作成してください。左から「ui_app」"
    "「mainプロセス」「storage_service」「update_service」の4本のライフラインを"
    "配置し、時間は上から下へ進みます。メッセージは次の順です。"
    + "".join(f"{i}. {a}→{b}：{t}。" for i, (a, b, t) in enumerate(JA_M, 1))
)

COL_P = ["传感节点", "边缘网关", "云端服务", "预警服务", "可视化平台"]
COL_M = [
    ("传感节点", "边缘网关", "定时上报数据"),
    ("边缘网关", "云端服务", "周期上报"),
    ("云端服务", "预警服务", "发送超标事件"),
    ("预警服务", "可视化平台", "推送预警"),
    ("可视化平台", "预警服务", "确认已显示"),
    ("预警服务", "云端服务", "预警已送达"),
    ("云端服务", "边缘网关", "下发采样频率"),
    ("边缘网关", "传感节点", "更新采样频率"),
]
COL_TEXT = (
    "画一张 UML 时序图“传感数据上报与预警”。参与者从左到右："
    + "、".join(COL_P)
    + "。参与者用深蓝填充 #1F4E79、白字。调用用实线箭头，返回用虚线箭头。"
    "消息自上而下："
    + "".join(f"{i}. {a}→{b}：{t}；" for i, (a, b, t) in enumerate(COL_M, 1))
)

LOOP_P = ["User", "App", "Auth Service", "SMS Gateway"]
LOOP_M = [
    ("User", "App", "Enter phone number"),
    ("App", "Auth Service", "Request code"),
    ("Auth Service", "SMS Gateway", "Send SMS code"),
    ("SMS Gateway", "User", "SMS delivered"),
    ("User", "App", "Enter code"),
    ("App", "Auth Service", "Verify code"),
    ("Auth Service", "App", "Code wrong, try again"),
    ("App", "User", "Login successful"),
]
LOOP_TEXT = (
    "Draw a sequence diagram of a login with SMS codes. Participants from "
    "left to right: User, App, Auth Service, SMS Gateway. Messages in this "
    "order: "
    + numbered(LOOP_M)
    + ' Put messages 5 to 7 inside a loop frame labelled "loop" (up to 3 '
    "attempts). Add a note beside Auth Service that says: Code expires after "
    "5 minutes."
)

LONG_P = ["Client", "Gateway", "Auth", "Orders", "Database"]
LONG_STEPS = [
    ("Client", "Gateway", "Request"),
    ("Gateway", "Auth", "Check token"),
    ("Auth", "Gateway", "Token valid"),
    ("Gateway", "Orders", "Forward request"),
    ("Orders", "Database", "Query"),
    ("Database", "Orders", "Rows"),
    ("Orders", "Gateway", "Result"),
    ("Gateway", "Client", "Response"),
]
LONG_M = [
    (a, b, f"{t} {round_ + 1}")
    for round_ in range(4)
    for (a, b, t) in LONG_STEPS
]
LONG_TEXT = (
    "Draw a sequence diagram with five participants: Client, Gateway, Auth, "
    "Orders and Database. It has 32 messages, in this order: "
    + numbered(LONG_M)
)

ORD_P = ["Browser", "CDN", "Web Server", "Cache", "Database"]
ORD_M = [
    ("Browser", "CDN", "GET /page"),
    ("CDN", "Web Server", "Cache miss"),
    ("Web Server", "Cache", "Look up page"),
    ("Cache", "Web Server", "Not found"),
    ("Web Server", "Database", "Load content"),
    ("Database", "Web Server", "Content"),
    ("Web Server", "CDN", "Rendered page"),
    ("CDN", "Browser", "200 OK"),
]
ORD_TEXT = (
    "Draw a sequence diagram of a page request. The participants stand in "
    "exactly this order from left to right, with their left edges 240 px "
    "apart and the first one at x=60: Browser, CDN, Web Server, Cache, "
    "Database. Messages in this order: " + numbered(ORD_M)
)

SELF_P = ["开发人员", "训练服务", "模型仓库", "边缘网关"]
SELF_M = [
    ("开发人员", "训练服务", "提交训练配置"),
    ("训练服务", "训练服务", "加载训练集"),
    ("训练服务", "训练服务", "训练模型"),
    ("训练服务", "模型仓库", "保存模型权重"),
    ("模型仓库", "训练服务", "返回模型版本"),
    ("训练服务", "开发人员", "训练完成通知"),
    ("开发人员", "模型仓库", "发布模型"),
    ("模型仓库", "边缘网关", "下发模型"),
    ("边缘网关", "边缘网关", "加载并自检"),
]
SELF_TEXT = (
    "画一张时序图“模型训练与部署”。参与者从左到右："
    + "、".join(SELF_P)
    + "。交互序列："
    + "".join(
        f"{i}. {a}自消息“{t}”；" if a == b else f"{i}. {a}→{b}：“{t}”；"
        for i, (a, b, t) in enumerate(SELF_M, 1)
    )
)

ACT_P = ["Client", "API", "Worker"]
ACT_M = [
    ("Client", "API", "Submit job"),
    ("API", "Worker", "Start job"),
    ("Worker", "API", "Job done"),
    ("API", "Client", "Result"),
]
ACT_TEXT = (
    "Draw a UML sequence diagram with activation bars on the lifelines. "
    "Participants: Client, API, Worker. Messages in this order: "
    + numbered(ACT_M)
    + " API is active from message 1 to message 4, Worker from message 2 to "
    "message 3."
)


def seq(id_, text, group, participants=None, messages=None, **more):
    r = {"id": id_, "group": group, "type": "sequence", "text": text}
    if participants:
        r["participants"] = participants
        r["messages"] = [list(m) for m in messages]
    r.update(more)
    return r


def other(id_, group, text):
    return {"id": id_, "group": group, "type": None, "text": text}


def typed(id_, type_, text, **expected):
    """A request for another diagram type, in the group of that type.

    expected: nodes (labels that must be drawn), edges ([from, to] or
    [from, to, kind]), and what the type's scorer reads (lanes, members,
    actors, boundary, root).
    """
    r = {"id": id_, "group": type_, "type": type_, "text": text}
    r.update(expected)
    return r


RENAMED = [
    tuple("Mobile App" if x == "Web App" else x for x in m[:2]) + (m[2],)
    for m in SIX_M
]

MM_EN = {
    "Market": ["Competitors", "Pricing", "Target users"],
    "Product": ["Core features", "UX", "Performance"],
    "Promotion": ["Social media", "Blog", "Events"],
    "Operations": ["Support", "Monitoring", "Feedback"],
}
MM_ZH = {
    "饮食": ["多吃蔬菜", "少糖", "多喝水"],
    "运动": ["跑步", "游泳", "瑜伽"],
    "睡眠": ["早睡", "午休"],
    "心态": ["冥想", "社交"],
}


def mind_map(root, branches):
    nodes = [root] + [n for b, leaves in branches.items() for n in [b] + leaves]
    edges = [[root, b] for b in branches] + [
        [b, leaf] for b, leaves in branches.items() for leaf in leaves
    ]
    return {"root": root, "nodes": nodes, "edges": edges}


OTHER_TYPES = [
    # Swimlane (cross-functional flowchart): who does which step
    typed(
        "sw-short",
        "swimlane",
        "画一个请假审批的泳道图，角色有员工、直属主管、人事",
        lanes={"员工": [], "直属主管": [], "人事": []},
    ),
    typed(
        "sw-listed",
        "swimlane",
        "Draw a swimlane diagram of an order refund with three lanes: Customer, "
        "Support, Finance. Steps: Customer: 'Request refund'. Support: 'Check "
        "order', then a decision 'Eligible?'. If no: Support 'Reject request'. "
        "If yes: Finance 'Approve refund', then Finance 'Send money', then "
        "Customer 'Receive refund'.",
        lanes={
            "Customer": ["Request refund", "Receive refund"],
            "Support": ["Check order", "Eligible?", "Reject request"],
            "Finance": ["Approve refund", "Send money"],
        },
        edges=[
            ["Request refund", "Check order"],
            ["Check order", "Eligible?"],
            ["Eligible?", "Reject request"],
            ["Eligible?", "Approve refund"],
            ["Approve refund", "Send money"],
            ["Send money", "Receive refund"],
        ],
    ),
    typed(
        "sw-zh-listed",
        "swimlane",
        "画一张跨部门流程图（泳道图），泳道：销售、仓库、财务。步骤：销售“创建订单”，"
        "然后仓库“检查库存”，然后判断“有货吗”。没货：销售“通知客户缺货”。有货：仓库"
        "“拣货发货”，然后财务“开具发票”，然后销售“确认完成”。",
        lanes={
            "销售": ["创建订单", "通知客户缺货", "确认完成"],
            "仓库": ["检查库存", "有货吗", "拣货发货"],
            "财务": ["开具发票"],
        },
        edges=[
            ["创建订单", "检查库存"],
            ["检查库存", "有货吗"],
            ["有货吗", "通知客户缺货"],
            ["有货吗", "拣货发货"],
            ["拣货发货", "开具发票"],
            ["开具发票", "确认完成"],
        ],
    ),
    # UML class diagram
    typed("cls-short", "class", "a class diagram for a library system: books, members, loans"),
    typed(
        "cls-listed",
        "class",
        "Draw a UML class diagram. Classes: Shape (abstract; attributes x: int, "
        "y: int; methods area(): float, draw()), Circle (attribute radius: "
        "float), Rectangle (attributes width: float, height: float), Canvas "
        "(attribute shapes: List<Shape>; methods add(s: Shape), render()). "
        "Circle and Rectangle inherit from Shape. Canvas is composed of many "
        "Shapes.",
        nodes=["Shape", "Circle", "Rectangle", "Canvas"],
        members={"Shape": "area", "Circle": "radius", "Rectangle": "width", "Canvas": "render"},
        edges=[
            ["Circle", "Shape", "inherit"],
            ["Rectangle", "Shape", "inherit"],
            ["Canvas", "Shape", "compose"],
        ],
    ),
    typed(
        "cls-zh",
        "class",
        "画一个电商订单模块的类图。类：Order（属性 id、status、total；方法 pay()、"
        "cancel()），OrderItem（属性 sku、quantity、price），User（属性 id、name），"
        "Payment（属性 amount、method）。Order 由多个 OrderItem 组合而成，User 关联"
        "多个 Order，Order 关联一个 Payment。",
        nodes=["Order", "OrderItem", "User", "Payment"],
        members={"Order": "status", "OrderItem": "quantity", "User": "name", "Payment": "amount"},
        edges=[
            ["Order", "OrderItem", "compose"],
            ["User", "Order"],
            ["Order", "Payment"],
        ],
    ),
    # ER diagram
    typed("er-short", "er", "画一个博客系统的 ER 图"),
    typed(
        "er-listed",
        "er",
        "Draw an ER diagram for an online bookstore: Customer, Order, OrderItem, "
        "Book, Author and Publisher, with their main attributes and the "
        "relationships between them.",
        nodes=["Customer", "Order", "OrderItem", "Book", "Author", "Publisher"],
        edges=[
            ["Customer", "Order"],
            ["Order", "OrderItem"],
            ["OrderItem", "Book"],
            ["Book", "Publisher"],
        ],
    ),
    typed(
        "er-sql",
        "er",
        "根据这些表画 ER 图：\n\n"
        "CREATE TABLE users(id INT PRIMARY KEY, name VARCHAR(50), email VARCHAR(100));\n"
        "CREATE TABLE posts(id INT PRIMARY KEY, user_id INT REFERENCES users(id), "
        "title VARCHAR(200), body TEXT);\n"
        "CREATE TABLE comments(id INT PRIMARY KEY, post_id INT REFERENCES posts(id), "
        "user_id INT REFERENCES users(id), content TEXT);",
        nodes=["users", "posts", "comments"],
        members={"users": "email", "posts": "title", "comments": "content"},
        edges=[["posts", "users"], ["comments", "posts"], ["comments", "users"]],
    ),
    # UML use case diagram
    typed("uc-short", "usecase", "画一个网上书店的用例图"),
    typed(
        "uc-listed",
        "usecase",
        "Draw a UML use case diagram for an ATM. Actors: Customer and Bank. "
        "System boundary: ATM. Use cases: Withdraw cash, Check balance, "
        "Transfer money, Authenticate. Customer is connected to Withdraw cash, "
        "Check balance and Transfer money. Each of these three includes "
        "Authenticate. Bank is connected to Authenticate.",
        actors=["Customer", "Bank"],
        nodes=["Withdraw cash", "Check balance", "Transfer money", "Authenticate"],
        boundary="ATM",
        edges=[
            ["Customer", "Withdraw cash"],
            ["Customer", "Check balance"],
            ["Customer", "Transfer money"],
            ["Withdraw cash", "Authenticate", "include"],
            ["Check balance", "Authenticate", "include"],
            ["Transfer money", "Authenticate", "include"],
            ["Bank", "Authenticate"],
        ],
    ),
    typed(
        "uc-ja",
        "usecase",
        "図書館システムのユースケース図を描いてください。アクター：利用者、司書。"
        "ユースケース：本を検索する、本を借りる、本を返す、蔵書を登録する。"
        "利用者は「本を検索する」「本を借りる」「本を返す」に、司書は「蔵書を登録する」"
        "に関連します。",
        actors=["利用者", "司書"],
        nodes=["本を検索する", "本を借りる", "本を返す", "蔵書を登録する"],
        edges=[
            ["利用者", "本を検索する"],
            ["利用者", "本を借りる"],
            ["利用者", "本を返す"],
            ["司書", "蔵書を登録する"],
        ],
    ),
    # UML state machine diagram
    typed(
        "st-short",
        "state",
        "state diagram for an order: created, paid, shipped, delivered, cancelled",
        nodes=["Created", "Paid", "Shipped", "Delivered", "Cancelled"],
    ),
    typed(
        "st-listed",
        "state",
        "Draw a UML state machine diagram for a document. The initial state "
        "leads to Draft. Draft goes to Review on 'submit'. Review goes back to "
        "Draft on 'request changes'. Review goes to Approved on 'approve'. "
        "Approved goes to Published on 'publish'. Published goes to Archived on "
        "'archive'. Archived leads to the final state.",
        nodes=["Draft", "Review", "Approved", "Published", "Archived"],
        edges=[
            ["Draft", "Review", "submit"],
            ["Review", "Draft", "request changes"],
            ["Review", "Approved", "approve"],
            ["Approved", "Published", "publish"],
            ["Published", "Archived", "archive"],
        ],
        ends=True,
    ),
    typed(
        "st-zh",
        "state",
        "画一个电梯的状态图：空闲、上行、下行、开门、关门，以及它们之间的转换",
        nodes=["空闲", "上行", "下行", "开门", "关门"],
    ),
    # Mind map
    typed("mm-short", "mindmap", "画一个关于学习 Python 的思维导图"),
    typed(
        "mm-listed",
        "mindmap",
        "Draw a mind map with the central topic 'Product launch'. Branches: "
        + "; ".join(f"{b} ({', '.join(leaves)})" for b, leaves in MM_EN.items())
        + ".",
        **mind_map("Product launch", MM_EN),
    ),
    typed(
        "mm-zh",
        "mindmap",
        "画一张思维导图，中心主题“健康生活”。分支："
        + "；".join(f"{b}（{'、'.join(leaves)}）" for b, leaves in MM_ZH.items())
        + "。",
        **mind_map("健康生活", MM_ZH),
    ),
]

requests = [
    # Sequence diagrams as users ask for them
    seq("start", "a login sequence diagram with SMS codes and retries", "sequence"),
    seq("six", SIX_TEXT, "sequence", SIX_P, SIX_M),
    seq("zh-short", "用户登录的时序图，包含短信验证码和失败重试", "sequence"),
    seq(
        "oauth",
        "a login sequence for a generic web app against an OAuth2 identity provider",
        "sequence",
    ),
    seq("ja-listed", JA_TEXT, "sequence", JA_P, JA_M),
    # Sequence diagrams with a special demand: the demand must be met
    seq(
        "colours",
        COL_TEXT,
        "special",
        COL_P,
        COL_M,
        demand="participants are filled #1F4E79 with white text; replies are dashed",
    ),
    seq(
        "loop-note",
        LOOP_TEXT,
        "special",
        LOOP_P,
        LOOP_M,
        demand="a loop frame around messages 5 to 7 and a note beside Auth Service",
    ),
    seq("long", LONG_TEXT, "special", LONG_P, LONG_M, demand="all 32 messages are drawn"),
    seq(
        "order-spacing",
        ORD_TEXT,
        "special",
        ORD_P,
        ORD_M,
        demand="participants in the given order, 240 px apart, the first at x=60",
    ),
    seq(
        "self",
        SELF_TEXT,
        "special",
        SELF_P,
        SELF_M,
        demand="three messages from a participant to itself",
    ),
    seq(
        "activation",
        ACT_TEXT,
        "special",
        ACT_P,
        ACT_M,
        demand="activation bars on API and Worker",
    ),
    # No diagram type named: the model has to choose
    other(
        "untyped-text",
        "untyped",
        "用户在 App 里点击支付，App 把订单发给支付网关，支付网关向银行发起扣款，"
        "银行返回扣款结果，支付网关把结果通知 App，App 给用户显示支付成功。"
        "把这个过程画出来。",
    ),
    other(
        "untyped-code",
        "untyped",
        "画出这段代码的调用过程：\n\nasync function register(req) {\n"
        "  const user = await userService.create(req.body)\n"
        "  const token = await authService.issueToken(user.id)\n"
        "  await emailService.sendWelcome(user.email)\n"
        "  await auditLog.write('register', user.id)\n"
        "  return { user, token }\n}",
    ),
    other("untyped-ambiguous", "untyped", "画一下登录流程"),
    # A second message that changes the diagram of the first
    seq(
        "edit-add",
        SIX_TEXT,
        "edit",
        SIX_P,
        SIX_M[:3] + [("Order Service", "API Gateway", "Order accepted")] + SIX_M[3:],
        followUp="After message 3 (Create order), add one more message from "
        "Order Service to API Gateway: Order accepted. Keep everything else.",
    ),
    seq(
        "edit-rename",
        SIX_TEXT,
        "edit",
        ["Mobile App" if p == "Web App" else p for p in SIX_P],
        RENAMED,
        followUp="Rename Web App to Mobile App. Keep everything else.",
    ),
    # Other diagram types: nothing may change for them
    other(
        "flow",
        "control",
        "Draw a flowchart of a coffee order: 'Customer orders' leads to 'Take "
        "payment', then a decision 'Paid?'. Yes leads to 'Make coffee', then "
        "'Serve coffee'. No leads to 'Cancel order'.",
    ),
    other(
        "arch",
        "control",
        "Draw an architecture diagram of a web application: users, a load "
        "balancer, two web servers, an application server, a cache, a primary "
        "database with a read replica, and a message queue with a worker.",
    ),
    other(
        "er",
        "control",
        "Draw an ER diagram for an online bookstore: Customer, Order, "
        "OrderItem, Book, Author and Publisher, with their main attributes and "
        "the relationships between them.",
    ),
]
requests += OTHER_TYPES
with open(sys.argv[1], "w", encoding="utf8") as out:
    json.dump({"requests": requests}, out, ensure_ascii=False, indent=4)
    out.write("\n")
print(len(requests), "requests")
