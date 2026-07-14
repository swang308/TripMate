import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  Lightbulb,
  Loader2,
  Plus,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { API_BASE_URL, getAuthHeaders } from "../lib/api";

const RECOMMENDATION_TAGS = [
  "Food",
  "Sightseeing",
  "Nature",
  "Attractions",
  "Nightlife",
];

const DEFAULT_PROMPTS = {
  Food: "Find local food spots for this trip",
  Sightseeing: "Suggest places to visit",
  Nature: "Recommend nature spots nearby",
  Attractions: "Find must-see attractions",
  Nightlife: "Suggest nightlife ideas",
};

const QUICK_PROMPTS_BY_TAG = {
  Food: [
    "Find cheap local food spots",
    "Suggest dinner places near my itinerary",
    "Find vegetarian-friendly restaurants",
  ],
  Sightseeing: [
    "Suggest must-see landmarks",
    "Find photo spots near my itinerary",
    "Plan a relaxed sightseeing route",
  ],
  Nature: [
    "Find parks or hikes nearby",
    "Suggest outdoor activities",
    "Find scenic places for a quiet afternoon",
  ],
  Attractions: [
    "Find top-rated attractions",
    "Suggest family-friendly attractions",
    "Find attractions that fit my schedule",
  ],
  Nightlife: [
    "Suggest casual nightlife spots",
    "Find live music or evening activities",
    "Recommend safe late-night areas",
  ],
};

const GENERAL_QUICK_PROMPTS = [
  "Find budget-friendly ideas",
  "Suggest rainy day options",
  "Find places near my itinerary",
];

function createWelcomeMessage() {
  return {
    id: "welcome",
    role: "assistant",
    text:
      "Hi there! I'm your TripMate AI Assistant. Choose a tag or quick prompt below, and I'll suggest ideas that fit your trip.",
    recommendations: [],
    createdAt: new Date().toISOString(),
  };
}

function formatTimestamp(ts) {
  if (!ts) return "";
  const raw = String(ts);
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(raw);
  const normalized = hasZone ? raw : raw.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function tagLabel(tag) {
  return `#${tag}`;
}

function AssistantAvatar() {
  return (
    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gradient-to-br from-pink-500 via-fuchsia-500 to-amber-400 text-white shadow-sm">
      <Bot className="h-5 w-5" />
    </span>
  );
}

function UserAvatar() {
  return (
    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-pink-100 text-pink-500 shadow-sm">
      <UserRound className="h-5 w-5" />
    </span>
  );
}

export default function AIAssistPopup({
  tripId,
  trip,
  onClose,
  canAddToItinerary = false,
  onAddToItinerary,
  days = [],
}) {
  const [selectedTags, setSelectedTags] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [rated, setRated] = useState({});
  const [addingKey, setAddingKey] = useState(null);
  const [addedKeys, setAddedKeys] = useState([]);
  const [selectedDay, setSelectedDay] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  
  const [showSavedSidebar, setShowSavedSidebar] = useState(false);
  const [savedItems, setSavedItems] = useState([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [deletingKey, setDeletingKey] = useState(null);

  useEffect(() => {
    if (days.length === 0) return;
    setSelectedDay((current) =>
      days.some((day) => day.date === current) ? current : days[0].date
    );
  }, [days]);

  const [messages, setMessages] = useState(() => [createWelcomeMessage()]);
  const listRef = useRef(null);

  useEffect(() => {
    if (!tripId) return;

    let active = true;
    const controller = new AbortController();

    async function loadChatHistory() {
      setIsLoadingHistory(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/trips/${tripId}/ai-chat`, {
          method: "GET",
          headers: { ...getAuthHeaders() },
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || "Failed to load AI chat history");
        }

        if (!active) return;
        if (Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages(data.messages);
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          toast.error(error.message || "Could not load AI chat history.");
        }
      } finally {
        if (active) setIsLoadingHistory(false);
      }
    }

    loadChatHistory();

    return () => {
      active = false;
      controller.abort();
    };
  }, [tripId]);

  useEffect(() => {
    window.setTimeout(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }, 50);
  }, [messages, isSending]);

  const placeholder = useMemo(() => {
    const firstTag = selectedTags[0];
    const destination = trip?.destination ? ` in ${trip.destination}` : "";
    return `${DEFAULT_PROMPTS[firstTag] || "Ask for trip recommendations"}${destination}`;
  }, [selectedTags, trip]);

  const quickPrompts = useMemo(() => {
    const firstTag = selectedTags[0];
    return firstTag ? QUICK_PROMPTS_BY_TAG[firstTag] || [] : GENERAL_QUICK_PROMPTS;
  }, [selectedTags]);

  const toggleTag = (tag) => {
    setSelectedTags((current) => (current.includes(tag) ? [] : [tag]));
  };

  const applyQuickPrompt = (quickPrompt) => {
    setPrompt(quickPrompt);
  };

  const clearChatHistory = async () => {
    if (isClearingHistory || isSending) return;
    setIsClearingHistory(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/trips/${tripId}/ai-chat`, {
        method: "DELETE",
        headers: { ...getAuthHeaders() },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to clear AI chat history");
      }

      setMessages([createWelcomeMessage()]);
      setRated({});
      setAddedKeys([]);
      toast.success("AI chat cleared.");
    } catch (error) {
      toast.error(error.message || "Could not clear AI chat.");
    } finally {
      setIsClearingHistory(false);
    }
  };

  const fetchSavedRecommendations = async () => {
    setIsLoadingSaved(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/trips/${tripId}/saved-recommendations`, {
        method: "GET",
        headers: { ...getAuthHeaders() },
      });
      const data = await response.json();
      if (response.ok) {
        setSavedItems(data.saved || []);
      }
    } catch {
      toast.error("Could not load your saved recommendations.");
    } finally {
      setIsLoadingSaved(false);
    }
  };

  const toggleSidebar = () => {
    if (!showSavedSidebar) {
      fetchSavedRecommendations();
    }
    setShowSavedSidebar(!showSavedSidebar);
  };

  const submitPrompt = async (event) => {
    if (event?.preventDefault) event.preventDefault();
    const trimmedPrompt = prompt.trim() || placeholder;
    if (!trimmedPrompt || isSending) return;

    const activeTags = selectedTags;
    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: trimmedPrompt,
      tags: activeTags,
      recommendations: [],
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, userMessage]);
    setPrompt("");
    setIsSending(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/trips/${tripId}/recommendations`, {
        method: "POST",
        headers: {
          ...getAuthHeaders({ "Content-Type": "application/json" }),
        },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          tags: activeTags,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to generate recommendations");
      }

      setMessages((current) => [
        ...current,
        {
          id: data.requestId || `assistant-${Date.now()}`,
          role: "assistant",
          text: data.reply || "Here are some ideas for your trip.",
          recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      toast.error(error.message || "AI Assistant could not respond.");
      setMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          text: "I couldn't generate recommendations right now. Please try again in a moment.",
          recommendations: [],
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const rateRecommendation = async (recommendationId, ratingValue) => {
    if (!recommendationId) return;
    
    setRated((current) => ({ ...current, [recommendationId]: ratingValue }));
    
    try {
      await fetch(`${API_BASE_URL}/api/recommendations/${recommendationId}/rating`, {
        method: "POST",
        headers: {
          ...getAuthHeaders({ "Content-Type": "application/json" }),
        },
        body: JSON.stringify({ ratingValue }),
      });

      if (ratingValue === 1) {
        fetchSavedRecommendations();
      } else {
        setSavedItems((current) => current.filter(item => item.id !== recommendationId));
      }
    } catch {
      toast.error("Could not save recommendation feedback.");
    }
  };

  const deleteSavedPick = async (recommendationId) => {
  if (!recommendationId) return;
  setDeletingKey(recommendationId);

  try {
    const response = await fetch(`${API_BASE_URL}/api/recommendations/${recommendationId}/rating`, {
      method: "DELETE", 
      headers: {
        ...getAuthHeaders(),
      },
    });

    if (!response.ok) {
      throw new Error("Failed to remove saved pick");
    }

    setSavedItems((current) => current.filter((item) => item.id !== recommendationId));
    setRated((current) => ({ ...current, [recommendationId]: 0 }));
    toast.success("Removed from saved picks.");
  } catch {
    toast.error("Could not remove from saved picks.");
  } finally {
    setDeletingKey(null);
  }
};

  const handleAddToItinerary = async (item) => {
    if (!onAddToItinerary) return;
    // Key by recommendation + target day so the same place can still be added
    // to a different day after being added to one.
    const key = `${item.id || item.name}::${selectedDay}`;
    setAddingKey(key);
    try {
      const ok = await onAddToItinerary(item, selectedDay);
      if (ok) setAddedKeys((current) => [...current, key]);
    } finally {
      setAddingKey(null);
    }
  };

  return (
    <div className="fixed inset-x-4 bottom-6 top-6 z-[5200] mx-auto flex max-w-6xl flex-col overflow-hidden rounded-3xl border border-pink-100 bg-pink-50/95 shadow-2xl backdrop-blur sm:bottom-8 sm:top-8">
      <div className="flex items-center justify-between border-b border-pink-100 bg-white/80 px-5 py-3">
        <div className="inline-flex items-center gap-3 rounded-full bg-pink-100/80 py-2 pl-2 pr-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 via-fuchsia-500 to-amber-400 text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <h2 className="text-base font-extrabold text-gray-700">AI Assistant</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={clearChatHistory}
            disabled={isClearingHistory || isSending}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-gray-500 shadow-sm transition-colors hover:bg-pink-50 hover:text-pink-500 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Clear AI chat history"
          >
            {isClearingHistory ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Clear
          </button>
          <button
            type="button"
            onClick={toggleSidebar}
            className="rounded-full bg-pink-100 px-3 py-1.5 text-xs font-bold text-pink-600 transition-colors hover:bg-pink-200"
          >
            {showSavedSidebar ? "Hide Saved" : "View Saved Picks ⭐"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white p-1.5 text-gray-500 shadow-sm transition-colors hover:bg-pink-50 hover:text-pink-500"
            aria-label="Close AI Assistant"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-8"
      >
        {isLoadingHistory && (
          <div className="flex items-center justify-center text-xs font-bold text-pink-500">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 shadow-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading recent chat...
            </span>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {message.role === "assistant" && <AssistantAvatar />}
            <div
              className={`max-w-[82%] rounded-sm border px-4 py-3 text-sm leading-6 shadow-sm ${
                message.role === "user"
                  ? "border-pink-200 bg-white text-gray-800"
                  : "border-pink-200 bg-pink-100/80 text-gray-800"
              }`}
            >
              {message.tags?.length > 0 && (
                <p className="mb-1 font-bold text-pink-500">
                  {message.tags.map(tagLabel).join(" ")}
                </p>
              )}
              <p className="whitespace-pre-line">{message.text}</p>
              {message.createdAt && (
                <p
                  className={`mt-2 text-[11px] font-semibold ${
                    message.role === "user" ? "text-gray-400" : "text-pink-400"
                  }`}
                  title={message.createdAt}
                >
                  {formatTimestamp(message.createdAt)}
                </p>
              )}

              {message.recommendations?.length > 0 && (
                <div className="mt-3 space-y-3">
                  {message.recommendations.map((item) => (
                    <article key={item.id || item.name} className="border-t border-pink-200 pt-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-extrabold text-gray-900">{item.name}</p>
                          {item.location && (
                            <p className="text-xs font-semibold text-pink-500">{item.location}</p>
                          )}
                        </div>
                        {item.categoryTag && (
                          <span className="rounded-full bg-pink-500 px-3 py-1 text-xs font-bold text-white">
                            {tagLabel(item.categoryTag)}
                          </span>
                        )}
                      </div>
                      <p className="mt-2">{item.description}</p>
                      {item.rationale && (
                        <p className="mt-1 text-xs text-gray-500">{item.rationale}</p>
                      )}
                      {(item.id || (canAddToItinerary && onAddToItinerary)) && (
                        <div className="mt-3 flex items-center justify-between gap-2">
                          {canAddToItinerary && onAddToItinerary ? (
                            (() => {
                              const key = `${item.id || item.name}::${selectedDay}`;
                              const isAdded = addedKeys.includes(key);
                              const isAdding = addingKey === key;
                              return (
                                <button
                                  type="button"
                                  onClick={() => handleAddToItinerary(item)}
                                  disabled={isAdded || isAdding}
                                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                                    isAdded
                                      ? "bg-green-100 text-green-700"
                                      : "bg-pink-500 text-white hover:bg-pink-600 disabled:opacity-60"
                                  }`}
                                  aria-label={`Add ${item.name} to itinerary`}
                                >
                                  {isAdded ? (
                                    <>
                                      <Check className="h-3.5 w-3.5" />
                                      Added
                                    </>
                                  ) : isAdding ? (
                                    <>
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      Adding...
                                    </>
                                  ) : (
                                    <>
                                      <Plus className="h-3.5 w-3.5" />
                                      Add to itinerary
                                    </>
                                  )}
                                </button>
                              );
                            })()
                          ) : (
                            <span />
                          )}

                          {item.id && (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => rateRecommendation(item.id, 1)}
                                className={`rounded-full p-1 transition-colors ${
                                  rated[item.id] === 1
                                    ? "bg-pink-500 text-white"
                                    : "text-pink-400 hover:bg-white hover:text-pink-500"
                                }`}
                                aria-label={`Like ${item.name}`}
                              >
                                <ThumbsUp className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => rateRecommendation(item.id, -1)}
                                className={`rounded-full p-1 transition-colors ${
                                  rated[item.id] === -1
                                    ? "bg-pink-500 text-white"
                                    : "text-pink-400 hover:bg-white hover:text-pink-500"
                                }`}
                                aria-label={`Dislike ${item.name}`}
                              >
                                <ThumbsDown className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
            {message.role === "user" && <UserAvatar />}
          </div>
        ))}

        {isSending && (
          <div className="flex items-center gap-3 text-sm font-semibold text-pink-500">
            <AssistantAvatar />
            <span className="inline-flex items-center gap-2 rounded-sm border border-pink-200 bg-pink-100/80 px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin" />
              Thinking about your trip...
            </span>
          </div>
        )}
      </div>

      <form onSubmit={submitPrompt} className="space-y-3 border-t border-pink-100 px-5 py-4 sm:px-8">
        <div className="flex flex-wrap gap-2">
          {RECOMMENDATION_TAGS.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`rounded-full px-4 py-1.5 text-sm font-extrabold transition-colors ${
                  active
                    ? "bg-pink-500 text-white"
                    : "bg-white text-pink-500 hover:bg-pink-100"
                }`}
              >
                {tagLabel(tag)}
              </button>
            );
          })}
        </div>

        {quickPrompts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-500">
              <Lightbulb className="h-3.5 w-3.5 text-pink-400" />
              Quick prompts
            </span>
            {quickPrompts.map((quickPrompt) => (
              <button
                key={quickPrompt}
                type="button"
                onClick={() => applyQuickPrompt(quickPrompt)}
                disabled={isSending}
                className="rounded-full border border-pink-100 bg-white px-3 py-1.5 text-xs font-bold text-pink-500 shadow-sm transition-colors hover:border-pink-200 hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {quickPrompt}
              </button>
            ))}
          </div>
        )}

        {canAddToItinerary && onAddToItinerary && days.length > 0 && (
          <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
            <span>Add picks to:</span>
            <select
              value={selectedDay}
              onChange={(event) => setSelectedDay(event.target.value)}
              className="rounded-full border border-pink-200 bg-white px-3 py-1.5 text-xs font-bold text-pink-600 outline-none focus:border-pink-400"
            >
              {days.map((day) => (
                <option key={day.date} value={day.date}>
                  {day.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex min-h-11 items-center gap-3 rounded-full bg-white px-4 shadow-sm">
          {selectedTags.length > 0 && (
            <span className="flex-shrink-0 text-sm font-extrabold text-pink-500">
              {selectedTags.slice(0, 2).map(tagLabel).join(" ")}
            </span>
          )}
          <input
            type="text"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={placeholder}
            maxLength={600}
            className="min-w-0 flex-1 bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
            disabled={isSending}
          />
          <button
            type="submit"
            disabled={isSending}
            className="rounded-full p-1.5 text-gray-600 transition-colors hover:bg-pink-50 hover:text-pink-500 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send recommendation request"
          >
            {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </label>
      </form>

      {showSavedSidebar && (
        <div className="absolute right-0 top-0 z-50 h-full w-80 rounded-r-3xl border-l border-pink-100 bg-white p-5 shadow-xl overflow-y-auto">
          <div className="flex items-center justify-between border-b pb-3 mb-4">
            <h3 className="font-extrabold text-gray-800 text-sm">Your Saved Picks</h3>
            <button type="button" onClick={() => setShowSavedSidebar(false)} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          {isLoadingSaved ? (
            <div className="flex items-center justify-center py-10 text-pink-500">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : savedItems.length === 0 ? (
            <p className="text-xs text-center text-gray-400 py-10">No items liked yet. Click 👍 on recommendations to save them here!</p>
          ) : (
            <div className="space-y-4">
              {savedItems.map((item) => (
                <div key={item.id} className="relative rounded-xl border border-pink-50 bg-pink-50/40 p-3 text-xs pr-8">
                  <button
                    type="button"
                    onClick={() => deleteSavedPick(item.id)}
                    disabled={deletingKey === item.id}
                    className="absolute right-2 top-2 text-gray-400 hover:text-pink-500 disabled:opacity-50"
                    aria-label={`Remove ${item.name} from saved picks`}
                  >
                    {deletingKey === item.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <div className="flex justify-between items-start gap-1">
                    <h4 className="font-bold text-gray-900 max-w-[70%]">{item.name}</h4>
                    <span className="text-[10px] font-bold bg-pink-500 text-white px-2 py-0.5 rounded-full flex-shrink-0">
                      {tagLabel(item.categoryTag)}
                    </span>
                  </div>
                  {item.location && <p className="text-pink-500 font-semibold mt-0.5">{item.location}</p>}
                  <p className="text-gray-600 mt-1.5 leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}