import json, sys, time, urllib.request, urllib.error

ROOT = "3f903114-9f0e-80ed-a8e4-cc78de942621"
DS = {"areas": "6ccd04a4-1652-4069-9bf5-76b460398d69",
      "obj": "ccc745cf-28fe-40be-850d-fa8cbc2bd958",
      "tareas": "f57016ab-3737-4ab7-a68f-3590e6db8a6c",
      "hab": "02b6956c-993d-4e4e-a547-720e077cfbc4"}

def _key():
    for line in open("/opt/data/.env", encoding="utf-8"):
        if line.startswith("NOTION_API_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("NOTION_API_KEY no encontrada")

KEY = _key()

class ApiError(Exception):
    pass

def api(method, path, body=None, ver="2025-09-03", fatal=True):
    req = urllib.request.Request(
        "https://api.notion.com/v1/" + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": "Bearer " + KEY, "Notion-Version": ver,
                 "Content-Type": "application/json"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 409, 502, 503) and attempt < 4:
                time.sleep(2 * (attempt + 1)); continue
            msg = f"Error {e.code} en {method} {path}: {e.read().decode()[:600]}"
            if fatal:
                sys.exit(msg)
            raise ApiError(msg)

def txt(s, **ann):
    t = {"type": "text", "text": {"content": s}}
    if ann:
        t["annotations"] = ann
    return [t]

def props(ds):
    return api("GET", f"data_sources/{DS[ds]}")["properties"]

def query_all(ds):
    out, cur = [], None
    while True:
        body = {"page_size": 100}
        if cur:
            body["start_cursor"] = cur
        r = api("POST", f"data_sources/{DS[ds]}/query", body)
        out += r["results"]
        if not r.get("has_more"):
            return out
        cur = r["next_cursor"]
