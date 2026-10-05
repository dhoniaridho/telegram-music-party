function App() {
    return (
        <main className="min-w-[360px] bg-slate-950 p-6 text-slate-100">
            <div className="mx-auto flex max-w-md flex-col gap-5">
                <header>
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-300">
                        Telegram Music Party
                    </p>
                    <h1 className="mt-2 text-2xl font-bold">
                        How to use the extension
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                        Connect a YouTube Music tab to a Telegram group and let
                        the group control playback.
                    </p>
                </header>

                <ol className="flex flex-col gap-4 text-sm leading-6">
                    <li className="flex gap-3">
                        <span className="font-bold text-violet-300">1</span>
                        <span>
                            Add the Telegram bot shown by its <code>/start</code>{" "}
                            message to your group and run <code>/register</code>.
                        </span>
                    </li>
                    <li className="flex gap-3">
                        <span className="font-bold text-violet-300">2</span>
                        <span>
                            Open <strong>YouTube Music</strong>, click{" "}
                            <strong>Join Room</strong> in its sidebar, and enter
                            the room ID from Telegram. The party server URL is
                            prefilled; edit it only if you use a self-hosted
                            server.
                        </span>
                    </li>
                    <li className="flex gap-3">
                        <span className="font-bold text-violet-300">3</span>
                        <span>
                            In the group, search with{" "}
                            mention the bot's current username followed by a
                            song search, then
                            choose <strong>Add to Queue</strong>.
                        </span>
                    </li>
                    <li className="flex gap-3">
                        <span className="font-bold text-violet-300">4</span>
                        <span>
                            Run <code>/play</code> in the group. Keep the joined
                            YouTube Music tab open to play and sync the queue.
                        </span>
                    </li>
                </ol>

                <footer className="border-t border-slate-800 pt-4 text-xs text-slate-400">
                    To leave a room, use <strong>Leave Room</strong> in the
                    YouTube Music sidebar.
                </footer>
            </div>
        </main>
    );
}

export default App;
