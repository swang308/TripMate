import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, MoreVertical, Send, X } from "lucide-react";
import { API_BASE_URL, getAuthHeaders } from "../lib/api";
import { getSocket } from "../lib/socket";

function formatTimestamp(ts) {
  if (!ts) return "";
  const d = (() => {
    if (ts instanceof Date) return ts;
    const raw = String(ts);

    // If the timestamp already includes timezone info (e.g. "...Z" or "+/-hh:mm"),
    // parse normally. If not, treat it as local time.
    const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(raw);
    if (hasZone) return new Date(raw);

    const normalized = raw.includes(" ")
      ? raw.replace(" ", "T")
      : raw;

    return new Date(normalized);
  })();
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function initialsFor(name) {
  if (!name) return "U";
  const parts = String(name).trim().split(/\s+/);
  return (
    parts
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "U"
  );
}

export default function TripCommentsDrawer({
  open,
  trip,
  currentUser,
  onClose,
}) {
  const tripId = trip?.id;
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [menuOpenFor, setMenuOpenFor] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const userId = useMemo(() => {
    return currentUser?.id || currentUser?._id || "";
  }, [currentUser]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !tripId) return;

    let active = true;
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/trips/${tripId}/comments`,
          {
            headers: getAuthHeaders(),
            signal: controller.signal,
          }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to load comments");

        if (!active) return;
        setComments(Array.isArray(data.comments) ? data.comments : []);
        setMenuOpenFor(null);
        setEditingId(null);
        setEditText("");

        queueMicrotask(() => {
          if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
          }
          inputRef.current?.focus?.();
        });
      } catch (e) {
        if (!active || e?.name === "AbortError") return;
        setError(e?.message || "Failed to load comments.");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [open, tripId]);

  useEffect(() => {
  if (!open || !tripId) return undefined;

  const socket = getSocket();

  const joinRoom = () => {
    socket.emit("trip:join", tripId);
  };

  if (socket.connected) joinRoom();
  socket.on("connect", joinRoom);

  const handleCommentCreated = ({ comment }) => {
    if (!comment) return;

    setComments((current) => {
      if (current.some((c) => c.id === comment.id)) return current;
      if (String(comment.userId) === String(userId)) return current;
      return [...current, comment];
    });

    queueMicrotask(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    });
  };

  const handleCommentUpdated = ({ comment }) => {
    if (!comment) return;

    setComments((current) =>
      current.map((c) => (c.id === comment.id ? comment : c))
    );
  };

  const handleCommentDeleted = ({ commentId }) => {
    setComments((current) =>
      current.filter((c) => c.id !== commentId)
    );
  };

  socket.on("comment:created", handleCommentCreated);
  socket.on("comment:updated", handleCommentUpdated);
  socket.on("comment:deleted", handleCommentDeleted);

  return () => {
    socket.emit("trip:leave", tripId);
    socket.off("connect", joinRoom);
    socket.off("comment:created", handleCommentCreated);
    socket.off("comment:updated", handleCommentUpdated);
    socket.off("comment:deleted", handleCommentDeleted);
  };
}, [open, tripId, userId]);

  useEffect(() => {
    if (!open) return undefined;

    const onMouseDown = (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest?.("[data-comment-menu]")) return;
      setMenuOpenFor(null);
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || !tripId) return;
    if (!userId) {
      setError("Please log in before commenting.");
      return;
    }

    const tempId = `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const optimistic = {
      id: tempId,
      tripId,
      itemId: null,
      userId,
      displayName:
        currentUser?.displayName ||
        currentUser?.firstName ||
        currentUser?.username ||
        currentUser?.email ||
        "Me",
      avatarUrl: currentUser?.avatarUrl || "",
      commentText: trimmed,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      _optimistic: true,
    };

    setSending(true);
    setError("");
    setText("");
    setComments((cur) => [...cur, optimistic]);

    queueMicrotask(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    });

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/trips/${tripId}/comments`,
        {
          method: "POST",
          headers: getAuthHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            commentText: trimmed,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to add comment");

      const saved = data.comment;
      setComments((cur) =>
        cur.map((c) => (c.id === tempId ? saved : c))
      );
    } catch (e) {
      setComments((cur) =>
        cur.map((c) =>
          c.id === tempId ? { ...c, _failed: true } : c
        )
      );
      setError(e?.message || "Failed to add comment.");
    } finally {
      setSending(false);
      inputRef.current?.focus?.();
    }
  };

  const startEdit = (comment) => {
    setMenuOpenFor(null);
    setEditingId(comment.id);
    setEditText(comment.commentText || "");
    setError("");
    queueMicrotask(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const saveEdit = async (commentId) => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    if (!userId) {
      setError("Please log in before editing.");
      return;
    }

    try {
      setError("");
      const res = await fetch(`${API_BASE_URL}/api/comments/${commentId}`, {
        method: "PUT",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ commentText: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to edit comment");

      setComments((cur) => cur.map((c) => (c.id === commentId ? data.comment : c)));
      setEditingId(null);
      setEditText("");
    } catch (e) {
      setError(e?.message || "Failed to edit comment.");
    }
  };

  const deleteComment = async (commentId) => {
    setMenuOpenFor(null);
    if (!userId) {
      setError("Please log in before deleting.");
      return;
    }
    const ok = window.confirm("Delete this comment? This cannot be undone.");
    if (!ok) return;

    const previous = comments;
    setComments((cur) => cur.filter((c) => c.id !== commentId));

    try {
      setError("");
      const res = await fetch(`${API_BASE_URL}/api/comments/${commentId}`, {
        method: "DELETE",
        headers: getAuthHeaders({ "Content-Type": "application/json" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to delete comment");
    } catch (e) {
      setComments(previous);
      setError(e?.message || "Failed to delete comment.");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[7000]" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={() => (sending ? null : onClose?.())}
        aria-hidden="true"
      />

      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-pink-100 bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-pink-100 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-pink-500" />
              <h2 className="truncate text-base font-extrabold text-gray-900">
                Comments
              </h2>
            </div>
            <p className="mt-0.5 truncate text-xs font-semibold text-gray-500">
              {trip?.title || "Trip"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            disabled={sending}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
            aria-label="Close comments"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="space-y-3">
              <div className="h-12 rounded-2xl bg-pink-50" />
              <div className="h-16 rounded-2xl bg-pink-50" />
              <div className="h-10 rounded-2xl bg-pink-50" />
            </div>
          ) : comments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-pink-200 bg-pink-50/40 px-4 py-6 text-center">
              <p className="text-sm font-bold text-pink-500">
                No comments yet.
              </p>
              <p className="mt-1 text-xs font-semibold text-pink-400">
                Start the conversation for this trip.
              </p>
            </div>
          ) : (
            <ul className="space-y-4">
              {comments.map((c) => {
                const name = c.displayName || "User";
                const mine =
                  userId && c.userId && String(c.userId) === String(userId);
                const isEditing = editingId === c.id;
                return (
                  <li key={c.id} className="flex gap-3">
                    <div className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center overflow-hidden rounded-full bg-pink-100 text-xs font-bold text-pink-600">
                      {c.avatarUrl ? (
                        <img
                          src={c.avatarUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        initialsFor(name)
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-extrabold text-gray-900">
                            {mine ? "You" : name}
                          </p>
                          <p
                            className="mt-0.5 text-[11px] font-semibold text-gray-400"
                            title={c.createdAt}
                          >
                            {formatTimestamp(c.createdAt)}
                            {c.updatedAt ? " • Edited" : ""}
                            {c._optimistic ? " • Sending…" : ""}
                            {c._failed ? " • Failed" : ""}
                          </p>
                        </div>

                        {mine && !c._optimistic && (
                          <div className="relative" data-comment-menu>
                            <button
                              type="button"
                              onClick={() =>
                                setMenuOpenFor((cur) =>
                                  cur === c.id ? null : c.id
                                )
                              }
                              className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                              aria-label="Comment actions"
                              aria-expanded={menuOpenFor === c.id}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>

                            {menuOpenFor === c.id && (
                              <div className="absolute right-0 top-7 z-20 w-36 overflow-hidden rounded-xl border border-gray-100 bg-white p-1 shadow-xl">
                                <button
                                  type="button"
                                  onClick={() => startEdit(c)}
                                  className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-gray-700 hover:bg-pink-50 hover:text-pink-600"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteComment(c.id)}
                                  className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="mt-2 rounded-2xl bg-gray-50 px-4 py-3 ring-1 ring-gray-100">
                        {isEditing ? (
                          <>
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              rows={3}
                              className="w-full resize-none rounded-xl border border-pink-100 bg-white px-3 py-2 text-sm font-semibold text-gray-800 outline-none placeholder:text-gray-400 focus:border-pink-400"
                            />
                            <div className="mt-3 flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="rounded-full px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => saveEdit(c.id)}
                                disabled={!editText.trim()}
                                className="rounded-full bg-pink-500 px-4 py-2 text-xs font-bold text-white hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Save
                              </button>
                            </div>
                          </>
                        ) : (
                          <p className="whitespace-pre-wrap break-words text-sm font-semibold text-gray-800">
                            {c.commentText}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="border-t border-pink-100 px-5 py-4">
          {error && (
            <p className="mb-3 rounded-2xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-600">
              {error}
            </p>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={2}
              placeholder="Write a comment…"
              className="min-h-[44px] flex-1 resize-none rounded-2xl border border-pink-100 bg-white px-4 py-3 text-sm font-semibold text-gray-800 outline-none placeholder:text-gray-400 focus:border-pink-400 disabled:opacity-60"
              disabled={sending}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !text.trim()}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-pink-500 text-white shadow-[0_4px_0_rgba(0,0,0,0.06)] transition-all hover:bg-pink-600 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Send comment"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>

          <p className="mt-2 text-[11px] font-semibold text-gray-400">
            Press Enter to send • Shift+Enter for a new line
          </p>
        </footer>
      </aside>
    </div>
  );
}
