# -*- coding: utf-8 -*-
"""
个人生活管理平台 · 后端
数据层：CSV 文件数据库（/data 目录）
设计目标：通用表 CRUD 接口，新增业务模块只需在 SCHEMAS 中注册一张表，
          无需改动后端任何业务代码 —— 这就是为后续模块预留的扩展接口。
"""
import os
import re
import csv
import io
import json
import time
import uuid
import shutil
import asyncio
import threading
import hashlib
import subprocess
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
STATIC_DIR = os.path.join(BASE_DIR, "static")
CONFIG_FILE = os.path.join(DATA_DIR, "settings.json")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

LOCK = threading.RLock()
CST = timezone(timedelta(hours=8))


def now_str():
    return datetime.now(CST).strftime("%Y-%m-%d %H:%M:%S")


def today_str():
    return datetime.now(CST).strftime("%Y-%m-%d")


# ---------------------------------------------------------------------------
# 表结构定义：新增模块 = 在这里加一行
# ---------------------------------------------------------------------------
SCHEMAS: Dict[str, List[str]] = {
    # —— 身体模块 ——
    "fitness_plans":   ["id", "name", "type", "weekdays", "start_date", "end_date", "time", "note", "active", "created_at"],
    "workouts":        ["id", "date", "time", "plan_id", "type", "title", "duration_min", "completion", "items", "feeling", "note", "created_at"],
    # 体测：weight 单位是「斤」（不是 kg）；muscle=肌肉量 kg；代谢=基础代谢 kcal，
    # 腰臀比=比值，内脏脂肪=体脂秤等级
    "body_metrics":    ["id", "date", "time", "weight", "body_fat", "muscle", "metabolism", "whr", "visceral_fat", "note", "created_at"],
    # —— 成长（英语）模块 ——
    "articles":        ["id", "title", "source", "content", "words", "read", "read_at", "created_at"],
    "scenes":          ["id", "session", "title", "english", "chinese", "image", "source", "page", "done", "created_at"],
    # status 显式三态：new=新词（还没复习过）/ learning=学习中 / mastered=已掌握
    # favorite 独立于 status（收藏不影响学习流程）；wrong_count 攒「高频错词」
    # unknown=「1」是默写时点「🙈 不认识」打的标记，可单独列表查看
    "vocabulary":      ["id", "word", "phonetic", "meaning_en", "meaning_cn", "example", "example_cn",
                        "collocation", "synonyms", "my_sentence", "syllables",
                        "source", "level", "status", "favorite", "wrong_count",
                        "next_review", "last_review", "added_at", "note", "familiar", "last_grade",
                        "deck", "unknown"],
    # —— 地道表达积累 ——（和 vocabulary 同构的记忆算法：status/new/learning/mastered、
    #    wrong_count、level/familiar、next_review 走 REVIEW_STEPS 间隔复习）
    # phrase 是地道英文（如 I'm full），meaning_cn 是中文意思（如 我吃饱了）；
    # 和单词不同：表达不是直译，而是英语里自己的说法，所以重点是「记住这对映射」。
    "expressions":     ["id", "phrase", "phonetic", "meaning_cn", "meaning_en", "example", "example_cn",
                        "category", "source", "status", "favorite", "wrong_count",
                        "level", "familiar", "next_review", "last_review", "added_at", "note", "last_grade",
                        "unknown"],
    "study_logs":      ["id", "date", "kind", "ref_id", "title", "minutes", "count", "note", "created_at"],
    # —— 待确认词库（暂存区）——
    # 划词/重点词等「快速捕捉」的新词先落这里，等人工或助手补全音标/中文/例句后，
    # 再由「确认入库」按 target（vocab=生词本 / expr=表达积累）写入正式库并删除本行。
    "pending_words":   ["id", "text", "target", "phonetic", "meaning_cn", "meaning_en",
                        "example", "example_cn", "source", "added_at", "status", "note"],
    # —— 背词计划 ——
    # vocab_plans 是「怎么排」的规则；vocab_tasks 是排出来的每日任务（落到日历上打卡）
    # mode: new=学新词 / review=复习到期 / mix=先到期后新词
    # weekdays: "1,3,5" 这样（1=周一…7=周日），空串=每天
    "vocab_plans":     ["id", "name", "deck", "mode", "per_day", "start_date", "end_date",
                        "weekdays", "active", "created_at"],
    # word_ids 只在完成时回填快照：取词是实时算的（到期集合每天在变，预先写死会陈旧）
    "vocab_tasks":     ["id", "plan_id", "date", "title", "count", "mode", "deck",
                        "word_ids", "done", "done_at", "created_at"],
    # —— 听力训练 ——
    # materials 是一段听力素材；题目拆到 questions 用 material_id 关联
    # （不把题目塞进素材表：CSV 里存 JSON 转义太脏，而且题目数量不固定）
    # scene=场景 key（coffee/travel/...），category 归大类 daily/business/advanced
    # keywords 存这段用到的 business 词库里的词（逗号分隔），练完可一键收进生词本
    # voice 指定朗读音色，audio 是合成好的 MP3 路径（空=首次播放时才合成）
    "listening_materials": ["id", "scene", "category", "title", "level", "voice",
                            "transcript", "translation", "keywords", "audio", "words",
                            "source", "need_review", "created_at"],
    "listening_questions": ["id", "material_id", "q", "a", "b", "c", "d", "answer", "explain", "sort"],
    # 练习记录：step=走到第几步(1-4)，score/total=理解题对错，用于统计和连续打卡
    "listening_logs":      ["id", "material_id", "date", "step", "score", "total",
                            "minutes", "done", "created_at"],
    # —— 听力计划 ——（同构背词计划：plans 存「怎么排」，tasks 是排出的每日任务）
    # scope 是素材范围：all=全部 / daily / business / advanced / 具体场景 key（coffee/travel/…）
    "listen_plans":        ["id", "name", "scope", "per_day", "start_date", "end_date",
                            "weekdays", "active", "created_at"],
    # material_ids 只在完成时回填快照：取材是实时的（练过的素材集合每天在变）
    "listen_tasks":        ["id", "plan_id", "date", "title", "count", "scope",
                            "material_ids", "done", "done_at", "created_at"],
    # —— 知识库（素材中枢）——
    # kb_materials 收一切原始素材（PPT/Notes/QA/Meeting/Email/Teams/随手记），
    # status: 0=待整理 1=已整理。素材发给助手（对话里），整理结果分流进
    # vocabulary / listening_* / kb_cards，原文留在这里可追溯。
    # file 存上传文件的原始路径（/uploads/kb_xxx.pptx），详情页可下载、助手可解读
    "kb_materials":  ["id", "type", "title", "content", "file", "status", "summary", "created_at"],
    # kb_cards 是「学习卡」：一句话 + 五件套（意思/用法/例句/相似/口语练习），助手整理写入
    "kb_cards":      ["id", "material_id", "sentence", "meaning_cn", "usage", "example",
                      "similar", "speaking", "created_at"],
    # —— 事务模块 ——
    # kind 显式区分两种东西：todo=待办（时间只是截止提醒，未完成就全部列出）
    #                        event=日程（某天要做的事，只看当天，可跨天）
    # repeat_done 标记「这条重复项已经生成过下一次实例」，以前没注册被静默丢弃了
    "todos":           ["id", "title", "kind", "date", "end_date", "time", "priority", "done",
                        "repeat", "repeat_days", "repeat_done", "tag", "note", "done_at", "created_at"],
    "notes":           ["id", "title", "content", "category", "pinned", "created_at", "updated_at"],
    # —— 种草清单 ——
    # images = 多图 URL 的 JSON 数组字符串；image 保留为「首图」兼容旧数据与首页组件
    "wishlist":        ["id", "name", "folder", "image", "images", "price", "link", "priority", "status", "note", "created_at", "bought_at"],
    # —— 通用：任意自定义模块的数据都可用 custom_* 表承接 ——
    "custom_records":  ["id", "module", "date", "title", "value", "extra", "created_at"],
}

DEFAULT_SETTINGS = {
    "city": "上海",
    "latitude": 31.2304,
    "longitude": 121.4737,
    "modules": {
        "fitness": {"name": "身体", "on": True},
        "growth": {"name": "成长 · 英语", "on": True},
        "todo": {"name": "事务", "on": True},
        "wishlist": {"name": "种草清单", "on": True},
        "notes": {"name": "记录事项", "on": True},
    },
}


# ---------------------------------------------------------------------------
# CSV 数据层
# ---------------------------------------------------------------------------
def table_path(table: str) -> str:
    if table not in SCHEMAS:
        raise HTTPException(404, f"未知数据表: {table}")
    return os.path.join(DATA_DIR, f"{table}.csv")


def read_table(table: str) -> List[Dict[str, str]]:
    path = table_path(table)
    cols = SCHEMAS[table]
    if not os.path.exists(path):
        with LOCK:
            with open(path, "w", newline="", encoding="utf-8-sig") as f:
                csv.writer(f).writerow(cols)
        return []
    with LOCK:
        with open(path, "r", newline="", encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))
    out = []
    for r in rows:
        item = {c: (r.get(c) if r.get(c) is not None else "") for c in cols}
        out.append(item)
    return out


def write_table(table: str, rows: List[Dict[str, str]]):
    path = table_path(table)
    cols = SCHEMAS[table]
    with LOCK:
        with open(path, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow({c: r.get(c, "") for c in cols})


def next_id(rows: List[Dict[str, str]]) -> str:
    mx = 0
    for r in rows:
        try:
            mx = max(mx, int(str(r.get("id") or 0)))
        except ValueError:
            pass
    return str(mx + 1)


def load_settings() -> Dict[str, Any]:
    if not os.path.exists(CONFIG_FILE):
        save_settings(DEFAULT_SETTINGS)
        return json.loads(json.dumps(DEFAULT_SETTINGS))
    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    for k, v in DEFAULT_SETTINGS.items():
        if k not in cfg:
            cfg[k] = v
    return cfg


def save_settings(cfg: Dict[str, Any]):
    with LOCK:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="个人生活管理平台")


class RowBody(BaseModel):
    data: Dict[str, Any] = {}


def _match(row: Dict[str, str], filters: Dict[str, str]) -> bool:
    for k, v in filters.items():
        if k not in row:
            return False
        if v.startswith("~"):
            if v[1:].lower() not in str(row.get(k, "")).lower():
                return False
        else:
            if str(row.get(k, "")) != v:
                return False
    return True


@app.get("/api/tables")
def api_tables():
    return {"tables": list(SCHEMAS.keys()), "schemas": SCHEMAS}


@app.get("/api/table/{table}")
def api_list(table: str, where: str = "", order_by: str = "", desc: int = 0, limit: int = 0):
    rows = read_table(table)
    if where:
        try:
            filters = json.loads(where)
        except json.JSONDecodeError:
            raise HTTPException(400, "where 参数需为 JSON 对象")
        rows = [r for r in rows if _match(r, filters)]
    if order_by:
        rows.sort(key=lambda r: str(r.get(order_by, "")), reverse=bool(desc))
    if limit:
        rows = rows[:limit]
    return {"rows": rows, "total": len(rows)}


@app.post("/api/table/{table}")
def api_create(table: str, body: RowBody):
    rows = read_table(table)
    data = dict(body.data)
    data["id"] = data.get("id") or next_id(rows)
    if "created_at" in SCHEMAS[table] and not data.get("created_at"):
        data["created_at"] = now_str()
    # 新单词默认进「我的词库」，没传 deck 或传了未知库都兜回默认库
    if table == "vocabulary" and (not data.get("deck") or data["deck"] not in DECK_KEYS):
        data["deck"] = DEFAULT_DECK
    rows.append(data)
    write_table(table, rows)
    return {"ok": True, "row": data}


@app.post("/api/table/{table}/bulk")
def api_bulk(table: str, body: Dict[str, Any]):
    rows = read_table(table)
    items = body.get("rows", [])
    start = int(next_id(rows))
    added = []
    for i, it in enumerate(items):
        d = dict(it)
        d["id"] = str(start + i)
        if "created_at" in SCHEMAS[table] and not d.get("created_at"):
            d["created_at"] = now_str()
        rows.append(d)
        added.append(d)
    write_table(table, rows)
    return {"ok": True, "count": len(added), "rows": added}


@app.put("/api/table/{table}/{rid}")
def api_update(table: str, rid: str, body: RowBody):
    rows = read_table(table)
    hit = False
    for r in rows:
        if str(r.get("id")) == str(rid):
            r.update({k: v for k, v in body.data.items() if k != "id"})
            if "updated_at" in SCHEMAS[table]:
                r["updated_at"] = now_str()
            hit = True
            break
    if not hit:
        raise HTTPException(404, "记录不存在")
    write_table(table, rows)
    return {"ok": True, "row": rows[[i for i, r in enumerate(rows) if str(r.get("id")) == str(rid)][0]]}


@app.delete("/api/table/{table}/{rid}")
def api_delete(table: str, rid: str):
    rows = read_table(table)
    left = [r for r in rows if str(r.get("id")) != str(rid)]
    if len(left) == len(rows):
        raise HTTPException(404, "记录不存在")
    write_table(table, left)
    return {"ok": True}


# -------------------------- 设置 --------------------------
@app.get("/api/settings")
def api_get_settings():
    return load_settings()


@app.post("/api/settings")
def api_set_settings(body: Dict[str, Any]):
    cfg = load_settings()
    cfg.update(body)
    save_settings(cfg)
    return {"ok": True, "settings": cfg}


# -------------------------- 天气 --------------------------
WEATHER_CODE = {
    0: "晴", 1: "少云", 2: "多云", 3: "阴", 45: "雾", 48: "霜雾",
    51: "小毛雨", 53: "毛雨", 55: "大毛雨", 61: "小雨", 63: "中雨", 65: "大雨",
    66: "冻雨", 67: "强冻雨", 71: "小雪", 73: "中雪", 75: "大雪", 77: "雪粒",
    80: "阵雨", 81: "强阵雨", 82: "暴雨", 85: "阵雪", 86: "强阵雪", 95: "雷阵雨",
    96: "雷阵雨伴冰雹", 99: "强雷阵雨伴冰雹",
}


@app.get("/api/weather")
def api_weather(lat: float = Query(None), lon: float = Query(None)):
    cfg = load_settings()
    lat = lat if lat is not None else cfg.get("latitude", 31.2304)
    lon = lon if lon is not None else cfg.get("longitude", 121.4737)
    url = ("https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s"
           "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m"
           "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
           "&timezone=Asia%%2FShanghai&forecast_days=3" % (lat, lon))
    try:
        with urllib.request.urlopen(url, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        cur = data.get("current", {})
        code = cur.get("weather_code", 0)
        daily = data.get("daily", {})
        forecast = []
        for i, d in enumerate(daily.get("time", [])[:3]):
            forecast.append({
                "date": d,
                "code": daily.get("weather_code", [])[i],
                "desc": WEATHER_CODE.get(daily.get("weather_code", [])[i], ""),
                "max": daily.get("temperature_2m_max", [])[i],
                "min": daily.get("temperature_2m_min", [])[i],
                "pop": daily.get("precipitation_probability_max", [])[i],
            })
        rain_codes = {51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99}
        snow_codes = {71, 73, 75, 77, 85, 86}
        return {
            "ok": True,
            "city": cfg.get("city", ""),
            "temp": cur.get("temperature_2m"),
            "feels": cur.get("apparent_temperature"),
            "humidity": cur.get("relative_humidity_2m"),
            "wind": cur.get("wind_speed_10m"),
            "code": code,
            "desc": WEATHER_CODE.get(code, "—"),
            # 是否下雨 / 下雪 + 今日降水概率（供首页穿衣提示使用）
            "rain": code in rain_codes,
            "snow": code in snow_codes,
            "pop": (daily.get("precipitation_probability_max", []) or [None])[0],
            "forecast": forecast,
        }
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e), "city": cfg.get("city", "")})


@app.get("/api/geocode")
def api_geocode(q: str):
    url = "https://geocoding-api.open-meteo.com/v1/search?count=5&language=zh&name=" + urllib.parse.quote(q)
    try:
        with urllib.request.urlopen(url, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return {"ok": True, "results": data.get("results", [])}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e), "results": []})


# -------------------------- 上传 --------------------------
@app.post("/api/upload")
async def api_upload(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "")[1].lower() or ".bin"
    name = f"{int(time.time())}_{uuid.uuid4().hex[:8]}{ext}"
    path = os.path.join(UPLOAD_DIR, name)
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"ok": True, "url": f"/uploads/{name}"}


# -------------------------- 词典 --------------------------
def http_get_json(url: str, timeout: int = 8):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (LifePlatform)"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", "ignore"))


@app.get("/api/dict/{word}")
def api_dict(word: str):
    w = word.strip().lower()
    # 先查本地单词本
    for r in read_table("vocabulary"):
        if r.get("word", "").strip().lower() == w:
            return {"ok": True, "from": "local", "entry": r}
    result = {"word": w, "phonetic": "", "meaning_en": "", "meaning_cn": "", "example": ""}
    # 1) 英文释义 / 音标 / 例句
    try:
        data = http_get_json(f"https://api.dictionaryapi.dev/api/v2/entries/en/{urllib.parse.quote(w)}")
        entry = data[0]
        result["phonetic"] = entry.get("phonetic") or (entry.get("phonetics") or [{}])[0].get("text", "")
        meanings = []
        for m in entry.get("meanings", [])[:3]:
            pos = m.get("partOfSpeech", "")
            for d in m.get("definitions", [])[:1]:
                meanings.append(f"{pos}. {d.get('definition','')}")
                if d.get("example") and not result["example"]:
                    result["example"] = d["example"]
        result["meaning_en"] = " / ".join(meanings)
    except Exception:
        pass
    # 2) 中文释义：有道词典建议接口
    try:
        d = http_get_json("https://dict.youdao.com/suggest?num=1&ver=3.0&doctype=json&q=" + urllib.parse.quote(w))
        entries = (d.get("data", {}) or {}).get("entries", [])
        if entries and entries[0].get("entry", "").lower() == w:
            result["meaning_cn"] = entries[0].get("explain", "")[:200]
    except Exception:
        pass
    # 3) 兜底：整句翻译
    if not result["meaning_cn"]:
        try:
            src = urllib.parse.quote((result["meaning_en"][:300] or w))
            d = http_get_json(f"https://api.mymemory.translated.net/get?q={src}&langpair=en|zh-CN")
            txt = (d.get("responseData", {}) or {}).get("translatedText", "")
            if txt and not txt.startswith("MYMEMORY"):
                result["meaning_cn"] = txt[:200]
        except Exception:
            pass
    return {"ok": True, "from": "web", "entry": result}


# -------------------------- 听力 TTS 合成 --------------------------
# 用 edge-tts（微软 Edge 的在线合成，免 key，Neural 音色自然）。
# 不选 gTTS：它走 translate.google.com，实测国内网络直接卡死超时。
# 合成结果按 (音色+文本) 哈希缓存到 uploads —— 同一段素材只合成一次，之后秒开。
TTS_VOICES = [
    {"id": "en-US-JennyNeural",  "label": "Jenny · 美式女声",  "tag": "daily"},
    {"id": "en-US-GuyNeural",    "label": "Guy · 美式男声",    "tag": "daily"},
    {"id": "en-US-AriaNeural",   "label": "Aria · 美式女声",   "tag": "business"},
    {"id": "en-US-AndrewNeural", "label": "Andrew · 美式男声", "tag": "business"},
    {"id": "en-GB-SoniaNeural",  "label": "Sonia · 英式女声",  "tag": "advanced"},
    {"id": "en-GB-RyanNeural",   "label": "Ryan · 英式男声",   "tag": "advanced"},
]


def tts_concat(parts, out):
    """拼接分片。有 ffmpeg 就走 concat 重封装 —— 这样时长元数据才准，进度条才对得上；
       没有 ffmpeg 就直接拼字节，能播，但总时长可能算不准。"""
    lst = out + ".list"
    try:
        with open(lst, "w", encoding="utf-8") as f:
            for p in parts:
                f.write(f"file '{os.path.abspath(p)}'\n")
        r = subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", lst,
                            "-c", "copy", "-write_xing", "1", out],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=90)
        if r.returncode == 0 and os.path.exists(out) and os.path.getsize(out) > 512:
            return
    except Exception:
        pass
    finally:
        try:
            if os.path.exists(lst):
                os.remove(lst)
        except Exception:
            pass
    with open(out, "wb") as f:                      # 兜底：裸拼
        for p in parts:
            try:
                with open(p, "rb") as g:
                    f.write(g.read())
            except Exception:
                pass


async def tts_build(text, voice, out):
    """合成整段并写到 out。
       edge-tts 内部是「一句一次请求」的（实测约 1.4 秒/句），一段 15 句的对话
       串行要十四秒 —— 点一下播放干等十几秒完全没法用。
       把句子拆开并发合成再拼回去，音质一模一样（本来就是逐句合成的），
       只是把等待压到三分之一。并发限 4：再高微软那边会明显限速，反而更慢。"""
    import edge_tts
    parts = [p.strip() for p in re.split(r"(?<=[.!?])\s+", text) if p.strip()]
    if len(parts) < 2:
        await edge_tts.Communicate(text, voice).save(out)
        return
    # 并发度实测：4 → 9.9s（19句），12 → 4.4s。取 10 是甜点，再高收益变小且容易被限速
    sem = asyncio.Semaphore(min(len(parts), 10))

    async def one(i, p):
        async with sem:
            fp = f"{out}.p{i}"
            await edge_tts.Communicate(p, voice).save(fp)
            return fp

    ps = await asyncio.gather(*[one(i, p) for i, p in enumerate(parts)])
    try:
        tts_concat(ps, out)
    finally:
        for p in ps:
            try:
                os.remove(p)
            except Exception:
                pass


@app.get("/api/tts/voices")
async def api_tts_voices():
    return {"ok": True, "voices": TTS_VOICES}


@app.post("/api/tts")
async def api_tts(text: str = Form(...), voice: str = Form("en-US-AriaNeural")):
    """把一段英文合成 MP3。命中缓存直接返回 url，否则现合成（约 2 秒 / 200 词）"""
    t = (text or "").strip()
    if not t:
        return JSONResponse({"ok": False, "error": "文本为空"})
    if len(t) > 4000:
        t = t[:4000]
    if voice not in {v["id"] for v in TTS_VOICES}:
        voice = "en-US-AriaNeural"
    key = hashlib.md5((voice + "|" + t).encode("utf-8")).hexdigest()[:16]
    nm = f"tts_{key}.mp3"
    path = os.path.join(UPLOAD_DIR, nm)
    if os.path.exists(path) and os.path.getsize(path) > 1024:
        return {"ok": True, "url": f"/uploads/{nm}", "cached": True}
    try:
        import edge_tts
    except ImportError:
        # fallback 让前端直接改用浏览器朗读，不当成硬错误
        return JSONResponse({"ok": False, "error": "服务端未安装 edge-tts", "fallback": True})
    tmp = path + ".tmp"
    try:
        await tts_build(t, voice, tmp)
        os.replace(tmp, path)          # 原子替换：避免并发时前端读到半截文件
    except Exception as e:
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except Exception:
            pass
        return JSONResponse({"ok": False, "error": f"{type(e).__name__}: {e}"[:160], "fallback": True})
    if not os.path.exists(path) or os.path.getsize(path) < 512:
        return JSONResponse({"ok": False, "error": "合成结果异常", "fallback": True})
    return {"ok": True, "url": f"/uploads/{nm}", "cached": False}


# -------------------------- PDF 导入 --------------------------
def pdf_pages(path: str) -> List[str]:
    try:
        from pypdf import PdfReader
        reader = PdfReader(path)
        return [(p.extract_text() or "") for p in reader.pages]
    except Exception:
        import subprocess
        out = subprocess.run(["pdftotext", "-enc", "UTF-8", path, "-"], capture_output=True)
        txt = out.stdout.decode("utf-8", "ignore")
        return [t for t in txt.split("\f") if t.strip()]


def split_articles(text: str, min_len: int = 220):
    """按空行/标题切分成短文"""
    import re
    text = re.sub(r"\r\n", "\n", text)
    blocks = [b.strip() for b in re.split(r"\n\s*\n", text) if b.strip()]
    arts, buf = [], ""
    for b in blocks:
        buf = (buf + "\n\n" + b).strip() if buf else b
        if len(buf) >= min_len:
            arts.append(buf)
            buf = ""
    if buf:
        if arts and len(buf) < min_len // 2:
            arts[-1] += "\n\n" + buf
        else:
            arts.append(buf)
    return arts


@app.post("/api/pdf/articles")
async def api_pdf_articles(file: UploadFile = File(...), mode: str = Form("auto"), min_len: int = Form(220)):
    """批量导入小短文：按页或按段落拆分为多篇文章"""
    tmp = os.path.join(UPLOAD_DIR, f"tmp_{uuid.uuid4().hex}.pdf")
    with open(tmp, "wb") as f:
        shutil.copyfileobj(file.file, f)
    pages = pdf_pages(tmp)
    os.remove(tmp)
    base = os.path.splitext(file.filename or "导入")[0]
    items = []
    if mode == "page":
        for i, p in enumerate(pages):
            t = p.strip()
            if len(t) < 30:
                continue
            lines = [x.strip() for x in t.split("\n") if x.strip()]
            items.append({"title": f"{base} · 第{i+1}篇", "content": t, "words": str(len(t.split())),
                          "source": base, "read": "0", "read_at": ""})
            _ = lines
    else:
        idx = 0
        for p in pages:
            for a in split_articles(p, min_len):
                idx += 1
                lines = [x.strip() for x in a.split("\n") if x.strip()]
                title = lines[0][:40] if lines else f"{base} · 第{idx}篇"
                items.append({"title": f"{base} · {title}", "content": a, "words": str(len(a.split())),
                              "source": base, "read": "0", "read_at": ""})
    if not items:
        return JSONResponse({"ok": False, "error": "未能从 PDF 中提取到文本（可能是扫描件，需要 OCR）", "rows": []})
    rows = read_table("articles")
    start = int(next_id(rows))
    added = []
    for i, it in enumerate(items):
        it["id"] = str(start + i)
        it["created_at"] = now_str()
        rows.append(it)
        added.append(it)
    write_table("articles", rows)
    return {"ok": True, "count": len(added), "rows": added}


@app.post("/api/pdf/scenes")
async def api_pdf_scenes(file: UploadFile = File(...), session: str = Form("默认场景"),
                         group: str = Form("page")):
    """导入场景教材（如 English for Everyday Activities）：每页/每段生成一张情景卡片 + 页面图片"""
    tmp = os.path.join(UPLOAD_DIR, f"tmp_{uuid.uuid4().hex}.pdf")
    with open(tmp, "wb") as f:
        shutil.copyfileobj(file.file, f)
    base = os.path.splitext(file.filename or "scenes")[0]
    pages = pdf_pages(tmp)
    images = []
    try:
        from pdf2image import convert_from_path
        imgs = convert_from_path(tmp, dpi=110)
        for i, im in enumerate(imgs):
            nm = f"scene_{uuid.uuid4().hex[:8]}_{i}.jpg"
            im.save(os.path.join(UPLOAD_DIR, nm), "JPEG", quality=80)
            images.append(f"/uploads/{nm}")
    except Exception:
        images = []
    os.remove(tmp)

    items = []
    if group == "page":
        for i, t in enumerate(pages):
            t = t.strip()
            if len(t) < 10:
                continue
            lines = [x.strip() for x in t.split("\n") if x.strip()]
            title = lines[0][:50] if lines else f"场景 {i+1}"
            items.append({"session": session, "title": title, "english": t,
                          "chinese": "", "image": images[i] if i < len(images) else "",
                          "source": base, "page": str(i + 1), "done": "0"})
    else:
        idx = 0
        for i, p in enumerate(pages):
            for a in split_articles(p, 120):
                idx += 1
                lines = [x.strip() for x in a.split("\n") if x.strip()]
                items.append({"session": session, "title": lines[0][:50] if lines else f"场景 {idx}",
                              "english": a, "chinese": "", "image": images[i] if i < len(images) else "",
                              "source": base, "page": str(i + 1), "done": "0"})
    if not items:
        return JSONResponse({"ok": False, "error": "未能提取文本", "rows": []})
    rows = read_table("scenes")
    start = int(next_id(rows))
    added = []
    for i, it in enumerate(items):
        it["id"] = str(start + i)
        it["created_at"] = now_str()
        rows.append(it)
        added.append(it)
    write_table("scenes", rows)
    return {"ok": True, "count": len(added), "rows": added}


# -------------------------- KB 素材文件上传 --------------------------
# 上传 PPT/PDF/文本文件 → 存档到 uploads + 尽量提取文字进 content。
# 提取不到（图片型 PPT 等）也没关系：文件存下来了，等助手解读。
# 旧版二进制 .ppt 读不了，提示另存为 .pptx。
KB_TYPE_KEYS = {"ppt", "notes", "qa", "meeting", "email", "teams", "snapshot"}


@app.post("/api/kb/upload")
async def api_kb_upload(file: UploadFile = File(...), type: str = Form("ppt")):
    name = file.filename or "素材"
    ext = os.path.splitext(name)[1].lower()
    if ext not in (".pptx", ".pdf", ".txt", ".md"):
        return JSONResponse({"ok": False,
                             "error": "支持 .pptx / .pdf / .txt / .md；旧版 .ppt 请先用 PowerPoint 另存为 .pptx"})
    raw = await file.read()
    if len(raw) > 30 * 1024 * 1024:
        return JSONResponse({"ok": False, "error": "文件超过 30MB"})
    nm = f"kb_{uuid.uuid4().hex[:8]}{ext}"
    path = os.path.join(UPLOAD_DIR, nm)
    with open(path, "wb") as f:
        f.write(raw)

    text = ""
    try:
        if ext == ".pptx":
            from pptx import Presentation
            prs = Presentation(path)
            pages = []
            for i, slide in enumerate(prs.slides, 1):
                buf = [t.strip() for sh in slide.shapes
                       if sh.has_text_frame and (t := sh.text_frame.text).strip()]
                # 演讲备注（speaker notes）一并提出来 —— 学表达的素材常藏在备注里
                if slide.has_notes_slide:
                    nt = (slide.notes_slide.notes_text_frame.text or "").strip()
                    if nt:
                        buf.append(f"[备注] {nt}")
                if buf:
                    pages.append(f"— 第 {i} 页 —\n" + "\n".join(buf))
            text = "\n\n".join(pages)
        elif ext == ".pdf":
            text = "\n\n".join(f"— 第 {i} 页 —\n{p.strip()}"
                               for i, p in enumerate(pdf_pages(path), 1) if p.strip())
        else:
            text = raw.decode("utf-8", errors="ignore")
    except Exception:
        text = ""
    if not text.strip():
        text = f"📎 文件已存档：/uploads/{nm}\n（自动提取不到文字 —— 可能是图片型 PPT 或扫描件，待解读）"

    rows = read_table("kb_materials")
    data = {"type": type if type in KB_TYPE_KEYS else "ppt",
            "title": os.path.splitext(name)[0][:60],
            "content": text[:20000], "file": f"/uploads/{nm}",
            "status": "0", "summary": f"📎 {name}",
            "id": next_id(rows), "created_at": now_str()}
    rows.append(data)
    write_table("kb_materials", rows)
    return {"ok": True, "row": data, "chars": len(text)}


# -------------------------- 今日汇总 --------------------------
@app.get("/api/today")
def api_today(date: str = ""):
    d = date or today_str()
    body = read_table("body_metrics")
    today_body = [b for b in body if b.get("date") == d]
    workouts = [w for w in read_table("workouts") if w.get("date") == d]
    logs = [l for l in read_table("study_logs") if l.get("date") == d]
    todos = [t for t in read_table("todos") if t.get("date") == d or (not t.get("date"))]

    # 艾宾浩斯到期单词
    vocab = read_table("vocabulary")
    due = []
    for v in vocab:
        nr = v.get("next_review") or v.get("added_at", "")[:10]
        if nr and nr <= d:
            due.append(v)

    return {
        "date": d,
        "body": sorted(today_body, key=lambda x: x.get("time", "")),
        "workouts": workouts,
        "study_logs": logs,
        "todos": todos,
        "due_words": due,
        "due_count": len(due),
        "vocab_total": len(vocab),
        "wish_want": len([w for w in read_table("wishlist") if w.get("status") != "bought"]),
        "unread": len([a for a in read_table("articles") if a.get("read") != "1"]),
    }


# -------------------------- 艾宾浩斯 --------------------------
# 第一版用固定间隔（天）：认识 → 升一级；模糊 → 原级再来一次；忘记 → 回到 0 级
# 索引即 level：0=明天 1=3天后 2=7天后 3=14天后 4=30天后（到顶即「已掌握」）
REVIEW_STEPS = [1, 3, 7, 14, 30]


# -------------------------- 词汇库（deck） --------------------------
# 库只是「分类容器」，本身不含单词；添加单词时选库，复习/浏览时按库筛选。
# kind: user=自己攒的库（可增删词）；system=预置分级库（目前只做筛选入口，不预装单词）
DECKS = [
    {"key": "business", "name": "Business Word", "cn": "工作词汇库", "kind": "user", "group": "我的词库", "order": 1},
    {"key": "cefr-a1", "name": "CEFR A1", "cn": "入门", "kind": "system", "group": "CEFR 分级", "order": 10},
    {"key": "cefr-a2", "name": "CEFR A2", "cn": "基础", "kind": "system", "group": "CEFR 分级", "order": 11},
    {"key": "cefr-b1", "name": "CEFR B1", "cn": "进阶", "kind": "system", "group": "CEFR 分级", "order": 12},
    {"key": "cefr-b2", "name": "CEFR B2", "cn": "中高级", "kind": "system", "group": "CEFR 分级", "order": 13},
    {"key": "cefr-c1", "name": "CEFR C1", "cn": "高级", "kind": "system", "group": "CEFR 分级", "order": 14},
    {"key": "oxford-3000", "name": "Oxford 3000", "cn": "核心 3000 词", "kind": "system", "group": "Oxford 词表", "order": 20},
    {"key": "oxford-5000", "name": "Oxford 5000", "cn": "扩展 5000 词", "kind": "system", "group": "Oxford 词表", "order": 21},
    # 英孚（EF）分级词库：Level 1-6，与 CEFR 一样先建空位，装词后即可筛选/背词
    {"key": "ef-1", "name": "英孚 1", "cn": "Level 1", "kind": "system", "group": "英孚词库", "order": 30},
    {"key": "ef-2", "name": "英孚 2", "cn": "Level 2", "kind": "system", "group": "英孚词库", "order": 31},
    {"key": "ef-3", "name": "英孚 3", "cn": "Level 3", "kind": "system", "group": "英孚词库", "order": 32},
    {"key": "ef-4", "name": "英孚 4", "cn": "Level 4", "kind": "system", "group": "英孚词库", "order": 33},
    {"key": "ef-5", "name": "英孚 5", "cn": "Level 5", "kind": "system", "group": "英孚词库", "order": 34},
    {"key": "ef-6", "name": "英孚 6", "cn": "Level 6", "kind": "system", "group": "英孚词库", "order": 35},
]
DECK_KEYS = {d["key"] for d in DECKS}
DEFAULT_DECK = "business"


@app.get("/api/vocab/decks")
def api_decks():
    """库列表 + 每个库当前的单词数（0 表示还没往里装词）"""
    rows = read_table("vocabulary")
    cnt = {}
    for r in rows:
        cnt[r.get("deck") or ""] = cnt.get(r.get("deck") or "", 0) + 1
    return {
        "ok": True,
        "decks": [dict(d, count=cnt.get(d["key"], 0)) for d in DECKS],
        "undecked": cnt.get("", 0),
        "total": len(rows),
    }


@app.post("/api/vocab/{rid}/review")
def api_review(rid: str, body: Dict[str, Any] = None):
    body = body or {}
    # grade: know=认识 / fuzzy=模糊 / forget=忘记；旧字段 know=1/0 向后兼容
    grade = body.get("grade") or ("know" if str(body.get("know", "1")) == "1" else "forget")
    rows = read_table("vocabulary")
    target = None
    for r in rows:
        if str(r.get("id")) == str(rid):
            target = r
            break
    if not target:
        raise HTTPException(404, "单词不存在")
    lvl = int(target.get("level") or 0)
    top = len(REVIEW_STEPS) - 1
    if grade == "know":
        lvl = min(lvl + 1, top)
        if int(target.get("familiar") or 0) < 5:
            target["familiar"] = str(int(target.get("familiar") or 0) + 1)
        if lvl >= top:
            target["status"] = "mastered"
    elif grade == "fuzzy":
        pass  # 原级原地再排一次
    else:  # forget
        lvl = 0
        target["familiar"] = "0"
        target["wrong_count"] = str(int(target.get("wrong_count") or 0) + 1)
        target["status"] = "learning"
    if target.get("status") == "new":
        target["status"] = "learning"
    target["level"] = str(lvl)
    target["last_review"] = today_str()
    target["last_grade"] = grade
    target["next_review"] = (datetime.now(CST) + timedelta(days=REVIEW_STEPS[lvl])).strftime("%Y-%m-%d")
    write_table("vocabulary", rows)
    return {"ok": True, "row": target}


@app.post("/api/review/{table}/{rid}/review")
def api_review_generic(table: str, rid: str, body: Dict[str, Any] = None):
    """通用复习打分接口：vocabulary / expressions 等采用同一套间隔复习算法。
    沿用 api_review 的逻辑，只是表名由参数决定，避免每种表各写一份。"""
    if table not in SCHEMAS:
        raise HTTPException(404, f"未知数据表: {table}")
    body = body or {}
    grade = body.get("grade") or ("know" if str(body.get("know", "1")) == "1" else "forget")
    rows = read_table(table)
    target = None
    for r in rows:
        if str(r.get("id")) == str(rid):
            target = r
            break
    if not target:
        raise HTTPException(404, "记录不存在")
    lvl = int(target.get("level") or 0)
    top = len(REVIEW_STEPS) - 1
    if grade == "know":
        lvl = min(lvl + 1, top)
        if int(target.get("familiar") or 0) < 5:
            target["familiar"] = str(int(target.get("familiar") or 0) + 1)
        if lvl >= top:
            target["status"] = "mastered"
    elif grade == "fuzzy":
        pass
    else:  # forget
        lvl = 0
        target["familiar"] = "0"
        target["wrong_count"] = str(int(target.get("wrong_count") or 0) + 1)
        target["status"] = "learning"
    if target.get("status") == "new":
        target["status"] = "learning"
    target["level"] = str(lvl)
    target["last_review"] = today_str()
    target["last_grade"] = grade
    target["next_review"] = (datetime.now(CST) + timedelta(days=REVIEW_STEPS[lvl])).strftime("%Y-%m-%d")
    write_table(table, rows)
    return {"ok": True, "row": target}


# -------------------------- 邮件日报（每天定时汇总今日日程/待办） --------------------------
# 原理：后台线程每分钟检查一次；到了配置的发送时间（默认 09:00）就把
#       今天的日程、待办、逾期未办汇总成一封 HTML 邮件发到收件邮箱。
# 配置存在 settings.json 的 "mail" 字段里（前端设置页可填）。
# SMTP 凭证走用户自己的邮箱（QQ/163/Gmail…授权码），常用域名自动匹配服务器地址。

MAIL_SMTP_PRESETS = {
    "qq.com":      ("smtp.qq.com", 465),
    "foxmail.com": ("smtp.qq.com", 465),
    "163.com":     ("smtp.163.com", 465),
    "126.com":     ("smtp.126.com", 465),
    "yeah.net":    ("smtp.yeah.net", 465),
    "gmail.com":   ("smtp.gmail.com", 465),
    "outlook.com": ("smtp.office365.com", 587),
    "hotmail.com": ("smtp.office365.com", 587),
    "live.com":    ("smtp.office365.com", 587),
    "sina.com":    ("smtp.sina.com", 465),
    "aliyun.com":  ("smtp.aliyun.com", 465),
}

DEFAULT_MAIL_CFG = {
    "enabled": False, "to": "", "smtp_user": "", "smtp_pass": "",
    "smtp_host": "", "smtp_port": "", "send_time": "09:00",
    "last_sent": "", "last_error": "",
}

MAIL_STATE = {"last_fail": 0.0}


def mail_cfg() -> Dict[str, Any]:
    cfg = load_settings()
    m = dict(DEFAULT_MAIL_CFG)
    m.update(cfg.get("mail") or {})
    return m


def save_mail_cfg(m: Dict[str, Any]):
    cfg = load_settings()
    cfg["mail"] = m
    save_settings(cfg)


def mail_ready(m: Dict[str, Any]) -> bool:
    return bool(m.get("enabled") and m.get("to") and m.get("smtp_user") and m.get("smtp_pass"))


def smtp_endpoint(m: Dict[str, Any]):
    """按发件邮箱域名自动选 SMTP 服务器；手填的 host/port 优先"""
    domain = str(m.get("smtp_user", "")).split("@")[-1].strip().lower()
    host, port = MAIL_SMTP_PRESETS.get(domain, (f"smtp.{domain}" if domain else "", 465))
    return m.get("smtp_host") or host, int(m.get("smtp_port") or port)


def send_mail(to_addr: str, subject: str, html: str, m: Dict[str, Any]):
    import smtplib
    from email.mime.text import MIMEText
    from email.header import Header
    from email.utils import formataddr
    host, port = smtp_endpoint(m)
    if not host:
        raise ValueError("无法识别 SMTP 服务器，请在高级设置里手填服务器地址")
    msg = MIMEText(html, "html", "utf-8")
    msg["Subject"] = Header(subject, "utf-8")
    msg["From"] = formataddr((str(Header("个人管理平台", "utf-8")), m["smtp_user"]))
    msg["To"] = to_addr
    if port == 465:
        srv = smtplib.SMTP_SSL(host, port, timeout=25)
    else:
        srv = smtplib.SMTP(host, port, timeout=25)
        try:
            srv.starttls()
        except smtplib.SMTPException:
            pass  # 明文端口（如本地网关）就不强制 TLS
    try:
        srv.login(m["smtp_user"], m["smtp_pass"])
        srv.sendmail(m["smtp_user"], [to_addr], msg.as_string())
    finally:
        try:
            srv.quit()
        except Exception:
            pass


def build_digest(force=False):
    """汇总今天的日程 / 待办 / 逾期未办，返回 (subject, html)。
    当天一项都没有且非强制（测试）时返回 (None, None)，不發空邮件。"""
    def esc(s):
        import html as _h
        return _h.escape(str(s or ""))

    rows = read_table("todos")
    t = today_str()
    events, today_todos, overdue = [], [], []
    for r in rows:
        if r.get("done") == "1":
            continue
        d = r.get("date") or ""
        if (r.get("kind") or "todo") == "event":
            if d and d <= t <= (r.get("end_date") or d):
                events.append(r)
        elif d and d < t:
            overdue.append(r)
        elif d == t:
            today_todos.append(r)

    def sort_key(r):
        return (r.get("time") or "99:99", r.get("priority") or "", r.get("title") or "")

    events.sort(key=sort_key)
    today_todos.sort(key=sort_key)
    overdue.sort(key=sort_key)

    def items_html(items):
        out = []
        for r in items:
            tm = esc(r.get("time")) if r.get("time") else "全天"
            title = esc(r.get("title") or "未命名")
            note = f'<span style="color:#B49BC0;font-size:12px">　{esc(r["note"])}</span>' if r.get("note") else ""
            out.append(
                f'<div style="background:#FBF6FC;border-radius:14px;padding:9px 14px;margin:7px 0;font-size:14.5px;color:#3D2B4F">'
                f'<span style="display:inline-block;min-width:48px;color:#B08BC9;font-weight:800">{tm}</span>'
                f'<b>{title}</b>{note}</div>')
        return "".join(out)

    def section(emoji, title, items, chip_bg, chip_color):
        if not items:
            return ""
        return (f'<div style="margin:20px 0 8px">'
                f'<span style="background:{chip_bg};color:{chip_color};border-radius:999px;'
                f'padding:5px 14px;font-weight:800;font-size:14px">{emoji} {title}（{len(items)}）</span></div>'
                + items_html(items))

    total = len(events) + len(today_todos) + len(overdue)
    if total == 0 and not force:
        return None, None  # 今天没安排就不打扰：直接跳过，不发空邮件
    if total == 0:
        body = ('<div style="background:#FFF3F8;border-radius:18px;padding:30px 20px;text-align:center;'
                'font-size:15px;margin-top:16px;color:#3D2B4F">🌤 今天没有日程和待办<br>'
                '<span style="color:#B08BC9;font-size:13.5px">好好享受轻松的一天吧～</span></div>')
    else:
        body = (section("🗓️", "今日日程", events, "#EDE9FE", "#7C5CD6")
                + section("✅", "今日待办", today_todos, "#DCFCE7", "#16A34A")
                + section("⏰", "已逾期未完成", overdue, "#FFE4E6", "#E11D48"))

    hour = datetime.now(CST).hour
    greet = "早上好 ☀️" if hour < 11 else "中午好 🌸" if hour < 14 else "下午好 🌤️" if hour < 18 else "晚上好 🌙"

    date_label = datetime.now(CST).strftime("%m月%d日 %A").replace(
        "Monday", "周一").replace("Tuesday", "周二").replace("Wednesday", "周三").replace(
        "Thursday", "周四").replace("Friday", "周五").replace("Saturday", "周六").replace("Sunday", "周日")
    subject = f"🌷 今日待办日报 · {date_label}" + (f"（共 {total} 项）" if total else "")
    html = f"""
    <div style="font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;max-width:560px;margin:0 auto;color:#3D2B4F">
      <div style="background:#FFF0F5;border:1px solid #FFDCE8;border-radius:20px;padding:24px 28px 20px">
        <div style="font-size:36px;line-height:1">📋</div>
        <div style="font-size:21px;font-weight:900;margin-top:8px;letter-spacing:1px">今日待办日报</div>
        <div style="color:#A98DB5;font-size:13px;margin-top:4px">{date_label} · {greet}，来自你的个人管理平台 🎀</div>
      </div>
      <div style="padding:2px 6px">{body}</div>
      <div style="color:#CDB6D3;font-size:12px;margin-top:18px;text-align:center">☁️ 本邮件由「个人管理平台」自动发出 · 配置见 设置 → 邮件日报</div>
    </div>"""
    return subject, html


@app.get("/api/mail/config")
def api_mail_get():
    m = mail_cfg()
    if m.get("smtp_pass"):
        m["smtp_pass"] = "__SET__"  # 不回传授权码明文
    return m


class MailCfgBody(BaseModel):
    data: Dict[str, Any] = {}


@app.post("/api/mail/config")
def api_mail_set(body: MailCfgBody):
    m = mail_cfg()
    d = body.data or {}
    for k in ("to", "smtp_user", "smtp_host", "smtp_port", "send_time"):
        if k in d:
            m[k] = str(d[k] or "").strip()
    if "enabled" in d:
        m["enabled"] = bool(d["enabled"])
    # 授权码：留空/__SET__ 表示不改；填了新值才覆盖
    p = d.get("smtp_pass")
    if p and p != "__SET__":
        m["smtp_pass"] = str(p).strip()
    save_mail_cfg(m)
    out = dict(m)
    out["smtp_pass"] = "__SET__" if out.get("smtp_pass") else ""
    return {"ok": True, "config": out}


@app.post("/api/mail/test")
def api_mail_test():
    m = mail_cfg()
    if not (m.get("to") and m.get("smtp_user") and m.get("smtp_pass")):
        raise HTTPException(400, "请先填写收件邮箱、发件邮箱和授权码并保存")
    subject, html = build_digest(force=True)  # 测试邮件强制发送，即使今天没安排
    send_mail(m["to"], "【测试】" + subject, html, m)
    m["last_error"] = ""
    save_mail_cfg(m)
    return {"ok": True}


def mail_digest_loop():
    """每分钟看一眼：过了发送时间且今天还没发过 → 发日报；失败 10 分钟后重试"""
    while True:
        try:
            m = mail_cfg()
            if mail_ready(m) and m.get("last_sent") != today_str():
                now_hm = datetime.now(CST).strftime("%H:%M")
                if now_hm >= (m.get("send_time") or "09:00")[:5] and time.time() - MAIL_STATE["last_fail"] > 600:
                    subject, html = build_digest()
                    if not subject:
                        # 今天没安排：跳过不发，但记为已处理，避免整天反复检查
                        m["last_sent"] = today_str()
                        m["last_error"] = ""
                        save_mail_cfg(m)
                    else:
                        send_mail(m["to"], subject, html, m)
                        m["last_sent"] = today_str()
                        m["last_error"] = ""
                        save_mail_cfg(m)
        except Exception as e:
            MAIL_STATE["last_fail"] = time.time()
            try:
                m = mail_cfg()
                m["last_error"] = str(e)[:300]
                save_mail_cfg(m)
            except Exception:
                pass
        time.sleep(60)


threading.Thread(target=mail_digest_loop, daemon=True).start()


# -------------------------- 数据管理 --------------------------
@app.get("/api/stats")
def api_stats():
    out = {}
    for t in SCHEMAS:
        try:
            out[t] = len(read_table(t))
        except Exception:
            out[t] = 0
    files = 0
    for _, _, fs in os.walk(UPLOAD_DIR):
        files += len(fs)
    out["_uploads"] = files
    out["_data_dir"] = DATA_DIR
    return out


@app.get("/api/export")
def api_export():
    import zipfile
    from fastapi.responses import Response
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for t in SCHEMAS:
            p = os.path.join(DATA_DIR, f"{t}.csv")
            if os.path.exists(p):
                z.write(p, f"{t}.csv")
        if os.path.exists(CONFIG_FILE):
            z.write(CONFIG_FILE, "settings.json")
    ts = datetime.now(CST).strftime("%Y%m%d")
    return Response(content=buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="life-data-{ts}.zip"'})


@app.post("/api/table/{table}/import")
async def api_import_csv(table: str, file: UploadFile = File(...)):
    """用 CSV 覆盖导入（表头需与系统一致），用于迁移/恢复数据"""
    raw = (await file.read()).decode("utf-8-sig", "ignore")
    reader = csv.DictReader(io.StringIO(raw))
    cols = SCHEMAS[table]
    rows = []
    for r in reader:
        rows.append({c: r.get(c, "") for c in cols})
    write_table(table, rows)
    return {"ok": True, "count": len(rows)}


# -------------------------- 静态资源 --------------------------
@app.middleware("http")
async def no_stale_static(request, call_next):
    """静态资源缓存策略：
    - index.html 用 no-cache，保证改版后即时生效；
    - 带 ?v= 版本号或有扩展名的资源（js/css/woff2/png…）强缓存一年(immutable)，
      二次访问直接走本地缓存、零网络往返，显著加快加载；改版时靠版本号自动失效。
    """
    resp = await call_next(request)
    p = request.url.path
    if p.startswith("/uploads/") or p.startswith("/api/"):
        return resp
    if p in ("/", "/index.html") or not p.rsplit(".", 1)[-1].lower() in (
        "js", "css", "woff", "woff2", "ttf", "otf", "png", "jpg", "jpeg", "svg", "ico", "gif", "webp"
    ):
        resp.headers["Cache-Control"] = "no-cache"
    else:
        resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return resp


app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
