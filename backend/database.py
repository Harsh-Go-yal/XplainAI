import sqlite3
import json
from datetime import datetime
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'reasonlens.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                full_state TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES conversations (id)
            )
        ''')
        conn.commit()

def create_conversation(conv_id: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            'INSERT OR IGNORE INTO conversations (id, created_at) VALUES (?, ?)',
            (conv_id, datetime.utcnow().isoformat())
        )
        conn.commit()

def add_message(conv_id: str, role: str, content: str, full_state: dict = None):
    state_str = json.dumps(full_state) if full_state else None
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO messages (conversation_id, role, content, full_state, created_at) VALUES (?, ?, ?, ?, ?)',
            (conv_id, role, content, state_str, datetime.utcnow().isoformat())
        )
        conn.commit()

def get_history():
    with get_db() as conn:
        cursor = conn.cursor()
        # Get all conversations, with the first user message as preview
        cursor.execute('''
            SELECT c.id, c.created_at, 
                   (SELECT content FROM messages WHERE conversation_id = c.id AND role = 'user' ORDER BY id ASC LIMIT 1) as preview
            FROM conversations c
            ORDER BY c.created_at DESC
        ''')
        rows = cursor.fetchall()
        return [{"id": row["id"], "preview": row["preview"] or "", "created_at": row["created_at"]} for row in rows]

def get_conversation(conv_id: str):
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Check if conversation exists
        cursor.execute('SELECT id, created_at FROM conversations WHERE id = ?', (conv_id,))
        conv_row = cursor.fetchone()
        
        if not conv_row:
            return None
            
        cursor.execute('SELECT role, content, full_state, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC', (conv_id,))
        msg_rows = cursor.fetchall()
        
        messages = []
        for row in msg_rows:
            msg = {
                "role": row["role"],
                "content": row["content"],
                "created_at": row["created_at"]
            }
            if row["full_state"]:
                msg["full_state"] = json.loads(row["full_state"])
            messages.append(msg)
            
        return {
            "id": conv_row["id"],
            "created_at": conv_row["created_at"],
            "messages": messages
        }

def delete_conversation(conv_id: str):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM messages WHERE conversation_id = ?', (conv_id,))
        cursor.execute('DELETE FROM conversations WHERE id = ?', (conv_id,))
        conn.commit()
