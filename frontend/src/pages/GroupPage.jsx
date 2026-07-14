import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Mail, Plus, Trash2, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import AppHeader from "../components/AppHeader";
import TripNavigationTabs from "../components/TripNavigationTabs";
import { API_BASE_URL, getAuthHeaders, getCurrentUser } from "../lib/api";
import { useTripRealtime } from "../hooks/useTripRealtime";

const DEFAULT_ROLE_OPTIONS = ["Owner", "Editor", "Viewer", "Traveler"];

function splitCollaborators(value) {
  if (!value || typeof value !== "string") return [];

  return value
    .split(/[|,\n]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function getDisplayName(user) {
  return (
    user?.displayName ||
    user?.firstName ||
    user?.username ||
    user?.email ||
    "Trip Owner"
  );
}

function valueMatches(a, b) {
  return Boolean(a && b && String(a).toLowerCase() === String(b).toLowerCase());
}

function isCurrentUserMember(member, currentUser) {
  return (
    valueMatches(member?.userId, currentUser?.id) ||
    valueMatches(member?.userId, currentUser?.userId) ||
    valueMatches(member?.id, currentUser?.id) ||
    valueMatches(member?.id, currentUser?.userId) ||
    valueMatches(member?.email, currentUser?.email)
  );
}

function isTripOwner(trip, currentUser) {
  if (!currentUser) return false;

  const currentDisplayName = getDisplayName(currentUser);

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

function buildMembersFromTrip(trip, currentUser) {
  const ownerName = trip?.ownerName && trip.ownerName !== "Me" ? trip.ownerName : getDisplayName(currentUser);
  const collaboratorNames = splitCollaborators(trip?.collaborators);
  const uniqueNames = Array.from(
    new Set([ownerName, ...collaboratorNames].filter(Boolean).map((name) => name.trim()))
  );

  return uniqueNames.map((name, index) => ({
    id: `${name.toLowerCase().replace(/\s+/g, "-")}-${index}`,
    name,
    role: index === 0 ? "Owner" : "Traveler",
    isOwner: index === 0,
  }));
}

function mergeMembersWithCollaborators(trip, apiMembers, currentUser) {
  const baseMembers = Array.isArray(apiMembers) ? apiMembers : [];
  const fallbackMembers = buildMembersFromTrip(trip, currentUser);
  const existingNames = new Set(
    baseMembers.map((member) => member.name?.trim().toLowerCase()).filter(Boolean)
  );

  const placeholderMembers = fallbackMembers
    .filter((member) => !existingNames.has(member.name?.trim().toLowerCase()))
    .map((member, index) => ({
      ...member,
      id: `placeholder-${member.id}-${index}`,
      isPlaceholder: !member.isOwner,
    }));

  return [...baseMembers, ...placeholderMembers];
}

function buildCollaboratorsValue(members) {
  return members
    .filter((member) => !member.isOwner)
    .map((member) => member.name.trim())
    .filter(Boolean)
    .join(" | ");
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function getDemoTrip(currentUser) {
  return {
    id: "demo",
    title: "Group Trip",
    ownerName: getDisplayName(currentUser) === "Trip Owner" ? "Janice" : getDisplayName(currentUser),
    collaborators: "Uny | Seliya",
  };
}

export default function GroupPage() {
  const navigate = useNavigate();
  const { tripId } = useParams();
  const currentUser = useMemo(() => getCurrentUser(), []);
  const [trip, setTrip] = useState(() => getDemoTrip(currentUser));
  const [members, setMembers] = useState(() => buildMembersFromTrip(getDemoTrip(currentUser), currentUser));
  const [invitations, setInvitations] = useState([]);
  const [newTraveller, setNewTraveller] = useState("");
  const [inviteRole, setInviteRole] = useState("Editor");
  const [isLoading, setIsLoading] = useState(Boolean(tripId && tripId !== "demo"));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [canManage, setCanManage] = useState(tripId === "demo");
  const canEditDestination = useMemo(() => isTripOwner(trip, currentUser), [trip, currentUser]);

  async function loadTrip() {
  if (!tripId || tripId === "demo") return;

  setIsLoading(true);
  setError("");

  try {
    const response = await fetch(`${API_BASE_URL}/api/trips/${tripId}/group`, {
      headers: getAuthHeaders(),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to load trip group.");
    }

    const loadedTrip = data.trip || getDemoTrip(currentUser);

    setTrip(loadedTrip);
    setMembers(
      mergeMembersWithCollaborators(
        loadedTrip,
        data.members,
        currentUser
      )
    );
    setInvitations(Array.isArray(data.invitations) ? data.invitations : []);
    setCanManage(Boolean(data.canManage));
  } catch (err) {
    setError(err?.message || "We couldn't load this group yet.");
  } finally {
    setIsLoading(false);
  }
}

  useEffect(() => {
    if (!tripId || tripId === "demo") return;

    loadTrip();

  }, [currentUser, tripId]);

  useTripRealtime(tripId, {
  onTripUpdated: () => {
    loadTrip();
  },
  onMemberRoleChanged: ({ actor, memberUserId, role }) => {
    loadTrip();
    const changedSelf =
      valueMatches(memberUserId, currentUser?.id) ||
      valueMatches(memberUserId, currentUser?.userId);
    toast.info(
      changedSelf
        ? `Your trip role is now ${role}`
        : `A traveller role was updated to ${role} by ${actor?.name || "a teammate"}`
    );
  },
  onTripDeleted: () => {
    navigate("/homepage");
  },
});

  

  const handleRoleChange = async (memberId, role) => {
    const currentMembers = members;
    const nextMembers = currentMembers.map((member) =>
      member.id === memberId ? { ...member, role } : member
    );
    setMembers(nextMembers);
    setIsSaving(true);
    setSaveError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/trips/${tripId}/members/${memberId}`, {
        method: "PATCH",
        headers: {
          ...getAuthHeaders({ "Content-Type": "application/json" }),
        },
        body: JSON.stringify({ role }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to update member role.");
      }
    } catch (err) {
      setMembers(currentMembers);
      setSaveError(err?.message || "Failed to update member role.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveMember = async (memberId) => {
    const currentMembers = members;
    const nextMembers = currentMembers.filter((member) => member.id !== memberId);
    setMembers(nextMembers);
    setIsSaving(true);
    setSaveError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/trips/${tripId}/members/${memberId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to remove member.");
      }
    } catch (err) {
      setMembers(currentMembers);
      setSaveError(err?.message || "Failed to remove member.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleInviteTraveller = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const inviteEmail = newTraveller.trim().toLowerCase();
    if (!inviteEmail) return;

    if (!isValidEmail(inviteEmail)) {
      setSaveError("Enter a valid email address.");
      return;
    }

    if (
      members.some((member) => member.email?.trim().toLowerCase() === inviteEmail) ||
      invitations.some((invitation) => invitation.inviteeEmail?.trim().toLowerCase() === inviteEmail)
    ) {
      setSaveError("That traveler is already invited or already in the group.");
      return;
    }

    setIsSaving(true);
    setSaveError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/trips/${tripId}/invitations`, {
        method: "POST",
        headers: {
          ...getAuthHeaders({ "Content-Type": "application/json" }),
        },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to create invitation.");
      }

      if (data.invitation) {
        setInvitations((currentInvitations) => [data.invitation, ...currentInvitations]);
      }
      setNewTraveller("");
      setInviteRole("Editor");
    } catch (err) {
      setSaveError(err?.message || "Failed to create invitation.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelInvitation = async (invitationId) => {
    const currentInvitations = invitations;
    const nextInvitations = currentInvitations.filter((invitation) => invitation.id !== invitationId);
    setInvitations(nextInvitations);
    setIsSaving(true);
    setSaveError("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/trips/${tripId}/invitations/${invitationId}`,
        {
          method: "DELETE",
          headers: getAuthHeaders(),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to cancel invitation.");
      }
    } catch (err) {
      setInvitations(currentInvitations);
      setSaveError(err?.message || "Failed to cancel invitation.");
    } finally {
      setIsSaving(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-white">
        <AppHeader showBackButton backTo="/homepage" />
        <main className="mx-auto max-w-4xl px-6 py-20 text-center">
          <p className="text-red-500">{error}</p>
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

  if (isLoading) {
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
      <AppHeader showBackButton backTo={trip?.id ? `/trips/${trip.id}` : "/homepage"} />

      <main className="mx-auto max-w-7xl px-4 pb-8 pt-6 sm:px-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">
              {trip?.title}
            </h1>
            {trip?.destination && (
              <p className="text-sm text-gray-500">{trip.destination}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(320px,460px)_1fr] lg:items-stretch">
          <div className="relative flex h-[568px] flex-col rounded-3xl bg-pink-50/70 p-6 shadow-sm">
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <h2 className="text-2xl font-extrabold text-pink-500 sm:text-3xl">
                Trip group
              </h2>
              <p className="mt-6 text-5xl font-extrabold text-pink-200 sm:text-6xl flex items-center justify-center gap-3">
                <Users className="h-12 w-12 sm:h-16 sm:w-16" />
                {members.length}
              </p>
              <p className="mt-6 max-w-xs text-sm text-pink-400">
                Manage group sizes, roles, and project accessibility for your travel buddies.
              </p>
            </div>
          </div>

          <div className="flex h-[568px] flex-col overflow-hidden rounded-3xl border border-pink-100 bg-white shadow-sm">
            <div className="bg-pink-50/70 px-5 py-3 text-center">
              <h2 className="text-lg font-extrabold text-pink-500 sm:text-xl">
                Travellers List
              </h2>
              {(isSaving || saveError) && (
                <p className={`mt-1 text-sm ${saveError ? "text-red-500" : "text-pink-400"}`}>
                  {saveError || "Saving group..."}
                </p>
              )}
            </div>

            <div className="grid grid-cols-[1fr_140px_50px] items-center gap-2 border-b border-pink-100 px-5 py-3 text-sm font-bold text-pink-500">
              <span>Name</span>
              <span>Role</span>
              <span aria-hidden="true" />
            </div>

            <ul className="flex-1 divide-y divide-pink-50 overflow-y-auto">
              {members.map((member) => (
                (() => {
                  const isSelf = isCurrentUserMember(member, currentUser);
                  return (
                <li
                  key={member.id}
                  className="grid grid-cols-[1fr_140px_50px] items-center gap-2 px-5 py-3 transition-colors hover:bg-pink-50/30"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-pink-100 text-pink-500">
                      <UserRound className="h-4 w-4" />
                    </span>
                    <span className="truncate text-sm font-semibold text-gray-800">
                      {member.name}
                    </span>
                  </div>

                  <select
                    value={member.role}
                    onChange={(event) => handleRoleChange(member.id, event.target.value)}
                    disabled={member.isOwner || member.isPlaceholder || isSelf || !canManage || isSaving}
                    aria-label={`Role for ${member.name}`}
                    className="w-full rounded-xl border border-pink-100 bg-white/90 px-3 py-1.5 text-sm font-semibold text-gray-700 focus:border-pink-300 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {(member.isPlaceholder
                      ? ["Traveler"]
                      : member.isOwner
                      ? ["Owner"]
                      : ["Editor", "Viewer"]
                    ).map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member.id)}
                      disabled={member.isOwner || member.isPlaceholder || isSelf || !canManage || isSaving}
                      className="rounded-full p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-20"
                      aria-label={`Remove ${member.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
                  );
                })()
              ))}

              {invitations.map((invitation) => (
                <li
                  key={invitation.id}
                  className="grid grid-cols-[1fr_140px_50px] items-center gap-2 px-5 py-3 bg-pink-50/40"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-pink-100 text-pink-500">
                      <Mail className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-800">
                        {invitation.inviteeEmail}
                      </p>
                      <p className="text-xs text-pink-400">Pending invitation</p>
                    </div>
                  </div>
                  <span className="rounded-xl border border-pink-100 bg-white/90 px-3 py-1.5 text-sm font-semibold text-gray-700">
                    {invitation.role}
                  </span>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleCancelInvitation(invitation.id)}
                      disabled={!canManage || isSaving}
                      className="rounded-full p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-20"
                      aria-label={`Cancel invitation for ${invitation.inviteeEmail}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}

              {canManage && (
              <li className="grid grid-cols-[1fr_140px_50px] items-center gap-2 px-5 py-3">
                <form onSubmit={handleInviteTraveller} className="contents">
                  <input
                    type="email"
                    value={newTraveller}
                    onChange={(event) => setNewTraveller(event.target.value)}
                    placeholder="Traveller email"
                    disabled={isSaving}
                    className="rounded-lg border border-pink-100 bg-white px-3 py-1.5 text-sm text-gray-700 placeholder:text-pink-300 focus:border-pink-300 focus:outline-none"
                  />
                  <select
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value)}
                    disabled={isSaving}
                    className="w-full rounded-xl border border-pink-100 bg-white/90 px-3 py-1.5 text-sm font-semibold text-gray-700 focus:border-pink-300 focus:outline-none"
                  >
                    {["Editor", "Viewer"].map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="rounded-full p-1 text-pink-500 transition-colors hover:bg-pink-50"
                      aria-label="Invite traveller"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                </form>
              </li>
              )}
            </ul>
          </div>
        </div>

        <TripNavigationTabs
          tripId={trip?.id}
          activeTab="group"
          canEditDestination={canEditDestination}
        />
      </main>
    </div>
  );
}
