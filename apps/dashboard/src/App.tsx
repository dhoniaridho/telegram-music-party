import { Button, Card, Checkbox, Form, Input, Label, Modal, Tabs, Toast } from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IoAddOutline, IoDesktopOutline, IoListOutline, IoMusicalNotesOutline, IoPause, IoPlay, IoPlaySkipBack, IoPlaySkipForward, IoRefreshOutline, IoSearchOutline, IoSettingsOutline, IoTrashOutline, IoVolumeHighOutline, IoVolumeLowOutline, IoVolumeMediumOutline, IoVolumeMuteOutline } from "react-icons/io5";
import type { IconType } from "react-icons";

type Device = { name: string; fingerprint: string; createdAt: string };
type Track = {
  id?: string;
  url?: string;
  videoId?: string;
  title: string;
  addedBy?: string | null;
  createdAt?: string | null;
  artist?: string;
  duration?: number;
  artwork?: string | null;
};
type Room = {
  id: string;
  name: string;
  chatId: string;
  createdAt: string;
  connectedClients: number;
  playbackState?: "playing" | "paused" | "standby" | null;
  devices: Device[];
  votes: number;
  queue: Track[];
  queueLimit: number;
  feature?: {
    nextCommand: boolean;
    previousCommand: boolean;
    volumeCommand: boolean;
    muteCommand: boolean;
    unmuteCommand: boolean;
    nextOnlyAdmin: boolean;
    previousOnlyAdmin: boolean;
    minimumVotes: number;
    maxQueueSize: number;
  } | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message ?? "Something went wrong");
  return result as T;
}

const formatDuration = (seconds?: number) => {
  if (!seconds) return "—";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

const icons: Record<string, IconType> = {
  music: IoMusicalNotesOutline,
  search: IoSearchOutline,
  queue: IoListOutline,
  devices: IoDesktopOutline,
  refresh: IoRefreshOutline,
  plus: IoAddOutline,
  trash: IoTrashOutline,
  settings: IoSettingsOutline,
  play: IoPlay,
  pause: IoPause,
  previous: IoPlaySkipBack,
  next: IoPlaySkipForward,
  volumeDown: IoVolumeLowOutline,
  volumeUp: IoVolumeHighOutline,
  mute: IoVolumeMuteOutline,
  unmute: IoVolumeMediumOutline,
};

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const Component = icons[name] ?? IoMusicalNotesOutline;
  return <Component size={size} aria-hidden="true" focusable="false" />;
}

export default function App() {
  const [roomId, setRoomId] = useState(localStorage.getItem("music-party-joined-room") ?? "");
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [createOpen, setCreateOpen] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [createHandle, setCreateHandle] = useState(localStorage.getItem("music-party-handle") ?? "");
  const [generatedCode, setGeneratedCode] = useState("");
  const [generatingCode, setGeneratingCode] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [createdRoom, setCreatedRoom] = useState<{ id: string; name: string } | null>(null);
  const [settingsBusy, setSettingsBusy] = useState("");
  const [hasVoted, setHasVoted] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [switchingRoom, setSwitchingRoom] = useState(false);
  const [unregisterOpen, setUnregisterOpen] = useState(false);
  const [unregistering, setUnregistering] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [handle, setHandle] = useState(localStorage.getItem("music-party-handle") ?? "");
  const [joinHandle, setJoinHandle] = useState(localStorage.getItem("music-party-handle") ?? "");
  const [joinedRoomId, setJoinedRoomId] = useState(localStorage.getItem("music-party-joined-room") ?? "");
  const isJoined = Boolean(roomId && joinedRoomId === roomId && handle.trim());

  const loadRoom = useCallback(async () => {
    if (!roomId || joinedRoomId !== roomId || !handle.trim()) { setRoom(null); setLoading(false); return; }
    try {
      const details = await request<Room>(`/api/rooms/${encodeURIComponent(roomId)}`);
      setRoom(details);
      setError("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load room";
      setError(message);
      if (message.toLowerCase().includes("room not found")) {
        localStorage.removeItem("music-party-joined-room");
        setJoinedRoomId(""); setRoomId(""); setRoom(null);
      }
    } finally { setLoading(false); }
  }, [roomId, joinedRoomId, handle]);

  useEffect(() => {
    localStorage.setItem("music-party-room", roomId);
    setHasVoted(false);
    setLoading(true);
    void loadRoom();
  }, [roomId, loadRoom]);

  useEffect(() => {
    const timer = window.setInterval(() => { void loadRoom(); }, 3000);
    return () => window.clearInterval(timer);
  }, [loadRoom]);

  const firstTrack = room?.queue[0];
  const isPlaying = room?.playbackState === "playing";
  const artwork = firstTrack?.artwork ?? (firstTrack?.url ? `https://img.youtube.com/vi/${firstTrack.url}/hqdefault.jpg` : "");
  const queueTracks = useMemo(() => room?.queue ?? [], [room]);

  const voterId = () => {
    let id = localStorage.getItem("music-party-voter-id");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("music-party-voter-id", id); }
    return id;
  };

  const updateSetting = async (key: string, value: boolean | number) => {
    if (!room) return;
    setSettingsBusy(key);
    try {
      await request(`/api/rooms/${encodeURIComponent(room.id)}/settings`, { method: "PATCH", body: JSON.stringify({ [key]: value }) });
      notify("Room setting updated");
      void loadRoom();
    } catch (err) { notify(err instanceof Error ? err.message : "Could not update setting"); }
    finally { setSettingsBusy(""); }
  };

  const voteNext = async () => {
    if (!room) return;
    try {
      const result = await request<{ passed: boolean; votes: number; minimumVotes: number }>(`/api/rooms/${encodeURIComponent(room.id)}/vote-next`, { method: "POST", body: JSON.stringify({ userId: voterId() }) });
      setHasVoted(!result.passed);
      notify(result.passed ? "Skip vote passed — moving to the next song" : `Skip vote: ${result.votes}/${result.minimumVotes}`);
      void loadRoom();
    } catch (err) { notify(err instanceof Error ? err.message : "Could not vote"); }
  };

  const exitRoom = () => {
    const name = room?.name ?? "room";
    localStorage.removeItem("music-party-joined-room");
    localStorage.removeItem("music-party-room");
    setJoinedRoomId("");
    setRoomId("");
    setRoom(null);
    setJoinCode("");
    setJoinHandle(handle);
    setActiveTab("overview");
    setHasVoted(false);
    setJoinOpen(false);
    setSwitchingRoom(false);
    notify(`Left ${name}`);
  };

  const deleteRoom = async () => {
    if (!room) return;
    setUnregistering(true);
    try {
      await request(`/api/rooms/${encodeURIComponent(room.id)}`, { method: "DELETE" });
      localStorage.removeItem("music-party-joined-room");
      localStorage.removeItem("music-party-room");
      setJoinedRoomId(""); setRoomId(""); setRoom(null); setHasVoted(false); setUnregisterOpen(false); notify("Room unregistered");
    } catch (err) { notify(err instanceof Error ? err.message : "Could not unregister room"); }
    finally { setUnregistering(false); }
  };

  const notify = (message: string) => {
    const showToast = /could not|failed|error|unavailable|not found/i.test(message) ? Toast.toast.danger : Toast.toast.success;
    showToast(message, { timeout: 2600 });
  };

  const control = async (action: string) => {
    if (!room) return;
    setBusy(action);
    try {
      await request(`/api/rooms/${encodeURIComponent(room.id)}/control`, { method: "POST", body: JSON.stringify({ action }) });
      if (action === "play" || action === "pause") window.setTimeout(() => void loadRoom(), 350);
      notify(action === "play" ? "Play command sent" : `${action.replace(/[A-Z]/g, (m) => ` ${m.toLowerCase()}`)} command sent`);
    } catch (err) { notify(err instanceof Error ? err.message : "Could not send command"); }
    finally { setBusy(""); }
  };

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setSubmittedQuery(query.trim());
    setSearching(true); setResults([]);
    try { setResults(await request<Track[]>("/api/search", { method: "POST", body: JSON.stringify({ query }) })); }
    catch (err) { notify(err instanceof Error ? err.message : "Search failed"); }
    finally { setSearching(false); }
  };

  const addTrack = async (track: Track) => {
    if (!room || !track.videoId) return;
    setBusy(track.videoId);
    try {
      await request(`/api/rooms/${encodeURIComponent(room.id)}/queue`, { method: "POST", body: JSON.stringify({ videoId: track.videoId, handle }) });
      notify("Added to the queue"); setResults((items) => items.filter((item) => item.videoId !== track.videoId)); void loadRoom();
    } catch (err) { notify(err instanceof Error ? err.message : "Could not add track"); }
    finally { setBusy(""); }
  };

  const removeTrack = async (track: Track) => {
    if (!room || !track.url) return;
    try {
      await request(`/api/rooms/${encodeURIComponent(room.id)}/queue/${encodeURIComponent(track.url)}`, { method: "DELETE" });
      notify("Removed from queue"); void loadRoom();
    } catch (err) { notify(err instanceof Error ? err.message : "Could not remove track"); }
  };

  const generateRoomCode = async () => {
    setGeneratingCode(true);
    try {
      const generated = await request<{ id: string }>("/api/rooms/generate", {
        method: "POST",
      });
      setGeneratedCode(generated.id);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not generate a room code");
    } finally {
      setGeneratingCode(false);
    }
  };

  const joinRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const joined = await request<{ id: string; name: string; handle: string }>(`/api/rooms/${encodeURIComponent(joinCode.trim())}/join`, { method: "POST", body: JSON.stringify({ handle: joinHandle.trim() }) });
      localStorage.setItem("music-party-handle", joined.handle);
      localStorage.setItem("music-party-joined-room", joined.id);
      localStorage.setItem("music-party-room", joined.id);
      setLoading(true); setRoom(null); setError("");
      setHandle(joined.handle); setJoinHandle(joined.handle); setJoinedRoomId(joined.id); setRoomId(joined.id); setJoinOpen(false); notify(`Joined ${joined.name} as ${joined.handle}`);
    } catch (err) { notify(err instanceof Error ? err.message : "Could not join room"); }
  };

  const createRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!roomName.trim() || !generatedCode || !createHandle.trim()) return;
    setCreatingRoom(true);
    try {
      const created = await request<{ id: string; name: string }>("/api/rooms", {
        method: "POST",
        body: JSON.stringify({ id: generatedCode, name: roomName.trim() }),
      });
      const joined = await request<{ id: string; name: string; handle: string }>(
        `/api/rooms/${encodeURIComponent(created.id)}/join`,
        { method: "POST", body: JSON.stringify({ handle: createHandle.trim() }) },
      );
      localStorage.setItem("music-party-handle", joined.handle);
      localStorage.setItem("music-party-joined-room", joined.id);
      localStorage.setItem("music-party-room", joined.id);
      setCreatedRoom(created);
      setLoading(true);
      setRoom(null);
      setError("");
      setHandle(joined.handle);
      setJoinHandle(joined.handle);
      setJoinedRoomId(joined.id);
      setRoomId(joined.id);
      setRoomName("");
      setGeneratedCode("");
      notify(`Created ${joined.name} and joined as ${joined.handle}`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not create room");
    } finally {
      setCreatingRoom(false);
    }
  };



  return (
    <div className="app-shell min-h-dvh bg-background text-foreground dark">
      <Toast.Provider placement="bottom" />
      {isJoined && <aside className="sidebar fixed inset-y-0 left-0 z-10 flex w-72 flex-col border-r border-default bg-background px-4 py-6 max-md:w-16 max-md:items-center max-md:px-2">
        <a className="brand mb-8 flex items-center gap-2 px-2 text-lg font-semibold text-foreground no-underline max-md:px-0" href="#top" aria-label="Music Party home"><span className="text-blue-400"><Icon name="music" size={20} /></span><span className="max-md:hidden">Music Party</span></a>
        <Button className="workspace mb-6 flex min-w-0 items-center justify-start gap-3 rounded-3xl px-2 py-2 text-left max-md:mb-4 max-md:size-10 max-md:justify-center max-md:px-0" variant="ghost" aria-label={`Room actions for ${room?.name || "this room"}`} onPress={() => { setJoinCode(roomId); setJoinHandle(handle); setSwitchingRoom(false); setJoinOpen(true); }}><span className="workspace-dot grid size-8 shrink-0 place-items-center rounded-3xl bg-indigo-500/20 font-medium text-indigo-300">{room?.name?.trim().charAt(0).toUpperCase() || <Icon name="music" size={16} />}</span><span className="min-w-0 max-md:hidden"><b className="block truncate text-sm">{room?.name || "No room joined"}</b><small className="block truncate text-xs text-foreground/60">{room?.id || "Join or create a room"}</small></span></Button>
        <nav className="nav-list grid w-full gap-1" aria-label="Room navigation">
          {([["overview", "music", "Overview"], ["discover", "search", "Discover"], ["queue", "queue", "Queue"], ["devices", "devices", "Devices"], ["settings", "settings", "Settings"]] as const).map(([key, icon, label]) => (
        <Button key={key} className={`nav-item w-full justify-start gap-3 text-left transition-colors max-md:justify-center max-md:px-0 ${activeTab === key ? "bg-blue-600 text-white hover:bg-blue-500" : "hover:bg-blue-500/10"}`} variant={activeTab === key ? "primary" : "ghost"} onPress={() => setActiveTab(key)} aria-label={label} aria-pressed={activeTab === key}><Icon name={icon} size={17} /><span className="max-md:hidden">{label}</span></Button>
          ))}
        </nav>
        <div className="sidebar-spacer flex-1" />
        <div className="profile mt-auto flex items-center gap-3 border-t border-default pt-4"><div className="avatar grid size-9 shrink-0 place-items-center rounded-3xl bg-cyan-500/20 text-xs font-semibold text-cyan-300">{handle.trim().slice(0, 2).toUpperCase() || "?"}</div><div className="min-w-0 max-md:hidden"><b className="block truncate text-sm">{handle.trim() || "Not joined"}</b><small className="block truncate text-xs text-foreground/60">{isJoined ? "Room participant" : "No active room"}</small></div></div>
      </aside>}

      <main id="top" className={isJoined ? "main-content ml-72 min-h-screen px-8 pb-28 max-md:ml-16 max-md:px-5 max-sm:px-3" : "min-h-screen w-full px-6"}>
        {isJoined && <header className="topbar flex h-24 items-center justify-start border-b border-default"><Form className="flex w-full max-w-4xl items-center gap-2" onSubmit={(event) => { setActiveTab("discover"); void search(event); }}><Input aria-label="Search music" placeholder="Search music" value={query} onChange={(event) => setQuery(event.target.value)} /><Button className="bg-blue-600 text-white transition-colors hover:bg-blue-500" isIconOnly aria-label="Search" type="submit" isPending={searching}><Icon name="search" size={17} /></Button></Form></header>}
        {error && <div className="error-banner mt-4 rounded-3xl bg-danger/10 p-3 text-sm text-danger">{error}</div>}
        {!isJoined ? <section className="empty-workspace mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-4 text-center"><h1 className="text-3xl font-semibold">Join a room</h1><p className="max-w-md text-center text-foreground/60">Enter the room ID and the handle other listeners will see beside your songs.</p><Form className="join-gate-form grid w-full max-w-sm gap-3 text-left" onSubmit={(event) => void joinRoom(event)}><Label htmlFor="gate-room-code">ROOM ID</Label><Input id="gate-room-code" aria-label="Room ID" placeholder="Enter the room ID" value={joinCode} onChange={(event) => setJoinCode(event.target.value)} required /><Label htmlFor="gate-handle">YOUR HANDLE</Label><Input id="gate-handle" aria-label="Your handle" maxLength={32} placeholder="e.g. alex" value={joinHandle} onChange={(event) => setJoinHandle(event.target.value)} required /><Button type="submit" isDisabled={!joinCode.trim() || !joinHandle.trim()}>Join room</Button></Form><Button variant="secondary" onPress={() => { setCreatedRoom(null); setGeneratedCode(""); setRoomName(""); setCreateHandle(handle); setCreateOpen(true); }}>Create a new room</Button></section> : !room ? <section className="empty-workspace flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center gap-4 text-center"><h1>{loading ? "Opening your room…" : "Room unavailable"}</h1><p>{loading ? "Loading room controls." : error || "Check the room ID, then join again."}</p>{!loading && <Button variant="secondary" onPress={() => { localStorage.removeItem("music-party-joined-room"); setJoinedRoomId(""); setRoomId(""); setJoinCode(""); setError(""); }}>Enter another room</Button>}</section> : (
          <>

            <Tabs className="dashboard-tabs mx-auto block w-full max-w-[90rem]" variant="secondary" selectedKey={activeTab} onSelectionChange={(key) => setActiveTab(String(key))}>
              <Tabs.ListContainer className="hidden">
                <Tabs.List aria-label="Room dashboard sections">
                  <Tabs.Tab id="overview">Overview<Tabs.Indicator /></Tabs.Tab>
                  <Tabs.Tab id="discover">Discover<Tabs.Indicator /></Tabs.Tab>
                  <Tabs.Tab id="queue">Queue<Tabs.Indicator /></Tabs.Tab>
                  <Tabs.Tab id="devices">Devices<Tabs.Indicator /></Tabs.Tab>
                  <Tabs.Tab id="settings">Settings<Tabs.Indicator /></Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>
              <Tabs.Panel id="overview" className="dashboard-tab-panel min-w-0 pt-6">
                <section className="dashboard-overview mx-auto grid w-full max-w-[90rem] gap-6" aria-labelledby="overview-title">
                  <h1 id="overview-title" className="sr-only">{room?.name ?? "Room"}</h1>
                  <div className="grid grid-cols-[minmax(0,1.8fr)_minmax(17rem,0.72fr)] items-start gap-6 max-lg:grid-cols-1">
                    <div className="grid min-w-0 gap-6">
                      <Card className="grid min-h-[19rem] grid-cols-[minmax(12rem,0.78fr)_minmax(0,1.22fr)] items-stretch gap-6 overflow-hidden rounded-3xl border border-blue-400/30 bg-gradient-to-br from-blue-950/80 via-indigo-950/60 to-cyan-950/40 p-5 shadow-lg shadow-blue-950/20 max-sm:grid-cols-1">
                        <div className="group/cover relative min-h-56 overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-cyan-400">
                          <div className="absolute inset-0 grid place-items-center text-white"><Icon name="music" size={32} /></div>
                          {artwork && <img src={artwork} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover/cover:scale-105" />}
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-blue-950/45 via-transparent to-cyan-300/20" />
                        </div>
                        <div className="flex min-w-0 flex-col justify-center py-2">
                          <p className="mb-3 text-sm font-medium text-blue-300">{firstTrack ? "Up next" : "Queue empty"}</p>
                          <h2 className="text-3xl font-semibold tracking-tight">{firstTrack?.title.split(" - ")[0] ?? "Nothing queued"}</h2>
                          <p className="mt-2 text-sm text-cyan-100/80">{firstTrack?.title.includes(" - ") ? firstTrack.title.split(" - ").slice(1).join(" - ") : firstTrack ? "Queued for your room" : "Search music and add a track."}</p>
                          {firstTrack && <p className="mt-5 text-sm text-foreground/60">Added by <span className="text-foreground">{firstTrack.addedBy ?? "Web player"}</span></p>}
                        </div>
                      </Card>

                      <section aria-labelledby="overview-queue-title" className="min-w-0">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <h2 id="overview-queue-title" className="text-lg font-semibold">Up next <span className="ml-1 text-sm font-normal text-foreground/60">{queueTracks.length}</span></h2>
                          <Button variant="ghost" size="sm" onPress={() => setActiveTab("queue")}>View queue</Button>
                        </div>
                        {queueTracks.length ? <div className="divide-y divide-default">
                          {queueTracks.slice(0, 5).map((track, index) => <div className="group flex min-h-[4.25rem] items-center gap-3 py-2 transition-colors hover:bg-blue-500/10 focus-within:bg-blue-500/10" key={track.id ?? `${track.url}-${index}`}>
                            <span className="w-6 shrink-0 text-center text-xs font-semibold tabular-nums text-blue-300">{String(index + 1).padStart(2, "0")}</span>
                            <div className="size-11 shrink-0 overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-cyan-400">{track.url && <img className="size-full object-cover" src={`https://img.youtube.com/vi/${track.url}/default.jpg`} alt="" />}</div>
                            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{track.title.split(" - ")[0]}</p><p className="truncate text-sm text-foreground/60">{track.title.includes(" - ") ? track.title.split(" - ").slice(1).join(" - ").replace(/\s\[.*\]$/, "") : "YouTube Music"}</p></div>
                            <span className="hidden max-w-28 truncate text-sm text-foreground/60 sm:block">{track.addedBy ?? "Web player"}</span>
                            <Button isIconOnly aria-label={`Remove ${track.title}`} variant="ghost" onPress={() => void removeTrack(track)}><Icon name="trash" size={16} /></Button>
                          </div>)}
                        </div> : <div className="flex min-h-40 flex-col items-center justify-center gap-2 border-y border-default py-6 text-center"><b>Queue is empty</b><p className="text-sm text-foreground/60">Search for a track and add it to this room.</p><Button variant="secondary" size="sm" onPress={() => setActiveTab("discover")}><Icon name="search" size={15} /> Find music</Button></div>}
                      </section>
                    </div>

                    <aside className="grid content-start gap-6" aria-label="Room status">
                      <section className="grid gap-4 border-b border-cyan-400/30 pb-5">
                        <div className="flex items-center justify-between gap-4">
                          <div><p className="text-sm font-medium text-blue-300">Player</p><p className="mt-1 flex items-center gap-2 text-lg font-semibold"><span className={`size-2 rounded-3xl ${room?.connectedClients ? "bg-success" : "bg-default-400"}`} aria-hidden="true" />{room?.connectedClients ? "Connected" : "Offline"}</p></div>
                          <Button isIconOnly aria-label="Refresh room status" variant="ghost" onPress={() => void loadRoom()}><Icon name="refresh" size={17} /></Button>
                        </div>
                        <div className="flex items-center justify-between text-sm"><span className="text-foreground/60">Connected devices</span><b>{room?.devices.length ?? 0}</b></div>
                        <Button className="w-fit" variant="ghost" size="sm" onPress={() => setActiveTab("devices")}>View devices</Button>
                      </section>
                      {room?.feature?.nextCommand && <section className="grid gap-3 border-l-2 border-indigo-500 pl-4"><div><p className="text-sm font-medium text-indigo-300">Skip vote</p><p className="mt-1 text-lg font-semibold">{room.votes} <span className="font-normal text-foreground/60">/ {room.feature.minimumVotes} votes</span></p></div><Button className="w-fit bg-indigo-600 text-white hover:bg-indigo-500" variant="secondary" isDisabled={!room.connectedClients || hasVoted} onPress={() => void voteNext()}>{hasVoted ? "Vote submitted" : "Vote to skip"}</Button></section>}
                    </aside>
                  </div>
                </section>
              </Tabs.Panel>
              <Tabs.Panel id="discover" className="dashboard-tab-panel min-w-0 pt-4"><Card role="region" aria-label="Search results" className="panel min-w-0 rounded-3xl p-5"><div className="panel-heading mb-4"><h3>{submittedQuery ? `Results for “${submittedQuery}”` : "Search results"}</h3></div>{searching ? <p className="py-8 text-center text-foreground/60">Searching music…</p> : results.length > 0 ? <div className="results-list divide-y divide-default">{results.map((track) => <div className="result-row flex min-h-16 items-center gap-3 py-2" key={track.videoId}><img src={track.artwork ?? ""} alt="" /><div className="track-info grid min-w-0 flex-1 gap-1"><b>{track.title}</b><span>{track.artist} · {formatDuration(track.duration)}</span></div><Button variant="outline" size="sm" isDisabled={joinedRoomId !== room?.id || !handle.trim()} isPending={busy === track.videoId} onPress={() => void addTrack(track)}><Icon name="plus" size={15} /> Add</Button></div>)}</div> : <p className="py-8 text-center text-foreground/60">{submittedQuery ? "No tracks found. Try another search." : "Search above to find music for this room."}</p>}</Card></Tabs.Panel>
              <Tabs.Panel id="queue" className="dashboard-tab-panel min-w-0 pt-4"><Card role="region" aria-label="Queue" className="panel flex min-h-80 flex-col rounded-3xl p-5"><div className="panel-heading mb-4 flex items-center justify-between gap-3"><div><h3>Up next <span className="count-pill">{queueTracks.length}</span></h3></div><Button isIconOnly aria-label="Refresh queue" variant="ghost" onPress={() => void loadRoom()}><Icon name="refresh" /></Button></div>{queueTracks.length ? <div className="queue-list flex-1 divide-y divide-default">{queueTracks.map((track, index) => <div className="queue-row flex min-h-16 items-center gap-3 py-2" key={track.id ?? `${track.url}-${index}`}><span className="queue-index">{String(index + 1).padStart(2, "0")}</span><div className="queue-cover size-10 shrink-0 overflow-hidden rounded-3xl">{track.url && <img src={`https://img.youtube.com/vi/${track.url}/default.jpg`} alt="" />}</div><div className="track-info grid min-w-0 flex-1 gap-1"><b>{track.title.split(" - ")[0]}</b><span>{track.title.includes(" - ") ? track.title.split(" - ").slice(1).join(" - ").replace(/\s\[.*\]$/, "") : "YouTube Music"}</span></div><span className="queue-added">{track.addedBy ?? "Web player"}</span><Button isIconOnly aria-label={`Remove ${track.title}`} variant="ghost" className="remove-button" onPress={() => void removeTrack(track)}><Icon name="trash" size={16} /></Button></div>)}</div> : <div className="queue-empty flex min-h-56 flex-1 flex-col items-center justify-center gap-3 text-center"><b>Queue is empty</b><p>Search for a track and add it.</p><Button variant="secondary" size="sm" onPress={() => setActiveTab("discover")}><Icon name="search" size={15} /> Find a song</Button></div>}<div className="queue-footer mt-auto flex justify-between border-t border-default pt-3 text-sm"><span>Queue limit</span><b>{queueTracks.length} <i>/</i> {room?.queueLimit ?? 25}</b></div></Card></Tabs.Panel>
              <Tabs.Panel id="devices" className="dashboard-tab-panel min-w-0 pt-4"><Card role="region" aria-label="Connected players" className="panel min-w-0 rounded-3xl p-5"><div className="mb-5 flex items-center justify-between gap-4"><h3 className="text-lg font-semibold">Connected players</h3><span className="inline-flex shrink-0 items-center gap-2 rounded-3xl border border-default bg-default/40 px-3 py-1.5 text-sm"><span className={`size-2 rounded-3xl ${room?.connectedClients ? "bg-emerald-400" : "bg-default-400"}`} aria-hidden="true" />{room?.connectedClients ? "Online" : "Offline"}</span></div>{room?.devices.length ? <div className="grid divide-y divide-default">{room.devices.map((device, index) => <div className="flex items-center gap-3 py-4" key={`${device.fingerprint}-${index}`}><span className="grid size-10 shrink-0 place-items-center rounded-3xl bg-blue-500/10 text-blue-300"><Icon name="devices" /></span><span className="grid min-w-0 flex-1 gap-1"><b className="truncate text-sm font-medium">{device.name}</b><span className="text-sm text-foreground/60">Joined {new Date(device.createdAt).toLocaleDateString()}</span></span><span className="size-2 shrink-0 rounded-3xl bg-emerald-400" aria-label="Online" /></div>)}</div> : <div className="flex min-h-64 flex-col items-center justify-center gap-4 border-t border-default px-4 py-10 text-center"><span className="grid size-14 place-items-center rounded-3xl bg-blue-500/10 text-blue-300"><Icon name="devices" size={24} /></span><div className="grid max-w-sm gap-2"><b className="text-base font-semibold">No players connected yet</b><p className="text-sm leading-6 text-foreground/60">Open YouTube Music and join this room with the extension.</p></div></div>}</Card></Tabs.Panel>
              <Tabs.Panel id="settings" className="dashboard-tab-panel min-w-0 pt-4"><Card role="region" aria-label="Room settings" className="panel min-w-0 rounded-3xl p-5"><div className="panel-heading mb-4 flex items-center justify-between gap-3"><div><h3>Settings &amp; info</h3></div><span className="text-sm text-foreground/60">{room?.chatId ? "Telegram linked" : "Web room"}</span></div>
                  <dl className="room-info-grid mt-4 grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-3 rounded-3xl bg-default/40 p-4 text-sm max-sm:grid-cols-1 max-sm:gap-x-0 max-sm:gap-y-1"><dt className="text-foreground/60">Room ID</dt><dd className="m-0 min-w-0 break-all font-mono">{room?.id}</dd><dt className="text-foreground/60">Created</dt><dd className="m-0 min-w-0 break-words">{room?.createdAt ? new Date(room.createdAt).toLocaleString() : "—"}</dd><dt className="text-foreground/60">Chat ID</dt><dd className="m-0 min-w-0 break-all">{room?.chatId || "Not linked to Telegram"}</dd></dl>
                  <div className="setting-group mt-6"><div className="setting-row flex items-center justify-between gap-3 border-b border-default py-4 max-sm:flex-col max-sm:items-start"><span className="grid gap-1"><b>Minimum skip votes</b><small className="text-sm text-foreground/60">Votes needed to skip the current song</small></span><div className="stepper flex items-center gap-2"><Button className="min-h-11 min-w-11" aria-label="Decrease minimum skip votes" variant="secondary" isDisabled={!room || (room.feature?.minimumVotes ?? 1) <= 1 || !!settingsBusy} onPress={() => void updateSetting("minimumVotes", (room?.feature?.minimumVotes ?? 5) - 1)}>−</Button><b aria-live="polite">{room?.feature?.minimumVotes ?? 5}</b><Button className="min-h-11 min-w-11" aria-label="Increase minimum skip votes" variant="secondary" isDisabled={!!settingsBusy} onPress={() => void updateSetting("minimumVotes", (room?.feature?.minimumVotes ?? 5) + 1)}>+</Button></div></div>
                  <div className="setting-row flex items-center justify-between gap-3 border-b border-default py-4 max-sm:flex-col max-sm:items-start"><span className="grid gap-1"><b>Maximum queue size</b><small className="text-sm text-foreground/60">Tracks allowed in this room</small></span><div className="stepper flex items-center gap-2"><Button className="min-h-11 min-w-11" aria-label="Decrease maximum queue size" variant="secondary" isDisabled={!room || (room.feature?.maxQueueSize ?? 1) <= 1 || !!settingsBusy} onPress={() => void updateSetting("maxQueueSize", (room?.feature?.maxQueueSize ?? 25) - 5)}>−</Button><b aria-live="polite">{room?.feature?.maxQueueSize ?? 25}</b><Button className="min-h-11 min-w-11" aria-label="Increase maximum queue size" variant="secondary" isDisabled={!!settingsBusy} onPress={() => void updateSetting("maxQueueSize", (room?.feature?.maxQueueSize ?? 25) + 5)}>+</Button></div></div></div>
                  <div className="setting-toggles mt-4 grid gap-2">{[["nextCommand","/next and skip voting"],["nextOnlyAdmin","Next command admin-only"],["previousCommand","/prev"],["previousOnlyAdmin","Previous command admin-only"],["volumeCommand","Volume controls"],["muteCommand","/mute"],["unmuteCommand","/unmute"]].map(([key,label]) => <Checkbox key={key} className="setting-toggle" variant="secondary" isSelected={Boolean(room?.feature?.[key as keyof NonNullable<Room["feature"]>])} isDisabled={!!settingsBusy} onChange={(selected) => void updateSetting(key, selected)}><Checkbox.Content><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control><span>{label}</span></Checkbox.Content></Checkbox>)}</div>
                  <div className="telegram-help mt-6 border-t border-default pt-4"><b>Telegram commands</b><p className="mt-2 text-sm text-foreground/70">Link this room from a Telegram group with <code>/register</code>. In a linked group, <code>/menu</code>, <code>/help</code>, <code>/queue</code>, <code>/devices</code>, <code>/info</code>, and <code>/config</code> remain available.</p></div>
                  <div className="mt-6 border-t border-default pt-4"><Button variant="secondary" onPress={() => setUnregisterOpen(true)}>Unregister room</Button></div>
                </Card></Tabs.Panel>
            </Tabs>
          </>
        )}
      </main>
      {isJoined && room && <div className="player-bar fixed inset-x-0 bottom-0 z-20 grid h-20 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-t border-blue-400/30 bg-background/95 px-6 supports-[backdrop-filter]:backdrop-blur-xl max-sm:h-[4.5rem] max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:px-2" role="region" aria-label="Room player controls">
        <div className="player-track flex min-w-0 items-center gap-3"><div className="player-cover size-11 shrink-0 overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-cyan-400">{artwork && <img src={artwork} alt="" className="size-full object-cover" />}</div><div className="player-track-copy grid min-w-0 gap-1 text-sm"><b>{firstTrack?.title ?? "Nothing queued"}</b><span className="text-blue-300">{firstTrack ? "Up next" : room.name}</span></div></div>
        <div className="player-controls flex items-center gap-1">
          <Button isIconOnly aria-label="Previous track" variant="ghost" isDisabled={!room.feature?.previousCommand || !room.connectedClients} onPress={() => void control("previous")}><Icon name="previous" size={17} /></Button>
          <Button isIconOnly aria-label={isPlaying ? "Pause" : "Play"} className="player-play size-14 min-h-14 min-w-14 rounded-full bg-blue-600 text-white hover:bg-blue-500" isPending={busy === "play" || busy === "pause"} isDisabled={!room.connectedClients} onPress={() => void control(isPlaying ? "pause" : "play")}><Icon name={isPlaying ? "pause" : "play"} size={28} /></Button>
          <Button isIconOnly aria-label="Next track" variant="ghost" isDisabled={!room.feature?.nextCommand || !room.connectedClients} onPress={() => void control("next")}><Icon name="next" size={17} /></Button>
        </div>
        <div className="player-tools flex items-center justify-self-end gap-1 max-sm:hidden">
          <Button isIconOnly aria-label="Turn volume down" variant="ghost" isDisabled={!room.feature?.volumeCommand || !room.connectedClients} onPress={() => void control("volumeDown")}><Icon name="volumeDown" size={17} /></Button>
          <Button isIconOnly aria-label="Turn volume up" variant="ghost" isDisabled={!room.feature?.volumeCommand || !room.connectedClients} onPress={() => void control("volumeUp")}><Icon name="volumeUp" size={17} /></Button>
          <Button isIconOnly aria-label="Mute player" variant="ghost" isDisabled={!room.feature?.muteCommand || !room.connectedClients} onPress={() => void control("mute")}><Icon name="mute" size={17} /></Button>
          <Button isIconOnly aria-label="Unmute player" variant="ghost" isDisabled={!room.feature?.unmuteCommand || !room.connectedClients} onPress={() => void control("unmute")}><Icon name="unmute" size={17} /></Button>
          <Button isIconOnly aria-label="Show lyrics" variant="ghost" isDisabled={!room.connectedClients} onPress={() => void control("lyrics")}><Icon name="music" size={17} /></Button>
        </div>
      </div>}
      <Modal>
        <Modal.Backdrop className="modal-backdrop dark" variant="blur" isOpen={createOpen} onOpenChange={(open) => { if (open || (!creatingRoom && !generatingCode)) setCreateOpen(open); }}>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog className="room-modal flex max-h-[85vh] w-full max-w-md flex-col items-start gap-3 overflow-y-auto rounded-3xl bg-background p-6 text-foreground" aria-labelledby="room-modal-title">
            <Modal.CloseTrigger className="modal-close" />
            {createdRoom ? (
              <>
                <div className="empty-icon"><Icon name="music" size={25} /></div>
                <p className="mb-2 text-xs font-semibold text-foreground/60">ROOM CREATED &amp; JOINED</p>
                <h2 id="room-modal-title">{createdRoom.name} is ready</h2>
                <p className="modal-copy">You joined as <b>{handle}</b>. Connect a YouTube Music player using this room code.</p>
                <div className="room-code"><code>{createdRoom.id}</code><Button variant="secondary" size="sm" onPress={() => { void navigator.clipboard.writeText(createdRoom.id); notify("Room code copied"); }}>Copy code</Button></div>
                <Button className="create-room-button modal-done" onPress={() => { setCreateOpen(false); setCreatedRoom(null); }}>Open room controls</Button>
              </>
            ) : !generatedCode ? (
              <>
                <div className="empty-icon"><Icon name="music" size={25} /></div>
                
                <h2 id="room-modal-title">Generate a room code</h2>
                <p className="modal-copy my-3 max-w-sm text-sm text-foreground/70">Generate an available room ID, then choose the room name and the handle listeners will see.</p>
                <Button className="create-room-button generate-code-button" isPending={generatingCode} onPress={() => void generateRoomCode()}>Generate code</Button>
              </>
            ) : (
              <>
                <div className="empty-icon"><Icon name="music" size={25} /></div>
                
                <h2 id="room-modal-title">Name your room</h2>
                <p className="modal-copy">You’ll need this code to connect a player.</p>
                <div className="room-code generated-code flex w-full min-w-0 items-center justify-between gap-3 rounded-3xl border border-default p-3"><code className="min-w-0 flex-1 truncate font-mono text-sm">{generatedCode}</code><Button className="shrink-0" variant="secondary" size="sm" onPress={() => { void navigator.clipboard.writeText(generatedCode); notify("Room code copied"); }}>Copy code</Button></div>
                <Form className="create-form grid w-full min-w-0 gap-3" onSubmit={(event) => void createRoom(event)}>
                  <Label className="text-sm font-medium" htmlFor="room-name">ROOM NAME</Label>
                  <Input className="w-full min-w-0" id="room-name" aria-label="Room name" maxLength={50} placeholder="e.g. Friday night" value={roomName} onChange={(event) => setRoomName(event.target.value)} autoFocus />
                  <Label className="text-sm font-medium" htmlFor="create-handle">YOUR HANDLE</Label>
                  <Input className="w-full min-w-0" id="create-handle" aria-label="Your handle" maxLength={32} placeholder="e.g. alex" value={createHandle} onChange={(event) => setCreateHandle(event.target.value)} required />
                  <Button className="create-room-button w-full" type="submit" isPending={creatingRoom} isDisabled={!roomName.trim() || !createHandle.trim()}>Create room &amp; join</Button>
                </Form>
              </>
            )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
      <Modal>
        <Modal.Backdrop className="modal-backdrop dark" variant="blur" isOpen={joinOpen} onOpenChange={(open) => { setJoinOpen(open); if (!open) setSwitchingRoom(false); }}>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog className="room-modal join-modal flex max-h-[85vh] w-full max-w-md flex-col items-start gap-3 overflow-y-auto rounded-3xl bg-background p-6 text-foreground" aria-labelledby="join-modal-title">
            <Modal.CloseTrigger className="modal-close" />
            <div className="empty-icon"><Icon name="devices" size={25} /></div>
            {switchingRoom ? <>
              <h2 id="join-modal-title">Switch room</h2>
              <p className="modal-copy">Enter the room ID and the handle other listeners will see.</p>
              <Form className="create-form grid w-full min-w-0 gap-3" onSubmit={(event) => void joinRoom(event)}>
                <Label className="text-sm font-medium" htmlFor="join-room-code">ROOM ID</Label>
                <Input className="w-full min-w-0" id="join-room-code" aria-label="Room ID" placeholder="e.g. mellow-fox" value={joinCode} onChange={(event) => setJoinCode(event.target.value)} required />
                <Label className="text-sm font-medium" htmlFor="join-handle">YOUR HANDLE</Label>
                <Input className="w-full min-w-0" id="join-handle" aria-label="Your handle" maxLength={32} placeholder="e.g. alex" value={joinHandle} onChange={(event) => setJoinHandle(event.target.value)} required />
                <Button className="w-full" type="submit" isDisabled={!joinCode.trim() || !joinHandle.trim()}>Switch room</Button>
              </Form>
              <Button className="self-start" variant="ghost" onPress={() => setSwitchingRoom(false)}>Back</Button>
            </> : <>
              <h2 id="join-modal-title">Room actions</h2>
              <p className="modal-copy">You’re in <b>{room?.name || "this room"}</b>.</p>
              <div className="grid w-full gap-2 pt-2">
                <Button className="w-full" onPress={() => { setJoinCode(""); setJoinHandle(handle); setSwitchingRoom(true); }}>Switch room</Button>
                <Button className="w-full" variant="secondary" onPress={exitRoom}>Exit room</Button>
              </div>
            </>}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
      <Modal>
        <Modal.Backdrop className="modal-backdrop dark" variant="blur" isOpen={unregisterOpen} onOpenChange={(open) => { if (open || !unregistering) setUnregisterOpen(open); }}>
          <Modal.Container placement="center" size="sm">
            <Modal.Dialog className="room-modal flex max-h-[85vh] w-full max-w-md flex-col items-start gap-3 overflow-y-auto rounded-3xl bg-background p-6 text-foreground" aria-labelledby="unregister-title" aria-describedby="unregister-description">
              <Modal.CloseTrigger className="modal-close" />
              <h2 id="unregister-title">Unregister {room?.name || "room"}?</h2>
              <p id="unregister-description" className="text-sm text-foreground/70">This removes the room and its queue and settings for everyone. You can’t undo this.</p>
              <div className="mt-2 flex w-full justify-end gap-2">
                <Button variant="secondary" isDisabled={unregistering} onPress={() => setUnregisterOpen(false)}>Cancel</Button>
                <Button isPending={unregistering} onPress={() => void deleteRoom()}>Unregister room</Button>
              </div>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
