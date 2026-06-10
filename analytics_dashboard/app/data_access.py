import sqlite3
import os

DB_PATH_ENV = "ESHOP_DB_PATH"
_DEFAULT_DB = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "server", "data", "eshop.sqlite")

_cached_conn = None


def get_db_path():
    return os.environ.get(DB_PATH_ENV, _DEFAULT_DB)


def get_connection():
    global _cached_conn
    if _cached_conn is not None:
        return _cached_conn
    db_path = get_db_path()
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    _cached_conn = conn
    return conn


def query(sql, params=None):
    conn = get_connection()
    cur = conn.execute(sql, params or [])
    rows = cur.fetchall()
    return [dict(row) for row in rows]


def query_one(sql, params=None):
    conn = get_connection()
    cur = conn.execute(sql, params or [])
    row = cur.fetchone()
    return dict(row) if row else None
