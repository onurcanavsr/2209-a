"""Faz 7: notlar, yer imleri, öğrenme kartları (doğrulama, limit, yalıtım, yapay zekâ ile kart üretimi)."""
import json
import uuid
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.routers import study as study_router
from app.routers import summaries as sm
from app.store import STUDY_TABLES, get_store
from tests.test_documents import tok
from tests.test_qa import FakeLLM, FakeStore3, new_doc

client = TestClient(app)


class FakeStoreStudy(FakeStore3):
    """Gerçek store.py ile aynı imzalara sahip bellek içi çalışma araçları deposu."""

    def __init__(self):
        super().__init__()
        self.study: dict[str, list[dict]] = {t: [] for t in STUDY_TABLES}

    @staticmethod
    def _public(table, row):
        cols = STUDY_TABLES[table][0].split(",")
        return {k: row[k] for k in cols if k in row}

    async def study_list(self, table, doc_id, user_id):
        rows = [r for r in self.study[table] if r["document_id"] == doc_id and r["user_id"] == user_id]
        if table == "notes":
            rows = list(reversed(rows))
        elif table == "bookmarks":
            rows = sorted(rows, key=lambda r: r["word_index"])
        return [self._public(table, r) for r in rows]

    async def study_count(self, table, doc_id, user_id):
        return len([r for r in self.study[table] if r["document_id"] == doc_id and r["user_id"] == user_id])

    async def study_add(self, table, rows):
        out = []
        for row in rows:
            now = datetime.now().isoformat()
            r = {"id": str(uuid.uuid4()), "created_at": now, "updated_at": now, **row}
            self.study[table].append(r)
            out.append(self._public(table, r))
        return out

    async def study_update(self, table, item_id, user_id, values):
        for r in self.study[table]:
            if r["id"] == item_id and r["user_id"] == user_id:
                r.update(values)
                return self._public(table, r)
        return None

    async def study_delete(self, table, item_id, user_id):
        before = len(self.study[table])
        self.study[table] = [r for r in self.study[table] if not (r["id"] == item_id and r["user_id"] == user_id)]
        return len(self.study[table]) < before

    async def study_delete_all(self, table, doc_id, user_id):
        self.study[table] = [r for r in self.study[table] if not (r["document_id"] == doc_id and r["user_id"] == user_id)]


@pytest.fixture
def senv(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "x" * 40)
    get_settings.cache_clear()
    sm._inflight.clear(); study_router._inflight.clear()
    st = FakeStoreStudy()
    box = {"calls": [], "fail": False, "replies": ["{}"], "pieces": ["x"]}
    app.dependency_overrides[get_store] = lambda: st
    app.dependency_overrides[sm.llm_factory] = lambda: (lambda tier="main": FakeLLM(box, tier))
    yield st, box
    app.dependency_overrides.clear()
    get_settings.cache_clear()


def cards_json(n=8):
    return json.dumps({"kartlar": [{"on": f"Kavram {i} nedir?", "arka": f"Kavram {i} belgeye göre budur."}
                                   for i in range(1, n + 1)]}, ensure_ascii=False)


def test_login_required(senv):
    d = new_doc()
    nil = "00000000-0000-0000-0000-000000000000"
    for method, path in [("get", f"/api/documents/{d}/notes"), ("post", f"/api/documents/{d}/notes"),
                         ("get", f"/api/documents/{d}/bookmarks"), ("post", f"/api/documents/{d}/bookmarks"),
                         ("get", f"/api/documents/{d}/flashcards"), ("post", f"/api/documents/{d}/flashcards"),
                         ("post", f"/api/documents/{d}/flashcards/generate"), ("delete", f"/api/documents/{d}/flashcards"),
                         ("put", f"/api/notes/{nil}"), ("delete", f"/api/notes/{nil}"),
                         ("delete", f"/api/bookmarks/{nil}"), ("delete", f"/api/flashcards/{nil}")]:
        assert getattr(client, method)(path).status_code == 401, (method, path)


def test_notes_crud(senv):
    d = new_doc()
    r = client.post(f"/api/documents/{d}/notes", json={"content": "  Sınavda çıkabilir.  "}, headers=tok())
    assert r.status_code == 201 and r.json()["content"] == "Sınavda çıkabilir."
    nid = r.json()["id"]
    client.post(f"/api/documents/{d}/notes", json={"content": "İkinci not"}, headers=tok())
    assert [n["content"] for n in client.get(f"/api/documents/{d}/notes", headers=tok()).json()] == ["İkinci not", "Sınavda çıkabilir."]
    r = client.put(f"/api/notes/{nid}", json={"content": "Güncel not"}, headers=tok())
    assert r.status_code == 200 and r.json()["content"] == "Güncel not"
    assert client.delete(f"/api/notes/{nid}", headers=tok()).status_code == 204
    assert client.delete(f"/api/notes/{nid}", headers=tok()).status_code == 404
    assert len(client.get(f"/api/documents/{d}/notes", headers=tok()).json()) == 1


@pytest.mark.parametrize("content", ["", "   ", "x" * 5001])
def test_note_validation(senv, content):
    r = client.post(f"/api/documents/{new_doc()}/notes", json={"content": content}, headers=tok())
    assert r.status_code == 422


def test_note_limit(senv, monkeypatch):
    monkeypatch.setattr(study_router, "MAX_NOTES", 2)
    d = new_doc()
    for i in range(2):
        assert client.post(f"/api/documents/{d}/notes", json={"content": f"n{i}"}, headers=tok()).status_code == 201
    assert client.post(f"/api/documents/{d}/notes", json={"content": "fazla"}, headers=tok()).status_code == 409


def test_bookmarks_sorted_and_validated(senv):
    d = new_doc()
    mk = lambda **b: client.post(f"/api/documents/{d}/bookmarks", json=b, headers=tok())
    assert mk(label="Sonra", word_index=40, snippet="a  b\n c").json()["snippet"] == "a b c"
    assert mk(label="Önce", word_index=3).status_code == 201
    assert [b["label"] for b in client.get(f"/api/documents/{d}/bookmarks", headers=tok()).json()] == ["Önce", "Sonra"]
    assert mk(label="", word_index=1).status_code == 422
    assert mk(label="   ", word_index=1).status_code == 422
    assert mk(label="x", word_index=-1).status_code == 422
    bid = client.get(f"/api/documents/{d}/bookmarks", headers=tok()).json()[0]["id"]
    assert client.delete(f"/api/bookmarks/{bid}", headers=tok()).status_code == 204
    assert client.delete(f"/api/bookmarks/{bid}", headers=tok()).status_code == 404


def test_manual_cards(senv):
    d = new_doc()
    r = client.post(f"/api/documents/{d}/flashcards", json={"front": "Mitokondri?", "back": "Enerji üretir."}, headers=tok())
    assert r.status_code == 201 and r.json()["source"] == "manual"
    assert client.post(f"/api/documents/{d}/flashcards", json={"front": " ", "back": "x"}, headers=tok()).status_code == 422
    cid = r.json()["id"]
    assert client.delete(f"/api/flashcards/{cid}", headers=tok()).status_code == 204
    assert client.get(f"/api/documents/{d}/flashcards", headers=tok()).json() == []


def test_generate_cards(senv):
    st, box = senv
    box["replies"] = [cards_json(8)]
    d = new_doc()
    r = client.post(f"/api/documents/{d}/flashcards/generate", json={"count": 8}, headers=tok())
    assert r.status_code == 201 and len(r.json()) == 8 and all(c["source"] == "ai" for c in r.json())
    assert "Tam olarak 8 kart" in box["calls"][0][3]
    assert sum(1 for _, a in st.usage if a == "cards") == 1
    assert len(client.get(f"/api/documents/{d}/flashcards", headers=tok()).json()) == 8
    assert client.delete(f"/api/documents/{d}/flashcards", headers=tok()).status_code == 204
    assert client.get(f"/api/documents/{d}/flashcards", headers=tok()).json() == []


@pytest.mark.parametrize("count", [2, 16])
def test_generate_count_validation(senv, count):
    assert client.post(f"/api/documents/{new_doc()}/flashcards/generate", json={"count": count}, headers=tok()).status_code == 422


def test_generate_filters_duplicates_and_retries_once(senv):
    st, box = senv
    dup = json.dumps({"kartlar": [{"on": "Aynı soru?", "arka": "a"}, {"on": "AYNI SORU?", "arka": "b"},
                                  {"on": "", "arka": "boş ön"}, {"on": "Diğer?", "arka": "c"}]}, ensure_ascii=False)
    box["replies"] = ["json değil", dup]
    r = client.post(f"/api/documents/{new_doc()}/flashcards/generate", json={"count": 4}, headers=tok())
    assert r.status_code == 201 and [c["front"] for c in r.json()] == ["Aynı soru?", "Diğer?"]
    assert len(box["calls"]) == 2 and sum(1 for _, a in st.usage if a == "cards") == 1


def test_generate_failure_is_clean_502(senv):
    st, box = senv
    box["fail"] = True
    r = client.post(f"/api/documents/{new_doc()}/flashcards/generate", json={"count": 5}, headers=tok())
    assert r.status_code == 502 and "sk-ant" not in r.text and "bakiye" not in r.text
    assert st.study["flashcards"] == [] and study_router._inflight == {}


def test_generate_daily_limit(senv, monkeypatch):
    st, box = senv
    monkeypatch.setenv("DAILY_CARD_LIMIT", "1")
    get_settings.cache_clear()
    box["replies"] = [cards_json(5)]
    d = new_doc()
    assert client.post(f"/api/documents/{d}/flashcards/generate", json={"count": 5}, headers=tok()).status_code == 201
    r = client.post(f"/api/documents/{d}/flashcards/generate", json={"count": 5}, headers=tok())
    assert r.status_code == 429 and len(box["calls"]) == 1


def test_card_limit_blocks_generation_before_llm(senv, monkeypatch):
    st, box = senv
    monkeypatch.setattr(study_router, "MAX_CARDS", 3)
    r = client.post(f"/api/documents/{new_doc()}/flashcards/generate", json={"count": 5}, headers=tok())
    assert r.status_code == 409 and box["calls"] == []


def test_users_are_isolated(senv):
    d = new_doc("alice")
    note = client.post(f"/api/documents/{d}/notes", json={"content": "gizli"}, headers=tok("alice")).json()["id"]
    bm = client.post(f"/api/documents/{d}/bookmarks", json={"label": "yer", "word_index": 1}, headers=tok("alice")).json()["id"]
    card = client.post(f"/api/documents/{d}/flashcards", json={"front": "ö", "back": "a"}, headers=tok("alice")).json()["id"]
    for kind in ("notes", "bookmarks", "flashcards"):
        assert client.get(f"/api/documents/{d}/{kind}", headers=tok("bob")).status_code == 404
    assert client.post(f"/api/documents/{d}/notes", json={"content": "x"}, headers=tok("bob")).status_code == 404
    assert client.post(f"/api/documents/{d}/flashcards/generate", json={"count": 5}, headers=tok("bob")).status_code == 404
    assert client.delete(f"/api/documents/{d}/flashcards", headers=tok("bob")).status_code == 404
    assert client.put(f"/api/notes/{note}", json={"content": "ele geçirdim"}, headers=tok("bob")).status_code == 404
    assert client.delete(f"/api/notes/{note}", headers=tok("bob")).status_code == 404
    assert client.delete(f"/api/bookmarks/{bm}", headers=tok("bob")).status_code == 404
    assert client.delete(f"/api/flashcards/{card}", headers=tok("bob")).status_code == 404
    assert len(client.get(f"/api/documents/{d}/notes", headers=tok("alice")).json()) == 1


def test_malformed_ids_are_404(senv):
    assert client.delete("/api/notes/not-a-uuid", headers=tok()).status_code == 404
    assert client.put("/api/notes/not-a-uuid", json={"content": "x"}, headers=tok()).status_code == 404
    assert client.delete("/api/flashcards/not-a-uuid", headers=tok()).status_code == 404
