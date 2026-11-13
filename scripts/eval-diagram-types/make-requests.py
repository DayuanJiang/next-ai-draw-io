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


RENAMED = [
    tuple("Mobile App" if x == "Web App" else x for x in m[:2]) + (m[2],)
    for m in SIX_M
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
with open(sys.argv[1], "w", encoding="utf8") as out:
    json.dump({"requests": requests}, out, ensure_ascii=False, indent=4)
    out.write("\n")
print(len(requests), "requests")
