import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ChevronDown,
  DollarSign,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import AppHeader from "../components/AppHeader";
import TripNavigationTabs from "../components/TripNavigationTabs";
import { API_BASE_URL, getAuthHeaders } from "../lib/api";
import { useTripRealtime } from "../hooks/useTripRealtime";

const CURRENCIES = [
  { code: "USD", symbol: "$", label: "USD" },
  { code: "CAD", symbol: "$", label: "CAD" },
  { code: "EUR", symbol: "€", label: "EUR" },
  { code: "GBP", symbol: "£", label: "GBP" },
  { code: "JPY", symbol: "¥", label: "JPY" },
];

function loadCurrentUser() {
  try {
    const raw = localStorage.getItem("tripmate_currentUser");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function valueMatches(a, b) {
  return Boolean(a && b && String(a).toLowerCase() === String(b).toLowerCase());
}

function isTripOwner(trip, currentUser) {
  if (!currentUser) return false;

  const currentDisplayName =
    currentUser.displayName ||
    currentUser.firstName ||
    currentUser.username ||
    currentUser.email ||
    "";

  return (
    valueMatches(trip?.createdBy, currentUser.userId) ||
    valueMatches(trip?.ownerId, currentUser.id) ||
    valueMatches(trip?.ownerId, currentUser.userId) ||
    valueMatches(trip?.ownerId, currentUser._id) ||
    valueMatches(trip?.ownerEmail, currentUser.email) ||
    valueMatches(trip?.ownerUsername, currentUser.username) ||
    valueMatches(trip?.ownerName, currentDisplayName) ||
    trip?.ownerName === "Me"
  );
}

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function deriveMembers(trip, currentUser) {
  const set = new Set();
  const out = [];

  const push = (name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (set.has(key)) return;
    set.add(key);
    out.push(trimmed);
  };

  push(trip?.ownerName);

  if (currentUser) {
    push(
      currentUser.displayName ||
        currentUser.firstName ||
        currentUser.username ||
        currentUser.email
    );
  }

  const collabRaw = trip?.collaborators || "";
  collabRaw
    .split(/[|,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach(push);

  if (out.length === 0) push("Me");

  return out;
}

function normalizeMemberName(name) {
  return String(name || "").trim().toLowerCase();
}

function formatMoney(n) {
  const parsed = Number(n);
  const num = Number.isFinite(parsed) ? parsed : 0;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function CurrencyMenu({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onMouseDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const current = CURRENCIES.find((c) => c.code === value) || CURRENCIES[0];

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full bg-pink-500 px-6 py-3 text-base font-bold text-white shadow-[0_4px_0_rgba(0,0,0,0.06)] transition-all hover:bg-pink-600 active:translate-y-0.5"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        Change currency
        <ChevronDown className="h-4 w-4" />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute left-1/2 z-20 mt-2 w-40 -translate-x-1/2 overflow-hidden rounded-2xl border border-pink-100 bg-white p-1 shadow-xl"
        >
          {CURRENCIES.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                onClick={() => {
                  onChange(c.code);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors ${
                  c.code === current.code
                    ? "bg-pink-50 text-pink-600"
                    : "text-gray-700 hover:bg-pink-50 hover:text-pink-500"
                }`}
              >
                <span>{c.label}</span>
                <span className="text-pink-400">{c.symbol}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConfirmDialog({ message, onConfirm, onCancel, busy }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <p className="text-base font-semibold text-gray-800">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-full bg-red-500 px-5 py-2 text-sm font-bold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BudgetPage() {
  const navigate = useNavigate();
  const { id: tripId } = useParams();

  const [trip, setTrip] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [budgetVersion, setBudgetVersion] = useState(1);
  const [expenses, setExpenses] = useState([]);
  const [canEdit, setCanEdit] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [selectedSummaryMember, setSelectedSummaryMember] = useState("");
  const [newName, setNewName] = useState("");
  const [newCost, setNewCost] = useState("");
  const [newShared, setNewShared] = useState(false);
  const [costError, setCostError] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  const currentUser = useMemo(loadCurrentUser, []);
  const canEditDestination = useMemo(() => isTripOwner(trip, currentUser), [trip, currentUser]);
  const lastSyncedRef = useRef(null);

  const loadBudgetData = useCallback(async ({ shouldApply = () => true } = {}) => {
    try {
      const [tripResponse, budgetResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/trips/${tripId}`, {
          headers: getAuthHeaders(),
        }),
        fetch(`${API_BASE_URL}/api/trips/${tripId}/budget`, {
          headers: getAuthHeaders(),
        }),
      ]);
      const tripData = await tripResponse.json();
      const budgetData = await budgetResponse.json();
      if (!tripResponse.ok) {
        throw new Error(tripData.message || "Failed to load trip");
      }
      if (!budgetResponse.ok) {
        throw new Error(budgetData.message || "Failed to load budget");
      }
      if (!shouldApply()) return;
      setTrip(tripData.trip);
      setCanEdit(Boolean(budgetData.canEdit));

      const savedBudget = budgetData.budget || { currency: "USD", expenses: [] };
      const savedCurrency =
        savedBudget && typeof savedBudget.currency === "string"
          ? savedBudget.currency
          : "USD";
      const savedExpenses = Array.isArray(savedBudget?.expenses)
        ? savedBudget.expenses.map((e) => ({
            id: e.id || generateId(),
            name: e.name || "",
            cost: Number.isFinite(Number(e.cost)) ? Number(e.cost) : 0,
            shared: !!e.shared,
            description: e.description || "",
            paidBy: e.paidBy || "",
            splitAmong: Array.isArray(e.splitAmong) ? e.splitAmong : [],
          }))
        : [];

      lastSyncedRef.current = JSON.stringify({
        currency: savedCurrency,
        version: savedBudget.version || 1,
        expenses: savedExpenses,
      });
      setCurrency(savedCurrency);
      setBudgetVersion(savedBudget.version || 1);
      setExpenses(savedExpenses);
      setLoadError("");
    } catch (err) {
      if (!shouldApply()) return;
      console.error("Load trip error:", err);
      setLoadError(err.message || "Could not load trip");
    }
  }, [tripId]);

  useEffect(() => {
    let active = true;
    loadBudgetData({ shouldApply: () => active });
    return () => {
      active = false;
    };
  }, [loadBudgetData]);

  const members = useMemo(
    () => (trip ? deriveMembers(trip, currentUser) : []),
    [trip, currentUser]
  );

  const memberLookup = useMemo(
    () => new Map(members.map((member) => [normalizeMemberName(member), member])),
    [members]
  );

  const currentMemberName = useMemo(() => {
    if (!currentUser) return "";

    const candidates = [
      currentUser.displayName,
      currentUser.firstName,
      currentUser.username,
      currentUser.email,
    ].filter(Boolean);

    for (const candidate of candidates) {
      const member = memberLookup.get(normalizeMemberName(candidate));
      if (member) return member;
    }

    return candidates[0] || "";
  }, [currentUser, memberLookup]);

  useEffect(() => {
    if (!trip || members.length === 0) return;
    setExpenses((curr) => {
      let changed = false;
      const lowercased = new Set(members.map((m) => normalizeMemberName(m)));
      const next = curr.map((expense) => {
        const paidByOk =
          !expense.paidBy || lowercased.has(normalizeMemberName(expense.paidBy));
        const filteredSplit = (expense.splitAmong || []).filter((member) =>
          lowercased.has(normalizeMemberName(member))
        );
        const splitOk = filteredSplit.length === (expense.splitAmong || []).length;
        if (paidByOk && splitOk) return expense;
        changed = true;
        return {
          ...expense,
          paidBy: paidByOk ? expense.paidBy : members[0],
          splitAmong: filteredSplit.length > 0 ? filteredSplit : [members[0]],
        };
      });
      return changed ? next : curr;
    });
  }, [trip, members]);

  useEffect(() => {
    if (!trip || !canEdit) return;
    const snapshot = JSON.stringify({ currency, version: budgetVersion, expenses });
    if (snapshot === lastSyncedRef.current) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/trips/${tripId}/budget`, {
          method: "PUT",
          headers: {
            ...getAuthHeaders({ "Content-Type": "application/json" }),
          },
          body: JSON.stringify({
            expectedVersion: budgetVersion,
            budget: { currency, version: budgetVersion, expenses },
          }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || "Failed to save budget");
        }

        const nextCurrency =
          typeof data.budget?.currency === "string" ? data.budget.currency : currency;
        const nextExpenses = Array.isArray(data.budget?.expenses)
          ? data.budget.expenses.map((e) => ({
              id: e.id || generateId(),
              name: e.name || "",
              cost: Number.isFinite(Number(e.cost)) ? Number(e.cost) : 0,
              shared: !!e.shared,
              description: e.description || "",
              paidBy: e.paidBy || "",
              splitAmong: Array.isArray(e.splitAmong) ? e.splitAmong : [],
            }))
          : expenses;

        lastSyncedRef.current = JSON.stringify({
          currency: nextCurrency,
          version: data.budget?.version || budgetVersion,
          expenses: nextExpenses,
        });
        setCurrency(nextCurrency);
        setBudgetVersion(data.budget?.version || budgetVersion);
        setExpenses(nextExpenses);
      } catch (err) {
        if (err.name === "AbortError") return;
        if (err.message?.includes("changed while you were editing")) {
          try {
            const latest = await fetch(`${API_BASE_URL}/api/trips/${tripId}/budget`, {
              headers: getAuthHeaders(),
            });
            const latestData = await latest.json();
            if (latest.ok && latestData.budget) {
              const latestCurrency = latestData.budget.currency || "USD";
              const latestVersion = latestData.budget.version || 1;
              const latestExpenses = (latestData.budget.expenses || []).map((e) => ({
                  id: e.id || generateId(),
                  name: e.name || "",
                  cost: Number.isFinite(Number(e.cost)) ? Number(e.cost) : 0,
                  shared: !!e.shared,
                  description: e.description || "",
                  paidBy: e.paidBy || "",
                  splitAmong: Array.isArray(e.splitAmong) ? e.splitAmong : [],
                }));
              lastSyncedRef.current = JSON.stringify({
                currency: latestCurrency,
                version: latestVersion,
                expenses: latestExpenses,
              });
              setCurrency(latestCurrency);
              setBudgetVersion(latestVersion);
              setExpenses(latestExpenses);
            }
          } catch (reloadError) {
            console.error("Reload budget after conflict error:", reloadError);
          }
        }
        console.error("Save budget error:", err);
        toast.error(err.message || "Could not save budget");
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [trip, tripId, canEdit, currency, budgetVersion, expenses]);

  useTripRealtime(tripId, {
    onMemberRoleChanged: ({ actor, memberUserId, role }) => {
      loadBudgetData();
      const changedSelf =
        memberUserId &&
        (memberUserId === currentUser?.id || memberUserId === currentUser?.userId);
      toast.info(
        changedSelf
          ? `Your trip role is now ${role}`
          : `A traveller role was updated to ${role} by ${actor?.name || "a teammate"}`
      );
    },
    onBudgetUpdate: ({ budget, actor }) => {
      if (!budget) return;
      if (actor?.userId && actor.userId === currentUser?.id) return;
      const nextCurrency =
        typeof budget.currency === "string" ? budget.currency : "USD";
      const nextExpenses = Array.isArray(budget.expenses)
        ? budget.expenses.map((e) => ({
            id: e.id || generateId(),
            name: e.name || "",
            cost: Number.isFinite(Number(e.cost)) ? Number(e.cost) : 0,
            shared: !!e.shared,
            description: e.description || "",
            paidBy: e.paidBy || "",
            splitAmong: Array.isArray(e.splitAmong) ? e.splitAmong : [],
          }))
        : [];

      lastSyncedRef.current = JSON.stringify({
        currency: nextCurrency,
        version: budget.version || 1,
        expenses: nextExpenses,
      });
      setCurrency(nextCurrency);
      setBudgetVersion(budget.version || 1);
      setExpenses(nextExpenses);
      toast.info(`Budget updated by ${actor?.name || "a teammate"}`);
    },
  });

  useEffect(() => {
    if (members.length === 0) {
      setSelectedSummaryMember("");
      setShowSummary(false);
      return;
    }

    setSelectedSummaryMember((current) =>
      current && members.includes(current) ? current : members[0]
    );
  }, [members]);

  const symbol = useMemo(
    () => (CURRENCIES.find((c) => c.code === currency) || CURRENCIES[0]).symbol,
    [currency]
  );

  const total = useMemo(
    () => expenses.reduce((sum, expense) => sum + (Number(expense.cost) || 0), 0),
    [expenses]
  );

  const selected = useMemo(
    () => expenses.find((expense) => expense.id === selectedId) || null,
    [expenses, selectedId]
  );

  const perPersonForSelected = useMemo(() => {
    if (!selected) return 0;
    if (!selected.shared) return Number(selected.cost) || 0;
    const splitCount = (selected.splitAmong || []).length;
    if (splitCount <= 0) return 0;
    return (Number(selected.cost) || 0) / splitCount;
  }, [selected]);

  const paymentSummary = useMemo(() => {
    const summary = new Map(
      members.map((member) => [
        member,
        {
          member,
          totalPaid: 0,
          itemCount: 0,
          items: [],
        },
      ])
    );

    expenses.forEach((expense) => {
      const payer = expense.paidBy || members[0];
      const cost = Number(expense.cost) || 0;
      if (!payer || cost <= 0) return;

      if (!summary.has(payer)) {
        summary.set(payer, {
          member: payer,
          totalPaid: 0,
          itemCount: 0,
          items: [],
        });
      }

      const bucket = summary.get(payer);
      bucket.totalPaid += cost;
      bucket.itemCount += 1;
      bucket.items.push({
        id: expense.id,
        name: expense.name || "Untitled expense",
        cost,
        shared: !!expense.shared,
        splitAmong: Array.isArray(expense.splitAmong) ? expense.splitAmong : [],
      });
    });

    return Array.from(summary.values()).sort((a, b) => b.totalPaid - a.totalPaid);
  }, [expenses, members]);

  const settlementMembers = useMemo(() => {
    const summary = new Map(
      members.map((member) => [
        member,
        {
          member,
          totalPaid: 0,
          itemCount: 0,
          fairShare: 0,
          netBalance: 0,
          paidItems: [],
        },
      ])
    );

    expenses.forEach((expense) => {
      const payer = expense.paidBy || members[0];
      const cost = Number(expense.cost) || 0;
      if (!payer || cost <= 0) return;

      if (!summary.has(payer)) {
        summary.set(payer, {
          member: payer,
          totalPaid: 0,
          itemCount: 0,
          fairShare: 0,
          netBalance: 0,
          paidItems: [],
        });
      }

      const payerBucket = summary.get(payer);
      payerBucket.totalPaid += cost;
      payerBucket.itemCount += 1;
      payerBucket.paidItems.push(expense.id);

      const rawParticipants = expense.shared
        ? Array.isArray(expense.splitAmong)
          ? expense.splitAmong
          : []
        : [payer];

      const participantKeys = Array.from(
        new Set(
          rawParticipants
            .map((member) => normalizeMemberName(member))
            .filter((member) => memberLookup.has(member))
        )
      );

      const participants = participantKeys
        .map((member) => memberLookup.get(member))
        .filter(Boolean);

      const normalizedParticipants = participants.length > 0
        ? participants
        : expense.shared && members.length > 0
          ? members
          : [payer];

      const share = cost / normalizedParticipants.length;

      normalizedParticipants.forEach((member) => {
        if (!summary.has(member)) {
          summary.set(member, {
            member,
            totalPaid: 0,
            itemCount: 0,
            fairShare: 0,
            netBalance: 0,
            paidItems: [],
          });
        }
        summary.get(member).fairShare += share;
      });
    });

    return Array.from(summary.values())
      .map((entry) => ({
        ...entry,
        netBalance: entry.totalPaid - entry.fairShare,
      }))
      .sort((a, b) => {
        const balanceDiff = Math.abs(b.netBalance) - Math.abs(a.netBalance);
        if (Math.abs(balanceDiff) > 0.009) return balanceDiff;
        return b.totalPaid - a.totalPaid;
      });
  }, [expenses, memberLookup, members]);

  const selectedSummary = useMemo(
    () =>
      settlementMembers.find((entry) => entry.member === selectedSummaryMember) ||
      settlementMembers[0] ||
      null,
    [selectedSummaryMember, settlementMembers]
  );

  const selectedPaidItems = useMemo(() => {
    if (!selectedSummary) return [];
    return expenses.filter((expense) => selectedSummary.paidItems.includes(expense.id));
  }, [expenses, selectedSummary]);

  const pairwiseTransfersForSelected = useMemo(() => {
    if (!selectedSummary) return [];

    const selectedMember = selectedSummary.member;
    const pairwise = new Map();

    expenses.forEach((expense) => {
      const payer = expense.paidBy || members[0];
      const cost = Number(expense.cost) || 0;
      if (!payer || cost <= 0) return;

      const rawParticipants = expense.shared
        ? Array.isArray(expense.splitAmong)
          ? expense.splitAmong
          : []
        : [payer];

      const participantKeys = Array.from(
        new Set(
          rawParticipants
            .map((member) => normalizeMemberName(member))
            .filter((member) => memberLookup.has(member))
        )
      );

      const participants = participantKeys
        .map((member) => memberLookup.get(member))
        .filter(Boolean);

      const normalizedParticipants = participants.length > 0
        ? participants
        : expense.shared && members.length > 0
          ? members
          : [payer];

      const share = cost / normalizedParticipants.length;

      normalizedParticipants.forEach((participant) => {
        if (participant === payer) return;

        if (payer === selectedMember) {
          pairwise.set(participant, (pairwise.get(participant) || 0) + share);
        } else if (participant === selectedMember) {
          pairwise.set(payer, (pairwise.get(payer) || 0) - share);
        }
      });
    });

    return Array.from(pairwise.entries())
      .map(([counterparty, amount]) => ({ counterparty, amount }))
      .filter((entry) => Math.abs(entry.amount) > 0.009)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  }, [expenses, memberLookup, members, selectedSummary]);

  const handleAddExpense = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!canEdit) return;
    const name = newName.trim();
    if (!name) {
      setCostError("Please give the expense a name.");
      return;
    }

    const cost = Number(newCost);
    if (!Number.isFinite(cost) || cost <= 0) {
      setCostError("Cost must be a positive number.");
      return;
    }
    setCostError("");

    const fallbackPaidBy = currentMemberName || members[0] || "Me";

    const expense = {
      id: generateId(),
      name,
      cost,
      shared: newShared,
      description: "",
      paidBy: fallbackPaidBy,
      splitAmong: newShared ? [...members] : [fallbackPaidBy],
    };

    setExpenses((curr) => [...curr, expense]);
    setNewName("");
    setNewCost("");
    setNewShared(false);
  };

  const handleRequestDelete = (id) => {
    if (!canEdit) return;
    setPendingDeleteId(id);
  };

  const handleConfirmDelete = () => {
    if (!canEdit) return;
    const id = pendingDeleteId;
    if (!id) return;
    setExpenses((curr) => curr.filter((expense) => expense.id !== id));
    if (selectedId === id) setSelectedId(null);
    setPendingDeleteId(null);
  };

  const handleToggleShared = (id) => {
    if (!canEdit) return;
    setExpenses((curr) =>
      curr.map((expense) => {
        if (expense.id !== id) return expense;
        const nextShared = !expense.shared;
        return {
          ...expense,
          shared: nextShared,
          splitAmong: nextShared
            ? members.length > 0
              ? [...members]
              : expense.splitAmong
            : [expense.paidBy].filter(Boolean),
        };
      })
    );
  };

  const handleEditCost = (id, raw) => {
    if (!canEdit) return;
    setExpenses((curr) =>
      curr.map((expense) => (expense.id === id ? { ...expense, cost: raw } : expense))
    );
  };

  const updateSelected = (patch) => {
    if (!canEdit || !selected) return;
    setExpenses((curr) =>
      curr.map((expense) =>
        expense.id === selected.id ? { ...expense, ...patch } : expense
      )
    );
  };

  const toggleSplitMember = (member) => {
    if (!canEdit || !selected) return;
    const current = selected.splitAmong || [];
    const present = current.includes(member);
    const nextSplit = present
      ? current.filter((m) => m !== member)
      : [...current, member];
    updateSelected({ splitAmong: nextSplit });
  };

  if (loadError) {
    return (
      <div className="min-h-screen bg-white">
        <AppHeader showBackButton backTo="/homepage" />
        <main className="mx-auto max-w-4xl px-6 py-20 text-center">
          <p className="text-red-500">{loadError}</p>
          <button
            type="button"
            onClick={() => navigate("/homepage")}
            className="mt-4 rounded-full bg-pink-500 px-6 py-2 text-sm font-bold text-white hover:bg-pink-600"
          >
            Back to Home
          </button>
        </main>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="min-h-screen bg-white">
        <AppHeader showBackButton backTo="/homepage" />
        <main className="mx-auto max-w-4xl px-6 py-20 text-center">
          <p className="text-pink-500">Loading trip...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <AppHeader showBackButton backTo={`/trips/${trip.id}`} />

      <main className="mx-auto max-w-7xl px-4 pb-8 pt-6 sm:px-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">
              {trip.title}
            </h1>
            {trip.destination && (
              <p className="text-sm text-gray-500">{trip.destination}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(320px,460px)_1fr] lg:items-stretch">
          <div className="relative flex h-[568px] flex-col rounded-3xl bg-pink-50/70 p-6 shadow-sm">
            {!selected ? (
              <>
                <div className="flex flex-1 flex-col items-center justify-center text-center">
                  <h2 className="text-2xl font-extrabold text-pink-500 sm:text-3xl">
                    Trip budget
                  </h2>
                  <p className="mt-6 text-5xl font-extrabold text-pink-200 sm:text-6xl">
                    {currency} {symbol} {formatMoney(total)}
                  </p>
                  {expenses.length === 0 && (
                    <p className="mt-6 max-w-xs text-sm text-pink-400">
                      No expenses yet. Add your first expense on the right to
                      start tracking the trip&apos;s budget.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 pb-2 pt-6">
                  {canEdit && <CurrencyMenu value={currency} onChange={setCurrency} />}
                  {expenses.length > 0 && settlementMembers.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowSummary((current) => !current)}
                      className="inline-flex items-center rounded-full bg-white px-6 py-3 text-base font-bold text-pink-500 shadow-[0_4px_0_rgba(0,0,0,0.04)] transition-all hover:bg-pink-50"
                    >
                      {showSummary ? "Hide payment summary" : "View payment summary"}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <h2 className="text-xl font-extrabold text-pink-500 sm:text-2xl">
                    Expense Details
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="rounded-full p-1 text-gray-400 transition-colors hover:bg-white hover:text-gray-600"
                    aria-label="Close expense details"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <input
                  type="text"
                  value={selected.name}
                  onChange={(e) => updateSelected({ name: e.target.value })}
                  readOnly={!canEdit}
                  className="mb-3 w-full rounded-xl border border-transparent bg-transparent px-1 py-1 text-xl font-bold text-gray-800 focus:border-pink-200 focus:bg-white focus:outline-none"
                />

                <textarea
                  value={selected.description}
                  onChange={(e) => updateSelected({ description: e.target.value })}
                  placeholder="Add Description"
                  rows={3}
                  readOnly={!canEdit}
                  className="mb-5 w-full resize-none rounded-xl border border-pink-100 bg-white/80 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-pink-300 focus:outline-none"
                />

                <div className="mb-5">
                  <label className="mb-2 flex items-center justify-between text-sm font-bold text-gray-800">
                    Paid by
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-pink-500 shadow-sm">
                      {selected.paidBy || "—"}
                    </span>
                  </label>
                  <select
                    value={selected.paidBy || ""}
                    onChange={(e) => updateSelected({ paidBy: e.target.value })}
                    disabled={!canEdit}
                    className="w-full rounded-xl border border-pink-100 bg-white/90 px-3 py-2 text-sm font-semibold text-gray-700 focus:border-pink-300 focus:outline-none"
                  >
                    <option value="" disabled>
                      Select a person
                    </option>
                    {members.map((member) => (
                      <option key={member} value={member}>
                        {member}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-4 flex-1">
                  <p className="mb-2 text-sm font-bold text-gray-800">Split</p>
                  <ul className="space-y-2">
                    {members.map((member) => {
                      const checked = (selected.splitAmong || []).includes(member);
                      return (
                        <li
                          key={member}
                          className="flex items-center gap-3 rounded-xl bg-white/80 px-3 py-2"
                        >
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-pink-100 text-pink-500">
                            <Users className="h-4 w-4" />
                          </span>
                          <span className="flex-1 truncate text-sm font-semibold text-gray-800">
                            {member}
                          </span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSplitMember(member)}
                            disabled={!canEdit}
                            className="h-4 w-4 cursor-pointer accent-pink-500"
                            aria-label={`Include ${member} in split`}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="mt-auto border-t border-pink-100 pt-3 text-right text-sm font-bold text-gray-800">
                  {currency} {symbol} {formatMoney(perPersonForSelected)}/person
                </div>
              </div>
            )}
          </div>

          <div className="flex h-[568px] flex-col overflow-hidden rounded-3xl border border-pink-100 bg-white shadow-sm">
            <div className="bg-pink-50/70 px-5 py-3 text-center">
              <h2 className="text-lg font-extrabold text-pink-500 sm:text-xl">
                Expenses List
              </h2>
            </div>

            <div className="grid grid-cols-[1fr_120px_90px_40px] items-center gap-2 border-b border-pink-100 px-5 py-3 text-sm font-bold text-pink-500">
              <span>Expense Type</span>
              <span className="text-right">Cost ({currency})</span>
              <span className="text-center">Shared?</span>
              <span aria-hidden="true" />
            </div>

            <ul className="flex-1 divide-y divide-pink-50 overflow-y-auto">
              {expenses.map((expense) => {
                const isSelected = expense.id === selectedId;
                return (
                  <li
                    key={expense.id}
                    className={`grid grid-cols-[1fr_120px_90px_40px] items-center gap-2 px-5 py-3 transition-colors ${
                      isSelected ? "bg-pink-50/60" : "hover:bg-pink-50/30"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(expense.id)}
                      className={`truncate text-left text-sm font-semibold ${
                        isSelected
                          ? "text-pink-600 underline decoration-pink-300 underline-offset-4"
                          : "text-gray-800 hover:text-pink-500"
                      }`}
                    >
                      {expense.name}
                    </button>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={expense.cost}
                      onChange={(ev) => handleEditCost(expense.id, ev.target.value)}
                      onBlur={(ev) =>
                        handleEditCost(
                          expense.id,
                          ev.target.value === "" ? 0 : Number(ev.target.value)
                        )
                      }
                      readOnly={!canEdit}
                      className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-right text-sm font-semibold text-gray-700 hover:border-pink-100 focus:border-pink-300 focus:bg-white focus:outline-none"
                      aria-label={`Edit cost for ${expense.name}`}
                    />
                    <span className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        checked={!!expense.shared}
                        onChange={() => handleToggleShared(expense.id)}
                        disabled={!canEdit}
                        className="h-4 w-4 cursor-pointer accent-pink-500"
                        aria-label={`Mark ${expense.name} as shared`}
                      />
                    </span>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => handleRequestDelete(expense.id)}
                        className="rounded-full p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                        aria-label={`Delete ${expense.name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : (
                      <span aria-hidden="true" />
                    )}
                  </li>
                );
              })}

              {expenses.length === 0 && (
                <li className="px-5 py-6 text-center text-sm text-gray-400">
                  {canEdit ? "No expenses yet. Add one below." : "No expenses yet."}
                </li>
              )}

              {canEdit && (
              <li className="grid grid-cols-[1fr_120px_90px_40px] items-center gap-2 px-5 py-3">
                <form onSubmit={handleAddExpense} className="contents">
                  <input
                    type="text"
                    value={newName}
                    onChange={(ev) => {
                      setNewName(ev.target.value);
                      if (costError) setCostError("");
                    }}
                    placeholder="Add new expense"
                    className="rounded-lg border border-pink-100 bg-white px-3 py-1.5 text-sm text-gray-700 placeholder:text-pink-300 focus:border-pink-300 focus:outline-none"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newCost}
                    onChange={(ev) => {
                      setNewCost(ev.target.value);
                      if (costError) setCostError("");
                    }}
                    placeholder="00.00"
                    className="rounded-lg border border-pink-100 bg-white px-2 py-1.5 text-right text-sm text-gray-700 placeholder:text-pink-300 focus:border-pink-300 focus:outline-none"
                  />
                  <span className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={newShared}
                      onChange={(ev) => setNewShared(ev.target.checked)}
                      className="h-4 w-4 cursor-pointer accent-pink-500"
                      aria-label="Shared expense"
                    />
                  </span>
                  <button
                    type="submit"
                    className="rounded-full p-1 text-pink-500 transition-colors hover:bg-pink-50"
                    aria-label="Add expense"
                  >
                    <X className="h-4 w-4 rotate-45" />
                  </button>
                </form>
              </li>
              )}

              {canEdit && costError && (
                <li className="px-5 py-2 text-right text-xs font-semibold text-red-500">
                  {costError}
                </li>
              )}
            </ul>
          </div>
        </div>

        {showSummary && selectedSummary && !selected && (
          <section className="mt-6 overflow-hidden rounded-3xl border border-pink-100 bg-pink-50/60 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-pink-100 bg-white/60 px-6 py-5">
              <div>
                <h2 className="text-2xl font-extrabold text-pink-500">
                  Payment summary
                </h2>
                <p className="mt-1 text-sm text-pink-400">
                  See who paid, what each person owes, and how each split works.
                </p>
              </div>
              <select
                value={selectedSummaryMember}
                onChange={(e) => setSelectedSummaryMember(e.target.value)}
                className="rounded-full border border-pink-100 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm focus:border-pink-300 focus:outline-none"
              >
                {settlementMembers.map((entry) => (
                  <option key={entry.member} value={entry.member}>
                    {entry.member}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 px-6 py-5 md:grid-cols-3">
              <div className="rounded-2xl bg-white px-5 py-4 shadow-sm">
                <p className="text-sm font-bold text-gray-800">
                  {selectedSummary.member}
                </p>
                <p className="mt-2 text-3xl font-extrabold text-pink-300">
                  {currency} {symbol} {formatMoney(selectedSummary.totalPaid)}
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  {selectedSummary.itemCount} expense
                  {selectedSummary.itemCount === 1 ? "" : "s"} paid
                </p>
              </div>

              <div className="rounded-2xl bg-white px-5 py-4 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-pink-400">
                  Fair share
                </p>
                <p className="mt-3 text-2xl font-extrabold text-gray-800">
                  {currency} {symbol} {formatMoney(selectedSummary.fairShare)}
                </p>
              </div>

              <div className="rounded-2xl bg-white px-5 py-4 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-pink-400">
                  Net balance
                </p>
                <p
                  className={`mt-3 text-2xl font-extrabold ${
                    selectedSummary.netBalance >= 0
                      ? "text-emerald-500"
                      : "text-amber-500"
                  }`}
                >
                  {selectedSummary.netBalance >= 0 ? "+" : "-"}
                  {currency} {symbol} {formatMoney(Math.abs(selectedSummary.netBalance))}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {selectedSummary.netBalance > 0.009
                    ? "Paid more than their share"
                    : selectedSummary.netBalance < -0.009
                      ? "Paid less than their share"
                      : "Already balanced"}
                </p>
              </div>
            </div>

            <div className="grid gap-4 px-6 pb-6 lg:grid-cols-2">
              <div className="overflow-hidden rounded-2xl border border-pink-100 bg-white">
                <div className="border-b border-pink-100 px-5 py-3 text-sm font-bold text-pink-500">
                  Paid items
                </div>
                <ul className="max-h-64 divide-y divide-pink-50 overflow-y-auto px-5">
                  {selectedPaidItems.length === 0 ? (
                    <li className="py-6 text-sm text-gray-400">
                      No expenses paid by this traveler yet.
                    </li>
                  ) : (
                    selectedPaidItems.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-3 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-800">
                            {item.name}
                          </p>
                          <p className="text-xs text-pink-400">
                            {item.shared
                              ? `Shared with ${(item.splitAmong || []).length} traveler${
                                  (item.splitAmong || []).length === 1 ? "" : "s"
                                }`
                              : "Personal expense"}
                          </p>
                        </div>
                        <span className="flex-shrink-0 text-sm font-bold text-gray-700">
                          {symbol} {formatMoney(item.cost)}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              <div className="overflow-hidden rounded-2xl border border-pink-100 bg-white">
                <div className="border-b border-pink-100 px-5 py-3 text-sm font-bold text-pink-500">
                  Settlement summary
                </div>
                <ul className="max-h-64 divide-y divide-pink-50 overflow-y-auto px-5">
                  {pairwiseTransfersForSelected.length === 0 ? (
                    <li className="py-6 text-sm text-gray-400">
                      No outstanding split with {selectedSummary.member}.
                    </li>
                  ) : (
                    pairwiseTransfersForSelected.map((transfer) => (
                      <li
                        key={`${selectedSummary.member}-${transfer.counterparty}`}
                        className="flex items-center justify-between gap-3 py-3"
                      >
                        <p className="text-sm font-semibold text-gray-800">
                          {transfer.amount > 0
                            ? `${transfer.counterparty} owes ${selectedSummary.member}`
                            : `${selectedSummary.member} owes ${transfer.counterparty}`}
                        </p>
                        <span className="text-sm font-bold text-gray-700">
                          {symbol} {formatMoney(Math.abs(transfer.amount))}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </section>
        )}

        <TripNavigationTabs
          tripId={trip?.id}
          activeTab="budget"
          canEditDestination={canEditDestination}
        />
      </main>

      {canEdit && pendingDeleteId && (
        <ConfirmDialog
          message="Delete this expense? This cannot be undone."
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}
